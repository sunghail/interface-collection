// 4단계 결과 요약: what a first-time user needs before any chart — one verdict line, the procedure to follow,
// before → after per component, how far the numbers can be trusted (with the confirming experiment), and what
// happens if the main quantity changes. The interactive try-out and the charts follow below it.

import { h, isNum, fmt } from "../util.js";
import { api } from "../api.js";
import { state } from "../store.js";
import { dot, num, pct } from "./common.js";
import { helpTip } from "./help.js";

const comps = () => state.project.components.filter((c) => (state.project.feed[c.id] || 0) > 0);
const limit = () => state.params.keep_loss_max / 100;
const josa = (word, a, b) => {
  const code = word.trim().slice(-1).charCodeAt(0) - 0xac00;
  const batchim = code >= 0 && code < 11172 ? code % 28 !== 0 : /[lmnrLMNR0136780]$/.test(word.trim());
  return `${word}${batchim ? a : b}`;
};

function verdictBox(kind, title, text) {
  const icon = { ok: "✓", warn: "!", bad: "✕" }[kind];
  return h(`div.sum-verdict.${kind}`, {}, [h("span.sum-icon", {}, icon), h("div", {}, [h("b", {}, title), h("div", {}, text)])]);
}

function recipe(items) {
  return h("div.sum-recipe", {}, items.map(([n, label, big, sub]) => h("div.sum-step", {}, [
    h("span.sum-no", {}, n), h("div", {}, [h("div.sum-label", {}, label), h("div.sum-big", {}, big), sub ? h("div.sum-sub", {}, sub) : null]),
  ])));
}

/** Before → after bars, each scaled to its own C₀ (a small HMF bar would otherwise vanish next to xylose). */
function bars(rows, caption) {
  return h("div.sum-bars", {}, [
    ...rows.map(({ c, before, after }) => {
      const change = before > 0 ? (before - after) / before : 0;
      const role = c.role;
      const word = role === "keep" ? "감소율" : "제거율";
      const cls = role === "remove" ? (change * 100 >= c.target - 1e-6 ? "ok" : "bad")
        : role === "keep" ? (change <= limit() + 1e-9 ? "keep" : "bad") : "any";
      return h("div.sum-bar-row", {}, [
        h("span.sum-bar-name", {}, [dot(c.id), c.name]),
        h("div.sum-bar-track", {}, [h("div.sum-bar-before"), h(`div.sum-bar-after.${cls}`, { style: { width: `${Math.max(0, Math.min(100, (after / before) * 100))}%` } })]),
        h("span.sum-bar-val", {}, [`${fmt(before, 3)} → ${fmt(after, 3)} g/L · `,
          h(`b.sum-${cls}`, {}, `${word} ${pct(change, 0)}`), role === "remove" ? h("small.muted", {}, ` (목표 ${num(c.target)} %)`) : null]),
      ]);
    }),
    h("div.sum-legend.muted", {}, [h("span.sw.before"), " 처리 전 (막대 전체 = C₀)  ", h("span.sw.ok"), " 제거 대상 처리 후  ",
      h("span.sw.keep"), " 보존 성분 처리 후  ", caption]),
  ]);
}

function trustBox(issues, experiment) {
  const kind = issues.length ? "warn" : "ok";
  return h(`div.sum-trust.${kind}`, {}, [
    h("b", {}, issues.length ? "신뢰도 — 확인이 필요한 점" : "신뢰도 — 시험 범위 안의 결과입니다"),
    issues.length ? h("ul", {}, issues.map((x) => h("li", {}, x))) : null,
    experiment ? h("div.sum-exp", {}, ["확인 실험: ", experiment]) : null,
  ]);
}

const whatIfBox = () => h("div.sum-whatif", {}, h("p.muted.small", {}, "변경 시 결과를 계산하는 중…"));

