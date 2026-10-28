// 단일 bed › 피팅: for the adsorbent picked above — the measured points with the fitted rate curve, one short
// table (equilibrium removal, q_e, K_d, rate constant, misfit), and all adsorbents side by side.

import { h, isNum } from "../util.js";
import { createChart } from "../chart.js";
import { state, change, setUi, setSingle } from "../store.js";
import { compColor, compName, dot, num, pct, placeholder, notesBox, heat, segmented, bestText } from "./common.js";
import { helpTip } from "./help.js";

const KIN = {
  pfo: { name: "1차 (PFO · LDF)", k: "k₁ (1/min)", note: "C(t) = C_e + (C₀ − C_e)·e^(−k₁t) · 컬럼 설계에 쓰는 식" },
  pso: { name: "2차 (PSO)", k: "k₂ (g/mg·min)", note: "q(t) = q_e²k₂t / (1 + q_e k₂ t) · 논문 비교용" },
};
const STATUS = {
  ok: ["✓ 양호", "ok", "속도식이 측정값과 잘 일치"],
  poor: ["⚠ 피팅 불량", "bad", "피팅 오차가 크거나 속도상수가 경계값 — 측정값을 확인하세요 (이 성분의 속도는 신뢰하기 어려움)"],
  check: ["⚠ 측정값 확인", "bad", "C₀보다 큰 측정값이 있습니다 — 단위(mg/L ↔ g/L)나 입력 오류를 확인하세요"], slow: ["⚠ 평형?", "warn", "평형에 아직 못 미쳤을 수 있음"],
  fast: ["⚠ 하한", "warn", "첫 시간에 이미 평형 — 속도는 하한값 (더 이른 시간 측정 권장)"],
  weak: ["– 변화 작음", "muted", "변화가 작아 속도를 구할 수 없음"], none: ["– 변화 < 2 %", "muted", "농도 변화가 2 % 미만이라 속도는 구할 수 없음 (K_d는 물질수지 값 그대로 사용)"],
  increase: ["⚠ 증가", "bad", "농도가 오히려 증가"],
};

const rowOf = () => state.results.compare.data?.rows.find((r) => r.id === state.single.ads);

export function fitSidebar() {
  const kin = state.ui.kin || "pfo";
  const row = rowOf();
  const ads = state.project.adsorbents.find((a) => a.id === state.single.ads);
  const isos = row?.analysis?.isotherms;
  const isoOptions = [["auto", "자동"], ...Object.entries(state.spec.iso_names)];
  const isoSelect = h("select.fit-select", { disabled: !ads || null, onchange: (e) => {
    change((p) => { p.adsorbents.find((a) => a.id === ads.id).model = e.target.value; }, { structural: true });
  } }, isoOptions.map(([v, text]) => h("option", {
    value: v, selected: ads?.model === v || null,
    disabled: v !== "auto" && isos && !isos[v]?.available ? true : null,
  }, v !== "auto" && isos && !isos[v]?.available ? `${text} (시험 부족)` : text)));
  return h("div.props", {}, [
    h("section.pgroup.feed", {}, [
      h("div.pgroup-head", {}, [h("b", {}, "속도식"), helpTip("rate_law")]),
      segmented(Object.entries(KIN).map(([k, v]) => [k, v.name]), kin, (v) => setUi({ kin: v })),
      h("p.pgroup-note", {}, KIN[kin].note),
    ]),
    h("section.pgroup.feed", {}, [
      h("div.pgroup-head", {}, [h("b", {}, "등온식"), helpTip("isotherm"), h("small.muted", {}, "선택한 흡착제")]),
      isoSelect,
      h("p.pgroup-note", {}, row?.model_name ? `현재 적용 등온식: ${row.model_name}. 비선형(Langmuir 등)은 흡착제 질량을 바꾼 추가 시험이 있어야 합니다.`
        : "흡착제 질량을 바꾼 추가 시험이 있으면 Langmuir·Freundlich를 고를 수 있습니다."),
    ]),
  ]);
}

export function fitMain() {
  const cmp = state.results.compare;
  if (!state.project.adsorbents.length) return placeholder("흡착제가 없습니다. 입력 화면에서 추가하세요.");
  if (cmp.error) return notesBox("분석할 수 없습니다", [cmp.error], "error");
  if (!cmp.data) return placeholder("분석 중…");
  const row = rowOf();
  const blocks = [];
  if (!row) blocks.push(placeholder("분석 중…"));
  else if (row.error) blocks.push(notesBox(`${row.name}: 데이터를 확인하세요`, [row.error], "error"));
  else blocks.push(...adsorbentBlocks(row));
  blocks.push(overview(cmp.data));
  return h("div", {}, blocks);
}

