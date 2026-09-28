import {sortComparisonItems,moveComparisonItem,emptyComparisons,newComparison,comparisonCandidates,snapshotComparison,comparisonCurves,validateComparisons} from '../core/comparison-sets.js';
import {PresetStore} from '../storage/preset-store.js';
import {renderPlot,colors} from './plot.js';
import {defaultAxes,createEntry} from '../core/workspace.js';
import {comparisonEditorEntry,applyComparisonEdit} from '../core/comparison-sets.js';
import {openComparisonGraphEditor} from './curve-editor.js';
import {openComparisonPointEditor} from './comparison-point-editor.js';
const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
export function mountComparisonSets(host,getCurrent){
  const store=new PresetStore();let library=emptyComparisons(),active=null,dirty=false,ready=false,busy=false,undo=null;const sources=new Map(),viewports=new Map();let dragging=null;
  const section=el('section');section.className='comparison-manager';host.append(section);
  section.innerHTML=`<div class="comparison-heading"><div><span class="page-eyebrow">COMPARISON SETS</span><h2>비교분석</h2><p>다른 온도와 압력의 구간을 함께 담아 비교하세요.</p></div><div><select data-ui="kind" aria-label="새 세트 종류"><option value="kinetic">Kinetics</option><option value="isotherm">Adsorption Isotherm</option></select><button data-ui="new">＋ 새 세트</button></div></div>
    <div class="comparison-toolbar"><select data-ui="sets" aria-label="저장한 비교 세트"></select><input data-ui="name" aria-label="비교 세트 이름"><button data-ui="add">데이터 담기</button><button data-ui="save" class="primary">세트 저장</button><button data-ui="delete">세트 삭제</button><button data-ui="undo" hidden>삭제 취소</button></div>
    <p data-ui="status" role="status"></p><div data-ui="body"><div class="comparison-toolbar"><label>Y축 <select data-ui="value"><option value="residual">Normalized response</option><option value="pressure">Pressure</option></select></label><label>스케일 <select data-ui="scale"><option value="log">Log</option><option value="linear">Linear</option></select></label><span data-ui="range-label">전체 시간 범위 (s)</span><label>시작 <input data-ui="min" type="number" step="any" aria-label="전체 구간 시작" placeholder="자동"></label><label>끝 <input data-ui="max" type="number" step="any" aria-label="전체 구간 끝" placeholder="자동"></label><button data-ui="range">전체 적용</button><button data-ui="reset-zoom">확대 초기화</button><select data-ui="sort" aria-label="곡선 순서 정렬"><option value="temperature:asc">온도 낮은 순</option><option value="temperature:desc">온도 높은 순</option><option value="pressure:asc">압력 낮은 순</option><option value="pressure:desc">압력 높은 순</option></select><button data-ui="sort-apply">정렬</button><span data-ui="summary"></span></div><div data-ui="plot" class="comparison-plot"></div><div data-ui="legend" class="comparison-legend"></div><p data-ui="notice" class="hint"></p><div class="comparison-table-wrap"><table><thead><tr><th>표시</th><th>이름 · 색상</th><th>기체 / 온도</th><th>압력 / 구간</th><th>순서</th><th></th></tr></thead><tbody data-ui="rows"></tbody></table></div></div><p class="hint">동일 흡착제인지 확인하세요. 원본과 편집 상태를 당시 값으로 보존합니다. 비교 세트는 이 환경에 별도 저장되며 작업 JSON에는 포함되지 않습니다.</p>`;
  const $=k=>section.querySelector(`[data-ui="${k}"]`),current=()=>library.sets.find(s=>s.id===active);
  const say=t=>{$('status').textContent=t;};
  const change=()=>{dirty=true;say('저장하지 않은 변경');$('save').disabled=false;};
  function draw(){
    const s=current();if(!s||!section.offsetWidth)return;
    const curves=comparisonCurves(s).map(c=>({...c,color:c.color||colors[s.items.findIndex(i=>i.id===c.id)%colors.length]}));
    const axes=defaultAxes();axes.y.scale=s.scale;axes.x.min=s.min??null;axes.x.max=s.max??null;
    const viewport=viewports.get(s.id);if(viewport)for(const axis of ['x','y']){axes[axis].min=viewport[axis][0];axes[axis].max=viewport[axis][1];}
    if(curves.some(c=>c.data.length))renderPlot($('plot'),curves,axes,{},()=>{},range=>{if(Object.values(range).flat().every(Number.isFinite)&&range.x[0]<range.x[1]&&range.y[0]<range.y[1]){viewports.set(s.id,range);draw();}},undefined,{method:'raw',wheelZoom:true});else $('plot').textContent='표시할 곡선을 선택하세요.';
    $('legend').replaceChildren(...curves.map(c=>{const b=el('button',c.name);b.style.color=c.color;b.onclick=()=>{s.items.find(i=>i.id===c.id).visible=false;change();render();};return b;}));
    const invalid=curves.reduce((n,c)=>n+c.data.filter(p=>s.scale==='log'&&p.y<=0).length,0);
    $('notice').textContent=(invalid?`로그축에서 Y≤0인 ${invalid}점은 표시하지 않습니다. `:'')+'전체 범위는 점과 선의 표시 범위입니다. Trendline 계산 범위는 각 그래프 편집에서 설정합니다. 휠: 확대·축소 · 드래그: 이동 · ⋮⋮: 순서 변경.';
  }
  function render(){
    section.inert=busy;
    const s=current();$('sets').replaceChildren(...library.sets.map(s=>{const o=el('option',s.name);o.value=s.id;return o;}));$('sets').value=active??'';
    for(const k of ['new','sets','kind','name','add','delete','scale','value','undo'])$(k).disabled=!ready||busy||(k!=='new'&&k!=='kind'&&k!=='undo'&&!s);
    $('save').disabled=!ready||busy||!dirty;$('undo').hidden=!undo;$('body').hidden=!s;$('name').value=s?.name??'';if(!s)return;
    $('value').value=s.value;$('value').disabled=s.kind!=='kinetic'||busy;$('scale').value=s.scale;
    $('summary').textContent=`${s.items.length}곡선 · ${new Set(s.items.map(i=>i.temperature)).size}개 온도`;
    $('range-label').textContent=s.kind==='kinetic'?'전체 시간 범위 (s)':'전체 압력 범위 (kPa)';$('min').value=s.min??'';$('max').value=s.max??'';$('rows').replaceChildren();
    s.items.forEach((item,index)=>{
      const tr=el('tr'),cells=Array.from({length:6},()=>el('td'));tr.append(...cells);
      const check=el('input');check.type='checkbox';check.checked=item.visible;check.setAttribute('aria-label',`${item.label} 표시`);check.onchange=()=>{item.visible=check.checked;change();draw();};cells[0].append(check);
      const name=el('input');name.value=item.label;name.setAttribute('aria-label','곡선 이름');name.onchange=()=>{item.label=name.value.trim()||item.sourceName;change();draw();};const color=el('input');color.type='color';color.value=item.color||colors[index%colors.length];color.setAttribute('aria-label','곡선 색상');color.oninput=()=>{item.color=color.value;change();draw();};cells[1].append(color,name);
      cells[2].textContent=`${item.gas} / ${item.temperature} K`;cells[3].textContent=`${item.pressure==null?'Isotherm':item.pressure.toFixed(2)+' kPa · '+item.pointId} · ${item.branch}${item.edited?' · 편집본':''}`;
      if(item.comparisonEdit){const d=item.comparisonEdit,curve=comparisonCurves({...s,items:[{...item,visible:true}]} )[0];cells[3].append(el('small',` · 제외 ${d.excluded.length}점${d.preprocess?` · Preprocessing −${curve.preprocessing.shift}s (${curve.preprocessing.removed}점)`:''} · 계산 ${d.trend.min??'처음'}–${d.trend.max??'끝'}s`));}
      const handle=el('button','⋮⋮');handle.draggable=!busy;handle.className='comparison-drag';handle.title='드래그하여 순서 변경';handle.setAttribute('aria-label',`${item.label} 순서 이동`);
      handle.ondragstart=e=>{dragging=item.id;e.dataTransfer.setData('text/plain',item.id);e.dataTransfer.effectAllowed='move';tr.classList.add('drag-source');};
      handle.ondragend=()=>{dragging=null;section.querySelectorAll('.drag-source,.drop-target').forEach(n=>n.classList.remove('drag-source','drop-target'));};
      tr.ondragover=e=>{if(dragging&&dragging!==item.id){e.preventDefault();e.dataTransfer.dropEffect='move';tr.classList.add('drop-target');}};
      tr.ondragleave=()=>tr.classList.remove('drop-target');
      tr.ondrop=e=>{e.preventDefault();if(dragging){moveComparisonItem(s,dragging,item.id);dragging=null;change();render();}};cells[4].append(handle);
      for(const [label,delta] of [['↑',-1],['↓',1]]){const b=el('button',label);b.disabled=busy||index+delta<0||index+delta>=s.items.length;b.onclick=()=>{[s.items[index],s.items[index+delta]]=[s.items[index+delta],s.items[index]];change();render();};cells[4].append(b);}
      const edit=el('button',item.comparisonEdit?'그래프 편집 · 적용됨':'그래프 편집');edit.onclick=async()=>{
        if(s.kind!=='kinetic'){openComparisonPointEditor(item,s,excluded=>{item.comparisonExcluded=excluded;change();render();});return;}
        try{
          let source;
          if(!item.comparisonBase){
            const raw=sources.get(item.hash)??getCurrent().entries.find(e=>e.hash===item.hash)??(await store.readSources([item.hash]))[0];
            if(!raw)throw Error('원본을 찾을 수 없습니다. 해당 측정파일을 다시 불러오세요.');
            source=await createEntry(raw.name,raw.text);
          }
          const entry=comparisonEditorEntry(item,source),axes=structuredClone(item.comparisonEdit?.axes??defaultAxes());
          if(!item.comparisonEdit)axes.y.scale=s.scale;
          await openComparisonGraphEditor(entry,{mode:'kinetic',axes,unit:'kPa',kineticValue:item.comparisonEdit?.kineticValue??s.value},draft=>{
            applyComparisonEdit(item,entry,draft);viewports.delete(s.id);change();render();say('그래프 편집을 적용했습니다. 세트 저장을 눌러 보관하세요.');
          });
        }catch(error){say(error.message);}
      };cells[5].append(edit);
      const remove=el('button','제거');remove.onclick=()=>{undo=structuredClone(library.sets);s.items.splice(index,1);change();render();};cells[5].append(remove);tr.querySelectorAll('input').forEach(i=>i.disabled=busy);$('rows').append(tr);
    });draw();
  }
  $('new').onclick=()=>{const s=newComparison($('kind').value);if(s.kind==='isotherm')s.scale='linear';library.sets.push(s);active=s.id;change();render();};
  $('sets').onchange=()=>{active=$('sets').value;render();};$('name').oninput=()=>{current().name=$('name').value;const option=$('sets').selectedOptions[0];if(option)option.textContent=current().name||'이름 없는 세트';change();};
  for(const k of ['scale','value'])$(k).onchange=()=>{current()[k]=$(k).value;viewports.delete(current().id);change();draw();};
  $('range').onclick=()=>{const s=current(),old=[s.min,s.max];s.min=$('min').value===''?null:Number($('min').value);s.max=$('max').value===''?null:Number($('max').value);try{validateComparisons(library);viewports.delete(s.id);change();draw();}catch(e){[s.min,s.max]=old;say(e.message);}};
  $('reset-zoom').onclick=()=>{viewports.delete(current().id);draw();};
  $('sort-apply').onclick=()=>{const [key,direction]=$('sort').value.split(':');sortComparisonItems(current(),key,direction);change();render();};
  $('delete').onclick=()=>{undo=structuredClone(library.sets);library.sets=library.sets.filter(s=>s.id!==active);active=library.sets[0]?.id;change();render();};
  $('undo').onclick=()=>{library.sets=undo;undo=null;if(!current())active=library.sets[0]?.id;change();render();};
  $('save').onclick=async()=>{busy=true;render();try{library=await store.saveState('comparison-sets',library,[...sources.values()],validateComparisons);dirty=false;sources.clear();say('비교 세트를 저장했습니다. 다음 실행에도 불러올 수 있습니다.');}catch(e){say(e.message);}finally{busy=false;render();}};
  $('add').onclick=()=>{
    const s=current(),candidates=comparisonCandidates(getCurrent().entries,s.kind),selected=new Set(),dialog=el('dialog');dialog.className='comparison-picker';
    dialog.innerHTML='<h2>비교할 데이터 담기</h2><p>온도·압력·파일 이름으로 검색하고 원하는 구간을 선택하세요.</p><input type="search" placeholder="예: 298 또는 N2" aria-label="비교 후보 검색"><div class="comparison-candidates"></div><p role="status"></p><footer><button data-action="all">검색 결과 선택</button><button data-action="close">닫기</button><button data-action="add" class="primary">선택한 데이터 담기</button></footer>';
    const search=dialog.querySelector('input'),list=dialog.querySelector('.comparison-candidates'),status=dialog.querySelector('[role="status"]');let shown=[];
    const labels=candidates.map(c=>`${c.entry.alias} · ${c.entry.measurement.metadata.gas} · ${c.entry.measurement.metadata.temperature_K} K · ${c.point?c.point.id+' · '+c.point.equilibrium.pressure.toFixed(2)+' kPa':c.branch} · ${c.branch}${c.entry.editVariant?' · 편집본':''}${c.entry.vaultPath?' · '+(c.entry.vaultPath.split('/').slice(0,-1).join(' / ')||'Vault'):''}`);
    function update(){shown=candidates.map((c,i)=>i).filter(i=>labels[i].toLowerCase().includes(search.value.toLowerCase()));list.replaceChildren(...shown.map(i=>{const label=el('label'),input=el('input');input.type='checkbox';input.checked=selected.has(i);input.onchange=()=>{input.checked?selected.add(i):selected.delete(i);status.textContent=`${selected.size}개 선택`;};label.append(input,el('span',labels[i]));return label;}));status.textContent=`${shown.length}개 후보 · ${selected.size}개 선택`;}
    search.oninput=update;dialog.querySelector('[data-action="all"]').onclick=()=>{shown.forEach(i=>selected.add(i));update();};dialog.querySelector('[data-action="close"]').onclick=()=>dialog.close();
    dialog.querySelector('[data-action="add"]').onclick=()=>{try{let count=0;for(const i of selected){const c=candidates[i],item=snapshotComparison(c,s.kind);if(!s.items.some(x=>x.key===item.key)&&item.data.length){item.color=colors[s.items.length%colors.length];s.items.push(item);sources.set(c.entry.hash,{hash:c.entry.hash,name:c.entry.name,text:c.entry.text});count++;}}change();render();say(`${count}개 곡선 추가 · 세트 저장을 눌러 보관하세요.`);dialog.close();}catch(e){status.textContent=e.message;}};
    dialog.onclose=()=>dialog.remove();document.body.append(dialog);update();dialog.showModal();
  };
  window.addEventListener('beforeunload',e=>{if(dirty&&!window.adsorptionClosingApproved){e.preventDefault();e.returnValue='';}});
  new ResizeObserver(()=>{try{draw();}catch(e){say(e.message);}}).observe($('plot'));
  store.loadState('comparison-sets',validateComparisons,emptyComparisons).then(v=>{library=v;active=v.sets[0]?.id;ready=true;render();}).catch(e=>say(e.message));render();
  return {refresh:()=>{try{draw();}catch(e){say(e.message);}}};
}
