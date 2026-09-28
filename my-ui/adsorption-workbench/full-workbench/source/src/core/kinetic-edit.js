import {curveFor,pressureFactor,residualFraction} from './data.js';

export const inTimeRange=(time,range)=> (range.min==null||time>=range.min)&&(range.max==null||time<=range.max);
export function preprocessingInfo(entry,draft) {
  const samples=entry.measurement.points.find(p=>p.id===entry.pointId)?.samples??[];
  const removed=new Set();let shift=0,leading=true;
  if(draft.preprocess)for(const s of samples){
    const remove=residualFraction(s.values)>=1;
    if(remove)removed.add(s.id);
    if(leading&&remove)shift=s.values[0];else leading=false;
  }
  return {removed,shift};
}
export function editSamples(entry,draft) {
  const {removed,shift}=preprocessingInfo(entry,draft);
  return (entry.measurement.points.find(p=>p.id===entry.pointId)?.samples??[])
    .filter(s=>!removed.has(s.id)).map(s=>({...s,originalTime:s.values[0],values:[s.values[0]-shift,...s.values.slice(1)]}));
}
export function editPoints(entry,draft) {
  const {removed,shift}=preprocessingInfo(entry,draft);
  return curveFor(entry.measurement,entry.pointId,'kinetic','kPa','all','residual').data
    .filter(p=>!removed.has(p.sampleId)).map(p=>({...p,x:p.x-shift,originalX:p.x,excluded:draft.excluded.includes(p.sampleId)}));
}
export function usableBasis(entry,draft,ids) {
  const selected=new Set(ids);
  return editPoints(entry,draft).filter(p=>selected.has(p.sampleId)&&!p.excluded&&inTimeRange(p.x,draft.trend)&&p.y>0&&p.y<=1).map(p=>p.sampleId);
}
export function cleanEditBasis(entry,draft) {
  const next=structuredClone(draft);
  next.selectedTrend.sampleIds=usableBasis(entry,next,next.selectedTrend.sampleIds);
  if(next.selectedTrend.sampleIds.length<3)next.selectedTrend.enabled=false;
  return next;
}
export function editCurve(entry,draft,unit=draft.unit??'kPa') {
  const mode=draft.kineticValue??'residual',p=entry.measurement.points.find(p=>p.id===entry.pointId);
  const normalized=editPoints(entry,draft).filter(p=>inTimeRange(p.x,draft.trend));
  const curve=curveFor(entry.measurement,entry.pointId,'kinetic',unit,'all',mode),factor=pressureFactor(unit);
  const first=p?.samples[0]?.values, c0=first?.[2]*factor,ce=first?.[3]*factor;
  const {removed,shift}=preprocessingInfo(entry,draft),end=p?.samples.at(-1)?.values[0]-shift;
  return {...curve,xLabel:draft.preprocess?'전처리 시간 (s)':'시간 (s)',preprocessing:{enabled:!!draft.preprocess,removed:removed.size,shift},data:curve.data.filter(p=>!removed.has(p.sampleId)&&inTimeRange(p.x-shift,draft.trend)).map(p=>({...p,x:p.x-shift,originalX:p.x,excluded:draft.excluded.includes(p.sampleId)})),
    timeRange:{min:draft.trend.min,max:draft.trend.max},trendData:normalized,trendPressure:mode==='pressure'?{c0,ce}:null,
    trendSettings:{...draft.trend,startAtOne:true},
    selectedTrendSettings:{...draft.trend,...draft.selectedTrend,extendTo:draft.selectedTrend.toEquilibrium?Math.min(end,draft.trend.max??end):undefined},
    referenceY:mode==='pressure'?c0:undefined,
    equilibriumY:draft.selectedTrend.toEquilibrium?(mode==='pressure'?ce:0):undefined};
}
