// 단일 bed › 입력: what the tests were (left: components, the hydrolysate C₀, the shared test protocol) and one card
// per adsorbent. Clicking a card opens ONE form: name, kind, mass and a single table (components × times, and the
// values after standing = equilibrium; the adsorbent's own standing times, one or more). Nothing else to fill in.

import { h, isNum, toast } from "../util.js";
import { api } from "../api.js";
import { state, change, newId, setSingle } from "../store.js";
import { KIND, dot, numField, select, num, placeholder, bestText } from "./common.js";
import { helpTip } from "./help.js";
import { openModal, closeModal } from "../modal.js";

// ------------------------------------------------------------------------------------ sidebar
export function inputSidebar() {
  const p = state.project;
  const t = p.test;
  const setTest = (key, structural = false) => (v) => { if (v !== null) change((pr) => { pr.test[key] = v; }, { structural }); };
  const compRows = p.components.map((c) => {
    const name = h("input.text.comp-name", { value: c.name, maxlength: 40, "aria-label": "성분 이름" });
    name.addEventListener("change", () => change((pr) => { pr.components.find((x) => x.id === c.id).name = name.value.trim() || c.name; }, { structural: true }));
    return h("div.comp-row", {}, [dot(c.id), name,
      h("button.icon-btn.del", { title: "성분 삭제", onclick: () => deleteComponent(c) }, "✕")]);
  });
  const c0Rows = p.components.map((c) => row([dot(c.id), c.name],
    numField(p.feed[c.id], (v) => change((pr) => { pr.feed[c.id] = v ?? 0; }), { bare: true, min: 0 }), "g/L"));
  // a sampling time is applied only when the box is left (a half-typed "4" must never reach the data), and it must
  // stay between its neighbours: the concentration columns belong to the times in this order
  const timeInputs = t.times.map((time, i) => {
    const box = numField(time, (v) => {
      const lo = t.times[i - 1] ?? 0, hi = t.times[i + 1] ?? Infinity;
      if (v === null || v <= lo || v >= hi) {
        box.value = String(time);
        const low = lo ? `${num(lo)} min` : "0"; toast(Number.isFinite(hi) ? `채취 시간은 ${low}보다 크고 ${num(hi)} min보다 작아야 합니다 (측정 순서 유지)` : `채취 시간은 ${low}보다 커야 합니다 (측정 순서 유지)`, "warn");
        return;
      }
      change((pr) => { pr.test.times[i] = v; }, { structural: true });
    }, { width: 46, min: 0, commit: "change", required: true, title: "Enter 또는 칸을 벗어나면 적용" });
    return box;
  });
  return h("div.props", {}, [
    group("성분", [
      ...compRows,
      h("button.btn.ghost.small.add-btn", { onclick: addComponent }, "+ 성분 추가"),
    ], "시험에서 측정한 성분", "components"),
    group("초기 농도 C₀", c0Rows, "처리 전 가수분해액", "c0"),
    group("시험 조건", [
      row(["용액", helpTip("test_volume")], numField(t.V_mL, setTest("V_mL"), { bare: true, min: 0 }), "mL"),
      row(["채취량", helpTip("test_volume")], numField(t.sample_mL, setTest("sample_mL"), { bare: true, min: 0 }), "mL"),
      h("div.prop", {}, h("div.prop-row.static", {}, [h("span.prop-label", {}, ["채취 시간 (공통)", helpTip("sample_times")]),
        h("span.time-inputs", {}, [...timeInputs, h("small.muted", {}, "min")])])),
      h("div.row.tight-row", {}, [
        h("button.btn.ghost.small", { onclick: () => changeTimes(1), disabled: t.times.length >= 8 || null }, "+ 시간"),
        h("button.btn.ghost.small", { onclick: () => changeTimes(-1), disabled: t.times.length <= 1 || null }, "− 시간"),
      ]),
      row(["평형 시간 (기본값)", helpTip("eq_time")], numField(t.eq_h, setTest("eq_h"), { bare: true, min: 0 }), "h", "새 흡착제에 처음 들어가는 평형 시간"),
      h("p.pgroup-note", {}, `시간마다 튜브 하나 (${num(t.V_mL)} mL에서 ${num(t.sample_mL)} mL 채취). 마지막 튜브는 채취 후에도 흡착을 계속하여 `
        + "평형 시간에 재측정합니다. 평형 시간은 흡착제마다 입력 창에서 변경·추가할 수 있고, 채취로 줄어든 양은 물질수지로 자동 보정합니다."),
    ], "모든 흡착제 공통"),
  ]);
}

