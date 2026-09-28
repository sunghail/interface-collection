import { validateSampleSelection } from './point-selection.js';
import { validateEditVariant } from './edit-settings.js';
import { parseRat } from './rat.js';
import { validateAxes } from './data.js';
export const defaultAxes = () => ({ x: { scale: 'linear', min: null, max: null, step: null }, y: { scale: 'linear', min: null, max: null, step: null } });
export async function digest(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function createEntry(name, text) {
  const hash = await digest(text);
  return { id: crypto.randomUUID(), name, alias: name.replace(/\.rat$/i, ''), text, hash, visible: true, pointId: 'p1', measurement: parseRat(text, { name, hash }) };
}
export function saveWorkspace(entries, view) {
  return JSON.stringify({ version: 1, entries: entries.map(({ measurement, ...e }) => e), view }, null, 2);
}
export async function restoreWorkspace(text) {
  const value = JSON.parse(text);
  if (value.version !== 1) throw new Error('지원하지 않는 작업 파일 버전입니다.');
  if (!Array.isArray(value.entries) || !value.view || !['isotherm', 'kinetic'].includes(value.view.mode) || !['Torr', 'kPa', 'Pa'].includes(value.view.unit)) throw new Error('작업 파일 구조가 올바르지 않습니다.');
  validateAxes(value.view.axes);
  value.view.branch ??= 'all';
  if (!['all','adsorption','desorption','unknown'].includes(value.view.branch)) throw new Error('작업 파일의 구간 분류가 올바르지 않습니다.');
  const ids = new Set(); const entries = [];
  for (const e of value.entries) {
    if (!e || typeof e.id !== 'string' || ids.has(e.id) || typeof e.text !== 'string' || typeof e.name !== 'string' || typeof e.alias !== 'string' || typeof e.visible !== 'boolean') throw new Error('작업 파일의 측정 정보가 올바르지 않습니다.');
    ids.add(e.id);
    if (await digest(e.text) !== e.hash) throw new Error(`${e.name}: 저장된 데이터의 해시가 일치하지 않습니다.`);
    const measurement = parseRat(e.text, { name: e.name, hash: e.hash });
    if (!measurement.points.some(p => p.id === e.pointId)) throw new Error('선택 구간을 찾을 수 없습니다.');
    validateSampleSelection(e,measurement);
    validateEditVariant(e.editVariant,measurement);
    if(e.editVariant && e.pointId!==e.editVariant.pointId)throw new Error('편집본의 구간을 변경할 수 없습니다.');
    entries.push({ ...e, measurement });
  }
  if (entries.length && !ids.has(value.view.activeId)) throw new Error('활성 파일을 찾을 수 없습니다.');
  return { entries, view: value.view };
}
