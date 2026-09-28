import {preferenceStorage} from '../storage/vault-store.js';
import { pointsFor, pressureFactor, expectedPressure } from '../services/measurements.js';
import { dataNumberLabel } from '../core/entry-labels.js';
import { colors } from './plot.js';
import { mountFittingSets } from './fitting-sets.js';
import { mountComparisonSets } from './comparison-sets.js';
import {graphAppearance,applyGraphAppearance,saveGraphAppearance} from './graph-appearance.js';
const pageNames = {data:'데이터 관리', analysis:'측정 분석', comparison:'비교분석', fitting:'Fitting', presets:'프리셋', edits:'편집본 관리', settings:'설정'};
const paths = {data:'M3 7h7l2-3h9v16H3Z',analysis:'M4 3v17h17M7 15l4-5 4 2 5-7',presets:'M6 3h12v18l-6-4-6 4Z',edits:'M14 3H5v18h14v-9M12 13l8-8-3-3-8 8-1 4Z',settings:'M4 7h16M4 17h16M8 4v6M16 14v6'};
paths.fitting='M4 3v17h17M7 16c3 0 3-9 6-9s3 6 7 6';
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;

export function readPreferences() {
  try { const p=JSON.parse(preferenceStorage.getItem('adsorption.preferences')||'{}');return {unit:['kPa','Pa','Torr'].includes(p.unit)?p.unit:'kPa',font:p.font==='large'?'large':'normal',plot:p.plot==='large'?'large':'normal'}; }
  catch { return {unit:'kPa',font:'normal',plot:'normal'}; }
}