const row = (label, input, unit, title = "") => h("div.prop", {}, h("div.prop-row.static", { title }, [
  h("span.prop-label", {}, label), h("div.num-wrap", {}, [input, h("span.unit", {}, unit)])]));

const group = (title, rows, note = "", tip = null) => h("section.pgroup.feed", {}, [
  h("div.pgroup-head", {}, [h("b", {}, title), tip ? helpTip(tip) : null, note ? h("small.muted", {}, note) : null]), ...rows]);

function addComponent() {
  if (state.project.components.length >= state.spec.limits.components) return toast("성분이 너무 많습니다.", "bad");
  change((p) => {
    const id = newId("c", p.components.map((c) => c.id));
    p.components.push({ id, name: `새 성분 ${p.components.length + 1}`, mw: null, role: "any", target: 50, competitive: true });
    p.feed[id] = 0;
    for (const a of p.adsorbents) for (const t of a.tests) t.conc[id] = Array(cols(p, a)).fill(null);
  }, { structural: true });
}

/** Columns of an adsorbent's table: the sampling times, then its own standing (equilibrium) times. */
/** Sampling times of an adsorbent: its own (a kinetic test with other times) or the shared ones. */
export const timesOf = (p, a) => (a.times && a.times.length ? a.times : p.test.times);
const cols = (p, a) => timesOf(p, a).length + (a.eq_h || []).length;

function deleteComponent(c) {
  if (state.project.components.length <= 1) return toast("성분이 하나는 있어야 합니다.", "bad");
  if (!confirm(`'${c.name}' 성분과 모든 흡착제의 해당 농도 값을 지울까요?`)) return;
  change((p) => {
    p.components = p.components.filter((x) => x.id !== c.id);
    delete p.feed[c.id];
    for (const a of p.adsorbents) for (const t of a.tests) delete t.conc[c.id];
  }, { structural: true });
}

/** Add or drop the last sampling time; every table keeps its equilibrium column at the end. */
function changeTimes(delta) {
  change((p) => {
    const n = p.test.times.length;
    if (delta > 0) p.test.times.push((p.test.times[n - 1] || 0) + 20);
    else p.test.times.pop();
    for (const a of p.adsorbents) {
      if (a.times && a.times.length) continue;        // its own sampling times: not affected
      for (const t of a.tests) {
        for (const id of Object.keys(t.conc)) {
          const vals = t.conc[id];
          const times = vals.slice(0, n);
          const eqs = vals.slice(n);
          if (delta > 0) times.push(null); else times.pop();
          t.conc[id] = [...times, ...eqs];
        }
      }
    }
  }, { structural: true });
}

