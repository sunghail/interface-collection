// Reactor Studio — boot, data requests and top-level rendering.
//
// Two ways to look at the same calculation, switched at the top right:
//   단일 bed  one reactor at a time: along z, over t, or fitting its rate law
//   공정      the whole train: flowsheet, composition from feed to product, scenario comparison
//
// Data flow: a parameter change marks results stale; with 자동 계산 on, the fast parts (steady,
// and start-up curves when the t view needs them) are recomputed after a short pause. The slow
// saponification run only starts when asked for (switch turned on, button, or 계산).

import { $, $$, h, fmt, debounce, toast, hide } from "./util.js";
import { api, runDeactivation } from "./api.js";
import { state, initState, on, emit, setUi, currentKey, isFresh, setParams, setTrain, trainPayload, requestParams, parseHash, hashFor } from "./store.js";
import { renderSidebar, openSettings, closeSettings, control, optionsFor, syncAll } from "./settings.js";
import { renderKpis } from "./kpis.js";
import { renderSingle, renderProcessBed } from "./views/bed.js";
import { renderProcess } from "./views/process.js";
import { renderCompare } from "./views/compare.js";
import { renderOptimize } from "./views/optimize.js";
import { renderCriteria } from "./views/criteria.js";
import { currentBed, soapBedId } from "./views/common.js";
import { exportMarkdown, exportProfilesCsv, exportParams, importParams } from "./exporter.js";
import { trainFromAuto } from "./train.js";

// ------------------------------------------------------------------------------------ requests
async function requestSteady({ force = false } = {}) {
  const slot = state.results.steady;
  const key = currentKey();
  if (!force && slot.key === key && slot.error) {
    // back to conditions whose result is still here (e.g. 산촉매 → CaO after an error): drop the other error
    slot.error = null;
    render();
    return;
  }
  if (!force && (slot.key === key || slot.pendingKey === key)) return;
  slot.pendingKey = key;
  slot.error = null;
  renderStatus();
  try {
    const data = await api.steady({ ...requestParams() }, trainPayload());
    if (currentKey() !== key) return;                 // conditions changed meanwhile: drop it
    Object.assign(slot, { data, key, notes: data.notes });
  } catch (error) {
    if (currentKey() === key) slot.error = error.message;
  } finally {
    if (slot.pendingKey === key) slot.pendingKey = null;
    render();
  }
}

async function requestTransient(bed, { force = false } = {}) {
  const slot = (state.results.transient[bed] ||= {});
  const key = currentKey();
  if (!force && slot.key === key && slot.error) { slot.error = null; render(); return; }
  if (!force && (slot.key === key || slot.pendingKey === key)) return;
  slot.pendingKey = key;
  slot.error = null;
  renderStatus();
  try {
    const data = await api.transient({ ...requestParams() }, bed, trainPayload());
    if (currentKey() !== key) return;
    Object.assign(slot, { data, key });
  } catch (error) {
    if (currentKey() === key) slot.error = error.message;
  } finally {
    if (slot.pendingKey === key) slot.pendingKey = null;
    render();
  }
}

async function requestDeactivation() {
  const slot = state.results.deact;
  const key = currentKey();
  if (slot.pendingKey === key || slot.key === key) return;
  Object.assign(slot, { pendingKey: key, loading: true, elapsed: 0, error: null });
  render();
  try {
    const data = await runDeactivation({ ...requestParams() }, trainPayload(), (seconds) => {
      slot.elapsed = seconds;
      $$(".elapsed-value").forEach((node) => { node.textContent = fmt(seconds, 0); });
      renderStatus();
    }, () => currentKey() === key);
    if (data && currentKey() === key) Object.assign(slot, { data, key });
  } catch (error) {
    if (currentKey() === key) slot.error = error.message;
  } finally {
    if (slot.pendingKey === key) Object.assign(slot, { pendingKey: null, loading: false });
    render();
  }
}

/** Everything the current screen needs; `includeSoap` also starts the slow run. */
function computeAll({ includeSoap = false } = {}) {
  requestSteady();
  if (includeSoap && state.ui.soap && soapApplicable()) requestDeactivation();
}

