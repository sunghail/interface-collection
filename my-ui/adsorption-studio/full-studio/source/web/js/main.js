// Adsorption Studio (built on Reactor Studio) — boot, data requests and top-level rendering.
//
// Three ways to work, switched at the top right:
//   단계별    five guided steps for anyone: data → design conditions → choose the adsorbent → result → save
//   단일 bed  (advanced) the tests of one adsorbent and one column of it, every view at hand
//   공정      (advanced) beds of different adsorbents in series: flowsheet, criteria, scenarios, optimisation
//
// Data flow: a change of settings or of the project marks results stale; with 자동 계산 on, what the screen
// needs is recomputed after a short pause (batch-test analysis, batch design, or the bed/train design).

import { $, $$, h, debounce, toast, hide, paramsKey } from "./util.js";
import { api } from "./api.js";
import {
  state, initState, on, emit, setUi, setSingle, currentKey, isFresh, setParams, setTrain, trainPayload, requestParams,
  parseHash, hashFor, TEST_VIEWS, setGuide,
} from "./store.js";
import { guideMain, stepBar, syncGuide } from "./views/guide.js";
import { renderSidebar, openSettings, closeSettings, syncAll } from "./settings.js";
import { renderKpis } from "./kpis.js";
import { renderSingle, renderProcessBed } from "./views/bed.js";
import { renderProcess } from "./views/process.js";
import { renderCompare } from "./views/compare.js";
import { renderOptimize } from "./views/optimize.js";
import { renderCriteria } from "./views/criteria.js";
import { addAdsorbent, openLibrary } from "./views/input.js";
import { helpTip } from "./views/help.js";
import { batchKey } from "./views/batch.js";
import { currentBed, kindDot, adsPicker } from "./views/common.js";
import { exportMarkdown, exportProfilesCsv, exportParams, importParams, exportProject, importProject, resetProject } from "./exporter.js";
import { trainFromAuto } from "./train.js";

const guide = () => state.ui.mode === "guide";
const testView = () => state.ui.mode === "bed" && TEST_VIEWS.includes(state.ui.bedView);
/** Screens where the user types into the page itself: a typed value must not redraw it (the caret would jump). */
const typingView = () => testView() || (guide() && state.guide.step <= 2);
/** Does the screen show this kind of result? */
const shows = (kind) => {
  if (guide()) {
    const { step, method, sub } = state.guide;
    if (kind === "compare") return step <= 3;             // step 2 shows what the tests reached next to each target
    if (kind === "rank") return step === 3 && method === "column";
    if (kind === "batch") return (step === 4 || step === 5) && method === "batch";
    if (kind === "steady") return (step === 4 || step === 5) && method === "column";
    return sub && false;
  }
  if (state.ui.mode === "bed") {
    const view = state.ui.bedView;
    if (kind === "compare") return ["input", "fit", "screen"].includes(view);
    if (kind === "batch") return view === "batch";
    if (kind === "steady") return view === "z" || view === "t";
    return false;
  }
  return kind === "steady";
};

// ------------------------------------------------------------------------------------ requests
async function requestSteady({ force = false } = {}) {
  const slot = state.results.steady;
  const key = currentKey();
  if (!state.project.adsorbents.length) return;
  if (!force && slot.key === key && slot.error) { slot.error = null; render(); return; }
  if (!force && (slot.key === key || slot.pendingKey === key)) return;
  slot.pendingKey = key;
  slot.error = null;
  renderStatus();
  try {
    const data = await api.steady({ ...requestParams() }, trainPayload(), state.project);
    if (currentKey() !== key) return;                 // conditions changed meanwhile: drop it
    Object.assign(slot, { data, key, notes: data.notes });
  } catch (error) {
    if (currentKey() === key) Object.assign(slot, { error: error.message, key });
  } finally {
    if (slot.pendingKey === key) slot.pendingKey = null;
    if (shows("steady")) render(); else renderStatus();
  }
}

/** Without a service time every adsorbent is rated in the bed size the user gave. */
const rankSize = () => (state.params.service_on ? null : { L: state.single.L, D: state.single.D });
const rankKey = () => paramsKey(requestParams()) + JSON.stringify(rankSize()) + state.projectKey;

async function requestRank() {
  const slot = state.results.rank;
  const key = rankKey();
  if (!state.project.adsorbents.length || slot.key === key || slot.pendingKey === key) return;
  slot.pendingKey = key;
  if (shows("rank")) { slot.data = null; render(); }
  try {
    const data = await api.rankColumns({ ...requestParams() }, state.project, rankSize());
    if (rankKey() !== key) return;
    Object.assign(slot, { data, key, error: null });
  } catch (error) {
    if (rankKey() === key) Object.assign(slot, { data: null, key, error: error.message });
  } finally {
    if (slot.pendingKey === key) slot.pendingKey = null;
    if (shows("rank")) render(); else renderStatus();
  }
}

