// Settings UI.
//   left panel      property sheet: 공정 = 원료 · 목표 · 자동 설계, 단일 bed = the bed and its targets
//                   (시험 데이터 / 흡착제 비교 / 회분 have their own panels in their view modules)
//   ⚙ 모든 설정     a drawer with every setting, one tab per group, and a search box
//   control()       one setting as a small widget; used in the widgets, the drawer and next to where a
//                   setting matters (비누화 popover, time settings above the t charts, 속도식 in 속도 피팅).
// The same setting can be on screen several times; every copy re-syncs after any change.

import { h, $, $$, fmt, fmtSmart, toast, hide } from "./util.js";
import { state, setParams, setUi, setSingle, setTrain, change, changedParams, on, emit, isFresh, SINGLE_DEFAULTS, TEST_VIEWS } from "./store.js";
import { inputSidebar } from "./views/input.js";
import { fitSidebar } from "./views/fitting.js";
import { guideSidebar } from "./views/guide.js";
import { screenSidebar } from "./views/screen.js";
import { batchSidebar } from "./views/batch.js";
import { dot, kindDot, numField, roleEditor } from "./views/common.js";
import { helpTip, PARAM_TIP } from "./views/help.js";

const bound = new Set();                   // {el, sync} of every control currently on screen
let drawerTab = "targets";

// ---------------------------------------------------------------------------------- helpers
const specOf = (name) => state.spec.parameters.find((p) => p.name === name);
const isAuto = (p, v) => Boolean(p.auto) && Math.abs(v - p.auto.value) < 1e-12;
/** Wide positive ranges (e.g. 1–5000) get a logarithmic slider so both ends are reachable. */
const isLog = (p) => p.min > 0 && p.max / p.min >= 200;
const toSlider = (p, v) => (isLog(p) ? Math.log10(Math.max(v, p.min)) : v);
const fromSlider = (p, v) => (isLog(p) ? 10 ** v : v);
const unitText = (p) => (p.unit && p.unit !== "-" ? p.unit : "");

function roundToStep(p, value) {
  if (p.integer) return Math.round(value);
  const decimals = Math.max(0, -Math.floor(Math.log10(p.step || 1)));
  return Number(value.toFixed(Math.min(decimals + 1, 6)));
}

export function valueText(p, v) {
  if (p.toggle) return v ? "켬" : "끔";
  if (isAuto(p, v)) return p.auto.label;
  return `${fmtSmart(v)}${unitText(p) ? " " + unitText(p) : ""}`;
}

/** Leaving "자동" starts from the value the model had chosen, so nothing jumps. */
function autoSeed(p) {
  const seeds = { t_end_h: 1.5 * (state.params.service_h || 24) };
  const value = seeds[p.name] ?? (p.min + p.max) / 2;
  return roundToStep(p, Math.min(Math.max(value, p.min || p.step), p.max));
}

function commit(name, value) {
  bindingFor(name).set(value);      // "params" → every control re-syncs, results go stale / recompute
}

/** 단일 bed fields ("single.flow" …) — separate from the process settings, same widget. */
const SINGLE_SPECS = {
  flow: { label: "유량", unit: "L/h", min: 0.01, max: 100000, step: 0.5,
    help: "이 bed로 들어가는 가수분해액 유량입니다 (조성은 시험 데이터 화면의 입구 조성)." },
  L: { label: "길이 L", unit: "m", min: 0.01, max: 30, step: 0.01, help: "bed 충전 길이." },
  D: { label: "지름 D", unit: "m", min: 0.005, max: 10, step: 0.005, help: "bed 안지름." },
};

function bindingFor(name) {
  if (name.startsWith("single.")) {
    const field = name.slice(7);
    return { spec: { name, default: SINGLE_DEFAULTS[field], ...SINGLE_SPECS[field] },
      get: () => state.single[field], set: (value) => setSingle({ [field]: value }) };
  }
  return { spec: specOf(name), get: () => state.params[name], set: (value) => setParams({ [name]: value }) };
}

