// 공정 › 요약: the whole train at once — live flowsheet with the reactor table, then the
// composition carried from the feed through every bed and separator to the product.

import { mount, h, fmt } from "../util.js";
import { state, setUi, isFresh } from "../store.js";
import { createChart } from "../chart.js";
import { renderFlowsheet } from "../flowsheet.js";
import { SPECIES_COLOR, SPECIES_NAME } from "../theme.js";
import { loadingCard, errorCard, soapPrompt, grid, subhead, processOilChart, processLiquidChart } from "./common.js";
import { renderTrainEditor } from "../train.js";

export function renderProcess(root) {
  const steady = state.results.steady;
  const editor = state.train.enabled ? renderTrainEditor() : null;
  if (!steady?.data) {
    mount(root, editor, steady?.error ? errorCard(steady.error) : loadingCard("계산 중…"));
    return;
  }
  const { summary, profiles, flowsheet } = steady.data;
  const params = state.params;
  const open = (id) => setUi({ processView: "beds", bed: id, procBedView: "z" });

  const charts = [processOilChart(profiles, params.target_av, flowsheet.units), processLiquidChart(profiles, flowsheet.units)];
  let life = null;
  // saponification needs a CaO bed (a train of acid beds only has none)
  if (state.ui.soap && profiles.some((p) => p.kind === "cao")) {
    life = isFresh(state.results.deact) ? grid([lifeChart(state.results.deact.data)]) : soapPrompt();
  }

  mount(root,
    editor,
    notes(summary.warnings, steady.notes),
    h("section.card.flow-card", {}, [
      h("div.card-head", {}, [
        h("h2", {}, state.train.enabled ? "공정 흐름 — 직접 구성" : "공정 흐름 — 자동 설계"),
        h("span.muted", {}, "반응기(그림 또는 표의 이름)를 누르면 그 bed만 자세히 봅니다"),
      ]),
      renderFlowsheet(flowsheet, params, open, summary),
      state.train.enabled ? null : bedTable(summary, flowsheet, open),
    ]),
    subhead("공정 전체 조성", "원료 입구부터 제품까지 bed를 이어 붙여 본 분포 (점선: 분리기)"),
    grid(charts),
    life ? subhead("CaO 촉매 수명 (비누화)", "FFA가 CaO를 비누로 바꾸며 전환율이 떨어지는 시간") : null,
    life,
  );
}

function notes(warnings = [], inputNotes = []) {
  const all = [...(inputNotes || []), ...(warnings || [])];
  if (!all.length) return null;
  return h("div.notes-strip", {}, [h("b", {}, "확인할 점"), h("ul", {}, all.map((text) => h("li", {}, text)))]);
}

function lifeChart(deact) {
  const params = state.params;
  return createChart({
    title: `${deact.bed?.short || "CaO bed"} 출구 전환율 (비누화 포함)`,
    caption: "촉매가 입구부터 소모되며 떨어지는 전환율 · 비누화는 FFA를 처음 만나는 CaO bed에서 계산",
    xLabel: "운전 시간 t (h)", yLabel: "전환율 (%)", yMin: 0, yMax: 100,
    series: [{ name: SPECIES_NAME.TG, color: SPECIES_COLOR.TG, x: deact.t_h, y: deact.outlet_conversion.TG }],
    hlines: [{ y: deact.threshold_pct ?? params.target_x, label: `기준 ${fmt(deact.threshold_pct ?? params.target_x, 1)}%` }],
    vlines: deact.time_to_target_h === null ? [] : [{ x: deact.time_to_target_h, label: "기준 미달" }],
  });
}

function bedTable(summary, flow, open) {
  const rows = flow.units.map((bed) => [bed, `${fmt(bed.D, 2)} × ${fmt(bed.L, 2)}`, fmt(bed.tau_min, 1),
    fmt(bed.catalyst_kg, 0), fmt(bed.dP_kPa, 1), bed.kind === "acid"
      ? `산가 ${fmt(bed.av_in, 2)} → ${fmt(bed.av_out, 2)}`
      : `전환율 ${fmt(bed.conversion, 2)} % · WHSV ${fmt(bed.whsv, 2)} 1/h`]);
  return h("div.table-wrap", {}, [
    h("table.data.compact", {}, [
      h("thead", {}, h("tr", {}, ["반응기", "D × L (m)", "τ (min)", "촉매 (kg)", "ΔP (kPa)", "입구 → 출구"]
        .map((t) => h("th", {}, t)))),
      h("tbody", {}, rows.map(([bed, ...cells]) => h("tr", {}, [
        h("th", {}, h("button.link-btn.bed-link", { onclick: () => open(bed.id) }, [
          h("span.bed-dot", { class: `bed-dot ${bed.kind}` }), bed.short])),
        ...cells.map((v) => h("td", {}, v)),
      ]))),
    ]),
    h("p.table-note", {}, "크기: 목표를 맞추도록 자동 설계 · 크기를 직접 정하려면 위쪽 '직접 구성'"),
  ]);
}