/** 단계별 · 회분: the comparison sizes every adsorbent for the 교반 시간 of step 2 — the same rule as the design. */
const compareTime = () => (guide() && state.guide.method === "batch" ? state.batchReq.t_end : null);
const compareKey = () => `${state.projectKey}|${compareTime() ?? "eq"}`;

async function requestCompare() {
  const slot = state.results.compare;
  const key = compareKey();
  if (slot.key === key || slot.pendingKey === key) return;
  slot.pendingKey = key;
  renderStatus();
  try {
    const data = await api.compare(state.project, compareTime());
    if (compareKey() !== key) return;
    Object.assign(slot, { data, key, error: null });
  } catch (error) {
    if (compareKey() === key) Object.assign(slot, { data: null, key, error: error.message });
  } finally {
    if (slot.pendingKey === key) slot.pendingKey = null;
    // in step 2 the hints arrive while the user may be typing: redraw only when no field has the caret
    if (shows("compare") && !(guide() && state.guide.step === 2 && document.activeElement?.tagName === "INPUT")) render();
    renderStatus();
  }
}

async function requestBatch() {
  const slot = state.results.batch;
  const key = batchKey();
  if (!state.single.ads || slot.key === key || slot.pendingKey === key) return;
  slot.pendingKey = key;
  renderStatus();
  try {
    const data = await api.batch(state.project, { ...state.batchReq, adsorbent: state.single.ads });
    if (batchKey() !== key) return;
    Object.assign(slot, { data, key, error: null });
  } catch (error) {
    if (batchKey() === key) Object.assign(slot, { data: null, key, error: error.message });
  } finally {
    if (slot.pendingKey === key) slot.pendingKey = null;
    if (shows("batch")) render(); else renderStatus();
  }
}

/** Everything the current screen needs. */
function computeAll() {
  if (guide()) {
    syncGuide();
    if (shows("compare")) requestCompare();
    if (shows("rank")) requestRank();
    if (shows("batch")) requestBatch();
    if (shows("steady")) requestSteady();
    return;
  }
  if (state.ui.mode === "bed") {
    const view = state.ui.bedView;
    if (view === "input" || view === "fit" || view === "screen") { requestCompare(); return; }
    if (view === "batch") { requestBatch(); return; }
  }
  requestSteady();
}

const autoCompute = debounce(() => computeAll(), 450);

function onParamsChanged(detail) {
  // in the guide's typing steps a typed value only restarts the calculation; choices (setGuide) redraw
  if (guide() && state.guide.step === 2 && !detail?.guide) renderStatus(); else render();
  if (state.ui.auto || guide()) autoCompute();
}

/** A project edit: a typed number must not redraw the grid it was typed in (the caret would jump). */
function onProjectChanged({ structural }) {
  if (structural) structureRev += 1;
  if (structural || !typingView()) render(); else renderStatus();
  // the test analysis follows every edit; the (slower) designs follow 자동 계산 (always in the guide)
  if (typingView() || guide()) autoCompute();
  else if (state.ui.auto) autoCompute();
}

// ------------------------------------------------------------------------------------ rendering
let lastView = null;
let lastMode = null;
let sidebarLayout = null;
let structureRev = 0;

