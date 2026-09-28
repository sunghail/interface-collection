import { defaultAxes, restoreWorkspace } from './workspace.js';
import { validateAxes } from './data.js';

// A preset groups saved comparison screens. Sources live separately, once per hash.
export const emptyPresetLibrary = () => ({ version: 1, revision: 0, selectedPresetId: null, presets: [] });
const clone = value => structuredClone(value);
const fail = message => { throw new Error(message); };
const validName = name => typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 100;
const id = () => crypto.randomUUID();
const date = () => new Date().toISOString();

function checkName(name, siblings, exceptId) {
  if (!validName(name)) fail('이름을 1–100자로 입력하세요.');
  name = name.trim();
  if (siblings.some(item => item.id !== exceptId && item.name === name)) fail('같은 이름이 있습니다. 다른 이름을 입력하세요.');
  return name;
}
export function uniqueName(name, siblings) {
  name = name.trim().slice(0, 90);
  let result = name, number = 2;
  while (siblings.some(item => item.name === result)) result = `${name} (${number++})`;
  return result;
}
export function findPreset(library, presetId) {
  return library.presets.find(p => p.id === presetId) ?? fail('프리셋을 찾을 수 없습니다.');
}
export function findCoordinate(library, presetId, coordinateId) {
  return findPreset(library, presetId).coordinates.find(c => c.id === coordinateId) ?? fail('저장한 좌표를 찾을 수 없습니다.');
}
export function addPreset(library, name) {
  const next = clone(library), preset = { id: id(), name: checkName(name, next.presets), createdAt: date(), coordinates: [] };
  next.presets.push(preset); next.selectedPresetId = preset.id;
  return next;
}
export function renamePreset(library, presetId, name) {
  const next = clone(library);
  findPreset(next, presetId).name = checkName(name, next.presets, presetId);
  return next;
}
export function deletePreset(library, presetId) {
  const next = clone(library); findPreset(next, presetId);
  next.presets = next.presets.filter(p => p.id !== presetId);
  if (next.selectedPresetId === presetId) next.selectedPresetId = next.presets[0]?.id ?? null;
  return next;
}
export function appendCoordinate(library, presetId, coordinate) {
  const next = clone(library), preset = findPreset(next, presetId), saved = clone(coordinate);
  saved.id = id(); saved.name = uniqueName(saved.name, preset.coordinates);
  preset.coordinates.push(saved); next.selectedPresetId = presetId;
  return next;
}
export function renameCoordinate(library, presetId, coordinateId, name) {
  const next = clone(library), preset = findPreset(next, presetId);
  findCoordinate(next, presetId, coordinateId).name = checkName(name, preset.coordinates, coordinateId);
  return next;
}
export function deleteCoordinate(library, presetId, coordinateId) {
  const next = clone(library), preset = findPreset(next, presetId);
  findCoordinate(next, presetId, coordinateId);
  preset.coordinates = preset.coordinates.filter(c => c.id !== coordinateId);
  return next;
}

export function screenState(entries, view, ui = {}) {
  return clone({
    workspace: { version: 1, entries: entries.map(({ measurement, text, ...entry }) => entry), view },
    ui: { sampleId: ui.sampleId ?? null, expanded: !!ui.expanded, displayOpen: !!ui.displayOpen, conditionsOpen: ui.conditionsOpen !== false },
  });
}
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
  return value;
}
export const screenFingerprint = state => JSON.stringify(sorted({ workspace: state.workspace, ui: state.ui }));

