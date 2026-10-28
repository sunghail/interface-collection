// Settings UI.
//   left panel      three widgets (원료 · 운전 · 목표) + what differs from the defaults + "⚙ 모든 설정"
//   ⚙ 모든 설정     a drawer with every setting, one tab per group, and a search box
//   control()       one setting as a small widget; used in the widgets, the drawer and next to where a
//                   setting matters (비누화 popover, time settings above the t charts, 속도식 in 속도 피팅).
// The same setting can be on screen several times; every copy re-syncs after any change.

import { h, $, $$, fmt, fmtSmart, toast, hide } from "./util.js";
import { state, setParams, setUi, setSingle, changedParams, on, emit, isFresh, SINGLE_DEFAULTS } from "./store.js";

const bound = new Set();                   // {el, sync} of every control currently on screen
let drawerTab = "design";

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
  const summary = state.results.steady?.data?.summary;
  const deact = state.results.deact?.data;
  const transientTau = Object.values(state.results.transient || {}).map((slot) => slot?.data?.tau_min).find(Boolean);
  const seeds = {
    n_acid_beds: summary?.n_acid_beds || 2,
    k_soap: deact?.k_soap ?? 0.005,
    t_end_min: transientTau ? 3 * transientTau : 180,
    deact_end_h: deact?.t_h ? deact.t_h[deact.t_h.length - 1] : 100,
  };
  const value = seeds[p.name] ?? (p.min + p.max) / 2;
  return roundToStep(p, Math.min(Math.max(value, p.min || p.step), p.max));
}

function commit(name, value) {
  bindingFor(name).set(value);      // "params" → every control re-syncs, results go stale / recompute
}

/** 단일 bed fields ("single.oil" …) — separate from the process settings, same widget. */
const SINGLE_SPECS = {
  oil: { label: "유량", unit: "kg/h", min: 1, max: 5000, step: 1,
    help: "이 bed로 들어가는 기름(TG + FFA) 유량입니다." },
  ffa: { label: "입구 FFA", unit: "wt%", min: 0, max: 20, step: 0.05,
    help: "이 bed로 들어가는 기름의 FFA (오일 기준). CaO bed 앞이라면 산촉매 전처리 뒤의 값(보통 0.3–0.5 %)을 넣으세요." },
  T: { label: "온도", unit: "°C", min: 20, max: 120, step: 0.5,
    help: "bed 운전 온도. 상압에서는 메탄올 끓는점 64.7 °C 아래로 유지합니다." },
  meoh_acid: { label: "메탄올 : FFA", unit: "mol/mol", min: 1, max: 200, step: 1,
    help: "들어가는 FFA 1 mol당 메탄올 mol. Berrios 2007 최적 60 : 1." },
  meoh_cao: { label: "메탄올 : TG", unit: "mol/mol", min: 3, max: 50, step: 0.5,
    help: "들어가는 TG 1 mol당 메탄올 mol. 이론량 3 : 1, 보통 6–12 : 1." },
  target_av: { label: "목표 출구 산가", unit: "mg KOH/g", min: 0.1, max: 20, step: 0.05,
    help: "자동 크기: 출구 산가가 이 값이 되도록 bed를 정합니다 (체류시간 여유를 곱함). 판정 기준이기도 합니다." },
  target_x: { label: "목표 전환율", unit: "%", min: 50, max: 99.9, step: 0.1,
    help: "자동 크기: TG 전환율이 이 값이 되도록 bed를 정합니다 (체류시간 여유를 곱함). 판정 기준이기도 합니다." },
  L: { label: "길이 L", unit: "m", min: 0.1, max: 30, step: 0.05, help: "bed 충전 길이." },
  D: { label: "지름 D", unit: "m", min: 0.05, max: 5, step: 0.01, help: "bed 안지름." },
};

