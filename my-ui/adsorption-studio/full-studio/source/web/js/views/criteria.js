// 공정 › 판정 기준: every pass/fail check in one table — today's value, the limit (editable here or in
// ⚙ 모든 설정 › 판정 기준 / 목표) and the verdict. The checks come from the server with the name of the setting
// they are judged against, so this table and the KPI cards always agree.

import { mount, h, fmt, isNum } from "../util.js";
import { state, setParams, setUi, emit } from "../store.js";
import { loadingCard, errorCard } from "./common.js";

const GROUPS = [
  ["제거 목표", "성분별 목표 제거율과 교체 주기", ["removal", "run"]],
  ["제품 품질", "보존 성분(당)의 감소율", ["keep_loss"]],
  ["설비", "펌프와 흡착제 질량", ["dp", "adsorbent"]],
  ["모델 점검 (bed별 가장 나쁜 값)", "1차원 흐름 모델의 가정이 맞는지", ["pe", "ldp"]],
];
const DESIGN_TARGETS = new Set(["service_h"]);
const LEVEL = { bad: "미달", warn: "주의" };
const STATUS = { ok: "충족", warn: "주의", bad: "미달", info: "참고" };

export function renderCriteria(root) {
  const steady = state.results.steady;
  if (!steady?.data) {
    mount(root, steady?.error ? errorCard(steady.error) : loadingCard("계산 중…"));
    return;
  }
  const { summary, profiles } = steady.data;
  const checks = {};
  for (const k of summary.kpis) checks[k.key] = k;
  // the bed checks: the worst bed of the train
  for (const key of ["pe", "ldp"]) {
    const all = profiles.map((p) => p.kpis.find((k) => k.key === key)).filter(Boolean);
    if (all.length) checks[key] = all.reduce((a, b) => (b.value < a.value ? b : a));
  }
  const all = Object.values(checks);
  const count = (s) => all.filter((k) => k.status === s).length;
  mount(root,
    h("div.subhead", {}, [
      h("h2", {}, "판정 기준"),
      h("span.muted", {}, "기준을 바꾸면 위쪽 카드·흐름도 색·보고서·최적화 제약이 같은 값으로 다시 판정됩니다"),
      h("span.spacer"),
      h("span.crit-count.ok", {}, `충족 ${count("ok")}`),
      h("span.crit-count.warn", {}, `주의 ${count("warn")}`),
      h("span.crit-count.bad", {}, `미달 ${count("bad")}`),
    ]),
    ...GROUPS.map(([title, note, keys]) => h("section.card.tight.crit-card", {}, [
      h("div.card-head", {}, [h("h2", {}, title), h("span.muted", {}, note)]),
      h("div.table-wrap", {}, h("table.data.compact.crit-table", {}, [
        h("thead", {}, h("tr", {}, ["항목", "지금 값", "기준", "판정", "쓰임"].map((t) => h("th", {}, t)))),
        h("tbody", {}, keys.filter((key) => checks[key]).map((key) => row(checks[key]))),
      ])),
    ])),
    targetsCard(summary),
    h("p.table-note", {}, "성분별 역할·목표 제거율은 왼쪽 '목표'에서, 나머지 기준은 여기 또는 ⚙ 모든 설정 › 판정 기준에서 바꿉니다."),
  );
}

function row(k) {
  const spec = Object.fromEntries(state.spec.parameters.map((p) => [p.name, p]));
  const value = k.text ?? (isNum(k.value) ? `${fmt(k.value, k.digits ?? 2)}${k.unit ? " " + k.unit : ""}` : "–");
  const limits = h("div.crit-limits", {}, (k.criteria || []).map((c) => limitInput(c, spec[c.param], k)));
  const use = (k.criteria || []).some((c) => DESIGN_TARGETS.has(c.param)) ? "자동 설계 목표 + 판정"
    : k.criteria?.length ? "판정만" : "참고";
  return h("tr", { class: `crit-row ${k.status}` }, [
    h("th", {}, [h("div", {}, k.label), k.target ? h("small.muted", {}, k.target) : null]),
    h("td.crit-value", {}, value),
    h("td", {}, limits),
    h("td", {}, h("span.crit-status", { class: `crit-status ${k.status}` }, STATUS[k.status] || k.status)),
    h("td.muted.small", {}, use),
  ]);
}

function limitInput(c, p, k) {
  if (!p) return null;
  const input = h("input.num.cell-num", {
    type: "number", id: `crit-${c.param}`, value: state.params[c.param], min: p.min, max: p.max, step: p.step,
    "aria-label": `${k.label} ${LEVEL[c.level]} 기준`,
    onchange: (e) => {
      const value = Number(e.target.value);
      if (e.target.value === "" || !Number.isFinite(value)) { e.target.value = state.params[c.param]; return; }
      setParams({ [c.param]: Math.min(Math.max(value, p.min), p.max) });
      emit("params-external");
    },
  });
  const extra = c.param === "dp_limit_bar" ? h("small.muted", {}, `= ${fmt(state.params.dp_limit_bar * 100, 0)} kPa`) : null;
  return h("label.crit-limit", { title: p.help }, [
    h("span", { class: `crit-level ${c.level}` }, LEVEL[c.level]), h("span.muted", {}, failingSide(c.op)),
    input, h("small.muted", {}, p.unit), extra,
  ]);
}

/** Show the failing side ("미달 < 24 h") — it reads more directly than the pass condition. */
const failingSide = (op) => ({ ">=": "<", "<=": ">", "<": "≥", ">": "≤" }[op] || op);

function targetsCard(summary) {
  const targets = Object.keys(summary.targets);
  if (!targets.length) return null;
  const names = summary.names;
  return h("section.card.tight.crit-card", {}, [
    h("div.card-head", {}, [h("h2", {}, "성분별 제거 목표"),
      h("span.muted", {}, summary.judge_avg ? "교체 주기 동안 모은 제품의 누적 평균" : "교체 시점의 출구 농도"),
      h("span.spacer"),
      h("small.muted", {}, "목표는 왼쪽 '목표'에서 바꿉니다")]),
    h("div.table-wrap", {}, h("table.data.compact.crit-table", {}, [
      h("thead", {}, h("tr", {}, ["성분", "지금 값", "목표", "판정", "유지 시간"].map((t) => h("th", {}, t)))),
      h("tbody", {}, targets.map((c) => h("tr", { class: `crit-row ${summary.met[c] ? "ok" : "bad"}` }, [
        h("th", {}, names[c]),
        h("td.crit-value", {}, `${fmt(summary.judged[c] * 100, 1)} %`),
        h("td", {}, `≥ ${summary.targets[c]} %`),
        h("td", {}, h("span.crit-status", { class: `crit-status ${summary.met[c] ? "ok" : "bad"}` }, summary.met[c] ? "충족" : "미달")),
        h("td", {}, summary.hold_h[c] === null ? "계산 기간 내내" : `${fmt(summary.hold_h[c], 1)} h`),
      ]))),
    ])),
  ]);
}