/** Saponification is calculated for a CaO bed: is there one in what is on screen? */
function soapApplicable() {
  const profiles = state.results.steady.data?.profiles;
  if (profiles && isFresh(state.results.steady)) return profiles.some((p) => p.kind === "cao");
  if (state.ui.mode === "bed") return state.single.kind === "cao";
  return !state.train.enabled || state.train.units.some((u) => u.kind === "cao");
}

const autoCompute = debounce(() => computeAll(), 450);

on("need", ({ kind, bed, force }) => {
  if (kind === "deact") { if (soapApplicable()) requestDeactivation(); return; }
  // start-up curves are cheap, but only fetch them once the steady result matches the conditions
  if (kind === "transient" && (force || isFresh(state.results.steady))) requestTransient(bed, { force });
});

function onParamsChanged() {
  render();
  if (state.ui.auto) autoCompute();
}

// ------------------------------------------------------------------------------------ rendering
let lastView = null;

const viewKey = (ui) => hashFor(ui);
let lastMode = null;

function render() {
  const ui = state.ui;
  // 단일 bed and 공정 calculate different things: switching drops the other mode's results.
  // lastMode is set first: the requests started here call render() again straight away, and that call
  // must not see the switch a second time (it would clear and re-request without end).
  if (lastMode !== null && lastMode !== ui.mode) {
    lastMode = ui.mode;
    state.results = { steady: {}, transient: {}, deact: {} };
    computeAll({ includeSoap: ui.soap });
  }
  lastMode = ui.mode;
  $$(".mode-toggle button").forEach((btn) => {
    const active = btn.dataset.mode === ui.mode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-checked", String(active));
  });
  $("#auto-switch").checked = ui.auto;
  const key = viewKey(ui);
  // moving to another view adds a history entry, so the browser's back button walks the views
  if (location.hash !== hashFor(ui)) history[lastView && lastView !== key ? "pushState" : "replaceState"](null, "", hashFor(ui));

  renderViewBar();
  const fitting = ui.mode === "bed" && ui.bedView === "fit";
  const procBeds = ui.mode === "process" && ui.processView === "beds";
  const comparing = ui.mode === "process" && ui.processView === "compare";
  const optimizing = ui.mode === "process" && ui.processView === "optimize";
  const judging = ui.mode === "process" && ui.processView === "criteria";
  $("#kpis").hidden = fitting || comparing || optimizing || judging;
  if (!$("#kpis").hidden) renderKpis($("#kpis"));
  renderBanner(fitting || optimizing);

  // the left panel changes with the mode (단일 bed / 공정), the bed kind and custom train
  const layout = `${ui.mode}|${state.train.enabled}|${state.single.kind}|${state.single.auto}`;
  if (sidebarLayout !== layout) { sidebarLayout = layout; renderSidebar($("#param-panel")); }
  else syncAll();                 // result lines under the widgets follow the latest calculation

  const view = $("#view");
  view.classList.toggle("stale", Boolean(state.results.steady.data) && !isFresh(state.results.steady) && !fitting && !optimizing);
  const scroll = key === lastView ? window.scrollY : 0;
  const focus = rememberFocus(view);
  if (ui.mode === "bed") renderSingle(view);
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

let sidebarLayout = null;

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

/** Second row: what to look at inside the current mode, plus the 비누화 switch. */
function renderViewBar() {
  const ui = state.ui;
  const segmented = (items, current, pick, cls = "") => h(`div.segmented${cls}`, { role: "tablist" }, items.map(([value, content, title]) =>
    h("button", { class: value === current ? "active" : "", role: "tab", "aria-selected": String(value === current),
      title: title || null, onclick: () => pick(value) }, content)));

  const left = [];
  let soapUsable = soapApplicable();
  const profiles = state.results.steady.data?.profiles;
  if (ui.mode === "bed") {
    const kind = state.single.kind;
    soapUsable = kind === "cao";
    left.push(h("span.single-title", {}, [h("span.bed-dot", { class: `bed-dot ${kind}` }), kind === "acid" ? "산촉매 bed 하나" : "CaO bed 하나"]));
    left.push(segmented([["z", "위치별 z"], ["t", "시간별 t"], ["fit", "속도 피팅"]], ui.bedView, (v) => setUi({ bedView: v })));
  } else {
    const n = ui.compare.length;
    left.push(segmented([["summary", "공정 요약"], ["beds", "bed별"], ["criteria", "판정 기준"],
      ["compare", n ? `시나리오 비교 · ${n}` : "시나리오 비교"], ["optimize", "최적화"]],
      ui.processView, (v) => setUi({ processView: v })));
    if (ui.processView === "beds" && profiles) {
      const bed = currentBed(profiles);
      soapUsable = soapUsable && bed.id === soapBedId(profiles);     // soap forms in the first CaO bed of the train
      left.push(segmented(profiles.map((p) => [p.id, [h("span.bed-dot", { class: `bed-dot ${p.kind}` }), p.short], p.label]),
        bed.id, (id) => setUi({ bed: id }), ".beds"));
      left.push(segmented([["z", "위치별 z"], ["t", "시간별 t"]], ui.procBedView, (v) => setUi({ procBedView: v })));
    } else {
      left.push(h("span.viewbar-sep"));
      left.push(segmented([["auto", "자동 설계", "목표(산가·전환율)를 맞추도록 bed 개수와 크기를 자동으로 정함"],
        ["custom", "직접 구성", "bed 종류·개수·순서·크기·온도·분리기를 직접 정하고 그 공정의 성능을 계산"]],
      state.train.enabled ? "custom" : "auto", (v) => toggleCustom(v === "custom"), ".design-mode"));
    }
  }

  $("#viewbar-left").replaceChildren(...left);
  // the 비누화 switch and its settings popover are built once (a redraw would interrupt a slider drag)
  const box = $("#soap-box");
  if (!box.firstChild) buildSoapBox(box);
  const sw = $(".switch", box);
  sw.classList.toggle("disabled", !soapUsable);
  sw.title = soapUsable ? "FFA + CaO → 칼슘 비누로 촉매가 소모되는 과정까지 계산 (10초–1분)"
    : "비누화는 CaO bed에서 계산합니다 (공정에서는 첫 번째 CaO bed)";
  $("input", sw).checked = ui.soap && soapUsable;
  $("input", sw).disabled = !soapUsable;
}

function buildSoapBox(box) {
  const panel = h("div.soap-panel", { hidden: true }, [
    h("div.soap-panel-head", {}, [h("b", {}, "비누화 설정"), h("small.muted", {}, "FFA + CaO → 칼슘 비누 (촉매 소모)")]),
    control("f_access", { id: "soap", ...optionsFor("f_access") }),
    control("k_soap", { id: "soap" }),
    h("p.muted.small", {}, "촉매 수명은 거의 '반응 가능한 CaO 비율'이 정합니다. 문헌 추정 0.1–1.5 %."),
  ]);
  const gear = h("button.icon-btn.soap-gear", { type: "button", title: "비누화 설정", "aria-label": "비누화 설정",
    onclick: (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; } }, "⚙");
  panel.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => { panel.hidden = true; });
  const sw = h("label.switch", {}, [
    h("input", { type: "checkbox", onchange: (e) => {
      setUi({ soap: e.target.checked });
      if (e.target.checked && isFresh(state.results.steady) && soapApplicable()) requestDeactivation();
    } }),
    h("span.track", { "aria-hidden": "true" }), h("span", {}, "비누화"),
  ]);
  box.append(sw, gear, panel);
}

