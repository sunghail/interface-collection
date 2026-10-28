// 직접 구성 공정: the table where the user lays out the beds in flow order.
// Each row is one bed (acid resin or CaO) with its own size, temperature, methanol ratio and
// whether a separator follows it; the server simulates exactly this train (rating mode).

import { h, fmt, toast } from "./util.js";
import { state, setTrain, isFresh } from "./store.js";
import { api } from "./api.js";

const MAX_UNITS = 8;
const KIND = {
  acid: { name: "산촉매", ratio: ": FFA", sep: "물·메탄올 제거", meohMin: 1,
    help: "원료 FFA 기준 메탄올 몰비 (Berrios 60 : 1, 최소 1 : 1)" },
  cao: { name: "CaO", ratio: ": TG", sep: "글리세롤·메탄올·물 제거", meohMin: 3,
    help: "들어오는 TG 기준 메탄올 몰비 (이론 3 : 1 이상, 보통 6 : 1)" },
};

/** The automatic design as an editable list of beds. */
export function trainFromAuto(result) {
  const p = state.params;
  const round = (x, d = 2) => Number(x.toFixed(d));
  return result.flowsheet.units.map((u) => ({
    kind: u.kind, L: round(u.L), D: round(u.D, 3), T: u.kind === "acid" ? p.t_stage1_c : p.t_stage2_c,
    meoh: u.kind === "acid" ? p.meoh_ffa : p.meoh_tg, separator: Boolean(u.separator),
  }));
}

/** A new bed copies the last bed of the same kind, or starts from the design settings. */
function newUnit(kind) {
  const same = [...state.train.units].reverse().find((u) => u.kind === kind);
  // a new CaO bed goes at the end of the train, so by default nothing is separated after it
  if (same) return { ...same, separator: kind === "acid" ? same.separator : false };
  const p = state.params;
  return kind === "acid"
    ? { kind, L: 3.5, D: 0.35, T: p.t_stage1_c, meoh: p.meoh_ffa, separator: true }
    : { kind, L: 4.0, D: 0.4, T: p.t_stage2_c, meoh: p.meoh_tg, separator: false };
}

function update(fn) {
  const units = state.train.units.map((u) => ({ ...u }));
  fn(units);
  setTrain({ units });
}

function add(kind) {
  if (state.train.units.length >= MAX_UNITS) { toast(`bed는 최대 ${MAX_UNITS}개까지입니다`, "warn"); return; }
  update((units) => {
    const unit = newUnit(kind);
    // an acid bed goes in front of the first CaO bed (pretreatment first); a CaO bed at the end
    const firstCao = units.findIndex((u) => u.kind === "cao");
    if (kind === "acid" && firstCao >= 0) units.splice(firstCao, 0, unit); else units.push(unit);
  });
}

async function fillFromAuto() {
  try {
    const auto = await api.steady({ ...state.params }, null);
    setTrain({ units: trainFromAuto(auto) });
    toast("자동 설계 공정을 불러왔습니다", "ok");
  } catch (error) {
    toast(`자동 설계를 가져오지 못했습니다: ${error.message}`, "bad");
  }
}

