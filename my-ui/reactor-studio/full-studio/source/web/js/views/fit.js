// 속도 피팅 (단일 bed): fit the selected bed's rate law to measured points, then push it into the simulation.

import { mount, h, fmt, fmtSmart, toast } from "../util.js";
import { state, setParams, setUi, emit } from "../store.js";
import { api } from "../api.js";
import { createChart } from "../chart.js";
import { SCENARIO_COLORS } from "../theme.js";
import { loadingCard, grid, subhead } from "./common.js";
import { control, presetGroup, CAO_KINETICS_PRESETS, ACID_KINETICS_PRESETS } from "../settings.js";

/** The rate law the simulation uses now: literature presets and the numbers themselves. */
function kineticsCard(target) {
  const cao = target === "cao";
  return h("section.card.kinetics-card", {}, [
    h("div.card-head", {}, [h("h2", {}, "지금 쓰는 속도식"),
      h("span.muted", {}, cao ? "CaO: 유사 1차, k(T) = k(60 °C)·exp(−Ea/R·(1/T − 1/333 K))" : "산촉매: Berrios 2007 가역 속도식에 곱하는 배수")]),
    presetGroup(cao ? CAO_KINETICS_PRESETS : ACID_KINETICS_PRESETS),
    h("div.inline-controls", {}, (cao ? ["k_cao_60", "ea_cao"] : ["acid_k1_mult", "acid_k2_mult"])
      .map((name) => control(name, { compact: true, id: "fit" }))),
  ]);
}

// kept per target, so switching beds and coming back keeps what was typed
const locals = {};
const TARGET_TEXT = { cao: "CaO bed — 전이에스테르화 (TG → FAME), 유사 1차 k·Ea", acid: "산촉매 bed — 에스테르화 (FFA → FAME), 정·역반응 속도 배수" };
let local = null;

const FORMAT_HELP = [
  ["target", "cao (CaO 전이에스테르화) 또는 acid (산촉매 에스테르화)"],
  ["dataset", "같은 조건의 점 묶음 이름 (그래프 범례)"],
  ["source", "출처와 신뢰도 표기"],
  ["temperature_c", "온도 °C — 두 종류 이상이어야 활성화에너지를 맞출 수 있음"],
  ["x_type / x", "time_min (회분식 시간) 또는 tau_min (bed 체류시간), 분"],
  ["y_type / y", "conversion_pct (전환율 %) 또는 acid_value (산가)"],
  ["weight", "가중치 (선택, 기본 1)"],
  ["av0", "산촉매 데이터의 입구 산가 (acid일 때 필수)"],
];

export function renderFit(root, target) {
  local = (locals[target] ||= { target, dataset: "", csv: "", fitEa: true, datasets: null, result: null, busy: false, error: "" });
  const draw = () => renderFit(root, target);
  if (!local.datasets) {
    local.datasets = [];
    api.datasets().then((r) => { local.datasets = r.datasets; draw(); })
      .catch((e) => { local.error = e.message; draw(); });
  }

  const choose = (name) => {
    local.dataset = name;
    if (!name) return draw();
    api.dataset(name).then((r) => {
      local.csv = r.text;
      draw();
    });
  };

  const textarea = h("textarea.csv", { rows: 12, spellcheck: "false",
    placeholder: "CSV를 붙여 넣거나 위에서 예제 파일을 고르세요",
    oninput: (e) => { local.csv = e.target.value; local.dataset = ""; } });
  textarea.value = local.csv;

  const controls = h("section.card.fit-controls", {}, [
    h("div.card-head", {}, [h("h2", {}, "데이터")]),
    h("p.muted.small", {}, TARGET_TEXT[target]),
    h("div.field", {}, [h("span.field-label", {}, "예제"), h("select", { onchange: (e) => choose(e.target.value) }, [
      h("option", { value: "" }, "직접 입력"),
      ...(local.datasets || []).filter((d) => !d.targets?.length || d.targets.includes(target)).map((d) => h("option", { value: d.name, selected: d.name === local.dataset || null },
        `${d.name} — ${d.description}`)),
    ])]),
    textarea,
    local.target === "cao" ? h("label.check", {}, [
      h("input", { type: "checkbox", checked: local.fitEa || null, onchange: (e) => { local.fitEa = e.target.checked; } }),
      "활성화에너지도 맞추기 (온도가 두 종류 이상일 때)",
    ]) : null,
    h("div.row", {}, [
      h("button.btn.primary", { disabled: local.busy || null, onclick: runFit(draw) }, local.busy ? "피팅 중…" : "피팅 실행"),
    ]),
    h("details.format-help", {}, [
      h("summary", {}, "CSV 형식"),
      h("table.data.small", {}, h("tbody", {}, FORMAT_HELP.map(([k, v]) => h("tr", {}, [h("th", {}, k), h("td", {}, v)])))),
      h("p.muted.small", {}, "예제 중 'synthetic'은 도구 검증용 합성 데이터입니다. 실제 값을 구하려면 실험값이나 논문 그래프에서 읽은 점을 넣으세요."),
    ]),
  ]);

  mount(root,
    kineticsCard(target),
    subhead("속도 피팅", "측정한 점(논문 그래프에서 읽은 값이나 실험값)에 속도식을 맞추고, 결과를 바로 시뮬레이션에 적용"),
    h("div.fit-layout", {}, [controls, results(draw)]),
  );
}

