// One reactor in detail, used two ways:
//   renderSingle      단일 bed — a bed on its own, with its own inlet and size (left panel)
//   renderProcessBed  공정 › bed별 — one bed of the process train
// Views: z  composition / conversion along the bed (with 비누화 on, the CaO bed at a chosen time)
//        t  what leaves the bed over time: start-up (minutes) and, with 비누화 on, catalyst life (hours)
//        fit (단일 bed only) fit this bed's rate law to measured points

import { mount, h, fmt } from "../util.js";
import { state, setUi, emit, isFresh, requestParams } from "../store.js";
import { createChart } from "../chart.js";
import { SPECIES_COLOR, SPECIES_NAME, timeColor } from "../theme.js";
import {
  Z_LABEL, currentBed, soapBedId, loadingCard, errorCard, soapPrompt, grid, subhead,
  compositionChart, conversionChart, acidValueChart,
} from "./common.js";
import { renderFit } from "./fit.js";
import { control } from "../settings.js";

/** Small inline settings in a chart group's heading (calculation time, curve points). */
const inline = (...names) => h("div.inline-controls", {}, names.map((name) => control(name, { compact: true, id: "t" })));

let playTimer = null;

export function renderSingle(root) {
  clearInterval(playTimer);
  playTimer = null;
  // fitting needs only the bed kind, so it works even when the bed cannot be sized
  if (state.ui.bedView === "fit") { renderFit(root, state.single.kind); return; }
  const steady = state.results.steady;
  if (!steady?.data || steady.error) {
    mount(root, steady?.error ? errorCard(steady.error) : loadingCard("계산 중…"));
    return;
  }
  const profile = steady.data.profiles[0];
  const warnings = steady.data.summary.warnings || [];
  const soap = profile.kind === "cao" && state.ui.soap;
  mount(root,
    warnings.length ? h("div.notes-strip", {}, [h("b", {}, "확인할 점"), h("ul", {}, warnings.map((w) => h("li", {}, w)))]) : null,
    ...(state.ui.bedView === "t" ? timeBlocks(profile, soap) : zBlocks(profile, soap)));
}

export function renderProcessBed(root) {
  clearInterval(playTimer);
  playTimer = null;
  const steady = state.results.steady;
  if (!steady?.data) {
    mount(root, steady?.error ? errorCard(steady.error) : loadingCard("계산 중…"));
    return;
  }
  const profile = currentBed(steady.data.profiles);
  const soap = profile.id === soapBedId(steady.data.profiles) && state.ui.soap;
  mount(root, ...(state.ui.procBedView === "t" ? timeBlocks(profile, soap) : zBlocks(profile, soap)));
}

// ---------------------------------------------------------------------------------- z
function steadyCharts(p) {
  const params = requestParams();   // 단일 bed has its own targets
  const charts = [compositionChart(p), conversionChart(p, params.target_x)];
  if (p.kind === "acid") charts.push(acidValueChart(p, params.target_av));
  return grid(charts);
}

function zBlocks(profile, soap) {
  const note = "입구(z = 0)에서 출구까지 · 오래 운전해 안정된 정상상태";
  if (!soap) return [subhead("위치별 분포", note), steadyCharts(profile)];
  const deact = state.results.deact;
  if (!isFresh(deact)) {
    return [soapPrompt(), subhead("위치별 분포 (비누화 없이, 새 촉매)", note), steadyCharts(profile)];
  }
  return [soapTimeline(deact.data)];
}

/** Slider + play over the saponification snapshots; only this block redraws while dragging. */
function soapTimeline(d) {
  const snaps = d.snapshots;
  let index = state.ui.snap < 0 || state.ui.snap >= snaps.length ? snaps.length - 1 : state.ui.snap;
  const chartsBox = h("div");
  const timeValue = h("b.time-value");
  const slider = h("input.slider.time-slider", { type: "range", min: 0, max: snaps.length - 1, step: 1,
    "aria-label": "운전 시간", oninput: (e) => show(Number(e.target.value)) });
  const play = h("button.btn.small", { onclick: () => {
    if (playTimer) { stop(); return; }
    play.textContent = "■ 멈춤";
    let i = 0;
    show(0);
    playTimer = setInterval(() => { i += 1; if (i >= snaps.length) stop(); else show(i); }, 850);
  } }, "▶ 재생");
  const stop = () => { clearInterval(playTimer); playTimer = null; play.textContent = "▶ 재생"; };
  const show = (i) => {
    index = i;
    slider.value = String(i);
    timeValue.textContent = `${fmt(snaps[i].t_h, 1)} h`;
    setUi({ snap: i }, { silent: true });
    chartsBox.replaceChildren(soapCharts(d, snaps, i));
  };
  show(index);
  return h("div", {}, [
    h("div.time-control", {}, [
      h("span.filter-label", {}, "운전 시간"), slider, timeValue, play,
      h("span.muted.small", {}, `비누화 포함 · 선단 속도 ${fmt(d.front_speed_mm_h, 1)} mm/h — 움직이면 입구부터 촉매가 소모되는 모습`),
    ]),
    chartsBox,
  ]);
}