export function renderTrainEditor() {
  const units = state.train.units;
  const steady = state.results.steady;
  const results = isFresh(steady) && steady.data.flowsheet.mode === "custom" ? steady.data.flowsheet.units : null;
  const counts = { acid: 0, cao: 0 };
  const nCao = units.filter((u) => u.kind === "cao").length;
  const field = (i, key, { why = "", ...attrs } = {}) => h("input.num.cell-num", {
    type: "number", id: `train-${i}-${key}`, value: units[i][key], step: "any", ...attrs,
    onchange: (e) => {
      const value = Number(e.target.value);
      if (e.target.value === "" || !Number.isFinite(value)) { e.target.value = units[i][key]; return; }
      // same limits as the server; say so instead of letting it adjust the value silently
      const lo = Number(attrs.min), hi = Number(attrs.max);
      const inRange = Math.min(Math.max(value, lo), hi);
      if (inRange !== value) {
        toast(`${attrs["aria-label"]}: ${lo}–${hi} 범위로 조정했습니다${why}`, "warn");
        e.target.value = inRange;
      }
      update((list) => { list[i][key] = inRange; });
    },
  });

  const rows = units.map((u, i) => {
    counts[u.kind] += 1;
    const name = u.kind === "cao" && nCao === 1 ? "CaO bed" : `${KIND[u.kind].name} bed ${counts[u.kind]}`;
    const r = results?.[i];
    const outcome = !r ? "" : u.kind === "acid"
      ? `산가 ${fmt(r.av_in, 2)} → ${fmt(r.av_out, 2)}`
      : `전환율 ${fmt(r.conversion, 1)} % · FFA 입구 ${fmt(r.ffa_in_wt, 2)} %`;
    return h("tr", {}, [
      h("td.muted", {}, String(i + 1)),
      h("th", {}, h("span.bed-name", {}, [h("span.bed-dot", { class: `bed-dot ${u.kind}` }), name])),
      h("td", {}, field(i, "L", { min: 0.1, max: 30, "aria-label": `${name} 길이` })),
      h("td", {}, field(i, "D", { min: 0.05, max: 5, "aria-label": `${name} 지름` })),
      h("td", {}, field(i, "T", { min: 20, max: 120, "aria-label": `${name} 온도` })),
      h("td", { title: KIND[u.kind].help }, h("span.ratio", {}, [field(i, "meoh", { min: KIND[u.kind].meohMin, max: 200,
        "aria-label": `${name} 메탄올 몰비`, why: ` (반응에 필요한 최소량 ${KIND[u.kind].meohMin} : 1)` }),
        h("small.muted", {}, KIND[u.kind].ratio)])),
      h("td", { title: KIND[u.kind].sep }, h("label.sep-check", {}, [
        h("input", { type: "checkbox", id: `train-${i}-sep`, checked: u.separator || null,
          onchange: (e) => update((list) => { list[i].separator = e.target.checked; }) }),
        h("small.muted", {}, u.kind === "acid" ? "물" : "글리세롤"),
      ])),
      h("td.outcome", {}, outcome),
      h("td.row-actions", {}, [
        h("button.icon-btn", { title: "위로", disabled: i === 0 || null,
          onclick: () => update((list) => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; }) }, "↑"),
        h("button.icon-btn", { title: "아래로", disabled: i === units.length - 1 || null,
          onclick: () => update((list) => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; }) }, "↓"),
        h("button.icon-btn", { title: "빼기", disabled: units.length === 1 || null,
          onclick: () => update((list) => { list.splice(i, 1); }) }, "✕"),
      ]),
    ]);
  });

  return h("section.card.train-card", {}, [
    h("div.card-head", {}, [
      h("h2", {}, "공정 구성"),
      h("span.muted", {}, "위에서부터 흐름 순서 · 값을 바꾸면 곧바로 다시 계산"),
      h("span.spacer"),
      h("button.btn.small", { onclick: () => add("acid") }, [h("span.bed-dot.acid"), " + 산촉매 bed"]),
      h("button.btn.small", { onclick: () => add("cao") }, [h("span.bed-dot.cao"), " + CaO bed"]),
      h("button.btn.ghost.small", { onclick: fillFromAuto, title: "지금 조건의 자동 설계(목표를 맞추는 bed 개수·크기)로 표를 채웁니다" }, "자동 설계로 채우기"),
    ]),
    h("div.table-wrap", {}, h("table.data.compact.train-table", {}, [
      h("thead", {}, h("tr", {}, ["#", "bed", "길이 L (m)", "지름 D (m)", "온도 (°C)", "메탄올 몰비", "뒤 분리기", "결과", ""]
        .map((t) => h("th", {}, t)))),
      h("tbody", {}, rows),
    ])),
    h("p.table-note", {}, "메탄올 몰비는 산촉매 bed = 원료 FFA 기준, CaO bed = 들어오는 TG 기준이며, 흐름에 남아 있는 메탄올까지 합쳐 그 비율이 되도록 보충합니다. "
      + "분리기는 산촉매 뒤 = 물·메탄올, CaO 뒤 = 글리세롤·메탄올·물을 모두 뺀다고 봅니다. 속도식·충전층·원료·목표는 왼쪽 조건을 그대로 씁니다."),
  ]);
}
