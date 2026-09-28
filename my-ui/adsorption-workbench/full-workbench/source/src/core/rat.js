export class RatError extends Error {
  constructor(message, line = null) { super(message); this.name = 'RatError'; this.line = line; }
}

// CSV records keep their physical line numbers for diagnostics.
export function csvRecords(text) {
  const records = []; let row = [], field = '', quoted = false, line = 1, start = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(field.trim()); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      row.push(field.trim()); records.push({ values: row, line: start }); row = []; field = '';
      if (c === '\r' && text[i + 1] === '\n') i++;
      line++; start = line;
    } else { field += c; if (c === '\n') line++; }
  }
  if (quoted) throw new RatError('닫히지 않은 CSV 따옴표입니다.', start);
  if (field.length || row.length) { row.push(field.trim()); records.push({ values: row, line: start }); }
  return records;
}

function numeric(values, line) {
  return values.map(v => {
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(v) || !Number.isFinite(Number(v)))
      throw new RatError(`숫자로 읽을 수 없는 값: ${v || '(빈 값)'}`, line);
    return Number(v);
  });
}

export function parseRat(text, source = {}) {
  const rows = csvRecords(text.replace(/^\uFEFF/, ''));
  const sizes = [8, 3, 12, 3, 1];
  for (let i = 0; i < sizes.length; i++) {
    if (!rows[i] || rows[i].values.length !== sizes[i])
      throw new RatError('지원하는 BELSORP HP RAT 헤더 형식이 아닙니다.', rows[i]?.line ?? i + 1);
  }
  const h = rows.map(r => r.values);
  if (!/^HP-/i.test(h[1][0])) throw new RatError('현재 HP 계열 RAT만 지원합니다.', rows[1].line);
  const n = numeric(h[2].filter((_, i) => i !== 4), rows[2].line);
  const k = numeric(h[4], rows[4].line)[0];
  const metadata = { date: h[0][1], time: h[0][2], comments: h[0].slice(3, 7), serial: h[1][0], version: h[1][1],
    mass_g: n[0], manifold_cm3: n[1], freeSpace_cm3: n[2], eqt_raw: n[3], gas: h[2][4], chamber_C: n[4], temperature_K: n[5], p0_Torr: n[6], crossSection_nm2: n[7], k };
  const diagnostics = []; const points = []; let samples = [], waiting = false, start = null;
  for (const r of rows.slice(5)) {
    const v = r.values;
    if (v.length === 1 && v[0] === '') continue;
    const marker = v.length === 2 && v.every(x => Number(x) === -999);
    if (waiting) {
      if (marker || v.length !== 2) throw new RatError('종료 표식 다음에 평형값 2개가 필요합니다.', r.line);
      const [pressure, uptake] = numeric(v, r.line);
      const id = `p${points.length + 1}`;
      points.push({ id, index: points.length + 1, samples, equilibrium: { pressure, uptake }, sourceLines: [start, r.line] });
      if (!samples.length) diagnostics.push({ code: 'NO_KINETICS', level: 'info', pointId: id, line: r.line, message: '평형값만 있고 시간 데이터가 없습니다.' });
      samples = []; waiting = false; start = null;
    } else if (marker) { waiting = true; start ??= r.line; }
    else {
      if (v.length !== 7) throw new RatError('시간별 측정행에는 7개 숫자가 필요합니다.', r.line);
      const values = numeric(v, r.line);
      if (samples.length && values[0] <= samples.at(-1).values[0])
        diagnostics.push({ code: 'TIME_ORDER', level: 'warning', line: r.line, message: '시간 중복 또는 역행이 있습니다. 원본 순서를 유지합니다.' });
      start ??= r.line;
      samples.push({ id: `s${samples.length + 1}`, line: r.line, values });
    }
  }
  if (waiting || samples.length) throw new RatError('파일이 미완성입니다. 구간 종료 표식 또는 평형행이 없습니다.', rows.at(-1)?.line);
  if (!points.length) throw new RatError('평형점이 없습니다.');
  return { format: 'belsorp_hp_rat', source, metadata, rawHeaders: h.slice(0, 5), points, diagnostics };
}
