// 단계별 (guide): five steps anyone can follow, one thing at a time.
//   1 데이터 세팅    enter the tests (입력) and check the fits and the comparison (피팅)
//   2 설계 조건      how it will be run (powder in a tank / packed column), what to remove, the conditions
//   3 흡착제 선택    the adsorbents ranked for those conditions → pick one
//   4 결과          how much adsorbent and time (tank) or how big a bed (column), and what comes out
//   5 저장          a report and a table to keep
// Every step has one line of "what to do here", the content, and ← 이전 / 다음 단계 → at the bottom.

import { h, isNum, fmt, download, today } from "../util.js";
import { state, setGuide, setBatch, setSingle, setParams, change, isFresh } from "../store.js";
import {
  numField, segmented, kpi, pct, num, placeholder, notesBox, grid, outletCharts, zTimeline, stopPlay, kindDot,
  loadingCard, errorCard, bestText, dot,
} from "./common.js";
import { columnTry, batchTry } from "./tryout.js";
import { batchSummary, columnSummary } from "./summary.js";
import { helpTip } from "./help.js";
import { inputMain, inputSidebar } from "./input.js";
import { fitMain, fitSidebar } from "./fitting.js";
import { batchMain, batchKey } from "./batch.js";
import { exportMarkdown, exportProfilesCsv, exportProject, saveReport, csvCell, triesLines } from "../exporter.js";

export const STEPS = [
  { n: 1, name: "데이터 세팅", what: "흡착제별 시험 데이터를 입력하고(1-1), 피팅 결과를 확인합니다(1-2)." },
  { n: 2, name: "설계 조건", what: "처리 방식(회분 / 컬럼), 제거 대상과 목표 제거율, 운전 조건을 정합니다." },
  { n: 3, name: "흡착제 선택", what: "2단계 조건을 가장 잘 맞추는 흡착제를 추천합니다. 하나를 고르세요." },
  { n: 4, name: "결과", what: "고른 흡착제로 필요 투입량·시간(탱크) 또는 bed 크기(컬럼)와 처리 후 조성을 봅니다." },
  { n: 5, name: "저장", what: "결과를 보고서와 표로 저장합니다." },
];

const g = () => state.guide;
const column = () => g().method === "column";
const targets = () => state.project.components.filter((c) => c.role === "remove" && (state.project.feed[c.id] || 0) > 0);
/** The adsorbent picked in step 3 (guide.ads — opening another card in step 1 does not change it). */
const chosenAds = () => state.project.adsorbents.find((a) => a.id === g().ads);

// ------------------------------------------------------------------------------------ progress
/** What each step still needs; null = done. */
export function missing(step) {
  const p = state.project;
  if (step === 1) {
    if (!p.adsorbents.length) return "흡착제를 하나 이상 넣으세요";
    const rows = state.results.compare.data?.rows || [];
    if (rows.length && rows.every((r) => r.error)) return "실험 데이터를 확인하세요 (모든 흡착제에 문제가 있음)";
    if (!Object.values(p.feed).some((v) => v > 0)) return "초기 농도 C₀를 넣으세요";
    return null;
  }
  if (step === 2) {
    if (g().sizing === "target" && !targets().length) return "제거 대상 성분을 하나 이상 지정하세요 (② '제거')";
    if (!column() && !(state.batchReq.V_L > 0)) return "처리할 가수분해액 양을 넣으세요";
    if (column() && !(state.single.flow > 0)) return "유량을 넣으세요";
    if (column() && !state.params.service_on && !(state.single.L > 0 && state.single.D > 0)) return "bed 길이와 지름을 넣으세요";
    return null;
  }
  if (step === 3) return g().chosen && chosenAds() ? null : "흡착제를 하나 고르세요";
  if (step === 4) return null;
  return null;
}

const reached = (step) => [1, 2, 3, 4, 5].filter((s) => s < step).every((s) => !missing(s));

/** The step bar in the view bar row. */
export function stepBar() {
  return h("div.step-bar", {}, STEPS.map((s) => {
    const done = s.n < g().step && !missing(s.n);
    const open = reached(s.n);
    return h("button.step", {
      class: `step${s.n === g().step ? " active" : ""}${done ? " done" : ""}`, disabled: open ? null : true,
      title: open ? s.what : `먼저 앞 단계를 마치세요: ${missing([1, 2, 3, 4].find((x) => x < s.n && missing(x)))}`,
      onclick: () => go(s.n),
    }, [h("span.step-num", {}, done ? "✓" : String(s.n)), s.name]);
  }));
}

function go(step) {
  stopPlay();
  setGuide({ step });
  window.scrollTo(0, 0);
}

function nav() {
  const step = g().step;
  const need = missing(step);
  // step 1 has two parts: 1-1 입력, then 1-2 피팅 (checked before leaving step 1)
  if (step === 1 && g().sub !== "fit") {
    return h("div.step-nav", {}, [h("span"), h("span.spacer"),
      need ? h("span.step-need", {}, need) : null,
      h("button.btn.primary", { disabled: need ? true : null, onclick: () => { setGuide({ sub: "fit" }); window.scrollTo(0, 0); } },
        "다음: 1-2 피팅 확인 →")]);
  }
  const back = step === 1 ? null : step === 2
    ? () => { setGuide({ step: 1, sub: "fit" }); window.scrollTo(0, 0); } : () => go(step - 1);
  return h("div.step-nav", {}, [
    step === 1 ? h("button.btn", { onclick: () => setGuide({ sub: "input" }) }, "← 1-1 입력")
      : h("button.btn", { onclick: back }, "← 이전"),
    h("span.spacer"),
    need && step < 5 ? h("span.step-need", {}, need) : null,
    step < 5 ? h("button.btn.primary", { disabled: need ? true : null, onclick: () => go(step + 1) },
      `다음: ${STEPS[step].name} →`) : null,
  ]);
}

