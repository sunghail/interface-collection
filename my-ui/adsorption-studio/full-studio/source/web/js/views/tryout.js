// 4단계 · 직접 조절해 보기: a picture of the bed (or the shaken flask) whose size follows the sliders — drag it or
// slide — with the key numbers recalculated at once, a "save" button that keeps each try in a table, and analysis
// curves (removal against dose, useful time against bed length).
//
// The panel updates itself in place while sliding (no page redraw), so a drag is never interrupted.

import { h, s, fmt, debounce, toast } from "../util.js";
import { api } from "../api.js";
import { createChart } from "../chart.js";
import { state, setGuide, requestParams } from "../store.js";
import { KIND_COLOR } from "../theme.js";
import { compColor, num, pct, grid } from "./common.js";
import { helpTip } from "./help.js";

const TRY_TIP = { L: "bed_size", D: "bed_size", dose: "dose", V: "batch_volume", t: "mix_time" };

const LIM = { L: [0.05, 3], D: [0.02, 1], dose: [0.5, 500], V: [0.01, 1000], t: [1, 1440] };   // dose: experiments.DOSE_MAX
const clamp = (x, [lo, hi]) => Math.min(Math.max(x, lo), hi);
const r3 = (x) => Number(Number(x).toPrecision(3));
const keepLimit = () => state.params.keep_loss_max / 100;
/** The tested dose range of an adsorbent (g/L), from the batch-test comparison. */
const testedDoses = (id) => state.results.compare.data?.rows.find((r) => r.id === id)?.test_doses || null;
const rangeText = ([lo, hi]) => (Math.abs(hi - lo) < 1e-9 ? `${num(lo)} g/L` : `${num(lo)}–${num(hi)} g/L`);

/** The try-out starts from the design and follows it: when the design (or the adsorbent) changes, it is re-seeded. */
function seeded(slot, seed, fresh) {
  const key = JSON.stringify(seed);
  if (!state.guide[slot] || state.guide[slot].seed !== key) state.guide[slot] = { ...fresh, seed: key };
  return state.guide[slot];
}
const targets = () => state.project.components.filter((c) => c.role === "remove" && (state.project.feed[c.id] || 0) > 0);
const keeps = () => state.project.components.filter((c) => c.role === "keep" && (state.project.feed[c.id] || 0) > 0);
const adsOf = () => state.project.adsorbents.find((a) => a.id === state.single.ads);

// ------------------------------------------------------------------------------------ saved tries
function saveTry(entry) {
  const tries = [...(state.guide.tries || []), { ...entry, n: (state.guide.tries?.length || 0) + 1,
    when: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) }].slice(-30);
  setGuide({ tries });
  toast("결과를 저장했습니다 — 아래 '저장한 결과' 표", "ok");
}

function triesCard(method) {
  const tries = (state.guide.tries || []).filter((t) => t.method === method);
  if (!tries.length) return h("section.card", {}, [h("div.card-head", {}, [h("h2", {}, "저장한 결과"), helpTip("tries")]),
    h("p.muted.small", {}, "위에서 조절한 뒤 '💾 이 결과 저장'을 누르면 여기에 쌓여 비교할 수 있습니다.")]);
  const remove = (n) => setGuide({ tries: state.guide.tries.filter((t) => t.n !== n) });
  const tg = targets();
  const head = method === "column"
    ? ["#", "시각", "흡착제", "길이 × 지름 (m)", "흡착제 (kg)", "목표 유지 / 운전 가능 시간", "당 감소율", "ΔP (kPa)", ""]
    : ["#", "시각", "흡착제", "투입량 (g/L)", "처리 부피 (L)", "교반 시간 (min)", ...tg.map((c) => `${c.name} 제거율`), "당 감소율", ""];
  const rows = tries.map((t) => h("tr", {}, method === "column" ? [
    h("td", {}, String(t.n)), h("td.muted", {}, t.when), h("th", {}, t.adsName),
    h("td", {}, `${num(t.L)} × ${num(t.D)}`), h("td", {}, num(t.kg)), h("td", {}, t.runText), h("td", {}, pct(t.keep)),
    h("td", {}, num(t.dP)), h("td", {}, h("button.icon-btn.del", { onclick: () => remove(t.n) }, "✕")),
  ] : [
    h("td", {}, String(t.n)), h("td.muted", {}, t.when), h("th", {}, t.adsName),
    h("td", {}, num(t.dose)), h("td", {}, num(t.V)), h("td", {}, num(t.t)),
    ...tg.map((c) => h("td", {}, pct(t.removal?.[c.id]))), h("td", {}, pct(t.keep)),
    h("td", {}, h("button.icon-btn.del", { onclick: () => remove(t.n) }, "✕")),
  ]));
  return h("section.card", {}, [
    h("div.card-head", {}, [h("h2", {}, "저장한 결과"), helpTip("tries"), h("span.muted", {}, `${tries.length}개 · 조건을 바꿔 가며 저장해 비교하세요`),
      h("span.spacer"), h("button.btn.ghost.small", { onclick: () => setGuide({ tries: state.guide.tries.filter((t) => t.method !== method) }) }, "모두 지우기")]),
    h("div.table-wrap", {}, h("table.data.compact", {}, [h("thead", {}, h("tr", {}, head.map((x) => h("th", {}, x)))), h("tbody", {}, rows)])),
  ]);
}