function runFit(draw) {
  return async () => {
    if (!local.csv.trim()) { toast("데이터를 넣으세요", "warn"); return; }
    local.busy = true; local.error = ""; draw();
    try {
      local.result = await api.fit(local.target, local.csv, local.fitEa);
    } catch (error) {
      local.result = null;
      local.error = error.message;
    }
    local.busy = false;
    draw();
  };
}

function results(draw) {
  if (local.busy) return h("section.card", {}, loadingCard("피팅 중…"));
  if (local.error) return h("section.card", {}, h("div.placeholder.error", {}, [h("b", {}, "피팅하지 못했습니다"), h("div.muted", {}, local.error)]));
  const r = local.result;
  if (!r) {
    return h("section.card.empty-state", {}, [
      h("h2", {}, "결과가 여기에 나옵니다"),
      h("p.muted", {}, "왼쪽에서 예제 파일을 고르고 '피팅 실행'을 눌러 보세요. 합성 예제는 정답(k = 0.060, Ea = 60)을 알고 있어서 도구가 제대로 맞추는지 확인할 수 있습니다."),
    ]);
  }
  const apply = () => {
    const values = Object.fromEntries(r.parameters.filter((p) => p.free)
      .map((p) => [p.apply_to, Number(p.fitted.toPrecision(4))]));
    setParams(values);
    emit("params-external");
    toast("피팅 값을 시뮬레이션 조건에 적용했습니다", "ok");
    setUi({ bedView: "z" });
  };
  const series = r.groups.flatMap((g, i) => {
    const color = SCENARIO_COLORS[(i + 1) % SCENARIO_COLORS.length];
    return [
      { name: `${g.dataset} (측정)`, color, x: g.x, y: g.y, mode: "markers" },
      { name: `${g.dataset} (피팅)`, color, x: g.grid, y: g.fitted, width: 2.4 },
      { name: `${g.dataset} (문헌값)`, color, x: g.grid, y: g.baseline, dash: "5 4", width: 1.3 },
    ];
  });
  return h("section.card.fit-result", {}, [
    h("div.card-head", {}, [h("h2", {}, `${r.target_label} 피팅 결과`),
      h("span.muted", {}, `${r.n_points}개 점 · ${r.temperatures_c.join(", ")} °C`)]),
    h("div.metric-row", {}, [
      metric("오차 (문헌값)", fmt(r.before.nrmse, 3), "NRMSE"),
      h("span.arrow", {}, "→"),
      metric("오차 (피팅)", fmt(r.after.nrmse, 3), "NRMSE", r.after.nrmse < r.before.nrmse ? "good" : ""),
    ]),
    h("div.table-wrap", {}, h("table.data", {}, [
      h("thead", {}, h("tr", {}, ["파라미터", "문헌값", "피팅값", "비율", ""].map((t) => h("th", {}, t)))),
      h("tbody", {}, r.parameters.map((p) => h("tr", {}, [
        h("th", {}, p.label),
        h("td", {}, `${fmtSmart(p.baseline, 4)} ${p.unit}`),
        h("td", {}, h("b", {}, `${fmtSmart(p.fitted, 4)} ${p.unit}`)),
        h("td", {}, fmt(p.fitted / p.baseline, 2)),
        h("td.muted", {}, p.free ? "" : "고정"),
      ]))),
    ])),
    r.notes.length ? h("ul.notes-list", {}, r.notes.map((n) => h("li", {}, n))) : null,
    grid([createChart({ title: "측정값과 모델", caption: "점: 측정 · 실선: 피팅 · 점선: 문헌값",
      xLabel: r.x_label, yLabel: r.y_label, yMin: 0, series, height: 320 })], "single"),
    h("div.row.end", {}, [h("button.btn.primary", { onclick: apply }, "이 값을 시뮬레이션에 적용")]),
  ]);
}

function metric(label, value, unit, cls = "") {
  return h("div.metric", { class: `metric ${cls}` }, [h("span.muted", {}, label), h("b", {}, value), h("small.muted", {}, unit)]);
}
