// Downloads for the report: a Markdown summary, the z profiles as CSV, and the conditions as JSON.

import { download, fmt, fmtSmart, today, toast } from "./util.js";
import { state, setParams, emit, isFresh } from "./store.js";

/** The results on screen, only if they belong to the conditions on screen (else a report would mix them). */
function currentResult() {
  const steady = state.results.steady;
  if (steady?.error) { toast("지금 조건으로는 계산 결과가 없습니다 (오류). 조건을 고친 뒤 내보내세요", "warn"); return null; }
  if (!steady?.data) { toast("먼저 계산이 끝나야 합니다", "warn"); return null; }
  if (!isFresh(steady)) { toast("조건이 바뀌었습니다. 계산을 마친 뒤 내보내세요", "warn"); return null; }
  return steady.data;
}

export function exportMarkdown() {
  const data = currentResult();
  if (!data) return;
  const { summary, flowsheet } = data;
  const spec = state.spec;
  const line = (cells) => `| ${cells.join(" | ")} |`;
  const valueText = (p, v) => (p.auto && Math.abs(v - p.auto.value) < 1e-12 ? p.auto.label : fmtSmart(v, 4));
  const out = [
    `# 설계 결과 요약 — ${today()}`, "",
    `> Reactor Studio에서 내보냄 · 모델 버전 ${spec.version}`, "",
    ...singleBedLines(line),
    "## 조건", "",
    line(["구분", "항목", "값", "단위", "기본값"]), line(["---", "---", "---", "---", "---"]),
    ...spec.parameters.map((p) => {
      const v = state.params[p.name];
      const changed = Math.abs(v - p.default) > 1e-12;
      const section = spec.sections.find((s) => s.id === p.section)?.title || "";
      return line([section, changed ? `**${p.label}**` : p.label, changed ? `**${valueText(p, v)}**` : valueText(p, v),
        p.unit, valueText(p, p.default)]);
    }),
    "", "굵은 글씨: 기본값에서 바꾼 조건", "",
    "## 결과 확인", "",
    line(["항목", "값", "기준", "판정"]), line(["---", "---", "---", "---"]),
    ...allKpis().map((k) => line([k.label, k.value === null || k.value === undefined ? "–" : `${fmt(k.value, k.digits ?? 2)} ${k.unit}`,
      k.target || "", { ok: "충족", warn: "주의", bad: "미달", info: "" }[k.status] || ""])),
    "", "## 반응기", "",
    line(["반응기", "D × L (m)", "τ (min)", "촉매 (kg)", "ΔP (kPa)", "결과"]),
    line(["---", "---", "---", "---", "---", "---"]),
    ...flowsheet.units.map((b) => line([b.short + (b.separator ? " → 분리기" : ""), `${fmt(b.D, 2)} × ${fmt(b.L, 2)}`,
      fmt(b.tau_min, 1), fmt(b.catalyst_kg, 0), fmt(b.dP_kPa, 1), b.kind === "acid"
        ? `산가 ${fmt(b.av_in, 2)} → ${fmt(b.av_out, 2)}` : `전환율 ${fmt(b.conversion, 2)} %`])),
    "", flowsheet.mode === "custom"
      ? "공정은 직접 구성한 bed 배열이며, 위 크기에서의 성능을 계산했습니다 (bed별 온도·메탄올 몰비는 공정 구성 표 기준)."
      : "공정은 자동 설계(목표 산가·전환율을 맞추는 bed 개수와 크기)입니다.",
    "", `FAME ${fmt(summary.fame_kg_h, 1)} kg/h, 글리세롤 ${fmt(summary.glycerol_kg_h, 1)} kg/h`,
  ];
  if (summary.warnings?.length) out.push("", "## 확인할 점", "", ...summary.warnings.map((w) => `- ${w}`));
  out.push("", "## 모델 가정", "",
    "- 등온·정상상태 1차원 흐름, 오일과 메탄올은 하나의 액상으로 봄",
    "- 산촉매 속도식: Berrios 2007 (균일계 H₂SO₄ 값을 수지 bed에 대용)",
    "- CaO 속도식: 유사 1차, 분말로 측정한 속도상수를 펠렛 bed에 적용 (유효인자 참고)",
    "- 분리기는 물·메탄올을 100 % 제거한다고 가정",
    state.ui.soap ? "- 비누화 속도상수와 반응 가능한 CaO 비율은 문헌 간접 근거에 의한 추정값" : "- 비누화(촉매 소모)는 이 결과에 포함되지 않음");
  download(`설계요약_${today()}.md`, out.join("\n"), "text/markdown;charset=utf-8");
}

/** A report made in 단일 bed describes that test (its inlet replaces the process feed below). */
function singleBedLines(line) {
  if (state.ui.mode !== "bed") return [];
  const b = state.single;
  const acid = b.kind === "acid";
  return ["## 단일 bed 시험", "",
    line(["항목", "값"]), line(["---", "---"]),
    line(["bed", acid ? "산촉매 bed (수지)" : "CaO bed"]),
    line(["입구 유량", `${fmtSmart(b.oil)} kg/h`]), line(["입구 FFA", `${fmtSmart(b.ffa)} wt%`]),
    line(["온도", `${fmtSmart(b.T)} °C`]),
    line([acid ? "메탄올 : FFA" : "메탄올 : TG", `${fmtSmart(acid ? b.meoh_acid : b.meoh_cao)} : 1`]),
    line(["크기", b.auto ? "목표에 맞춰 자동" : `D ${fmtSmart(b.D)} × L ${fmtSmart(b.L)} m`]),
    "", "아래 조건표의 원료·운전 값은 공정용이며 이 시험에는 쓰이지 않았습니다.", ""];
}

function allKpis() {
  const { summary, profiles } = state.results.steady.data;
  const cao = profiles.find((p) => p.kind === "cao");
  const base = [...summary.kpis, ...(cao ? cao.kpis.filter((k) => k.key === "eta" || k.key === "mears") : [])];
  const deact = state.results.deact;
  return state.ui.soap && isFresh(deact) ? [...base, ...deact.data.kpis] : base;
}

export function exportProfilesCsv() {
  const data = currentResult();
  if (!data) return;
  const species = ["TG", "FFA", "MeOH", "FAME", "H2O", "GL"];
  const head = ["반응기", "z_m", "tau_min", ...species.map((s) => `${s}_wt%_액체`), "FFA_wt%_오일", "H2O_wt%_오일",
    "산가", "TG_전환율_%", "FFA_전환율_%", "MeOH_전환율_%"];
  const cell = (v) => (typeof v === "number" && Number.isFinite(v) ? String(v) : "");
  const rows = data.profiles.flatMap((p) => p.z.map((z, i) => [p.short, z, p.tau_min[i],
    ...species.map((s) => p.mass_fraction[s][i]), p.oil_basis.FFA[i], p.oil_basis.H2O[i],
    p.acid_value ? p.acid_value[i] : "", p.conversion.TG?.[i], p.conversion.FFA?.[i], p.conversion.MeOH?.[i]]
    .map((v, k) => (k === 0 ? v : cell(v))).join(",")));
  download(`위치별_프로필_${today()}.csv`, "﻿" + [head.join(","), ...rows].join("\n"), "text/csv;charset=utf-8");
}

export function exportParams() {
  download(`조건_${today()}.json`, JSON.stringify(state.params, null, 2), "application/json");
}

export async function importParams(file) {
  try {
    let values;
    try { values = JSON.parse(await file.text()); } catch { throw new Error("JSON 파일이 아닙니다"); }
    if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("조건 파일 형식이 아닙니다");
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