function card(children) {
  return h("section.card.sum-card", {}, [h("div.card-head", {}, [h("h2", {}, "결과 요약"), helpTip("summary")]), ...children]);
}

// ------------------------------------------------------------------------------------------------ batch
export function batchSummary(b, ads, cmpRow) {
  const t = state.batchReq.t_end;
  const i = (id) => b.components.indexOf(id);
  const after = (id) => { const row = b.C[i(id)]; return row[row.length - 1]; };
  const list = comps().filter((c) => i(c.id) >= 0);
  const targets = list.filter((c) => c.role === "remove");
  const keeps = list.filter((c) => c.role === "keep");
  const rem = (c) => (b.C0[i(c.id)] - after(c.id)) / b.C0[i(c.id)];
  const remEq = (c) => b.removal[i(c.id)];
  const metT = targets.every((c) => rem(c) * 100 >= c.target - 1e-6);
  const metEq = targets.every((c) => remEq(c) * 100 >= c.target - 1e-6);
  const keepLoss = Math.max(0, ...keeps.map(rem));
  const keepOk = keepLoss <= limit() + 1e-9;
  // minutes of contact after which every target is met at this dose (NOT the time to 95 % of equilibrium:
  // a dose sized to just meet 90 % at equilibrium gives only 85.5 % at that time)
  const tTarget = isNum(b.t_target) ? Math.ceil(b.t_target) : null;
  const unreachable = b.reachable === false && !isNum(b.dose_eq);       // not even at equilibrium with the largest dose
  const removedText = targets.map((c) => `${c.name} ${pct(rem(c), 0)}`).join(", ");
  let verdict;
  if (unreachable) {
    verdict = verdictBox("bad", "목표 미달 — 이 흡착제로는 목표 제거율에 도달하지 않습니다",
      "투입량을 크게 늘려도 부족합니다. 3단계에서 다른 흡착제를 선택하거나 2단계에서 목표 제거율을 낮추세요.");
  } else if (!metT && metEq) {
    verdict = verdictBox("warn", `교반 시간 부족 — ${num(t)} min으로는 목표 미달 (${removedText})`,
      tTarget ? `이 투입량에서 목표에 도달하는 시간은 약 ${num(tTarget)} min입니다. 교반 시간을 그 이상으로 늘리거나 투입량을 늘리세요.`
        : "이 투입량으로는 평형에 가까워져야 목표에 도달합니다 (7일 이내 도달하지 않음). 투입량을 늘리세요.");
  } else if (!metT) {
    verdict = verdictBox("bad", `목표 미달 — ${removedText}`, "투입량을 늘리거나 다른 흡착제를 검토하세요. 아래 '직접 조절해 보기'로 확인할 수 있습니다.");
  } else if (!keepOk) {
    verdict = verdictBox("bad", `부적합 — 당 감소율 ${pct(keepLoss)} (한도 ${num(state.params.keep_loss_max)} %)`,
      `제거 목표는 달성하지만 당이 너무 많이 흡착됩니다 (${removedText}). 당 선택성이 높은 흡착제를 3단계에서 비교하세요.`);
  } else {
    verdict = verdictBox("ok", `목표 달성 — ${removedText} 제거, 당 감소율 ${pct(keepLoss)}`,
      `${josa(ads.name, "을", "를")} 가수분해액 1 L당 ${num(b.dose)} g 투입하고 ${num(t)} min 교반한 뒤 여과하면 됩니다.`);
  }

  const steps = recipe([
    ["1", "흡착제 투입", `${num(b.mass_g >= 1000 ? b.mass_g / 1000 : b.mass_g)} ${b.mass_g >= 1000 ? "kg" : "g"}`, `${num(b.dose)} g/L × ${num(b.V_L)} L`],
    ["2", "교반", `${num(t)} min`, tTarget ? `목표 도달 ≈ ${num(tTarget)} min` : (b.targets_met_eq === false ? "이 투입량으로는 목표 미달" : "목표 도달 시간 계산 불가")],
    ["3", "여과", "흡착제 분리", "여과 또는 원심분리 후 여액 사용"],
  ]);

  const issues = [...(b.extrapolated || []), ...(b.notes || [])];
  const fitWarn = cmpRow?.analysis?.runs?.[0] && list.filter((c) => ["poor", "check", "slow"].includes(cmpRow.analysis.runs[0].components[c.id]?.status));
  if (fitWarn?.length) issues.push(`피팅 확인 필요: ${fitWarn.map((c) => c.name).join(", ")} (1-2 피팅 표의 ⚠ 표시)`);
  if ((cmpRow?.analysis?.runs?.length || 1) < 2) issues.push("흡착제 질량을 바꾼 시험이 1개뿐이라 선형 등온식(K_d)으로 외삽했습니다 — 추가 시험으로 정확도를 높일 수 있습니다");
  const vmL = state.project.test.V_mL;
  const experiment = `${num(vmL)} mL 튜브에 ${fmt(b.dose * vmL / 1000, 3)} g 투입, ${num(t)} min 교반 후 ${targets.map((c) => c.name).join("·")} 측정 → 1-1에 '추가 시험'으로 입력`;

  const whatIf = whatIfBox();
  fillBatchWhatIf(whatIf, b, ads, targets, keeps);
  return card([verdict, steps,
    bars(list.map((c) => ({ c, before: b.C0[i(c.id)], after: after(c.id) })), `· ${num(t)} min 교반 후`),
    trustBox(issues, experiment), whatIf]);
}