export function syncAll() {
  for (const item of bound) {
    if (!item.el.isConnected) bound.delete(item);
    else item.sync();
  }
  refreshChanges();
}
on("params", syncAll);
on("params-external", syncAll);

// ---------------------------------------------------------------------------------- one setting
/**
 * control(name, options)
 *   presets  [{value, label, title}]   quick-pick chips under the label
 *   marks    [{at, label}]             labelled ticks under the slider (e.g. MeOH boiling point)
 *   zone     {from, to, label}         shaded band on the slider (e.g. range the rate law was measured in)
 *   compact  one line: label, number, unit (no slider) — for use inside views
 *   id       prefix for element ids (keeps the caret when a view redraws)
 */
export function control(name, { presets = [], marks = [], zone = null, compact = false, id = "ctl", label } = {}) {
  const bind = bindingFor(name);
  const p = bind.spec;
  if (!p) return null;
  const inputId = `${id}-${name}`;
  const row = h(`div.ctl${compact ? ".compact" : ""}`, { dataset: { name, search: `${p.label} ${p.help} ${name}`.toLowerCase() } });
  const reset = h("button.reset", { type: "button", title: `기본값 ${valueText(p, p.default)}으로`, onclick: () => commit(name, p.default) }, "↺");
  const help = PARAM_TIP[name] ? helpTip(PARAM_TIP[name]) : h("button.info", { type: "button", title: p.help, "aria-label": "설명",
    onclick: () => row.classList.toggle("show-help") }, "?");

  if (p.toggle) {
    const box = h("input", { type: "checkbox", id: inputId, onchange: () => commit(name, box.checked ? 1 : 0) });
    row.append(h("div.ctl-top", {}, [h("label.ctl-label", { for: inputId }, label || p.label), help,
      h("label.switch", {}, [box, h("span.track", { "aria-hidden": "true" })]), reset]), h("div.ctl-help", {}, p.help));
    track(row, () => {
      box.checked = Boolean(bind.get());
      row.classList.toggle("changed", bind.get() !== p.default);
    });
    return row;
  }

  const number = h("input.num", { type: "number", id: inputId, step: p.step, min: p.min, max: p.max, "aria-label": p.label });
  const error = h("div.ctl-error");
  number.addEventListener("input", () => {
    const value = Number(number.value);
    const valid = number.value !== "" && Number.isFinite(value) && value >= p.min && value <= p.max;
    number.classList.toggle("invalid", !valid);
    error.textContent = valid ? "" : `${fmtSmart(p.min)} – ${fmtSmart(p.max)} 사이로 입력하세요`;
    if (valid) commit(name, p.integer ? Math.round(value) : value);
  });
  number.addEventListener("blur", () => { number.classList.remove("invalid"); error.textContent = ""; sync(); });

  const autoBox = p.auto ? h("input", { type: "checkbox", title: "모델이 값을 정하게 둡니다",
    onchange: (e) => commit(name, e.target.checked ? p.auto.value : autoSeed(p)) }) : null;
  const top = h("div.ctl-top", {}, [
    h("label.ctl-label", { for: inputId }, label || p.label), help,
    autoBox ? h("label.auto-toggle", {}, [autoBox, h("span", {}, p.auto.label)]) : null,
    h("div.num-wrap", {}, [number, h("span.unit", {}, unitText(p))]), reset,
  ]);
  row.append(top, h("div.ctl-help", {}, p.help));

  const chips = presets.length ? h("div.presets", {}, presets.map((preset) => h("button.preset", {
    type: "button", title: preset.title || "", dataset: { value: String(preset.value) },
    onclick: () => commit(name, preset.value),
  }, preset.label ?? `${fmtSmart(preset.value)}`))) : null;
  if (chips) row.append(chips);

  let slider = null;
  if (!compact) {
    slider = h("input.slider", { type: "range", min: toSlider(p, p.min), max: toSlider(p, p.max),
      step: isLog(p) ? 0.001 : p.step, "aria-label": p.label,
      oninput: () => commit(name, roundToStep(p, fromSlider(p, Number(slider.value)))) });
    const at = (v) => `${((toSlider(p, v) - toSlider(p, p.min)) / (toSlider(p, p.max) - toSlider(p, p.min))) * 100}%`;
    const ruler = marks.length || zone ? h("div.ruler", {}, [
      zone ? h("span.zone", { title: zone.label, style: { left: at(zone.from), width: `calc(${at(zone.to)} - ${at(zone.from)})` } },
        h("small", {}, zone.label)) : null,
      ...marks.filter((m) => m.at >= p.min && m.at <= p.max)          // a mark past the slider's end would overflow
        .map((m) => h("span.mark", { style: { left: at(m.at) }, title: m.label }, h("small", {}, m.label))),
    ]) : null;
    row.append(h("div.slider-wrap", {}, [slider, ruler]));
  }
  row.append(error);

  function sync() {
    const value = bind.get();
    const auto = isAuto(p, value);
    if (document.activeElement !== number) number.value = auto ? "" : String(value);
    number.placeholder = auto ? p.auto.label : "";
    number.disabled = auto;
    if (slider) { slider.disabled = auto; if (!auto) slider.value = toSlider(p, value); }
    if (autoBox) autoBox.checked = auto;
    row.classList.toggle("changed", Math.abs(value - p.default) > 1e-12);
    row.classList.toggle("is-auto", auto);
    for (const chip of chips?.children || []) chip.classList.toggle("active", Math.abs(Number(chip.dataset.value) - value) < 1e-9);
  }
  track(row, sync);
  return row;
}

