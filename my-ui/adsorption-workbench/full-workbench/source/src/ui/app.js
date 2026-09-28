import {initializeVault,currentVault,vaultCall} from '../storage/vault-store.js';
import {mountVaultBrowser} from './vault-browser.js';
import { displayMethods } from './kinetic-display.js';
import { isSampleExcluded, createEntry, saveWorkspace, restoreWorkspace, defaultAxes, curveFor, csvExport, validateAxes, pressureFactor, expectedPressure, pointsFor, branchLabels } from '../services/measurements.js';
import { renderPlot, colors } from './plot.js';
import { mountPresetManager } from './preset-manager.js';
import { mountCurveEditor } from './curve-editor.js';
import { mountWorkspaceShell, readPreferences } from './workspace-shell.js';
import { prepareEntryLabels, dataNumberLabel, setEntryLabel } from '../core/entry-labels.js';
import { visibleTableColumns, tableCellText } from '../core/table-columns.js';
import { mountTableOptions, readTableColumns } from './table-options.js';
import {editCurve,editSamples,preprocessingInfo,inTimeRange} from '../core/kinetic-edit.js';
import {appendGraphFooter} from './graph-appearance.js';
import {mountIsothermValidation} from './isotherm-validation.js';
await initializeVault();
const $=id=>document.getElementById(id);
let entries=[],view={activeId:null,mode:'isotherm',unit:readPreferences().unit,branch:'adsorption',axes:defaultAxes(),kineticTable:readTableColumns()},sampleId=null;
const display={method:'raw',strength:2,overlay:false,trend:false,edit:false};
let presetManager=null,workspaceUI=null,validationUI=null,vaultUI=null;
const active=()=>entries.find(e=>e.id===view.activeId);
const message=(text,error=false)=>{ $('status').textContent=text;$('status').className=error?'error':''; };
function guard(fn){return async(...args)=>{try{await fn(...args);}catch(e){message(`${e.message}${e.line?` (원본 ${e.line}행)`:''}`,true);}};}
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function download(data,name,type){const url=URL.createObjectURL(data instanceof Blob?data:new Blob([data],{type}));const a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
function freshAxes(){const axes=defaultAxes();if(view.mode==='kinetic')axes.y.scale='log';return axes;}
function syncAxes(){for(const axis of ['x','y'])for(const key of ['scale','min','max','step'])$(axis+key).value=view.axes[axis][key]??'';for(const k of ['min','max','step'])$('t'+k).value=view.axes.x[k]??'';$('kineticyscale').value=view.axes.y.scale;}
function pick(entryId,pointId,sid=null){view.activeId=entryId;active().pointId=pointId;sampleId=sid;render();}
function draw(){
  vaultUI?.refresh();vaultUI?.changed();
  validationUI?.refresh();
  if($('analysis').hidden){presetManager?.updateCurrent();workspaceUI?.refresh();return;}
  display.edit=false;
  $('overalltrend').checked=!!display.trend;$('displaystrength').value=display.strength;$('displayoverlay').checked=!!display.overlay;
  $('open-editor').disabled=!active()?.measurement.points.find(p=>p.id===active().pointId)?.samples.length;
  $('plotlabel').textContent=view.mode==='kinetic'?'KINETIC RESPONSE':'EQUILIBRIUM ISOTHERM';
  if(view.kineticValue==='pressure'&&display.method==='smooth')display.method='raw';
  $('kineticaxes').hidden=view.mode!=='kinetic';
  $('kineticvalue').value=view.kineticValue??'residual';
  $('displaytools').hidden=view.mode!=='kinetic';
  for(const button of $('displaymethods').children){button.disabled=display.trend||button.dataset.method==='smooth'&&view.kineticValue==='pressure';button.classList.toggle('selected',button.dataset.method===display.method);button.setAttribute('aria-pressed',String(button.dataset.method===display.method));}
  $('displaydescription').textContent=displayMethods[display.method][1]+(display.method==='smooth'?'':' 확대·축 범위에 따라 선택점이 달라집니다.');
  $('displaystrength').disabled=display.method==='raw'&&!display.trend;
  if(display.trend)$('displaydescription').textContent='사용점 + 설정 시간 구간의 Trendline · Normalized response은 (0초, 1)에서 시작';

  const curves=entries.filter(e=>e.visible&&(view.mode==='kinetic'||!e.editVariant)).map(e=>({...curveFor(e.measurement,e.pointId,view.mode,view.unit,e.editVariant?'all':view.branch,view.kineticValue??'residual'),id:e.id,name:e.alias,color:colors[entries.indexOf(e)%colors.length],trendSettings:view.mode==='kinetic'&&e.editVariant?{...e.editVariant.trend,enabled:e.editVariant.trend.enabled&&view.kineticValue!=='pressure',startAtOne:true}:undefined})).map(c=>({...c,data:c.data.map(p=>({...p,excluded:view.mode==='kinetic'&&isSampleExcluded(entries.find(e=>e.id===c.id),p.pointId,p.sampleId)}))}));
  for(const curve of curves){
    const entry=entries.find(e=>e.id===curve.id),variant=entry.editVariant;
    if(view.mode==='kinetic'&&view.kineticValue==='pressure')curve.referenceY=expectedPressure(entry.measurement,entry.pointId,view.unit);
    if(view.mode==='kinetic'&&variant)Object.assign(curve,editCurve(entry,{...variant,selectedTrend:variant.selectedTrend??{enabled:false,sampleIds:[]},excluded:entry.excludedSamples?.[entry.pointId]??[],kineticValue:view.kineticValue??'residual',unit:view.unit}));
  }
  const result=renderPlot($('plot'),curves,view.axes,{entryId:view.activeId,pointId:active()?.pointId,sampleId},
    (h,double)=>{if(double&&view.mode==='isotherm'){view.mode='kinetic';view.axes=freshAxes();}pick(h.c.id,h.p.pointId,h.p.sampleId);},
    range=>{const next=structuredClone(view.axes);for(const a of ['x','y']){next[a].min=range[a][0];next[a].max=range[a][1];}try{validateAxes(next);view.axes=next;syncAxes();draw();}catch(e){message(e.message,true);}},
    h=>{$('hover').textContent=`${h.c.name} / ${h.p.pointId}${h.p.sampleId?' / '+h.p.sampleId:''} · ${h.c.xLabel}: ${h.p.x.toPrecision(7)} · ${h.c.yLabel}: ${h.p.y.toPrecision(7)}`;},view.mode==='kinetic'?{...display,startAtOne:view.kineticValue!=='pressure'}:null);
  $('displaycounts').textContent=(result.counts??[]).map(c=>`${c.name}: ${c.kept} / ${c.total}점 표시${c.end===undefined?'':' · '+Number(c.end.toPrecision(5))+'초까지'}`).join(' · ');
  $('legend').replaceChildren(...curves.map(c=>{const label=`${c.name}${view.mode==='kinetic'?' / '+entries.find(e=>e.id===c.id).pointId:''}`;const s=node('span',undefined,'legend-item');const swatch=node('i',undefined,'swatch');swatch.style.color=c.color;s.append(swatch,node('span',label));s.title=label;return s;}));
  $('plot-notes').replaceChildren();
  if(view.mode==='kinetic')$('plot-notes').append(node('span',`표시: ${display.trend?'원본 + 전체 Trendline':displayMethods[display.method][0]}${display.method==='raw'&&!display.trend?'':' · Smoothing level '+display.strength}`));
  if(view.mode==='isotherm')$('plot-notes').append(node('span','● Adsorption (추정) / ○ Desorption (추정) · 압력 방향으로 자동 구분'));
  if(view.mode==='kinetic'&&view.kineticValue==='pressure'&&curves.some(c=>Number.isFinite(c.referenceY)))$('plot-notes').append(node('span','점선: Estimated P₀ (C₀)'));
  if(view.mode==='kinetic'&&display.trend)$('plot-notes').append(node('span','옅은 점: 원본 · 진한 선: 전체 Trendline (계산값)'));
  if(curves.some(c=>c.trendSettings?.enabled))$('plot-notes').append(node('span','편집 프리셋 Trendline · 저장한 시간·강도 적용'));
  if(curves.some(c=>c.selectedTrendSettings?.enabled))$('plot-notes').append(node('span','점선: 선택한 점의 Trendline · 저장한 유효 기준점으로 계산'));
  if(curves.some(c=>c.selectedTrendSettings?.toEquilibrium))$('plot-notes').append(node('span','Trendline 연장 (for equilibrium): 마지막 기록시간까지 표시용 외삽 · Ce 기준'));
  for(const c of curves.filter(c=>c.preprocessing?.enabled))$('plot-notes').append(node('span',`${c.name}: Preprocessing · 자동 제외 ${c.preprocessing.removed}점 · 시간 −${c.preprocessing.shift}초`));
  for(const warning of result.trendWarnings??[])$('plot-notes').append(node('span',warning));
  const invalid=curves.reduce((n,c)=>n+(c.invalid||0),0);if(invalid)$('plot-notes').append(node('span',`Normalized response 계산 불가: ${invalid}점 (초기·평형값 차이 확인)`));
  if(result.hidden)$('plot-notes').append(node('span',`로그축: 0 이하 ${result.hidden}점 표시 제외 (원본 유지)`));
  presetManager?.updateCurrent();
  workspaceUI?.refresh();
}
function render(){
  prepareEntryLabels(entries);
  document.body.classList.toggle('has-data',entries.length>0);
  $('filesempty').hidden=entries.length>0;
  $('plotempty').hidden=entries.length>0;
  $('conditionsempty').hidden=!!active();
  $('branch').value=view.branch;
  for(const e of entries){if(e.editVariant)continue;const ps=pointsFor(e.measurement,view.branch);if(ps.length&&!ps.some(p=>p.id===e.pointId))e.pointId=ps[0].id;}
  $('count').textContent=entries.length; $('unit').value=view.unit;syncAxes();
  $('isotherm').classList.toggle('selected',view.mode==='isotherm');$('kinetic').classList.toggle('selected',view.mode==='kinetic');
  $('isotherm').setAttribute('aria-pressed',String(view.mode==='isotherm'));$('kinetic').setAttribute('aria-pressed',String(view.mode==='kinetic'));
  $('entries').replaceChildren(...entries.map((e,i)=>{
    const card=node('div',undefined,'entry'+(e.id===view.activeId?' active':''));card.style.setProperty('--color',colors[i%colors.length]);card.dataset.entryId=e.id;
    const top=node('div',undefined,'entry-top');top.append(node('span',dataNumberLabel(e),'entry-index'));if(e.editVariant)top.append(node('span','편집본'));if(e.id===view.activeId)top.append(node('span','선택됨','entry-state'));card.append(top);
    const line=node('div',undefined,'entryline'),check=node('input');check.type='checkbox';check.checked=e.visible;check.setAttribute('aria-label',`${dataNumberLabel(e)} 비교에 표시`);check.onchange=()=>{e.visible=check.checked;card.classList.toggle('comparison-checked',e.visible);draw();};
    card.classList.toggle('comparison-checked',e.visible);card.tabIndex=0;card.setAttribute('aria-label',`${dataNumberLabel(e)} 측정파일 · Enter 또는 Space로 비교 선택 전환`);
    card.onkeydown=event=>{if(event.target===card&&['Enter',' '].includes(event.key)){event.preventDefault();check.click();}};
    const alias=node('input');alias.type='text';alias.maxLength=100;alias.value=e.labelMode==='custom'?e.alias:'';alias.placeholder='이름 지정 (선택)';alias.title=`${dataNumberLabel(e)} · 이름을 비우면 번호로 표시`;alias.setAttribute('aria-label',`${dataNumberLabel(e)} 표시 이름`);
    const syncName=()=>{setEntryLabel(e,alias.value);if(e===active()){const label=$('metadata').querySelector('[data-display-name]');if(label)label.textContent=e.alias;}renderTable();draw();};
    alias.oninput=syncName;alias.onchange=syncName;
    const select=node('button','선택');select.onclick=()=>{view.activeId=e.id;if(e.editVariant)view.mode='kinetic';sampleId=null;render();};line.append(check,alias,select);
    const drop=node('select');drop.setAttribute('aria-label',`${e.name} 구간`);for(const p of pointsFor(e.measurement,view.branch)){const o=node('option',`${p.index} · ${branchLabels[p.branch]} · ${(p.equilibrium.pressure*pressureFactor(view.unit)).toFixed(3)} ${view.unit}${p.samples.length?'':' · 시간 없음'}`);o.value=p.id;drop.append(o);}drop.value=e.pointId;drop.onchange=()=>pick(e.id,drop.value);
    if(e.editVariant){drop.replaceChildren(node('option',`${e.pointId} · 편집 구간 고정`));drop.disabled=true;}
    const filename=node('span',e.name,'filename');filename.title=e.name;filename.hidden=true;
    const meta=node('div',undefined,'entry-meta');for(const text of [e.measurement.metadata.gas,`${e.measurement.metadata.temperature_K} K`,e.measurement.metadata.date])meta.append(node('span',text));
    card.append(line,filename,meta,drop);return card;
  }));
  const e=active();$('metadata').replaceChildren();$('diagnostics').replaceChildren();
  if(e){const m=e.measurement.metadata;for(const [k,v] of Object.entries({'번호':dataNumberLabel(e),'표시 이름':e.alias,'원본 파일':e.name,'기체':m.gas,'온도':`${m.temperature_K} K`,'질량':`${m.mass_g} g (파일값)`,'장비':m.serial,'버전':m.version,'측정일':`${m.date} ${m.time}`,'Vs':`${m.manifold_cm3} cm³`,'Vd':`${m.freeSpace_cm3} cm³`,'주석':m.comments.filter(Boolean).join(' / ')})){const detail=node('dd',v);if(k==='표시 이름')detail.dataset.displayName='';$('metadata').append(node('dt',k),detail);}
    $('diagnostics').append(node('p',`${e.measurement.points.length}개 평형점 · EQT/P0 해석은 규격 문서 참조`),...e.measurement.diagnostics.map(d=>node('p',`${d.pointId??''} ${d.line}행: ${d.message}`)));
  }
  renderTable();draw();
}
function kineticTableRows(e,p,unit){
  const f=pressureFactor(unit);
  const samples=e.editVariant?editSamples(e,e.editVariant):(p?.samples??[]);
  return samples.map(s=>({id:s.id,values:[s.id,s.values[0],...s.values.slice(1,6).map(v=>v*f),s.values[6],isSampleExcluded(e,e.pointId,s.id)?'제외됨':'사용']}));
}
function renderTable(){
  const e=active();$('thead').replaceChildren();$('tbody').replaceChildren();$('selection').textContent=e?`${e.alias} / ${e.pointId}`:'';
  const kinetic=view.mode==='kinetic';$('tabletitle').textContent=kinetic?'시간별 데이터':'평형점';
  if(kinetic&&e?.editVariant?.preprocess)$('selection').textContent+=` · Preprocessing 시간 (−${preprocessingInfo(e,e.editVariant).shift}초) · CSV는 원본 전체 데이터`;
  const columns=visibleTableColumns(view.kineticTable??readTableColumns());
  $('table-options-open').hidden=!kinetic;$('table-options-open').textContent=`표시 설정 · ${columns.length}열`;
  const labels=kinetic?columns.map(c=>c.label(view.unit)):['구간','분류 (압력 방향 추정)',`Pressure (${view.unit})`,'Uptake (cm³ STP/g)','시간행 수','시간곡선'];
  const tr=node('tr');labels.forEach(l=>tr.append(node('th',l)));$('thead').append(tr);if(!e)return;
  const ps=pointsFor(e.measurement,e.editVariant?'all':view.branch),p=ps.find(p=>p.id===e.pointId),f=pressureFactor(view.unit);
  const rows=kinetic?kineticTableRows(e,p,view.unit).filter(r=>!e.editVariant||inTimeRange(r.values[1],e.editVariant.trend)):ps.map(p=>({id:p.id,values:[p.index,branchLabels[p.branch],p.equilibrium.pressure*f,p.equilibrium.uptake,p.samples.length]}));
  if(!rows.length){const r=node('tr'),td=node('td',kinetic&&p?.samples.length?'Preprocessing 또는 시간 범위 적용 후 표시할 점이 없습니다. 원본 CSV는 내보낼 수 있습니다.':ps.length?'이 구간은 평형값만 있습니다. 시간곡선과 시간 CSV를 만들 수 없습니다.':'선택한 분류에 해당하는 구간이 없습니다.');td.colSpan=labels.length;r.append(td);$('tbody').append(r);}
  for(const row of rows){
    const r=node('tr');r.dataset.id=row.id;r.classList.toggle('active',row.id===(kinetic?sampleId:e.pointId));
    (kinetic?columns.map(c=>row.values[c.index]):row.values).forEach(v=>r.append(node('td',tableCellText(v))));
    r.onclick=()=>{if(kinetic){sampleId=row.id;renderTable();draw();}else pick(e.id,row.id);};
    if(kinetic){
      const excluded=isSampleExcluded(e,e.pointId,row.id);
      r.classList.toggle('excluded',excluded);
    }
    if(!kinetic){
      const point=ps.find(p=>p.id===row.id),cell=node('td');
      const button=node('button',point.samples.length?'Kinetics 보기':'시간 데이터 없음');
      button.disabled=!point.samples.length;
      button.setAttribute('aria-label',`${point.index}번 평형점 Kinetics 보기`);
      button.title=point.samples.length?'이 평형점의 시간별 압력 곡선으로 이동':'이 평형점에는 시간별 측정 데이터가 없습니다.';
      button.onclick=ev=>{ev.stopPropagation();view.mode='kinetic';view.axes=freshAxes();pick(e.id,row.id);$('plot').scrollIntoView({block:'center'});};
      cell.append(button);r.append(cell);
    }
    $('tbody').append(r);
  }
}
async function loadFiles(files){let ok=0;const errors=[];for(const file of files){try{const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());const e=await createEntry(file.name,text);if(currentVault())e.vaultPath=await vaultCall('import_file',vaultUI.folder(),e);entries.push(e);view.activeId=e.id;ok++;}catch(e){errors.push(`${file.name}: ${e.message}${e.line?` (${e.line}행)`:''}`);}}view.axes=freshAxes();render();message(`${ok}개 파일 읽기 완료${errors.length?' / '+errors.join(' / '):''}`,!!errors.length);}
const tableOptions=mountTableOptions({
  getCurrent:()=>{const e=active(),p=e?.measurement.points.find(p=>p.id===e.pointId);return {columns:view.kineticTable??readTableColumns(),unit:view.unit,rows:e?kineticTableRows(e,p,view.unit).map(r=>r.values):[]};},
  onApply:(columns,persisted)=>{view.kineticTable=columns;renderTable();presetManager?.updateCurrent();message(persisted?'시간별 데이터의 열 표시와 순서를 저장했습니다.':'열 표시를 적용했습니다. 환경 저장이 불가능해 다음 실행에는 유지되지 않습니다.',!persisted);},
});
$('table-options-open').onclick=tableOptions.open;
$('files').onchange=guard(async e=>{await loadFiles([...e.target.files]);e.target.value='';});
for(const mode of ['isotherm','kinetic'])$(mode).onclick=guard(()=>{view.mode=mode;if(mode==='isotherm'&&active()?.editVariant)view.activeId=entries.find(e=>!e.editVariant)?.id??null;view.axes=freshAxes();sampleId=null;render();});
$('apply').onclick=guard(()=>{const axes=defaultAxes();for(const a of ['x','y']){axes[a].scale=$(a+'scale').value;for(const k of ['min','max','step'])axes[a][k]=$(a+k).value===''?null:Number($(a+k).value);}validateAxes(axes);const previous=view.axes;view.axes=axes;try{draw();message('축 설정을 적용했습니다.');}catch(e){view.axes=previous;throw e;}});
$('branch').onchange=guard(()=>{view.branch=$('branch').value;view.axes=freshAxes();sampleId=null;render();message('압력 증가/감소에 따른 추정 분류입니다. 원본 점은 모두 보존됩니다.');});
$('timeapply').onclick=guard(()=>{
  const next=structuredClone(view.axes);next.x.scale='linear';
  for(const key of ['min','max','step'])next.x[key]=$('t'+key).value===''?null:Number($('t'+key).value);
  next.y.scale=$('kineticyscale').value;
  if(next.y.scale==='log'&&[next.y.min,next.y.max].some(v=>v!==null&&v<=0)){next.y.min=null;next.y.max=null;}
  validateAxes(next);const previous=view.axes;view.axes=next;
  try{draw();syncAxes();}catch(e){view.axes=previous;throw e;}
});
$('kineticvalue').onchange=guard(()=>{
  view.kineticValue=$('kineticvalue').value;
  view.axes.y.min=null;view.axes.y.max=null;view.axes.y.step=null;
  sampleId=null;syncAxes();draw();
});
$('kineticyscale').onchange=()=>$('timeapply').click();
$('reset').onclick=guard(()=>{view.axes=freshAxes();syncAxes();draw();});
$('unit').onchange=guard(()=>{const next=$('unit').value,ratio=pressureFactor(next)/pressureFactor(view.unit),a=view.mode==='isotherm'?'x':'y';if(view.mode==='isotherm'||view.kineticValue==='pressure'){for(const k of ['min','max'])if(view.axes[a][k]!==null)view.axes[a][k]*=ratio;if(view.axes[a].step!==null&&view.axes[a].scale==='linear')view.axes[a].step*=ratio;}view.unit=next;render();});
$('save').onclick=guard(()=>{view.display={...display};download(saveWorkspace(entries,view),'rat-workspace.json','application/json');message('작업 파일 저장을 요청했습니다. 원본 텍스트도 포함되어 다른 PC에서 복원할 수 있습니다.');});
function applyScreen(restored){
  if(currentVault()){
    const old=entries;
    const incoming=restored.entries.map(entry=>({...entry,vaultPath:old.find(e=>e.id===entry.id||e.hash===entry.hash)?.vaultPath}));
    entries=[...old.filter(e=>!incoming.some(n=>n.id===e.id)).map(e=>({...e,visible:false})),...incoming];
  }else entries=restored.entries;
  view=restored.view;
  Object.assign(display,{method:'raw',strength:2,overlay:false,trend:false,edit:false},view.display??{});
  display.edit=false;
  if(!displayMethods[display.method])display.method='raw';
  display.strength=Math.max(1,Math.min(5,Number(display.strength)||2));
  $('displaystrength').value=display.strength;$('displayoverlay').checked=!!display.overlay;$('overalltrend').checked=!!display.trend;
  sampleId=restored.ui?.sampleId??null;
  if(restored.ui){
    document.querySelector('main').classList.toggle('graphwide',restored.ui.expanded);
    $('expandplot').textContent=restored.ui.expanded?'기본 크기로':'그래프 크게 보기';
    $('expandplot').setAttribute('aria-pressed',String(restored.ui.expanded));
    $('displaytools').open=restored.ui.displayOpen;document.querySelector('.conditions').open=restored.ui.conditionsOpen;
  }
  render();
  workspaceUI?.show('analysis');
}
$('restore').onchange=guard(async ev=>{const file=ev.target.files[0];if(!file)return;applyScreen(await restoreWorkspace(await file.text()));message(`${entries.length}개 파일의 작업 상태를 복원했습니다.`);ev.target.value='';});
$('csv').onclick=guard(()=>{const e=active();if(!e)throw new Error('파일을 선택하세요.');const branch=e.editVariant?'all':view.branch;if(view.mode==='kinetic'&&!pointsFor(e.measurement,branch).find(p=>p.id===e.pointId)?.samples.length)throw new Error('이 구간에는 시간 데이터가 없습니다.');download(csvExport(e.measurement,e.pointId,view.mode,view.unit,branch),`${e.alias}-${view.mode}.csv`,'text/csv;charset=utf-8');});
function svgText(){
  const svg=$('plot').querySelector('svg').cloneNode(true);
  appendGraphFooter(svg,[...$('legend').children].map(e=>({text:e.textContent,color:e.querySelector('.swatch')?.style.color})),[...$('plot-notes').children].map(e=>e.textContent));
  return new XMLSerializer().serializeToString(svg);
}
window.addEventListener('adsorption:graph-appearance',()=>draw());
$('svg').onclick=guard(()=>download(svgText(),'rat-graph.svg','image/svg+xml'));
$('png').onclick=guard(async()=>{const url=URL.createObjectURL(new Blob([svgText()],{type:'image/svg+xml'}));try{const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=img.width*2;c.height=img.height*2;c.getContext('2d').drawImage(img,0,0,c.width,c.height);const b=await new Promise(r=>c.toBlob(r));if(!b)throw new Error('이미지 저장 실패');download(b,'rat-graph.png');}finally{URL.revokeObjectURL(url);}});
$('expandplot').onclick=()=>{
  const expanded=document.querySelector('main').classList.toggle('graphwide');
  $('expandplot').textContent=expanded?'기본 크기로':'그래프 크게 보기';
  $('expandplot').setAttribute('aria-pressed',String(expanded));
  draw();
};
$('pdf').onclick=()=>window.print();
for(const [method,[label]] of Object.entries(displayMethods)){
  const button=node('button',label);button.dataset.method=method;
  button.onclick=guard(()=>{display.method=method;draw();});$('displaymethods').append(button);
}
$('displaystrength').onchange=guard(()=>{display.strength=Number($('displaystrength').value);draw();});
$('overalltrend').onchange=guard(()=>{display.trend=$('overalltrend').checked;draw();});
$('displayoverlay').onchange=guard(()=>{display.overlay=$('displayoverlay').checked;draw();});
const curveEditor=mountCurveEditor({
  onLibraryOpen:()=>workspaceUI?.show('edits',false),
  onLibraryClose:()=>workspaceUI?.show('analysis'),
  getCurrent:()=>({entry:active(),view:{...view,display:{...display}}}),
  onMessage:message,
  onApply:restored=>{
    const edited=restored.entries[0];
    // Every application is a snapshot; updating a saved edit never mutates an open comparison.
    edited.id=crypto.randomUUID();
    if(!entries.some(e=>e.hash===edited.hash&&!e.editVariant)){
      const original={...edited,id:crypto.randomUUID(),alias:edited.name.replace(/\.rat$/i,''),labelMode:'number',visible:false};delete original.editVariant;delete original.excludedSamples;entries.push(original);
    }
    if(active()?.hash===edited.hash)active().visible=false;
    entries.push(edited);view={...restored.view,activeId:edited.id};
    Object.assign(display,{method:'raw',strength:2,overlay:false,trend:false,edit:false});sampleId=null;render();workspaceUI?.show('analysis');
  },
});
$('open-editor').onclick=curveEditor.openCurrent;$('open-edits').onclick=curveEditor.showLibrary;
presetManager=mountPresetManager({
  onNavigate:page=>workspaceUI?.show(page,false),
  getCurrent:()=>({entries,view:{...view,display:{...display}},ui:{sampleId,expanded:document.querySelector('main').classList.contains('graphwide'),displayOpen:$('displaytools').open,conditionsOpen:document.querySelector('.conditions').open}}),
  applyCurrent:applyScreen,onMessage:message,
});
for(const detail of [$('displaytools'),document.querySelector('.conditions')])detail.addEventListener('toggle',()=>presetManager.updateCurrent());
workspaceUI=mountWorkspaceShell({getCurrent:()=>({entries,view}),onPick:pick,onPage:page=>{if(page==='presets')presetManager.open();else if(page==='edits')curveEditor.showLibrary();else if(page==='analysis')draw();}});
validationUI=mountIsothermValidation({getCurrent:()=>({entries,view})});
if(currentVault()?.workspace){
  const restored=await restoreWorkspace(JSON.stringify(currentVault().workspace));
  entries=restored.entries;view=restored.view;Object.assign(display,view.display??{});display.edit=false;
  $('displaystrength').value=display.strength;$('displayoverlay').checked=!!display.overlay;$('overalltrend').checked=!!display.trend;
}
render();
vaultUI=mountVaultBrowser({getCurrent:()=>({entries,view:{...view,display:{...display}}}),onMessage:message,onSelect:e=>pick(e.id,e.pointId)});
window.dispatchEvent(new Event('adsorption:ready'));
document.documentElement.dataset.appReady='true';

new ResizeObserver(guard(draw)).observe($('plot'));