// ------------------------------------------------------------------------------------ main: cards
export function inputMain() {
  const ads = state.project.adsorbents;
  const cmp = state.results.compare;
  const rows = Object.fromEntries((cmp.data?.rows || []).map((r) => [r.id, r]));
  const cards = ads.map((a) => {
    const filled = fillCount(a);
    const r = rows[a.id];
    const run = r?.analysis?.runs?.[0];
    const above = aboveFeed(a);
    let status, statusText;
    if (filled.done === 0) { status = "muted"; statusText = "비어 있음"; }
    else if (r?.error) { status = "bad"; statusText = "확인 필요"; }
    else if (above) { status = "bad"; statusText = "⚠ 값 확인"; }
    else if (filled.done < filled.total) { status = "warn"; statusText = `${filled.done}/${filled.total}칸`; }
    else { status = "ok"; statusText = "입력 완료"; }
    // no result text without data: "뚜렷한 흡착 성분 없음" would read as "does not adsorb"
    const result = run && !r?.error && filled.done >= filled.total * 0.3 ? bestText(run) : "";
    const why = r?.error || (above ? `C₀보다 큰 값 ${above}칸 — 단위(mg/L ↔ g/L)나 입력을 확인하세요` : "눌러서 입력");
    return h("button.ads-card", { onclick: () => openForm(a.id), title: why }, [
      h("div.ads-card-top", {}, [h("span.bed-dot", { class: `bed-dot ${a.kind}` }), h("b", {}, a.name),
        h(`span.tag.${status}`, {}, statusText)]),
      h("div.ads-card-sub", {}, `${KIND[a.kind]} · ${isNum(a.tests[0]?.m_g) ? `${num(a.tests[0].m_g)} g` : "질량 미입력"}`
        + (a.times && a.times.length ? ` · 채취 ${a.times.map((x) => num(x)).join("·")} min` : "")
        + ` · 평형 ${(a.eq_h || []).length ? `${num(a.eq_h[eqRef(a)])} h${a.eq_h.length > 1 ? ` (측정 ${a.eq_h.length}회)` : ""}` : "마지막 채취 시간"}`
        + (a.tests.length > 1 ? ` · 추가 시험 ${a.tests.length - 1}` : "")),
      result ? h("div.ads-card-result", {}, ["주요 흡착 성분 ", h("b", {}, result)])
        : h("div.ads-card-result.muted", {}, filled.done ? (r?.error ? r.error : "데이터 부족 — 분석할 수 없음") : "시험 데이터를 입력하세요"),
    ]);
  });
  return h("div", {}, [
    h("div.subhead", {}, [h("h2", {}, `흡착제 ${ads.length}개`), h("span.muted", {}, "카드를 누르면 입력 창이 열립니다 · 값은 바로 저장됩니다 · 많으면 목록 안에서 스크롤")]),
    h("div.ads-scroll", {}, h("div.ads-cards", {}, [
      h("button.ads-card.add", { onclick: addAdsorbent }, [h("b", {}, "+ 흡착제 추가"), h("div.ads-card-sub", {}, "이름과 실험 데이터 입력")]),
      ...cards])),
    ads.length ? null : placeholder("흡착제가 없습니다. '+ 흡착제 추가'를 누르세요."),
  ]);
}

/** Number of cells above C₀ (beyond 5 %): a sign of a unit or typing error. */
function aboveFeed(a) {
  let n = 0;
  for (const t of a.tests) for (const c of state.project.components) {
    const c0 = state.project.feed[c.id];
    if (!(c0 > 0)) continue;
    for (const v of t.conc?.[c.id] || []) if (isNum(v) && v > c0 * 1.05) n += 1;
  }
  return n;
}

function fillCount(a) {
  const t = a.tests[0];
  let done = 0, total = 0;
  for (const c of state.project.components) {
    for (const v of t?.conc?.[c.id] || []) { total += 1; if (isNum(v)) done += 1; }
  }
  return { done, total };
}

export function addAdsorbent() {
  const p = state.project;
  if (p.adsorbents.length >= state.spec.limits.adsorbents) return toast("흡착제가 너무 많습니다.", "bad");
  const letter = String.fromCharCode(65 + (p.adsorbents.length % 26));
  const id = newId("ads", p.adsorbents.map((a) => a.id));
  change((pr) => {
    const ads = { id, name: `흡착제 ${letter}`, kind: "other", ...state.spec.kind_defaults.other, model: "auto", note: "",
      eq_h: [pr.test.eq_h], tests: [] };
    ads.tests.push(blankTest(pr, ads, null));           // the mass is entered, never inherited from another adsorbent
    pr.adsorbents.push(ads);
  }, { structural: true });
  openForm(id);
}

function blankTest(p, a, m_g = null) {
  return { m_g, conc: Object.fromEntries(p.components.map((c) => [c.id, Array(cols(p, a)).fill(null)])) };
}

// ------------------------------------------------------------------------------------ the form (widget)
const findAds = (p, id) => p.adsorbents.find((a) => a.id === id);