/** Chips that set several settings at once (e.g. a literature rate law = k and Ea). */
export function presetGroup(presets, { title } = {}) {
  const box = h("div.preset-group", {}, [
    title ? h("span.preset-title", {}, title) : null,
    ...presets.map((preset) => h("button.preset", {
      type: "button", title: preset.title || "", onclick: () => {
        setParams({ ...preset.values });
        if (preset.toast) toast(preset.toast, "ok");
      },
    }, preset.label)),
  ]);
  track(box, () => {
    const chips = $$(".preset", box);
    presets.forEach((preset, i) => chips[i].classList.toggle("active",
      Object.entries(preset.values).every(([k, v]) => Math.abs(state.params[k] - v) < 1e-9)));
  });
  return box;
}

function track(el, sync) {
  bound.add({ el, sync });
  sync();
}

// ---------------------------------------------------------------------------------- presets
const SERVICE_PRESETS = [8, 24, 48, 72].map((v) => ({ value: v, label: `${v} h` }));
const FLOW_PRESETS = [{ value: 10 }, { value: 100 }, { value: 1000 }];

// ---------------------------------------------------------------------------------- left panel
// A property sheet: one line per setting ("이름 ··· 값"), grouped by what it is about — 원료 (grey), 목표 (green)
// and the beds (their adsorbent's colour). Clicking a line opens the full editor (number, presets, slider)
// right under it; one editor is open at a time.
let openProp = null;

function propRow(name, { label, prefix = "", mark = true, control: options = {} } = {}) {
  const bind = bindingFor(name);
  const p = bind.spec;
  const value = h("span.prop-value");
  const wrap = h("div.prop", { dataset: { name } });
  const row = h("button.prop-row", { type: "button", title: `${p.help}\n(눌러서 바꾸기)`, onclick: () => toggle() }, [
    h("span.prop-label", {}, label || p.label), value]);
  wrap.append(row);

  function toggle() {
    const editor = $(".prop-editor", wrap);
    if (openProp && openProp !== wrap) closeProp(openProp);
    if (editor) { closeProp(wrap); return; }
    wrap.classList.add("open");
    wrap.append(h("div.prop-editor", {}, control(name, { id: "p", ...options })));
    openProp = wrap;
    $(".num", wrap)?.focus();
  }
  track(wrap, () => {
    const v = bind.get();
    value.textContent = `${prefix}${valueText(p, v)}`;
    wrap.classList.toggle("changed", mark && Math.abs(Number(v) - Number(p.default)) > 1e-12);
  });
  return wrap;
}

