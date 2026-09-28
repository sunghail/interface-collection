import { overallTrend, selectedPointsTrend } from './overall-trend.js';
import { bindNavigation } from './plot-navigation.js';
import { selectDisplayPoints } from './kinetic-display.js';
import { splitSegments } from './bklit-renderer.jsx';
import { bklitMarkup } from './bklit-renderer.jsx';
import {graphAppearance,measureGraphText} from './graph-appearance.js';
import {titleLayout} from '../core/graph-appearance.js';
import {wrapGraphText} from '../core/graph-appearance.js';
import {bindPlotCopy} from './plot-copy.js';
const NS = 'http://www.w3.org/2000/svg';
export const colors = ['#3a6fd8','#e08a3c','#2f9e8f','#7c5cd6','#c95c7c','#8a8f3a'];
function el(tag, attrs = {}, text) { const n = document.createElementNS(NS, tag); for (const [k,v] of Object.entries(attrs)) n.setAttribute(k,v); if (text !== undefined) n.textContent = text; return n; }
const fmt = v => Number(v.toPrecision(5)).toString();
let lastPick = { key: null, time: 0 };
let nextClip=0;
function bounds(values, a) {
  const f = a.scale === 'log' ? Math.log10 : v => v;
  const inverse = a.scale === 'log' ? v => 10 ** v : v => v;
  const good = values.filter(v => Number.isFinite(v) && (a.scale !== 'log' || v > 0));
  let lo = good.length ? f(good.reduce((a,b)=>Math.min(a,b),Infinity)) : 0, hi = good.length ? f(good.reduce((a,b)=>Math.max(a,b),-Infinity)) : 1;
  let pad = hi === lo ? Math.max(Math.abs(lo) * .04, .05) : (hi-lo)*.04;
  lo -= pad; hi += pad;
  if (a.min !== null) lo = f(a.min); if (a.max !== null) hi = f(a.max);
  if (lo >= hi) { if (a.min !== null && a.max === null) hi = lo + 1; else if (a.max !== null && a.min === null) lo = hi - 1; }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) throw new Error('표시할 축 범위를 계산할 수 없습니다.');
  return { lo, hi, f, inverse };
}