export function openForm(id) {
  const ads = findAds(state.project, id);
  if (!ads) return;
  if (state.single.ads !== id) state.single.ads = id;          // 1-2 then shows this one; the step-3 pick is guide.ads
  const upd = (fn, structural = false) => change((p) => fn(findAds(p, id)), { structural });
  const t = state.project.test;
  const dose = (m) => (isNum(m) && t.V_mL > 0 ? `투입량 ${num(m / (t.V_mL / 1000))} g/L` : "");

  const name = h("input.text.form-name", { value: ads.name, maxlength: 40, "aria-label": "흡착제 이름" });
  name.addEventListener("input", () => upd((a) => { a.name = name.value.trim() || a.name; }));
  const note = h("input.text", { value: ads.note || "", maxlength: 200, placeholder: "메모 (제품명, 전처리 등)" });
  note.addEventListener("change", () => upd((a) => { a.note = note.value; }));

  const redraw = () => openForm(id);
  const tables = ads.tests.map((test, i) => testBlock(ads, test, i, upd, dose, redraw));
  const body = h("div.ads-form", {}, [
    h("div.form-head", {}, [
      h("span.bed-dot", { class: `bed-dot ${ads.kind}` }), name,
      select(Object.entries(KIND), ads.kind, (v) => { upd((a) => {
        const old = state.spec.kind_defaults[a.kind], neu = state.spec.kind_defaults[v];
        for (const key of ["d_p_mm", "rho_b", "eps_b"]) if (a[key] === old[key]) a[key] = neu[key];
        a.kind = v;
      }, true); redraw(); }, { "aria-label": "종류" }),
      helpTip("kind"),
    ]),
    h("div.form-row", {}, [
      h("label.inline", { title: "실험에 쓴 흡착제 입자(분말) 크기. 컬럼 설계에서 입자가 더 크면 속도를 보수적으로 낮추는 데 씀" }, [
        "실험 입자 크기 ", numField(ads.d_test_um, (v) => upd((a) => { a.d_test_um = v; }), { width: 70, min: 0, placeholder: "모르면 비움" }), " µm"]),
      helpTip("d_test"),
      h("small.muted", {}, "분말이면 보통 10–100 µm · 컬럼 설계에만 쓰임 (회분에는 영향 없음)"),
    ]),
    note,
    timesBar(ads, upd, redraw),
    ...tables,
    h("details.more-tests", { open: ads.tests.length > 1 || null }, [
      h("summary", {}, [`추가 시험 — 흡착제 질량만 바꾼 시험 (${ads.tests.length - 1}개) · 있으면 Langmuir 등 곡선형 등온식을 맞출 수 있음`, helpTip("extra_tests")]),
      h("button.btn.ghost.small", { onclick: () => {
        if (ads.tests.length >= state.spec.limits.runs) return;
        upd((a) => a.tests.push(blankTest(state.project, a, null)), true);
        redraw();
      } }, "+ 추가 시험"),
    ]),
    h("div.form-foot", {}, [
      h("button.btn.ghost.small", { onclick: () => savePreset(id) }, "💾 프리셋으로 저장"), helpTip("presets"),
      h("button.btn.ghost.small", { onclick: () => duplicate(id) }, "복제"),
      h("button.btn.ghost.small.danger", { onclick: () => remove(id) }, "삭제"),
      h("span.spacer"),
      h("button.btn.primary.small", { onclick: closeModal }, "닫기"),
    ]),
  ]);
  openModal(body, "form-modal");
}