function closeProp(wrap) {
  $(".prop-editor", wrap)?.remove();
  wrap.classList.remove("open");
  if (openProp === wrap) openProp = null;
}

/** A line with a number typed in place (project data: composition, component targets). */
function inlineRow(label, value, onValue, unit, title = "") {
  const input = numField(value, onValue, { bare: true, min: 0 });
  return h("div.prop", {}, h("div.prop-row.static", { title }, [h("span.prop-label", {}, label),
    h("div.num-wrap", {}, [input, h("span.unit", {}, unit)])]));
}

/** A titled block of property lines; `kind` colours it (feed grey, target green, carbon/resin/other). */
function group(title, kind, rows, footer = null, note = "") {
  return h("section.pgroup", { class: `pgroup ${kind}` }, [
    h("div.pgroup-head", {}, [["carbon", "resin", "other"].includes(kind) ? kindDot(kind) : null,
      h("b", {}, title), note ? h("small.muted", {}, note) : null]),
    ...rows, footer,
  ]);
}

/** A result line under a group, coloured by its verdict. */
function resultLine(read) {
  const line = h("p.pgroup-result");
  track(line, () => {
    const out = read();
    line.textContent = out ? out.text : "";
    line.className = `pgroup-result${out?.status ? " result-" + out.status : ""}`;
  });
  return line;
}

const settingsButton = (note) => h("button.btn.settings-btn", { onclick: () => openSettings() }, [
  h("span", {}, "⚙ 모든 설정"), h("small.muted", {}, note)]);

const kpiOf = (key) => state.results.steady?.data?.summary?.kpis?.find((k) => k.key === key);

/** Composition lines: the project's inlet composition, edited in place. */
function feedRows() {
  return state.project.components.map((c) => inlineRow([dot(c.id), c.name], state.project.feed[c.id],
    (v) => change((pr) => { pr.feed[c.id] = v ?? 0; }), "g/L"));
}

/** Target lines: role and removal target of every component. */
function targetRows() {
  return roleEditor();
}

export function renderSidebar(root) {
  openProp = null;
  if (state.ui.mode === "guide") { root.replaceChildren(guideSidebar()); return; }
  if (state.ui.mode === "bed") {
    const view = state.ui.bedView;
    if (view === "input") { root.replaceChildren(inputSidebar()); return; }
    if (view === "fit") { root.replaceChildren(fitSidebar()); return; }
    if (view === "screen") { root.replaceChildren(screenSidebar()); return; }
    if (view === "batch") { root.replaceChildren(batchSidebar((structural) => emit("batch-changed", { structural }))); return; }
    renderSingleSidebar(root);
    return;
  }
  const custom = state.train.enabled;
  root.replaceChildren(
    h("div#changes"),
    h("div.props", {}, [
      group("원료", "feed", [
        propRow("flow_l_h", { label: "유량", control: { presets: FLOW_PRESETS } }),
        ...feedRows(),
      ], null, "가수분해액 조성 (g/L)"),
      group("목표", "target", [
        propRow("service_h", { label: "교체 주기", control: { presets: SERVICE_PRESETS } }),
        propRow("judge_avg", { label: "누적 평균으로 판정" }),
        ...targetRows(),
      ], resultLine(() => {
        const k = kpiOf("removal");
        return k && k.value !== undefined ? { text: `${k.target} → ${fmt(k.value, 1)} %`, status: k.status } : null;
      })),
      custom ? group("직접 구성", "design", [
        h("p.pgroup-note", {}, "bed 종류·순서·크기는 오른쪽 '공정 구성' 표에서 정합니다."),
      ], designResult()) : group("자동 설계", "design", [
        autoBedPicker(),
        propRow("l_over_d", { label: "길이 / 지름" }),
        propRow("safety", { label: "부피 여유" }),
      ], designResult()),
    ]),
    settingsButton("속도 · 계산 · 판정 기준"),
  );
  refreshChanges();
}