function render() {
  const ui = state.ui;
  // 단계별 always recalculates by itself: the manual 계산 button and the 자동 계산 switch are for the advanced modes
  document.body.classList.toggle("guide-mode", guide());
  // 단일 bed and 공정 design different things: switching drops the other mode's design.
  if (lastMode !== null && lastMode !== ui.mode) {
    lastMode = ui.mode;
    state.results.steady = {};
    computeAll();
  }
  lastMode = ui.mode;
  $$(".mode-toggle button").forEach((btn) => {
    const active = btn.dataset.mode === ui.mode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-checked", String(active));
  });
  $("#auto-switch").checked = ui.auto;
  const key = hashFor(ui);
  // moving to another view adds a history entry, so the browser's back button walks the views
  if (location.hash !== key) history[lastView && lastView !== key ? "pushState" : "replaceState"](null, "", key);

  if (guide()) syncGuide();
  renderViewBar();
  const tests = testView() || guide();
  const procBeds = ui.mode === "process" && ui.processView === "beds";
  const comparing = ui.mode === "process" && ui.processView === "compare";
  const optimizing = ui.mode === "process" && ui.processView === "optimize";
  const judging = ui.mode === "process" && ui.processView === "criteria";
  $("#kpis").hidden = tests || comparing || optimizing || judging;
  if (!$("#kpis").hidden) renderKpis($("#kpis"));
  renderBanner(tests || optimizing);

  // the left panel changes with the mode, the view, the custom train and the project's structure
  const layout = `${ui.mode}|${ui.mode === "bed" ? ui.bedView : ""}|${guide() ? `${state.guide.step}.${state.guide.sub}.${state.guide.method}.${state.single.ads}` : ""}|${state.train.enabled}|${state.single.auto}|${state.single.ads}|${state.train.auto.join(",")}|${structureRev}`;
  if (sidebarLayout !== layout) { sidebarLayout = layout; renderSidebar($("#param-panel")); }
  else syncAll();                 // result lines under the groups follow the latest calculation

  const view = $("#view");
  view.classList.toggle("stale", !tests && Boolean(state.results.steady.data) && !isFresh(state.results.steady) && !optimizing);
  const scroll = key === lastView ? window.scrollY : 0;
  const focus = rememberFocus(view);
  if (guide()) view.replaceChildren(guideMain());
  else if (ui.mode === "bed") renderSingle(view);
  else if (procBeds) renderProcessBed(view);
  else if (comparing) renderCompare(view);
  else if (optimizing) renderOptimize(view);
  else if (judging) renderCriteria(view);
  else renderProcess(view);
  window.scrollTo(0, scroll);
  focus();
  lastView = key;
  renderStatus();
}

/** A redraw replaces the view's inputs; put the caret back where it was (by element id). */
function rememberFocus(view) {
  const active = document.activeElement;
  if (!active?.id || !view.contains(active)) return () => {};
  const { id } = active;
  const selection = typeof active.selectionStart === "number" ? [active.selectionStart, active.selectionEnd] : null;
  return () => {
    const again = document.getElementById(id);
    if (!again || again === document.activeElement) return;
    again.focus({ preventScroll: true });
    if (selection) try { again.setSelectionRange(...selection); } catch { /* number inputs have no selection */ }
  };
}

const segmented = (items, current, pick, cls = "") => h(`div.segmented${cls}`, { role: "tablist" }, items.map(([value, content, title]) =>
  h("button", { class: value === current ? "active" : "", role: "tab", "aria-selected": String(value === current),
    title: title || null, onclick: () => pick(value) }, content)));

/** Second row: what to look at inside the current mode, and which adsorbent / bed. */
function renderViewBar() {
  const ui = state.ui;
  const left = [];
  const right = [];
  if (guide()) {
    left.push(stepBar());
    const { step, sub } = state.guide;
    if (step === 1) {
      left.push(h("span.viewbar-sep"));
      left.push(segmented([["input", "1-1 입력", "흡착제 이름과 실험 데이터"], ["fit", "1-2 피팅", "속도식·평형식을 맞춘 결과와 흡착제 비교"]], sub,
        (v) => setGuide({ sub: v })));
      const ads = state.project.adsorbents;
      if (sub === "fit" && ads.length) {
        left.push(adsPicker(ads, state.single.ads, (id) => setSingle({ ads: id })));
      }
      if (sub === "input") {
        right.push(h("button.btn.ghost.small", { onclick: addAdsorbent }, "+ 흡착제 추가"),
          h("button.btn.ghost.small", { onclick: openLibrary }, "📂 프리셋 불러오기"), helpTip("presets"));
      }
    }
    $("#viewbar-left").replaceChildren(...left);
    $("#viewbar-right").replaceChildren(...right);
    return;
  }
  if (ui.mode === "bed") {
    left.push(segmented([["input", "입력", "흡착제 이름과 실험 데이터"], ["fit", "피팅", "속도식·등온식 피팅 결과"], ["screen", "흡착제 비교", "제거 목표 기준 흡착제 순위"],
      ["batch", "회분", "용기에 흡착제를 넣는 방식"], ["z", "위치별 z", "bed 안 농도·흡착량 분포"], ["t", "시간별 t", "출구 파과곡선"]],
    ui.bedView, (v) => setUi({ bedView: v })));
    const ads = state.project.adsorbents;
    if (!["input", "screen"].includes(ui.bedView) && ads.length) {
      left.push(h("span.viewbar-sep"));
      left.push(adsPicker(ads, state.single.ads, (id) => setSingle({ ads: id }), (a) => `시험 ${a.tests.length}개`));
    }
    if (ui.bedView === "input") {
      right.push(h("button.btn.ghost.small", { onclick: addAdsorbent }, "+ 흡착제 추가"),
        h("button.btn.ghost.small", { onclick: openLibrary }, "📂 프리셋 불러오기"), helpTip("presets"));
    }
  } else {
    const n = ui.compare.length;
    left.push(segmented([["summary", "공정 요약"], ["beds", "bed별"], ["criteria", "판정 기준"],
      ["compare", n ? `시나리오 비교 · ${n}` : "시나리오 비교"], ["optimize", "최적화"]],
    ui.processView, (v) => setUi({ processView: v })));
    const profiles = state.results.steady.data?.profiles;
    if (ui.processView === "beds" && profiles) {
      const bed = currentBed(profiles);
      left.push(segmented(profiles.map((p) => [p.id, [kindDot(p.kind), p.short], p.label]), bed.id, (id) => setUi({ bed: id }), ".beds"));
      left.push(segmented([["z", "위치별 z"], ["t", "시간별 t"]], ui.procBedView, (v) => setUi({ procBedView: v })));
    } else {
      left.push(h("span.viewbar-sep"));
      left.push(segmented([["auto", "자동 설계", "제거 목표를 교체 주기 동안 지키도록 bed 크기를 자동으로 정함"],
        ["custom", "직접 구성", "bed의 흡착제·순서·크기를 직접 정하고 그 공정의 성능을 계산"]],
      state.train.enabled ? "custom" : "auto", (v) => toggleCustom(v === "custom"), ".design-mode"));
    }
  }
  $("#viewbar-left").replaceChildren(...left);
  $("#viewbar-right").replaceChildren(...right);
}

