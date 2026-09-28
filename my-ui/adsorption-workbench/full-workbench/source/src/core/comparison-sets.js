import {curveFor} from './data.js';
import {pointsFor} from './branches.js';
import {editCurve} from './kinetic-edit.js';
import {validateAxes} from './data.js';
import {validateEditVariant} from './edit-settings.js';
import {createDraft} from './edits.js';
import {defaultAxes} from './workspace.js';
export function sortComparisonItems(set,key,direction='asc'){
  if(!['temperature','pressure'].includes(key)||!['asc','desc'].includes(direction))throw Error('정렬 기준을 확인하세요.');
  set.items.sort((a,b)=>{const av=a[key],bv=b[key];if(!Number.isFinite(av))return Number.isFinite(bv)?1:0;if(!Number.isFinite(bv))return -1;return (av-bv)*(direction==='asc'?1:-1);});
}
export function moveComparisonItem(set,id,targetId){
  const from=set.items.findIndex(i=>i.id===id),to=set.items.findIndex(i=>i.id===targetId);
  if(from<0||to<0||from===to)return;
  const [item]=set.items.splice(from,1);set.items.splice(to,0,item);
}
export const emptyComparisons=()=>({version:1,revision:0,sets:[]});
export const comparisonPointKey=(p,index)=>String(p.sampleId??p.pointId??`index:${index}`);
export function comparisonEditorEntry(item,sourceEntry){
  let base=item.comparisonBase;
  if(!base){
    const point=sourceEntry?.measurement.points.find(p=>p.id===item.pointId);
    if(!point)throw Error('이 구간의 원본을 불러올 수 없습니다. 측정파일을 다시 불러오세요.');
    const times=new Map(item.data.map(p=>[p.sampleId,p.x]));
    base={metadata:structuredClone(sourceEntry.measurement.metadata),points:[{...structuredClone(point),samples:point.samples.filter(s=>times.has(s.id)).map(s=>({...structuredClone(s),values:[times.get(s.id),...s.values.slice(1)]}))}]};
  }
  const d=item.comparisonEdit;
  return {id:item.id,alias:item.label,name:item.sourceName,pointId:item.pointId,measurement:structuredClone(base),excludedSamples:{[item.pointId]:[...(d?.excluded??item.comparisonExcluded??[])]},
    ...(d?{editVariant:{...structuredClone(d),id:item.id,pointId:item.pointId}}:{})};
}
export function applyComparisonEdit(item,entry,draft){
  item.comparisonBase=structuredClone(entry.measurement);
  item.comparisonEdit=structuredClone(draft);
  item.comparisonExcluded=[];
}
export function comparisonItemData(item,value='residual',includeExcluded=false){
  const excluded=new Set(item.comparisonExcluded??[]);
  return (value==='pressure'?item.pressureData:item.data).map((p,index)=>({...p,comparisonKey:comparisonPointKey(p,index),excluded:excluded.has(comparisonPointKey(p,index))})).filter(p=>includeExcluded||!p.excluded);
}
export const newComparison=(kind)=>({id:crypto.randomUUID(),name:'새 비교 세트',kind,min:null,max:null,scale:'log',value:'residual',items:[]});
export function comparisonCandidates(entries,kind){
  return entries.flatMap(entry=>kind==='kinetic'
    ? pointsFor(entry.measurement,'all').filter(p=>p.samples.length&&(!entry.editVariant||p.id===entry.pointId)).map(p=>({entry,point:p,branch:p.branch}))
    : entry.editVariant?[]:['adsorption','desorption','unknown'].filter(b=>pointsFor(entry.measurement,b).length).map(branch=>({entry,branch})));
}
export function snapshotComparison(candidate,kind){
  const {entry,point,branch}=candidate;
  const get=value=>{
    const c=kind==='kinetic'&&entry.editVariant?editCurve({...entry,pointId:point.id},{...entry.editVariant,excluded:entry.excludedSamples?.[point.id]??[],kineticValue:value})
      :curveFor(entry.measurement,point?.id,kind==='kinetic'?'kinetic':'isotherm','kPa',kind==='kinetic'?'all':branch,value);
    return c.data.filter(p=>!p.excluded&&!entry.excludedSamples?.[point?.id]?.includes(p.sampleId)&&Number.isFinite(p.x)&&Number.isFinite(p.y)).map(p=>({...p}));
  };
  const m=entry.measurement.metadata;
  const editorEntry=kind==='kinetic'?{...entry,pointId:point.id}:null;
  const editorState=editorEntry?{
    comparisonBase:{metadata:structuredClone(m),points:[structuredClone(point)]},
    comparisonEdit:createDraft(editorEntry,{mode:'kinetic',unit:'kPa',axes:defaultAxes(),kineticValue:'residual'})
  }:{};
  return {id:crypto.randomUUID(),key:JSON.stringify([entry.hash,point?.id,branch,entry.editVariant,entry.excludedSamples]),hash:entry.hash,sourceName:entry.name,
    ...editorState,
    label:entry.alias,temperature:m.temperature_K,gas:m.gas,pressure:point?.equilibrium.pressure??null,pointId:point?.id??null,branch,
    edited:!!entry.editVariant||!!entry.excludedSamples?.[point?.id]?.length,visible:true,color:null,min:null,max:null,
    data:get('residual'),pressureData:kind==='kinetic'?get('pressure'):[]};
}
export function comparisonCurves(set){
  return set.items.filter(i=>i.visible).map(i=>{
    const edited=set.kind==='kinetic'&&i.comparisonEdit?editCurve(comparisonEditorEntry(i),{...i.comparisonEdit,excluded:[...new Set([...i.comparisonEdit.excluded,...(i.comparisonExcluded??[])])],kineticValue:set.value},'kPa'):null;
    const mins=[edited?.timeRange?.min,set.min].filter(v=>v!=null),maxs=[edited?.timeRange?.max,set.max].filter(v=>v!=null);
    const timeRange={min:mins.length?Math.max(...mins):null,max:maxs.length?Math.min(...maxs):null};
    return {...edited,id:i.id,name:`${i.label} · ${i.temperature} K${i.pressure==null?'':` · ${i.pressure.toFixed(2)} kPa`}`,color:i.color,
    timeRange,
    pointsOnly:set.kind==='kinetic',xLabel:set.kind==='kinetic'?'Time (s)':'Pressure (kPa)',yLabel:set.kind==='isotherm'?'Uptake (cm³ STP/g)':set.value==='pressure'?'Pressure (kPa)':'(C − Ce) / (C0 − Ce)',
    data:(edited?edited.data.filter(p=>!p.excluded):comparisonItemData(i,set.kind==='kinetic'?set.value:'residual')).filter(p=>(set.min==null||p.x>=set.min)&&(set.max==null||p.x<=set.max))};});
}
export function validateComparisons(v){
  if(v?.version!==1||!Number.isInteger(v.revision)||!Array.isArray(v.sets))throw Error('비교 세트 형식이 올바르지 않습니다.');
  for(const s of v.sets){
    if(!s.name?.trim()||!['kinetic','isotherm'].includes(s.kind)||!['log','linear'].includes(s.scale)||!['residual','pressure'].includes(s.value)||!Array.isArray(s.items))throw Error('비교 세트 설정을 확인하세요.');
    if([s.min,s.max].some(v=>v!=null&&!Number.isFinite(v))||s.min!=null&&s.max!=null&&s.min>=s.max)throw Error('구간 시작은 끝보다 작아야 합니다.');
    for(const i of s.items){
      if(i.comparisonEdit){
        if(s.kind!=='kinetic'||!i.comparisonBase?.points?.length)throw Error('비교 그래프 편집 원본을 확인하세요.');
        const entry=comparisonEditorEntry(i);validateAxes(i.comparisonEdit.axes);validateEditVariant(entry.editVariant,entry.measurement);
        if(!Array.isArray(i.comparisonEdit.excluded)||!i.comparisonEdit.excluded.every(id=>entry.measurement.points[0].samples.some(p=>p.id===id)))throw Error('비교 제외점을 확인하세요.');
      }
      if(i.comparisonExcluded!=null&&(!Array.isArray(i.comparisonExcluded)||!i.comparisonExcluded.every(k=>typeof k==='string')))throw Error('비교 편집점을 확인하세요.');
      if(typeof i.label!=='string'||!Number.isFinite(i.temperature)||!Array.isArray(i.data)||!Array.isArray(i.pressureData)||![...i.data,...i.pressureData].every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))throw Error('비교 곡선을 확인하세요.');
      if([i.min,i.max].some(v=>v!=null&&!Number.isFinite(v))||i.min!=null&&i.max!=null&&i.min>=i.max)throw Error('구간 시작은 끝보다 작아야 합니다.');
    }
  }return v;
}