/** Sampling times of this adsorbent: the shared ones, or its own (switch), editable here when they are its own. */
function timesBar(ads, upd, redraw) {
  const p = state.project;
  const own = Boolean(ads.times && ads.times.length);
  const times = timesOf(p, ads);
  const n = times.length;
  const resize = (a, from, to) => {          // the time columns of every test go from `from` to `to` columns
    for (const t of a.tests) for (const id of Object.keys(t.conc)) {
      const vals = t.conc[id];
      const timed = vals.slice(0, from), eqs = vals.slice(from);
      t.conc[id] = [...(timed.length >= to ? timed.slice(0, to) : [...timed, ...Array(to - timed.length).fill(null)]), ...eqs];
    }
  };
  const toggle = h("input", { type: "checkbox", checked: own ? null : true, onchange: (e) => {
    if (!e.target.checked) {
      upd((a) => { a.times = [...p.test.times]; }, true);
    } else {
      const shared = p.test.times.length;
      if (shared !== n && !confirm(`공통 채취 시간(${p.test.times.map((x) => num(x)).join("·")} min)으로 바꾸면 시간 열이 ${n}개 → ${shared}개가 됩니다`
        + (shared < n ? ` (뒤의 ${n - shared}개 열 값은 지워짐)` : "") + ". 계속할까요?")) { e.target.checked = false; return; }
      upd((a) => { resize(a, n, shared); a.times = null; }, true);
    }
    redraw();
  } });
  const boxes = own ? times.map((time, k) => {
    const box = numField(time, (v) => {
      const lo = times[k - 1] ?? 0, hi = times[k + 1] ?? Infinity;
      if (v === null || v <= lo || v >= hi) {
        box.value = String(time);
        const low = lo ? `${num(lo)} min` : "0";
        toast(Number.isFinite(hi) ? `채취 시간은 ${low}보다 크고 ${num(hi)} min보다 작아야 합니다 (측정 순서 유지)`
          : `채취 시간은 ${low}보다 커야 합니다 (측정 순서 유지)`, "warn");
        return;
      }
      upd((a) => { a.times[k] = v; }, true);
      redraw();
    }, { width: 50, min: 0, commit: "change", required: true, title: "흡착제 투입 후 채취 시간 (min) · Enter 또는 칸을 벗어나면 적용" });
    return box;
  }) : [];
  return h("div.times-bar", {}, [
    h("b", {}, "채취 시간"), helpTip("sample_times"),
    h("label.check", { title: "끄면 이 흡착제만의 채취 시간을 씁니다 (예: 문헌의 속도 실험 시간)" }, [toggle,
      ` 공통 시간 사용 (${p.test.times.map((x) => num(x)).join("·")} min)`]),
    ...(own ? [
      h("span.time-inputs", {}, [...boxes, h("small.muted", {}, "min")]),
      h("button.btn.ghost.small", { disabled: n >= 12 || null, onclick: () => {
        upd((a) => { a.times.push((a.times[n - 1] || 0) + 20); resize(a, n, n + 1); }, true);
        redraw();
      } }, "+ 시간"),
      h("button.btn.ghost.small", { disabled: n <= 1 || null, onclick: () => {
        if (!confirm(`마지막 채취 시간(${num(times[n - 1])} min)과 그 농도 열을 지울까요?`)) return;
        upd((a) => { a.times.pop(); resize(a, n, n - 1); }, true);
        redraw();
      } }, "− 시간"),
    ] : [h("small.muted", {}, "흡착제마다 속도 실험 시간이 다르면 체크를 끄고 이 흡착제의 시간을 넣으세요")]),
  ]);
}

/** Index of the standing measurement that counts as the equilibrium (the latest one unless the user marked another). */
function eqRef(ads) {
  const eqs = ads.eq_h || [];
  if (!eqs.length) return null;
  if (Number.isInteger(ads.eq_ref) && ads.eq_ref >= 0 && ads.eq_ref < eqs.length) return ads.eq_ref;
  return eqs.indexOf(Math.max(...eqs));
}

/** Heading of the 평형 측정 section: what it is, and the button that adds one more standing measurement. */
function eqBar(ads, upd, redraw) {
  const eqs = ads.eq_h || [];
  return h("div.eq-bar", {}, [
    h("b", {}, "평형 측정"), helpTip("eq_time"),
    h("small.muted", {}, eqs.length
      ? "마지막 튜브를 채취 후 흡착을 계속하여 재측정한 값 · 시간과 값을 넣고, 평형으로 볼 측정에 '평형'을 체크하세요 (체크한 측정을 평형 기준으로 계산)"
      : "평형 측정이 없으면 마지막 채취 시간의 값을 평형으로 간주합니다"),
    h("span.spacer"),
    eqs.length < 6 ? h("button.btn.ghost.small", { onclick: () => {
      upd((a) => {
        const marked = eqRef(a);
        const last = a.eq_h.length ? Math.max(...a.eq_h) : null;
        a.eq_h.push(last ? last + 8 : state.project.test.eq_h);
        a.eq_ref = marked === null ? 0 : marked;                 // adding a measurement never moves the mark
        for (const t of a.tests) for (const id of Object.keys(t.conc)) t.conc[id].push(null);
      }, true);
      redraw();
    } }, "+ 평형 측정 추가") : null,
  ]);
}

