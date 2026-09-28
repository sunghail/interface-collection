import {preferenceStorage} from '../storage/vault-store.js';
import {kineticColumns,normalizeTableColumns,moveTableColumn,tableCellText} from '../core/table-columns.js';
const storageKey='adsorption.kineticTable';
export function readTableColumns() {
  try{return normalizeTableColumns(JSON.parse(preferenceStorage.getItem(storageKey)||'null'));}
  catch{return normalizeTableColumns();}
}
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
export function mountTableOptions({getCurrent,onApply}) {
  const dialog=el('dialog',undefined,'table-options');dialog.id='table-options';dialog.setAttribute('aria-labelledby','table-options-title');
  dialog.innerHTML=`<div class="table-options-head"><div><span class="page-eyebrow">KINETIC TABLE</span><h2 id="table-options-title">시간별 데이터 표시 설정</h2></div><button type="button" data-action="close" aria-label="표시 설정 닫기">닫기</button></div>
    <p class="table-options-help">표시할 열을 체크하고, 열 제목을 좌우로 끌어 순서를 바꾸세요. 화살표로도 이동할 수 있어요.</p>
    <div class="table-options-toolbar"><span data-count role="status" aria-live="polite"></span><div><button type="button" data-action="all">모두 표시</button><button type="button" data-action="reset">기본값으로</button></div></div>
    <div class="column-sheet-scroll"><table class="column-sheet" aria-label="시간별 데이터 미리보기"><thead></thead><tbody></tbody></table></div>
    <p class="table-options-note">현재 구간의 처음 4행 미리보기 · 체크를 해제한 열은 흐리게 표시됩니다.</p>
    <div class="table-options-foot"><span>표의 열 표시만 변경됩니다. CSV는 원본 전체 열로 내보냅니다.</span><div><button type="button" data-action="cancel">취소</button><button type="button" data-action="apply" class="primary">적용</button></div></div>`;
  document.body.append(dialog);
  const $=s=>dialog.querySelector(s);let draft=null,context=null;
  function reorder(id,target,focus=false){
    draft.order=moveTableColumn(draft.order,id,target);render();
    if(focus)$(`[data-column="${id}"] .column-grip`)?.focus();
  }
  function render(){
    const scroll=$('.column-sheet-scroll').scrollLeft;
    const header=el('tr'),body=$('tbody');body.replaceChildren();
    const samples=context.rows.slice(0,4),rows=(samples.length?samples:[null]).map(()=>el('tr'));
    draft.order.forEach((id,index)=>{
      const column=kineticColumns.find(c=>c.id===id),label=column.label(context.unit),hidden=draft.hidden.includes(id);
      const th=el('th');th.scope='col';th.dataset.column=id;th.classList.toggle('column-hidden',hidden);
      const controls=el('div',undefined,'column-controls'),toggle=el('input');toggle.type='checkbox';toggle.checked=!hidden;toggle.setAttribute('aria-label',`${label} 열 표시`);
      toggle.onchange=()=>{draft.hidden=toggle.checked?draft.hidden.filter(c=>c!==id):[...draft.hidden,id];render();$(`[data-column="${id}"] input`).focus();};
      const position=el('span',String(index+1).padStart(2,'0'),'column-position');
      const arrows=el('div',undefined,'column-arrows');
      for(const [offset,text,direction] of [[-1,'←','왼쪽'],[1,'→','오른쪽']]){
        const button=el('button',text);button.type='button';button.disabled=index+offset<0||index+offset>=draft.order.length;button.setAttribute('aria-label',`${label} ${direction}으로 이동`);button.onclick=()=>reorder(id,draft.order[index+offset],true);arrows.append(button);
      }
      controls.append(toggle,position,arrows);
      const grip=el('button',undefined,'column-grip');grip.type='button';grip.setAttribute('aria-label',`${label} 열 이동`);grip.title='드래그하거나 Alt + ← / →로 이동';grip.append(el('span','⠿','column-handle'),el('span',label));
      grip.onkeydown=event=>{if(event.altKey&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const target=draft.order[index+(event.key==='ArrowLeft'?-1:1)];if(target)reorder(id,target,true);}};
      let origin=null,moved=false,target=null;
      const clearDrag=()=>{origin=null;target=null;moved=false;dialog.querySelectorAll('.column-drop,.column-dragging').forEach(n=>n.classList.remove('column-drop','column-dragging'));};
      grip.onpointerdown=event=>{if(event.button!==0)return;origin=[event.clientX,event.clientY];grip.setPointerCapture(event.pointerId);};
      grip.onpointermove=event=>{
        if(!origin)return;
        if(!moved&&Math.hypot(event.clientX-origin[0],event.clientY-origin[1])<6)return;
        moved=true;event.preventDefault();th.classList.add('column-dragging');
        const pane=$('.column-sheet-scroll'),box=pane.getBoundingClientRect();
        if(event.clientX>box.right-24)pane.scrollLeft+=18;else if(event.clientX<box.left+24)pane.scrollLeft-=18;
        const over=document.elementFromPoint(event.clientX,event.clientY)?.closest('th[data-column]');
        target=over&&dialog.contains(over)?over.dataset.column:null;
        dialog.querySelectorAll('th[data-column]').forEach(n=>n.classList.toggle('column-drop',n.dataset.column===target&&target!==id));
      };
      grip.onpointerup=event=>{if(!origin)return;const destination=moved?target:null;grip.releasePointerCapture(event.pointerId);clearDrag();if(destination&&destination!==id)reorder(id,destination,true);};
      grip.onpointercancel=clearDrag;
      th.append(controls,grip);header.append(th);
      rows.forEach((row,i)=>{const td=el('td',samples[i]?tableCellText(samples[i][column.index]):'—');td.classList.toggle('column-hidden',hidden);row.append(td);});
    });
    $('thead').replaceChildren(header);body.append(...rows);$('.column-sheet-scroll').scrollLeft=scroll;
    const count=draft.order.length-draft.hidden.length;
    $('[data-count]').textContent=count?`${count} / ${draft.order.length}열 표시`:'표시할 열을 하나 이상 선택하세요.';
    $('[data-action="apply"]').disabled=!count;
  }
  for(const action of ['close','cancel'])$(`[data-action="${action}"]`).onclick=()=>dialog.close();
  $('[data-action="all"]').onclick=()=>{draft.hidden=[];render();};
  $('[data-action="reset"]').onclick=()=>{draft=normalizeTableColumns();render();};
  $('[data-action="apply"]').onclick=()=>{
    if(draft.hidden.length===draft.order.length)return;
    const value=normalizeTableColumns(draft);let persisted=true;
    try{preferenceStorage.setItem(storageKey,JSON.stringify(value));}catch{persisted=false;}
    onApply(value,persisted);dialog.close();
  };
  return {open(){context=getCurrent();draft=normalizeTableColumns(context.columns);render();dialog.showModal();}};
}
