// 공정 › 최적화
//   최적 조건 찾기   pick an objective, the variables it may change (with ranges) and the extra
//                   constraints; the server searches for the best automatic design meeting all targets
//   한 변수씩 바꿔 보기  sweep one variable and watch adsorbent use, pressure drop, sugar loss, … respond

import { mount, h, fmt, fmtSmart, toast, isNum } from "../util.js";
import { state, setParams, setUi, setTrain, emit, currentKey } from "../store.js";

/** The optimiser always works on the automatic design (the chosen adsorbents, or the comparison's best). */
const autoTrain = () => (state.train.auto.length ? { mode: "auto", units: state.train.auto.map((ads) => ({ ads, auto: true })) } : null);
import { api } from "../api.js";
import { createChart } from "../chart.js";
import { saveScenario } from "../scenarios.js";
import { grid, loadingCard } from "./common.js";

const STORE_KEY = "studio.optimize.v1";
const SWEEP_EXTRA = {                      // other conditions worth sweeping, with sensible default ranges
  flow_l_h: [20, 500], k_scale: [0.3, 3],
};
const SWEEP_CHARTS = ["usage", "adsorbent", "dp_max", "keep_loss", "margin", "pe_min"];

const local = {
  tab: "optimize", setup: null, running: false, progress: null, jobId: null, result: null, resultKey: null, error: "",
  scatter: null, sweep: null, sweepResult: null, sweepKey: null, sweepBusy: false, sweepError: "",
};
let root = null;

const spec = () => state.spec.optimize;
const paramSpec = (name) => state.spec.parameters.find((p) => p.name === name);
const visible = () => state.ui.mode === "process" && state.ui.processView === "optimize";
const draw = () => { if (visible() && root) renderOptimize(root); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function defaultSetup() {
  const s = spec();
  return {
    objective: "usage",
    variables: Object.fromEntries(s.variables.map((v) => [v.name, { on: v.selected, lo: v.lo, hi: v.hi }])),
    // optional limits start from the matching 판정 기준 setting (η 최소, Mears 최대)
    constraints: Object.fromEntries(s.constraints.filter((c) => c.optional)
      .map((c) => [c.key, { on: false, value: state.params[c.param] ?? c.default }])),
    budget: 40,
  };
}

function loadSetup() {
  const base = defaultSetup();
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (saved) {
      base.objective = spec().objectives.some((o) => o.key === saved.objective) ? saved.objective : base.objective;
      for (const name of Object.keys(base.variables)) Object.assign(base.variables[name], saved.variables?.[name] || {});
      for (const key of Object.keys(base.constraints)) Object.assign(base.constraints[key], saved.constraints?.[key] || {});
      if (isNum(saved.budget)) base.budget = saved.budget;
      if (saved.sweep) local.sweep = saved.sweep;
    }
  } catch { /* storage blocked or corrupted: defaults */ }
  return base;
}

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...local.setup, sweep: local.sweep })); } catch { /* ignore */ }
}

export function renderOptimize(target) {
  root = target;
  local.setup ||= loadSetup();
  local.sweep ||= { variable: "service_h", lo: 6, hi: 72, n: 9 };
  const tabs = h("div.segmented", {}, [["optimize", "최적 조건 찾기"], ["sweep", "한 변수씩 바꿔 보기"]].map(([value, text]) =>
    h("button", { class: local.tab === value ? "active" : "", onclick: () => { local.tab = value; draw(); } }, text)));
  mount(root,
    h("div.subhead", {}, [
      h("h2", {}, local.tab === "optimize" ? "최적 조건 찾기" : "한 변수씩 바꿔 보기"),
      h("span.muted", {}, local.tab === "optimize"
        ? "목표를 하나 고르면, 모든 설계 목표를 지키면서 그 값이 가장 좋은 운전 조건을 찾습니다"
        : "나머지 조건은 그대로 두고 한 변수만 바꿀 때 설계가 어떻게 달라지는지 봅니다"),
      h("span.spacer"), tabs,
    ]),
    local.tab === "optimize" ? h("div", {}, [setupCard(), resultPane()]) : sweepPane(),
  );
}

