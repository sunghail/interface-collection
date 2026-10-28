// Pieces shared by the views: component colours and names, small inputs, placeholders, and the charts of
// one bed (along z at a chosen time, and at the outlet over time) and of the whole train.

import { h, fmt, isNum, fmtSmart, toast } from "../util.js";
import { state, setUi, change } from "../store.js";
import { createChart } from "../chart.js";
import { PALETTE, KIND_COLOR, KIND_NAME, timeColor } from "../theme.js";

export const Z_LABEL = "z: 입구에서의 거리 (m)";
export const ROLE = { remove: "제거", keep: "보존", any: "무관" };
export const KIND = KIND_NAME;

// ---------------------------------------------------------------------------------- components
export function compColor(id) {
  const i = state.project.components.findIndex((c) => c.id === id);
  return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
}

export const compName = (id) => state.project.components.find((c) => c.id === id)?.name ?? id;
export const dot = (id) => h("span.comp-dot", { style: { background: compColor(id) } });
export const kindDot = (kind) => h("span.bed-dot", { class: `bed-dot ${kind}`, style: { background: KIND_COLOR[kind] } });

/** Components in project order, with their role and target (only those in the project). */
export const components = () => state.project.components;

// ---------------------------------------------------------------------------------- small inputs
/** Number field: empty text -> null. onValue(number|null) fires on every valid edit. */
/** A number box. commit "input" = every keystroke counts (tables); "change" = only when the user leaves the box or
 *  presses Enter (values that other data depend on, like a sampling time). required = an emptied box goes back to
 *  its last value (a blank would otherwise silently keep the old number). */
export function numField(value, onValue, { width = 72, placeholder = "", min = null, max = null, title = "", cls = "", bare = false,
  commit = "input", required = false } = {}) {
  let last = isNum(value) ? value : null;
  const input = h(`input.num${bare ? "" : ".cell"}${cls ? "." + cls : ""}`, { type: "text", inputmode: "decimal",
    value: isNum(value) ? String(value) : "", placeholder, title, style: bare ? {} : { width: `${width}px` } });
  const parse = () => {
    const text = input.value.trim().replace(",", ".");
    if (text === "") return { empty: true };
    const x = Number(text);
    const why = !Number.isFinite(x) ? "숫자만 입력하세요"
      : min !== null && x < min ? `${min} 이상이어야 합니다` : max !== null && x > max ? `${max} 이하여야 합니다` : "";
    return { x, why };
  };
  const mark = ({ why }) => {
    input.classList.toggle("invalid", Boolean(why));
    input.title = why || title;
  };
  const apply = () => {
    const r = parse();
    if (r.empty) { mark({}); if (!required) { last = null; onValue(null); } return; }
    mark(r);
    if (!r.why) { last = r.x; onValue(r.x); }
  };
  if (commit === "change") {
    input.addEventListener("input", () => { const r = parse(); if (!r.empty) mark(r); });
    input.addEventListener("change", apply);
  } else {
    input.addEventListener("input", apply);
  }
  input.addEventListener("blur", () => {
    const r = parse();
    if (required && r.empty && last !== null) { input.value = String(last); mark({}); toast("값을 비울 수 없어 이전 값으로 되돌렸습니다", "warn"); }
    else if (r.why && commit === "change") { input.value = last === null ? "" : String(last); mark({}); toast(r.why, "warn"); }
  });
  return input;
}

export function field(label, control, hint = "") {
  return h("label.field", {}, [h("span.field-label", {}, label), control, hint ? h("small.muted", {}, hint) : null]);
}

export function select(options, value, onChange, attrs = {}) {
  const node = h("select", attrs, options.map(([v, text]) => h("option", { value: v, selected: v === value }, text)));
  node.addEventListener("change", () => onChange(node.value));
  return node;
}

export function segmented(items, current, pick, cls = "") {
  return h(`div.segmented${cls}`, { role: "tablist" }, items.map(([value, content, title]) =>
    h("button", { class: value === current ? "active" : "", role: "tab", "aria-selected": String(value === current),
      title: title || null, onclick: () => pick(value) }, content)));
}

/** Adsorbent picker that stays small with many adsorbents: the current one on a button (‹ › step through),
 *  the full list in a scrolling drop-down with a name filter. */