export function renderPlot(host, curves, axes, selected, onSelect, onRange, onHover, display=null, output=null) {
  const inputCurves=curves;
  const appearance=graphAppearance(),largestTitle=Math.max(appearance.xTitleSize,appearance.yTitleSize);
  host.style.minHeight=largestTitle>20?`${largestTitle*10+180}px`:'';
  const W=output?.width??Math.max(320,host.clientWidth||1000),H=output?.height??(host.clientHeight||500);
  const {L,R,T,B,xLines,yLines}=titleLayout(W,H,curves[0]?.xLabel??'X',curves[0]?.yLabel??'Y',appearance,measureGraphText),pw=W-L-R,ph=H-T-B;
  const all = curves.flatMap(c=>c.data);
  const anchored=curves.some(c=>c.trendSettings?.enabled&&c.trendSettings.startAtOne||c.selectedTrendSettings?.enabled)||display?.trend&&display.startAtOne;
  const boundsData=anchored?[...all,...curves.filter(c=>!(c.timeRange?.min>0)).map(c=>({x:0,y:c.trendPressure?.c0??1}))]:all;
  const referenceCurves=curves.filter(c=>Number.isFinite(c.referenceY));
  const bx=bounds(boundsData.map(p=>p.x),axes.x),by=bounds([...boundsData.map(p=>p.y),...referenceCurves.map(c=>c.referenceY)],axes.y);
  const px=x=>L+(bx.f(x)-bx.lo)/(bx.hi-bx.lo)*pw;
  const py=y=>T+(by.hi-by.f(y))/(by.hi-by.lo)*ph;
  const sourceCurves=curves;
  curves=curves.map(c=>({...c,data:c.data.filter(p=>!p.excluded)}));
  const originalCurves=curves;
  const counts=[];
  if(display&&!display.edit&&!display.trend&&display.method!=='raw')curves=curves.map(c=>{
    if(c.trendSettings?.enabled||c.selectedTrendSettings?.enabled){counts.push({name:c.name,kept:c.data.length,total:sourceCurves.find(source=>source.id===c.id).data.length});return c;}
    const segments=display.method==='smooth'?[c.data]:splitSegments(c.data,axes);
    const data=segments.flatMap(segment=>selectDisplayPoints(segment,display.method,display.strength,px,py).map((p,i)=>i===0?{...p,breakBefore:true}:p));
    counts.push({name:c.name,kept:data.length,total:sourceCurves.find(source=>source.id===c.id).data.length,end:display.method==='smooth'?data.at(-1)?.x:undefined});return {...c,data};
  });
  else if(display)for(const c of curves)counts.push({name:c.name,kept:c.data.length,total:sourceCurves.find(source=>source.id===c.id).data.length});
  const svg=el('svg',{xmlns:NS,viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':'측정 데이터 그래프'});
  svg.append(el('rect',{width:W,height:H,fill:'white'}));
  const clipId=`plot-clip-${++nextClip}`, clipUrl=`url(#${clipId})`;
  const defs=el('defs'),clip=el('clipPath',{id:clipId});clip.append(el('rect',{x:L,y:T,width:pw,height:ph}));defs.append(clip);svg.append(defs);
  const font={fill:'#7b8499','font-size':12,'font-family':'sans-serif'};
  for (const [axis,b] of [['x',bx],['y',by]]) {
    const rough=(b.hi-b.lo)/6;
    const magnitude=10**Math.floor(Math.log10(rough));
    const normalized=rough/magnitude;
    const rounded=(normalized<1.5?1:normalized<3?2:normalized<7?5:10)*magnitude;
    const step=axes[axis].step ?? (axes[axis].scale==='log'?Math.max(1,Math.round(rough)):rounded);
    const first=Math.ceil(b.lo/step)*step;
    if ((b.hi-first)/step > 150) throw new Error('눈금이 너무 많습니다. 간격을 늘려주세요.');
    const ticks=[];
    if(axes[axis].scale==='log'&&axes[axis].step===null&&b.hi-b.lo<1){
      const rawLo=b.inverse(b.lo),rawHi=b.inverse(b.hi),rawRough=(rawHi-rawLo)/6;
      const mag=10**Math.floor(Math.log10(rawRough)),n=rawRough/mag;
      const rawStep=(n<1.5?1:n<3?2:n<7?5:10)*mag;
      for(let raw=Math.ceil(rawLo/rawStep)*rawStep;raw<=rawHi+rawStep*1e-9;raw+=rawStep)if(raw>0)ticks.push(b.f(raw));
    }else for(let v=first;v<=b.hi+step*1e-9;v+=step)ticks.push(v);
    for(const v of ticks){
      const raw=b.inverse(v); if(!Number.isFinite(raw)) continue;
      if(axis==='x'){const x=px(raw);svg.append(el('line',{x1:x,x2:x,y1:T,y2:H-B,stroke:'#eef1f6'}));svg.append(el('text',{x,y:H-B+21,'text-anchor':'middle',...font},fmt(raw)));}
      else {const y=py(raw);svg.append(el('line',{x1:L,x2:W-R,y1:y,y2:y,stroke:'#eef1f6'}));svg.append(el('text',{x:L-10,y:y+4,'text-anchor':'end',...font},fmt(raw)));}
    }
  }
  const xTitle=el('text',{x:L+pw/2,y:H-B+32+appearance.xTitleSize,'text-anchor':'middle',...font,'font-size':appearance.xTitleSize,'data-axis-title':'x'});
  xLines.forEach((line,i)=>xTitle.append(el('tspan',{x:L+pw/2,dy:i?appearance.xTitleSize*1.2:0},line)));svg.append(xTitle);
  const yTitle=el('text',{transform:`translate(${10+appearance.yTitleSize} ${T+ph/2}) rotate(-90)`,'text-anchor':'middle',...font,'font-size':appearance.yTitleSize,'data-axis-title':'y'});
  yLines.forEach((line,i)=>yTitle.append(el('tspan',{x:0,dy:i?appearance.yTitleSize*1.2:0},line)));svg.append(yTitle);
  let hidden=all.filter(p=>(axes.x.scale==='log'&&p.x<=0)||(axes.y.scale==='log'&&p.y<=0)).length; const hits=[]; const g=el('g',{'clip-path':clipUrl});
  for(const c of (display?.edit?sourceCurves:curves)){

    for(const p of c.data){

      if((axes.x.scale==='log'&&p.x<=0)||(axes.y.scale==='log'&&p.y<=0)){continue;}
      const x=px(p.x),y=py(p.y);
      if(x>=L&&x<=W-R&&y>=T&&y<=H-B)hits.push({x,y,p,c});
    }

    for(const h of hits.filter(h=>h.c===c)){
      const active=display?.selectedSampleIds?display.selectedSampleIds.includes(h.p.sampleId):selected.entryId===c.id&&selected.pointId===h.p.pointId&&(!h.p.sampleId||selected.sampleId===h.p.sampleId);
      if(active)g.append(el('circle',{cx:h.x,cy:h.y,r:6,fill:'none',stroke:c.color,'stroke-width':2}));
    }
  }
  const series=el('g',{'data-renderer':'bklit','clip-path':clipUrl});
  const trendWarnings=[];
  const convertTrend=(c,data)=>{
    const clipped=data.filter(p=>(c.timeRange?.min==null||p.x>=c.timeRange.min)&&(c.timeRange?.max==null||p.x<=c.timeRange.max));
    return c.trendPressure?clipped.map(p=>({...p,y:c.trendPressure.ce+p.y*(c.trendPressure.c0-c.trendPressure.ce)})):clipped;
  };
  const trendFor=c=>c.trendSettings??(display?.trend?{enabled:true,strength:display.strength,min:axes.x.min,max:axes.x.max,startAtOne:display.startAtOne}:null);
  const trendCurves=originalCurves.filter(c=>trendFor(c)?.enabled).map(c=>{
    const settings=trendFor(c),data=convertTrend(c,overallTrend(c.trendData??c.data,settings.strength,settings));
    if(!data.length)trendWarnings.push(`${c.name}: Trendline 계산 불가 — 사용점·시간 범위${settings.startAtOne?'·Y≤1 구간':''} 확인`);
    return {...c,id:c.id+'-trend',data,trend:true,pointsOnly:false};
  });
  const selectedTrendCurves=originalCurves.filter(c=>c.selectedTrendSettings?.enabled).map(c=>{
    const settings=c.selectedTrendSettings,data=convertTrend(c,selectedPointsTrend(c.trendData??c.data,settings.sampleIds,settings.strength,settings));
    if(!data.length)trendWarnings.push(`${c.name}: 선택한 점의 Trendline 계산 불가 — 범위 안의 0 < Y ≤ 1인 사용점 3개 이상과 하강 구간을 확인하세요.`);
    return {...c,id:c.id+'-selected-trend',color:settings.color??c.color,data,trend:true,selectedTrend:true,pointsOnly:false};
  });
  const drawn=[
    ...curves.map(c=>trendFor(c)?.enabled||c.selectedTrendSettings?.enabled?{...c,pointsOnly:true,opacity:.4}:c),
    ...trendCurves,...selectedTrendCurves
  ];
  if(display?.edit)drawn.push(...sourceCurves.map(c=>({...c,id:c.id+'-excluded',color:'#b94738',pointsOnly:true,opacity:.7,data:c.data.filter(p=>p.excluded)})));
  series.innerHTML=bklitMarkup(drawn,axes,px,py,W,H);
  const viewport=el('g',{'clip-path':clipUrl}),moving=el('g');
  const referenceViewport=el('g',{'clip-path':clipUrl}),references=el('g');
  for(const c of referenceCurves){
    if(axes.y.scale==='log'&&c.referenceY<=0)continue;
    const line=el('line',{x1:L,x2:W-R,y1:py(c.referenceY),y2:py(c.referenceY),stroke:c.color,'stroke-width':1.5,'stroke-dasharray':'6 4',opacity:.8,'data-expected-pressure':c.referenceY,'data-entry-id':c.id});
    line.append(el('title',{},`${c.name} · Estimated P₀ ${fmt(c.referenceY)}`));references.append(line);
  }
  referenceViewport.append(references);svg.append(referenceViewport);
  for(const c of curves.filter(c=>Number.isFinite(c.equilibriumY))){
    if(axes.y.scale==='log'&&c.equilibriumY<=0)continue;
    references.append(el('line',{x1:L,x2:W-R,y1:py(c.equilibriumY),y2:py(c.equilibriumY),stroke:'#8693a6','stroke-dasharray':'3 5','data-equilibrium-pressure':c.equilibriumY}));
  }
  viewport.append(moving);
  if(display?.overlay&&!display.trend&&display.method!=='raw'){
    const ghost=el('g',{opacity:.18,'clip-path':clipUrl,'data-original-overlay':'true'});
    ghost.innerHTML=bklitMarkup(originalCurves,axes,px,py,W,H);ghost.removeAttribute('clip-path');moving.append(ghost);
  }
  const presetOverlay=el('g',{'data-preset-trends':'true','pointer-events':'none'});
  presetOverlay.innerHTML=bklitMarkup(display?.presetTrends??[],axes,px,py,W,H);
  series.removeAttribute('clip-path');g.removeAttribute('clip-path');moving.append(presetOverlay,series,g);svg.append(viewport);
  if(!all.length)svg.append(el('text',{x:W/2,y:H/2,'text-anchor':'middle',...font},curves.length?'선택 구간에 시간 데이터가 없습니다.':'표시할 측정 파일을 선택하세요.'));
  host.replaceChildren(svg);
  if(appearance.insideLegend&&curves.length){
    const size=appearance.insideSize,maxWidth=Math.max(90,pw*.48),items=[...curves,...(display?.presetTrends??[])];
    const rows=items.flatMap(c=>wrapGraphText(c.name??'',maxWidth-42,t=>measureGraphText(t,size)).map((text,i)=>({text,color:c.color,mark:i===0,pointsOnly:c.pointsOnly})));
    const width=Math.min(maxWidth,Math.max(...rows.map(r=>measureGraphText(r.text,size)))+42),height=rows.length*size*1.35+16;
    const x=appearance.insidePosition.endsWith('right')?W-R-width-10:L+10,y=appearance.insidePosition.startsWith('bottom')?Math.max(T+10,H-B-height-10):T+10;
    const legend=el('g',{'data-inside-legend':'true','pointer-events':'none'});
    legend.append(el('rect',{x,y,width,height,fill:appearance.insideBackground==='white'?'white':'none',opacity:.94}));
    rows.forEach((row,i)=>{const cy=y+10+size*(i*1.35+.8);if(row.mark){if(!row.pointsOnly)legend.append(el('line',{x1:x+8,x2:x+28,y1:cy-size*.3,y2:cy-size*.3,stroke:row.color,'stroke-width':2}));legend.append(el('circle',{cx:x+18,cy:cy-size*.3,r:3,fill:'white',stroke:row.color,'stroke-width':1.5}));}legend.append(el('text',{x:x+34,y:cy,'font-size':size,'font-family':'sans-serif',fill:'#34445c'},row.text));});svg.append(legend);
  }
  if(output)return {svg,hidden,counts,trendWarnings};
  const pos=e=>{const r=svg.getBoundingClientRect();const scale=Math.min(r.width/W,r.height/H);return {x:(e.clientX-r.left-(r.width-W*scale)/2)/scale,y:(e.clientY-r.top-(r.height-H*scale)/2)/scale};};
  const closest=p=>hits.reduce((best,h)=>Math.hypot(h.x-p.x,h.y-p.y)<(best?.d??12)?{...h,d:Math.hypot(h.x-p.x,h.y-p.y)}:best,null);
  bindNavigation(svg,{pos,bx,by,L,R,T,B,W,H,onRange,allowPan:display?.navigation!==false,panButton:display?.panButton??0,wheelZoom:display?.wheelZoom===true,
    preview:(dx,dy)=>{moving.setAttribute('transform',`translate(${dx} ${dy})`);references.setAttribute('transform',`translate(0 ${dy})`);},
    hover:p=>{const h=closest(p);if(h)onHover(h);},
    click:p=>{const h=closest(p);if(h){const key=`${h.c.id}/${h.p.pointId}/${h.p.sampleId}`;const now=Date.now();const double=lastPick.key===key&&now-lastPick.time<400;lastPick={key,time:now};onSelect(h,double);}}
  });
  if(display?.edit)svg.oncontextmenu=e=>e.preventDefault();
  else bindPlotCopy(svg,()=>{
    const detached=document.createElement('div');
    const fixedAxes=structuredClone(axes);
    for(const [key,b] of [['x',bx],['y',by]]){fixedAxes[key].min=b.inverse(b.lo);fixedAxes[key].max=b.inverse(b.hi);}
    return renderPlot(detached,inputCurves,fixedAxes,selected,()=>{},()=>{},()=>{},display,{width:800,height:500}).svg;
  });
  return {svg,hidden,counts,trendWarnings,geometry:{L,T,pw,ph,px,py,bx}};
}