/** Header cell of one standing measurement: its time, the 평형 mark, and (base test only) the delete button. */
function eqHead(ads, k, upd, redraw, editable) {
  const n = timesOf(state.project, ads).length;
  const ref = eqRef(ads);
  const hours = ads.eq_h[k];
  if (!editable) return h("th.eq-col", {}, [`${num(hours)} h`, k === ref ? h("span.tag.ok.eq-mark", {}, "평형") : null]);
  const time = numField(hours, (v) => { if (v && v > 0) upd((a) => { a.eq_h[k] = v; }); },
    { width: 46, min: 0, title: "흡착제 투입 후 이 시간에 재측정", commit: "change", required: true });
  const mark = h("input", { type: "checkbox", checked: k === ref || null, title: "이 측정을 평형 기준으로 사용",
    onchange: () => { upd((a) => { a.eq_ref = k; }, true); redraw(); } });
  return h(`th.eq-col${k === ref ? ".eq-on" : ""}`, {}, [
    h("div.eq-head", {}, [time, h("span", {}, "h"),
      h("button.icon-btn.del", { title: "이 평형 측정 지우기", onclick: () => {
        upd((a) => {
          const marked = eqRef(a);
          a.eq_h.splice(k, 1);
          for (const t of a.tests) for (const id of Object.keys(t.conc)) t.conc[id].splice(n + k, 1);
          a.eq_ref = !a.eq_h.length ? null : marked === k ? a.eq_h.indexOf(Math.max(...a.eq_h)) : marked > k ? marked - 1 : marked;
        }, true);
        redraw();
      } }, "✕")]),
    h("label.eq-check", {}, [mark, " 평형"]),
  ]);
}

function testBlock(ads, test, i, upd, dose, redraw) {
  const p = state.project;
  const times = timesOf(p, ads);
  const doseText = h("span.dose", {}, dose(test.m_g));
  const mass = numField(test.m_g, (v) => { upd((a) => { a.tests[i].m_g = v; }); doseText.textContent = dose(v); },
    { width: 70, min: 0, title: "튜브 하나에 넣은 흡착제 질량" });
  const eqs = ads.eq_h || [];
  const ref = eqRef(ads);
  const cellOf = (c, r, j) => {
    const c0 = p.feed[c.id];
    const flag = (v) => {
      const high = isNum(v) && c0 > 0 && v > c0 * 1.05;
      cell.classList.toggle("above", high);
      if (!cell.classList.contains("invalid")) cell.title = high ? `C₀(${num(c0)} g/L)보다 큽니다 — 단위(mg/L ↔ g/L)나 입력을 확인하세요` : "";
    };
    const cell = numField(test.conc[c.id]?.[j], (v) => { upd((a) => { (a.tests[i].conc[c.id] ||= [])[j] = v; }); flag(v); }, { width: 72, min: 0 });
    flag(test.conc[c.id]?.[j]);
    cell.dataset.row = r;
    cell.dataset.col = j;
    cell.addEventListener("paste", (event) => pasteCells(event, cell));
    cell.addEventListener("keydown", (event) => moveFocus(event, cell));
    return cell;
  };
  // 1) concentrations at the sampling times (one tube per time)
  const timeTable = h("table.data.grid-table", {}, [
    h("thead", {}, h("tr", {}, [h("th", {}, "성분"), h("th.c0-col", { title: "초기 농도 (왼쪽 공통 설정)" }, "C₀ (g/L)"),
      ...times.map((t) => h("th", {}, `${num(t)} min`))])),
    h("tbody", {}, p.components.map((c, r) => h("tr", {}, [
      h("th", {}, [dot(c.id), c.name]), h("td.c0-col", {}, num(p.feed[c.id])),
      ...times.map((_, j) => h("td", {}, cellOf(c, r, j)))]))),
  ]);
  // 2) the standing (equilibrium) measurements of the last tube: their own table, with the 평형 mark
  const eqTable = eqs.length ? h("table.data.grid-table.eq-table", {}, [
    h("thead", {}, h("tr", {}, [h("th", {}, "성분"), ...eqs.map((_, k) => eqHead(ads, k, upd, redraw, i === 0))])),
    h("tbody", {}, p.components.map((c, r) => h("tr", {}, [
      h("th", {}, [dot(c.id), c.name]),
      ...eqs.map((_, k) => h(`td.eq-col${k === ref ? ".eq-on" : ""}`, {}, cellOf(c, r, times.length + k)))]))),
  ]) : null;
  return h("section.test-block", {}, [
    h("div.test-head", {}, [
      h("b", {}, i === 0 ? "실험 데이터" : `추가 시험 ${i}`),
      h("label.inline", {}, ["흡착제 질량 ", mass, " g"]), helpTip("mass"), doseText,
      h("span.spacer"),
      i > 0 ? h("button.icon-btn.del", { title: "이 추가 시험 지우기", onclick: () => {
        upd((a) => a.tests.splice(i, 1), true);
        openForm(ads.id);
      } }, "✕") : h("span.row", {}, [h("small.muted", {}, "농도 g/L · 엑셀 표를 첫 칸에 붙여넣기 가능"), helpTip("conc")]),
    ]),
    h("div.test-sub", {}, "채취 시간별 농도"),
    h("div.table-wrap", {}, timeTable),
    i === 0 ? eqBar(ads, upd, redraw) : (eqs.length ? h("div.test-sub", {}, "평형 측정") : null),
    eqTable ? h("div.table-wrap", {}, eqTable) : null,
  ]);
}