// ------------------------------------------------------------------------------------ column
export function columnTry(start) {
  const ads = adsOf();
  const fresh = () => ({ L: r3(clamp(start?.L ?? 0.5, LIM.L)), D: r3(clamp(start?.D ?? 0.1, LIM.D)) });
  const tr = seeded("tryCol", { ads: ads?.id, L: start?.L, D: start?.D }, fresh());
  const svgBox = h("div.model-box");
  const out = h("div.try-out", {}, h("p.muted", {}, "계산 중…"));
  let seq = 0, last = null, scale = null;

  const draw = (keepScale = false) => {
    if (!keepScale || !scale) scale = Math.min(250 / tr.L, 150 / tr.D);
    const w = tr.D * scale, hgt = tr.L * scale, x0 = 110 - w / 2, y0 = 30;
    const svg = s("svg", { viewBox: "0 0 260 320", class: "bed-model" });
    svg.append(s("defs", {}, [s("pattern", { id: "beads", width: 8, height: 8, patternUnits: "userSpaceOnUse" },
      [s("circle", { cx: 4, cy: 4, r: 2.6, fill: KIND_COLOR[ads?.kind] || "#64748b", opacity: 0.55 })])]));
    svg.append(s("line", { x1: 110, x2: 110, y1: 4, y2: y0 - 2, class: "model-flow" }));
    svg.append(s("text", { x: 118, y: 16, class: "model-note" }, "가수분해액 ↓"));
    svg.append(s("rect", { x: x0, y: y0, width: w, height: hgt, rx: Math.min(10, w / 3), class: "model-shell" }));
    svg.append(s("rect", { x: x0 + 2, y: y0 + 2, width: Math.max(w - 4, 1), height: Math.max(hgt - 4, 1), fill: "url(#beads)" }));
    svg.append(s("line", { x1: 110, x2: 110, y1: y0 + hgt + 2, y2: Math.min(y0 + hgt + 24, 316), class: "model-flow" }));
    svg.append(s("text", { x: x0 - 6, y: y0 + hgt / 2, "text-anchor": "end", class: "model-dim" }, `L ${fmt(tr.L, 2)} m`));
    svg.append(s("text", { x: 110, y: Math.min(y0 + hgt + 40, 318), "text-anchor": "middle", class: "model-dim" }, `D ${fmt(tr.D, 3)} m`));
    const handleL = s("circle", { cx: 110, cy: y0 + hgt, r: 8, class: "model-handle", "data-k": "L" }, [s("title", {}, "끌어서 길이 조절")]);
    const handleD = s("circle", { cx: x0 + w, cy: y0 + hgt / 2, r: 8, class: "model-handle", "data-k": "D" }, [s("title", {}, "끌어서 지름 조절")]);
    svg.append(handleL, handleD);
    for (const handle of [handleL, handleD]) {
      handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        const key = handle.dataset.k;
        const box = svg.getBoundingClientRect();
        const per = 260 / box.width;                               // svg units per screen pixel
        const start = { x: e.clientX, y: e.clientY, v: tr[key] };
        const move = (ev) => {
          const d = key === "L" ? (ev.clientY - start.y) * per / scale : 2 * (ev.clientX - start.x) * per / scale;
          set(key, start.v + d, true);
        };
        const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); draw(); };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      });
    }
    svgBox.replaceChildren(svg);
  };

  const sliders = {};
  const numbers = {};
  const set = (key, value, dragging = false) => {
    tr[key] = Number(clamp(value, LIM[key]).toPrecision(3));
    sliders[key].value = String(tr[key]);
    numbers[key].value = String(tr[key]);
    draw(dragging);
    refresh();
  };
  const control = (key, label, step) => {
    sliders[key] = h("input.slider", { type: "range", min: LIM[key][0], max: LIM[key][1], step, value: tr[key],
      oninput: (e) => set(key, Number(e.target.value)) });
    numbers[key] = h("input.num.try-num", { type: "number", value: tr[key], step, min: LIM[key][0], max: LIM[key][1],
      onchange: (e) => { if (Number.isFinite(Number(e.target.value))) set(key, Number(e.target.value)); } });
    return h("div.try-ctl", {}, [h("span.try-label", {}, [label, helpTip(TRY_TIP[key])]), sliders[key], h("span.try-val", {}, [numbers[key], " m"])]);
  };

  const refresh = debounce(async () => {
    const mine = ++seq;
    out.classList.add("stale");
    try {
      const data = await api.steady({ ...requestParams() }, { mode: "custom", units: [{ ads: ads.id, auto: false, L: tr.L, D: tr.D }] }, state.project);
      if (mine !== seq) return;
      last = data;
      showResult(data);
    } catch (error) {
      if (mine === seq) out.replaceChildren(h("p.error-text", {}, error.message));
    } finally {
      if (mine === seq) out.classList.remove("stale");
    }
  }, 250);

  const showResult = (d) => {
    const sm = d.summary, u = d.flowsheet.units[0];
    const serviceOn = sm.service_on;
    const beyond = sm.run_h === null || sm.run_h_beyond;
    const runText = beyond ? `> ${fmt(sm.horizon_h ?? sm.service_h, 0)} h (계산 범위 내 파과 없음)` : `${fmt(sm.run_h, 1)} h`;
    const met = Object.values(sm.met).every(Boolean);
    const keepOk = sm.keep_ok ?? (sm.keep_loss <= keepLimit() + 1e-9);
    const verdict = !met ? ["목표 미달", "bad"] : !keepOk ? ["부적합 · 당 감소율 초과", "bad"]
      : sm.dp_ok === false ? ["부적합 · 압력강하 초과", "bad"] : ["적합", "ok"];
    const big = serviceOn
      ? [["판정", ...verdict], ["목표 유지 시간", runText, beyond || sm.run_h >= sm.service_h ? "ok" : "bad"]]
      : [["운전 가능 시간", runText, "info"], ["당 감소율", pct(sm.keep_loss), keepOk ? "ok" : "bad"]];
    out.replaceChildren(
      h("div.try-big", {}, big.map(([k, v, cls]) => h(`div.try-big-item.${cls}`, {}, [h("span", {}, k), h("b", {}, v)]))),
      h("div.try-list", {}, [
        ["흡착제", `${num(sm.adsorbent_kg)} kg`, ""], ["bed 부피", `${num(u.V_m3 * 1000)} L`, ""],
        ["공탑 체류시간 (EBCT)", `${num(u.EBCT_min)} min`, ""],
        ["당 감소율", `${pct(sm.keep_loss)} (한도 ${num(state.params.keep_loss_max)} %)`, keepOk ? "ok" : "bad"],
        ["압력강하", `${num(u.dP_kPa)} kPa`, sm.dp_ok === false ? "bad" : ""],
        ...targets().map((c) => [`${c.name} 제거율 (${serviceOn ? "교체 시점" : "파과 시점"})`, pct(sm.judged[c.id]), (sm.met[c.id] ?? true) ? "" : "bad"]),
      ].map(([k, v, cls]) => h("div.try-row", {}, [h("span.muted", {}, k), h(`b${cls ? `.v-${cls}` : ""}`, {}, v)]))),
      sm.warnings?.length ? h("ul.try-warn", {}, sm.warnings.slice(0, 4).map((w) => h("li", {}, w))) : null,
      h("button.btn.primary.small", { onclick: () => saveTry({ method: "column", adsName: ads.name, L: tr.L, D: tr.D, kg: sm.adsorbent_kg,
        runText: serviceOn ? `${verdict[0]} · ${runText}` : runText, keep: sm.keep_loss, dP: u.dP_kPa }) }, "💾 이 결과 저장"),
    );
  };

  draw();
  refresh();
  const panel = h("section.card.try-card", {}, [
    h("div.card-head", {}, [h("h2", {}, "직접 조절해 보기"), helpTip("try_column"), h("span.muted", {}, `${ads?.name || ""} · bed 모형의 동그라미를 끌거나 슬라이더를 움직이면 바로 다시 계산합니다`)]),
    h("div.try-grid", {}, [svgBox, h("div", {}, [control("L", "길이 L", 0.01), control("D", "지름 D", 0.005),
      start ? h("button.btn.ghost.small.try-reset", { onclick: () => { const f = fresh(); set("L", f.L); set("D", f.D); } },
        `↺ 설계값으로 (${num(start.L)} × ${num(start.D)} m)`) : null, out])]),
  ]);
  return h("div", {}, [panel, triesCard("column"), bedSweepCard(ads, tr)]);
}