/** Switch between the automatic design and the user-built train (first use starts from the auto design). */
async function toggleCustom(on) {
  if (on === state.train.enabled) return;
  if (on && !state.train.units.length) {
    try {
      const auto = await api.steady({ ...state.params }, null);
      setTrain({ enabled: true, units: trainFromAuto(auto) });
    } catch (error) {
      toast(`자동 설계를 가져오지 못했습니다: ${error.message}`, "bad");
    }
  } else {
    setTrain({ enabled: on });
  }
  if (on) setUi({ mode: "process", processView: "summary" });
}

function renderBanner(fitting) {
  const banner = $("#banner");
  const steady = state.results.steady;
  let content = null;
  if (steady.error) {
    content = h("div.banner.error", {}, [h("b", {}, "계산 오류: "), steady.error,
      h("button.btn.small", { onclick: () => requestSteady({ force: true }) }, "다시 시도")]);
  } else if (!fitting && steady.data && !isFresh(steady)) {
    content = state.ui.auto
      ? h("div.banner.info", {}, [h("div.spinner.small"), "조건이 바뀌어 다시 계산하고 있습니다…"])
      : h("div.banner.warn", {}, ["조건이 바뀌었습니다. 결과는 이전 조건 기준입니다.",
          h("button.btn.small.primary", { onclick: () => computeAll({ includeSoap: true }) }, "계산")]);
  }
  banner.replaceChildren(...(content ? [content] : []));
}