function pasteCells(event, cell) {
  const text = event.clipboardData?.getData("text") ?? "";
  if (!/[\t\n]/.test(text.trim())) return;              // a single value: normal paste
  event.preventDefault();
  let rows = text.replace(/\r/g, "").split("\n").filter((line, i, all) => line.length || i < all.length - 1)
    .map((line) => line.split("\t"));
  const isNumText = (x) => x.trim() === "" || Number.isFinite(Number(x.trim().replace(",", ".")));
  const notes = [];
  // a header row (times, "성분" …) and a name column are left out, so the values land where they belong
  if (rows.length > 1 && rows[0].some((x) => x.trim() !== "" && !isNumText(x)) && rows.slice(1).some((r) => r.slice(1).some((x) => x.trim() !== "" && isNumText(x)))) {
    rows = rows.slice(1);
    notes.push("머리글 행 제외");
  }
  const names = state.project.components.map((c) => c.name.trim());
  let byName = false;
  if (rows.length && rows.every((r) => r.length > 1 && !isNumText(r[0]))) {
    byName = rows.every((r) => names.includes(r[0].trim()));
    notes.push(byName ? "성분 이름으로 행 맞춤" : "이름 열 제외");
  }
  const table = cell.closest(".test-block");
  const r0 = Number(cell.dataset.row), c0 = Number(cell.dataset.col);
  let filled = 0, skipped = 0;
  rows.forEach((cells, di) => {
    const row = byName ? names.indexOf(cells[0].trim()) : r0 + di;
    const values = notes.some((n) => n.includes("이름")) ? cells.slice(1) : cells;
    values.forEach((raw, dj) => {
      const target = table.querySelector(`input[data-row="${row}"][data-col="${c0 + dj}"]`);
      const t = raw.trim().replace(",", ".");
      if (!target || !isNumText(t)) { skipped += 1; return; }
      target.value = t;
      target.dispatchEvent(new Event("input"));
      filled += 1;
    });
  });
  toast(`${filled}칸을 채웠습니다${notes.length ? ` (${notes.join(", ")})` : ""}${skipped ? ` · ${skipped}칸은 표 밖이거나 숫자가 아니라 건너뜀` : ""}.`, skipped ? "warn" : "ok");
}

