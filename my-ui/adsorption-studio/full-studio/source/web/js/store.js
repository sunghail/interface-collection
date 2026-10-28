// Application state with a tiny event bus.
//   params, view choices, the train and the 단일 bed settings survive a page reload (browser storage);
//   the project (components, inlet composition, adsorbents with their batch tests) is saved on the server.

import { paramsKey, debounce, toast } from "./util.js";
import { api } from "./api.js";

const PARAMS_KEY = "ads.params.v1";
const UI_KEY = "ads.ui.v2";              // v2: opens in 단계별 (the saved v1 view was 단일 bed)
const TRAIN_KEY = "ads.train.v1";
const SINGLE_KEY = "ads.single.v1";
const GUIDE_KEY = "ads.guide.v1";

/** 단계별 guide: where the user is and what they chose. The adsorbent picked in step 3 is guide.ads — kept apart from
 *  state.single.ads, which the 1-1 cards and the 1-2 picker move freely. */
export const GUIDE_DEFAULTS = {
  step: 1,                // 1 데이터 · 2 설계 조건 · 3 흡착제 선택 · 4 결과 · 5 저장
  sub: "input",           // step 1: "input" | "fit"
  method: "batch",        // "batch" (powder in a tank) | "column"
  sizing: "target",       // "target" (find the amount / size) | "given" (amount / size given, see the result)
  chosen: false,          // an adsorbent was picked in step 3
  ads: null,              // ... and which one
};

/** 단일 bed: one column of one adsorbent, with its own flow and size (the composition is the project's). */
export const SINGLE_DEFAULTS = {
  ads: null,              // adsorbent id (also the one shown in 시험 데이터)
  flow: 10,               // L/h through this bed
  auto: true,             // size the bed to the targets instead of L, D
  L: 0.5, D: 0.1,         // m, used when auto is off
};

const listeners = new Map();

export const state = {
  spec: null,
  defaults: {},
  params: {},
  ui: {
    mode: "guide",        // "guide" (단계별) | "bed" (단일 bed, 고급) | "process" (beds in series, 고급)
    bedView: "input",     // 단일 bed: "input" | "fit" | "screen" | "batch" | "z" | "t"
    kin: "pfo",           // 피팅: rate law shown ("pfo" | "pso")
    fitRun: 0,            // 피팅: which test of the adsorbent is drawn
    processView: "summary", // 공정: "summary" | "beds" | "criteria" | "compare" | "optimize"
    bed: "B-1",           // 공정 › bed별: which bed of the train
    procBedView: "z",     // 공정 › bed별: "z" | "t"
    auto: true,           // recompute automatically after a change
    snap: -1,             // time snapshot index in the z views; -1 = last
    compare: [],          // scenario names picked for comparison
  },
  // 공정: automatic design (units = adsorbents in order, empty = the comparison's best) or the user's train
  train: { enabled: false, units: [], auto: [] },
  single: { ...SINGLE_DEFAULTS },
  guide: { ...GUIDE_DEFAULTS },
  project: null,
  projectKey: "",
  saving: "saved",        // saved | pending | error
  batchReq: { mode: "target", dose: 40, V_L: 1, t_end: 120 },
  results: { steady: {}, compare: {}, batch: {}, rank: {} },
};

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
}

export function emit(event, detail) {
  for (const fn of listeners.get(event) || []) fn(detail);
}

export function initState(spec, project) {
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
    Object.assign(state.guide, JSON.parse(localStorage.getItem(GUIDE_KEY) || "{}"));
    Object.assign(state.batchReq, JSON.parse(localStorage.getItem(`${GUIDE_KEY}.batch`) || "{}"));
    const train = JSON.parse(localStorage.getItem(TRAIN_KEY) || "null");
    if (train && Array.isArray(train.units)) {
      state.train = { enabled: Boolean(train.enabled), units: train.units, auto: Array.isArray(train.auto) ? train.auto : [] };
    }
  } catch { /* private mode or corrupted storage: start from defaults */ }
  Object.assign(state.ui, parseHash(location.hash));
  if (state.ui.mode === "process") state.ui.mode = "guide";       // 공정 is set aside for now
  setProject(project);
}

export const BED_VIEWS = ["input", "fit", "screen", "batch", "z", "t"];
export const TEST_VIEWS = ["input", "fit", "screen", "batch"];
export const PROCESS_VIEWS = ["summary", "beds", "criteria", "compare", "optimize"];
const PROC_BED_VIEWS = ["z", "t"];

