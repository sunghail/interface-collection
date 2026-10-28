// KPI strip: the numbers that decide whether the design works, each checked against its target.
// 공정 mode shows the whole-train checks; 단일 bed mode and 공정 › bed별 show one bed's own numbers.

import { h, fmt, isNum } from "./util.js";
import { state, isFresh, setUi } from "./store.js";
import { currentBed } from "./views/common.js";

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
  root.replaceChildren(h("div.kpi-strip", { class: isFresh(steady) ? "kpi-strip" : "kpi-strip stale" }, items.map(card)));
}

function card(k) {
  const value = k.text ?? (isNum(k.value) ? fmt(k.value, k.digits ?? 2) : "–");
  const hasUnit = k.unit && (k.text || isNum(k.value));
  // a check with a limit opens 공정 › 판정 기준, where the limit can be changed
  const judged = Boolean(k.criteria?.length);
  return h("div.kpi", { class: `kpi ${k.status}${judged ? " clickable" : ""}`,
    title: [k.label, k.target, k.note].filter(Boolean).join("\n"),
    onclick: null }, [
    h("div.kpi-top", {}, [
      ICON[k.status] ? h("span.kpi-icon", { "aria-hidden": "true" }, ICON[k.status]) : null,
      h("span.kpi-label", {}, k.label),
      STATUS_TEXT[k.status] ? h("span.kpi-status", {}, STATUS_TEXT[k.status]) : null,
    ]),
    h("div.kpi-value", {}, [value, hasUnit ? h("small", {}, ` ${k.unit}`) : null]),
    h("div.kpi-target", {}, k.target || ""),
  ]);
}