const SUB_WHAT = {
  input: ["1-1 입력", "흡착제 카드를 눌러 이름·질량·시험 데이터를 입력합니다. 왼쪽에는 모든 흡착제에 공통인 초기 농도와 시험 조건을 입력합니다."],
  fit: ["1-2 피팅", "입력 데이터에 속도식과 등온식을 피팅한 결과입니다. 측정점과 피팅 곡선의 일치 여부와 ⚠ 표시를 확인하세요."],
};

function guideLine(step) {
  if (step === 1) {
    const [name, what] = SUB_WHAT[g().sub === "fit" ? "fit" : "input"];
    return h("div.step-guide", {}, [h("b", {}, `1단계 · ${name}`), h("span", {}, what)]);
  }
  return h("div.step-guide", {}, [h("b", {}, `${step}단계 · ${STEPS[step - 1].name}`), h("span", {}, STEPS[step - 1].what)]);
}

// ------------------------------------------------------------------------------------ sidebar
export function guideSidebar() {
  if (g().step === 1) return g().sub === "fit" ? fitSidebar() : inputSidebar();
  const p = state.project;
  const ads = chosenAds();
  const tg = targets();
  const line = (label, value, ok = true) => h("div.progress-line", { class: ok ? "progress-line" : "progress-line todo" }, [
    h("span.muted", {}, label), h("b", {}, value)]);
  return h("div.props", {}, [
    h("section.pgroup.feed", {}, [
      h("div.pgroup-head", {}, [h("b", {}, "지금까지")]),
      line("흡착제", `${p.adsorbents.length}개 (${p.adsorbents.map((a) => a.name).join(", ")})`),
      line("처리 방식", column() ? "컬럼 (고정층)" : "회분식 (분말 투입 · 교반 · 여과)"),
      line("제거 대상", tg.length ? tg.map((c) => `${c.name} ≥ ${c.target}%`).join(", ") : "없음", tg.length > 0),
      line("허용 당 감소율", `${state.params.keep_loss_max} % 이하`),
      g().step >= 3 ? line("고른 흡착제", ads && g().chosen ? ads.name : "아직", Boolean(ads && g().chosen)) : null,
    ]),
    h("section.pgroup.feed", {}, [
      h("div.pgroup-head", {}, [h("b", {}, "도움말")]),
      h("p.pgroup-note", {}, "위쪽 단계 번호를 눌러 언제든 앞 단계로 돌아가 바꿀 수 있습니다. 바꾸면 뒤 단계 결과는 다시 계산됩니다."),
      h("p.pgroup-note", {}, "모든 설정을 한 화면에서 보려면 오른쪽 위 '단일 bed'(고급)를 쓰세요."),
    ]),
  ]);
}

// ------------------------------------------------------------------------------------ main
export function guideMain() {
  const step = g().step;
  const body = [guideLine(step)];
  if (step === 1) body.push(g().sub === "fit" ? fitMain() : inputMain());
  else if (step === 2) body.push(stepConditions());
  else if (step === 3) body.push(stepChoose());
  else if (step === 4) body.push(stepResult());
  else body.push(stepSave());
  body.push(nav());
  return h("div.guide", {}, body);
}

// ---------------------------------------------------------------- 2 설계 조건
function card(title, note, children, tip = null) {
  return h("section.card.guide-card", {}, [h("div.card-head", {}, [h("h2", {}, title), tip ? helpTip(tip) : null,
    note ? h("span.muted", {}, note) : null]), ...children]);
}

function choice(value, current, title, text, onPick) {
  return h("button.choice", { class: `choice${value === current ? " on" : ""}`, onclick: () => onPick(value) },
    [h("b", {}, title), h("small", {}, text)]);
}

function field(label, input, unit, help = "", tip = null) {
  return h("label.gfield", { title: help }, [h("span.gfield-label", {}, [label, tip ? helpTip(tip) : null]),
    h("span.gfield-input", {}, [input, h("small.muted", {}, unit)]),
    help ? h("small.muted.gfield-help", {}, help) : null]);
}

// ② 무엇을 빼고 무엇을 남기나요 — written for someone who has never set a removal target
const SUGARS = ["glucose", "xylose"];
const ACIDS = ["levulinic", "formic", "acetic"];
const FURANS = ["hmf", "furfural"];
const COMP_NOTE = {
  glucose: "당 · 발효 기질", xylose: "당 · 발효 기질",
  hmf: "푸란류 · 강한 발효 저해물질", furfural: "푸란류 · 강한 발효 저해물질",
  levulinic: "유기산 · 고농도에서 발효 저해", formic: "유기산 · 고농도에서 발효 저해", acetic: "유기산 · 고농도에서 발효 저해",
};
const GOALS = [
  { id: "furans", title: "발효 저해물질(푸란류) 제거", text: "HMF·Furfural 90 % 이상 제거, 당 보존 · 기본 권장",
    remove: Object.fromEntries(FURANS.map((c) => [c, 90])) },
  { id: "furans-acids", title: "저해물질 + 유기산 제거", text: "푸란류 90 %, 유기산 50 % 이상 제거, 당 보존 · 흡착제 소요량 증가",
    remove: { ...Object.fromEntries(FURANS.map((c) => [c, 90])), ...Object.fromEntries(ACIDS.map((c) => [c, 50])) } },
];
const ROLE_BTN = [["remove", "제거"], ["keep", "보존"], ["any", "무관"]];
const TARGET_CHIPS = [50, 70, 90, 99];
const LOSS_CHIPS = [5, 10, 15, 20];

