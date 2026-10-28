// Downloads for the report: a Markdown summary, the outlet curves as CSV, the conditions as JSON, and the
// project (components, composition, adsorbents with their tests) as JSON.

import { download, fmt, fmtSmart, today, toast } from "./util.js";
import { state, setParams, emit, isFresh, replaceProject } from "./store.js";
import { api } from "./api.js";

/** The results on screen, only if they belong to the conditions on screen (else a report would mix them). */
function currentResult() {
  const steady = state.results.steady;
  if (steady?.error) { toast("지금 조건으로는 계산 결과가 없습니다 (오류). 조건을 고친 뒤 내보내세요", "warn"); return null; }
  if (!steady?.data) { toast("먼저 계산이 끝나야 합니다 (단일 bed › 위치별·시간별 또는 공정 화면)", "warn"); return null; }
  if (!isFresh(steady)) { toast("조건이 바뀌었습니다. 계산을 마친 뒤 내보내세요", "warn"); return null; }
  return steady.data;
}

// ------------------------------------------------------------------------------------ shared report helpers
const escapeHtml = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (x) => escapeHtml(x).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

/** The Markdown report as a stand-alone HTML page (opens in any browser; print → PDF). */
export function markdownToHtml(md, title) {
  const out = [];
  let table = null, list = false;
  const flushTable = () => {
    if (!table) return;
    const [head, , ...body] = table;
    out.push("<table><thead><tr>" + head.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>"
      + body.map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") + "</tbody></table>");
    table = null;
  };
  const flushList = () => { if (list) { out.push("</ul>"); list = false; } };
  for (const raw of md.split("\n")) {
    const lineText = raw.trimEnd();
    if (lineText.startsWith("|")) { flushList(); (table ||= []).push(lineText.slice(1, -1).split("|").map((c) => c.trim())); continue; }
    flushTable();
    if (lineText.startsWith("- ")) { if (!list) { out.push("<ul>"); list = true; } out.push(`<li>${inline(lineText.slice(2))}</li>`); continue; }
    flushList();
    if (lineText.startsWith("# ")) out.push(`<h1>${inline(lineText.slice(2))}</h1>`);
    else if (lineText.startsWith("## ")) out.push(`<h2>${inline(lineText.slice(3))}</h2>`);
    else if (lineText.startsWith("> ")) out.push(`<p class="meta">${inline(lineText.slice(2))}</p>`);
    else if (lineText) out.push(`<p>${inline(lineText)}</p>`);
  }
  flushTable(); flushList();
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
body{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;max-width:900px;margin:32px auto;padding:0 16px;color:#1f2937;line-height:1.55}
h1{font-size:22px;border-bottom:2px solid #2563eb;padding-bottom:6px}h2{font-size:17px;margin-top:26px;color:#1e3a8a}
table{border-collapse:collapse;width:100%;margin:8px 0;font-size:13px}th,td{border:1px solid #d1d5db;padding:4px 8px;text-align:left}
th{background:#f3f4f6}.meta{color:#6b7280;font-size:12.5px}ul{padding-left:20px}@media print{body{margin:0}}
</style></head><body>${out.join("\n")}</body></html>`;
}

/** Download a report as Markdown or as a printable HTML page. */
export function saveReport(name, lines, format = "html") {
  const md = lines.join("\n");
  if (format === "md") download(`${name}.md`, md, "text/markdown;charset=utf-8");
  else download(`${name}.html`, markdownToHtml(md, name), "text/html;charset=utf-8");
}

/** A CSV field: quoted when it holds a comma, a quote or a line break (component names may). */
export const csvCell = (v) => {
  const text = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : String(v ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The try-outs saved in step 4 (단계별), as a report section. */
export function triesLines(method) {
  const tries = (state.guide.tries || []).filter((t) => t.method === method);
  if (!tries.length) return [];
  const line = (cells) => `| ${cells.join(" | ")} |`;
  const tg = state.project.components.filter((c) => c.role === "remove");
  const pc = (x) => (typeof x === "number" ? `${fmt(x * 100, 1)} %` : "–");
  return method === "column"
    ? ["", "## 4단계에서 저장한 결과 (직접 조절)", "", line(["#", "흡착제", "길이 × 지름 (m)", "흡착제 (kg)", "판정 / 운전 시간", "당 감소율", "ΔP (kPa)"]),
      line(["---", "---", "---", "---", "---", "---", "---"]),
      ...tries.map((t) => line([t.n, t.adsName, `${fmtSmart(t.L)} × ${fmtSmart(t.D)}`, fmt(t.kg, 2), t.runText, pc(t.keep), fmt(t.dP, 2)]))]
    : ["", "## 4단계에서 저장한 결과 (직접 조절)", "", line(["#", "흡착제", "투입량 (g/L)", "처리 부피 (L)", "교반 시간 (min)", ...tg.map((c) => `${c.name} 제거율`), "당 감소율"]),
      line(["---", "---", "---", "---", "---", ...tg.map(() => "---"), "---"]),
      ...tries.map((t) => line([t.n, t.adsName, fmtSmart(t.dose), fmtSmart(t.V), fmtSmart(t.t), ...tg.map((c) => pc(t.removal?.[c.id])), pc(t.keep)]))];
}

export function exportMarkdown(format = "md") {
  const data = currentResult();
  if (!data) return;
  const { summary, flowsheet } = data;
  const spec = state.spec;
  const p = state.project;
  const line = (cells) => `| ${cells.join(" | ")} |`;
  const valueText = (s, v) => (s.toggle ? (v ? "켬" : "끔") : s.auto && Math.abs(v - s.auto.value) < 1e-12 ? s.auto.label : fmtSmart(v, 4));
  const role = { remove: "제거", keep: "보존", any: "무관" };
  const names = Object.fromEntries(p.components.map((c) => [c.id, c.name]));
  const out = [
    `# 흡착 설계 결과 요약 — ${today()}`, "",
    `> Adsorption Studio에서 내보냄 · 모델 버전 ${spec.version} · ${spec.temperature_C} °C`, "",
    ...singleBedLines(line),
    "## 가수분해액과 목표", "",
    line(["성분", "역할", "입구 (g/L)", "목표 제거율", "누적 제거율", "교체 시점 출구 C/C₀"]), line(["---", "---", "---", "---", "---", "---"]),
    ...p.components.map((c) => line([c.name, role[c.role], fmtSmart(p.feed[c.id], 4),
      c.role === "remove" ? `≥ ${c.target} %` : "", `${fmt(summary.removal[c.id] * 100, 1)} %`, fmt(summary.outlet_frac[c.id], 3)])),
    "", `판정: ${summary.judge_avg ? "교체 주기 동안의 누적 평균" : "교체 시점의 출구 농도"} · `
      + (summary.service_on ? `교체 주기 ${fmtSmart(summary.service_h)} h`
        : `교체 주기 미지정 · 운전 가능 시간 ${summary.run_h === null || summary.run_h_beyond ? `> ${fmtSmart(summary.horizon_h ?? summary.service_h)} h (계산 범위 내 파과 없음)` : `${fmt(summary.run_h, 1)} h`}`), "",
    "## 결과 확인", "",
    line(["항목", "값", "기준", "판정"]), line(["---", "---", "---", "---"]),
    ...summary.kpis.map((k) => line([k.label, k.text ?? (k.value === null || k.value === undefined ? "–" : `${fmt(k.value, k.digits ?? 2)} ${k.unit}`),
      k.target || "", { ok: "충족", warn: "주의", bad: "미달", info: "" }[k.status] || ""])),
    "", "## bed", "",
    line(["bed", "흡착제", "등온식", "D × L (m)", "EBCT (min)", "흡착제 (kg)", "ΔP (kPa)", "맡은 성분 · 파과 (h)"]),
    line(["---", "---", "---", "---", "---", "---", "---", "---"]),
    ...flowsheet.units.map((b) => line([b.short, b.ads_name, b.model_name, `${fmt(b.D, 3)} × ${fmt(b.L, 2)}${b.auto ? "" : " (직접)"}`,
      fmt(b.EBCT_min, 1), fmt(b.mass_kg, 2), fmt(b.dP_kPa, 2),
      b.assigned.map((c) => `${names[c]} ${b.t_break_h[c] === null ? "–" : fmt(b.t_break_h[c], 1)}`).join(", ") || "–"])),
    "", flowsheet.mode === "custom"
      ? "공정은 직접 구성한 bed 배열입니다 ('자동' bed는 맡은 목표에 맞춰 크기를 정함)."
      : "공정은 자동 설계(각 bed가 맡은 제거 목표를 교체 주기 동안 지키는 가장 작은 크기 × 부피 여유)입니다.",
    "", `흡착제 합계 ${fmt(summary.adsorbent_kg, 2)} kg · 처리량 ${fmt(summary.treated_m3, 3)} m³/주기 · 처리량당 ${fmt(summary.usage_kg_m3, 2)} kg/m³`,
    "", "## 조건", "",
    line(["구분", "항목", "값", "단위", "기본값"]), line(["---", "---", "---", "---", "---"]),
    ...spec.parameters.map((s) => {
      const v = state.params[s.name];
      const changed = Math.abs(v - s.default) > 1e-12;
      const section = spec.sections.find((x) => x.id === s.section)?.title || "";
      return line([section, changed ? `**${s.label}**` : s.label, changed ? `**${valueText(s, v)}**` : valueText(s, v),
        s.unit, valueText(s, s.default)]);
    }),
    "", "굵은 글씨: 기본값에서 바꾼 조건", "",
    "## 흡착제 시험 데이터", "",
    line(["흡착제", "종류", "시험 수", "입자 (mm)", "충전 밀도 (g/L)", "공극률"]), line(["---", "---", "---", "---", "---", "---"]),
    ...p.adsorbents.map((a) => line([a.name, { carbon: "활성탄", resin: "고분자 수지", other: "기타" }[a.kind], String(a.tests.length),
      fmtSmart(a.d_p_mm), fmtSmart(a.rho_b), fmtSmart(a.eps_b)])),
  ];
  if (summary.warnings?.length) out.push("", "## 확인할 점", "", ...summary.warnings.map((w) => `- ${w}`));
  if (state.ui.mode === "guide") out.push(...triesLines("column"));
  out.push("", "## 모델 가정", "",
    `- ${spec.temperature_C} °C 고정, 액 물성 = 물, 등온 1차원 흐름 (축방향 분산 Chung–Wen)`,
    "- 흡착 속도: 선형구동력(LDF), 속도상수는 회분 시험의 C(t)에 흡착제별 설계 등온식으로 맞춘 값",
    "- 등온식: 회분 시험의 평형점으로 피팅 (혼합액 시험이라 다른 성분과의 경쟁이 겉보기 값에 포함)",
    "- bed는 처음에 물로 차 있고, 누적 제거율은 흡착량 기준 (bed 내부 체류액 제외)",
    "- 압력강하: Ergun 식");
  saveReport(`흡착설계요약_${today()}`, out, format);
}

/** A report made in 단일 bed or 단계별 describes that column (its flow replaces the process flow). */
function singleBedLines(line) {
  if (state.ui.mode !== "bed" && state.ui.mode !== "guide") return [];
  const b = state.single;
  const ads = state.project.adsorbents.find((a) => a.id === b.ads);
  return ["## 단일 bed", "",
    line(["항목", "값"]), line(["---", "---"]),
    line(["흡착제", ads ? ads.name : "–"]),
    line(["유량", `${fmtSmart(b.flow)} L/h`]),
    line(["크기", b.auto ? "목표에 맞춰 자동" : `D ${fmtSmart(b.D)} × L ${fmtSmart(b.L)} m`]),
    "", "아래 조건표의 원료 유량은 공정용이며 이 bed에는 위 유량을 썼습니다.", ""];
}

export function exportProfilesCsv() {
  const data = currentResult();
  if (!data) return;
  const comps = state.project.components;
  const head = ["bed", "t_h", ...comps.map((c) => `${c.name}_g/L`), ...comps.map((c) => `${c.name}_C/C0`)].map(csvCell);
  const rows = data.profiles.flatMap((p) => p.t_h.map((t, i) => [p.short, t,
    ...comps.map((c) => p.outlet[c.id]?.[i]), ...comps.map((c) => p.frac[c.id]?.[i])].map(csvCell).join(",")));
  download(`시간별_출구_${today()}.csv`, "﻿" + [head.join(","), ...rows].join("\n"), "text/csv;charset=utf-8");
}

export function exportParams() {
  download(`조건_${today()}.json`, JSON.stringify(state.params, null, 2), "application/json");
}

export async function importParams(file) {
  try {
    let values;
    try { values = JSON.parse(await file.text()); } catch { throw new Error("JSON 파일이 아닙니다"); }
    if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("조건 파일 형식이 아닙니다");
    if (values.components && values.adsorbents) {
      // a project file picked in the wrong menu item: load it as a project
      await importProjectData(values, file.name);
      return;
    }
    // same rule as the server: out-of-range values are brought into range (and said so), "자동" kept
    const specs = Object.fromEntries(state.spec.parameters.map((p) => [p.name, p]));
    const clean = {}, clamped = [];
    for (const [k, v] of Object.entries(values)) {
      const p = specs[k];
      if (!p || typeof v !== "number" || !Number.isFinite(v)) continue;
      if (p.auto && Math.abs(v - p.auto.value) < 1e-12) { clean[k] = v; continue; }
      const inRange = Math.min(Math.max(v, p.min), p.max);
      if (inRange !== v) clamped.push(`${p.label} ${v} → ${inRange}`);
      clean[k] = p.integer ? Math.round(inRange) : inRange;
    }
    if (!Object.keys(clean).length) throw new Error("알아볼 수 있는 조건이 없습니다");
    setParams({ ...state.defaults, ...clean });
    emit("params-external");
    toast(`조건 ${Object.keys(clean).length}개를 불러왔습니다`
      + (clamped.length ? ` · 범위 밖이라 조정: ${clamped.join(", ")}` : ""), clamped.length ? "warn" : "ok");
  } catch (error) {
    toast(`불러오지 못했습니다: ${error.message}`, "bad");
  }
}

export function exportProject() {
  download(`흡착_프로젝트_${today()}.json`, JSON.stringify(state.project, null, 1), "application/json");
}

async function importProjectData(raw, name) {
  const { project } = await api.saveProject(raw.project || raw);
  replaceProject(project);
  toast(`'${name}' 프로젝트(성분·흡착제·시험 데이터)를 불러왔습니다`, "ok");
}

export async function importProject(file) {
  try {
    let raw;
    try { raw = JSON.parse(await file.text()); } catch { throw new Error("JSON 파일이 아닙니다"); }
    await importProjectData(raw, file.name);
  } catch (error) {
    toast(`불러오지 못했습니다: ${error.message}`, "bad");
  }
}

export async function resetProject() {
  if (!confirm("성분·입구 조성·흡착제·시험 데이터를 예시 프로젝트로 바꿀까요? (저장한 프리셋은 남습니다. 필요하면 먼저 '프로젝트 저장')")) return;
  try {
    replaceProject((await api.resetProject()).project);
    toast("예시 프로젝트로 되돌렸습니다", "ok");
  } catch (error) {
    toast(error.message, "bad");
  }
}