/** #guide, #bed/z or #process/beds/B-1/t → ui fields (unknown parts are ignored). */
export function parseHash(hash) {
  const [mode, a, b, c] = hash.replace(/^#/, "").split("/");
  if (mode === "guide") return { mode };
  if (mode === "bed") return { mode, ...(BED_VIEWS.includes(a) ? { bedView: a } : {}) };
  if (mode === "process") {
    return { mode, ...(PROCESS_VIEWS.includes(a) ? { processView: a } : {}),
      ...(a === "beds" && b ? { bed: decodeURIComponent(b) } : {}), ...(PROC_BED_VIEWS.includes(c) ? { procBedView: c } : {}) };
  }
  return {};
}

export function hashFor(ui) {
  if (ui.mode === "guide") return "#guide";
  if (ui.mode === "bed") return `#bed/${ui.bedView}`;
  return ui.processView === "beds" ? `#process/beds/${ui.bed}/${ui.procBedView}` : `#process/${ui.processView}`;
}

function persist() {
  try {
    localStorage.setItem(PARAMS_KEY, JSON.stringify(state.params));
    localStorage.setItem(UI_KEY, JSON.stringify(state.ui));
    localStorage.setItem(TRAIN_KEY, JSON.stringify(state.train));
    localStorage.setItem(SINGLE_KEY, JSON.stringify(state.single));
    localStorage.setItem(GUIDE_KEY, JSON.stringify(state.guide));
    localStorage.setItem(`${GUIDE_KEY}.batch`, JSON.stringify(state.batchReq));
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

/** Change the 공정 train (auto list or the user's beds); like a parameter change, results go stale. */
export function setTrain(values) {
  Object.assign(state.train, values);
  persist();
  emit("params", { train: true });
}

/** Move through the guide or change its choices (the page redraws; results follow the conditions). */
export function setGuide(values) {
  Object.assign(state.guide, values);
  persist();
  emit("params", { guide: true });
}

/** Change the batch conditions (tank volume, time, dose); saved like the other choices. */
export function setBatch(values) {
  Object.assign(state.batchReq, values);
  persist();
  emit("params", { batch: true });
}

/** Change the 단일 bed (adsorbent, flow, size); like a parameter change, results go stale. */
export function setSingle(values) {
  Object.assign(state.single, values);
  persist();
  emit("params", { single: true });
}

// ------------------------------------------------------------------------------------ project
function hashText(text) {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h1 ^= text.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(36) + text.length.toString(36);
}

function setProject(project) {
  state.project = project;
  state.projectKey = hashText(JSON.stringify(project));
  const ids = project.adsorbents.map((a) => a.id);
  if (!ids.includes(state.single.ads)) state.single.ads = ids[0] ?? null;
  if (state.guide.ads && !ids.includes(state.guide.ads)) Object.assign(state.guide, { ads: null, chosen: false });
  state.train.units = state.train.units.filter((u) => ids.includes(u.ads));
  state.train.auto = state.train.auto.filter((id) => ids.includes(id));
}

// saves run one after another (never overlapping, so the server keeps the newest); only the last one decides the status
let saveChain = Promise.resolve();
let saveSeq = 0;

async function saveNow() {
  const mine = ++saveSeq;
  const key = state.projectKey;
  try {
    const { project, notes } = await api.saveProject(state.project);
    if (key === state.projectKey) {
      // the server may have tidied numbers (sorted times, clamped values): show what is stored and recompute
      if (hashText(JSON.stringify(project)) !== key) {
        setProject(project);
        emit("project", { structural: true });
      }
      if (mine === saveSeq) state.saving = "saved";
    }
    if (notes?.length) toast(`저장하면서 조정한 값: ${notes.join(" · ")}`, "warn");
  } catch (error) {
    if (mine === saveSeq) {
      state.saving = "error";
      state.saveError = error.message;
    }
  }
  emit("saved");
}

const save = debounce(() => { saveChain = saveChain.then(saveNow); }, 600);

/** Save at once, synchronously (the window is closing; an async request would be cut off). */
export function flushSave() {
  if (state.saving !== "pending") return;
  try {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/project", false);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify({ project: state.project }));
    if (xhr.status === 200) state.saving = "saved";
  } catch { /* nothing more can be done while closing */ }
}
window.__flushSave = flushSave;
addEventListener("pagehide", flushSave);

/** Apply a change to the project. structural = the page must be redrawn (not just a number edited). */
export function change(mutator, { structural = false } = {}) {
  mutator(state.project);
  setProject(state.project);
  state.saving = "pending";
  emit("saved");
  save();
  emit("project", { structural });
}

export function replaceProject(project) {
  setProject(project);
  persist();
  emit("project", { structural: true });
}

export const adsorbent = (id) => state.project.adsorbents.find((a) => a.id === id);

export function newId(prefix, taken) {
  let n = 1;
  while (taken.includes(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

// ------------------------------------------------------------------------------------ requests
// the guide designs one bed of the chosen adsorbent, like 단일 bed
const singleMode = () => state.ui.mode === "bed" || state.ui.mode === "guide";

/** Parameters sent to the server: in 단일 bed the bed's own flow replaces the process flow. */
export function requestParams() {
  if (!singleMode()) return state.params;
  return { ...state.params, flow_l_h: state.single.flow };
}

/** What the server designs: the 단일 bed as a one-bed train, the user's beds, the chosen auto list, or null. */
export function trainPayload() {
  if (singleMode()) {
    const b = state.single;
    if (!b.ads) return null;
    return { mode: "custom", units: [{ ads: b.ads, auto: b.auto, L: b.L, D: b.D }] };
  }
  if (state.train.enabled && state.train.units.length) return { mode: "custom", units: state.train.units };
  if (state.train.auto.length) return { mode: "auto", units: state.train.auto.map((ads) => ({ ads, auto: true })) };
  return null;
}

export const currentKey = () => paramsKey(requestParams()) + JSON.stringify(trainPayload()) + state.projectKey;

/** Parameters that differ from the defaults, in catalogue order. */
export function changedParams() {
  return state.spec.parameters.filter((p) => Math.abs(state.params[p.name] - p.default) > 1e-12);
}

/** Is a stored result computed for the current parameters, train and project? */
export const isFresh = (slot) => Boolean(slot && slot.data && slot.key === currentKey());
