import {comparisonItemData} from '../core/comparison-sets.js';
import {renderPlot} from './plot.js';
import {defaultAxes} from '../core/workspace.js';

export function openComparisonPointEditor(item,set,onApply){
  const draft=structuredClone(item),excluded=new Set(draft.comparisonExcluded??[]);
  const dialog=document.createElement('dialog');dialog.className='comparison-point-editor';
  dialog.innerHTML=`<h2>비교 데이터 · 점 편집</h2><p data-title></p><p class="hint">그래프의 점 또는 표의 행을 눌러 제외·복원하세요. 변경은 이 비교 세트에만 적용됩니다.</p>
    <div class="comparison-toolbar"><label>Y축 <select data-value><option value="residual">Normalized response</option><option value="pressure">Pressure</option></select></label><label>스케일 <select data-scale><option value="linear">Linear</option><option value="log">Log</option></select></label><button data-reset>모든 점 복원</button><span data-count role="status"></span></div>
    <div data-plot></div><p class="hint">회색 점은 제외된 점입니다. 편집창에서는 전체 구간을 표시합니다. Log에서 Y≤0인 점은 표에서 편집하세요.</p>
    <div class="comparison-point-table"><table><thead><tr><th>사용</th><th>점</th><th data-x></th><th data-y></th></tr></thead><tbody></tbody></table></div>
    <footer><button data-cancel>취소</button><button data-apply class="primary">비교에 적용</button></footer>`;
  const $=s=>dialog.querySelector(s),isKinetic=set.kind==='kinetic';
  $('[data-title]').textContent=`${item.label} · ${item.temperature} K · ${item.pressure==null?item.branch:item.pressure.toFixed(2)+' kPa · '+item.pointId}`;
  $('[data-value]').value=isKinetic?set.value:'residual';$('[data-value]').disabled=!isKinetic;
  if(!isKinetic)$('[data-value] option').textContent='Uptake';
  $('[data-scale]').value=set.scale;
  const toggle=key=>{excluded.has(key)?excluded.delete(key):excluded.add(key);draw();};
  function draw(){
    draft.comparisonExcluded=[...excluded];
    const points=comparisonItemData(draft,$('[data-value]').value,true),used=points.filter(p=>!p.excluded);
    $('[data-count]').textContent=`${used.length} / ${points.length}점 사용 · ${points.length-used.length}점 제외`;
    const xLabel=isKinetic?'Time (s)':'Pressure (kPa)',yLabel=!isKinetic?'Uptake (cm³ STP/g)':$('[data-value]').value==='pressure'?'Pressure (kPa)':'(C − Ce) / (C0 − Ce)';
    $('[data-x]').textContent=xLabel;$('[data-y]').textContent=yLabel;
    const base={pointsOnly:true,xLabel,yLabel};
    const axes=defaultAxes();axes.y.scale=$('[data-scale]').value;
    renderPlot($('[data-plot]'),[{...base,id:'included',name:'사용',color:item.color||'#3a6fd8',data:used},{...base,id:'excluded',name:'제외',color:'#a4adbd',data:points.filter(p=>p.excluded).map(p=>({...p,excluded:false}))}],axes,{},hit=>toggle(hit.p.comparisonKey),()=>{},undefined,{method:'raw',edit:true});
    $('tbody').replaceChildren(...points.map((p,index)=>{
      const row=document.createElement('tr');row.classList.toggle('excluded',p.excluded);
      const cell=document.createElement('td'),check=document.createElement('input');check.type='checkbox';check.checked=!p.excluded;check.setAttribute('aria-label',`${index+1}번 점 사용`);cell.append(check);row.append(cell);
      for(const value of [index+1,Number(p.x.toPrecision(8)),Number(p.y.toPrecision(8))]){const td=document.createElement('td');td.textContent=value;row.append(td);}
      check.onclick=e=>e.stopPropagation();check.onchange=()=>toggle(p.comparisonKey);row.onclick=()=>toggle(p.comparisonKey);return row;
    }));
  }
  $('[data-value]').onchange=draw;$('[data-scale]').onchange=draw;
  $('[data-reset]').onclick=()=>{excluded.clear();draw();};
  $('[data-cancel]').onclick=()=>dialog.close();
  $('[data-apply]').onclick=()=>{onApply([...excluded]);dialog.close();};
  dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();draw();
}