function applyGoal(goal) {
  change((p) => {
    for (const c of p.components) {
      if (goal.remove[c.id] !== undefined) { c.role = "remove"; c.target = goal.remove[c.id]; c.competitive = true; }
      else if (SUGARS.includes(c.id)) { c.role = "keep"; c.competitive = false; }
      else if (c.role === "remove") c.role = "any";
    }
  }, { structural: true });
}

/** The goal card that matches the current choices (null = the user's own mix). */
function currentGoal() {
  const comps = state.project.components;
  return GOALS.find((goal) => comps.every((c) => (goal.remove[c.id] !== undefined
    ? c.role === "remove" && c.target === goal.remove[c.id] : c.role !== "remove"))
    && comps.filter((c) => SUGARS.includes(c.id)).every((c) => c.role === "keep"))?.id ?? null;
}

function setRole(id, role) {
  change((p) => {
    const c = p.components.find((x) => x.id === id);
    c.role = role;
    c.competitive = role !== "keep";
    if (role === "remove" && !(c.target > 0)) c.target = 90;
  }, { structural: true });
}

/** A target from a button redraws the card; a typed one only refreshes the sentence (the caret stays put). */
function setTarget(id, v, typed = false) {
  change((p) => { p.components.find((x) => x.id === id).target = Math.min(Math.max(v ?? 90, 1), 99.9); }, { structural: !typed });
  if (typed) refreshSentence();
}

function setLoss(v, typed = false) {
  if (v === null) return;
  setParams({ keep_loss_max: Math.min(Math.max(v, 0), 100) });
  if (typed) refreshSentence(); else setGuide({});
}

function refreshSentence() {
  const node = document.querySelector(".tgt-sentence");
  const text = goalSentence(state.params.keep_loss_max);
  if (node && text) node.textContent = `→ ${text}`;
}

/** Highest equilibrium removal of a component among the tested adsorbents (at the test dose). */
function bestInTests(cid) {
  let top = null;
  for (const r of state.results.compare.data?.rows || []) {
    const x = r.error ? null : r.analysis.runs[0]?.components[cid]?.removal;
    if (isNum(x) && (!top || x > top.x)) top = { x, name: r.name };
  }
  return top;
}

const names = (list) => list.map((c) => c.name).join("·");

/** 은/는 after a name: Hangul by its final consonant; Latin letters and digits by how they are read. */
function topic(word) {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  let batchim;
  if (code >= 0 && code < 11172) batchim = code % 28 !== 0;
  else batchim = /[lmnrLMNR0136780]/.test(last);
  return `${word}${batchim ? "은" : "는"}`;
}

/** One sentence that reads the choices back. */
function goalSentence(lossMax) {
  const comps = state.project.components;
  const rm = comps.filter((c) => c.role === "remove");
  const keep = comps.filter((c) => c.role === "keep");
  const any = comps.filter((c) => c.role === "any");
  if (!rm.length) return null;
  const byTarget = {};
  for (const c of rm) (byTarget[c.target] ||= []).push(c);
  const parts = Object.entries(byTarget).sort((a, b) => b[0] - a[0]).map(([t, list]) => `${topic(names(list))} ${num(Number(t))} % 이상 제거하고`);
  return [parts.join(", "), keep.length ? ` ${topic(names(keep))} ${num(100 - lossMax)} % 이상 보존합니다.` : " 보존 성분은 지정하지 않았습니다.",
    any.length ? ` ${topic(names(any))} 판정에서 제외합니다.` : ""].join("");
}