function designResult() {
  return resultLine(() => {
    const data = state.results.steady?.data;
    if (state.results.steady?.error) return { text: "이 조건으로는 설계할 수 없습니다 → 오른쪽 설명", status: "bad" };
    if (!data) return null;
    const s = data.summary;
    return { text: `bed ${s.n_beds}개 · 흡착제 ${fmt(s.adsorbent_kg, s.adsorbent_kg < 10 ? 2 : 0)} kg · ${fmt(s.usage_kg_m3, 2)} kg/m³`,
      status: kpiOf("dp")?.status === "bad" ? "bad" : undefined };
  });
}

/** Which adsorbents the automatic design puts in series (empty = the comparison's 1순위 alone). */
function autoBedPicker() {
  const ads = state.project.adsorbents;
  const list = state.train.auto;
  const name = (id) => ads.find((a) => a.id === id)?.name || id;
  const kind = (id) => ads.find((a) => a.id === id)?.kind || "other";
  const move = (i, d) => { const next = [...list]; [next[i], next[i + d]] = [next[i + d], next[i]]; setTrain({ auto: next }); };
  const rows = list.length ? list.map((id, i) => h("div.auto-bed", {}, [
    h("span.muted", {}, `${i + 1}`), kindDot(kind(id)), h("span.auto-bed-name", {}, name(id)),
    h("button.icon-btn", { title: "앞으로", disabled: i === 0 || null, onclick: () => move(i, -1) }, "↑"),
    h("button.icon-btn", { title: "뒤로", disabled: i === list.length - 1 || null, onclick: () => move(i, 1) }, "↓"),
    h("button.icon-btn", { title: "목록에서 제외", onclick: () => setTrain({ auto: list.filter((_, k) => k !== i) }) }, "✕"),
  ])) : [h("p.pgroup-note", {}, "흡착제 비교의 1순위 한 가지로 bed 하나를 만듭니다. 여러 흡착제를 직렬로 쓰려면 아래에서 차례로 추가하세요.")];
  const free = ads.filter((a) => !list.includes(a.id));
  const add = free.length ? h("select.auto-bed-add", {
    onchange: (e) => { if (e.target.value) setTrain({ auto: [...list, e.target.value] }); },
  }, [h("option", { value: "" }, list.length ? "+ 다음 bed 흡착제…" : "+ 흡착제 직접 고르기…"),
    ...free.map((a) => h("option", { value: a.id }, a.name))]) : null;
  return h("div.auto-beds", {}, [h("div.auto-beds-head", {}, "bed 순서 (흐름 방향)"), ...rows, add]);
}

/** 단일 bed (위치별 z / 시간별 t): the chosen adsorbent's column, its flow, size and targets. */
function renderSingleSidebar(root) {
  const b = state.single;
  const ads = state.project.adsorbents.find((a) => a.id === b.ads);
  const sizeMode = h("div.segmented.size-pick", {}, [[true, "크기: 목표에 맞춰 자동"], [false, "L · D 직접"]].map(([value, text]) =>
    h("button", { type: "button", class: b.auto === value ? "active" : "", onclick: () => {
      const seed = value ? {} : seedSize();
      setSingle({ auto: value, ...seed });
    } }, text)));
  root.replaceChildren(
    h("div#changes"),
    h("div.props", {}, [
      group("들어가는 흐름", "feed", [
        propRow("single.flow", { control: { presets: FLOW_PRESETS } }),
        ...feedRows(),
      ], null, "조성은 공정과 같음"),
      group("목표", "target", [
        propRow("service_on", { label: "교체 주기 사용" }),
        state.params.service_on ? propRow("service_h", { label: "교체 주기", control: { presets: SERVICE_PRESETS } }) : null,
        propRow("judge_avg", { label: "누적 평균으로 판정" }),
        ...targetRows(),
      ]),
      group(ads ? ads.name : "흡착제 없음", ads?.kind || "other", [
        ads ? h("p.pgroup-note", {}, `충전층 값: 입자 ${state.params.d_p_mm || ads.d_p_mm} mm · 충전 밀도 ${state.params.rho_b || ads.rho_b} g/L · 공극률 ${state.params.eps_b || ads.eps_b}`
          + (state.params.d_p_mm || state.params.rho_b || state.params.eps_b ? " (일부는 설계 조건에서 직접 지정한 값)" : " (종류별 기본값)")) : null,
        sizeMode,
        ...(b.auto ? [propRow("l_over_d", { label: "길이 / 지름" }), propRow("safety", { label: "부피 여유" })]
          : [propRow("single.L", { mark: false }), propRow("single.D", { mark: false })]),
      ], singleResult(), "흡착제는 위에서 선택"),
    ]),
    settingsButton("속도 · 계산 · 판정 기준 (공정과 같이 씀)"),
  );
  refreshChanges();
}