async function fillBatchWhatIf(box, b, ads, targets, keeps) {
  const t = state.batchReq.t_end;
  const cases = [
    [`투입량을 ${num(b.dose * 0.75)} g/L로 줄이면 (−25 %)`, { dose: b.dose * 0.75, t_end: t }],
    [`교반 시간을 ${num(Math.max(1, t / 2))} min으로 줄이면`, { dose: b.dose, t_end: Math.max(1, t / 2) }],
  ];
  try {
    const out = await Promise.all(cases.map(([, req]) => api.batch(state.project, { adsorbent: ads.id, mode: "dose", V_L: b.V_L, ...req })));
    box.replaceChildren(...out.map((d, k) => {
      const at = (id) => { const j = d.components.indexOf(id); const row = d.C[j]; return (d.C0[j] - row[row.length - 1]) / d.C0[j]; };
      const ok = targets.every((c) => at(c.id) * 100 >= c.target - 1e-6);
      const loss = Math.max(0, ...keeps.map((c) => at(c.id)));
      return h("div.sum-if", {}, [h("div.muted.small", {}, cases[k][0]),
        h("div", {}, [targets.map((c) => `${c.name} ${pct(at(c.id), 0)}`).join(", "), ` · 당 감소율 ${pct(loss, 0)} `,
          h(`span.tag.${ok && loss <= limit() + 1e-9 ? "ok" : "bad"}`, {}, !ok ? "목표 미달" : loss <= limit() + 1e-9 ? "적합" : "당 감소율 초과")])]);
    }));
  } catch (error) {
    box.replaceChildren(h("p.muted.small", {}, `변경 결과를 계산하지 못했습니다: ${error.message}`));
  }
}

