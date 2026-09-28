import {emptyFittingLibrary,validateFittingLibrary,newFittingSet,pressureText,itemPressure,conditionMatrix,fittingCandidates,addCandidates} from '../core/fitting-sets.js';
import {PresetStore} from '../storage/preset-store.js';
import {renderPlot,colors} from './plot.js';
import {defaultAxes} from '../core/workspace.js';
import {mountFittingRunner} from './fitting-runner.js';
import {earlyRange} from '../core/early-range.js';
import {mountEarlyRange} from './early-range.js';

const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,fn,cls)=>{const n=el('button',text,cls);n.type='button';n.onclick=fn;return n;};
const tempText=t=>Number.isFinite(t)?`${t} K`:'온도 미확인';

export function mountFittingSets(host,getCurrent) {
  const store=new PresetStore(),sources=new Map();
  let library=emptyFittingLibrary(),activeId=null,dirty=false,ready=false,busy=false,focusId=null,undoRemoval=null,runner=null;
  const current=()=>library.sets.find(s=>s.id===activeId);
  host.innerHTML=`<div class="workspace-page-intro"><div><span class="page-eyebrow">KINETIC · FITTING SETS</span><h2>Fitting 세트</h2><p>함께 비교할 곡선을 모으고, 온도와 압력별 조건을 확인하세요.</p></div><button id="fit-new">＋ 새 세트</button></div>
    <div class="fit-toolbar"><label>세트<select id="fit-set" aria-label="Fitting 세트 선택"></select></label><span id="fit-status" role="status">저장한 세트를 불러오는 중…</span><button id="fit-undo" hidden>제거 취소</button><button id="fit-delete" class="quiet" hidden>세트 제거</button><button id="fit-save" class="primary">세트 저장</button></div>
    <div id="fit-empty" class="fit-empty"><span class="page-eyebrow">START WITH YOUR DATA</span><h3>비교할 조건을 한곳에</h3><p>새 세트를 만든 뒤 불러온 측정파일에서 Kinetics 구간을 추가하세요.<br>온도 × 압력 표가 자동으로 만들어집니다.</p><button id="fit-start" class="primary">첫 세트 만들기</button></div>
    <div id="fit-body" hidden><div class="fit-config"><label class="fit-name-label">세트 이름<input id="fit-name" maxlength="100" placeholder="예: 4A · N₂ 압력별 비교"></label><label>압력 기준<select id="fit-basis"><option value="peq">Equilibrium pressure P_eq</option><option value="p0">Estimated pressure P₀</option></select></label><label>압력 묶음 간격<select id="fit-step"><option value="5">5 kPa</option><option value="10">10 kPa</option><option value="20">20 kPa</option><option value="50">50 kPa</option></select></label><button id="fit-add" class="primary">＋ 데이터 추가</button></div>
    <div class="fit-matrix-panel"><div class="fit-section-heading"><div><span class="page-eyebrow">CONDITION MAP</span><h3>온도 · 압력 조건표</h3></div><span id="fit-count"></span></div><p id="fit-group-note" class="fit-note"></p><div id="fit-matrix" class="fit-matrix-scroll"></div><div id="fit-warning" class="fit-note"></div></div>
    <div class="fit-preview-panel"><div class="fit-section-heading"><div><span class="page-eyebrow">KINETIC RESPONSE</span><h3 id="fit-preview-title">사용 데이터 미리보기</h3></div><button id="fit-all">사용 데이터 전체 보기</button></div><div id="fit-detail"></div><div id="fit-preview" aria-label="Fitting 세트 Kinetics 미리보기"></div><div id="fit-legend" class="fit-legend"></div></div>
    <p class="fit-note fit-footer">세트에는 추가 시점의 곡선과 편집 조건을 저장합니다. 같은 흡착제의 데이터인지 확인하세요. 세트 저장은 계산 설정·결과를 이 환경에 보관하며 ‘작업 저장’ 파일에는 포함되지 않습니다.</p></div>`;
  const $=id=>host.querySelector('#'+id);
  const say=(text,error=false)=>{$('fit-status').textContent=text;$('fit-status').classList.toggle('error',error);};
  const changed=(keepRemoval=false)=>{if(!keepRemoval)undoRemoval=null;dirty=true;say('저장하지 않은 변경');$('fit-save').disabled=busy||!ready;$('fit-undo').hidden=!undoRemoval;};
  function newSet(){if(!ready||busy)return;const set=newFittingSet(`Fitting 세트 ${library.sets.length+1}`);library.sets.push(set);activeId=set.id;focusId=null;changed();render();$('fit-name').focus();$('fit-name').select();}
  $('fit-new').onclick=newSet;$('fit-start').onclick=newSet;
  $('fit-set').onchange=()=>{activeId=$('fit-set').value;focusId=null;render();};
  $('fit-name').oninput=()=>{current().name=$('fit-name').value;changed();const option=$('fit-set').selectedOptions[0];if(option)option.textContent=current().name||'이름 없는 세트';};
  for(const key of ['basis','step'])$('fit-'+key).onchange=()=>{current()[key]=key==='step'?Number($('fit-step').value):$('fit-basis').value;changed();render();};
  $('fit-all').onclick=()=>{focusId=null;render();};
  const rememberRemoval=()=>{undoRemoval={sets:structuredClone(library.sets),activeId};};
  $('fit-delete').onclick=()=>{if(busy||!current())return;rememberRemoval();library.sets=library.sets.filter(s=>s.id!==activeId);activeId=library.sets[0]?.id??null;focusId=null;changed(true);render();say('세트를 제거했습니다. 제거 취소로 복원할 수 있습니다.');};
  $('fit-undo').onclick=()=>{if(!undoRemoval||busy)return;library.sets=undoRemoval.sets;activeId=undoRemoval.activeId;undoRemoval=null;focusId=null;changed();render();};
  $('fit-save').onclick=async()=>{
    if(!dirty||busy)return;
    if(library.sets.some(s=>!s.name.trim())){say('모든 세트에 이름을 입력하세요.',true);return;}
    busy=true;render();say('저장 중…');
    try {library=await store.saveState('fitting-sets',library,[...sources.values()],validateFittingLibrary);sources.clear();dirty=false;say('세트를 저장했습니다. 다음 실행에도 유지됩니다.');}
    catch(error){say(error.message,true);}finally{busy=false;render();}
  };
  window.addEventListener('beforeunload',event=>{if(!window.adsorptionClosingApproved&&(dirty||runner?.running)){event.preventDefault();event.returnValue='';}});

  function render(){
    const set=current();$('fit-new').disabled=!ready||busy;$('fit-start').disabled=!ready||busy;$('fit-save').disabled=!ready||busy||!dirty;
    $('fit-delete').hidden=!set;$('fit-delete').disabled=busy;$('fit-undo').hidden=!undoRemoval;$('fit-undo').disabled=busy;
    $('fit-set').replaceChildren(...library.sets.map(s=>{const option=el('option',s.name||'이름 없는 세트');option.value=s.id;return option;}));$('fit-set').value=activeId??'';$('fit-set').disabled=busy||!library.sets.length;
    $('fit-empty').hidden=!!set;$('fit-body').hidden=!set;if(!set)return;
    for(const key of ['name','basis','step']){$('fit-'+key).value=set[key];$('fit-'+key).disabled=busy;}$('fit-add').disabled=busy;
    const used=set.items.filter(item=>item.included);
    $('fit-count').textContent=`${used.length} / ${set.items.length}개 사용${set.items[0]?' · '+set.items[0].gas:''}`;
    $('fit-group-note').textContent=`${set.basis==='peq'?'Equilibrium pressure P_eq':'Estimated pressure P₀'} 기준 · ${set.step} kPa 간격의 가장 가까운 대표값으로 묶습니다. 괄호는 실제 압력(kPa, 소수 최대 2자리)이며 원본 정밀도는 유지됩니다.`;
    const matrix=$('fit-matrix');matrix.replaceChildren();
    if(!set.items.length){const empty=el('div',undefined,'fit-table-empty');empty.append(el('h3','아직 추가한 Kinetics 데이터가 없습니다.'),el('p','파일과 구간을 선택하면 조건표가 여기에 표시됩니다.'),button('＋ 데이터 추가',openPicker));matrix.append(empty);}
    else {
      const grid=conditionMatrix(set),table=el('table',undefined,'fit-matrix'),head=el('thead'),tr=el('tr');tr.append(el('th','온도 / 압력'));
      for(const pressure of grid.pressures)tr.append(el('th',pressure===null?'압력 미확인':`약 ${pressure} kPa`));head.append(tr);table.append(head);
      const tbody=el('tbody');
      for(const row of grid.rows){const tr=el('tr'),th=el('th',tempText(row.temperature));th.scope='row';tr.append(th);
        for(const cell of row.cells){const td=el('td');if(!cell.items.length)td.append(el('span','—','fit-gap'));
          for(const item of cell.items){const card=el('div',undefined,'fit-item'+(!item.included?' is-excluded':'')+(focusId===item.id?' is-focused':''));
            const check=el('input');check.type='checkbox';check.checked=item.included;check.disabled=busy;check.setAttribute('aria-label',`${item.label} ${item.pointId} Fitting에 사용`);check.onchange=()=>{item.included=check.checked;changed();render();};
            const pick=button('',()=>{focusId=item.id;render();},'fit-item-pick');pick.setAttribute('aria-pressed',String(focusId===item.id));pick.append(el('strong',`${item.label} · ${item.pointId}`),el('span',`(${pressureText(itemPressure(item,set.basis))} kPa)`),el('small',`${item.edited?'편집 적용':'원본'} · ${item.data.length}점${item.branch==='desorption'?' · Desorption (추정)':''}`));
            card.append(check,pick);td.append(card);
          }tr.append(td);
        }tbody.append(tr);
      }table.append(tbody);matrix.append(table);
    }
    const warnings=[];
    if(set.items.some(item=>item.temperature===null||itemPressure(item,set.basis)===null))warnings.push('조건이 미확인인 데이터가 있습니다.');
    if(set.items.some(item=>item.branch==='desorption'))warnings.push('Desorption (추정) 구간이 포함되어 있습니다. 흡착 데이터와의 구성을 확인하세요.');
    if(set.items.length&&!used.length)warnings.push('사용할 데이터에 체크하세요.');
    $('fit-warning').textContent=warnings.join(' ');runner?.refresh();renderPreview();
  }
  function renderPreview(){
    const set=current();if(!set||host.hidden)return;
    const focus=set.items.find(item=>item.id===focusId),items=focus?[focus]:set.items.filter(item=>item.included);
    $('fit-preview-title').textContent=focus?`${focus.label} · ${focus.pointId}`:'사용 데이터 미리보기';
    const detail=$('fit-detail');detail.replaceChildren();
    if(focus){detail.append(el('p',`${tempText(focus.temperature)} · Estimated P₀ ${pressureText(focus.p0)} kPa → Equilibrium pressure ${pressureText(focus.peq)} kPa · ${focus.data.length}/${focus.originalCount}점${focus.included?'':' · Fitting 사용 해제됨'}`));
      const remove=button('세트에서 제거',()=>{rememberRemoval();const index=set.items.indexOf(focus);set.items.splice(index,1);focusId=null;changed(true);render();say('세트에서 제거했습니다. 제거 취소로 복원할 수 있습니다.');},'quiet');remove.disabled=busy;detail.append(remove);
    }
    host.querySelector('.fit-early-controls')?.remove();
    const early=el('section',undefined,'fit-early-controls');$('fit-preview').before(early);
    early.append(el('strong','③ Initial curve · 참고 구간 (피팅 입력에는 미적용)'));
    let earlyInput,earlyStatus;
    const commitEarly=end=>{if(busy||!focus)return;focus.earlyEnd=earlyRange(focus,end).end;changed();if(earlyStatus)earlyStatus.textContent=earlyStatus.textContent.replace('미설정: 임시 가이드','설정됨');};
    if(focus){
      const range=earlyRange(focus),row=el('div',undefined,'fit-early-row'),label=el('label','종료 시간 (s) ');earlyInput=el('input');earlyInput.type='number';earlyInput.min=range.min;earlyInput.max=range.max;earlyInput.step='any';earlyInput.value=range.end;earlyInput.disabled=busy;label.append(earlyInput);row.append(label);
      const apply=button('사용 Dataset에 같은 시간 적용',()=>{const value=Number(earlyInput.value);if(!earlyInput.value||!Number.isFinite(value)||value<range.min||value>range.max){say('현재 곡선의 시간 범위 안에서 종료 시간을 입력하세요.',true);return;}let clipped=0;for(const item of set.items.filter(i=>i.included)){const r=earlyRange(item,value);if(r){item.earlyEnd=r.end;if(r.end!==value)clipped++;}}changed();renderPreview();say(`사용 Dataset에 적용했습니다.${clipped?' '+clipped+'개는 각 데이터의 시간 범위로 제한했습니다.':''} 세트 저장을 눌러 보관하세요.`);});apply.disabled=busy||!set.items.some(i=>i.included);row.append(apply);
      const reset=button('구간 설정 해제',()=>{delete focus.earlyEnd;changed();renderPreview();});reset.disabled=busy;row.append(reset);early.append(row);earlyStatus=el('p');earlyStatus.setAttribute('role','status');early.append(earlyStatus);
      earlyInput.onchange=()=>{const value=Number(earlyInput.value);if(!earlyInput.value||!Number.isFinite(value)||value<range.min||value>range.max){earlyInput.setAttribute('aria-invalid','true');say(`종료 시간은 ${range.min}~${range.max} s 범위로 입력하세요.`,true);return;}commitEarly(value);renderPreview();};
      early.append(el('p','세로선을 드래그하거나 ←/→ 키로 조절하세요(Shift: 1 s). 파란 영역은 기준 구간, 갈색 점선은 양수 응답의 흐름 미리보기입니다. 시작은 현재 Dataset의 첫 시점이며, 범위 밖 점도 Fitting에 유지됩니다. 평형까지 연결하는 곡선은 아직 생성하지 않습니다.','fit-note'));
    }else early.append(el('p','조건표에서 Dataset 이름을 선택하면 세로선으로 초기 감소 구간을 지정할 수 있습니다.','fit-note'));
    const plot=$('fit-preview');plot.replaceChildren();$('fit-legend').replaceChildren();if(!items.length){plot.append(el('p','조건표에서 데이터에 체크하거나 항목을 눌러 곡선을 확인하세요.','fit-plot-empty'));return;}
    const curves=items.map((item,i)=>({id:item.id,name:`${item.label} · ${item.pointId}`,color:colors[i%colors.length],pointsOnly:true,xLabel:'Time (s)',yLabel:'Normalized response (C − Ce) / (C₀ − Ce)',data:item.data.map(p=>({...p,pointId:item.pointId}))}));
    const result=runner?.result;
    if(result)for(const [i,item] of items.entries()){const fitted=result.series.find(s=>s.id===item.id);if(fitted)curves.push({id:item.id+'-fit',name:item.label+' Joint fitting',color:colors[i%colors.length],pointsOnly:false,trend:true,xLabel:'Time (s)',yLabel:'Normalized response (C − Ce) / (C₀ − Ce)',data:fitted.curve.map(p=>({...p,pointId:item.pointId}))});}
    const rendered=renderPlot(plot,curves,defaultAxes(),{},()=>{},()=>{},()=>{});
    if(focus)mountEarlyRange(rendered.svg,rendered.geometry,focus,{disabled:busy,onCommit:commitEarly,onPreview:(range,hasLine)=>{
      earlyInput.value=Number(range.end.toFixed(6));earlyStatus.textContent=`${range.min}–${Number(range.end.toFixed(3))} s · ${range.points.length}/${focus.data.length}점 · ${Number.isFinite(focus.earlyEnd)?'설정됨':'미설정: 임시 가이드'}${hasLine?'':' · 양수 점 3개 이상과 시간 범위가 있어야 점선이 표시됩니다.'}${range.points.some(p=>p.y>1)?' · Y>1 포함: 초기구간 처리를 먼저 검토하세요.':''}`;
    }});
    for(const [i,item] of items.entries()){const text=el('span',`${item.label} · ${item.pointId} · ${tempText(item.temperature)} · ${pressureText(itemPressure(item,set.basis))} kPa`);text.style.setProperty('--series-color',colors[i%colors.length]);$('fit-legend').append(text);}
    if(result)$('fit-legend').append(el('span','점: 입력 · 선: Joint fitting 모델'));
  }
  function openPicker(){
    if(busy)return;
    const set=current(),candidates=fittingCandidates(getCurrent().entries),keys=new Set(set.items.map(item=>item.key)),selected=new Map();
    const dialog=el('dialog',undefined,'fit-picker');
    dialog.innerHTML='<div class="fit-section-heading"><div><span class="page-eyebrow">ADD KINETIC DATA</span><h2>Kinetics 데이터 추가</h2></div><button data-close aria-label="닫기">✕</button></div><p class="fit-note">불러온 파일에서 구간을 선택하세요. 체크한 행을 현재 세트에 함께 추가합니다.</p><div class="fit-picker-filters"><input type="search" placeholder="데이터 이름 · 구간 검색" aria-label="추가할 데이터 검색"><select aria-label="구간 분류"><option value="adsorption">Adsorption (추정)</option><option value="all">전체 구간</option><option value="desorption">Desorption (추정)</option></select><button data-select>보이는 항목 선택</button><button data-clear>선택 해제</button></div><div class="fit-picker-list"></div><p data-message role="status"></p><div class="fit-picker-footer"><span data-count>0개 선택</span><button data-cancel>취소</button><button data-add class="primary">세트에 추가</button></div>';
    const list=dialog.querySelector('.fit-picker-list'),search=dialog.querySelector('input[type=search]'),branch=dialog.querySelector('select'),message=dialog.querySelector('[data-message]'),add=dialog.querySelector('[data-add]');
    const available=candidates.filter(c=>!keys.has(c.key)),visible=()=>available.filter(c=>(branch.value==='all'||c.point.branch===branch.value)&&`${c.entry.alias} ${c.point.id} ${c.entry.name}`.toLowerCase().includes(search.value.toLowerCase()));
    const sync=()=>{dialog.querySelector('[data-count]').textContent=`${selected.size}개 선택`;add.disabled=!selected.size;};
    const draw=()=>{list.replaceChildren();const shown=visible();
      if(!shown.length)list.append(el('p',!candidates.length?'불러온 Kinetics 데이터가 없습니다. 먼저 데이터 관리에서 RAT 파일을 여세요.':!available.length?'모든 구간이 이미 세트에 들어 있습니다.':'검색 또는 구간 조건에 맞는 데이터가 없습니다.','fit-table-empty'));
      for(const c of shown){const label=el('label',undefined,'fit-picker-row'),check=el('input');check.type='checkbox';check.checked=selected.has(c.key);check.onchange=()=>{if(check.checked)selected.set(c.key,c);else selected.delete(c.key);sync();};
        const info=el('span');info.append(el('strong',`${c.entry.alias} · ${c.point.id}`),el('small',`${c.entry.measurement.metadata.gas} · ${tempText(c.entry.measurement.metadata.temperature_K)} · ${c.entry.editVariant?'편집 적용':'원본'} · ${c.point.samples.length}점`));
        const p=set.basis==='p0'?c.point.samples[0]?.values[2]:c.point.equilibrium.pressure;
        label.append(check,info,el('span',`${pressureText(p)} kPa`));list.append(label);
      }sync();};
    search.oninput=draw;branch.onchange=draw;
    dialog.querySelector('[data-select]').onclick=()=>{visible().forEach(c=>selected.set(c.key,c));draw();};
    dialog.querySelector('[data-clear]').onclick=()=>{selected.clear();draw();};
    for(const selector of ['[data-close]','[data-cancel]'])dialog.querySelector(selector).onclick=()=>dialog.close();
    add.onclick=()=>{try{const next=addCandidates(set,[...selected.values()]);library.sets[library.sets.indexOf(set)]=next;for(const {entry} of selected.values())sources.set(entry.hash,{hash:entry.hash,name:entry.name,text:entry.text});changed();focusId=null;dialog.close();render();}catch(error){message.textContent=error.message;message.className='error';}};
    dialog.onclose=()=>{dialog.remove();$('fit-add').focus();};document.body.append(dialog);draw();dialog.showModal();search.focus();
  }
  $('fit-add').onclick=openPicker;
  const runnerHost=el('section');host.querySelector('.fit-preview-panel').before(runnerHost);
  runner=mountFittingRunner(runnerHost,{getSet:current,onChange:changed,onResult:renderPreview,onBusy:value=>{busy=value;render();}});
  window.addEventListener('adsorption:graph-appearance',renderPreview);
  const observer=new ResizeObserver(()=>{if(!host.hidden)renderPreview();});observer.observe($('fit-preview'));
  store.loadState('fitting-sets',validateFittingLibrary,emptyFittingLibrary).then(value=>{library=value;activeId=library.sets[0]?.id??null;ready=true;say(library.sets.length?'저장한 세트를 불러왔습니다.':'새 세트를 만들어 시작하세요.');render();}).catch(error=>{say(error.message,true);render();});
  render();
  return {refresh:()=>{if(!host.hidden)render();}};
}
