import { createDraft, editHistory, changeExclusions, saveEdit, openCoordinate, PresetStore } from '../services/edits.js';
import { curveFor, validateAxes } from '../services/measurements.js';
import { renderPlot } from './plot.js';
import {editCurve,editSamples,preprocessingInfo,usableBasis,cleanEditBasis,inTimeRange} from '../core/kinetic-edit.js';
import {uniqueName} from '../core/presets.js';
import {presetTrends} from './preset-trends.js';
import {colors} from './plot.js';
let comparisonEditor;
export function openComparisonGraphEditor(entry,view,onSave){
  if(!comparisonEditor)throw Error('그래프 편집기가 준비되지 않았습니다.');
  return comparisonEditor(entry,view,onSave);
}

export function mountCurveEditor({getCurrent,onApply,onMessage,onLibraryOpen,onLibraryClose,store=new PresetStore(),host=document.body}) {
  const shell=document.createElement('div');
  shell.innerHTML=`
  <dialog id="curve-editor" class="curve-editor" aria-labelledby="editor-title">
    <div class="editor-main">
    <header class="editor-head"><div><span class="editor-eyebrow">KINETIC / GRAPH EDITOR</span><h2 id="editor-title">그래프 편집</h2><p id="editor-source"></p></div><div class="editor-head-actions"><button id="editor-sidebar-toggle" aria-controls="editor-point-sidebar" aria-expanded="false">점 목록</button><button id="editor-close" class="quiet">닫기</button></div></header>
    <div class="editor-body">
      <div class="editor-tools"><span class="editor-mouse-guide">좌클릭 · 점 선택 <span>/</span> 우클릭 드래그 · 이동</span><button id="editor-undo" class="quiet">실행 취소</button><button id="editor-redo" class="quiet">다시 실행</button><button id="editor-reset" class="quiet">전체 보기</button></div>
      <div class="editor-preprocessing"><label class="preprocessing-toggle"><input id="editor-preprocess" type="checkbox" role="switch"><span>Preprocessing</span></label><span id="editor-preprocess-summary" role="status"></span><p>Normalized response Y ≥ 1인 점을 숨기고 계산에서 제외합니다. 시작부터 연속으로 제외된 마지막 점의 시간만큼 전체 시간을 당깁니다. 압력 보기에서도 같은 기준을 적용하며 원본은 보존합니다.</p></div>
      <div class="editor-trend"><label><input type="checkbox" id="editor-trend"> Trendline</label><label>시간 시작 <input id="editor-min" type="number" min="0" step="any" placeholder="자동" aria-label="Trendline 계산 시작 (초)"> s</label><label>시간 끝 <input id="editor-max" type="number" min="0" step="any" placeholder="자동" aria-label="Trendline 시간 끝 (초)"> s</label><label>Smoothing level <select id="editor-strength" aria-label="Trendline smoothing level"><option>1</option><option selected>2</option><option>3</option><option>4</option><option>5</option></select></label><label>Y값 <select id="editor-value" aria-label="편집 Y값"><option value="residual">Normalized response</option><option value="pressure">Pressure</option></select></label><label>축 눈금 <select id="editor-scale" aria-label="편집 그래프 Y축"><option value="log">로그</option><option value="linear">선형</option></select></label></div>
      <div class="editor-selected-trend"><label><input type="checkbox" id="editor-selected-trend"> 선택한 점의 Trendline <i aria-hidden="true"></i></label><button id="editor-draw-selected">선택한 점으로 Trendline 생성</button><button id="editor-equilibrium" aria-pressed="false">Trendline 연장 (for equilibrium)</button><button id="editor-basis" class="quiet">기준점 선택하기</button><span id="editor-selected-summary">점을 3개 이상 선택하세요.</span><small><span id="editor-equilibrium-note">시간 범위 안의 사용점으로 계산 · Normalized response 0 &lt; Y ≤ 1 · 표시용 Trendline</span></small></div>
      <details class="editor-reference-panel"><summary>저장한 Trendline 비교 <span id="editor-reference-count">0개 선택</span></summary><div class="editor-reference-tools"><label>Opacity (%) <input id="editor-reference-opacity" type="range" min="0" max="100" step="5" value="25"><output id="editor-reference-opacity-value">25%</output></label><button id="editor-reference-clear" class="quiet">모두 해제</button></div><div id="editor-reference-list"></div><p>실선: Trendline · 점선: 선택한 점의 Trendline. 현재 Y값·단위로 표시하며 시간 원점은 유지합니다. 비교용 선은 축 범위·점 선택·계산·저장에 포함되지 않습니다.</p><p id="editor-reference-status" role="status"></p></details>
      <div class="editor-guide"><span id="editor-guide">점을 눌러 선택한 뒤 제외·복원하세요. 여러 점을 선택할 수 있습니다.</span><span>붉은 점: 제외됨 · Ctrl + 휠: 확대</span></div>
      <div id="editor-plot" tabindex="0" aria-label="편집 그래프"></div>
      <div id="editor-legend" class="graph-legend"></div>
      <div id="editor-warning" class="editor-warning" role="status"></div>
      <div class="editor-plot-foot"><span id="editor-hover"></span></div>
    </div>
    <footer class="editor-foot"><label>편집 프리셋 이름 <input id="editor-name" maxlength="100" type="text" autocomplete="off"></label><div class="editor-save-actions"><button id="editor-update">변경사항 저장</button><button id="editor-save" class="primary">Kinetics 프리셋으로 저장</button><button id="editor-apply">비교 화면에 적용</button></div><p id="editor-status" role="status" aria-live="polite"></p><div id="editor-discard" hidden>저장하지 않은 변경사항이 있습니다. 저장하지 않고 닫으시겠어요? <button id="editor-stay">편집 계속하기</button><button id="editor-leave">저장하지 않고 닫기</button></div></footer>
    </div>
    <aside id="editor-point-sidebar" class="editor-point-sidebar" aria-label="점 선택과 제외·복원">
      <header class="editor-side-head"><div><span class="editor-eyebrow">POINTS</span><h3>점 목록</h3></div><button id="editor-sidebar-close" class="quiet" aria-label="점 목록 닫기">닫기</button></header>
      <div class="editor-side-controls"><strong id="editor-counts"></strong><div><button id="editor-exclude">선택한 점 제외</button><button id="editor-restore">제외 해제</button></div><div><button id="editor-side-undo">실행 취소</button><button id="editor-side-redo">다시 실행</button></div><div><select id="editor-list-filter" aria-label="점 목록 필터"><option value="all">전체 점</option><option value="selected">선택한 점</option><option value="excluded">제외한 점</option></select><button id="editor-clear" class="quiet">선택 해제</button></div></div>
      <div class="editor-table"><table><thead><tr><th>선택</th><th>샘플</th><th>Time (s)</th><th id="editor-value-heading">Normalized response</th><th>상태</th></tr></thead><tbody id="editor-rows"></tbody></table></div>
      <p class="editor-side-note">제외한 점은 복원할 수 있습니다.<br>원본 측정값은 보존됩니다.</p>
    </aside>
  </dialog>
  <dialog id="edit-library" class="edit-library" aria-labelledby="edit-library-title"><header class="editor-head"><div><span class="editor-eyebrow">SAVED EDITS</span><h2 id="edit-library-title">저장한 편집 프리셋</h2></div><button id="edit-library-close" class="quiet">닫기</button></header><div id="edit-library-list"></div><div class="editor-library-foot"><p id="edit-library-status" role="status">이 브라우저에 저장 · 원본 보존</p><button id="edit-library-undo" class="quiet" hidden>삭제 실행 취소</button></div></dialog>`;
  host.append(shell);
  const $=id=>document.getElementById(id), dialog=$('curve-editor'), libraryDialog=$('edit-library');
  let entry=null, history=null, draft=null, library=null, record=null, baseline='', savedFingerprint=null, selected=new Set(), busy=false, deleted=null, pendingControls=false;
  let references=new Map(),referenceGeneration=0;
  let comparisonSave=null;
  function renderReferences(){
    const list=$('editor-reference-list');list.replaceChildren();
    if(!library.edits.length){list.textContent='저장된 Kinetics 편집 프리셋이 없습니다.';return;}
    library.edits.forEach((item,index)=>{
      const variant=item.workspace.entries[0].editVariant,available=variant.trend.enabled||variant.selectedTrend?.enabled;
      const label=document.createElement('label'),check=document.createElement('input'),swatch=document.createElement('i'),text=document.createElement('span');
      check.type='checkbox';check.checked=references.has(item.id);check.disabled=!available;check.setAttribute('aria-label',`${item.name} Trendline 겹쳐 보기`);
      swatch.style.background=colors[(index+2)%colors.length];text.textContent=`${item.name}${available?'':' · 저장된 Trendline 없음'}`;label.title=`${item.summary.rows[0].pointId} · ${item.summary.rows[0].temperature_K} K`;label.append(check,swatch,text);list.append(label);
      check.onchange=async()=>{
        if(!check.checked){references.delete(item.id);plot();return;}
        const generation=referenceGeneration,ref={name:item.name,color:colors[(index+2)%colors.length],restored:null,error:null};references.set(item.id,ref);plot();
        try{ref.restored=await openCoordinate(item,await store.readSources(item.workspace.entries.map(e=>e.hash)));}
        catch(error){ref.error=error.message;}
        if(generation===referenceGeneration&&references.get(item.id)===ref)plot();
      };
    });
  }
  $('editor-reference-opacity').oninput=()=>{$('editor-reference-opacity-value').textContent=`${$('editor-reference-opacity').value}%`;plot();};
  $('editor-reference-clear').onclick=()=>{references.clear();renderReferences();plot();};
  const wideSidebar=matchMedia('(min-width:1560px)');
  function syncSidebar(){const open=wideSidebar.matches||dialog.classList.contains('sidebar-open');$('editor-sidebar-toggle').setAttribute('aria-expanded',String(open));}
  wideSidebar.addEventListener('change',syncSidebar);
  $('editor-sidebar-toggle').onclick=()=>{dialog.classList.toggle('sidebar-open');syncSidebar();if(dialog.classList.contains('sidebar-open'))$('editor-list-filter').focus();};
  $('editor-sidebar-close').onclick=()=>{dialog.classList.remove('sidebar-open');syncSidebar();$('editor-sidebar-toggle').focus();};
  $('editor-list-filter').onchange=()=>render();
  const fingerprint=()=>JSON.stringify(draft);
  const dirty=()=>pendingControls||fingerprint()!==baseline;
  const status=(text,error=false)=>{ $('editor-status').textContent=text;$('editor-status').classList.toggle('preset-error',error); };
  const run=async fn=>{if(busy)return;busy=true;buttons();try{await fn();}catch(error){status(error.message,true);$('edit-library-status').textContent=error.message;onMessage(error.message,true);}finally{busy=false;buttons();}};
  function buttons(){
    if(!draft)return;
    for(const id of ['editor-exclude','editor-restore','editor-clear','editor-close','editor-save','editor-reset','editor-trend','editor-min','editor-max','editor-strength','editor-scale','editor-name'])$(id).disabled=busy;
    $('editor-update').disabled=busy||!record;
    $('editor-apply').disabled=busy||!record||pendingControls||fingerprint()!==savedFingerprint;
    $('editor-exclude').disabled=busy||!selected.size;$('editor-restore').disabled=busy||!selected.size;
    const usable=usableBasis(entry,draft,[...selected]).length,basis=usableBasis(entry,draft,draft.selectedTrend.sampleIds).length;
    $('editor-value').disabled=busy;$('editor-preprocess').disabled=busy;
    $('editor-draw-selected').disabled=busy||usable<3;
    $('editor-equilibrium').disabled=busy||(usable<3&&basis<3);
    $('editor-selected-trend').disabled=busy||(!draft.selectedTrend.enabled&&usable<3&&basis<3);
    $('editor-basis').disabled=busy||!draft.selectedTrend.sampleIds.length;
    $('editor-undo').disabled=busy||!history?.canUndo;$('editor-redo').disabled=busy||!history?.canRedo;
    $('editor-side-undo').disabled=$('editor-undo').disabled;$('editor-side-redo').disabled=$('editor-redo').disabled;
    $('editor-update').hidden=!record;
    $('editor-apply').title=record&&fingerprint()===savedFingerprint?'저장된 편집 프리셋을 비교 목록에 추가합니다.':'먼저 편집 프리셋을 저장하세요.';
    $('editor-name').closest('label').hidden=!!comparisonSave;
    $('editor-save').hidden=!!comparisonSave;
    if(comparisonSave){$('editor-update').hidden=true;$('editor-apply').disabled=busy;$('editor-apply').title='이 비교 항목에만 적용합니다. 세트 저장으로 보관하세요.';}
    $('editor-apply').textContent=comparisonSave?'비교 항목에 적용':'비교 화면에 적용';
    for(const input of $('editor-rows').querySelectorAll('input'))input.disabled=busy;
    for(const button of $('editor-rows').querySelectorAll('button'))button.disabled=busy;
  }
  function commit(next){pendingControls=false;history.commit(cleanEditBasis(entry,next));draft=history.value;const visible=new Set(editSamples(entry,draft).filter(s=>inTimeRange(s.values[0],draft.trend)).map(s=>s.id));selected=new Set([...selected].filter(id=>visible.has(id)));$('editor-discard').hidden=true;status(dirty()?'저장하지 않은 변경사항이 있습니다.':'모든 변경사항이 저장되었습니다.');render();}
  function plot(){
    if(!dialog.open||!draft)return;
    const curve=editCurve(entry,draft);
    const overlays=[],referenceNotes=[];
    for(const [id,ref] of references){
      if(ref.error){referenceNotes.push(`${ref.name}: ${ref.error}`);continue;}
      if(!ref.restored){referenceNotes.push(`${ref.name}: 불러오는 중`);continue;}
      const lines=presetTrends(ref.restored,draft,{id,...ref,opacity:Number($('editor-reference-opacity').value)/100});
      overlays.push(...lines);
      if(!lines.some(line=>line.data.some(p=>(draft.axes.y.scale!=='log'||p.y>0)&&(draft.axes.x.min==null||p.x>=draft.axes.x.min)&&(draft.axes.x.max==null||p.x<=draft.axes.x.max)&&(draft.axes.y.min==null||p.y>=draft.axes.y.min)&&(draft.axes.y.max==null||p.y<=draft.axes.y.max))))referenceNotes.push(`${ref.name}: 현재 범위에 표시 가능한 Trendline 없음`);
    }
    $('editor-reference-count').textContent=`${references.size}개 선택`;
    $('editor-reference-status').textContent=referenceNotes.join(' / ');
    const result=renderPlot($('editor-plot'),[{...curve,id:entry.id,name:draft.name,color:'#3560c8',selectedTrendSettings:{...curve.selectedTrendSettings,color:'#ac681b'}}],draft.axes,{},h=>{
      if(busy)return;
      selected.has(h.p.sampleId)?selected.delete(h.p.sampleId):selected.add(h.p.sampleId);render();
    },range=>{
      if(busy)return;const next=structuredClone(draft);
      for(const axis of ['x','y']){next.axes[axis].min=range[axis][0];next.axes[axis].max=range[axis][1];}
      try{validateAxes(next.axes);commit(next);}catch(error){status(error.message,true);}
    },h=>{$('editor-hover').textContent=`${h.p.sampleId} · ${Number(h.p.x.toPrecision(6))} s${draft.preprocess?` (원본 ${h.p.originalX} s)`:''} · ${Number(h.p.y.toPrecision(6))}`;},
    {method:'raw',edit:true,selectedSampleIds:[...selected],panButton:2,presetTrends:overlays});
    const legendItems=[{name:`${entry.alias} · ${entry.pointId}`,color:'#3560c8'},...overlays];
    $('editor-legend').replaceChildren(...legendItems.map(item=>{
      const label=document.createElement('span'),mark=document.createElement('i'),text=document.createElement('span');
      mark.className='swatch';mark.style.color=item.color;text.textContent=item.name;
      label.append(mark,text);return label;
    }));
    $('editor-warning').textContent=[...result.trendWarnings,result.hidden?`로그축에서 0 이하 ${result.hidden}점은 숨김 · 점 목록에서 선택 가능`:'',draft.selectedTrend.toEquilibrium&&draft.kineticValue!=='pressure'&&draft.axes.y.scale==='log'?'평형 기준 Y=0은 로그축에서 표시할 수 없습니다.':''].filter(Boolean).join(' / ');
    if(result.trendWarnings.length&&draft.selectedTrend.enabled)$('editor-selected-summary').textContent+=' · 계산 불가';
  }
  function render(){
    if(!draft)return;
    const processing=preprocessingInfo(entry,draft);
    $('editor-preprocess').checked=!!draft.preprocess;
    $('editor-preprocess-summary').textContent=draft.preprocess?`자동 제외 ${processing.removed.size}점 · 시간 −${processing.shift}초 · 시간 범위는 Preprocessing 시간 기준`:'꺼짐 · 원본 시간';
    $('editor-name').value=draft.name;$('editor-trend').checked=draft.trend.enabled;
    $('editor-selected-trend').checked=draft.selectedTrend.enabled;
    const usable=usableBasis(entry,draft,[...selected]).length,basis=usableBasis(entry,draft,draft.selectedTrend.sampleIds).length;
    $('editor-selected-summary').textContent=`선택 ${selected.size} · 계산 가능 ${usable} · 기준 ${basis}${draft.selectedTrend.enabled?(basis>=3?' · 점선 켜짐':' · 계산 불가'):' · 점선 꺼짐'}`;
    $('editor-value').value=draft.kineticValue??'residual';
    $('editor-value-heading').textContent=draft.kineticValue==='pressure'?`Pressure (${draft.unit})`:'Normalized response';
    $('editor-equilibrium').setAttribute('aria-pressed',String(!!draft.selectedTrend.toEquilibrium));
    const end=entry.measurement.points.find(p=>p.id===entry.pointId).samples.at(-1).values[0]-processing.shift;
    $('editor-equilibrium-note').textContent=draft.selectedTrend.toEquilibrium?`마지막 기록 ${end}초까지 연장 · Ce 기준선 · 정확한 평형 도달시간은 파일에 없음 · 표시용 외삽`:'시간 범위 안의 사용점으로 계산 · Normalized response 0 < Y ≤ 1 · 표시용 Trendline';
    $('editor-selected-summary').title=draft.selectedTrend.sampleIds.join(', ');
    $('editor-min').value=draft.trend.min??'';$('editor-max').value=draft.trend.max??'';$('editor-strength').value=draft.trend.strength;$('editor-scale').value=draft.axes.y.scale;
    $('editor-guide').textContent='좌클릭으로 점 선택 · 오른쪽 점 목록에서 제외·복원 · 이동해도 계산 시간은 유지됩니다.';
    const point=entry.measurement.points.find(p=>p.id===entry.pointId);
    const values=new Map(curveFor(entry.measurement,entry.pointId,'kinetic',draft.unit,'all',draft.kineticValue).data.map(p=>[p.sampleId,p.y]));
    const rows=$('editor-rows'), scroll=rows.parentElement.parentElement.scrollTop;rows.replaceChildren();
    const processedSamples=editSamples(entry,draft);
    for(const sample of processedSamples){
      if(!inTimeRange(sample.values[0],draft.trend))continue;
      const excluded=draft.excluded.includes(sample.id),filter=$('editor-list-filter').value;
      if(filter==='selected'&&!selected.has(sample.id)||filter==='excluded'&&!excluded)continue;
      const tr=document.createElement('tr');tr.dataset.sampleId=sample.id;tr.classList.toggle('excluded',draft.excluded.includes(sample.id));tr.classList.toggle('active',selected.has(sample.id));
      if(draft.preprocess)tr.title=`원본 시간 ${sample.originalTime} s → Preprocessing 시간 ${sample.values[0]} s`;
      const td=document.createElement('td'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=selected.has(sample.id);checkbox.disabled=busy;checkbox.setAttribute('aria-label',`${sample.id} 선택`);
      checkbox.onchange=()=>{if(busy)return;checkbox.checked?selected.add(sample.id):selected.delete(sample.id);render();};td.append(checkbox);tr.append(td);
      for(const value of [sample.id,sample.values[0],values.has(sample.id)?Number(values.get(sample.id).toPrecision(5)):'계산 불가']){const cell=document.createElement('td');cell.textContent=value;tr.append(cell);}
      const actionCell=document.createElement('td'),action=document.createElement('button');action.textContent=excluded?'제외 해제':'제외';action.setAttribute('aria-label',`${sample.id} ${excluded?'제외 해제':'제외'}`);action.disabled=busy;action.onclick=()=>{if(!busy){if(!excluded)selected.delete(sample.id);commit(changeExclusions(draft,[sample.id],!excluded));}};actionCell.append(action);tr.append(actionCell);rows.append(tr);
    }
    rows.parentElement.parentElement.scrollTop=scroll;
    const rangePoints=processedSamples.filter(s=>inTimeRange(s.values[0],draft.trend));
    $('editor-counts').textContent=`범위 ${rangePoints.length}/${processedSamples.length}${draft.preprocess?` · 자동 제외 ${processing.removed.size}`:''} · 범위 내 제외 ${rangePoints.filter(s=>draft.excluded.includes(s.id)).length} · 선택 ${selected.size}`;
    $('editor-sidebar-toggle').textContent=`점 목록 · 선택 ${selected.size}`;
    buttons();plot();
  }
  async function open(entryValue,view,recordValue=null,comparisonCallback=null){
    comparisonSave=comparisonCallback;
    library=await store.loadEdits();
    references=new Map();referenceGeneration++;renderReferences();
    entry={...entryValue,excludedSamples:structuredClone(entryValue.excludedSamples??{})};
    record=recordValue??library.edits.find(e=>e.id===entry.editVariant?.id)??null;
    draft=createDraft(entry,view);
    if(!record&&!comparisonSave)draft.name=uniqueName(draft.name,library.edits);
    $('editor-hover').textContent='';
    const removedBasis=draft.selectedTrend.sampleIds.length;draft=cleanEditBasis(entry,draft);
    if(draft.trend.min!==null||draft.trend.max!==null){draft.axes.x.min=draft.trend.min;draft.axes.x.max=draft.trend.max;}
    history=editHistory(draft);baseline=fingerprint();savedFingerprint=record?JSON.stringify(createDraft({...record.workspace.entries[0],measurement:entry.measurement},record.workspace.view)):null;selected=new Set();pendingControls=false;
    dialog.classList.remove('sidebar-open');$('editor-list-filter').value='all';syncSidebar();
    const point=entry.measurement.points.find(p=>p.id===entry.pointId),meta=entry.measurement.metadata;
    $('editor-source').textContent=`${entry.alias} / ${entry.pointId} · ${meta.temperature_K} K · ${meta.gas} · Pₑ ${Number(point.equilibrium.pressure.toPrecision(6))} kPa`;
    if(!onLibraryOpen)libraryDialog.close();dialog.showModal();$('editor-discard').hidden=true;
    status(removedBasis>draft.selectedTrend.sampleIds.length?'제외·범위 밖·유효하지 않은 기준점을 정리했습니다. 저장하면 이 설정이 반영됩니다.':record?'Kinetics 편집 프리셋을 열었습니다.':'새 Kinetics 편집 프리셋을 만듭니다.');render();
    if(comparisonSave)status('비교 세트 전용 편집 · 원본과 Kinetics 프리셋은 변경되지 않습니다.');
    dialog.querySelector('.editor-main').scrollTop=0;dialog.querySelector('.editor-table').scrollTop=0;$('editor-close').focus({preventScroll:true});
  }
  function close(){if(busy)return;if(dirty()){$('editor-discard').hidden=false;$('editor-stay').focus();}else dialog.close();}
  window.addEventListener('beforeunload',event=>{
    if(!window.adsorptionClosingApproved&&dialog.open&&(busy||dirty())){event.preventDefault();event.returnValue='';}
  });
  $('editor-close').onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  $('editor-stay').onclick=()=>{$('editor-discard').hidden=true;};$('editor-leave').onclick=()=>{if(!busy)dialog.close();};
  $('editor-exclude').onclick=()=>{const next=changeExclusions(draft,selected,true);selected.clear();commit(next);};$('editor-restore').onclick=()=>commit(changeExclusions(draft,selected,false));
  $('editor-clear').onclick=()=>{selected.clear();render();};
  $('editor-preprocess').onchange=()=>{try{const next=readControls();next.preprocess=$('editor-preprocess').checked;next.axes.x.min=next.trend.min;next.axes.x.max=next.trend.max;next.axes.y.min=null;next.axes.y.max=null;commit(next);}catch(error){$('editor-preprocess').checked=!!draft.preprocess;status(error.message,true);}};
  function selectedDraft(){
      const next=readControls(),usable=usableBasis(entry,next,[...selected]);next.selectedTrend={...next.selectedTrend,enabled:true,sampleIds:usable};
      if(usable.length<3)throw new Error('설정 시간 안에서 제외되지 않은 0 < Y ≤ 1인 점을 3개 이상 선택하세요.');
      return next;
  }
  $('editor-draw-selected').onclick=()=>{try{commit(selectedDraft());}catch(error){status(error.message,true);}};
  $('editor-selected-trend').onchange=()=>{try{const enabled=$('editor-selected-trend').checked,next=enabled&&selected.size>=3?selectedDraft():readControls();next.selectedTrend.enabled=enabled;commit(next);}catch(error){$('editor-selected-trend').checked=draft.selectedTrend.enabled;status(error.message,true);}};
  $('editor-basis').onclick=()=>{selected=new Set(draft.selectedTrend.sampleIds);render();};
  $('editor-equilibrium').onclick=()=>{try{
    let next=readControls();
    if(next.selectedTrend.toEquilibrium){next.selectedTrend.toEquilibrium=false;commit(next);return;}
    if(usableBasis(entry,next,[...selected]).length>=3)next=selectedDraft();
    if(usableBasis(entry,next,next.selectedTrend.sampleIds).length<3)throw new Error('계산 가능한 기준점을 3개 이상 선택하세요.');
    next.selectedTrend.enabled=true;next.selectedTrend.toEquilibrium=true;
    next.trend.max=entry.measurement.points.find(p=>p.id===entry.pointId).samples.at(-1).values[0]-preprocessingInfo(entry,next).shift;next.axes.x.max=next.trend.max;commit(next);
  }catch(error){status(error.message,true);}};
  $('editor-undo').onclick=()=>{pendingControls=false;draft=history.undo();status(dirty()?'저장하지 않은 변경사항이 있습니다.':'모든 변경사항이 저장되었습니다.');render();};
  $('editor-redo').onclick=()=>{pendingControls=false;draft=history.redo();status('변경을 다시 적용했습니다.');render();};
  $('editor-side-undo').onclick=()=>$('editor-undo').click();$('editor-side-redo').onclick=()=>$('editor-redo').click();
  $('editor-reset').textContent='보기 초기화';
  $('editor-reset').onclick=()=>{const next=structuredClone(draft);for(const axis of ['x','y']){next.axes[axis].min=null;next.axes[axis].max=null;next.axes[axis].step=null;}next.axes.x.min=next.trend.min;next.axes.x.max=next.trend.max;commit(next);};
  $('editor-name').oninput=()=>{const next=structuredClone(draft);next.name=$('editor-name').value;history.commit(next);draft=history.value;buttons();};
  function readControls(){
    const next=structuredClone(draft);next.name=$('editor-name').value;
    next.trend={enabled:$('editor-trend').checked,strength:Number($('editor-strength').value),min:$('editor-min').value===''?null:Number($('editor-min').value),max:$('editor-max').value===''?null:Number($('editor-max').value)};
    if(!$('editor-min').validity.valid||!$('editor-max').validity.valid||[next.trend.min,next.trend.max].some(v=>v!==null&&(!Number.isFinite(v)||v<0))||next.trend.min!==null&&next.trend.max!==null&&next.trend.min>=next.trend.max)throw new Error('시간 끝은 시작보다 커야 하며 0 이상이어야 합니다.');
    if(next.trend.min!==draft.trend.min||next.trend.max!==draft.trend.max){next.axes.x.min=next.trend.min;next.axes.x.max=next.trend.max;}
    next.kineticValue=$('editor-value').value;
    if(next.kineticValue!==draft.kineticValue){next.axes.y.min=null;next.axes.y.max=null;next.axes.y.step=null;}
    if(next.axes.y.scale!==$('editor-scale').value){next.axes.y.scale=$('editor-scale').value;next.axes.y.min=null;next.axes.y.max=null;next.axes.y.step=null;}
    return next;
  }
  for(const id of ['editor-trend','editor-min','editor-max','editor-strength','editor-scale','editor-value']){
    $(id).oninput=()=>{pendingControls=true;buttons();};
    $(id).onchange=()=>{try{commit(readControls());}catch(error){status(error.message,true);}};
  }
  async function save(update){
    if(!update){draft.name=uniqueName(draft.name,library.edits);$('editor-name').value=draft.name;}
    const result=saveEdit(library,entry,draft,update?record?.id:null);
    try{library=await store.saveEdits(result.library,result.sources);}catch(error){if(error.code==='PRESET_CONFLICT')library=await store.loadEdits();throw error;}
    record=library.edits.find(e=>e.id===result.record.id);baseline=fingerprint();savedFingerprint=baseline;
    references.delete(record.id);renderReferences();plot();
    status(`「${record.name}」 저장 완료 · 프리셋 → Kinetics 편집에서 다시 열 수 있습니다.`);
  }
  function saveFromForm(update){
    if(busy)return;
    try{commit(readControls());}catch(error){status(error.message,true);return;}
    return run(()=>save(update));
  }
  $('editor-save').onclick=()=>saveFromForm(false);$('editor-update').onclick=()=>saveFromForm(true);
  async function apply(recordValue){
    const restored=await openCoordinate(recordValue,await store.readSources(recordValue.workspace.entries.map(e=>e.hash)));
    onApply(restored);dialog.close();libraryDialog.close();onMessage('Kinetics 편집 프리셋을 비교 목록에 추가했습니다.');
  }
  $('editor-apply').onclick=()=>run(async()=>{
    if(comparisonSave){const next=cleanEditBasis(entry,readControls());await comparisonSave(structuredClone(next));draft=next;baseline=fingerprint();dialog.close();}
    else await apply(record);
  });
  dialog.addEventListener('keydown',event=>{
    if(busy||event.target.matches('input,select,textarea'))return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();$(event.shiftKey?'editor-redo':'editor-undo').click();}
    if(event.key==='Delete'){event.preventDefault();$('editor-exclude').click();}
  });
  $('edit-library-close').textContent=onLibraryClose?'측정 분석으로':'닫기';
  $('edit-library-close').onclick=()=>{if(!busy){libraryDialog.close();onLibraryClose?.();}};libraryDialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  dialog.addEventListener('close',()=>{if(libraryDialog.open&&library)renderLibrary();});
  function renderLibrary(){
    const list=$('edit-library-list');list.replaceChildren();$('edit-library-undo').hidden=!deleted;
    if(!library.edits.length){const p=document.createElement('p');p.className='preset-empty';p.textContent='아직 편집 프리셋이 없습니다. 시간 구간을 선택하고 그래프 편집을 여세요.';list.append(p);}
    for(const item of [...library.edits].reverse()){
      const row=document.createElement('article'),title=document.createElement('h3'),description=document.createElement('p'),actions=document.createElement('div');row.className='saved-edit';title.textContent=item.name;
      const e=item.workspace.entries[0],s=item.summary.rows[0],t=e.editVariant.trend;
      description.textContent=`${s.temperature_K} K · ${s.pointId} · Pₑ ${Number(s.pressure_kPa.toPrecision(6))} kPa · ${s.excluded}점 제외${t.enabled||e.editVariant.selectedTrend?.enabled?` · Trendline ${t.max??'전체'} s / Smoothing level ${t.strength}`:''}${e.editVariant.selectedTrend?.enabled?` · 선택 기준 ${e.editVariant.selectedTrend.sampleIds.length}점`:''}`;
      const basis=e.editVariant.selectedTrend?.sampleIds??[],remaining=basis.filter(id=>!e.excludedSamples?.[e.pointId]?.includes(id)).length;
      if(e.editVariant.selectedTrend?.enabled&&remaining<3)description.textContent+=' · 기준점 부족: 다시 편집 필요';
      description.textContent+=` · ${item.workspace.view.kineticValue==='pressure'?'Pressure':'Normalized response'}${e.editVariant.selectedTrend?.toEquilibrium?' · Trendline 연장 (for equilibrium)':''}${e.editVariant.preprocess?' · Preprocessing':''}`;
      for(const [label,action] of [['다시 편집',async()=>{const r=await openCoordinate(item,await store.readSources([e.hash]));await open(r.entries[0],r.view,item);}],['비교에 추가',()=>apply(item)],['삭제',async()=>{
        const before=structuredClone(library),next=structuredClone(library);next.edits=next.edits.filter(edit=>edit.id!==item.id);library=await store.saveEdits(next);deleted={before,revision:library.revision};renderLibrary();$('edit-library-status').textContent='편집 프리셋을 삭제했습니다. 원본·열린 비교 화면·프리셋은 유지됩니다.';
      }]]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>run(action);actions.append(b);}row.append(title,description,actions);list.append(row);
    }
  }
  $('edit-library-undo').onclick=()=>run(async()=>{
    if(!deleted||deleted.revision!==library.revision)throw new Error('다른 저장 이후에는 이 삭제를 취소할 수 없습니다.');
    const next=structuredClone(deleted.before);next.revision=library.revision;library=await store.saveEdits(next);deleted=null;renderLibrary();$('edit-library-status').textContent='삭제를 취소했습니다.';
  });
  async function showLibrary(){
    library=await store.loadEdits();if(deleted?.revision!==library.revision)deleted=null;renderLibrary();
    $('edit-library-status').textContent='이 환경에 저장 · 원본 보존';
    if(onLibraryOpen){onLibraryOpen();if(!libraryDialog.open)libraryDialog.show();}else libraryDialog.showModal();
  }
  window.addEventListener('adsorption:graph-appearance',plot);
  new ResizeObserver(()=>{if(dialog.open)plot();}).observe($('editor-plot'));
  comparisonEditor=(entry,view,callback)=>run(()=>open(entry,view,null,callback));
  return {openCurrent:()=>run(async()=>{const current=getCurrent();if(!current.entry)throw new Error('시간 구간을 먼저 선택하세요.');await open(current.entry,current.view);}),showLibrary:()=>run(showLibrary)};
}
