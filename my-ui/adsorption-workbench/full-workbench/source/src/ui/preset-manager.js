import { PresetStore, emptyPresetLibrary, findCoordinate, addPreset, renamePreset, deletePreset, appendCoordinate, renameCoordinate, deleteCoordinate, captureCoordinate, openCoordinate, screenState, screenFingerprint } from '../services/presets.js';

const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const format = value => Number.isFinite(value) ? Number(value.toPrecision(6)).toString() : '미확인';

export function mountPresetManager({ getCurrent, applyCurrent, onMessage, onNavigate }) {
  const $ = id => document.getElementById(id), dialog = $('preset-dialog'), store = new PresetStore();
  const storageLabel = document.documentElement.dataset.runtime === 'desktop' ? '이 앱에 저장' : '이 브라우저에 저장';
  let library = emptyPresetLibrary(), selectedCoordinateId = null, ready = false, busy = false;
  let editing = null, pendingCapture = false, undo = null, loaded = null, feedbackTimer = null;
  const selected = () => library.presets.find(p => p.id === library.selectedPresetId);
  const coordinate = () => selected()?.coordinates.find(c => c.id === selectedCoordinateId);
  const currentState = () => { const { entries, view, ui } = getCurrent(); return screenState(entries, view, ui); };
  const report = (text, error = false) => {
    $('preset-manager-status').textContent = text;
    $('preset-manager-status').classList.toggle('preset-error', error);
    onMessage(text, error);
  };
  function updateCurrent() {
    const current = getCurrent();
    $('preset-capture').disabled = busy || !ready || !current.entries.length;
    $('preset-capture').title = current.entries.length ? '현재 화면을 선택한 프리셋에 새 좌표로 저장' : '먼저 RAT 파일을 여세요.';
    const dirty = !!loaded && screenFingerprint(currentState()) !== loaded.fingerprint;
    $('preset-dirty').hidden = !dirty;
    $('preset-current').textContent = loaded ? `${loaded.name}${dirty ? ' · 변경 있음' : ''}` : storageLabel;
    $('preset-current').title = $('preset-current').textContent;
  }
  function renderHeader() {
    $('preset-open').textContent = selected()?.name ?? '프리셋 선택';
    $('preset-open').title = selected()?.name ?? '프리셋 추가·선택·관리';
    updateCurrent();
  }
  function button(text, action, { label, className = 'quiet' } = {}) {
    const b = element('button', text, className); b.type = 'button'; b.disabled = busy || !ready;
    if (label) b.setAttribute('aria-label', label);
    b.onclick = action; return b;
  }
  function summary(c) {
    const temperatures = c.summary?.temperatures ?? [];
    return `${c.workspace.view.mode === 'kinetic' ? 'Kinetics' : '등온선'}${temperatures.length ? ' · ' + temperatures.map(format).join(' / ') + ' K' : ''}`;
  }
  function details(c) {
    const entries = c.workspace.entries.filter(e => e.visible), axes = c.workspace.view.axes;
    const excluded = c.workspace.view.mode === 'kinetic' ? entries.reduce((n, e) => n + (e.excludedSamples?.[e.pointId]?.length ?? 0), 0) : 0;
    const range = c.workspace.view.mode === 'kinetic' ? ` · ${axes.x.min ?? '자동'}–${axes.x.max ?? '자동'} s` : '';
    return `${entries.length}곡선 · ${excluded ? `총 ${excluded}점 제외` : '제외점 없음'}${range}`;
  }
  function cancelEdit() {
    editing = null; pendingCapture = false; $('preset-form').hidden = true; $('preset-form-error').textContent = '';
  }
  function render() {
    renderHeader();
    $('preset-create').disabled = busy || !ready;
    $('preset-form-save').disabled = busy; $('preset-name').disabled = busy; $('preset-form-cancel').disabled = busy;
    $('preset-undo').hidden = !undo; $('preset-undo').disabled = busy || !ready;
    dialog.setAttribute('aria-busy', String(busy));
    $('preset-list').replaceChildren(...library.presets.map(p => {
      const b = button('', () => run(async () => {
        cancelEdit(); const next = structuredClone(library); next.selectedPresetId = p.id;
        library = await store.save(next); undo = null; selectedCoordinateId = p.coordinates[0]?.id ?? null;
        report(`저장 대상: ${p.name}`);
      }), { className: 'preset-list-item', label: `${p.name}, 좌표 ${p.coordinates.length}개` });
      b.append(element('span', p.name), element('small', `좌표 ${p.coordinates.length}개`));
      b.setAttribute('aria-pressed', String(p.id === library.selectedPresetId)); return b;
    }));
    if (!library.presets.length) $('preset-list').append(element('p', ready ? '프리셋을 추가하세요.' : '저장 목록 확인 중', 'preset-empty'));
    const pane = $('preset-coordinates'); pane.replaceChildren();
    const p = selected();
    if (!p) { pane.append(element('p', '프리셋을 만들거나 선택하세요.', 'preset-empty')); return; }
    pane.append(element('h3', p.name));
    const tools = element('div', undefined, 'preset-item-tools');
    tools.append(button('이름 변경', () => editName('preset', p.id)), button('프리셋 삭제', () => removeItem('preset', p.id)));
    pane.append(tools);
    for (const c of p.coordinates) {
      const row = element('div', undefined, 'preset-coordinate'); row.dataset.coordinateId = c.id;
      row.classList.toggle('selected', c.id === selectedCoordinateId);
      const line = element('div', undefined, 'preset-coordinate-line');
      const choose = button(c.name, () => { if (busy) return; cancelEdit(); selectedCoordinateId = c.id; render(); }, { className: 'preset-coordinate-name quiet' });
      choose.setAttribute('aria-pressed', String(c.id === selectedCoordinateId));
      const actions = element('div', undefined, 'preset-coordinate-actions');
      actions.append(button('이름', () => editName('coordinate', c.id), { label: `${c.name} 이름 변경` }), button('삭제', () => removeItem('coordinate', c.id), { label: `${c.name} 좌표 삭제` }));
      line.append(choose, actions); row.append(line, element('p', summary(c), 'preset-coordinate-summary'));
      pane.append(row);
    }
    if (!p.coordinates.length) pane.append(element('p', '상단 ＋로 현재 비교 화면을 추가하세요.', 'preset-empty'));
    const c = coordinate();
    if (c) {
      const preview = element('div', undefined, 'preset-coordinate-preview');
      preview.append(element('span', details(c)), button('이 좌표 열기', () => restore(c), { className: '' })); pane.append(preview);
      const conditions = element('details', undefined, 'preset-saved-conditions');
      conditions.append(element('summary', '저장 조건 보기'));
      for (const row of c.summary?.rows ?? []) {
        conditions.append(element('p', `${row.name} / ${row.pointId} · ${format(row.temperature_K)} K · ${row.gas ?? '기체 미확인'}${c.workspace.view.mode === 'kinetic' ? ` · Pₑ ${format(row.pressure_kPa)} kPa · ${row.excluded}점 제외` : ''}`));
      }
      pane.append(conditions);
    }
  }
  async function run(action) {
    if (busy) return;
    busy = true; render();
    try { await action(); }
    catch (error) {
      if (error.code === 'PRESET_CONFLICT') {
        cancelEdit(); undo = null;
        try { library = await store.load(); selectedCoordinateId = selected()?.coordinates[0]?.id ?? null; } catch { ready = false; }
      }
      if (editing) $('preset-form-error').textContent = error.message;
      report(error.message, true);
    } finally { busy = false; render(); }
  }
  async function refresh() {
    await run(async () => {
      const next = await store.load();
      if (next.revision !== library.revision) undo = null;
      library = next; ready = true;
      if (!coordinate()) selectedCoordinateId = selected()?.coordinates[0]?.id ?? null;
      $('preset-manager-status').textContent = `${storageLabel} · 원본은 공통 보관`;
      $('preset-manager-status').classList.remove('preset-error');
    });
  }
  function show() {
    onNavigate?.('presets');
    if (!dialog.open) dialog.show();
    $('preset-open').setAttribute('aria-expanded', 'true');
  }
  function close() {
    if (busy) return;
    cancelEdit(); dialog.close();onNavigate?.('analysis');
  }
  function editName(kind, itemId = null) {
    if (busy || !ready) return;
    cancelEdit(); show();
    editing = { kind, id: itemId, presetId: library.selectedPresetId };
    const item = kind === 'preset' ? selected() : kind === 'coordinate' ? findCoordinate(library, library.selectedPresetId, itemId) : null;
    $('preset-form-label').textContent = kind === 'new' ? '새 프리셋 이름' : kind === 'preset' ? '프리셋 이름' : '좌표 이름';
    $('preset-name').value = item?.name ?? ''; $('preset-form').hidden = false;
    $('preset-name').focus(); $('preset-name').select();
  }
  async function saveCurrent() {
    const current = getCurrent();
    const { coordinate: c, sources } = captureCoordinate(current.entries, current.view, current.ui);
    const next = appendCoordinate(library, library.selectedPresetId, c);
    library = await store.save(next, sources); undo = null;
    const saved = selected().coordinates.at(-1); selectedCoordinateId = saved.id;
    loaded = { id: saved.id, presetId: selected().id, name: saved.name, fingerprint: screenFingerprint(saved) };
    $('preset-capture').textContent = '✓'; clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => { $('preset-capture').textContent = '＋'; }, 1500);
    report(`「${selected().name}」에 「${saved.name}」 좌표를 저장했습니다.`);
  }
  function capture() {
    if (busy || !ready || !getCurrent().entries.length) return;
    if (!selected()) { editName('new'); pendingCapture = true; return; }
    cancelEdit(); return run(saveCurrent);
  }
  function removeItem(kind, itemId) {
    const presetId = library.selectedPresetId;
    return run(async () => {
      cancelEdit(); const before = structuredClone(library), count = selected().coordinates.length;
      const next = kind === 'preset' ? deletePreset(library, itemId) : deleteCoordinate(library, presetId, itemId);
      library = await store.save(next); undo = { library: before, revision: library.revision };
      selectedCoordinateId = selected()?.coordinates[0]?.id ?? null;
      if (kind === 'preset' ? loaded?.presetId === itemId : loaded?.id === itemId) loaded = null;
      report(kind === 'preset' ? `프리셋과 좌표 ${count}개를 삭제했습니다. 원본과 현재 화면은 유지됩니다.` : '좌표를 삭제했습니다. 원본과 현재 화면은 유지됩니다.');
    });
  }
  function restore(c) {
    const presetId = library.selectedPresetId;
    return run(async () => {
      const sources = await store.readSources(c.workspace.entries.map(e => e.hash));
      const restored = await openCoordinate(c, sources);
      applyCurrent(restored);
      loaded = { id: c.id, presetId, name: c.name, fingerprint: screenFingerprint(c) };
      cancelEdit(); dialog.close();onNavigate?.('analysis');
      report(`「${c.name}」 좌표를 열었습니다. 구간·제외점·화면 범위를 복원했습니다.`);
    });
  }
  $('preset-open').onclick = async () => {
    cancelEdit(); show(); await refresh();
  };
  $('preset-close').onclick = close;
  dialog.addEventListener('close', () => { $('preset-open').setAttribute('aria-expanded', 'false'); $('preset-open').focus(); });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault(); event.stopPropagation();
    if (!busy) editing ? cancelEdit() : close();
  });
  $('preset-capture').onclick = capture;
  $('preset-create').onclick = () => editName('new');
  $('preset-form-cancel').onclick = cancelEdit;
  $('preset-form').onsubmit = event => {
    event.preventDefault(); if (!editing || busy) return;
    const request = { ...editing }, name = $('preset-name').value, captureAfter = pendingCapture;
    run(async () => {
      const next = request.kind === 'new' ? addPreset(library, name) : request.kind === 'preset' ? renamePreset(library, request.id, name) : renameCoordinate(library, request.presetId, request.id, name);
      library = await store.save(next); undo = null;
      if (request.kind === 'new') selectedCoordinateId = null;
      if (request.kind === 'coordinate' && loaded?.id === request.id) loaded.name = name.trim();
      cancelEdit(); report(request.kind === 'new' ? '프리셋을 추가했습니다.' : '이름을 저장했습니다.');
      if (captureAfter) await saveCurrent();
    });
  };
  $('preset-undo').onclick = () => run(async () => {
    if (!undo || undo.revision !== library.revision) throw new Error('다른 변경 이후에는 이 삭제를 취소할 수 없습니다.');
    const next = structuredClone(undo.library); next.revision = library.revision;
    library = await store.save(next); undo = null; selectedCoordinateId = selected()?.coordinates[0]?.id ?? null;
    report('삭제를 취소했습니다.');
  });
  render(); refresh();
  return { updateCurrent, open:async()=>{cancelEdit();show();await refresh();} };
}