/** Leaving "자동" starts from the size the automatic sizing had chosen. */
function seedSize() {
  const steady = state.results.steady;
  const u = steady?.data?.flowsheet?.units?.[0];
  if (!u || steady.error || !isFresh(steady) || u.ads !== state.single.ads) return {};
  return { L: Number(u.L.toPrecision(3)), D: Number(u.D.toPrecision(3)) };
}

function singleResult() {
  return resultLine(() => {
    const steady = state.results.steady;
    const u = steady?.data?.flowsheet?.units?.[0];
    if (steady?.error) return { text: "이 조건으로는 bed를 만들 수 없습니다 → 오른쪽 설명", status: "bad" };
    if (!u || !isFresh(steady)) return { text: "계산 중…" };
    const k = steady.data.profiles[0].kpis[0];
    const size = `${state.single.auto ? "자동 " : ""}D ${fmt(u.D, 3)} × L ${fmt(u.L, 2)} m · EBCT ${fmt(u.EBCT_min, 1)} min · ${fmt(u.mass_kg, u.mass_kg < 10 ? 2 : 0)} kg`;
    return { text: `${size}\n→ ${k.label} ${k.text ?? `${fmt(k.value, 1)} ${k.unit}`}`, status: k?.status };
  });
}

function refreshChanges() {
  const box = $("#changes");
  if (!box) return;
  // in 단일 bed the process feed / operation settings do not apply, so they are not listed
  const changed = changedParams().filter((p) => state.ui.mode !== "bed" || p.section !== "feed");
  box.replaceChildren(changed.length ? h("div.changes", {}, [
    h("div.changes-head", {}, [h("b", {}, `기본값에서 바꾼 설정 ${changed.length}개`),
      h("button.link-btn", { onclick: () => { setParams({ ...state.defaults }); emit("params-external"); } }, "모두 되돌리기")]),
    h("div.chips", {}, changed.map((p) => h("button.chip", {
      title: `${p.label}: 기본 ${valueText(p, p.default)} → ${valueText(p, state.params[p.name])} (눌러서 찾기)`,
      onclick: () => openSettings(p.name),
    }, [p.label, h("b", {}, valueText(p, state.params[p.name]))]))),
  ]) : h("p.changes-none", {}, "모든 설정이 기본값입니다"));
  // the drawer's tab badges count changed settings too; keep them current while it is open
  const tabs = $$("#settings.open .settings-tabs button");
  if (tabs.length) {
    const ids = state.spec.sections.filter((section) => state.ui.mode !== "bed" || section.id !== "feed");
    const all = changedParams();
    tabs.forEach((tab, i) => {
      const n = ids[i] ? all.filter((p) => p.section === ids[i].id).length : 0;
      let badge = $(".section-badge", tab);
      if (n && !badge) tab.append(badge = h("span.section-badge"));
      if (badge) { if (n) badge.textContent = String(n); else badge.remove(); }
    });
  }
  const button = $(".settings-btn span");
  if (button) {
    const hidden = changed.filter((p) => !["feed", "targets", "design"].includes(p.section)).length;
    button.textContent = hidden ? `⚙ 모든 설정 · 바꾼 것 ${hidden}` : "⚙ 모든 설정";
  }
}

