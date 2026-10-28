// Application state with a tiny event bus. Parameters and view choices survive a page reload.

import { paramsKey } from "./util.js";

const PARAMS_KEY = "studio.params.v1";
const UI_KEY = "studio.ui.v2";
const TRAIN_KEY = "studio.train.v1";
const SINGLE_KEY = "studio.single.v1";

/** 단일 bed test: one reactor on its own, with its own inlet (independent of the process settings). */
export const SINGLE_DEFAULTS = {
  kind: "cao",            // "acid" | "cao"
  oil: 100,               // kg/h of oil entering the bed
  ffa: 0.5,               // wt% FFA of that oil (oil basis)
  T: 60,                  // °C
  meoh_acid: 60,          // mol MeOH / mol FFA (acid bed)
  meoh_cao: 6,            // mol MeOH / mol TG (CaO bed)
  auto: true,             // size the bed to the target instead of L, D
  target_av: 1.0,         // acid bed: outlet acid value to reach (mg KOH/g)
  target_x: 96.5,         // CaO bed: TG conversion to reach (%)
  L: 4.0, D: 0.4,         // m, used when auto is off
};

const listeners = new Map();

export const state = {
  spec: null,
  defaults: {},
  params: {},
  ui: {
    mode: "process",      // "bed" (단일 bed: one reactor on its own) | "process" (the whole train)
    bedView: "z",         // 단일 bed: "z" | "t" | "fit"
    processView: "summary", // process mode: "summary" | "beds" | "criteria" | "compare" | "optimize"
    bed: "R-201",         // process › bed별: which reactor of the train
    procBedView: "z",     // process › bed별: "z" | "t"
    soap: false,          // include saponification (CaO bed)
    auto: true,           // recompute the fast parts automatically after a change
    snap: -1,             // saponification snapshot index; -1 = last
    compare: [],          // scenario names picked for comparison
    openSections: ["feed", "operation"],
  },
  // 직접 구성 공정: the beds the user put together. Disabled = the automatic design.
  train: { enabled: false, units: [] },
  single: { ...SINGLE_DEFAULTS },
  results: { steady: {}, transient: {}, deact: {} },
};

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
}

export function emit(event, detail) {
  for (const fn of listeners.get(event) || []) fn(detail);
}

export function initState(spec) {
  state.spec = spec;
  state.defaults = Object.fromEntries(spec.parameters.map((p) => [p.name, p.default]));
  state.params = { ...state.defaults };
  try {
    const saved = JSON.parse(localStorage.getItem(PARAMS_KEY) || "{}");
    for (const [name, value] of Object.entries(saved)) {
      if (name in state.defaults && typeof value === "number") state.params[name] = value;
    }
    Object.assign(state.ui, JSON.parse(localStorage.getItem(UI_KEY) || "{}"));
    Object.assign(state.single, JSON.parse(localStorage.getItem(SINGLE_KEY) || "{}"));
    const train = JSON.parse(localStorage.getItem(TRAIN_KEY) || "null");
    if (train && Array.isArray(train.units)) state.train = { enabled: Boolean(train.enabled), units: train.units };
  } catch { /* private mode or corrupted storage: start from defaults */ }
  Object.assign(state.ui, parseHash(location.hash));
}

export const BED_VIEWS = ["z", "t", "fit"];
export const PROCESS_VIEWS = ["summary", "beds", "criteria", "compare", "optimize"];
const PROC_BED_VIEWS = ["z", "t"];

/** #bed/R-201/z or #process/compare → ui fields (unknown parts are ignored). */
export function parseHash(hash) {
  const [mode, a, b, c] = hash.replace(/^#/, "").split("/");
  if (mode === "bed") return { mode, ...(BED_VIEWS.includes(a) ? { bedView: a } : {}) };
  if (mode === "process") {
    return { mode, ...(PROCESS_VIEWS.includes(a) ? { processView: a } : {}),
      ...(a === "beds" && b ? { bed: decodeURIComponent(b) } : {}), ...(PROC_BED_VIEWS.includes(c) ? { procBedView: c } : {}) };
  }
  return {};
}

export function hashFor(ui) {
  if (ui.mode === "bed") return `#bed/${ui.bedView}`;
  return ui.processView === "beds" ? `#process/beds/${ui.bed}/${ui.procBedView}` : `#process/${ui.processView}`;
}

function persist() {
  try {
    localStorage.setItem(PARAMS_KEY, JSON.stringify(state.params));
    localStorage.setItem(UI_KEY, JSON.stringify(state.ui));
    localStorage.setItem(TRAIN_KEY, JSON.stringify(state.train));
    localStorage.setItem(SINGLE_KEY, JSON.stringify(state.single));
  } catch { /* storage full or blocked: nothing to do */ }
}

export function setParams(values, { silent = false } = {}) {
  Object.assign(state.params, values);
  persist();
  if (!silent) emit("params", values);
}

export function setUi(values, { silent = false } = {}) {
  Object.assign(state.ui, values);
  persist();
  if (!silent) emit("ui", values);
}

/** Change the user-built train; like a parameter change, it makes every result stale. */
export function setTrain(values) {
  Object.assign(state.train, values);
  persist();
  emit("params", { train: true });
}

/** Change the 단일 bed test (kind, inlet, temperature, size); like a parameter change, results go stale. */
export function setSingle(values) {
  Object.assign(state.single, values);
  persist();
  emit("params", { single: true });
}

const singleMode = () => state.ui.mode === "bed";

/** Parameters sent to the server: in 단일 bed the bed's own inlet replaces the process feed. */
export function requestParams() {
  if (!singleMode()) return state.params;
  const b = state.single;
  return { ...state.params, oil_kg_h: b.oil, ffa_wt: b.ffa, target_av: b.target_av, target_x: b.target_x };
}

/** What the server simulates: the 단일 bed as a one-bed train, the user's beds, or null (automatic design). */
export function trainPayload() {
  if (singleMode()) {
    const b = state.single;
    return { units: [{ kind: b.kind, auto: b.auto, L: b.L, D: b.D, T: b.T,
      meoh: b.kind === "acid" ? b.meoh_acid : b.meoh_cao, separator: false }] };
  }
  return state.train.enabled && state.train.units.length ? { units: state.train.units } : null;
}

export const currentKey = () => paramsKey(requestParams()) + JSON.stringify(trainPayload());

/** Parameters that differ from the defaults, in catalogue order. */
export function changedParams() {
  return state.spec.parameters.filter((p) => Math.abs(state.params[p.name] - p.default) > 1e-12);
}

/** Is a stored result computed for the current parameters? */
export const isFresh = (slot) => Boolean(slot && slot.data && slot.key === currentKey());
