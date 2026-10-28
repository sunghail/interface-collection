// 단일 bed › 흡착제 비교: which adsorbent meets the removal targets with the least sugar loss (batch basis).

import { h, isNum } from "../util.js";
import { state, setUi, setSingle } from "../store.js";
import { KIND, ROLE, compName, dot, kpi, pct, num, placeholder, notesBox, heat, pgroup, roleEditor } from "./common.js";

export function screenSidebar() {
  return h("div.props", {}, [
    pgroup("제거 · 보존 목표", "target", roleEditor(), "성분별 역할"),
    pgroup("비교 방법", "feed", [
      h("p.pgroup-note", {}, "흡착제마다 모든 제거 대상이 목표에 도달하는 투입량(회분)을 구하고, 그 투입량에서의 보존 성분(당) 감소율로 순위를 매깁니다."),
      h("p.pgroup-note", {}, "K_d = q_e / C_e (흡착 세기) · 선택도 = 제거 대상 K_d ÷ 당 K_d"),
    ]),
  ]);
}

export function screenMain() {
  const cmp = state.results.compare;
  if (cmp.error) return notesBox("비교할 수 없습니다", [cmp.error], "error");
  if (!cmp.data) return placeholder(cmp.pendingKey ? "분석 중…" : "분석 결과를 기다리는 중…");
  const d = cmp.data;
  const comps = d.components;
  const roles = Object.fromEntries(state.project.components.map((c) => [c.id, c.role]));
  const rows = d.rows.filter((r) => !r.error).sort((a, b) => a.rank - b.rank);
  const broken = d.rows.filter((r) => r.error);
  const hasTargets = Object.keys(d.targets).length > 0;
  const best = rows[0];
  const keepIds = comps.filter((c) => roles[c] === "keep");

  const kpis = h("div.kpi-strip", {}, best ? [
    kpi("1순위 흡착제", best.name, `${KIND[best.kind]} · ${best.model_name}`, "ok"),
    kpi("필요 투입량", hasTargets ? (best.reachable ? `${num(best.dose)} g/L` : `> ${d.dose_max} g/L`) : "–",
      hasTargets ? `한계 성분: ${compName(best.limiting)}` : "제거 대상 없음", best.reachable ? "info" : "bad"),
    kpi("당 감소율", hasTargets ? pct(best.keep_loss) : "–", keepIds.length ? keepIds.map(compName).join(", ") : "보존 성분 없음",
      (best.keep_loss || 0) > 0.1 ? "warn" : "ok"),
    kpi("평형 95 % 도달 시간", isNum(best.t95) ? `${num(best.t95)} min` : "–", "그 투입량에서, 제거 대상 기준", "info"),
  ] : []);

  const rank = h("section.card", {}, [
    h("div.card-head", {}, [h("h2", {}, "순위"), h("span.muted", {}, "목표를 모두 맞추는 투입량과 그때의 당 감소율")]),
    h("div.table-wrap", {}, h("table.data", {}, [
      h("thead", {}, h("tr", {}, ["순위", "흡착제", "등온식", "필요 투입량 (g/L)", "한계 성분", "당 감소율", "평형 95 % 도달 시간 (min)", "시험 수"]
        .map((x) => h("th", {}, x)))),
      h("tbody", {}, rows.map((r) => h(`tr${r === best ? ".best-row" : ""}`, {}, [
        h("td", {}, String(r.rank)),
        h("th", {}, [h("button.link-btn", { onclick: () => { setSingle({ ads: r.id }); setUi({ bedView: "fit" }); } }, r.name),
          h("small.muted", {}, ` ${KIND[r.kind]}`)]),
        h("td", {}, r.model_name),
        h("td", {}, hasTargets ? (r.reachable ? num(r.dose) : `> ${d.dose_max} (도달 못함)`) : "–"),
        h("td", {}, hasTargets && r.limiting ? [dot(r.limiting), compName(r.limiting)] : "–"),
        h("td", {}, hasTargets ? pct(r.keep_loss) : "–"),
        h("td", {}, num(r.t95)),
        h("td", {}, String(r.analysis.runs.length)),
      ]))),
    ])),
  ]);

  // measured removal of the last run (heat map) and K_d
  const lastRun = (r) => r.analysis.runs[r.analysis.runs.length - 1];
  const heatTable = h("section.card", {}, [
    h("div.card-head", {}, [h("h2", {}, "시험 결과: 제거율"), h("span.muted", {}, "각 흡착제의 마지막 시험 (평형 시간 값). 초록 = 제거 대상, 빨강 = 보존 대상")]),
    h("div.table-wrap", {}, h("table.data.heat", {}, [
      h("thead", {}, h("tr", {}, [h("th", {}, "흡착제 (투입량)"), ...comps.map((c) => h("th", {}, [dot(c), compName(c), h("small.role", {}, ROLE[roles[c]])]))])),
      h("tbody", {}, rows.map((r) => {
        const run = lastRun(r);
        return h("tr", {}, [h("th", {}, [r.name, h("small.muted", {}, ` ${num(run.dose)} g/L`)]),
          ...comps.map((c) => h("td", { style: heat(roles[c], run.components[c].removal) }, pct(run.components[c].removal, 0)))]);
      })),
    ])),
  ]);

  const kdTable = h("section.card", {}, [
    h("div.card-head", {}, [h("h2", {}, "분배계수 K_d (L/g)와 당 대비 선택도"), h("span.muted", {}, "마지막 시험 기준. 선택도 = K_d ÷ (보존 성분 K_d 중 최대)")]),
    h("div.table-wrap", {}, h("table.data.compact", {}, [
      h("thead", {}, h("tr", {}, [h("th", {}, "흡착제"), ...comps.map((c) => h("th", {}, [dot(c), compName(c)]))])),
      h("tbody", {}, rows.map((r) => {
        const run = lastRun(r);
        const sugar = Math.max(0, ...keepIds.map((c) => run.components[c].Kd || 0));
        return h("tr", {}, [h("th", {}, r.name), ...comps.map((c) => {
          const kd = run.components[c].Kd;
          const sel = roles[c] !== "keep" && sugar > 0 && isNum(kd) ? kd / sugar : null;
          return h("td", {}, [num(kd), sel ? h("small.muted", {}, ` ×${num(sel, 2)}`) : null]);
        })]);
      })),
    ])),
  ]);

  const predicted = hasTargets ? h("section.card", {}, [
    h("div.card-head", {}, [h("h2", {}, "필요 투입량에서 예상 제거율"), h("span.muted", {}, "입구 조성 기준 평형 계산")]),
    h("div.table-wrap", {}, h("table.data.heat", {}, [
      h("thead", {}, h("tr", {}, [h("th", {}, "흡착제"), ...comps.map((c) => h("th", {}, [dot(c), compName(c)]))])),
      h("tbody", {}, rows.map((r) => h("tr", {}, [h("th", {}, [r.name, h("small.muted", {}, ` ${r.reachable ? num(r.dose) : `${d.dose_max}+`} g/L`)]),
        ...comps.map((c) => h("td", { style: heat(roles[c], r.removal_at_dose?.[c]) }, pct(r.removal_at_dose?.[c], 1)))]))),
    ])),
  ]) : null;

  const warnings = [];
  for (const r of rows) {
    const flagged = new Set();
    for (const run of r.analysis.runs) for (const c of comps) {
      const st = run.components[c].status;
      if (["slow", "fast", "increase"].includes(st)) flagged.add(`${compName(c)} (${{ slow: "평형 미도달?", fast: "속도 하한만", increase: "농도 증가" }[st]})`);
    }
    if (flagged.size) warnings.push(`${r.name}: ${[...flagged].join(", ")}`);
  }

  return h("div", {}, [
    kpis,
    !hasTargets ? notesBox("제거 대상이 없습니다", ["왼쪽에서 성분 역할을 '제거'로 정하면 필요 투입량과 순위를 계산합니다."], "info") : null,
    broken.length ? notesBox("계산에서 뺀 흡착제", broken.map((r) => `${r.name}: ${r.error}`), "error") : null,
    rank, heatTable, predicted, kdTable,
    notesBox("데이터 확인 필요", warnings, "warn"),
  ]);
}