// ---------------------------------------------------------------------------------- setup
// One card: goal (dropdown) · what may change (chips) · what must hold (one line) · run.
// Ranges, extra limits and the evaluation budget stay folded in "세부 설정".
let detailsOpen = false;

function setupCard() {
  const s = spec(), setup = local.setup, lock = local.running || null;
  const save = (fn) => (e) => { fn(e); persist(); };
  const number = (value, onchange, attrs = {}) => h("input.num.small-num", { type: "number", value, disabled: lock, ...attrs,
    onchange: save((e) => onchange(Number(e.target.value))) });
  const objective = s.objectives.find((o) => o.key === setup.objective) || s.objectives[0];

  const goal = h("select.opt-select", { disabled: lock, title: objective.help,
    onchange: save((e) => { setup.objective = e.target.value; draw(); }) },
  s.objectives.map((o) => h("option", { value: o.key, selected: o.key === setup.objective || null, title: o.help }, o.label)));

  const variableChips = s.variables.map((v) => {
    const pick = setup.variables[v.name];
    return h("button.opt-chip", { type: "button", class: pick.on ? "opt-chip on" : "opt-chip", disabled: lock,
      title: `${v.note} · 범위 ${fmtSmart(pick.lo)}–${fmtSmart(pick.hi)} ${v.unit} (세부 설정에서 바꿈)`,
      onclick: save(() => { pick.on = !pick.on; draw(); }) }, [
      h("span.opt-check", {}, pick.on ? "✓" : "+"), v.label,
      pick.on ? h("small", {}, `${fmtSmart(pick.lo)}–${fmtSmart(pick.hi)}${v.unit === "개" ? "" : " " + v.unit}`) : null,
    ]);
  });

  const params = state.params;
  const extras = s.constraints.filter((c) => c.optional);
  const holds = [
    "모든 제거 목표", `당 감소율 ≤ ${fmtSmart(params.keep_loss_max)} %`, `ΔP ≤ ${fmtSmart(params.dp_limit_bar * 100)} kPa`,
    ...extras.filter((c) => setup.constraints[c.key].on).map((c) => `${c.label} ${fmtSmart(setup.constraints[c.key].value)}`),
  ];

  const chosen = s.variables.filter((v) => setup.variables[v.name].on);
  const details = h("details.opt-details", { open: detailsOpen || null,
    ontoggle: (e) => { detailsOpen = e.target.open; } }, [
    h("summary", {}, "세부 설정 · 변수 범위, 추가 제약, 계산 횟수"),
    h("div.opt-details-body", {}, [
      h("div", {}, [h("b.small", {}, "변수 범위"),
        chosen.length ? h("div.range-list", {}, chosen.map((v) => {
          const pick = setup.variables[v.name];
          return h("label.range-row", { title: v.note }, [h("span", {}, v.label),
            number(pick.lo, (x) => { pick.lo = x; draw(); }, { step: v.step, min: v.min, max: v.max, "aria-label": `${v.label} 최소` }),
            h("span.muted", {}, "~"),
            number(pick.hi, (x) => { pick.hi = x; draw(); }, { step: v.step, min: v.min, max: v.max, "aria-label": `${v.label} 최대` }),
            h("small.muted", {}, v.unit)]);
        })) : h("p.muted.small", {}, "위에서 바꿀 변수를 고르세요")]),
      h("div", {}, [h("b.small", {}, "추가 제약"), h("div.range-list", {}, extras.map((c) => {
        const pick = setup.constraints[c.key];
        return h("label.range-row", {}, [
          h("input", { type: "checkbox", checked: pick.on || null, disabled: lock, onchange: save((e) => { pick.on = e.target.checked; draw(); }) }),
          h("span", {}, c.label), number(pick.value, (x) => { pick.value = x; draw(); }, { step: "any" })]);
      }))]),
      h("div", {}, [h("b.small", {}, "계산 횟수"), h("label.range-row", {}, [
        number(setup.budget, (x) => { setup.budget = x; draw(); }, { min: 10, max: s.max_budget, step: 10 }),
        h("small.muted", {}, `회 · 약 ${fmt(setup.budget * 2, 0)}초 (설계 한 번 1–3초)`)])]),
      h("p.muted.small", {}, "유량은 변수에 없습니다: 처리해야 할 양이라 정해진 값으로 봅니다 ('한 변수씩 바꿔 보기'에서는 볼 수 있음)."),
    ]),
  ]);

  return h("section.card.opt-setup", {}, [
    h("div.opt-lines", {}, [
      h("div.opt-line", {}, [h("span.opt-key", {}, "목표"), goal, h("small.muted", {}, objective.help)]),
      h("div.opt-line", {}, [h("span.opt-key", {}, "바꿀 것"), h("div.opt-chips", {}, variableChips)]),
      h("div.opt-line", {}, [h("span.opt-key", {}, "지킬 것"), h("span.opt-holds", { title: "제거 목표 = 성분 표, 당 감소율·ΔP = 판정 기준" }, holds.join(" · "))]),
    ]),
    h("div.opt-go", {}, [
      local.running
        ? h("button.btn", { onclick: cancel }, "중단")
        : h("button.btn.primary.opt-run-btn", { onclick: run, disabled: chosen.length ? null : true }, "최적화 실행"),
      local.running ? progressBar() : h("small.muted", {}, chosen.length ? `변수 ${chosen.length}개 · 계산 ${setup.budget}회` : "바꿀 것을 하나 이상 고르세요"),
    ]),
    details,
  ]);
}