export function captureCoordinate(entries, view, ui = {}) {
  if (!entries.length) fail('저장할 측정 파일을 먼저 여세요.');
  const state = screenState(entries, view, ui), visible = entries.filter(e => e.visible);
  const mode = view.mode === 'kinetic' ? 'Kinetic' : '등온선';
  const temperatures = [...new Set(visible.map(e => e.measurement.metadata.temperature_K))].filter(Number.isFinite);
  const rows = visible.map(e => {
    const point = e.measurement.points.find(p => p.id === e.pointId);
    return {
      entryId: e.id, name: e.alias, filename: e.name, pointId: e.pointId,
      temperature_K: e.measurement.metadata.temperature_K, gas: e.measurement.metadata.gas,
      pressure_kPa: point?.equilibrium.pressure ?? null,
      excluded: view.mode === 'kinetic' ? (e.excludedSamples?.[e.pointId]?.length ?? 0) : 0,
    };
  });
  const sources = [...new Map(entries.map(e => [e.hash, { hash: e.hash, text: e.text }])).values()];
  return {
    coordinate: {
      id: id(), name: `${mode} · ${visible.length}곡선`, createdAt: date(), ...state,
      summary: { mode, temperatures, rows, excluded: rows.reduce((n, r) => n + r.excluded, 0) },
    }, sources,
  };
}

export async function openCoordinate(coordinate, sources) {
  const byHash = new Map(sources.map(source => [source.hash, source.text]));
  const workspace = clone(coordinate.workspace);
  workspace.entries = workspace.entries.map(entry => {
    const text = byHash.get(entry.hash);
    if (typeof text !== 'string') fail(`${entry.name}: 저장한 원본을 찾을 수 없습니다.`);
    return { ...entry, text };
  });
  // The workspace reader verifies source hashes, step IDs and excluded sample IDs.
  const restored = await restoreWorkspace(JSON.stringify(workspace));
  const ui = clone(coordinate.ui);
  if (ui.sampleId !== null) {
    const active = restored.entries.find(e => e.id === restored.view.activeId);
    if (!active?.measurement.points.find(p => p.id === active.pointId)?.samples.some(s => s.id === ui.sampleId)) fail('저장한 선택 샘플을 찾을 수 없습니다.');
  }
  return { ...restored, ui };
}

export function validatePresetLibrary(value) {
  if (!value || value.version !== 1) fail('지원하지 않는 프리셋 저장 버전입니다.');
  if (!Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.presets)) fail('프리셋 목록 구조가 올바르지 않습니다.');
  const ids = new Set();
  const checkId = item => {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || !validName(item.name)) fail('프리셋 또는 좌표의 이름·ID가 올바르지 않습니다.');
    ids.add(item.id);
  };
  for (const preset of value.presets) {
    checkId(preset);
    if (!Array.isArray(preset.coordinates)) fail('저장한 좌표 목록이 올바르지 않습니다.');
    for (const coordinate of preset.coordinates) {
      checkId(coordinate);
      const { workspace, ui } = coordinate;
      if (!workspace || workspace.version !== 1 || !Array.isArray(workspace.entries) || !workspace.entries.length) fail('좌표의 측정 목록이 올바르지 않습니다.');
      const entryIds = new Set();
      for (const e of workspace.entries) {
        if (!e || typeof e.id !== 'string' || !e.id || entryIds.has(e.id) || typeof e.name !== 'string' || typeof e.alias !== 'string' || typeof e.visible !== 'boolean' || typeof e.pointId !== 'string' || !/^[a-f0-9]{64}$/.test(e.hash) || 'text' in e || 'measurement' in e) fail('좌표의 원본 참조가 올바르지 않습니다.');
        entryIds.add(e.id);
      }
      const view = workspace.view;
      if (!view || !entryIds.has(view.activeId) || !['isotherm', 'kinetic'].includes(view.mode) || !['kPa', 'Pa', 'Torr'].includes(view.unit) || !['all', 'adsorption', 'desorption', 'unknown'].includes(view.branch)) fail('좌표의 표시 상태가 올바르지 않습니다.');
      validateAxes(view.axes ?? defaultAxes());
      if (!view.axes || !ui || !(ui.sampleId === null || typeof ui.sampleId === 'string') || ['expanded', 'displayOpen', 'conditionsOpen'].some(key => typeof ui[key] !== 'boolean')) fail('좌표의 화면 상태가 올바르지 않습니다.');
    }
  }
  if (value.selectedPresetId !== null && !value.presets.some(p => p.id === value.selectedPresetId)) fail('선택한 프리셋이 없습니다.');
  return value;
}
