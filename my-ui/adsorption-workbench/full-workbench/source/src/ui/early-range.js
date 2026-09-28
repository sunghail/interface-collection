import {earlyRange} from '../core/early-range.js';
import {overallTrend} from './overall-trend.js';
const ns='http://www.w3.org/2000/svg';
const el=(tag,attrs={},text)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};

export function mountEarlyRange(svg,geometry,item,{onPreview,onCommit,disabled=false}){
  const {L,T,pw,ph,px,py,bx}=geometry,range=earlyRange(item);if(!range)return;
  const group=el('g',{'data-early-range':'true'}),shade=el('rect',{y:T,height:ph,fill:'#3568d4',opacity:.08,'pointer-events':'none'});
  const guide=el('path',{fill:'none',stroke:'#b67532','stroke-width':2,'stroke-dasharray':'5 4','pointer-events':'none'});
  const clip=svg.querySelector('clipPath');if(clip)guide.setAttribute('clip-path',`url(#${clip.id})`);
  const line=el('line',{y1:T,y2:T+ph,stroke:'#3568d4','stroke-width':2,'pointer-events':'none'});
  const label=el('text',{y:T+17,'font-size':12,fill:'#244f9e','pointer-events':'none'});
  const handle=el('rect',{y:T,width:22,height:ph,fill:'transparent',tabindex:disabled?-1:0,role:'slider','aria-label':'초기 감소 구간 종료 시간','aria-valuemin':range.min,'aria-valuemax':range.max});handle.style.cursor=disabled?'default':'ew-resize';handle.style.touchAction='none';
  group.append(shade,guide,line,label,handle);svg.append(group);let value=range.end,drag=null;
  function update(end){
    const r=earlyRange(item,end);value=r.end;const x=px(value),start=px(r.min);
    shade.setAttribute('x',start);shade.setAttribute('width',Math.max(0,x-start));line.setAttribute('x1',x);line.setAttribute('x2',x);handle.setAttribute('x',x-11);handle.setAttribute('aria-valuenow',value);
    label.setAttribute('x',Math.max(L+5,Math.min(L+pw-5,x+7)));label.setAttribute('text-anchor',x>L+pw*.65?'end':'start');label.textContent=`초기 구간 끝 · ${Number(value.toFixed(3))} s`;
    const valid=r.points.filter(p=>p.y>0);const trend=overallTrend(valid,2,{startAtOne:false});
    guide.setAttribute('d',trend.map((p,i)=>`${i?'L':'M'}${px(p.x)},${py(p.y)}`).join(' '));
    onPreview(r,trend.length>0);
  }
  function at(event){const matrix=svg.getScreenCTM();if(!matrix)return value;const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());return bx.inverse(bx.lo+Math.max(0,Math.min(pw,p.x-L))/pw*(bx.hi-bx.lo));}
  handle.onpointerdown=e=>{e.stopPropagation();if(disabled||e.button!==0)return;e.preventDefault();drag={id:e.pointerId,start:value};handle.setPointerCapture(e.pointerId);update(at(e));};
  handle.onpointermove=e=>{e.stopPropagation();if(drag?.id===e.pointerId)update(at(e));};
  handle.onpointerup=e=>{e.stopPropagation();if(drag?.id!==e.pointerId)return;drag=null;if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);onCommit(value);};
  handle.onpointercancel=()=>{if(drag){update(drag.start);drag=null;}};
  handle.onlostpointercapture=()=>{if(drag){update(drag.start);drag=null;}};
  handle.onkeydown=e=>{if(disabled)return;const step=e.shiftKey?1:.1;let next=value;if(e.key==='ArrowLeft')next-=step;else if(e.key==='ArrowRight')next+=step;else if(e.key==='Home')next=range.min;else if(e.key==='End')next=range.max;else return;e.preventDefault();e.stopPropagation();update(next);onCommit(value);};
  update(value);return {update};
}