function bindingFor(name) {
  if (name.startsWith("single.")) {
    const field = name.slice(7);
    // FFA, temperature … start differently for each catalyst (see KIND_START)
    const start = KIND_START[state.single.kind]?.[field] ?? SINGLE_DEFAULTS[field];
    return { spec: { name, default: start, ...SINGLE_SPECS[field] },
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
  const help = h("button.info", { type: "button", title: p.help, "aria-label": "설명",
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
const MEOH_BOIL_C = 64.7;
const TARGET_PRESETS = [
  { label: "기본", values: { target_x: 96.5, target_av: 1.0 }, title: "전환율 96.5 % (EN 14214 에스테르 함량) · CaO 입구 산가 1.0" },
  { label: "엄격", values: { target_x: 96.5, target_av: 0.5 }, title: "CaO 입구 산가도 바이오디젤 규격 0.5까지 낮춤 (비누화 최소)" },
  { label: "고전환", values: { target_x: 99.0, target_av: 0.5 }, title: "전환율 99 %, 산가 0.5" },
];
export const CAO_KINETICS_PRESETS = [
  { label: "생석회 (기본)", values: { k_cao_60: 0.045, ea_cao: 79 }, title: "k(60 °C) 0.045 1/min, Miladinović 2016 · Ea 79 kJ/mol, Birla 2012" },
  { label: "순수 CaO", values: { k_cao_60: 0.067, ea_cao: 79 }, title: "k(60 °C) 0.067 1/min, Miladinović 2016 (낙관적)" },
  { label: "달팽이 껍질 CaO", values: { k_cao_60: 0.0122, ea_cao: 79 }, title: "Birla 2012, 폐식용유 (보수적): A = 2.98×10¹⁰ 1/min → k(60 °C) 0.0122" },
];
export const ACID_KINETICS_PRESETS = [
  { label: "Berrios 2007 그대로", values: { acid_k1_mult: 1, acid_k2_mult: 1 }, title: "황산 균일계 값을 수지 bed에 그대로 (배수 1)" },
];
export const TEMP_MARKS = { marks: [{ at: MEOH_BOIL_C, label: "MeOH 끓는점" }] };

// ---------------------------------------------------------------------------------- left panel
// A property sheet: one line per setting ("이름 ··· 값"), grouped by where it applies — 원료 (grey),
// 산촉매 bed (orange) and CaO bed (blue), the colours of the flowsheet. Clicking a line opens the
// full editor (number, presets, slider) right under it; one editor is open at a time.
let openProp = null;

const MEOH_FFA_PRESETS = [30, 60, 90].map((v) => ({ value: v, label: `${v} : 1` }));
const MEOH_TG_PRESETS = [6, 9, 12].map((v) => ({ value: v, label: `${v} : 1` }));
const ACID_ZONE = { zone: { from: 30, to: 60, label: "속도식 측정 범위" } };

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

/** A titled block of property lines; `kind` colours it like the flowsheet (acid / cao). */
function group(title, kind, rows, footer = null, note = "") {
  return h("section.pgroup", { class: `pgroup ${kind}` }, [
    h("div.pgroup-head", {}, [kind !== "feed" ? h("span.bed-dot", { class: `bed-dot ${kind}` }) : null,
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

export function renderSidebar(root) {
  openProp = null;
  if (state.ui.mode === "bed") { renderSingleSidebar(root); return; }
  const custom = state.train.enabled;
  const kpi = (key) => state.results.steady?.data?.summary?.kpis?.find((k) => k.key === key);
  const perBed = custom ? [h("p.pgroup-note", {}, ["온도·메탄올은 ",
    h("button.link-btn", { onclick: () => setUi({ mode: "process", processView: "summary" }) }, "공정 구성 표"), "에서 bed마다"])] : null;
  root.replaceChildren(
    h("div#changes"),
    h("div.props", {}, [
      group("원료", "feed", [
        propRow("oil_kg_h", { label: "유량", control: { presets: [{ value: 100 }, { value: 500 }, { value: 1000 }] } }),
        propRow("ffa_wt", { label: "FFA", control: { presets: [1, 2, 5, 10].map((v) => ({ value: v, label: `${v} %` })) } }),
      ]),
      group("산촉매 bed", "acid", [
        ...(perBed || [
          propRow("t_stage1_c", { label: "온도", control: { ...ACID_ZONE, ...TEMP_MARKS } }),
          propRow("meoh_ffa", { label: "메탄올 : FFA", control: { presets: MEOH_FFA_PRESETS } }),
        ]),
        propRow("target_av", { label: "목표 산가", prefix: "≤ " }),
      ], resultLine(() => {
        const data = state.results.steady?.data;
        if (!data) return null;
        const s = data.summary, k = kpi("av_out");
        // the acid beds that act before the (first) CaO bed are the ones that set its inlet acid value
        const units = data.flowsheet.units;
        const firstCao = units.findIndex((u) => u.kind === "cao");
        const before = units.slice(0, firstCao < 0 ? units.length : firstCao).filter((u) => u.kind === "acid").length;
        const below = s.av_feed <= state.params.target_av + 1e-9;
        if (!s.n_acid_beds) {
          return below ? { text: `산가 ${fmt(s.av_feed, 2)} ≤ 목표 → 산촉매 없이 CaO로` }
            : { text: `산촉매 bed 없음 · 산가 ${fmt(s.av_feed, 2)} > 목표 (CaO bed에서 비누화)`, status: "bad" };
        }
        if (!before) return { text: `CaO bed 앞에 산촉매 bed가 없음 · 산가 ${fmt(s.av_feed, 2)}`, status: below ? k?.status : "bad" };
        return { text: `bed ${before}개 · 산가 ${fmt(s.av_feed, 2)} → ${fmt(s.av_out, 2)}`, status: k?.status };
      })),
      group("CaO bed", "cao", [
        ...(perBed ? [] : [
          propRow("t_stage2_c", { label: "온도", control: TEMP_MARKS }),
          propRow("meoh_tg", { label: "메탄올 : TG", control: { presets: MEOH_TG_PRESETS } }),
        ]),
        propRow("target_x", { label: "목표 전환율", prefix: "≥ " }),
      ], resultLine(() => {
        const k = kpi("conversion");
        return k ? { text: `전환율 ${fmt(k.value, 2)} %`, status: k.status } : null;
      })),
    ]),
    settingsButton("자동 설계 · 촉매 · 속도식 · 비누화 · 계산 · 판정 기준"),
  );
  refreshChanges();
}

/** 단일 bed: pick the catalyst, then its inlet, temperature, size and target — one colour. */
function renderSingleSidebar(root) {
  const b = state.single;
  const acid = b.kind === "acid";
  const kind = h("div.segmented.kind-pick", {}, [["acid", "산촉매 bed (수지)"], ["cao", "CaO bed"]].map(([value, text]) =>
    h("button", { type: "button", class: b.kind === value ? "active" : "", onclick: () => switchKind(value) },
      [h("span.bed-dot", { class: `bed-dot ${value}` }), text])));
  const sizeMode = h("div.segmented.size-pick", {}, [[true, "크기: 목표에 맞춰 자동"], [false, "L · D 직접"]].map(([value, text]) =>
    h("button", { type: "button", class: b.auto === value ? "active" : "", onclick: () => {
      const seed = value ? {} : seedSize();
      setSingle({ auto: value, ...seed });
    } }, text)));
  root.replaceChildren(
    h("div#changes"),
    kind,
    h("div.props", {}, [
      group("들어가는 흐름", "feed", [
        propRow("single.oil", { control: { presets: [{ value: 100 }, { value: 500 }, { value: 1000 }] } }),
        propRow("single.ffa", { control: { presets: (acid ? [2, 5, 10] : [0.3, 0.5, 1]).map((v) => ({ value: v, label: `${v} %` })) } }),
        acid ? propRow("single.meoh_acid", { control: { presets: MEOH_FFA_PRESETS } })
          : propRow("single.meoh_cao", { control: { presets: MEOH_TG_PRESETS } }),
      ], null, acid ? "폐식용유" : "산촉매 전처리를 거친 기름"),
      group(acid ? "산촉매 bed" : "CaO bed", b.kind, [
        propRow("single.T", { control: { ...(acid ? ACID_ZONE : {}), ...TEMP_MARKS } }),
        acid ? propRow("single.target_av", { prefix: "≤ " }) : propRow("single.target_x", { prefix: "≥ " }),
        // a CaO bed is also judged on the FFA it receives (it turns into soap)
        acid ? null : propRow("single.target_av", { label: "입구 산가 한도 (비누화)", prefix: "≤ " }),
        sizeMode,
        ...(b.auto ? [] : [propRow("single.L", { mark: false }), propRow("single.D", { mark: false })]),
      ], singleResult()),
    ]),
    settingsButton("촉매 · 속도식 · 비누화 · 계산 · 판정 기준 (공정과 같이 씀)"),
  );
  refreshChanges();
}

// each catalyst keeps its own inlet, temperature and size: switching back restores them
const KIND_FIELDS = ["ffa", "T", "auto", "L", "D"];
const KIND_START = {
  acid: { ffa: 5, T: 60, auto: true, L: 3.5, D: 0.35 },   // raw waste oil
  cao: { ffa: 0.5, T: 60, auto: true, L: 4.0, D: 0.4 },   // oil after acid pretreatment
};

function switchKind(kind) {
  const b = state.single;
  if (kind === b.kind) return;
  const saved = { ...(b.saved || {}), [b.kind]: Object.fromEntries(KIND_FIELDS.map((f) => [f, b[f]])) };
  setSingle({ kind, saved, ...(saved[kind] || KIND_START[kind]) });
}

/** Leaving "자동" starts from the size the automatic sizing had chosen. */
function seedSize() {
  // only a result for this very bed (fresh, no error, same catalyst) says which size "자동" had chosen
  const steady = state.results.steady;
  const u = steady?.data?.flowsheet?.units?.[0];
  if (!u || steady.error || !isFresh(steady) || u.kind !== state.single.kind) return {};
  return { L: Number(u.L.toFixed(2)), D: Number(u.D.toFixed(3)) };
}

function singleResult() {
  return resultLine(() => {
    const steady = state.results.steady;
    const u = steady?.data?.flowsheet?.units?.[0];
    if (steady?.error) return { text: "이 조건으로는 bed를 만들 수 없습니다 → 오른쪽 설명", status: "bad" };
    if (!u || !isFresh(steady)) return { text: "계산 중…" };
    const k = steady.data.profiles[0].kpis[0];
    const size = `${state.single.auto ? "자동 " : ""}D ${fmt(u.D, 2)} × L ${fmt(u.L, 2)} m · τ ${fmt(u.tau_min, 0)} min · 촉매 ${fmt(u.catalyst_kg, 0)} kg`;
    const result = u.kind === "acid" ? `산가 ${fmt(u.av_in, 2)} → ${fmt(u.av_out, 2)}` : `전환율 ${fmt(u.conversion, 2)} %`;
    return { text: `${size}\n→ ${result}`, status: k?.status };
  });
}

function refreshChanges() {
  const box = $("#changes");
  if (!box) return;
  // in 단일 bed the process feed / operation settings do not apply, so they are not listed
  const changed = changedParams().filter((p) => state.ui.mode !== "bed" || !["feed", "operation"].includes(p.section));
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
    const ids = state.spec.sections.filter((section) => state.ui.mode !== "bed" || !["feed", "operation"].includes(section.id));
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
    const hidden = changed.filter((p) => !["feed", "operation", "targets"].includes(p.section)).length;
    button.textContent = hidden ? `⚙ 모든 설정 · 바꾼 것 ${hidden}` : "⚙ 모든 설정";
  }
}

// ---------------------------------------------------------------------------------- drawer
const EXTRAS = {
  targets: () => [presetGroup(TARGET_PRESETS, { title: "빠른 설정" })],
  kinetics: () => [
    presetGroup(CAO_KINETICS_PRESETS, { title: "CaO 속도식" }),
    presetGroup(ACID_KINETICS_PRESETS, { title: "산촉매 속도식" }),
    h("p.muted.small", {}, "실험·논문 데이터가 있으면 단일 bed › 속도 피팅에서 맞춘 값을 바로 적용할 수 있습니다."),
  ],
  packing: () => [packingPreview()],
  design: () => [h("p.muted.small", {}, state.train.enabled
    ? "지금은 '직접 구성' 공정이라 이 설정은 쓰이지 않습니다 (공정 › 자동 설계로 바꾸면 적용)."
    : "자동 설계: 목표 산가·전환율에 필요한 체류시간을 구하고 여유를 곱해 bed 부피를, L/D로 지름과 길이를 정합니다.")],
  criteria: () => [h("button.link-btn", { onclick: () => { closeSettings(); setUi({ mode: "process", processView: "criteria" }); } },
    "판정 기준 화면에서 지금 값과 함께 보기 →")],
};

function packingPreview() {
  const line = h("p.widget-result");
  track(line, () => {
    const cao = state.results.steady?.data?.flowsheet?.units?.find((u) => u.kind === "cao");
    line.textContent = cao ? `지금 CaO bed: 촉매 이용률 η ${fmt(cao.checks.effectiveness, 2)} · 압력강하 ${fmt(cao.dP_kPa, 1)} kPa · 촉매 ${fmt(cao.catalyst_kg, 0)} kg` : "";
  });
  return line;
}

const CONTROL_OPTIONS = {
  t_stage1_c: { zone: { from: 30, to: 60, label: "속도식 측정 범위" }, ...TEMP_MARKS },
  t_stage2_c: TEMP_MARKS,
  cao_dp: { presets: [{ value: 0.5, label: "0.5 mm 미세" }, { value: 2.5, label: "2.5 mm 기본" }, { value: 5, label: "5 mm" }] },
  f_access: { marks: [{ at: 0.1, label: "비관" }, { at: 0.5, label: "중간" }, { at: 1.5, label: "낙관" }] },
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
  // in 단일 bed the bed's own inlet and temperature replace the process feed / operation settings
  const sections = state.spec.sections.filter((section) => state.ui.mode !== "bed" || !["feed", "operation"].includes(section.id));
  if (!sections.some((section) => section.id === drawerTab)) drawerTab = sections[0].id;
  const changed = changedParams();
  const tabs = h("div.settings-tabs", {}, sections.map((section) => {
    const count = changed.filter((p) => p.section === section.id).length;
    return h("button", { class: section.id === drawerTab && !query ? "active" : "",
      onclick: () => { drawerTab = section.id; drawSettings(); } }, [section.title, count ? h("span.section-badge", {}, String(count)) : null]);
  }));
  const search = h("input.search", { type: "search", placeholder: "설정 검색 (예: 온도, 입자, 수명)", value: query,
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