function progressBar() {
  const p = local.progress || { done: 0, total: local.setup.budget };
  const pct = Math.min(100, (p.done / Math.max(p.total, 1)) * 100);
  const meta = objectiveMeta();
  const best = p.best?.feasible && isNum(p.best.objective) ? ` · 지금까지 최고 ${fmt(p.best.objective, meta.digits)} ${meta.unit}` : "";
  return h("div.progress", {}, [
    h("div.progress-bar", {}, h("span", { style: { width: `${pct}%` } })),
    h("small.muted", {}, `${p.done} / ${p.total} 설계 계산${best}`),
  ]);
}

function objectiveMeta() {
  const o = spec().objectives.find((x) => x.key === local.setup.objective);
  return { ...o, ...spec().metrics[o.metric] };
}

async function run() {
  const setup = local.setup;
  const payload = {
    objective: setup.objective, budget: setup.budget,
    variables: Object.entries(setup.variables).filter(([, v]) => v.on).map(([name, v]) => ({ name, lo: v.lo, hi: v.hi })),
    constraints: setup.constraints,
  };
  Object.assign(local, { running: true, error: "", progress: { done: 0, total: setup.budget } });
  const key = currentKey();
  draw();
  try {
    let status = await api.optimize({ ...state.params }, payload, autoTrain(), state.project);
    local.jobId = status.id;
    while (status.status === "running") {
      local.progress = status;
      const bar = root?.querySelector(".progress");
      if (bar && visible()) bar.replaceWith(progressBar());
      await sleep(400);
      status = await api.optimizeStatus(status.id);
    }
    if (status.status !== "done") throw new Error(status.error || "최적화 작업을 찾을 수 없습니다");
    Object.assign(local, { result: status.result, resultKey: key, scatter: null });
    if (status.result.stopped === "cancelled") toast("중단했습니다 — 그때까지의 최고 결과입니다", "warn");
  } catch (error) {
    local.error = error.message;
  } finally {
    local.running = false;
    draw();
  }
}

function cancel() {
  if (local.jobId) api.optimizeCancel(local.jobId).catch(() => {});
}