export function adsPicker(ads, current, pick, sub = null) {
  const i = Math.max(0, ads.findIndex((a) => a.id === current));
  const cur = ads[i];
  const box = h("div.ads-pick");
  const list = h("div.ads-pick-list", { role: "listbox" });
  const fill = (q = "") => {
    const key = q.trim().toLowerCase();
    const shown = ads.filter((a) => !key || a.name.toLowerCase().includes(key));
    list.replaceChildren(...(shown.length ? shown.map((a) => h(`button.ads-pick-item${a.id === cur?.id ? ".active" : ""}`, {
      role: "option", onclick: () => { box.classList.remove("open"); pick(a.id); },
    }, [kindDot(a.kind), h("span.ads-pick-name", {}, a.name), sub ? h("small.muted", {}, sub(a)) : null]))
      : [h("div.muted.small.ads-pick-none", {}, "맞는 이름이 없습니다")]));
  };
  fill();
  const filter = ads.length > 6 ? h("input.text.ads-pick-filter", { placeholder: "이름으로 찾기", oninput: (e) => fill(e.target.value) }) : null;
  const step = (d) => { if (ads.length > 1) pick(ads[(i + d + ads.length) % ads.length].id); };
  box.append(
    h("button.ads-pick-step", { title: "이전 흡착제", onclick: () => step(-1), disabled: ads.length < 2 || null }, "‹"),
    h("button.ads-pick-btn", { title: "눌러서 흡착제 고르기", onclick: () => {
      box.classList.toggle("open");
      if (!box.classList.contains("open")) return;
      // open toward the side with room, so the list never widens the window
      const r = box.getBoundingClientRect();
      box.classList.toggle("to-left", r.left + Math.max(r.width, 300) > document.documentElement.clientWidth - 8);
      list.querySelector(".active")?.scrollIntoView({ block: "nearest" });
      filter?.focus();
    } }, [cur ? kindDot(cur.kind) : null, h("b", {}, cur ? cur.name : "흡착제 없음"), h("small.muted", {}, `${i + 1}/${ads.length}`), h("span.caret", {}, "▾")]),
    h("button.ads-pick-step", { title: "다음 흡착제", onclick: () => step(1), disabled: ads.length < 2 || null }, "›"),
    h("div.ads-pick-panel", {}, [filter, list]),
  );
  return box;
}

// a click elsewhere or Esc closes an open picker
document.addEventListener("pointerdown", (e) => {
  for (const box of document.querySelectorAll(".ads-pick.open")) if (!box.contains(e.target)) box.classList.remove("open");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") for (const box of document.querySelectorAll(".ads-pick.open")) box.classList.remove("open");
});

export function kpi(label, value, sub = "", kind = "info") {
  return h(`div.kpi.${kind}`, {}, [
    h("div.kpi-top", {}, [h("span.kpi-label", {}, label)]),
    h("div.kpi-value", {}, value),
    sub ? h("div.kpi-target", {}, sub) : null,
  ]);
}

export const pct = (x, digits = 1) => (isNum(x) ? `${(100 * x).toFixed(digits)}%` : "–");
export const num = (x, sig = 3) => (isNum(x) ? fmtSmart(x, sig) : "–");

/** Green (wanted) / red (unwanted) background for a removal fraction, by component role. */
export function heat(role, frac) {
  if (!isNum(frac)) return {};
  const f = Math.max(0, Math.min(1, frac));
  if (role === "remove") return { background: `rgba(22, 163, 74, ${0.08 + 0.5 * f})` };
  if (role === "keep") return { background: `rgba(220, 38, 38, ${0.06 + 0.9 * Math.min(f / 0.3, 1) * 0.5})` };
  return { background: `rgba(100, 116, 139, ${0.05 + 0.3 * f})` };
}

// property sheet pieces (same look as the settings sidebar)
export function pgroup(title, kind, rows, note = "", footer = null) {
  return h(`section.pgroup.${kind}`, {}, [
    h("div.pgroup-head", {}, [h("b", {}, title), note ? h("small.muted", {}, note) : null]),
    ...rows, footer,
  ]);
}

export function propInput(label, value, onValue, { unit = "", title = "", placeholder = "", min = 0 } = {}) {
  const input = numField(value, onValue, { bare: true, placeholder, min });
  return h("div.prop", {}, h("div.prop-row.static", { title }, [
    h("span.prop-label", {}, label), h("div.num-wrap", {}, [input, h("span.unit", {}, unit)])]));
}

export function propFixed(label, value, title = "") {
  return h("div.prop", {}, h("div.prop-row.static", { title }, [h("span.prop-label", {}, label), h("span.prop-value", {}, value)]));
}