// ---------------------------------------------------------------------------------- drawer
const EXTRAS = {
  design: () => [h("p.muted.small", {}, state.train.enabled
    ? "지금은 '직접 구성' 공정이라 '자동'으로 표시한 bed에만 쓰입니다."
    : "자동 설계: bed마다 맡은 제거 대상(그 흡착제의 K_d가 가장 큰 성분)을 교체 주기 동안 지키는 가장 작은 부피를 찾고, 여유를 곱해 L/D로 지름과 길이를 정합니다.")],
  kinetics: () => [h("p.muted.small", {}, "속도상수 k_LDF는 흡착제마다 회분 시험의 C(t)에 맞춘 값입니다 (시험 데이터 화면 아래 표). 여기서는 컬럼에 쓸 때 곱하는 배수만 정합니다.")],
  criteria: () => [h("p.muted.small", {}, "결과 카드의 충족·주의·미달을 가르는 한계입니다. 계산 자체에는 영향이 없습니다.")],
};

const CONTROL_OPTIONS = {
  service_h: { presets: SERVICE_PRESETS },
  flow_l_h: { presets: FLOW_PRESETS },
  l_over_d: { presets: [2, 4, 8].map((v) => ({ value: v, label: `${v}` })) },
};
export const optionsFor = (name) => CONTROL_OPTIONS[name] || {};

export function openSettings(focusName) {
  const drawer = $("#settings");
  if (focusName) drawerTab = specOf(focusName)?.section || drawerTab;
  drawSettings();
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  if (focusName) {
    const row = $(`#settings .ctl[data-name="${focusName}"]`);
    row?.scrollIntoView({ block: "center" });
    row?.classList.add("flash");
    setTimeout(() => row?.classList.remove("flash"), 1300);
  }
}

export function closeSettings() {
  $("#settings")?.classList.remove("open");
  hide($("#settings"));
}

function drawSettings(query = "") {
  // in 단일 bed the bed's own flow replaces the process feed
  const sections = state.spec.sections.filter((section) => state.ui.mode !== "bed" || section.id !== "feed");
  if (!sections.some((section) => section.id === drawerTab)) drawerTab = sections[0].id;
  const changed = changedParams();
  const tabs = h("div.settings-tabs", {}, sections.map((section) => {
    const count = changed.filter((p) => p.section === section.id).length;
    return h("button", { class: section.id === drawerTab && !query ? "active" : "",
      onclick: () => { drawerTab = section.id; drawSettings(); } }, [section.title, count ? h("span.section-badge", {}, String(count)) : null]);
  }));
  const search = h("input.search", { type: "search", placeholder: "설정 검색 (예: 교체, 압력, 속도)", value: query,
    oninput: (e) => { drawSettings(e.target.value); const again = $("#settings .search"); again.focus(); again.setSelectionRange(99, 99); } });
  let body;
  const q = query.trim().toLowerCase();
  if (q) {
    const allowed = new Set(sections.map((section) => section.id));
    const hits = state.spec.parameters.filter((p) => allowed.has(p.section) && `${p.label} ${p.help} ${p.name}`.toLowerCase().includes(q));
    body = hits.length ? hits.map((p) => h("div.search-hit", {}, [
      h("small.muted", {}, sections.find((s) => s.id === p.section)?.title), control(p.name, { id: "s", ...optionsFor(p.name) })]))
      : [h("p.muted", {}, "맞는 설정이 없습니다")];
  } else {
    const section = sections.find((s) => s.id === drawerTab) || sections[0];
    body = [
      h("p.muted.small.section-desc", {}, section.description),
      ...(EXTRAS[section.id]?.() || []),
      ...state.spec.parameters.filter((p) => p.section === section.id).map((p) => control(p.name, { id: "s", ...optionsFor(p.name) })),
    ];
  }
  $("#settings .settings-head-tools").replaceChildren(search);
  $("#settings .settings-tabs-wrap").replaceChildren(tabs);
  $("#settings .settings-body").replaceChildren(...body);
}