function bedSweepCard(ads, tr) {
  const box = h("div", {}, h("p.muted.small", {}, "계산 중…"));
  let seq = 0;
  const run = async () => {
    const mine = ++seq;
    box.replaceChildren(h("p.muted.small", {}, "길이를 바꿔 가며 계산하는 중… (몇 초)"));
    const hi = Math.max(tr.L * 2, 0.3);
    const lengths = Array.from({ length: 9 }, (_, i) => Number((0.05 + (hi - 0.05) * i / 8).toPrecision(3)));
    try {
      const r = await api.bedSweep({ ...requestParams() }, state.project, ads.id, tr.D, lengths);
      if (mine !== seq) return;
      const ok = r.rows.filter((x) => !x.error);
      const xs = ok.map((x) => x.L);
      box.replaceChildren(grid([
        createChart({ title: r.service_on ? "목표 유지 시간" : "운전 가능 시간", caption: `지름 ${fmt(tr.D, 3)} m 고정 · 세로선 = 현재 길이`,
          xLabel: "bed 길이 (m)", yLabel: "시간 (h)", yMin: 0, height: 230,
          series: [{ name: "시간", color: "#2563eb", x: xs, y: ok.map((x) => x.run_h) },
            { name: "계산점", color: "#2563eb", mode: "markers", x: xs, y: ok.map((x) => x.run_h), noLegend: true }],
          hlines: r.service_on ? [{ y: r.service_h, label: `교체 주기 ${r.service_h} h` }] : [], vlines: [{ x: tr.L, label: "현재" }] }),
        createChart({ title: "당 감소율 · 흡착제 질량", xLabel: "bed 길이 (m)", yLabel: "당 감소율 (%)", rightLabel: "흡착제 (kg)", yMin: 0, height: 230,
          series: [{ name: "당 감소율", color: "#dc2626", x: xs, y: ok.map((x) => 100 * x.keep_loss) },
            { name: "흡착제", color: "#16a34a", x: xs, y: ok.map((x) => x.adsorbent_kg), axis: "right", dash: "5 4" }],
          hlines: [{ y: state.params.keep_loss_max, label: "당 감소율 한도" }], vlines: [{ x: tr.L, label: "현재" }] }),
      ]));
    } catch (error) {
      if (mine === seq) box.replaceChildren(h("p.error-text", {}, error.message));
    }
  };
  run();
  return h("section.card", {}, [
    h("div.card-head", {}, [h("h2", {}, "분석 · bed 길이에 따라"), helpTip("bed_sweep"), h("span.muted", {}, "현재 지름에서 길이만 변경"),
      h("span.spacer"), h("button.btn.ghost.small", { onclick: run }, "현재 크기로 재계산")]),
    box,
  ]);
}

