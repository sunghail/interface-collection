// 공정 › 시나리오 비교: manage saved condition sets and compare up to four with the current one.

import { mount, h, fmt, paramsKey } from "../util.js";
import { state, trainPayload } from "../store.js";
import { api } from "../api.js";
import { createChart } from "../chart.js";
import { SCENARIO_COLORS } from "../theme.js";
import { listScenarios, scenarioManager } from "../scenarios.js";
import { grid, loadingCard, subhead } from "./common.js";

const results = new Map();     // params key -> steady result (or {error})
const pending = new Set();
let rerender = () => {};

export function renderCompare(root) {
  rerender = () => renderCompare(root);
  const saved = listScenarios();
  const picked = state.ui.compare.filter((name) => saved.some((s) => s.name === name));
  const columns = [{ name: "현재 조건", params: { ...state.params }, train: trainPayload() },
    ...picked.map((name) => saved.find((s) => s.name === name))];

  for (const column of columns) {
    const key = paramsKey({ ...state.defaults, ...column.params }) + JSON.stringify(column.train || null);
    column.key = key;
    if (!results.has(key) && !pending.has(key)) {
      pending.add(key);
      api.steady({ ...state.defaults, ...column.params }, column.train || null)
        .then((data) => results.set(key, data))
        .catch((error) => results.set(key, { error: error.message }))
        .finally(() => { pending.delete(key); rerender(); });
    }
  }

  const ready = columns.every((c) => results.has(c.key));
  if (!ready) {
    mount(root, scenarioManager(), loadingCard("시나리오 계산 중…"));
    return;
  }
  const data = columns.map((c) => results.get(c.key));
  mount(root, scenarioManager(),
    subhead("비교", picked.length ? "첫 열은 지금 왼쪽에 설정된 조건 · 초록 칸이 그 항목에서 가장 좋은 값" : "위에서 시나리오를 체크하면 열이 추가됩니다"),
    table(columns, data), overlays(columns, data));
}

const sumOf = (d, kind) => d.flowsheet.units.filter((u) => u.kind === kind).reduce((total, u) => total + u.catalyst_kg, 0);

function table(columns, data) {
  const byName = Object.fromEntries(state.spec.parameters.map((p) => [p.name, p]));
  const rows = [
    ["바꾼 조건", (d, c) => {
      const diffs = Object.entries(c.params).filter(([k, v]) => byName[k] && Math.abs(v - byName[k].default) > 1e-12)
        .map(([k, v]) => `${byName[k].label} ${fmt(v, v % 1 ? 2 : 0)}`);
      if (c.train?.units?.length) diffs.unshift(`직접 구성 ${c.train.units.length}개 bed`);
      return diffs.length ? diffs.join(", ") : "기본값";
    }],
    ["산촉매 bed 수", (d) => `${d.summary.n_acid_beds} 개`],
    ["산촉매 후 산가", (d) => fmt(d.summary.av_out, 2), "min"],
    ["TG 전환율 (%)", (d) => fmt(d.summary.conversion, 2), "max"],
    ["공정", (d) => d.flowsheet.units.map((u) => (u.kind === "acid" ? "산" : "CaO") + (u.separator ? "·분리" : "")).join(" → ")],
    ["CaO bed D × L (m)", (d) => d.flowsheet.units.filter((u) => u.kind === "cao").map((u) => `${fmt(u.D, 2)} × ${fmt(u.L, 2)}`).join(", ") || "–"],
    ["CaO 촉매 (kg)", (d) => fmt(sumOf(d, "cao"), 0), "min"],
    ["산촉매 촉매 합계 (kg)", (d) => fmt(sumOf(d, "acid"), 0), "min"],
    ["FAME 생산 (kg/h)", (d) => fmt(d.summary.fame_kg_h, 1), "max"],
    ["촉매 합계 (kg)", (d) => fmt(d.summary.catalyst_kg, 0), "min"],
    ["최대 압력강하 (kPa)", (d) => fmt(d.summary.dp_max_kPa, 1), "min"],
  ];
  const parse = (text) => Number(String(text).replace(/,/g, ""));
  return h("section.card.tight", {}, [
    h("div.table-wrap", {}, h("table.data.compare.compact", {}, [
      h("thead", {}, h("tr", {}, [h("th", {}, ""), ...columns.map((c, i) => h("th", {}, [
        h("span.bed-dot", { style: { background: SCENARIO_COLORS[i] } }), c.name]))])),
      h("tbody", {}, rows.map(([label, pick, better]) => {
        const cells = data.map((d, i) => (d.error ? "오류" : pick(d, columns[i])));
        const numbers = cells.map(parse);
        const valid = numbers.filter(Number.isFinite);
        const best = better && valid.length > 1 && new Set(valid).size > 1
          ? (better === "max" ? Math.max(...valid) : Math.min(...valid)) : null;
        return h("tr", {}, [h("th", {}, label), ...cells.map((text, i) =>
          h("td", { class: best !== null && numbers[i] === best ? "best" : "" }, text))]);
      })),
    ])),
  ]);
}

/** A quantity along the whole train, beds laid end to end. */
function along(d, pick) {
  const x = [], y = [];
  let offset = 0;
  for (const p of d.profiles) {
    const values = pick(p);
    p.z.forEach((z, i) => { x.push(offset + z); y.push(values ? values[i] : null); });
    offset += p.z[p.z.length - 1];
  }
  return { x, y };
}

function overlays(columns, data) {
  const color = (i) => SCENARIO_COLORS[i % SCENARIO_COLORS.length];
  const ok = data.map((d, i) => [d, i]).filter(([d]) => !d.error);
  const series = (pick) => ok.map(([d, i]) => ({ name: columns[i].name, color: color(i), ...along(d, pick) }));
  const target = state.params;
  return grid([
    createChart({ title: "FAME (오일 기준) — 공정 전체", caption: "원료 입구부터 bed를 이어 붙인 누적 길이",
      xLabel: "공정 누적 길이 (m)", yLabel: "FAME wt% (오일 기준)", yMin: 0, yMax: 100,
      series: series((p) => p.oil_basis.FAME), hlines: [{ y: target.target_x, label: `목표 ${target.target_x}%` }] }),
    createChart({ title: "산가 — 공정 전체", caption: "산촉매 bed에서 내려가고 CaO bed에서는 거의 그대로",
      xLabel: "공정 누적 길이 (m)", yLabel: "산가 (mg KOH/g)", yMin: 0, series: series((p) => p.acid_value),
      hlines: [{ y: target.target_av, label: `목표 ${target.target_av}` }] }),
  ]);
}
