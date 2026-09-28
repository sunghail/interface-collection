import { curveFor, expectedPressure } from './data.js';
import { editCurve } from './kinetic-edit.js';
import { pointsFor } from './branches.js';

export const emptyFittingLibrary = () => ({version:1, revision:0, sets:[]});
export function validateFittingLibrary(value) {
  if(value?.version!==1 || !Number.isInteger(value.revision) || !Array.isArray(value.sets)) throw new Error('피팅 세트 저장 형식을 확인할 수 없습니다.');
  for(const set of value.sets) {
    for(const item of set.items??[])if(item.earlyEnd!=null&&(!Number.isFinite(item.earlyEnd)||!item.data?.length||item.earlyEnd<Math.min(...item.data.map(p=>p.x))||item.earlyEnd>Math.max(...item.data.map(p=>p.x))))throw new Error('초기 감소 구간의 종료 시간이 유효하지 않습니다.');
    if(typeof set.id!=='string'||typeof set.name!=='string'||!Array.isArray(set.items)||!['peq','p0'].includes(set.basis)||!Number.isFinite(set.step)||set.step<=0) throw new Error('피팅 세트 조건이 올바르지 않습니다.');
    for(const item of set.items) if(typeof item.id!=='string'||!Array.isArray(item.data)||!item.data.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))) throw new Error('피팅 세트 곡선이 올바르지 않습니다.');
  }
  return value;
}
export const newFittingSet = (name='새 피팅 세트') => ({id:crypto.randomUUID(),name,basis:'peq',step:10,items:[]});
export const pressureText = value => Number.isFinite(value)?value.toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:2,useGrouping:false}):'—';
export const itemPressure = (item,basis) => basis==='p0'?item.p0:item.peq;
export function pressureGroup(item,set) {
  const p=itemPressure(item,set.basis);
  return Number.isFinite(p)?Number((Math.round(p/set.step)*set.step).toFixed(8)):null;
}
export function conditionMatrix(set) {
  const temperatures=[...new Set(set.items.map(item=>item.temperature))].sort((a,b)=>a===null?1:b===null?-1:a-b);
  const pressures=[...new Set(set.items.map(item=>pressureGroup(item,set)))].sort((a,b)=>a===null?1:b===null?-1:a-b);
  return {temperatures,pressures,rows:temperatures.map(temperature=>({temperature,cells:pressures.map(pressure=>({pressure,items:set.items.filter(item=>item.temperature===temperature&&pressureGroup(item,set)===pressure)}))}))};
}
export function fittingCandidates(entries) {
  return entries.flatMap(entry=>pointsFor(entry.measurement,'all').filter(point=>point.samples.length&&(!entry.editVariant||point.id===entry.pointId)).map(point=>({entry,point,key:JSON.stringify([entry.hash,point.id,entry.editVariant??null,entry.excludedSamples?.[point.id]??[]])})));
}
export function snapshotCandidate({entry,point,key}) {
  const excluded=entry.excludedSamples?.[point.id]??[];
  const source={...entry,pointId:point.id};
  const curve=entry.editVariant?editCurve(source,{...entry.editVariant,excluded,kineticValue:'residual'}):curveFor(entry.measurement,point.id,'kinetic','kPa','all','residual');
  const data=curve.data.filter(p=>!p.excluded&&!excluded.includes(p.sampleId)&&Number.isFinite(p.x)&&Number.isFinite(p.y)).map(({x,y,sampleId})=>({x,y,sampleId}));
  if(!data.length) throw new Error(`${entry.alias} · ${point.id}: 사용할 Kinetic 점이 없습니다.`);
  const temperature=entry.measurement.metadata.temperature_K;
  return {id:crypto.randomUUID(),key,hash:entry.hash,sourceName:entry.name,label:entry.alias,pointId:point.id,gas:entry.measurement.metadata.gas||'미확인',temperature:Number.isFinite(temperature)?temperature:null,peq:Number.isFinite(point.equilibrium.pressure)?point.equilibrium.pressure:null,p0:expectedPressure(entry.measurement,point.id,'kPa'),branch:point.branch,included:true,edited:!!entry.editVariant||excluded.length>0,editSettings:structuredClone(entry.editVariant??null),excluded:[...excluded],data,originalCount:point.samples.length};
}
export function addCandidates(set,candidates) {
  const next=structuredClone(set),keys=new Set(next.items.map(item=>item.key));
  const gas=next.items[0]?.gas;
  const additions=candidates.filter(c=>!keys.has(c.key)).map(snapshotCandidate);
  const gases=new Set([gas,...additions.map(item=>item.gas)].filter(Boolean));
  if(gases.size>1) throw new Error('서로 다른 기체는 별도 피팅 세트로 구성하세요.');
  for(const item of additions)if(!keys.has(item.key)){keys.add(item.key);next.items.push(item);}
  return next;
}