/** Switch between the automatic design and the user-built train (first use starts from the auto design). */
async function toggleCustom(on) {
  if (on === state.train.enabled) return;
  if (on && !state.train.units.length) {
    try {
      const auto = state.train.auto.length ? { mode: "auto", units: state.train.auto.map((ads) => ({ ads, auto: true })) } : null;
      const result = await api.steady({ ...state.params }, auto, state.project);
      setTrain({ enabled: true, units: trainFromAuto(result) });
    } catch (error) {
      toast(`자동 설계를 가져오지 못했습니다: ${error.message}`, "bad");
    }
  } else {
    setTrain({ enabled: on });
  }
  if (on) setUi({ mode: "process", processView: "summary" });
}

function renderBanner(skip) {
  const banner = $("#banner");
  const steady = state.results.steady;
  let content = null;
  if (!skip && steady.error) {
    content = h("div.banner.error", {}, [h("b", {}, "계산 오류: "), steady.error,
      h("button.btn.small", { onclick: () => requestSteady({ force: true }) }, "다시 시도")]);
  } else if (!skip && steady.data && !isFresh(steady)) {
    content = state.ui.auto
      ? h("div.banner.info", {}, [h("div.spinner.small"), "조건이 바뀌어 다시 계산하고 있습니다…"])
      : h("div.banner.warn", {}, ["조건이 바뀌었습니다. 결과는 이전 조건 기준입니다.",
          h("button.btn.small.primary", { onclick: () => computeAll() }, "계산")]);
  }
  banner.replaceChildren(...(content ? [content] : []));
}

function renderStatus() {
  const pill = $("#status");
  const r = state.results;
  const busy = r.steady.pendingKey || r.compare.pendingKey || r.batch.pendingKey || r.rank.pendingKey;
  let text = "최신", kind = "ok";
  if (state.saving === "error") { text = "저장 실패"; kind = "bad"; pill.title = state.saveError || ""; }
  else if (busy) { text = "계산 중…"; kind = "busy"; }
  else if (state.saving === "pending") { text = "저장 중…"; kind = "busy"; }
  else if (testView() || guide()) { text = "저장됨"; kind = "ok"; }
  else if (r.steady.error && r.steady.key === currentKey()) { text = "오류"; kind = "bad"; }
  else if (!isFresh(r.steady)) { text = state.ui.auto ? "대기" : "조건 바뀜"; kind = "warn"; }
  pill.textContent = text;
  pill.className = `status ${kind}`;
}