function targetCard() {
  const P = state.params;
  const goal = currentGoal();
  const comps = state.project.components;
  const rows = comps.map((c) => {
    const best = c.role === "remove" ? bestInTests(c.id) : null;
    const roleBtns = h("div.role-btns", {}, ROLE_BTN.map(([v, label]) => h("button", {
      class: `role-btn${c.role === v ? ` on ${v}` : ""}`, onclick: () => { if (c.role !== v) setRole(c.id, v); } }, label)));
    let detail;
    if (c.role === "remove") {
      detail = h("div.tgt-detail", {}, [
        h("span.muted", {}, "목표 제거율"), helpTip("target"),
        ...TARGET_CHIPS.map((t) => h("button", { class: `tchip${c.target === t ? " on" : ""}`, onclick: () => setTarget(c.id, t) }, `${t} %`)),
        h("span.tgt-own", {}, [numField(c.target, (v) => setTarget(c.id, v, true), { width: 44, min: 1, max: 99.9, required: true, title: "직접 입력 (%)" }), "%"]),
        best ? h("small.muted.tgt-hint", { title: "기본 시험(시험 투입량)의 평형 제거율입니다. 흡착제를 더 넣거나 bed를 키우면 더 높일 수 있습니다." },
          [`시험 최대 제거율: ${best.name} ${pct(best.x, 0)} (시험 투입량 기준)`,
            c.target > best.x * 100 + 0.5 ? h("span.tgt-more", {}, " → 목표가 더 높으므로 시험보다 많은 투입량이 필요합니다") : null]) : null,
      ]);
    } else if (c.role === "keep") {
      detail = h("div.tgt-detail.muted", {}, "흡착에 의한 감소율을 아래 한도 이하로 유지합니다");
    } else {
      detail = h("div.tgt-detail.muted", {}, "제거·보존 판정에서 제외 (경쟁 흡착은 계산에 포함)");
    }
    const c0 = state.project.feed[c.id];
    const note = [COMP_NOTE[c.id], isNum(c0) ? `${num(c0)} g/L` : null].filter(Boolean).join(" · ");
    return h(`div.tgt-row.${c.role}`, {}, [
      h("div.tgt-name", {}, [dot(c.id), h("b", {}, c.name), note ? h("small.muted", {}, note) : null]),
      roleBtns,
      detail,
    ]);
  });
  const lossMax = P.keep_loss_max;
  const sentence = goalSentence(lossMax);
  return card("② 제거 대상과 보존 성분", "목표를 선택하면 아래 표가 설정됩니다 · 성분별로 변경할 수 있습니다", [
    h("div.choices", {}, [
      ...GOALS.map((x) => choice(x.id, goal, x.title, x.text, () => applyGoal(x))),
      h("div", { class: `choice static${goal === null ? " on" : ""}` }, [h("b", {}, "직접 지정"), h("small", {}, "아래 표에서 성분별로 제거·보존을 지정하세요")]),
    ]),
    h("div.tgt-table", {}, rows),
    h("div.tgt-loss", {}, [
      h("b", {}, "보존 성분(당)의 허용 감소율"), helpTip("keep_loss"),
      ...LOSS_CHIPS.map((t) => h("button", { class: `tchip${lossMax === t ? " on" : ""}`, onclick: () => setLoss(t) }, `${t} %`)),
      h("span.tgt-own", {}, [numField(lossMax, (v) => setLoss(v, true), { width: 44, min: 0, max: 100, required: true, title: "직접 입력 (%)" }), "%"]),
      h("small.muted", {}, "흡착제는 당도 일부 흡착합니다. 한도를 낮출수록 사용 가능한 흡착제와 투입량 범위가 줄어듭니다."),
    ]),
    sentence ? h("div.banner.info.tgt-sentence", {}, ["→ ", sentence])
      : h("div.banner.warn.tgt-sentence", {}, "제거 대상 성분을 하나 이상 지정하세요 ('제거' 버튼)"),
  ]);
}

/** A different method ranks the adsorbents differently: the step-3 pick is cleared. */
function pickMethod(v) {
  if (v !== g().method) setGuide({ method: v, chosen: false });
}

/** What an empty packing box means: the default of the picked adsorbent's kind (or of every kind before a pick). */
function defaultText(key) {
  const kd = state.spec.kind_defaults;
  const ads = chosenAds() || state.project.adsorbents.find((a) => a.id === state.single.ads);
  if (g().chosen && ads) return `기본 ${num(kd[ads.kind]?.[key])} (${ads.name})`;
  return `기본: 수지 ${num(kd.resin[key])} · 활성탄 ${num(kd.carbon[key])}`;
}