function adsorbentBlocks(row) {
  const kin = state.ui.kin || "pfo";
  const a = row.analysis;
  const runs = a.runs;
  const pick = Math.min(state.ui.fitRun || 0, runs.length - 1);
  const run = runs[pick];
  const comps = state.project.components.filter((c) => isNum(run.components[c.id]?.C0) && run.components[c.id].C0 > 0);
  const tEnd = run.times[run.times.length - 1];
  const xs = Array.from({ length: 81 }, (_, i) => (tEnd * 1.2 * i) / 80);
  const series = [];
  for (const c of comps) {
    const r = run.components[c.id];
    const color = compColor(c.id);
    series.push({ name: c.name, group: c.id, color, mode: "markers", x: r.points.map((p) => p[0]), y: r.points.map((p) => p[1] / r.C0) });
    const curve = curveFor(kin, r, run.dose);
    if (curve) series.push({ name: `${c.name} 피팅`, group: c.id, noLegend: true, color, width: 1.8, x: xs, y: xs.map(curve) });
  }
  const table = h("div.table-wrap", {}, h("table.data.compact.fit-table", {}, [
    h("thead", {}, h("tr", {}, ["성분", "평형 제거율", "q_e (mg/g)", "K_d (L/g)", KIN[kin].k, "피팅 오차", "상태"].map((t) => h("th", {}, t)))),
    h("tbody", {}, comps.map((c) => {
      const r = run.components[c.id];
      const rated = ["ok", "slow", "fast"].includes(r.status);
      const [label, cls, text] = STATUS[r.status] || ["", "muted", ""];
      const err = kin === "pfo" ? r.err_pfo : r.err_pso;
      return h("tr", {}, [
        h("th", {}, [dot(c.id), c.name]),
        h("td", { style: heat(c.role, r.removal) }, pct(r.removal)),
        h("td", {}, isNum(r.qe) ? num(r.qe * 1000) : "–"),
        h("td", {}, num(r.Kd)),
        h("td", {}, rated ? num(kin === "pfo" ? r.k1 : r.k2_pso) : "–"),
        h("td", {}, rated && isNum(err) ? `${(100 * err).toFixed(1)} %` : "–"),
        h("td", { title: [text, r.note].filter(Boolean).join("\n") }, h(`span.tag.${cls}`, {}, label)),
      ]);
    })),
  ]));
  const eqNote = run.extras?.length
    ? `평형 = ${run.extras.map((e) => `${num(e.hours)} h 시료`).join(", ")} (채취량 물질수지 보정) · 모든 시간 값으로 속도를 피팅`
    : `평형 = 마지막 채취 시간(${num(tEnd)} min) 값 — 평형 시간 측정값을 입력하면 더 정확합니다`;
  return [
    h("div.subhead", {}, [h("h2", {}, row.name), h("span.muted", {}, `${num(run.m_g)} g / ${num(run.V_mL)} mL · 투입량 ${num(run.dose)} g/L · 등온식 ${row.model_name}`),
      h("span.spacer"),
      runs.length > 1 ? segmented(runs.map((r, i) => [i, r.label]), pick, (i) => setUi({ fitRun: i })) : null]),
    h("div.best-line", {}, ["주요 흡착 성분 (평형 제거율 순): ", h("b", {}, bestText(runs[0], 4))]),
    notesBox("데이터 알림", row.notes || [], "warn"),
    h("div.fit-grid", {}, [
      createChart({ title: "남은 농도 C/C₀", caption: `점 = 측정 · 선 = ${KIN[kin].name} 피팅`,
        xLabel: "시간 (min)", yLabel: "C / C₀", yMin: 0, height: 300, series }),
      h("section.card.tight", {}, [table, h("p.table-note", {}, [eqNote, helpTip("fit_table")])]),
    ]),
  ];
}

/** The fitted C(t)/C₀ of one component, or null when there is no rate. */
function curveFor(kin, r, dose) {
  if (!isNum(r.C0) || !isNum(r.Ce) || r.C0 <= 0) return null;
  if (kin === "pfo" && isNum(r.k1)) return (t) => (r.Ce + (r.C0 - r.Ce) * Math.exp(-r.k1 * t)) / r.C0;
  if (kin === "pso" && isNum(r.k2_pso) && isNum(r.qe)) {
    const qe = r.qe * 1000;
    return (t) => (r.C0 - (dose * (qe * qe * r.k2_pso * t) / (1 + qe * r.k2_pso * t)) / 1000) / r.C0;
  }
  return null;
}

/** Every adsorbent at a glance: equilibrium removal of each component (standard test). */
function overview(data) {
  const comps = state.project.components;
  const rows = data.rows.filter((r) => !r.error);
  if (!rows.length) return null;
  // the adsorbent with the highest removal of each component
  const best = {};
  for (const c of comps) {
    let top = null;
    for (const r of rows) {
      const x = r.analysis.runs[0].components[c.id]?.removal;
      if (isNum(x) && x >= 0.05 && (!top || x > top.x)) top = { id: r.id, x };
    }
    if (top) best[c.id] = top.id;
  }
  return h("section.card", {}, [
    h("div.card-head", {}, [h("h2", {}, "흡착제 한눈 비교"), helpTip("compare_table"),
      h("span.muted", {}, "기본 시험의 평형 제거율 · 작은 글씨 = K_d (L/g) · ★ = 그 성분의 제거율이 가장 높은 흡착제 · 이름을 누르면 위에 표시")]),
    h("div.table-wrap.scroll-y", {}, h("table.data.compact.heat", {}, [
      h("thead", {}, h("tr", {}, [h("th", {}, "흡착제"), h("th", {}, "주요 흡착 성분"), ...comps.map((c) => h("th", {}, [dot(c.id), compName(c.id)]))])),
      h("tbody", {}, rows.map((r) => {
        const run = r.analysis.runs[0];
        return h(`tr${r.id === state.single.ads ? ".best-row" : ""}`, {}, [
          h("th", {}, h("button.link-btn", { onclick: () => setSingle({ ads: r.id }) }, r.name)),
          h("td.best-cell", {}, bestText(run, 2)),
          ...comps.map((c) => {
            const x = run.components[c.id];
            const star = best[c.id] === r.id;
            return h("td", { style: heat(c.role, x?.removal) }, [star ? "★ " : "", pct(x?.removal, 0), h("small.muted", {}, ` ${num(x?.Kd, 2)}`)]);
          }),
        ]);
      })),
    ])),
  ]);
}