// ------------------------------------------------------------------------------------------------ column
export function columnSummary(data, ads) {
  const sm = data.summary;
  const u = data.flowsheet.units[0];
  const flow = data.flowsheet.feed.flow_l_h;
  const list = comps().filter((c) => sm.components.includes(c.id));
  const targets = list.filter((c) => c.role === "remove");
  const met = Object.values(sm.met).every(Boolean);
  const keepOk = sm.keep_ok ?? (sm.keep_loss <= limit() + 1e-9);
  const beyond = sm.run_h === null || sm.run_h_beyond;
  const judgedText = targets.map((c) => `${c.name} ${pct(sm.judged[c.id], 0)}`).join(", ");
  const bedText = `지름 ${num(u.D)} × 길이 ${num(u.L)} m`;
  let verdict;
  if (sm.service_on) {
    if (!met) verdict = verdictBox("bad", `목표 미달 — 교체 시점 ${judgedText}`, "bed를 키우거나(4단계 모형 조절) 교체 주기를 줄이거나 다른 흡착제를 검토하세요.");
    else if (!keepOk) verdict = verdictBox("bad", `부적합 — 당 감소율 ${pct(sm.keep_loss)} (한도 ${num(state.params.keep_loss_max)} %)`, `제거 목표는 달성합니다 (${judgedText}). 당 선택성이 높은 흡착제를 비교하세요.`);
    else if (sm.dp_ok === false) verdict = verdictBox("bad", `부적합 — 압력강하 ${num(u.dP_kPa)} kPa (한도 ${num(state.params.dp_limit_bar * 100)} kPa)`, "제거 목표와 당 감소율은 만족합니다. 지름을 키우거나(짧고 넓게) 입자를 크게 하세요.");
    else verdict = verdictBox("ok", `목표 달성 — ${bedText} bed로 ${num(sm.service_h)} h 동안 목표 유지`,
      `${josa(ads.name, "을", "를")} ${num(sm.adsorbent_kg)} kg 충전하고 ${num(flow)} L/h로 통액, ${num(sm.service_h)} h마다 교체 (${judgedText}, 당 감소율 ${pct(sm.keep_loss)}).`);
  } else {
    verdict = verdictBox(keepOk ? "ok" : "bad",
      beyond ? `운전 가능 시간 > ${num(sm.horizon_h ?? sm.service_h)} h (계산 범위 안에서 파과 없음)` : `운전 가능 시간 ${fmt(sm.run_h, 1)} h`,
      `${bedText} bed, ${num(sm.adsorbent_kg)} kg 충전, ${num(flow)} L/h 통액 · 당 감소율 ${pct(sm.keep_loss)}${keepOk ? "" : " (한도 초과)"}`);
  }
  const perDay = sm.service_on && sm.service_h > 0 ? 24 / sm.service_h : null;
  const steps = recipe([
    ["1", "충전", `${num(sm.adsorbent_kg)} kg`, `${bedText} · ${num(u.V_m3 * 1000)} L`],
    ["2", "통액", `${num(flow)} L/h`, `공탑 체류시간 ${num(u.EBCT_min)} min · 압력강하 ${num(u.dP_kPa)} kPa`],
    ["3", sm.service_on ? "교체(재생)" : "교체 시점", sm.service_on ? `${num(sm.service_h)} h마다` : (beyond ? `> ${num(sm.horizon_h ?? sm.service_h)} h` : `${fmt(sm.run_h, 1)} h 후`),
      perDay ? `하루 ${num(perDay)}회 · 1회 처리량 ${num(flow * sm.service_h)} L` : "출구 농도를 측정해 교체"],
  ]);
  const product = data.flowsheet.product.C;
  const feedC = data.flowsheet.feed.C;
  const afterOf = (c) => (c.role === "keep" && sm.adsorbed ? feedC[c.id] * (1 - sm.adsorbed[c.id]) : product[c.id]);
  const issues = [...(sm.warnings || [])];
  const experiment = `같은 입자 크기로 소형 컬럼을 만들어 공탑 체류시간 ${num(u.EBCT_min)} min으로 통액하며 출구 농도를 측정 (파과곡선 확인)`;
  return card([verdict, steps,
    bars(list.map((c) => ({ c, before: feedC[c.id], after: afterOf(c) })),
      `· 제거 대상 = ${sm.service_on ? "교체 주기" : "운전"} 동안 모은 유출액 평균 · 보존 성분 = 흡착된 비율만큼 감소 (판정과 같은 기준)`),
    trustBox(issues, experiment)]);
}