function stepConditions() {
  const method = g().method;
  const sizing = g().sizing;
  const b = state.batchReq;
  const P = state.params;
  const single = state.single;
  const how = card("① 어떻게 처리하나요?", "", [h("div.choices", {}, [
    choice("batch", method, "회분식 교반 (탱크)", "시험과 같은 방식 · 분말 흡착제에 적합", pickMethod),
    choice("column", method, "고정층 연속 통액 (컬럼)", "입상(bead) 흡착제의 연속 운전", pickMethod),
  ])], "method");
  const what = targetCard();
  const sizingPick = segmented(column()
    ? [["target", "목표 달성 bed 크기 산정"], ["given", "bed 크기 지정 → 성능 확인"]]
    : [["target", "목표 달성 투입량 산정"], ["given", "투입량 지정 → 성능 확인"]], sizing, (v) => setGuide({ sizing: v }));
  const sizingRow = h("div.row", {}, [sizingPick, helpTip("sizing")]);
  const serviceOn = Boolean(P.service_on);
  const conditions = column()
    ? [
      h("label.switch-line", {}, [
        h("label.switch", {}, [h("input", { type: "checkbox", checked: serviceOn || null,
          onchange: (e) => { setParams({ service_on: e.target.checked ? 1 : 0 }); setGuide({}); } }), h("span.track")]),
        h("b", {}, "교체 주기 지정"), helpTip("service"),
        h("small.muted", {}, serviceOn ? "교체 주기 동안 목표를 만족하는 bed를 산정합니다"
          : "끔: 지정한 bed 크기의 목표 유지 시간(운전 가능 시간)을 계산합니다"),
      ]),
      serviceOn ? sizingRow : null,
      h("div.gfields", {}, [
        field("유량", numField(single.flow, (v) => { if (v) setSingle({ flow: v }); }, { bare: true, min: 0, required: true, commit: "change" }), "L/h", "컬럼 공급 유량", "flow"),
        serviceOn ? field("교체 주기", numField(P.service_h, (v) => { if (v) setParams({ service_h: v }); }, { bare: true, min: 0, required: true, commit: "change" }), "h", "흡착제 교체(재생) 전까지 운전 시간", "service") : null,
        field("입자 지름", numField(P.d_p_mm || null, (v) => setParams({ d_p_mm: v || 0 }), { bare: true, min: 0, commit: "change", placeholder: defaultText("d_p_mm") }), "mm",
          "실험 입자보다 크면 속도를 보수적으로 낮춰 계산", "d_p"),
        field("충전 밀도", numField(P.rho_b || null, (v) => setParams({ rho_b: v || 0 }), { bare: true, min: 0, commit: "change", placeholder: defaultText("rho_b") }), "g/L", "충전층 1 L당 흡착제 질량", "rho_b"),
        ...(sizing === "given" || !serviceOn ? [
          field("bed 길이", numField(single.L, (v) => { if (v) setSingle({ L: v, auto: false }); }, { bare: true, min: 0, required: true, commit: "change" }), "m", "", "bed_size"),
          field("bed 지름", numField(single.D, (v) => { if (v) setSingle({ D: v, auto: false }); }, { bare: true, min: 0, required: true, commit: "change" }), "m", "", "bed_size"),
        ] : []),
      ]),
      h("label.check", {}, [h("input", { type: "checkbox", checked: P.judge_avg ? true : null,
        onchange: (e) => setParams({ judge_avg: e.target.checked ? 1 : 0 }) }),
      " 유출액을 저장조에 모아 쓰는 경우 (교체 주기 동안의 누적 평균 제거율로 판정)", helpTip("judge_avg")]),
    ]
    : [
      sizingRow,
      h("div.gfields", {}, [
        field("처리 부피", numField(b.V_L, (v) => { if (v) setBatch({ V_L: v }); }, { bare: true, min: 0, required: true, commit: "change" }), "L", "1 배치 처리 부피", "batch_volume"),
        field("교반 시간", numField(b.t_end, (v) => { if (v) setBatch({ t_end: v }); }, { bare: true, min: 0, required: true, commit: "change" }), "min", "결과 곡선을 그릴 시간", "mix_time"),
        ...(sizing === "given" ? [field("흡착제 투입량", numField(b.dose, (v) => { if (v) setBatch({ dose: v }); }, { bare: true, min: 0, required: true, commit: "change" }), "g/L", "가수분해액 1 L당 흡착제 투입 질량", "dose")] : []),
      ]),
    ];
  return h("div", {}, [how, what, card("③ 운전 조건", column() ? "컬럼" : "회분 (탱크)", conditions)]);
}

// keep the batch request and the single bed in step with the guide choices
export function syncGuide() {
  // older saved state: a pick without an id
  if (g().chosen && !g().ads) state.guide.ads = state.single.ads;
  // from step 3 on, every calculation is for the picked adsorbent
  if (g().step >= 3 && g().chosen && g().ads && state.single.ads !== g().ads) state.single.ads = g().ads;
  const mode = g().sizing === "target" ? "target" : "dose";
  if (state.batchReq.mode !== mode) state.batchReq.mode = mode;
  // without a service time the bed size must be given (the result is how long it lasts)
  const auto = g().sizing === "target" && Boolean(state.params.service_on);
  if (column() && state.single.auto !== auto) state.single.auto = auto;
}

// ---------------------------------------------------------------- 3 흡착제 선택
function stepChoose() {
  return column() ? chooseColumn() : chooseBatch();
}

/** "주요 흡착 성분" of an adsorbent, from the batch-test analysis. */
function caughtOf(id) {
  const row = state.results.compare.data?.rows.find((r) => r.id === id && !r.error);
  return row ? bestText(row.analysis.runs[0], 3) : "–";
}

function pickButton(id) {
  const on = g().chosen && g().ads === id;
  return h(`button.btn.small${on ? ".primary" : ""}`, { onclick: () => { state.single.ads = id; setGuide({ chosen: true, ads: id }); } },
    on ? "✓ 선택됨" : "선택");
}

/** A dose far above the tested doses is an extrapolation: tag it so it is not taken at face value. */
function extrapTag(r) {
  const ratio = isNum(r.extrap) ? r.extrap : (isNum(r.dose) && r.test_doses?.[1] ? r.dose / r.test_doses[1] : null);
  return ratio && ratio > 2 ? h("span.tag.warn", { title: `시험 투입량 ${r.test_doses?.[0] === r.test_doses?.[1] ? num(r.test_doses?.[1]) : `${num(r.test_doses?.[0])}–${num(r.test_doses?.[1])}`} g/L의 ${num(ratio)}배 — 확인 실험 권장` },
    `시험 범위 밖 ×${num(ratio)}`) : null;
}

