// 단일 bed › 회분: how much of the chosen adsorbent a tank of hydrolysate needs, and how the concentrations fall.

import { h, isNum } from "../util.js";
import { createChart } from "../chart.js";
import { state } from "../store.js";
import { compName, compColor, dot, kpi, pct, num, placeholder, notesBox, heat, pgroup, propInput, segmented } from "./common.js";

export function batchSidebar(onChange) {
  const req = state.batchReq;
  const set = (key) => (v) => { if (v !== null) { req[key] = v; onChange(); } };
  return h("div.props", {}, [
    pgroup("회분 조건", "design", [
      segmented([["target", "목표 제거율에 맞추기"], ["dose", "투입량 직접"]], req.mode, (v) => { req.mode = v; onChange(true); }),
      req.mode === "dose"
        ? propInput("투입량", req.dose, set("dose"), { unit: "g/L" })
        : h("p.pgroup-note", {}, "목표 = 시험 데이터 화면 성분 역할 '제거'의 목표 %"),
      propInput("용액 부피", req.V_L, set("V_L"), { unit: "L", title: "흡착제 질량 = 투입량 × 용액 부피" }),
      propInput("계산 시간", req.t_end, set("t_end"), { unit: "min" }),
    ], "흡착제는 위에서 선택"),
    pgroup("모델", "feed", [
      h("p.pgroup-note", {}, "닫힌 용기, 완전 혼합, 30 °C. 물질수지 V·dC/dt = −m·dq/dt, 속도 dq/dt = k(q*(C) − q), q*는 흡착제의 설계 등온식."),
    ]),
  ]);
}

export function batchMain() {
  const b = state.results.batch;
  if (!state.project.adsorbents.length) return placeholder("흡착제가 없습니다. 시험 데이터 화면에서 흡착제와 시험값을 넣으세요.");
  if (b.error) return notesBox("계산할 수 없습니다", [b.error], "error");
  if (!b.data) return placeholder(b.pendingKey ? "계산 중…" : "계산을 기다리는 중…");
  const d = b.data;
  const comps = d.components;
  const roles = Object.fromEntries(state.project.components.map((c) => [c.id, c.role]));
  const keep = comps.filter((c) => roles[c] === "keep");
  const targets = comps.filter((c) => roles[c] === "remove");
  const idx = (c) => comps.indexOf(c);
  const keepLoss = Math.max(0, ...keep.map((c) => d.removal[idx(c)]));
  const t95s = targets.map((c) => d.t95[idx(c)]);
  const t95 = t95s.some((x) => x === null || x === undefined) ? null : Math.max(0, ...t95s);
  const guideMode = state.ui.mode === "guide";

  const kpis = h("div.kpi-strip", {}, [
    kpi("투입량", `${num(d.dose)} g/L`, d.model_name, "info"),
    kpi("흡착제 질량", d.mass_g >= 1000 ? `${num(d.mass_g / 1000)} kg` : `${num(d.mass_g)} g`, `용액 ${num(d.V_L)} L`, "info"),
    kpi("당 감소율", keep.length ? pct(keepLoss) : "–", keep.map(compName).join(", ") || "보존 성분 없음", keepLoss > state.params.keep_loss_max / 100 + 1e-9 ? "bad" : "ok"),
    kpi("평형 95 % 도달 시간", !targets.length ? "–" : t95 === null ? "7일 이상" : `${num(Math.ceil(t95))} min`, "제거 대상 중 가장 느린 성분", "info"),
  ]);
  const series = comps.map((c, i) => ({ name: compName(c), color: compColor(c), x: d.t, y: d.C[i].map((v) => (d.C0[i] > 0 ? v / d.C0[i] : NaN)) }));
  const chart = createChart({ title: "시간에 따른 남은 농도", caption: "C/C₀. 곡선이 평평해지면 평형", xLabel: "시간 (min)", yLabel: "C / C₀",
    series, yMin: 0, yMax: 1, height: 280, hlines: [] });
  const abs = createChart({ title: "농도 (g/L)", xLabel: "시간 (min)", yLabel: "C (g/L)", height: 280,
    series: comps.map((c, i) => ({ name: compName(c), color: compColor(c), x: d.t, y: d.C[i] })) });
  const table = h("section.card", {}, [
    h("div.card-head", {}, [h("h2", {}, "성분별 결과"), h("span.muted", {}, "평형 기준")]),
    h("div.table-wrap", {}, h("table.data", {}, [
      h("thead", {}, h("tr", {}, ["성분", "역할", "처리 전 C₀ (g/L)", "평형 C (g/L)", "제거율", "평형 95 % 도달 시간 (min)", ...(guideMode ? [] : ["k_LDF (1/min)"])].map((x) => h("th", {}, x)))),
      h("tbody", {}, comps.map((c, i) => h("tr", {}, [
        h("th", {}, [dot(c), compName(c)]),
        h("td", {}, { remove: "제거", keep: "보존", any: "–" }[roles[c]]),
        h("td", {}, num(d.C0[i])), h("td", {}, num(d.Ceq[i])),
        h("td", { style: heat(roles[c], d.removal[i]) }, pct(d.removal[i])),
        h("td", {}, d.t95[i] === null ? (d.C0[i] > 0 ? "7일 이상" : "–") : num(d.t95[i])), guideMode ? null : h("td", {}, num(d.k[i])),
      ]))),
    ])),
  ]);
  return h("div", {}, [kpis, notesBox("확인할 점", [...(d.notes || []), ...(d.extrapolated || []).map((x) => `시험 범위 밖: ${x}`)], "warn"),
    h("div.chart-grid", {}, [chart, abs]), table]);
}

export const batchKey = () => state.projectKey + JSON.stringify({ ...state.batchReq, adsorbent: state.single.ads });