// ------------------------------------------------------------------------------------ chrome
function wireHeader() {
  $$(".mode-toggle button").forEach((btn) => btn.addEventListener("click", () => setUi({ mode: btn.dataset.mode })));
  $("#run").addEventListener("click", () => { state.results.steady.key = null; computeAll(); });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); computeAll(); }
    if (e.key === "Escape") { closeDrawer(); closeSettings(); closeModal(); closeMenu(); document.body.classList.remove("panel-open"); }
  });

  $("#drawer .drawer-backdrop").addEventListener("click", closeDrawer);
  $("#drawer .close").addEventListener("click", closeDrawer);
  $("#modal .modal-backdrop").addEventListener("click", closeModal);
  $("#modal .close").addEventListener("click", closeModal);

  const menu = $("#menu");
  $("#menu-btn").addEventListener("click", (e) => { e.stopPropagation(); menu.classList.toggle("open"); });
  menu.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", closeMenu);
  $("#auto-switch").addEventListener("change", (e) => {
    setUi({ auto: e.target.checked });
    if (e.target.checked) autoCompute();
  });
  const actions = {
    settings: () => openSettings(), glossary: openDrawer, md: () => exportMarkdown("md"), csv: exportProfilesCsv, json: exportParams,
    load: () => $("#import-params").click(),
    "project-save": exportProject, "project-load": () => $("#import-project").click(), "project-reset": resetProject,
    reset: () => {
      if (!confirm("모든 조건(설계 조건·판정 기준)을 기본값으로 되돌릴까요?\n흡착제와 시험 데이터는 그대로 남습니다.")) return;
      setParams({ ...state.defaults }); emit("params-external"); toast("모든 조건을 기본값으로 되돌렸습니다", "ok");
    },
    cache: async () => {
      const r = await api.clearCache();
      toast(`저장된 계산 결과 ${r.removed}개를 지웠습니다`, "ok");
    },
  };
  $$("[data-action]", menu).forEach((item) => item.addEventListener("click", () => { closeMenu(); actions[item.dataset.action](); }));
  $("#import-params").addEventListener("change", (e) => { if (e.target.files[0]) importParams(e.target.files[0]); e.target.value = ""; });
  $("#import-project").addEventListener("change", (e) => { if (e.target.files[0]) importProject(e.target.files[0]); e.target.value = ""; });

  // narrow screens: the condition panel slides over the page; a click outside it closes it
  $("#panel-toggle").addEventListener("click", (e) => { e.stopPropagation(); document.body.classList.toggle("panel-open"); });
  document.addEventListener("click", (e) => {
    if (document.body.classList.contains("panel-open") && !e.target.closest(".sidebar")) document.body.classList.remove("panel-open");
  });
}

const closeMenu = () => $("#menu").classList.remove("open");
function openDrawer() {
  const body = $("#drawer .drawer-body");
  body.replaceChildren(...state.spec.glossary.map((group) => h("section", {}, [
    h("h3", {}, group.group),
    h("dl", {}, group.items.flatMap((item) => [h("dt", {}, item.term), h("dd", {}, item.text)])),
  ])));
  $("#drawer").classList.add("open");
  $("#drawer").setAttribute("aria-hidden", "false");
}
const closeDrawer = () => { $("#drawer").classList.remove("open"); hide($("#drawer")); };
const closeModal = () => {
  $("#modal").classList.remove("open");
  hide($("#modal"));
  $("#modal .modal-body").replaceChildren();
};

// ------------------------------------------------------------------------------------ boot
async function boot() {
  let spec, project;
  try {
    [spec, { project }] = await Promise.all([api.spec(), api.project()]);
  } catch (error) {
    $("#view").replaceChildren(h("div.placeholder.error", {}, [h("b", {}, "시작하지 못했습니다"), h("div", {}, error.message)]));
    return;
  }
  initState(spec, project);
  $("#version").textContent = `모델 ${spec.version} · ${spec.temperature_C} °C`;
  $("#settings .drawer-backdrop").addEventListener("click", closeSettings);
  $("#settings .close").addEventListener("click", closeSettings);
  wireHeader();

  on("params", onParamsChanged);
  on("params-external", onParamsChanged);
  on("project", onProjectChanged);
  on("saved", renderStatus);
  on("batch-changed", ({ structural }) => { if (structural) { sidebarLayout = null; render(); } requestBatchSoon(); });
  on("ui", () => { render(); computeAll(); });
  on("scenarios", () => { if (state.ui.mode === "process" && state.ui.processView === "compare") render(); });
  window.addEventListener("hashchange", () => {
    const next = parseHash(location.hash);
    if (Object.entries(next).some(([k, v]) => state.ui[k] !== v)) setUi(next);
    else if (location.hash !== hashFor(state.ui)) history.replaceState(null, "", hashFor(state.ui));
  });

  render();
  computeAll();
}

const requestBatchSoon = debounce(() => requestBatch(), 250);

boot();
