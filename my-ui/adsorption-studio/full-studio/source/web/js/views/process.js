// 공정 › 요약: the whole train at once — live flowsheet with the bed table, then what leaves the train over
// time (product breakthrough) and how much of each component the beds hold.

import { mount, h, fmt } from "../util.js";
import { state, setUi } from "../store.js";
import { renderFlowsheet } from "../flowsheet.js";
import { loadingCard, errorCard, grid, subhead, trainCharts, kindDot, compName, pct, heat } from "./common.js";
import { renderTrainEditor } from "../train.js";

export function renderProcess(root) {
  const steady = state.results.steady;
  const editor = state.train.enabled ? renderTrainEditor() : null;
  if (!state.project.adsorbents.length) {
    mount(root, h("div.empty-state", {}, [h("p", {}, "흡착제가 없습니다. 단일 bed › 시험 데이터에서 흡착제와 시험값을 넣으세요.")]));
    return;
  }
  if (!steady?.data) {
    mount(root, editor, steady?.error ? errorCard(steady.error) : loadingCard("계산 중… (bed 크기를 찾는 데 몇 초)"));
    return;
  }
  const { summary, flowsheet } = steady.data;
  const open = (id) => setUi({ processView: "beds", bed: id, procBedView: "t" });
  const auto = flowsheet.mode === "auto";

  mount(root,
    editor,
    notes(summary.warnings, steady.notes),
    h("section.card.flow-card", {}, [
      h("div.card-head", {}, [
        h("h2", {}, auto ? "공정 흐름 — 자동 설계" : "공정 흐름 — 직접 구성"),
        h("span.muted", {}, auto && flowsheet.picked
          ? "흡착제는 흡착제 비교의 1순위 (왼쪽 '자동 설계'에서 바꿀 수 있음) · bed를 누르면 자세히"
          : "bed(그림 또는 표의 이름)를 누르면 그 bed만 자세히 봅니다"),
      ]),
      renderFlowsheet(flowsheet, state.project.components, open, summary),
      bedTable(flowsheet, open),
    ]),
    removalTable(summary),
    subhead("시간에 따른 제품", `교체 주기 ${fmt(summary.service_h, 1)} h · 판정: ${summary.judge_avg ? "누적 평균" : "교체 시점 출구"}`),
    grid(trainCharts(summary)),
  );
}

function notes(warnings = [], inputNotes = []) {
  const all = [...(inputNotes || []), ...(warnings || [])];
  if (!all.length) return null;
  return h("div.notes-strip", {}, [h("b", {}, "확인할 점"), h("ul", {}, all.map((text) => h("li", {}, text)))]);
}

function bedTable(flow, open) {
  const names = Object.fromEntries(state.project.components.map((c) => [c.id, c.name]));
  return h("div.table-wrap", {}, [
    h("table.data.compact", {}, [
      h("thead", {}, h("tr", {}, ["bed", "흡착제", "D × L (m)", "EBCT (min)", "흡착제 (kg)", "ΔP (kPa)", "맡은 성분 · 파과 (h)"]
        .map((t) => h("th", {}, t)))),
      h("tbody", {}, flow.units.map((bed) => h("tr", {}, [
        h("th", {}, h("button.link-btn.bed-link", { onclick: () => open(bed.id) }, [kindDot(bed.kind), bed.short])),
        h("td", {}, [bed.ads_name, h("small.muted", {}, ` ${bed.model_name}`)]),
        h("td", {}, `${fmt(bed.D, bed.D < 1 ? 3 : 2)} × ${fmt(bed.L, 2)}${bed.auto ? "" : " (직접)"}`),
        h("td", {}, fmt(bed.EBCT_min, 1)),
        h("td", {}, fmt(bed.mass_kg, bed.mass_kg < 10 ? 2 : 0)),
        h("td", {}, fmt(bed.dP_kPa, 2)),
        h("td", {}, bed.assigned.length
          ? bed.assigned.map((c) => `${names[c]} ${bed.t_break_h[c] === null ? "–" : fmt(bed.t_break_h[c], 1)}`).join(" · ")
          : h("span.muted", {}, "없음")),
      ]))),
    ]),
    h("p.table-note", {}, "크기: '자동'은 맡은 제거 대상을 교체 주기 동안 지키는 가장 작은 bed × 부피 여유 · "
      + "파과 = 그 성분 출구가 목표 제거율에 해당하는 농도에 도달하는 시간 (– = 계산 기간 안에 없음)"),
  ]);
}

function removalTable(summary) {
  const comps = state.project.components.filter((c) => (state.project.feed[c.id] || 0) > 0);
  return h("section.card", {}, [
    h("div.card-head", {}, [h("h2", {}, "성분별 결과 (교체 시점)"),
      h("span.muted", {}, "누적 제거율 = 흡착량 ÷ 유입량 · 출구 = 교체 시점의 C/C₀")]),
    h("div.table-wrap", {}, h("table.data.compact.heat", {}, [
      h("thead", {}, h("tr", {}, ["성분", "역할", "입구 (g/L)", "목표", "누적 제거율", "교체 시점 출구 C/C₀", "판정"].map((t) => h("th", {}, t)))),
      h("tbody", {}, comps.map((c) => {
        const target = summary.targets[c.id];
        const met = summary.met[c.id];
        return h("tr", {}, [
          h("th", {}, compName(c.id)),
          h("td", {}, { remove: "제거", keep: "보존", any: "–" }[c.role]),
          h("td", {}, fmt(state.project.feed[c.id], 3)),
          h("td", {}, target !== undefined ? `≥ ${target} %` : "–"),
          h("td", { style: heat(c.role, summary.removal[c.id]) }, pct(summary.removal[c.id])),
          h("td", {}, fmt(summary.outlet_frac[c.id], 3)),
          h("td", {}, met === undefined ? (c.role === "keep" ? "감소" : "–")
            : h("span.crit-status", { class: `crit-status ${met ? "ok" : "bad"}` }, met ? "충족" : "미달")),
        ]);
      })),
    ])),
  ]);
}
