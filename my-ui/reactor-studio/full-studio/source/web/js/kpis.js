// KPI strip: the numbers that decide whether the design works, each checked against its target.
// 공정 mode shows the whole-process checks; 단일 bed mode shows the chosen reactor's own numbers.

import { h, fmt, isNum } from "./util.js";
import { state, isFresh, emit, setUi } from "./store.js";
import { currentBed, soapBedId } from "./views/common.js";

const ICON = { ok: "✓", warn: "!", bad: "✕", info: "" };
const STATUS_TEXT = { ok: "충족", warn: "주의", bad: "미달" };

export function renderKpis(root) {
  const steady = state.results.steady;
  if (!steady?.data) {
    root.replaceChildren(h("div.kpi-strip", {}, [1, 2, 3, 4].map(() => h("div.kpi-skeleton"))));
    return;
  }
  // no result for these conditions (the red bar says why): old numbers would read as this bed's
  if (steady.error) { root.replaceChildren(); return; }
  // one bed's own checks in 단일 bed and in 공정 › bed별; the process checks elsewhere
  const single = state.ui.mode === "bed";
  const bedMode = single || state.ui.processView === "beds";
  const bed = single ? steady.data.profiles[0] : bedMode ? currentBed(steady.data.profiles) : null;
  const items = bedMode ? [...bed.kpis] : [...steady.data.summary.kpis];
  // catalyst life belongs to the CaO bed and to the process, and only exists with 비누화 on
  const hasCao = steady.data.profiles.some((p) => p.kind === "cao");
  if (state.ui.soap && hasCao && (!bedMode || bed.id === soapBedId(steady.data.profiles))) {
    const deact = state.results.deact;
    items.splice(1, 0, ...(isFresh(deact) ? deact.data.kpis : [{ key: "life-pending", pending: true }]));
  }
  root.replaceChildren(h("div.kpi-strip", { class: isFresh(steady) ? "kpi-strip" : "kpi-strip stale" },
    items.map((k) => (k.pending ? pendingCard(state.results.deact) : card(k)))));
}

function card(k) {
  const value = k.text ?? (isNum(k.value) ? fmt(k.value, k.digits ?? 2) : (k.key === "life" ? "계속 유지" : "–"));
  const hasUnit = k.unit && (k.text || isNum(k.value));
  // a check with a limit opens 공정 › 판정 기준, where the limit can be changed
  const judged = Boolean(k.criteria?.length);
  return h("div.kpi", { class: `kpi ${k.status}${judged ? " clickable" : ""}`,
    title: [k.label, k.target, k.note, judged ? "클릭: 판정 기준 보기·바꾸기" : ""].filter(Boolean).join("\n"),
    onclick: judged ? () => setUi({ mode: "process", processView: "criteria" }) : null }, [
    h("div.kpi-top", {}, [
      ICON[k.status] ? h("span.kpi-icon", { "aria-hidden": "true" }, ICON[k.status]) : null,
      h("span.kpi-label", {}, k.label),
      STATUS_TEXT[k.status] ? h("span.kpi-status", {}, STATUS_TEXT[k.status]) : null,
    ]),
    h("div.kpi-value", {}, [value, hasUnit ? h("small", {}, ` ${k.unit}`) : null]),
    h("div.kpi-target", {}, k.target || ""),
  ]);
}

function pendingCard(deact) {
  const running = deact?.loading;
  return h("div.kpi.pending", { title: "비누화 포함 계산 (10초–1분)" }, [
    h("div.kpi-top", {}, [h("span.kpi-label", {}, "촉매 수명 · 출구 Ca")]),
    running
      ? h("div.kpi-value.small", {}, ["계산 중 ", h("span.elapsed-value", {}, fmt(deact.elapsed || 0, 0)), "초"])
      : h("button.btn.small", { onclick: () => emit("need", { kind: "deact", force: true }) }, "비누화 계산"),
  ]);
}