function soapCharts(d, snaps, index) {
  const snap = snaps[index];
  const params = requestParams();   // 단일 bed has its own targets
  const many = (title, caption, yLabel, pick, extra = {}) => createChart({
    title, caption, xLabel: Z_LABEL, yLabel, yMin: 0, ...extra,
    series: snaps.map((sn, i) => ({ name: `${fmt(sn.t_h, 1)} h`, color: timeColor(i, snaps.length),
      x: d.z, y: pick(sn), width: i === index ? 3.4 : 1.3 })),
  });
  return grid([
    createChart({
      title: `조성 — 운전 ${fmt(snap.t_h, 1)} h`,
      caption: "왼쪽: 액체 전체 기준 · 오른쪽: FFA·칼슘 비누 (오일 기준)",
      xLabel: Z_LABEL, yLabel: "wt% (액체 전체)", rightLabel: "wt% (오일 기준)",
      series: [
        ...["TG", "MeOH", "FAME", "GL"].map((k) => ({ name: SPECIES_NAME[k], color: SPECIES_COLOR[k], x: d.z, y: snap.mass_fraction[k] })),
        ...["FFA", "CaSoap"].map((k) => ({ name: SPECIES_NAME[k], color: SPECIES_COLOR[k], x: d.z, y: snap.oil_basis[k],
          axis: "right", dash: k === "CaSoap" ? "6 4" : null })),
      ],
    }),
    many("TG 전환율 — 시간별", "시간이 지날수록 곡선이 오른쪽으로 밀림 = 입구 촉매가 죽음", "전환율 (%)",
      (sn) => sn.tg_conversion, { yMax: 100, hlines: [{ y: params.target_x, label: `목표 ${params.target_x}%` }] }),
    many("비활성화된 촉매", "비누로 바뀐 촉매의 비율. 입구부터 차례로 100 %가 됩니다", "비활성화 (%)",
      (sn) => sn.deactivated_pct, { yMax: 100 }),
    many("bed 안 FFA", "살아 있는 촉매가 있는 동안 FFA는 입구 근처에서 비누로 잡힙니다", "FFA (mol/m³)", (sn) => sn.ffa),
  ]);
}

// ---------------------------------------------------------------------------------- t
function timeBlocks(profile, soap) {
  const blocks = [];
  if (soap) {
    const deact = state.results.deact;
    blocks.push(h("div.subhead", {}, [h("h2", {}, "촉매 수명 (비누화)"),
      h("span.muted", {}, "시간 단위 · FFA가 CaO를 비누로 바꾸며 전환율이 떨어짐"), h("span.spacer"), inline("deact_end_h")]));
    blocks.push(isFresh(deact) ? lifetimeCharts(deact.data) : soapPrompt());
  }
  blocks.push(...startup(profile));
  return blocks;
}

