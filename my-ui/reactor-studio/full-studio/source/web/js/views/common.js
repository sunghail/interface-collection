// Pieces shared by the views: placeholders, the per-bed charts and the whole-process charts.

import { h, fmt } from "../util.js";
import { state, emit } from "../store.js";
import { createChart } from "../chart.js";
import { SPECIES_COLOR, SPECIES_NAME } from "../theme.js";

export const Z_LABEL = "z: 입구에서의 거리 (m)";

/** The reactor chosen in bed mode; falls back to the CaO bed when that id no longer exists. */
export function currentBed(profiles) {
  return profiles.find((p) => p.id === state.ui.bed) || profiles.find((p) => p.kind === "cao") || profiles[0];
}

/** Saponification is calculated for the first CaO bed only: the one that meets the FFA left by the acid stage. */
export const soapBedId = (profiles) => profiles.find((p) => p.kind === "cao")?.id;

export function loadingCard(text, elapsed) {
  return h("div.placeholder", {}, [
    h("div.spinner"),
    h("div", {}, [h("b", {}, text),
      elapsed !== undefined ? h("div.muted", {}, [h("span.elapsed-value", {}, fmt(elapsed, 0)), "초 경과"]) : null]),
  ]);
}

export function errorCard(message, retry) {
  return h("div.placeholder.error", {}, [
    h("div", {}, [h("b", {}, "계산하지 못했습니다"), h("div.muted", {}, message)]),
    retry ? h("button.btn.small", { onclick: retry }, "다시 시도") : null,
  ]);
}

/** Card inviting the user to run the slow saponification calculation. */
export function soapPrompt() {
  const deact = state.results.deact;
  if (deact?.loading) {
    return loadingCard("비누화·촉매 수명 계산 중 (별도 프로세스, 다른 화면은 계속 사용 가능)", deact.elapsed);
  }
  return h("div.placeholder.prompt", {}, [
    h("div", {}, [
      h("b", {}, deact?.data ? "조건이 바뀌어 비누화 결과를 다시 계산해야 합니다" : "비누화 결과가 아직 없습니다"),
      h("div.muted", {}, "FFA가 CaO를 칼슘 비누로 바꾸며 촉매가 줄어드는 과정을 계산합니다 (10초–1분)."),
      deact?.error ? h("div.error-text", {}, deact.error) : null,
    ]),
    h("button.btn.primary.small", { onclick: () => emit("need", { kind: "deact", force: true }) }, "비누화 계산"),
  ]);
}

export const grid = (children, cls = "") => h(`div.chart-grid${cls ? "." + cls : ""}`, {}, children);

/** Small heading between chart groups inside a view. */
export const subhead = (title, note) => h("div.subhead", {}, [h("h2", {}, title), note ? h("span.muted", {}, note) : null]);

// ---------------------------------------------------------------------------------- one bed
export function compositionChart(profile, { title, caption } = {}) {
  const acid = profile.kind === "acid";
  const main = acid ? ["TG", "MeOH", "FAME"] : ["TG", "MeOH", "FAME", "GL"];
  const minor = acid ? ["FFA", "H2O"] : ["FFA"];
  return createChart({
    title: title || "조성",
    caption: caption || "왼쪽 축: 액체 전체 기준 · 오른쪽 축: FFA·물 (오일 기준, 원료 입력과 같은 기준)",
    xLabel: Z_LABEL, yLabel: "wt% (액체 전체)", rightLabel: "wt% (오일 기준)",
    series: [
      ...main.map((k) => ({ name: SPECIES_NAME[k], color: SPECIES_COLOR[k], x: profile.z, y: profile.mass_fraction[k] })),
      ...minor.map((k) => ({ name: SPECIES_NAME[k], color: SPECIES_COLOR[k], x: profile.z, y: profile.oil_basis[k],
        axis: "right", dash: k === "H2O" ? "6 4" : null })),
    ],
  });
}