export function mountWorkspaceShell({getCurrent,onPick,onPage}) {
  const $=id=>document.getElementById(id), main=document.querySelector('main'), sidebar=document.querySelector('.sidebar');
  const library=document.querySelector('.library'), conditions=document.querySelector('.conditions');
  const nav=document.createElement('nav');nav.className='workspace-nav';nav.setAttribute('aria-label','주 메뉴');
  nav.innerHTML=`<p class="nav-caption">WORKSPACE</p>${Object.entries(pageNames).filter(([key])=>key!=='edits'&&key!=='comparison').map(([key,label])=>`${key==='settings'?'<div class="nav-bottom">':''}<button type="button" data-page="${key}">${icon(key)}<span>${label}</span>${key==='data'?'<span id="nav-count" class="nav-count">0</span>':''}</button>${key==='settings'?'</div>':''}`).join('')}`;
  const analysisToggle=nav.querySelector('[data-page="analysis"]'), analysisGroup=document.createElement('div'), analysisMenu=document.createElement('div');
  analysisGroup.className='analysis-nav-group';analysisToggle.before(analysisGroup);
  analysisMenu.id='analysis-submenu';analysisMenu.className='analysis-submenu';analysisMenu.hidden=true;
  analysisMenu.innerHTML='<button type="button" data-analysis-mode="isotherm">Adsorption Isotherm</button><button type="button" data-analysis-mode="kinetic">Kinetics</button><button data-analysis-mode="comparison">비교분석</button>';
  analysisToggle.setAttribute('aria-controls','analysis-submenu');analysisToggle.setAttribute('aria-expanded','false');
  analysisToggle.insertAdjacentHTML('beforeend','<svg class="nav-chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m3 4.5 3 3 3-3"/></svg>');
  analysisGroup.append(analysisToggle,analysisMenu);
  function expandAnalysis(open){analysisMenu.hidden=!open;analysisToggle.setAttribute('aria-expanded',String(open));}
  const note=document.querySelector('.sidebar-note');sidebar.insertBefore(nav,note);
  const pages=document.createElement('div');pages.innerHTML=`
    <section id="page-data" class="workspace-page" aria-label="데이터 관리">
      <div class="workspace-page-intro"><div><span class="page-eyebrow">DATA LIBRARY</span><h2>불러온 측정 데이터</h2><p>번호로 관리하고, 필요한 파일에만 표시 이름을 지정하세요.</p></div><button id="analyze-selected" class="primary">선택 데이터 분석 <span aria-hidden="true">→</span></button></div>
      <div class="data-library-layout"><div id="data-library-host" class="data-library-panel"><div class="data-list-heading"><span>비교 · 파일 이름</span><span>기체 / 온도 / 측정일</span><span>선택한 구간</span></div></div><aside id="data-detail-host" class="data-detail-panel" aria-label="선택 파일 정보"></aside></div>
    </section>
    <section id="page-comparison" class="workspace-page" aria-label="비교분석" hidden></section>
    <section id="page-fitting" class="workspace-page" aria-label="Fitting" hidden><div class="workspace-page-intro"><div><span class="page-eyebrow">FITTING</span><h2>Fitting</h2><p>조건별 데이터를 구성하고 모델을 Fitting합니다.</p></div></div></section>
    <section id="page-presets" class="workspace-page" aria-label="프리셋" hidden><div class="workspace-page-intro"><div><span class="page-eyebrow">PRESETS</span><h2>비교 화면을 다시 이어서</h2><p>파일 조합, 구간과 표시 설정을 좌표로 저장하고 불러옵니다.</p></div></div><div id="preset-page-host"></div></section>
    <section id="page-edits" class="workspace-page" aria-label="편집본 관리" hidden><div class="workspace-page-intro"><div><span class="page-eyebrow">SAVED EDITS</span><h2>저장한 곡선 편집본</h2><p>원본과 연결된 편집 결과를 확인하고 비교에 추가하세요.</p></div><button id="edits-to-analysis">측정 분석으로</button></div><div id="edit-page-host"></div></section>
    <section id="page-settings" class="workspace-page" aria-label="설정" hidden><div class="workspace-page-intro"><div><span class="page-eyebrow">PREFERENCES</span><h2>작업 환경</h2><p>이 환경에서 사용할 기본 표시 방식을 정합니다.</p></div></div>
      <div class="settings-panel"><div class="settings-row"><div><h3>기본 압력 단위</h3><p>다음 실행부터 적용됩니다. 저장한 작업은 해당 작업의 단위를 따릅니다.</p></div><select id="pref-unit" aria-label="기본 압력 단위"><option>kPa</option><option>Pa</option><option>Torr</option></select></div>
      <div class="settings-row"><div><h3>글자 크기</h3><p>메뉴와 본문의 글자 크기</p></div><select id="pref-font" aria-label="글자 크기"><option value="normal">기본</option><option value="large">크게</option></select></div>
      <div class="settings-row"><div><h3>그래프 높이</h3><p>기본 분석 화면의 그래프 영역</p></div><select id="pref-plot" aria-label="그래프 높이"><option value="normal">기본</option><option value="large">넓게</option></select></div>
      <div class="settings-row"><div><h3>저장 위치</h3><p id="storage-description">프리셋과 편집본은 현재 브라우저에 저장됩니다. 작업 저장으로 파일을 내보낼 수 있습니다.</p></div><span class="settings-value">로컬 저장</span></div><p id="preferences-status" role="status"></p></div>
    </section>`;
  while(pages.firstElementChild)main.append(pages.firstElementChild);
  const fittingSets=mountFittingSets($('page-fitting'),getCurrent);
  const comparisonSets=mountComparisonSets($('page-comparison'),getCurrent);
  $('data-library-host').append(library);$('data-detail-host').append(conditions);conditions.open=true;
  const presetTabs=document.createElement('div');presetTabs.className='preset-kind-tabs';presetTabs.innerHTML='<button data-preset-kind="comparison" aria-pressed="true">비교 화면</button><button data-preset-kind="kinetic" aria-pressed="false">Kinetics 편집</button>'; $('preset-page-host').before(presetTabs);
  $('preset-page-host').append($('preset-dialog'));$('preset-dialog').classList.add('page-manager');
  $('page-presets').append($('edit-page-host'));$('edit-page-host').append($('edit-library'));$('edit-library').classList.add('page-manager');
  $('preset-close').textContent='측정 분석으로';
  $('preset-close').setAttribute('aria-label','측정 분석으로');
  $('edit-library-title').textContent='Kinetics 편집 프리셋';
  $('page-presets').querySelector('h2').textContent='프리셋';
  $('page-presets').querySelector('.workspace-page-intro p').textContent='비교 화면과 Kinetics 편집 설정을 저장하고 다시 엽니다.';
  $('preset-open').removeAttribute('aria-haspopup');
  const context=document.createElement('div');context.id='analysis-context';context.innerHTML='<div class="analysis-context-title"><strong>비교 데이터 <span id="comparison-count"></span></strong><button id="manage-data" class="quiet">데이터 관리 →</button></div><div id="analysis-files"></div>';
  $('analysis').prepend(context);
  const prefs=readPreferences();
  const appearancePanel=document.createElement('div');appearancePanel.className='graph-appearance-settings';
  appearancePanel.innerHTML=`<h3>그래프 글자 · Legend</h3><p class="hint">Adsorption Isotherm, Kinetics, 그래프 편집과 Fitting 미리보기에 공통 적용합니다. 단위는 px입니다.</p>
    <div class="settings-row"><div><h3>X축 이름 크기</h3><p>압력, 시간 등 가로축 이름</p></div><label class="graph-size-input"><input id="pref-xTitleSize" type="number" min="8" max="36" step="1" aria-label="X축 이름 크기 (px)"> px</label></div>
    <div class="settings-row"><div><h3>Y축 이름 크기</h3><p>Uptake, Pressure, Normalized response 식 등 세로축 이름</p></div><label class="graph-size-input"><input id="pref-yTitleSize" type="number" min="8" max="36" step="1" aria-label="Y축 이름 크기 (px)"> px</label></div>
    <div class="settings-row"><div><h3>Legend 표시</h3><p>그래프 아래에 색상과 데이터 이름을 표시합니다.</p></div><label class="graph-legend-toggle"><input id="pref-legendVisible" type="checkbox" role="switch" aria-label="Legend 표시"><span aria-hidden="true"></span></label></div>
    <div class="settings-row"><div><h3>Legend 글자 크기</h3><p>8~36 px · 긴 이름은 줄바꿈해서 표시합니다.</p></div><label class="graph-size-input"><input id="pref-legendSize" type="number" min="8" max="36" step="1" aria-label="Legend 글자 크기 (px)"> px</label></div><p id="graph-appearance-status" role="status"></p>`;
  appearancePanel.insertAdjacentHTML('beforeend',`<div class="settings-row"><div><h3>그래프 내부 Legend</h3><p>아래쪽 Legend와 별도로 표시 · 우클릭 복사에도 포함</p></div><label class="graph-legend-toggle"><input id="pref-insideLegend" type="checkbox" role="switch" aria-label="그래프 내부 Legend"><span aria-hidden="true"></span></label></div><div class="settings-row"><label>내부 Legend 크기 (px) <input id="pref-insideSize" type="number" min="8" max="36" step="1"></label><label>위치 <select id="pref-insidePosition"><option value="top-right">오른쪽 위</option><option value="top-left">왼쪽 위</option><option value="bottom-right">오른쪽 아래</option><option value="bottom-left">왼쪽 아래</option></select></label><label>배경 <select id="pref-insideBackground"><option value="white">흰색</option><option value="transparent">투명</option></select></label></div><p class="hint">그래프 우클릭 → 그래프 이미지 복사: 1600 × 1000 PNG (1.6:1). 현재 축 범위와 제목 크기를 반영하며 아래쪽 Legend·안내문은 복사하지 않습니다.</p>`);
  $('page-settings').querySelector('.settings-panel').append(appearancePanel);
  applyGraphAppearance();
  for(const key of ['xTitleSize','yTitleSize','legendSize','legendVisible','insideSize','insideLegend']){
    const control=$('pref-'+key),toggle=key==='legendVisible'||key==='insideLegend';if(toggle)control.checked=graphAppearance()[key];else control.value=graphAppearance()[key];
    control.onchange=()=>{const value=toggle?control.checked:Number(control.value);if(!toggle&&(!control.value||!Number.isInteger(value)||value<8||value>36)){$('graph-appearance-status').textContent='글자 크기는 8~36 사이의 정수로 입력하세요.';control.setAttribute('aria-invalid','true');return;}control.removeAttribute('aria-invalid');const persisted=saveGraphAppearance({...graphAppearance(),[key]:value});$('graph-appearance-status').textContent=persisted?'그래프 표시 설정을 저장했습니다.':'이번 실행에 적용했습니다. 저장 공간을 사용할 수 없어 다음 실행에는 유지되지 않습니다.';};
  }
  for(const key of ['insidePosition','insideBackground']){const c=$('pref-'+key);c.value=graphAppearance()[key];c.onchange=()=>{const persisted=saveGraphAppearance({...graphAppearance(),[key]:c.value});$('graph-appearance-status').textContent=persisted?'설정을 저장했습니다.':'이번 실행에만 적용했습니다.';};}
  function applyPreferences(){document.body.dataset.font=prefs.font;document.body.dataset.plot=prefs.plot;}
  for(const key of ['unit','font','plot']){$('pref-'+key).value=prefs[key];$('pref-'+key).onchange=()=>{prefs[key]=$('pref-'+key).value;applyPreferences();try{preferenceStorage.setItem('adsorption.preferences',JSON.stringify(prefs));$('preferences-status').textContent='설정을 저장했습니다.';}catch{$('preferences-status').textContent='설정을 저장할 수 없습니다. 이번 실행에만 적용됩니다.';}};}
  applyPreferences();
  let currentPage='data',presetKind='comparison';
  function setPresetKind(kind){presetKind=kind;$('preset-page-host').hidden=kind!=='comparison';$('edit-page-host').hidden=kind!=='kinetic';for(const b of presetTabs.children)b.setAttribute('aria-pressed',String(b.dataset.presetKind===kind));}
  for(const b of presetTabs.children)b.onclick=()=>{setPresetKind(b.dataset.presetKind);onPage(presetKind==='kinetic'?'edits':'presets');};
  setPresetKind('comparison');
  function show(page,notify=true){
    if(page==='edits'){setPresetKind('kinetic');page='presets';}else if(page==='presets'&&!notify)setPresetKind('comparison');
    if(!pageNames[page])return;currentPage=page;document.body.dataset.page=page;
    for(const key of Object.keys(pageNames)){const panel=$(key==='analysis'?'analysis':'page-'+key);panel.hidden=key!==page;}
    for(const b of nav.querySelectorAll('[data-page]')){if(b.dataset.page===page&&page!=='analysis')b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
    if(page==='analysis'||page==='comparison')expandAnalysis(true);
    document.querySelector('.page-title h2').textContent=pageNames[page];
    refresh();if(notify)onPage(page==='presets'&&presetKind==='kinetic'?'edits':page);
  }
  function refresh(){
    fittingSets.refresh();
    comparisonSets.refresh();
    const {entries,view}=getCurrent();$('nav-count').textContent=entries.length;
    analysisToggle.classList.toggle('nav-group-active',currentPage==='analysis'||currentPage==='comparison');
    for(const button of analysisMenu.querySelectorAll('button')){if(currentPage==='comparison'&&button.dataset.analysisMode==='comparison'||currentPage==='analysis'&&button.dataset.analysisMode===view.mode)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
    if(currentPage==='analysis')document.querySelector('.page-title h2').textContent=`측정 분석 · ${view.mode==='kinetic'?'Kinetics':'Adsorption Isotherm'}`;
    $('analyze-selected').disabled=!entries.some(e=>e.visible);
    const host=$('analysis-files');host.replaceChildren();
    $('comparison-count').textContent=entries.filter(e=>e.visible).length;
    for(const entry of entries.filter(e=>e.visible)){
      const item=document.createElement('div');item.className='analysis-file'+(entry.id===view.activeId?' active':'');
      item.style.setProperty('--series-color',colors[entries.indexOf(entry)%colors.length]);
      const select=document.createElement('button'),dot=document.createElement('i'),label=document.createElement('span');dot.className='comparison-dot';dot.setAttribute('aria-hidden','true');label.textContent=entry.alias;select.append(dot,label);select.title=entry.labelMode==='custom'?`${dataNumberLabel(entry)} · ${entry.alias}`:entry.alias;select.setAttribute('aria-pressed',String(entry.id===view.activeId));select.onclick=()=>onPick(entry.id,entry.pointId);
      const segment=document.createElement('select');segment.setAttribute('aria-label',`${entry.alias} 분석 구간`);
      const points=pointsFor(entry.measurement,entry.editVariant?'all':view.branch).filter(p=>!entry.editVariant||p.id===entry.pointId);
      for(const p of points){const option=document.createElement('option');option.value=p.id;option.textContent=`${p.id} · ${Number((p.equilibrium.pressure*pressureFactor(view.unit)).toPrecision(5))} ${view.unit}`;segment.append(option);}segment.value=entry.pointId;segment.disabled=!!entry.editVariant;segment.hidden=view.mode!=='kinetic';segment.onchange=()=>onPick(entry.id,segment.value);
      item.append(select,segment);
      if(view.mode==='kinetic'){
        const value=expectedPressure(entry.measurement,entry.pointId,view.unit),reference=document.createElement('span');
        reference.className='comparison-p0';reference.textContent=`Estimated P₀ ${value===null?'—':Number(value.toPrecision(6))+' '+view.unit}`;
        reference.title='추가 흡착이 없다고 가정한 Estimated pressure · RAT의 C0n';item.append(reference);
      }
      host.append(item);
    }
    if(!host.children.length){const p=document.createElement('p');p.className='hint';p.textContent='데이터 관리에서 비교할 파일을 선택하세요.';host.append(p);}
  }
  for(const b of nav.querySelectorAll('[data-page]'))b.onclick=()=>show(b.dataset.page);
  analysisToggle.onclick=()=>expandAnalysis(analysisMenu.hidden);
  for(const button of analysisMenu.querySelectorAll('button'))button.onclick=()=>{const mode=button.dataset.analysisMode;if(mode==='comparison'){show('comparison');return;}if(getCurrent().view.mode!==mode)$(mode).click();show('analysis');};
  $('manage-data').onclick=()=>show('data');$('analyze-selected').onclick=()=>{const {entries,view}=getCurrent();if(!entries.find(e=>e.id===view.activeId)?.visible){const first=entries.find(e=>e.visible);if(first)onPick(first.id,first.pointId);}show('analysis');};
  $('edits-to-analysis').onclick=()=>show('analysis');
  document.querySelector('.skip-link').onclick=event=>{event.preventDefault();show('analysis');$('plot').focus();};
  library.addEventListener('click',event=>{if(event.target.closest('button,input,select,label,a'))return;const card=event.target.closest('.entry');card?.querySelector('input[type="checkbox"]')?.click();});
  // The same controls are moved, so file inputs and workspace restoration keep their handlers.
  $('open-edits').onclick=()=>show('edits');
  show('data',false);
  return {show,refresh,get page(){return currentPage;}};
}