// ---------------------------------------------------------------------------------- result
function resultPane() {
  if (local.error) {
    return h("section.card", {}, h("div.placeholder.error", {}, [h("b", {}, "최적화하지 못했습니다"), h("div.muted", {}, local.error)]));
  }
  const r = local.result;
  if (!r) {
    return local.running ? loadingCard("최적 조건을 찾는 중…")
      : h("p.muted.opt-empty", {}, "위에서 목표와 바꿀 것을 고르고 '최적화 실행'을 누르세요. 계산마다 bed를 제거 목표에 맞춰 자동 설계하고, 그중 가장 좋은 조건을 고릅니다.");
  }
  const meta = { ...r.objective, digits: r.metrics[r.objective.metric].digits };
  const stale = local.resultKey !== currentKey();
  const best = r.best, base = r.baseline;
  const good = r.improvement_pct !== null && r.improvement_pct > 0.05;

  const apply = () => {
    setParams({ ...best.x });
    if (state.train.enabled) setTrain({ enabled: false });
    local.resultKey = currentKey();          // the conditions now on the left are this result's own
    emit("params-external");
    toast("최적 조건을 적용했습니다", "ok");
    setUi({ processView: "summary" });
  };
  const save = () => {
    const name = `최적화 · ${r.objective.metric_label} ${fmt(best.objective, meta.digits)} ${meta.unit}`;
    if (saveScenario(name, { ...state.params, ...best.x }, autoTrain())) toast(`'${name}' 저장 — 시나리오 비교에서 볼 수 있습니다`, "ok");
  };

  const headline = h("div.opt-headline", {}, [
    h("div", {}, [
      h("small.muted", {}, `${r.objective.metric_label} · 설계 ${r.evaluations}회 · ${fmt(r.seconds, 1)}초${r.stopped === "cancelled" ? " · 중단됨" : ""}`),
      h("div.opt-big", {}, [
        base?.feasible ? h("span.muted", {}, `${fmt(base.objective, meta.digits)} → `) : null,
        best?.feasible ? h("b", {}, `${fmt(best.objective, meta.digits)}`) : h("b.bad-text", {}, "해 없음"),
        h("small", {}, ` ${meta.unit}`),
        r.improvement_pct !== null ? h("span.delta", { class: good ? "delta good" : "delta" },
          `${r.improvement_pct > 0 ? "−" : "+"}${fmt(Math.abs(r.improvement_pct), 1)} %`) : null,
      ]),
    ]),
    h("span.spacer"),
    best?.feasible ? h("button.btn", { onclick: save }, "시나리오로 저장") : null,
    best?.feasible ? h("button.btn.primary", { onclick: apply }, "최적 조건 적용") : null,
  ]);

  // one table: what changes (the variables), then what it does to the numbers that matter
  const limitOf = Object.fromEntries(r.constraints.map((c) => [c.metric, c]));
  const shown = [r.objective.metric, ...["margin", "keep_loss", "dp_max", "adsorbent", "usage"]
    .filter((k) => k !== r.objective.metric)].slice(0, 5);
  const rows = [
    ...r.variables.map((v) => h("tr", {}, [
      h("th", { title: v.note }, v.label),
      h("td", {}, fmtValue(v.baseline, v)),
      h("td", {}, [h("b", {}, fmtValue(v.best, v)),
        v.at_bound ? h("span.bound", { title: `범위 끝 — ${v.note}` }, v.at_bound === "hi" ? "상한" : "하한") : null]),
      h("td.muted", {}, `범위 ${fmtSmart(v.lo)}–${fmtSmart(v.hi)}`),
    ])),
    h("tr.opt-sep", {}, h("td", { colspan: 4 })),
    ...shown.map((key) => {
      const m = r.metrics[key];
      const a = base?.metrics?.[key], b = best?.metrics?.[key];
      const c = limitOf[key];
      const limit = c ? `${c.op === ">=" ? "≥" : "≤"} ${fmtSmart(c.value)}` : "";
      return h("tr", { class: key === r.objective.metric ? "objective-row" : "" }, [
        h("th", {}, m.metric_label),
        h("td", {}, isNum(a) ? `${fmt(a, m.digits)} ${m.unit}` : "–"),
        h("td", {}, h("b", {}, isNum(b) ? `${fmt(b, m.digits)} ${m.unit}` : "–")),
        h("td.muted", {}, c ? [limit, c.active ? h("span.bound", { title: "이 제약에 딱 맞게 걸려 최적을 정했습니다" }, "한계") : " ✓"]
          : key === r.objective.metric ? "목표" : ""),
      ]);
    }),
  ];

  return h("div.opt-result", {}, [
    state.train.enabled ? h("div.banner.info", {}, "최적화는 자동 설계 기준입니다. 적용하면 공정이 '자동 설계'로 돌아갑니다.") : null,
    stale ? h("div.banner.warn", {}, "왼쪽 설정이 바뀌었습니다. 이 결과는 이전 설정에서 찾은 것입니다.") : null,
    h("section.card", {}, [
      headline,
      h("div.table-wrap", {}, h("table.data.compact.opt-table", {}, [
        h("thead", {}, h("tr", {}, ["", "현재", "최적", ""].map((t) => h("th", {}, t)))),
        h("tbody", {}, rows),
      ])),
      r.notes.length ? h("ul.notes-list.opt-notes", {}, r.notes.map((n) => h("li", {}, n))) : null,
    ]),
    h("details.opt-history", {}, [
      h("summary", {}, "탐색 과정 보기 · 어떤 설계를 계산했고 어떻게 좁혀 갔는지"),
      resultCharts(r, meta),
    ]),
  ]);
}