function chooseBatch() {
  const cmp = state.results.compare;
  if (cmp.error) return notesBox("비교할 수 없습니다", [cmp.error], "error");
  if (!cmp.data) return loadingCard("흡착제를 비교하는 중…");
  const V = state.batchReq.V_L;
  const tMix = state.batchReq.t_end;
  const limit = state.params.keep_loss_max / 100;
  const keepIds = state.project.components.filter((c) => c.role === "keep").map((c) => c.id);
  const lossOk = (r) => (r.keep_loss || 0) <= limit + 1e-9;
  // suitable (target reached and sugar within the limit) → reached but sugar over → not reached (closest first)
  const group = (r) => (r.reachable ? (lossOk(r) ? 0 : 1) : 2);
  const rows = cmp.data.rows.filter((r) => !r.error).sort((a, b) => group(a) - group(b)
    || (group(a) < 2 ? (a.dose ?? 1e9) - (b.dose ?? 1e9) : (b.shortfall ?? -1) - (a.shortfall ?? -1)) || (a.keep_loss || 0) - (b.keep_loss || 0));
  const broken = cmp.data.rows.filter((r) => r.error);
  const table = h("div.table-wrap.scroll-y", {}, h("table.data.rank-table", {}, [
    h("thead", {}, h("tr", {}, ["순위", "흡착제", "주요 흡착 성분", `필요 투입량 (${num(tMix)} min 교반)`, `${num(V)} L 투입 질량`, "당 감소율", "평형 기준 투입량 (참고)", ""].map((t) => h("th", {}, t)))),
    h("tbody", {}, rows.map((r, k) => {
      const ok = r.reachable;
      const slow = !ok && r.reachable_eq;                 // enough at equilibrium, not within the 교반 시간
      const first = k === 0 && group(r) === 0;
      return h(`tr${first ? ".best-row" : ""}`, {}, [
        h("td", {}, first ? h("span.tag.ok", {}, "추천") : String(k + 1)),
        h("th", {}, [kindDot(r.kind), r.name]),
        h("td.best-cell", {}, caughtOf(r.id)),
        h("td", {}, ok ? [`${num(r.dose)} g/L `, extrapTag(r)]
          : slow ? h("span.tag.warn", { title: `${num(tMix)} min 안에는 최대 투입량(${num(cmp.data.dose_max)} g/L)으로도 목표 미달 — 교반 시간을 늘리세요` }, "교반 시간 부족")
            : h("span.tag.bad", { title: isNum(r.shortfall) ? `최대 투입량(${num(cmp.data.dose_max)} g/L)에서도 목표보다 ${pct(-r.shortfall, 0)} 부족` : "" },
              `목표 미달${isNum(r.shortfall) ? ` (−${pct(-r.shortfall, 0)})` : ""}`)),
        h("td", {}, ok ? `${num(r.dose * V)} g` : "–"),
        h("td", {}, keepIds.length ? h(`span.tag.${lossOk(r) ? "ok" : "bad"}`, { title: lossOk(r) ? "" : `한도 ${num(state.params.keep_loss_max)} % 초과` }, pct(r.keep_loss)) : "–"),
        h("td.muted", { title: "충분히 오래 교반(평형)할 때의 최소 투입량" }, isNum(r.dose_eq) ? `${num(r.dose_eq)} g/L` : "–"),
        h("td", {}, pickButton(r.id)),
      ]);
    })),
  ]));
  return h("div", {}, [
    card("목표 달성 흡착제 비교", `목표 ${targets().map((c) => `${c.name} ≥ ${c.target} %`).join(", ")} · 허용 당 감소율 ${num(state.params.keep_loss_max)} %`, [
      table,
      h("p.table-note", {}, `순위: 목표 달성 + 당 감소율 한도 이내 → 한도 초과 → 목표 미달 순, 같은 그룹은 필요 투입량이 적은 순 · `
        + `필요 투입량과 당 감소율은 2단계의 교반 시간(${num(tMix)} min) 기준으로, 4단계 결과와 같은 계산입니다 · 최대 투입량 ${num(cmp.data.dose_max)} g/L`),
    ], "rank_batch"),
    notesBox("비교에서 제외된 흡착제 (데이터 확인 필요)", broken.map((r) => `${r.name}: ${r.error}`), "warn"),
  ]);
}

function chooseColumn() {
  const slot = state.results.rank;
  if (slot.error) return notesBox("비교할 수 없습니다", [slot.error], "error");
  if (!slot.data) return loadingCard("흡착제마다 bed를 계산하는 중… (흡착제당 몇 초)");
  const limit = slot.data.keep_loss_max;
  const on = slot.data.service_on;
  const keepOk = (r) => r.keep_ok ?? (r.keep_loss <= limit + 1e-9);
  const suitable = (r) => r.suitable ?? (r.met && keepOk(r));
  const rows = slot.data.rows.filter((r) => !r.error).sort((a, b) => a.rank - b.rank);
  const broken = slot.data.rows.filter((r) => r.error);
  const head = on
    ? ["순위", "흡착제", "주요 흡착 성분", "판정", "흡착제 질량", "bed 크기 (지름 × 길이)", "당 감소율", "속도 보정", ""]
    : ["순위", "흡착제", "주요 흡착 성분", "운전 가능 시간", "흡착제 질량", "당 감소율", "속도 보정", ""];
  const status = (r) => (suitable(r) ? ["ok", "적합"] : !r.met ? ["bad", "목표 미달"]
    : !keepOk(r) ? ["bad", "당 감소율 초과"] : r.dp_ok === false ? ["bad", "압력강하 초과"] : ["ok", "적합"]);
  const table = h("div.table-wrap.scroll-y", {}, h("table.data.rank-table", {}, [
    h("thead", {}, h("tr", {}, head.map((t) => h("th", {}, t)))),
    h("tbody", {}, rows.map((r, k) => {
      const first = k === 0 && (on ? suitable(r) : keepOk(r));
      return h(`tr${first ? ".best-row" : ""}`, {}, [
        h("td", {}, first ? h("span.tag.ok", {}, "추천") : String(k + 1)),
        h("th", {}, [kindDot(r.kind), r.name]),
        h("td.best-cell", {}, caughtOf(r.id)),
        on ? h("td", {}, h(`span.tag.${status(r)[0]}`, {}, status(r)[1]))
          : h("td", {}, h("b", {}, r.run_h === null || r.run_h_beyond ? `> ${num(r.horizon_h ?? r.life_h ?? 0)} h` : `${num(r.life_h ?? r.run_h)} h`)),
        h("td", {}, `${num(r.adsorbent_kg)} kg`),
        on ? h("td", {}, `${num(r.D)} × ${num(r.L)} m`) : null,
        h("td", {}, h(`span.tag.${keepOk(r) ? "ok" : "bad"}`, {}, pct(r.keep_loss))),
        h("td", { title: "설계 입자가 시험 입자보다 크면 속도상수를 (시험/설계)²배로 낮춤 · – = 보정 없음(같거나 작음, 또는 시험 입자 크기 미입력)" },
          isNum(r.k_factor) && r.k_factor < 1 ? `× ${num(r.k_factor)}` : "–"),
        h("td", {}, pickButton(r.id)),
      ]);
    })),
  ]));
  return h("div", {}, [
    card(on ? "교체 주기 동안 목표를 만족하는 bed" : "같은 bed에서 목표 유지 시간이 가장 긴 흡착제",
      on ? `교체 주기 ${state.params.service_h} h · 유량 ${state.single.flow} L/h · 허용 당 감소율 ${num(state.params.keep_loss_max)} %`
        : `bed ${num(state.single.D)} × ${num(state.single.L)} m · 유량 ${state.single.flow} L/h`, [table,
        h("p.table-note", {}, on ? "판정: 적합 = 목표 달성 + 당 감소율 한도 이내 + 압력강하 한도 이내 · 순위는 적합 → 목표는 달성했으나 한도 초과 → 목표 미달, 같은 그룹은 흡착제 질량이 적은 순"
          : (slot.data.rank_note || "순위: 당 감소율 한도 이내에서 운전 가능 시간이 긴 순"))], "rank_column"),
    notesBox("알림", slot.data.notes || [], "info"),
    notesBox("계산할 수 없는 흡착제", broken.map((r) => `${r.name}: ${r.error}`), "warn"),
  ]);
}