function startup(profile) {
  const slot = state.results.transient[profile.id];
  if (!isFresh(slot)) emit("need", { kind: "transient", bed: profile.id });
  const head = (facts) => h("div.subhead", {}, [h("h2", {}, "시동 과정"),
    h("span.muted", {}, facts || "메탄올로 채운 bed에 원료를 넣기 시작한 뒤 출구 변화 (분 단위)"),
    h("span.spacer"), inline("t_end_min", "n_times")]);
  if (!slot?.data) {
    return [head(), slot?.error ? errorCard(slot.error, () => emit("need", { kind: "transient", bed: profile.id, force: true }))
      : loadingCard("시동 과정 계산 중… (몇 초)")];
  }
  const d = slot.data;
  const acid = profile.kind === "acid";
  const t = d.t_min;
  const params = requestParams();   // 단일 bed has its own targets
  const main = Object.keys(d.outlet).filter((k) => k !== "MeOH");
  const charts = [
    createChart({
      title: "출구 농도", caption: "처음엔 채워 둔 메탄올만 나오다가, 원료가 도착하면 제품이 나옵니다",
      xLabel: "시간 t (min)", yLabel: "농도 (mol/m³)", rightLabel: "메탄올 (mol/m³)",
      series: [
        ...main.map((k) => ({ name: SPECIES_NAME[k], color: SPECIES_COLOR[k], x: t, y: d.outlet[k] })),
        { name: SPECIES_NAME.MeOH, color: SPECIES_COLOR.MeOH, x: t, y: d.outlet.MeOH, axis: "right", dash: "6 4" },
      ],
      vlines: [{ x: d.tau_min, label: "τ" }],
    }),
    createChart({
      title: "출구 성분별 전환율", caption: "원료가 출구에 도착한 뒤의 값이 의미 있습니다",
      xLabel: "시간 t (min)", yLabel: "전환율 (%)", yMin: 0, yMax: 100,
      series: reactantSeries(d.outlet_conversion, t),
      hlines: acid ? [] : [{ y: params.target_x, label: `목표 ${params.target_x}%` }],
    }),
  ];
  if (acid) {
    charts.push(createChart({
      title: "출구 산가", xLabel: "시간 t (min)", yLabel: "산가 (mg KOH/g)", yMin: 0,
      series: [{ name: "산가", color: SPECIES_COLOR.FFA, x: t, y: d.outlet_acid_value }],
      hlines: [{ y: params.target_av, label: `목표 ${params.target_av}` }],
    }));
  }
  return [head(`τ ${fmt(d.tau_min, 1)} min · 원료 도착 ${fmt(d.arrival_min, 0)} min · 정상상태 ${fmt(d.steady_min, 0)} min`),
    grid(charts)];
}

/** Outlet conversion of the reactants over time. Methanol is left out: the bed starts full of it, so its
 * "conversion" dips far below zero while it is flushed out and would squash the TG/FFA curves. */
function reactantSeries(conversion, x) {
  return Object.entries(conversion).filter(([k]) => k !== "MeOH")
    .map(([k, y]) => ({ name: SPECIES_NAME[k], color: SPECIES_COLOR[k], x, y }));
}

function lifetimeCharts(d) {
  const params = requestParams();   // 단일 bed has its own targets
  const main = Object.keys(d.outlet).filter((k) => k !== "MeOH");
  const life = d.time_to_target_h;
  return grid([
    createChart({
      title: "출구 성분별 전환율", caption: "촉매가 입구부터 죽으면서 TG 전환율이 떨어집니다. FFA 전환율 = 비누로 잡힌 비율",
      xLabel: "운전 시간 t (h)", yLabel: "전환율 (%)", yMin: 0, yMax: 100,
      series: reactantSeries(d.outlet_conversion, d.t_h),
      hlines: [{ y: params.target_x, label: `목표 ${params.target_x}%` }],
      vlines: life === null ? [] : [{ x: life, label: "목표 미달" }],
    }),
    createChart({
      title: "출구 농도", xLabel: "운전 시간 t (h)", yLabel: "농도 (mol/m³)", rightLabel: "메탄올 (mol/m³)",
      series: [
        ...main.map((k) => ({ name: SPECIES_NAME[k], color: SPECIES_COLOR[k], x: d.t_h, y: d.outlet[k] })),
        { name: SPECIES_NAME.MeOH, color: SPECIES_COLOR.MeOH, x: d.t_h, y: d.outlet.MeOH, axis: "right", dash: "6 4" },
      ],
    }),
    createChart({
      title: "FFA 돌파 · 촉매 소모", caption: "왼쪽: 출구 FFA / 입구 FFA (1 = 그대로 통과) · 오른쪽: 비누가 된 촉매 (bed 평균)",
      xLabel: "운전 시간 t (h)", yLabel: "출구 FFA / 입구 FFA", yMin: 0, yMax: 1, rightLabel: "비활성화 (%)", rightMax: 100,
      series: [
        { name: SPECIES_NAME.FFA, color: SPECIES_COLOR.FFA, x: d.t_h, y: d.outlet_ffa_ratio },
        { name: "비활성화된 촉매", color: SPECIES_COLOR.CaSoap, x: d.t_h, y: d.deactivated_mean_pct, axis: "right", dash: "6 4" },
      ],
    }),
  ]);
}