function moveFocus(event, cell) {
  const d = { Enter: 1, ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (!d) return;
  event.preventDefault();
  const table = cell.closest(".test-block");
  let next = table.querySelector(`input[data-row="${Number(cell.dataset.row) + d}"][data-col="${cell.dataset.col}"]`);
  if (!next && event.key === "Enter") next = table.querySelector(`input[data-row="0"][data-col="${Number(cell.dataset.col) + 1}"]`);
  next?.focus();
  next?.select();
}

function duplicate(id) {
  if (state.project.adsorbents.length >= state.spec.limits.adsorbents) {
    return toast(`흡착제는 ${state.spec.limits.adsorbents}개까지입니다. 복제하려면 하나를 삭제하세요.`, "bad");
  }
  const ads = findAds(state.project, id);
  const newIdValue = newId("ads", state.project.adsorbents.map((a) => a.id));
  change((p) => { p.adsorbents.push({ ...structuredClone(ads), id: newIdValue, name: `${ads.name} (복사)` }); }, { structural: true });
  openForm(newIdValue);
}

function remove(id) {
  const ads = findAds(state.project, id);
  if (!confirm(`'${ads.name}'와 실험 데이터를 지울까요? (저장한 프리셋은 남습니다)`)) return;
  closeModal();
  change((p) => { p.adsorbents = p.adsorbents.filter((a) => a.id !== id); }, { structural: true });
}

// ------------------------------------------------------------------------------------ presets
async function savePreset(id) {
  const ads = findAds(state.project, id);
  try {
    const { items } = await api.library();
    if (items.some((it) => it.name.trim() === ads.name.trim()) && !confirm(`'${ads.name}' 프리셋이 이미 있습니다. 덮어쓸까요?`)) return;
    await api.librarySave(ads, state.project.components);
    toast(`'${ads.name}' 프리셋을 저장했습니다.`, "ok");
  } catch (error) {
    toast(error.message, "bad");
  }
}

export async function openLibrary() {
  let items;
  try {
    ({ items } = await api.library());
  } catch (error) {
    return toast(error.message, "bad");
  }
  const list = h("div.library-list");
  const draw = (entries) => {
    list.replaceChildren(...(entries.length ? entries.map((it) => h("div.library-item", {}, [
      h("div", {}, [h("b", {}, it.name), it.builtin ? h("span.tag.info.lib-tag", {}, "문헌") : null,
        h("small.muted", {}, ` ${KIND[it.kind] || ""} · 시험 ${it.runs}개`
          + (it.times?.length ? ` · 채취 ${it.times.map((x) => num(x)).join("·")} min` : "") + (it.builtin ? "" : ` · ${it.saved}`))]),
      h("div.row", {}, [
        h("button.btn.primary.small", { onclick: () => loadPreset(it.id) }, "불러오기"),
        it.builtin ? null : h("button.btn.ghost.small", { onclick: async () => {
          if (!confirm(`'${it.name}' 프리셋을 삭제할까요?`)) return;
          try { draw((await api.libraryDelete(it.id)).items); } catch (error) { toast(error.message, "bad"); }
        } }, "삭제"),
      ]),
    ])) : [h("p.muted", {}, "저장된 프리셋이 없습니다. 흡착제 입력 창의 '💾 프리셋으로 저장'으로 만드세요.")]));
  };
  draw(items);
  openModal(h("div.library", {}, [h("h2", {}, "흡착제 프리셋"),
    h("p.muted.small", {}, "흡착제 이름·종류·양과 실험 데이터가 함께 저장됩니다. '문헌' 표시는 논문 값으로 만든 예시 흡착제입니다 "
      + "(각 흡착제 메모에 출처와 가정). 문헌 프리셋은 지울 수 없습니다."), list]));
}

async function loadPreset(id) {
  try {
    const data = await api.libraryItem(id);
    const ads = data.adsorbent;
    const added = [];
    const lim = state.spec.limits;
    const newComps = (data.components || []).filter((c) => !state.project.components.some((x) => x.id === c.id));
    if (state.project.adsorbents.length >= lim.adsorbents) return toast(`흡착제는 ${lim.adsorbents}개까지입니다. 하나를 삭제한 뒤 불러오세요.`, "bad");
    if (state.project.components.length + newComps.length > lim.components) {
      return toast(`이 프리셋을 불러오면 성분이 ${lim.components}개를 넘습니다 (${newComps.map((c) => c.name).join(", ")} 추가 필요).`, "bad");
    }
    change((p) => {
      for (const c of data.components || []) {
        if (!p.components.some((x) => x.id === c.id)) {
          p.components.push({ id: c.id, name: c.name, mw: c.mw, role: "any", target: 50, competitive: true });
          p.feed[c.id] = 0;
          added.push(c.name);
          for (const a of p.adsorbents) for (const t of a.tests) t.conc[c.id] = Array(cols(p, a)).fill(null);
        }
      }
      ads.eq_h ||= [p.test.eq_h];
      for (const t of ads.tests || []) for (const c of p.components) t.conc[c.id] ||= Array(cols(p, ads)).fill(null);
      const taken = p.adsorbents.map((a) => a.id);
      if (taken.includes(ads.id)) ads.id = newId("ads", taken);
      p.adsorbents.push(ads);
    }, { structural: true });
    closeModal();
    setSingle({ ads: ads.id });
    toast(`'${ads.name}'을(를) 불러왔습니다${added.length ? ` (성분 추가: ${added.join(", ")})` : ""}.`, "ok");
  } catch (error) {
    toast(error.message, "bad");
  }
}

