// One bed in detail, used two ways:
//   renderSingle      단일 bed — the tests of the chosen adsorbent and one column of it (own flow and size)
//   renderProcessBed  공정 › bed별 — one bed of the train
// Views: input   입력: components, C₀, the test protocol, and one form per adsorbent
//        fit     피팅: fitted rate curves and the equilibrium numbers of the chosen adsorbent
//        screen  흡착제 비교: every adsorbent against the removal targets (batch basis)
//        batch   회분: a stirred tank with the adsorbent
//        z       along the bed at a chosen time (slider), liquid and loading
//        t       what leaves the bed over time: breakthrough and cumulative removal

import { mount, h } from "../util.js";
import { state } from "../store.js";
import { loadingCard, errorCard, grid, subhead, currentBed, outletCharts, zTimeline, stopPlay, notesBox } from "./common.js";
import { inputMain } from "./input.js";
import { fitMain } from "./fitting.js";
import { screenMain } from "./screen.js";
import { batchMain } from "./batch.js";

export function renderSingle(root) {
  stopPlay();
  const view = state.ui.bedView;
  if (view === "input") { mount(root, inputMain()); return; }
  if (view === "fit") { mount(root, fitMain()); return; }
  if (view === "screen") { mount(root, screenMain()); return; }
  if (view === "batch") { mount(root, batchMain()); return; }
  if (!state.project.adsorbents.length) {
    mount(root, h("div.empty-state", {}, [h("p", {}, "흡착제가 없습니다. 입력 화면에서 흡착제와 실험 데이터를 넣으세요.")]));
    return;
  }
  const steady = state.results.steady;
  if (!steady?.data || steady.error) {
    mount(root, steady?.error ? errorCard(steady.error) : loadingCard("계산 중… (bed 크기를 찾는 데 몇 초)"));
    return;
  }
  const profile = steady.data.profiles[0];
  mount(root,
    notesBox("확인할 점", [...(steady.notes || []), ...(steady.data.summary.warnings || [])], "warn"),
    ...(view === "t" ? timeBlocks(profile, steady.data.summary) : zBlocks(profile, steady.data.summary)));
}

export function renderProcessBed(root) {
  stopPlay();
  const steady = state.results.steady;
  if (!steady?.data) {
    mount(root, steady?.error ? errorCard(steady.error) : loadingCard("계산 중…"));
    return;
  }
  const profile = currentBed(steady.data.profiles);
  const summary = steady.data.summary;
  mount(root, ...(state.ui.procBedView === "t" ? timeBlocks(profile, summary) : zBlocks(profile, summary)));
}

function zBlocks(profile, summary) {
  return [subhead("위치별 분포", "입구(z = 0)에서 출구까지 · 시간을 움직여 보세요"), zTimeline(profile, summary)];
}

function timeBlocks(profile, summary) {
  return [subhead("시간별 출구", `통액 시작 후 · 교체 주기 ${summary.service_h} h · bed는 처음에 물로 차 있음`),
    grid(outletCharts(profile, summary))];
}