const fmtValue = (x, v) => (isNum(x) ? `${v.integer ? x : fmtSmart(x, 4)} ${v.unit}` : "–");

function resultCharts(r, meta) {
  const feasible = r.history.filter((e) => e.feasible);
  const infeasible = r.history.filter((e) => !e.feasible && e.metrics);
  const yLabel = `${r.objective.metric_label}${meta.unit ? ` (${meta.unit})` : ""}`;
  const convergence = createChart({
    title: "탐색 과정", caption: "점: 계산한 설계 (회색 = 제약 위반) · 선: 그때까지의 최고값",
    xLabel: "계산 순서", yLabel, xDigits: 3,
    series: [
      { name: "제약 만족", color: "#2563eb", x: feasible.map((e) => e.i + 1), y: feasible.map((e) => e.objective), mode: "markers" },
      { name: "제약 위반", color: "#b8bec9", x: infeasible.map((e) => e.i + 1), y: infeasible.map((e) => e.objective), mode: "markers" },
      { name: "최고값", color: "#16a34a", x: r.best_curve.map((_, i) => i + 1), y: r.best_curve, width: 2.5 },
    ],
  });
  const name = local.scatter && r.variables.some((v) => v.name === local.scatter) ? local.scatter : r.variables[0].name;
  const v = r.variables.find((x) => x.name === name);
  const scatter = createChart({
    title: `${v.label}에 따른 목표값`, caption: "다른 변수는 제각각인 설계들이라 흩어져 보입니다 · 빨간 점: 최적",
    xLabel: `${v.label}${v.unit ? ` (${v.unit})` : ""}`, yLabel,
    series: [
      { name: "제약 만족", color: "#2563eb", x: feasible.map((e) => e.x[name]), y: feasible.map((e) => e.objective), mode: "markers" },
      { name: "제약 위반", color: "#b8bec9", x: infeasible.map((e) => e.x[name]), y: infeasible.map((e) => e.objective), mode: "markers" },
      ...(r.best?.feasible ? [{ name: "최적", color: "#dc2626", x: [r.best.x[name]], y: [r.best.objective], mode: "markers" }] : []),
    ],
  });
  const picker = r.variables.length > 1 ? h("label.inline-select", {}, ["가로축 ", h("select", {
    onchange: (e) => { local.scatter = e.target.value; draw(); },
  }, r.variables.map((x) => h("option", { value: x.name, selected: x.name === name || null }, x.label)))]) : null;
  return h("div.opt-history-body", {}, [picker, grid([convergence, scatter])]);
}

// ---------------------------------------------------------------------------------- sweep
function sweepOptions() {
  const fromOptimizer = spec().variables.map((v) => ({ name: v.name, label: v.label, unit: v.unit, lo: v.lo, hi: v.hi, integer: v.integer, note: v.note }));
  const extra = Object.entries(SWEEP_EXTRA).map(([name, [lo, hi]]) => {
    const p = paramSpec(name);
    return { name, label: p.label, unit: p.unit, lo, hi, integer: Boolean(p.integer), note: "" };
  });
  return [...fromOptimizer, ...extra];
}

