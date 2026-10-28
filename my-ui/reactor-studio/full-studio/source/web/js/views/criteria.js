// 공정 › 판정 기준: every pass/fail check in one table — today's value, the limit (editable here or in
// 조건 › 판정 기준 / 설계 목표) and the verdict. The checks come from the server with the name of
// the setting they are judged against, so this table and the KPI cards always agree.

import { mount, h, fmt, isNum } from "../util.js";
import { state, setParams, setUi, emit, isFresh } from "../store.js";
import { soapBedId, loadingCard, errorCard } from "./common.js";

const GROUPS = [
  ["제품 규격", "바이오디젤 품질", ["conversion", "av_out", "ca"]],
  ["운전", "설비와 촉매 교체", ["dp", "life"]],
  ["물질전달 점검 (CaO bed)", "모델 가정(속도식 그대로 사용)이 맞는지", ["eta", "mears"]],
];
const DESIGN_TARGETS = new Set(["target_x", "target_av"]);
const LEVEL = { bad: "미달", warn: "주의" };
const OP = { ">=": "≥", "<=": "≤", "<": "<", ">": ">" };
const STATUS = { ok: "충족", warn: "주의", bad: "미달", info: "참고" };
const SOAP_ROWS = {
  life: { key: "life", label: "촉매 수명 (목표 유지)", unit: "h",
    criteria: [{ param: "life_min_h", level: "bad", op: ">=" }, { param: "life_warn_h", level: "warn", op: ">=" }] },
  ca: { key: "ca", label: "출구 Ca", unit: "mg/kg", criteria: [{ param: "ca_max", level: "bad", op: "<=" }] },
};

export function renderCriteria(root) {
  const steady = state.results.steady;
  if (!steady?.data) {
    mount(root, steady?.error ? errorCard(steady.error) : loadingCard("계산 중…"));
    return;
  }
  const { summary, profiles } = steady.data;
  const checks = {};
  for (const k of summary.kpis) checks[k.key] = k;
  const cao = profiles.find((p) => p.id === soapBedId(profiles));
  for (const k of cao?.kpis || []) if (k.key === "eta" || k.key === "mears") checks[k.key] = k;
  const deact = state.results.deact;
  const soapReady = state.ui.soap && isFresh(deact);
  for (const key of ["life", "ca"]) {
    checks[key] = soapReady ? deact.data.kpis.find((k) => k.key === key) : { ...SOAP_ROWS[key], pending: true };
  }

  const all = Object.values(checks).filter((k) => !k.pending);
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
    h("p.table-note", {}, "기준 값은 왼쪽 조건 › 판정 기준(전환율·산가 목표는 설계 목표)과 같은 설정입니다. "
      + "산촉매 bed의 출구 산가도 목표 산가로, CaO bed 입구 FFA도 목표 산가로 판정합니다."),
  );
}

function row(k) {
  const spec = Object.fromEntries(state.spec.parameters.map((p) => [p.name, p]));
  const value = k.pending ? null : k.text ?? (isNum(k.value) ? `${fmt(k.value, k.digits ?? 2)}${k.unit ? " " + k.unit : ""}`
    : k.key === "life" ? "계속 유지" : "–");
  const status = k.pending ? null : k.status;
  const limits = h("div.crit-limits", {}, (k.criteria || []).map((c) => limitInput(c, spec[c.param], k)));
  const use = (k.criteria || []).some((c) => DESIGN_TARGETS.has(c.param)) ? "자동 설계 목표 + 판정" : "판정만";
  return h("tr", { class: status ? `crit-row ${status}` : "crit-row pending" }, [
    h("th", {}, [h("div", {}, k.label), k.target && !k.pending ? h("small.muted", {}, k.target) : null]),
    h("td.crit-value", {}, k.pending ? soapHint() : value),
    h("td", {}, limits),
    h("td", {}, status ? h("span.crit-status", { class: `crit-status ${status}` }, STATUS[status] || status) : h("span.muted", {}, "–")),
    h("td.muted.small", {}, k.key === "life" || k.key === "ca" ? `${use} · 비누화 계산 필요` : use),
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

/** Show the failing side ("미달 < 96.5 %") — it reads more directly than the pass condition. */
const failingSide = (op) => ({ ">=": "<", "<=": ">", "<": "≥", ">": "≤" }[op] || OP[op]);

function soapHint() {
  const deact = state.results.deact;
  if (deact?.loading) return h("span.muted", {}, "비누화 계산 중…");
  return h("button.btn.small", {
    onclick: () => { if (!state.ui.soap) setUi({ soap: true }); emit("need", { kind: "deact", force: true }); },
  }, state.ui.soap ? "비누화 계산" : "비누화 켜고 계산");
}
