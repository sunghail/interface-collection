// 공정 구성 (직접 구성): the table where the user lays out the beds in flow order.
// Each row is one bed: which adsorbent, and its size — fixed L × D, or "자동" (sized to the targets it handles);
// the server simulates exactly this train, the outlet of each bed feeding the next.

import { h, fmt, toast } from "./util.js";
import { state, setTrain, isFresh } from "./store.js";
import { api } from "./api.js";
import { kindDot } from "./views/common.js";

const LIMITS = { L: [0.01, 30], D: [0.005, 10] };

/** The automatic design as an editable list of beds. */
export function trainFromAuto(result) {
  const round = (x, d = 3) => Number(x.toPrecision(d));
  return result.flowsheet.units.map((u) => ({ ads: u.ads, auto: false, L: round(u.L), D: round(u.D) }));
}

function update(fn) {
  const units = state.train.units.map((u) => ({ ...u }));
  fn(units);
  setTrain({ units });
}

function add(ads) {
  if (state.train.units.length >= state.spec.limits.units) { toast(`bed는 최대 ${state.spec.limits.units}개까지입니다`, "warn"); return; }
  const last = state.train.units[state.train.units.length - 1];
  update((units) => units.push({ ads, auto: true, L: last?.L ?? 1, D: last?.D ?? 0.3 }));
}

async function fillFromAuto() {
  try {
    const auto = await api.steady({ ...state.params }, state.train.auto.length
      ? { mode: "auto", units: state.train.auto.map((ads) => ({ ads, auto: true })) } : null, state.project);
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
  const adsList = state.project.adsorbents;
  const names = Object.fromEntries(state.project.components.map((c) => [c.id, c.name]));
  const field = (i, key, label) => {
    const u = units[i];
    const [lo, hi] = LIMITS[key];
    return h("input.num.cell-num", {
      type: "number", id: `train-${i}-${key}`, value: u.auto ? "" : u[key], step: "any", min: lo, max: hi,
      placeholder: u.auto ? "자동" : "", disabled: u.auto || null, "aria-label": `${i + 1}번 bed ${label}`,
      onchange: (e) => {
        const value = Number(e.target.value);
        if (e.target.value === "" || !Number.isFinite(value)) { e.target.value = u[key]; return; }
        const inRange = Math.min(Math.max(value, lo), hi);
        if (inRange !== value) { toast(`${label}: ${lo}–${hi} m 범위로 조정했습니다`, "warn"); e.target.value = inRange; }
        update((list) => { list[i][key] = inRange; });
      },
    });
  };

  const rows = units.map((u, i) => {
    const ads = adsList.find((a) => a.id === u.ads);
    const r = results?.[i];
    const outcome = !r ? "" : `${fmt(r.mass_kg, r.mass_kg < 10 ? 2 : 0)} kg · EBCT ${fmt(r.EBCT_min, 1)} min`
      + (r.assigned.length ? ` · ${r.assigned.map((c) => names[c]).join(", ")}` : "");
    return h("tr", {}, [
      h("td.muted", {}, String(i + 1)),
      h("th", {}, h("span.bed-name", {}, [kindDot(ads?.kind || "other"), h("select", {
        "aria-label": `${i + 1}번 bed 흡착제`,
        onchange: (e) => update((list) => { list[i].ads = e.target.value; }),
      }, adsList.map((a) => h("option", { value: a.id, selected: a.id === u.ads || null }, a.name)))])),
      h("td", {}, h("label.sep-check", { title: "켜면 이 bed가 맡은 제거 대상을 교체 주기 동안 지키는 크기로 정합니다" }, [
        h("input", { type: "checkbox", checked: u.auto || null,
          onchange: (e) => update((list) => {
            list[i].auto = e.target.checked;
            if (!e.target.checked && r) { list[i].L = Number(r.L.toPrecision(3)); list[i].D = Number(r.D.toPrecision(3)); }
          }) }),
        h("small.muted", {}, "자동"),
      ])),
      h("td", {}, field(i, "L", "길이")),
      h("td", {}, field(i, "D", "지름")),
      h("td.outcome", {}, outcome),
      h("td.row-actions", {}, [
        h("button.icon-btn", { title: "위로", disabled: i === 0 || null,
          onclick: () => update((list) => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; }) }, "↑"),
        h("button.icon-btn", { title: "아래로", disabled: i === units.length - 1 || null,
          onclick: () => update((list) => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; }) }, "↓"),
        h("button.icon-btn", { title: "목록에서 제외", disabled: units.length === 1 || null,
          onclick: () => update((list) => { list.splice(i, 1); }) }, "✕"),
      ]),
    ]);
  });

  return h("section.card.train-card", {}, [
    h("div.card-head", {}, [
      h("h2", {}, "공정 구성"),
      h("span.muted", {}, "위에서부터 흐름 순서 · 앞 bed 출구가 다음 bed 입구 · 값을 바꾸면 곧바로 다시 계산"),
      h("span.spacer"),
      h("label.inline-select", {}, ["+ bed ", h("select", {
        onchange: (e) => { if (e.target.value) add(e.target.value); e.target.value = ""; },
      }, [h("option", { value: "" }, "흡착제 고르기…"), ...adsList.map((a) => h("option", { value: a.id }, a.name))])]),
      h("button.btn.ghost.small", { onclick: fillFromAuto, title: "지금 조건의 자동 설계(목표를 맞추는 bed 크기)로 표를 채웁니다" }, "자동 설계로 채우기"),
    ]),
    h("div.table-wrap", {}, h("table.data.compact.train-table", {}, [
      h("thead", {}, h("tr", {}, ["#", "흡착제", "크기", "길이 L (m)", "지름 D (m)", "결과", ""].map((t) => h("th", {}, t)))),
      h("tbody", {}, rows),
    ])),
    h("p.table-note", {}, "'자동'인 bed는 그 흡착제의 K_d가 가장 큰 제거 대상(K_d가 가장 큰 bed가 맡음)을 교체 주기 동안 지키는 크기로 정하고, "
      + "나머지는 넣은 L × D 그대로 계산합니다. 유량·조성·목표·교체 주기는 왼쪽 조건을 씁니다."),
  ]);
}