// ---------------------------------------------------------------- 4 결과
function stepResult() {
  const ads = chosenAds();
  const head = h("div.subhead", {}, [h("h2", {}, ads ? ads.name : ""), h("span.muted", {}, column() ? "컬럼" : "회분식 (교반)")]);
  if (!column()) {
    const slot = state.results.batch;
    const b = slot.data;
    if (slot.error) return h("div", {}, [head, errorCard(slot.error)]);
    if (!b || b.adsorbent !== ads?.id) return h("div", {}, [head, loadingCard("결과를 계산하는 중…")]);
    const cmpRow = state.results.compare.data?.rows.find((r) => r.id === ads.id);
    return h("div", {}, [head,
      batchSummary(b, ads, cmpRow),
      batchTry({ dose: b.dose, V: b.V_L, t: state.batchReq.t_end }),
      h("details.more-tests.result-details", { open: null }, [
        h("summary", {}, g().sizing === "target" ? "목표에 맞춘 계산 결과 자세히 (자동)" : "2단계 조건의 계산 결과 자세히"), batchMain()]),
    ]);
  }
  const steady = state.results.steady;
  if (!steady?.data || steady.error) return h("div", {}, [head, steady?.error ? errorCard(steady.error) : loadingCard("bed를 계산하는 중… (몇 초)")]);
  const profile = steady.data.profiles[0];
  const summary = steady.data.summary;
  const u = steady.data.flowsheet.units[0];
  const cards = h("div.kpi-strip", {}, summary.kpis.map((k) => kpi(k.label,
    k.text ?? (isNum(k.value) ? `${fmt(k.value, k.digits ?? 2)} ${k.unit || ""}` : "–"), k.target || "",
    k.status === "info" ? "info" : k.status)));
  return h("div", {}, [
    head,
    columnSummary(steady.data, ads),
    columnTry({ L: u.L, D: u.D }),
    h("details.more-tests.result-details", {}, [
      h("summary", {}, summary.service_on && g().sizing === "target" ? `목표에 맞춘 bed 결과 자세히 (자동: ${num(u.D)} × ${num(u.L)} m)` : "2단계 크기의 결과 자세히"),
      cards,
      notesBox("확인할 점", summary.warnings, "warn"),
      grid(outletCharts(profile, summary)),
      h("details.more-tests", {}, [h("summary", {}, "bed 안 분포 보기 (시간 슬라이더)"), zTimeline(profile, summary)]),
    ]),
  ]);
}