function renderStatus() {
  const pill = $("#status");
  const r = state.results;
  const busy = r.steady.pendingKey || Object.values(r.transient).some((s) => s.pendingKey);
  let text = "최신", kind = "ok";
  if (r.deact.loading) { text = `비누화 ${fmt(r.deact.elapsed || 0, 0)}초`; kind = "busy"; }
  else if (busy) { text = "계산 중…"; kind = "busy"; }
  else if (r.steady.error) { text = "오류"; kind = "bad"; }
  else if (!isFresh(r.steady)) { text = state.ui.auto ? "대기" : "조건 바뀜"; kind = "warn"; }
  else if (state.ui.soap && soapApplicable() && !isFresh(r.deact)) { text = "비누화 결과 필요"; kind = "warn"; }
  pill.textContent = text;
  pill.className = `status ${kind}`;
}

// ------------------------------------------------------------------------------------ chrome
function wireHeader() {
  $$(".mode-toggle button").forEach((btn) => btn.addEventListener("click", () => setUi({ mode: btn.dataset.mode })));
  $("#run").addEventListener("click", () => computeAll({ includeSoap: true }));
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); computeAll({ includeSoap: true }); }
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
    settings: () => openSettings(), glossary: openDrawer, md: exportMarkdown, csv: exportProfilesCsv, json: exportParams,
    load: () => $("#import-params").click(),
    reset: () => { setParams({ ...state.defaults }); emit("params-external"); toast("모든 조건을 기본값으로 되돌렸습니다", "ok"); },
    cache: async () => {
      const r = await api.clearCache();
      toast(`저장된 계산 결과 ${r.removed}개를 지웠습니다`, "ok");
    },
  };
  $$("[data-action]", menu).forEach((item) => item.addEventListener("click", () => { closeMenu(); actions[item.dataset.action](); }));
  $("#import-params").addEventListener("change", (e) => { if (e.target.files[0]) importParams(e.target.files[0]); e.target.value = ""; });

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
  let spec;
  try {
    spec = await api.spec();
  } catch (error) {
    $("#view").replaceChildren(h("div.placeholder.error", {}, [h("b", {}, "시작하지 못했습니다"), h("div", {}, error.message)]));
    return;
  }
  initState(spec);
  $("#version").textContent = `모델 ${spec.version}`;
  $("#settings .drawer-backdrop").addEventListener("click", closeSettings);
  $("#settings .close").addEventListener("click", closeSettings);
  wireHeader();

  on("params", onParamsChanged);
  on("params-external", onParamsChanged);
  on("ui", render);
  on("scenarios", () => { if (state.ui.mode === "process" && state.ui.processView === "compare") render(); });
  window.addEventListener("hashchange", () => {
    const next = parseHash(location.hash);
    if (Object.entries(next).some(([k, v]) => state.ui[k] !== v)) setUi(next);
    else if (location.hash !== hashFor(state.ui)) history.replaceState(null, "", hashFor(state.ui));
  });

  render();
  computeAll({ includeSoap: state.ui.soap });
}

boot();