// ------------------------------------------------------------------------------------ batch (shaken flask)
export function batchTry(start) {
  const ads = adsOf();
  const fresh = () => ({ dose: r3(clamp(start?.dose ?? 40, LIM.dose)), V: r3(clamp(start?.V ?? state.batchReq.V_L ?? 1, LIM.V)),
    t: r3(clamp(start?.t ?? state.batchReq.t_end ?? 60, LIM.t)) });
  const tr = seeded("tryBatch", { ads: ads?.id, ...start }, fresh());
  const tested = testedDoses(ads?.id);
  const svgBox = h("div.model-box");
  const out = h("div.try-out", {}, h("p.muted", {}, "계산 중…"));
  let seq = 0;

  const draw = (shake = false) => {
    const fill = Math.min(1, 0.25 + 0.5 * Math.log10(1 + tr.V) / Math.log10(1 + LIM.V[1]) * 2);
    const level = 250 - 170 * Math.min(fill, 0.95);
    const svg = s("svg", { viewBox: "0 0 260 300", class: `flask-model${shake ? " shaking" : ""}` });
    const flask = "M100,30 L100,110 L40,250 Q36,262 50,264 L210,264 Q224,262 220,250 L160,110 L160,30 Z";
    svg.append(s("defs", {}, [s("clipPath", { id: "flask-clip" }, [s("path", { d: flask })])]));
    const g = s("g", { class: "flask-body" });
    g.append(s("rect", { x: 0, y: level, width: 260, height: 300, class: "flask-liquid", "clip-path": "url(#flask-clip)" }));
    const dots = Math.round(Math.min(tr.dose, 300) / 5);
    for (let i = 0; i < dots; i += 1) {
      const x = 60 + ((i * 53) % 140), y = 258 - ((i * 37) % Math.max(250 - level - 6, 8));
      g.append(s("circle", { cx: x, cy: y, r: 2.3, fill: KIND_COLOR[ads?.kind] || "#64748b", opacity: 0.8, "clip-path": "url(#flask-clip)" }));
    }
    g.append(s("path", { d: flask, class: "flask-glass" }));
    svg.append(g);
    svg.append(s("text", { x: 130, y: 288, "text-anchor": "middle", class: "model-dim" }, `${fmt(tr.V, tr.V < 10 ? 2 : 0)} L · 흡착제 ${fmt(tr.dose * tr.V, 1)} g`));
    svg.append(s("text", { x: 130, y: 20, "text-anchor": "middle", class: "model-note" }, `교반 ${fmt(tr.t, 0)}분`));
    svgBox.replaceChildren(svg);
  };

  const sliders = {}, numbers = {};
  let shakeTimer = null;
  const set = (key, value) => {
    tr[key] = Number(clamp(value, LIM[key]).toPrecision(3));
    sliders[key].value = String(key === "V" || key === "dose" ? Math.log10(tr[key]) : tr[key]);
    numbers[key].value = String(tr[key]);
    draw(true);
    clearTimeout(shakeTimer);
    shakeTimer = setTimeout(() => draw(false), 700);
    refresh();
    if (key !== "V") sweep();
  };
  const control = (key, label, unit, step, log = false) => {
    sliders[key] = h("input.slider", { type: "range", step: log ? 0.01 : step,
      min: log ? Math.log10(LIM[key][0]) : LIM[key][0], max: log ? Math.log10(LIM[key][1]) : LIM[key][1],
      value: log ? Math.log10(tr[key]) : tr[key], oninput: (e) => set(key, log ? 10 ** Number(e.target.value) : Number(e.target.value)) });
    numbers[key] = h("input.num.try-num", { type: "number", value: tr[key], step,
      onchange: (e) => { if (Number.isFinite(Number(e.target.value))) set(key, Number(e.target.value)); } });
    return h("div.try-ctl", {}, [h("span.try-label", {}, [label, helpTip(TRY_TIP[key])]), sliders[key], h("span.try-val", {}, [numbers[key], ` ${unit}`])]);
  };

  const refresh = debounce(async () => {
    const mine = ++seq;
    out.classList.add("stale");
    try {
      const d = await api.batch(state.project, { adsorbent: ads.id, mode: "dose", dose: tr.dose, V_L: tr.V, t_end: tr.t });
      if (mine !== seq) return;
      const at = Object.fromEntries(d.components.map((c, i) => [c, d.C0[i] > 0 ? (d.C0[i] - d.C[i][d.C[i].length - 1]) / d.C0[i] : null]));
      const keep = Math.max(0, ...keeps().map((c) => at[c.id] ?? 0));
      const keepOk = keep <= keepLimit() + 1e-9;
      const ratio = tested?.[1] ? tr.dose / tested[1] : null;
      out.replaceChildren(
        h("div.try-big", {}, targets().map((c) => {
          const ok = (at[c.id] ?? 0) >= c.target / 100 - 1e-9;
          return h(`div.try-big-item.${ok ? "ok" : "bad"}`, {}, [h("span", {}, `${c.name} 제거율 (목표 ${c.target} %)`), h("b", {}, pct(at[c.id]))]);
        })),
        h("div.try-list", {}, [
          ["흡착제 질량", `${num(tr.dose * tr.V)} g`, ""],
          ["당 감소율", `${pct(keep)} (한도 ${num(state.params.keep_loss_max)} %)`, keepOk ? "ok" : "bad"],
          ...state.project.components.filter((c) => c.role !== "remove" && (state.project.feed[c.id] || 0) > 0)
            .map((c) => [`${c.name} ${c.role === "keep" ? "감소율" : "제거율"}`, pct(at[c.id]), ""]),
        ].map(([k, v, cls]) => h("div.try-row", {}, [h("span.muted", {}, k), h(`b${cls ? `.v-${cls}` : ""}`, {}, v)]))),
        ratio && ratio > 1.5 ? h("p.try-extrap", {}, `⚠ 시험 투입량(${rangeText(tested)})의 ${num(ratio)}배 — 외삽 결과이므로 확인 실험을 권장합니다`) : null,
        h("button.btn.primary.small", { onclick: () => saveTry({ method: "batch", adsName: ads.name, dose: tr.dose, V: tr.V, t: tr.t,
          removal: at, keep }) }, "💾 이 결과 저장"),
      );
    } catch (error) {
      if (mine === seq) out.replaceChildren(h("p.error-text", {}, error.message));
    } finally {
      if (mine === seq) out.classList.remove("stale");
    }
  }, 200);

  const sweepBox = h("div", {}, h("p.muted.small", {}, "계산 중…"));
  let sweepSeq = 0;
  const sweep = debounce(async () => {
    try {
      const mine = ++sweepSeq;
      const r = await api.doseSweep(state.project, { adsorbent: ads.id, t: tr.t, d_max: Math.min(LIM.dose[1], Math.max(tr.dose * 2.5, (tested?.[1] || 0) * 1.5, 50)), n: 26 });
      if (mine !== sweepSeq) return;
      const idx = (c) => r.components.indexOf(c.id);
      const shown = [...targets(), ...keeps()];
      sweepBox.replaceChildren(createChart({
        title: "투입량에 따른 제거율", caption: `실선 = ${fmt(r.t, 0)}분 교반 후 · 점선 = 평형 · 세로선 = 현재 투입량`,
        xLabel: "흡착제 투입량 (g/L)", yLabel: "제거율 (%)", yMin: 0, yMax: 100, height: 260,
        series: shown.flatMap((c) => [
          { name: c.name, group: c.id, color: compColor(c.id), x: r.doses, y: r.removal_t[idx(c)].map((v) => 100 * v), width: c.role === "remove" ? 2.4 : 1.6 },
          { name: `${c.name} 평형`, group: c.id, noLegend: true, color: compColor(c.id), dash: "5 4", width: 1.2, x: r.doses, y: r.removal_eq[idx(c)].map((v) => 100 * v) },
        ]),
        hlines: [...new Set(targets().map((c) => c.target))].map((y) => ({ y, label: `목표 ${y}%` })),
        vlines: [{ x: tr.dose, label: "현재" }, ...(tested ? [{ x: tested[1], label: "시험 최대" }] : [])],
      }));
    } catch (error) {
      sweepBox.replaceChildren(h("p.error-text", {}, error.message));
    }
  }, 400);

  draw();
  refresh();
  sweep();
  const panel = h("section.card.try-card", {}, [
    h("div.card-head", {}, [h("h2", {}, "직접 조절해 보기"), helpTip("try_batch"), h("span.muted", {}, `${ads?.name || ""} · 슬라이더를 움직이면 즉시 다시 계산합니다`)]),
    h("div.try-grid", {}, [svgBox, h("div", {}, [
      control("dose", "투입량", "g/L", 0.1, true), control("V", "처리 부피", "L", 0.01, true), control("t", "교반 시간", "min", 1),
      start ? h("button.btn.ghost.small.try-reset", { onclick: () => { const f = fresh(); set("dose", f.dose); set("V", f.V); set("t", f.t); } },
        `↺ 설계값으로 (${num(start.dose)} g/L · ${num(start.V)} L · ${num(start.t)} min)`) : null,
      tested ? h("p.muted.small", {}, `시험 투입량: ${rangeText(tested)} (이 근처가 가장 신뢰할 수 있음)`) : null, out])]),
  ]);
  return h("div", {}, [panel, triesCard("batch"),
    h("section.card", {}, [h("div.card-head", {}, [h("h2", {}, "분석 · 투입량에 따라"), helpTip("dose_sweep"), h("span.muted", {}, "교반 시간을 바꾸면 실선도 바뀝니다")]), sweepBox])]);
}