/** Role (제거 / 보존 / 무관) and removal target of every component, edited in place (property-sheet rows). */
export function roleEditor() {
  return state.project.components.map((c) => {
    const role = select(Object.entries(ROLE), c.role, (v) => change((p) => {
      const comp = p.components.find((x) => x.id === c.id);
      comp.role = v;
      comp.competitive = v !== "keep";
    }, { structural: true }), { class: `role role-${c.role}`, "aria-label": `${c.name} 역할` });
    const target = c.role === "remove"
      ? h("span.target", {}, ["≥ ", numField(c.target, (v) => change((p) => {
        p.components.find((x) => x.id === c.id).target = Math.min(v ?? 90, 99.9);
      }), { width: 40, min: 0, title: "목표 제거율 (%)" }), "%"]) : null;
    return h("div.comp-row.role-row", {}, [dot(c.id), h("span.role-name", {}, c.name), role, target]);
  });
}

/** Components an adsorbent holds best (equilibrium removal of its standard test), strongest first. */
export function bestCaught(run, n = 3, min = 0.05) {
  if (!run) return [];
  return state.project.components
    .map((c) => ({ id: c.id, name: c.name, removal: run.components[c.id]?.removal }))
    .filter((x) => isNum(x.removal) && x.removal >= min)
    .sort((a, b) => b.removal - a.removal)
    .slice(0, n);
}

export const bestText = (run, n = 3) => bestCaught(run, n).map((x) => `${x.name} ${pct(x.removal, 0)}`).join(" · ") || "뚜렷한 흡착 성분 없음";

// ---------------------------------------------------------------------------------- placeholders
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

export const placeholder = (text, kind = "") => h(`div.placeholder${kind ? "." + kind : ""}`, {}, text);

export function notesBox(title, notes, kind = "warn") {
  if (!notes?.length) return null;
  return h(`div.banner.${kind}`, {}, [h("b", {}, title), h("ul.notes-list", {}, notes.map((n) => h("li", {}, n)))]);
}

export const grid = (children, cls = "") => h(`div.chart-grid${cls ? "." + cls : ""}`, {}, children);

/** Small heading between chart groups inside a view. */
export const subhead = (title, note, ...extra) => h("div.subhead", {}, [h("h2", {}, title), note ? h("span.muted", {}, note) : null, ...extra]);

/** The bed chosen in 공정 › bed별; falls back to the first bed when that id no longer exists. */
export function currentBed(profiles) {
  return profiles.find((p) => p.id === state.ui.bed) || profiles[0];
}

// ---------------------------------------------------------------------------------- one bed
const liveComps = (profile) => components().filter((c) => (profile.inlet?.[c.id] || []).some((v) => v > 0)
  || (state.project.feed[c.id] || 0) > 0);

/** Line width: targets bold, sugars normal, the rest thin and dashed. */
function style(c) {
  return c.role === "remove" ? { width: 2.4 } : c.role === "keep" ? { width: 1.8 } : { width: 1.3, dash: "5 4" };
}

/** Outlet over time: C/C₀ (breakthrough) with the service time and the targets. */
export function outletCharts(profile, summary) {
  const service = summary.service_h;
  const comps = liveComps(profile);
  const targets = comps.filter((c) => c.role === "remove");
  const levels = [...new Set(targets.map((c) => 100 - c.target))];
  return [
    createChart({
      title: "출구 농도 (파과곡선)", caption: "C/C₀ = 출구 ÷ 공정 입구 · 굵은 선 = 제거 대상, 점선 = 무관 · 1을 넘으면 밀려난 성분(roll-up)",
      xLabel: "운전 시간 t (h)", yLabel: "C / C₀", yMin: 0, height: 280,
      series: comps.map((c) => ({ name: c.name, color: compColor(c.id), x: profile.t_h, y: profile.frac[c.id], ...style(c) })),
      hlines: levels.map((l) => ({ y: l / 100, label: `목표 ${100 - l}% 제거 선` })),
      vlines: [{ x: service, label: "교체" }],
    }),
    createChart({
      title: "이 bed의 흡착 분율 (누적)", caption: "이 bed로 유입된 양 중 흡착된 비율",
      xLabel: "운전 시간 t (h)", yLabel: "누적 제거율 (%)", yMin: 0, yMax: 100, height: 280,
      series: comps.map((c) => ({ name: c.name, color: compColor(c.id), x: profile.t_h,
        y: profile.held_share[c.id].map((v) => 100 * v), ...style(c) })),
      vlines: [{ x: service, label: "교체" }],
    }),
    createChart({
      title: "출구 농도 (g/L)", xLabel: "운전 시간 t (h)", yLabel: "C (g/L)", yMin: 0, height: 280,
      series: comps.map((c) => ({ name: c.name, color: compColor(c.id), x: profile.t_h, y: profile.outlet[c.id], ...style(c) })),
      vlines: [{ x: service, label: "교체" }],
    }),
  ];
}

let playTimer = null;
export const stopPlay = () => { clearInterval(playTimer); playTimer = null; };