export function conversionChart(profile, targetPct) {
  const acid = profile.kind === "acid";
  return createChart({
    title: "성분별 전환율",
    caption: acid ? "FFA가 FAME로 바뀐 비율 (메탄올은 과잉이라 조금만 쓰임)" : "기름(TG)이 바이오디젤로 바뀐 비율",
    xLabel: Z_LABEL, yLabel: "전환율 (%)", yMin: 0, yMax: 100,
    series: Object.entries(profile.conversion).map(([k, y]) => ({ name: SPECIES_NAME[k], color: SPECIES_COLOR[k], x: profile.z, y })),
    hlines: acid ? [] : [{ y: targetPct, label: `목표 ${targetPct}%` }],
  });
}

export function acidValueChart(profile, targetAv) {
  return createChart({
    title: "산가", caption: "FFA 양의 지표 (산가 2 ≈ FFA 1 wt%)",
    xLabel: Z_LABEL, yLabel: "산가 (mg KOH/g)", yMin: 0,
    series: [{ name: "산가", color: SPECIES_COLOR.FFA, x: profile.z, y: profile.acid_value }],
    hlines: [{ y: targetAv, label: `목표 ${targetAv}` }],
  });
}

// ---------------------------------------------------------------------------------- whole process
/** Beds laid end to end: one continuous x axis, marked where the beds meet (with or without a separator). */
function train(profiles, units = []) {
  const x = [], index = [], vlines = [];
  let offset = 0;
  profiles.forEach((p, b) => {
    p.z.forEach((z, i) => { x.push(offset + z); index.push([b, i]); });
    offset += p.z[p.z.length - 1];
    if (b < profiles.length - 1) {
      const joint = units[b] && !units[b].separator ? "연결" : "분리기";
      vlines.push({ x: offset, label: `${joint} → ${profiles[b + 1].short}` });
    }
  });
  const pick = (get) => index.map(([b, i]) => get(profiles[b])?.[i] ?? null);
  return { x, vlines, pick };
}

const TRAIN_X = "공정 누적 길이 (m) — 원료 입구부터";

export function processOilChart(profiles, targetAv, units) {
  const t = train(profiles, units);
  return createChart({
    title: "오일 성분 — 공정 전체",
    caption: `오일(TG+FFA+FAME) 안의 비율. 산촉매 bed에서 FFA가, CaO bed에서 TG가 FAME로 바뀝니다 · 산가 목표 ${targetAv} ≈ FFA ${fmt(targetAv / 2, 2)} wt%`,
    xLabel: TRAIN_X, yLabel: "wt% (오일 기준)", yMin: 0, yMax: 100, rightLabel: "FFA wt% (오일 기준)",
    series: [
      ...["TG", "FAME"].map((k) => ({ name: SPECIES_NAME[k], color: SPECIES_COLOR[k], x: t.x, y: t.pick((p) => p.oil_basis[k]) })),
      { name: SPECIES_NAME.FFA, color: SPECIES_COLOR.FFA, x: t.x, y: t.pick((p) => p.oil_basis.FFA), axis: "right" },
    ],
    vlines: t.vlines,
  });
}

export function processLiquidChart(profiles, units) {
  const t = train(profiles, units);
  return createChart({
    title: "메탄올 · 물 · 글리세롤 — 공정 전체",
    caption: "분리기에서 물·메탄올(CaO 뒤는 글리세롤도)을 빼고, 다음 bed 앞에서 메탄올을 보충합니다",
    xLabel: TRAIN_X, yLabel: "wt% (액체 전체)", yMin: 0, rightLabel: "물 wt% (액체 전체)",
    series: [
      ...["MeOH", "GL"].map((k) => ({ name: SPECIES_NAME[k], color: SPECIES_COLOR[k], x: t.x, y: t.pick((p) => p.mass_fraction[k]) })),
      { name: SPECIES_NAME.H2O, color: SPECIES_COLOR.H2O, x: t.x, y: t.pick((p) => p.mass_fraction.H2O), axis: "right", dash: "6 4" },
    ],
    vlines: t.vlines,
  });
}