// ---------------------------------------------------------------- 5 저장
function stepSave() {
  const ads = chosenAds();
  const bslot = state.results.batch;
  const ready = column() ? isFresh(state.results.steady) && !state.results.steady.error
    : Boolean(bslot.data && !bslot.error && bslot.key === batchKey() && bslot.data.adsorbent === g().ads);
  const batch = state.results.batch.data;
  const summary = column() ? state.results.steady.data?.summary : null;
  const facts = column() && summary ? [
    ["처리 방식", "컬럼"], ["흡착제", ads?.name], ["bed", `${num(state.results.steady.data.flowsheet.units[0].D)} × ${num(state.results.steady.data.flowsheet.units[0].L)} m`],
    ["흡착제 질량", `${num(summary.adsorbent_kg)} kg`],
    summary.service_on ? ["교체 주기", `${num(summary.service_h)} h`]
      : ["운전 가능 시간", summary.run_h === null || summary.run_h_beyond ? `> ${num(summary.horizon_h ?? summary.service_h)} h` : `${num(summary.run_h)} h`],
    ["당 감소율", pct(summary.keep_loss)],
  ] : batch ? [
    ["처리 방식", "회분식 (탱크)"], ["흡착제", ads?.name], ["투입량", `${num(batch.dose)} g/L`], ["흡착제 질량", `${num(batch.mass_g)} g (${num(batch.V_L)} L 기준)`],
    ["교반 시간", `${num(state.batchReq.t_end)} min`],
  ] : [];
  return h("div", {}, [
    card("결과 요약", "", [ready ? h("div.metric-row", {}, facts.map(([k, v]) => h("div.metric", {}, [h("span.muted", {}, k), h("b", {}, v || "–")])))
      : placeholder("4단계 결과가 계산된 뒤 저장할 수 있습니다.")]),
    card("저장", "보고서는 2단계 조건의 설계 결과 + 4단계에서 '💾 이 결과 저장'한 값들을 담습니다", [h("div.save-buttons", {}, [
      h("button.btn.primary", { disabled: ready ? null : true, onclick: () => (column() ? exportMarkdown("html") : batchReport("html")) },
        "📄 보고서 (HTML · 브라우저에서 열어 인쇄/PDF)"),
      h("button.btn", { disabled: ready ? null : true, onclick: () => (column() ? exportMarkdown("md") : batchReport("md")) }, "📝 보고서 (Markdown · 메모장/Typora)"),
      h("button.btn", { disabled: ready ? null : true, onclick: () => (column() ? exportProfilesCsv() : batchCsv()) }, "📊 시간별 표 (CSV, 엑셀에서 열기)"),
      h("button.btn", { onclick: exportProject }, "💾 프로젝트 파일 (다시 불러오기용)"),
    ])], "save"),
  ]);
}

function batchReport(format = "html") {
  const d = state.results.batch.data;
  const ads = chosenAds();
  const byIdAll = Object.fromEntries(state.project.components.map((c) => [c.id, c]));
  const comps = d.components.filter((c) => byIdAll[c]);          // a component deleted meanwhile is left out
  const at = (c) => { const i = d.components.indexOf(c); const row = d.C[i]; return row[row.length - 1]; };
  const tMix = state.batchReq.t_end;
  const role = { remove: "제거", keep: "보존", any: "무관" };
  const byId = Object.fromEntries(state.project.components.map((c) => [c.id, c]));
  const line = (cells) => `| ${cells.join(" | ")} |`;
  const out = [
    `# 흡착 처리 결과 — ${today()}`, "", `> Adsorption Studio · ${state.spec.temperature_C} °C · 모델 ${state.spec.version}`, "",
    "## 조건", "", line(["항목", "값"]), line(["---", "---"]),
    line(["처리 방식", "회분식 (분말 투입 · 교반 · 여과)"]), line(["흡착제", ads?.name || "–"]),
    line(["처리 부피", `${num(d.V_L)} L`]), line(["투입량", `${num(d.dose)} g/L`]), line(["흡착제 질량", `${num(d.mass_g)} g`]),
    line(["교반 시간", `${num(tMix)} min`]),
    line(["목표 도달 시간 (이 투입량)", isNum(d.t_target) ? `약 ${fmt(d.t_target, 0)} min` : (d.targets_met_eq === false ? "평형에서도 목표 미달" : "7일 이내 도달하지 않음")]),
    line(["평형 기준 투입량 (참고)", isNum(d.dose_eq) ? `${num(d.dose_eq)} g/L` : "–"]), line(["등온식", d.model_name]), "",
    `## 성분별 결과 (${num(tMix)} min 교반 후 / 평형)`, "",
    line(["성분", "역할", "목표", "처리 전 (g/L)", `${num(tMix)} min 후 (g/L)`, "제거율 (감소율)", "평형 (g/L)", "평형 제거율", "평형 95 % 도달 시간 (min)"]),
    line(["---", "---", "---", "---", "---", "---", "---", "---", "---"]),
    ...comps.map((c) => {
      const i = d.components.indexOf(c);
      return line([byId[c].name, role[byId[c].role], byId[c].role === "remove" ? `≥ ${byId[c].target} %` : "",
        fmt(d.C0[i], 3), fmt(at(c), 3), d.C0[i] > 0 ? `${fmt((1 - at(c) / d.C0[i]) * 100, 1)} %` : "–",
        fmt(d.Ceq[i], 3), `${fmt(d.removal[i] * 100, 1)} %`, isNum(d.t95[i]) ? fmt(d.t95[i], 0) : "7일 이상"]);
    }),
  ];
  if (d.notes?.length || d.extrapolated?.length) out.push("", "## 확인할 점", "", ...[...(d.notes || []), ...(d.extrapolated || [])].map((n) => `- ${n}`));
  out.push(...triesLines("batch"));
  saveReport(`흡착처리_결과_${today()}`, out, format);
}

function batchCsv() {
  const d = state.results.batch.data;
  const names = Object.fromEntries(state.project.components.map((c) => [c.id, c.name]));
  const head = ["t_min", ...d.components.map((c) => `${names[c] ?? c}_g/L`)].map(csvCell);
  const rows = d.t.map((t, i) => [t, ...d.components.map((_, k) => d.C[k][i])].map(csvCell).join(","));
  download(`회분_시간별_${today()}.csv`, "﻿" + [head.join(","), ...rows].join("\n"), "text/csv;charset=utf-8");
}

