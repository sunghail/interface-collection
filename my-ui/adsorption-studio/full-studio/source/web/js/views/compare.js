// 공정 › 시나리오 비교: manage saved condition sets and compare up to four with the current one.
// Every column uses the current project (components, composition, adsorbents): scenarios hold settings and trains.

import { mount, h, fmt, paramsKey } from "../util.js";
import { state, trainPayload } from "../store.js";
import { api } from "../api.js";
import { createChart } from "../chart.js";
import { SCENARIO_COLORS } from "../theme.js";
import { listScenarios, scenarioManager } from "../scenarios.js";
import { grid, loadingCard, subhead } from "./common.js";

const results = new Map();     // key -> design result (or {error})
const pending = new Set();
let rerender = () => {};

export function renderCompare(root) {
  rerender = () => renderCompare(root);
  const saved = listScenarios();
  const picked = state.ui.compare.filter((name) => saved.some((s) => s.name === name));
  const columns = [{ name: "현재 조건", params: { ...state.params }, train: trainPayload() },
    ...picked.map((name) => saved.find((s) => s.name === name))];

  for (const column of columns) {
    const key = paramsKey({ ...state.defaults, ...column.params }) + JSON.stringify(column.train || null) + state.projectKey;
    column.key = key;
    if (!results.has(key) && !pending.has(key)) {
      pending.add(key);
      api.steady({ ...state.defaults, ...column.params }, column.train || null, state.project)
        .then((data) => results.set(key, data))
        .catch((error) => results.set(key, { error: error.message }))
        .finally(() => { pending.delete(key); rerender(); });
    }
  }

  const ready = columns.every((c) => results.has(c.key));
  if (!ready) {
    mount(root, scenarioManager(), loadingCard("시나리오 계산 중… (시나리오마다 몇 초)"));
    return;
  }
  const data = columns.map((c) => results.get(c.key));
  mount(root, scenarioManager(),
    subhead("비교", picked.length ? "첫 열은 지금 왼쪽에 설정된 조건 · 초록 칸이 그 항목에서 가장 좋은 값" : "위에서 시나리오를 체크하면 열이 추가됩니다"),
    table(columns, data), overlays(columns, data));
}

function table(columns, data) {
  const byName = Object.fromEntries(state.spec.parameters.map((p) => [p.name, p]));
  const adsName = (id) => state.project.adsorbents.find((a) => a.id === id)?.name || id;
  const names = Object.fromEntries(state.project.components.map((c) => [c.id, c.name]));
  const rows = [
    ["바꾼 조건", (d, c) => {
      const diffs = Object.entries(c.params).filter(([k, v]) => byName[k] && Math.abs(v - byName[k].default) > 1e-12)
        .map(([k, v]) => `${byName[k].label} ${fmt(v, v % 1 ? 2 : 0)}`);
      if (c.train?.units?.length) diffs.unshift(`${c.train.mode === "auto" ? "자동" : "직접"} ${c.train.units.map((u) => adsName(u.ads)).join(" → ")}`);
      return diffs.length ? diffs.join(", ") : "기본값";
    }],
    ["공정", (d) => d.flowsheet.units.map((u) => u.ads_name).join(" → ")],
    ["bed D × L (m)", (d) => d.flowsheet.units.map((u) => `${fmt(u.D, 3)} × ${fmt(u.L, 2)}`).join(", ")],
    ["흡착제 합계 (kg)", (d) => fmt(d.summary.adsorbent_kg, 2), "min"],
    ["처리량당 흡착제 (kg/m³)", (d) => fmt(d.summary.usage_kg_m3, 2), "min"],
    ["교체 주기 (h)", (d) => fmt(d.summary.service_h, 1)],
    ["목표 유지 시간 (h)", (d) => (d.summary.run_h === null ? "계속" : fmt(d.summary.run_h, 1)), "max"],
    ["한계 성분 제거율 (%)", (d) => (d.summary.limiting ? `${fmt(d.summary.judged[d.summary.limiting] * 100, 1)} (${names[d.summary.limiting]})` : "–")],
    ["당 감소율 (%)", (d) => fmt(d.summary.keep_loss * 100, 1), "min"],
    ["최대 압력강하 (kPa)", (d) => fmt(d.summary.dp_max_kPa, 1), "min"],
  ];
  const parse = (text) => Number(String(text).replace(/,/g, "").split(" ")[0]);
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
          h("td", { class: best !== null && numbers[i] === best ? "best" : "", title: data[i].error || "" }, text))]);
      })),
    ])),
  ]);
}

function overlays(columns, data) {
  const color = (i) => SCENARIO_COLORS[i % SCENARIO_COLORS.length];
  const ok = data.map((d, i) => [d, i]).filter(([d]) => !d.error);
  const target = state.project.components.find((c) => c.role === "remove" && (state.project.feed[c.id] || 0) > 0);
  const keep = state.project.components.find((c) => c.role === "keep" && (state.project.feed[c.id] || 0) > 0);
  const charts = [];
  if (target) {
    charts.push(createChart({ title: `${target.name} — 제품 출구 C/C₀`, caption: "마지막 bed 출구",
      xLabel: "운전 시간 t (h)", yLabel: "C / C₀", yMin: 0,
      series: ok.map(([d, i]) => ({ name: columns[i].name, color: color(i), x: d.summary.t_h, y: d.summary.product_frac[target.id] })),
      hlines: [{ y: 1 - target.target / 100, label: `목표 ${target.target}% 제거 선` }] }));
  }
  if (keep) {
    charts.push(createChart({ title: `${keep.name} — 누적 감소`, caption: "흡착된 분율",
      xLabel: "운전 시간 t (h)", yLabel: "누적 감소율 (%)", yMin: 0,
      series: ok.map(([d, i]) => ({ name: columns[i].name, color: color(i), x: d.summary.t_h,
        y: (d.summary.adsorbed_t || d.summary.removal_t)[keep.id].map((v) => 100 * v) })),
      hlines: [{ y: state.params.keep_loss_max, label: `한도 ${state.params.keep_loss_max}%` }] }));
  }
  return charts.length ? grid(charts) : null;
}