function sweepPane() {
  const options = sweepOptions();
  const sw = local.sweep;
  const current = options.find((o) => o.name === sw.variable) || options[0];
  const set = (fn) => (e) => { fn(e); persist(); };
  const controls = h("section.card.sweep-controls", {}, [
    h("label", {}, ["변수 ", h("select", {
      onchange: set((e) => { const o = options.find((x) => x.name === e.target.value); Object.assign(sw, { variable: o.name, lo: o.lo, hi: o.hi }); draw(); }),
    }, options.map((o) => h("option", { value: o.name, selected: o.name === current.name || null }, o.label)))]),
    h("label", {}, ["범위 ", h("input.num.small-num", { type: "number", value: sw.lo, step: "any", onchange: set((e) => { sw.lo = Number(e.target.value); }) }),
      " ~ ", h("input.num.small-num", { type: "number", value: sw.hi, step: "any", onchange: set((e) => { sw.hi = Number(e.target.value); }) }),
      h("span.unit-text", {}, current.unit)]),
    h("label", {}, ["점 ", h("input.num.small-num", { type: "number", value: sw.n, min: 3, max: 41, onchange: set((e) => {
      const n = Math.round(Number(e.target.value));
      sw.n = Number.isFinite(n) ? Math.min(Math.max(n, 3), 41) : 15;
      if (sw.n !== Number(e.target.value)) { toast("점 개수는 3–41개의 정수입니다", "warn"); e.target.value = sw.n; }
    }) }), "개"]),
    h("button.btn.primary.small", { onclick: runSweep, disabled: local.sweepBusy || null }, local.sweepBusy ? "계산 중…" : "계산"),
    h("small.muted", {}, `지금 값 ${fmtSmart(state.params[current.name])} ${current.unit}${current.note ? " · " + current.note : ""}`),
  ]);
  return h("div", {}, [controls, sweepResult()]);
}

async function runSweep() {
  const sw = local.sweep;
  Object.assign(local, { sweepBusy: true, sweepError: "" });
  const key = currentKey();
  draw();
  try {
    local.sweepResult = await api.sweep({ ...state.params }, sw.variable, sw.lo, sw.hi, sw.n, autoTrain(), state.project);
    local.sweepKey = key;
  } catch (error) {
    local.sweepError = error.message;
  } finally {
    local.sweepBusy = false;
    draw();
  }
}

function sweepResult() {
  if (local.sweepBusy) return loadingCard("설계를 차례로 계산하는 중…");
  if (local.sweepError) return h("div.placeholder.error", {}, [h("b", {}, "계산하지 못했습니다"), h("div.muted", {}, local.sweepError)]);
  const r = local.sweepResult;
  if (!r) return h("section.card.empty-state", {}, [h("h2", {}, "변수를 고르고 '계산'을 누르세요"),
    h("p.muted", {}, "점마다 bed를 제거 목표에 맞춰 다시 설계합니다 (점 하나 ≈ 1–3초). 어느 변수가 흡착제 질량·압력강하·당 감소율에 크게 듣는지 한눈에 보입니다.")]);
  const v = r.variable;
  const params = state.params;
  const limits = { keep_loss: [{ y: params.keep_loss_max, label: `한도 ${params.keep_loss_max}%` }],
    margin: [{ y: 0, label: "목표 경계" }], dp_max: [{ y: params.dp_limit_bar * 100, label: "허용" }],
    pe_min: [{ y: params.pe_min, label: "최소" }] };
  const xLabel = `${v.label}${v.unit && v.unit !== "-" ? ` (${v.unit})` : ""}`;
  const charts = SWEEP_CHARTS.map((key) => {
    const m = r.metrics[key];
    return createChart({
      title: m.metric_label, xLabel, yLabel: `${m.metric_label}${m.unit ? ` (${m.unit})` : ""}`,
      yMin: key === "margin" ? undefined : 0, height: 200,
      series: [{ name: m.metric_label, color: "#2563eb", x: r.x, y: r.series[key] },
        { name: "계산점", color: "#2563eb", x: r.x, y: r.series[key], mode: "markers" }],
      hlines: limits[key] || [],
      vlines: isNum(r.current) ? [{ x: r.current, label: "현재" }] : [],
    });
  });
  const failed = r.x.map((x, i) => [x, r.errors[i]]).filter(([, e]) => e);
  return h("div", {}, [
    local.sweepKey !== currentKey() ? h("div.banner.warn", {}, "왼쪽 조건이 바뀌었습니다. 이 결과는 이전 조건 기준입니다.") : null,
    failed.length ? h("div.notes-strip", {}, [h("b", {}, "설계 불가"),
      h("ul", {}, failed.map(([x, e]) => h("li", {}, `${fmtSmart(x)} ${v.unit}: ${e}`)))]) : null,
    grid(charts, "three"),
  ]);
}