/** Along the bed at chosen times: slider + play over the snapshots; only this block redraws while dragging. */
export function zTimeline(profile, summary) {
  stopPlay();
  const snaps = profile.snapshots;
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
  const stop = () => { stopPlay(); play.textContent = "▶ 재생"; };
  const show = (i) => {
    index = i;
    slider.value = String(i);
    timeValue.textContent = `${fmt(snaps[i].t_h, 1)} h`;
    setUi({ snap: i }, { silent: true });
    chartsBox.replaceChildren(zCharts(profile, snaps, i));
  };
  show(index);
  return h("div", {}, [
    h("div.time-control", {}, [
      h("span.filter-label", {}, "운전 시간"), slider, timeValue, play,
      h("span.muted.small", {}, `교체 주기 ${fmt(summary.service_h, 1)} h — 움직이면 흡착 띠(물질전달대)가 출구 쪽으로 밀려가는 모습`),
    ]),
    chartsBox,
  ]);
}

function zCharts(profile, snaps, index) {
  const snap = snaps[index];
  const comps = liveComps(profile);
  const feed = state.project.feed;
  const main = comps.filter((c) => c.role === "remove")[0] || comps[0];
  const many = (title, caption, yLabel, pick, extra = {}) => createChart({
    title, caption, xLabel: Z_LABEL, yLabel, yMin: 0, ...extra,
    series: snaps.map((sn, i) => ({ name: `${fmt(sn.t_h, 1)} h`, color: timeColor(i, snaps.length),
      x: profile.z, y: pick(sn), width: i === index ? 3.4 : 1.3 })),
  });
  return grid([
    createChart({
      title: `액 농도 — 운전 ${fmt(snap.t_h, 1)} h`, caption: "C/C₀ (공정 입구 기준) · 0 = 완전 제거, 1 = 흡착 없이 통과",
      xLabel: Z_LABEL, yLabel: "C / C₀", yMin: 0,
      series: comps.map((c) => ({ name: c.name, color: compColor(c.id), x: profile.z,
        y: snap.C[c.id].map((v) => (feed[c.id] > 0 ? v / feed[c.id] : NaN)), ...style(c) })),
    }),
    createChart({
      title: `흡착량 q — 운전 ${fmt(snap.t_h, 1)} h`, caption: "흡착제 1 g당 흡착량. 입구부터 차례로 포화",
      xLabel: Z_LABEL, yLabel: "q (mg/g)", yMin: 0,
      series: comps.filter((c) => c.role !== "keep" || true).map((c) => ({ name: c.name, color: compColor(c.id), x: profile.z,
        y: snap.q[c.id], ...style(c) })),
    }),
    many(`${main.name} — 시간별`, "곡선이 오른쪽으로 밀림 = 입구 흡착제가 포화", "C / C₀",
      (sn) => sn.C[main.id].map((v) => (feed[main.id] > 0 ? v / feed[main.id] : NaN))),
    many(`${main.name} 흡착량 — 시간별`, "포화된 구간이 입구부터 넓어짐", "q (mg/g)", (sn) => sn.q[main.id]),
  ]);
}

// ---------------------------------------------------------------------------------- whole train
/** Product (outlet of the last bed) over time, and the cumulative removal of the train. */
export function trainCharts(summary) {
  const comps = components().filter((c) => (state.project.feed[c.id] || 0) > 0);
  return [
    createChart({
      title: "제품 출구 농도 — 공정 전체", caption: "마지막 bed 출구의 C/C₀ · 굵은 선 = 제거 대상",
      xLabel: "운전 시간 t (h)", yLabel: "C / C₀", yMin: 0, height: 280,
      series: comps.map((c) => ({ name: c.name, color: compColor(c.id), x: summary.t_h, y: summary.product_frac[c.id], ...style(c) })),
      hlines: [...new Set(comps.filter((c) => c.role === "remove").map((c) => 100 - c.target))]
        .map((l) => ({ y: l / 100, label: `목표 ${100 - l}% 제거 선` })),
      vlines: [{ x: summary.service_h, label: "교체" }],
    }),
    createChart({
      title: "누적 제거율 — 제품 탱크 평균", caption: "그때까지 모은 유출액의 평균 제거율 (1 − 유출량 ÷ 유입량)",
      xLabel: "운전 시간 t (h)", yLabel: "누적 제거율 (%)", yMin: 0, yMax: 100, height: 280,
      series: comps.map((c) => ({ name: c.name, color: compColor(c.id), x: summary.t_h,
        y: summary.removal_t[c.id].map((v) => 100 * v), ...style(c) })),
      vlines: [{ x: summary.service_h, label: "교체" }],
    }),
  ];
}
