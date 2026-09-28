import {preferenceStorage} from '../storage/vault-store.js';
import {parseReference,compareReference,validateReferenceSets} from '../core/isotherm-validation.js';
import {curveFor,defaultAxes,pressureFactor} from '../services/measurements.js';
import {renderPlot} from './plot.js';

export function mountIsothermValidation({getCurrent,onChange}){
  const host=document.createElement('details');host.className='validation-panel';host.hidden=true;
  host.innerHTML=`<summary><span><small>REFERENCE CHECK</small><strong>Adsorption Isotherm Validation</strong></span><span>기준 세트 · X / Y 비교</span></summary>
  <div class="validation-body"><div class="validation-toolbar"><label>저장한 기준 세트<select data-id="sets"><option value="">새 세트</option></select></label><button data-id="new">새 세트</button><label>비교할 측정파일<select data-id="target"></select></label></div>
  <div class="validation-columns"><div class="validation-input"><label>세트 이름<input data-id="name" maxlength="80" placeholder="예: 문헌 4A · N₂ · 298 K"></label><div class="validation-toolbar"><label>기준 X 단위<select data-id="unit"><option>kPa</option><option>Pa</option><option>Torr</option></select></label><label>Branch<select data-id="branch"><option value="adsorption">Adsorption</option><option value="desorption">Desorption</option></select></label></div>
  <label>X: 압력 / Y: Uptake (cm³ STP/g)<textarea data-id="xy" rows="8" spellcheck="false" placeholder="10&#9;12.5&#10;20&#9;18.2&#10;30&#9;22.1"></textarea></label><p class="hint">Excel의 두 열을 머리글 없이 붙여넣으세요. 탭·쉼표·공백 구분을 지원합니다.</p><div class="validation-toolbar"><button data-id="apply" class="primary">비교하기</button><button data-id="save">세트 저장</button><label class="validation-show"><input data-id="show" type="checkbox" role="switch" checked> Reference data 표시</label></div><p data-id="status" role="status"></p></div>
  <div class="validation-results"><div data-id="plot" class="validation-plot"></div><div data-id="legend" class="graph-legend"></div><p data-id="metrics"></p><div class="validation-table"><table><thead><tr><th data-id="xhead">X</th><th>기준 Y</th><th>측정곡선 Y¹</th><th>차이</th><th>상대오차 (%)</th></tr></thead><tbody data-id="rows"></tbody></table></div></div></div>
  <p class="hint">¹ 기준 압력에서 인접 측정점 사이를 선형 보간합니다. 차이 = 측정 − 기준. 기준 Y가 0이면 상대오차는 계산하지 않습니다. 범위 밖은 외삽하지 않습니다. 온도·기체·흡착량 단위가 같은 자료인지 확인하세요. 세트는 이 앱에 별도 저장되며 작업 JSON에는 포함되지 않습니다.</p></div>`;
  document.querySelector('#analysis .data-panel').before(host);
  const $=id=>host.querySelector(`[data-id="${id}"]`),key='adsorption.isothermValidation';
  let sets=[],applied=null,currentId='',readError='';
  try{sets=validateReferenceSets(JSON.parse(preferenceStorage.getItem(key)||'[]'));}catch(e){readError=e.message;}
  const text=(tag,value)=>{const n=document.createElement(tag);n.textContent=value;return n;};
  const fmt=n=>n==null?'—':Number(n.toPrecision(6)).toString();
  function status(s){$('status').textContent=s;}
  function list(){ $('sets').replaceChildren(new Option('새 세트',''),...sets.map(s=>new Option(s.name,s.id)));$('sets').value=currentId; }
  function apply(){applied={name:$('name').value.trim()||'기준 데이터',branch:$('branch').value,data:parseReference($('xy').value,$('unit').value)};refresh();status(`${applied.data.length}개 기준점을 비교합니다. 저장하려면 ‘세트 저장’을 누르세요.`);}
  function run(fn){return ()=>{try{fn();}catch(e){status(e.message);}};}
  $('apply').onclick=run(apply);
  $('save').onclick=run(()=>{
    if(readError)throw new Error('기존 저장 데이터를 읽지 못해 덮어쓰지 않았습니다. '+readError);
    if(!$('name').value.trim())throw new Error('세트 이름을 입력하세요.');
    apply();const id=currentId||crypto.randomUUID(),next={...applied,id};
    const updated=sets.some(s=>s.id===id)?sets.map(s=>s.id===id?next:s):[...sets,next];
    validateReferenceSets(updated);preferenceStorage.setItem(key,JSON.stringify(updated));sets=updated;currentId=id;list();status('기준 세트를 저장했습니다. 다음 실행에도 불러올 수 있습니다.');
  });
  $('new').onclick=()=>{currentId='';applied=null;$('name').value='';$('xy').value='';list();refresh();status('새 기준 세트를 입력하세요.');};
  $('sets').onchange=()=>{currentId=$('sets').value;const s=sets.find(s=>s.id===currentId);applied=s?structuredClone(s):null;$('name').value=s?.name??'';$('branch').value=s?.branch??'adsorption';$('unit').value='kPa';$('xy').value=s?s.data.map(p=>`${p.x}\t${p.y}`).join('\n'):'';refresh();status(s?'저장한 기준 세트를 불러왔습니다.':'새 기준 세트를 입력하세요.');};
  for(const id of ['xy','name','unit','branch'])$(id).addEventListener('input',()=>{applied=null;refresh();status('입력이 변경되었습니다. 비교하기를 누르세요.');});
  $('target').onchange=refresh;$('show').onchange=refresh;
  function refresh(){
    const {entries,view}=getCurrent();host.hidden=view.mode!=='isotherm';if(host.hidden)return;
    const prev=$('target').value,available=entries.filter(e=>!e.editVariant);
    $('target').replaceChildren(new Option('측정파일 선택',''),...available.map(e=>new Option(e.alias,e.id)));$('target').value=available.some(e=>e.id===prev)?prev:available.find(e=>e.id===view.activeId)?.id??available[0]?.id??'';
    if(!host.open)return;
    const entry=available.find(e=>e.id===$('target').value);$('plot').replaceChildren();$('rows').replaceChildren();$('legend').replaceChildren();$('metrics').textContent='기준 데이터를 입력하고 비교하기를 누르세요.';
    if(!entry){$('metrics').textContent='데이터 관리에서 비교할 측정파일을 불러오세요.';return;}
    if(!applied)return;
    const measured=curveFor(entry.measurement,entry.pointId,'isotherm','kPa',applied.branch),comparison=compareReference(applied.data,measured.data),factor=pressureFactor(view.unit);
    const curves=[{...measured,id:entry.id,name:entry.alias,color:'#3560c8',xLabel:`Pressure (${view.unit})`,data:measured.data.map(p=>({...p,x:p.x*factor}))}];
    if($('show').checked)curves.push({...curves[0],id:'validation-reference',name:applied.name,color:'#cb7040',pointsOnly:true,data:applied.data.map(p=>({...p,x:p.x*factor}))});
    renderPlot($('plot'),curves,defaultAxes(),{},()=>{},()=>{},()=>{});
    for(const c of curves){const label=text('span',c.name),mark=document.createElement('i');mark.className='swatch';mark.style.color=c.color;label.prepend(mark);$('legend').append(label);}
    $('xhead').textContent=`X (${view.unit})`;$('metrics').textContent=`${comparison.count} / ${comparison.rows.length}점 비교 가능 · RMSE ${fmt(comparison.rmse)} cm³ STP/g`;
    for(const row of comparison.rows){const tr=document.createElement('tr');for(const value of [fmt(row.x*factor),fmt(row.y),row.measured===null?row.status:fmt(row.measured),fmt(row.error),fmt(row.relative)])tr.append(text('td',value));$('rows').append(tr);}
  }
  host.addEventListener('toggle',refresh);window.addEventListener('adsorption:graph-appearance',refresh);
  new ResizeObserver(()=>{if(host.open&&!host.hidden)refresh();}).observe($('plot'));
  list();if(readError)status(readError);return {refresh};
}
