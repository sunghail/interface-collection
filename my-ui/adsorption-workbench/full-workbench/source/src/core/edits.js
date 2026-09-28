import { captureCoordinate, validatePresetLibrary } from './presets.js';
import { validateSampleSelection } from './point-selection.js';
import { validateEditVariant } from './edit-settings.js';
import { defaultAxes } from './workspace.js';

export const emptyEditLibrary = () => ({version:1, revision:0, edits:[]});
export function validateEditLibrary(value) {
  if (!value || !Array.isArray(value.edits)) throw new Error('편집본 목록이 올바르지 않습니다.');
  validatePresetLibrary({...value, selectedPresetId:null, presets:[{id:'edit-library',name:'편집본',coordinates:value.edits}]});
  for (const record of value.edits) {
    const entries=record.workspace.entries;
    if(entries.length!==1 || record.workspace.view.mode!=='kinetic' || !entries[0].editVariant || entries[0].pointId!==entries[0].editVariant.pointId) throw new Error('편집본은 한 개의 시간 구간이어야 합니다.');
  }
  return value;
}
export function createDraft(entry, view) {
  const point=entry.measurement.points.find(p=>p.id===entry.pointId);
  if(!point?.samples.length) throw new Error('시간 데이터가 있는 구간을 선택하세요.');
  const variant=entry.editVariant?.pointId===entry.pointId?entry.editVariant:null;
  const trend=variant?.trend ?? {enabled:!!view.display?.trend,strength:view.display?.strength??2,min:view.mode==='kinetic'&&view.axes.x.min!==null?Math.max(0,view.axes.x.min):null,max:view.mode==='kinetic'&&view.axes.x.max>0?view.axes.x.max:null};
  const axes=structuredClone(view.axes); axes.x.scale='linear';
  if(view.mode!=='kinetic'){Object.assign(axes,defaultAxes());axes.y.scale='log';}
  return {name:variant?.name??`${entry.alias} · ${entry.pointId} 편집`.slice(0,100),preprocess:variant?.preprocess??false,excluded:[...(entry.excludedSamples?.[entry.pointId]??[])],trend:structuredClone(trend),selectedTrend:structuredClone(variant?.selectedTrend??{enabled:false,sampleIds:[]}),axes,kineticValue:view.kineticValue??'residual',unit:view.unit??'kPa',kineticTable:structuredClone(view.kineticTable)};
}
export function editHistory(initial) {
  let states=[structuredClone(initial)], cursor=0;
  return {
    get value(){return structuredClone(states[cursor]);},
    get canUndo(){return cursor>0;},get canRedo(){return cursor<states.length-1;},
    commit(next){if(JSON.stringify(next)===JSON.stringify(states[cursor]))return;states=states.slice(0,cursor+1);states.push(structuredClone(next));cursor++;},
    undo(){if(cursor>0)cursor--;return this.value;},redo(){if(cursor<states.length-1)cursor++;return this.value;},
  };
}
export function changeExclusions(draft, ids, exclude) {
  const next=structuredClone(draft), set=new Set(next.excluded);
  for(const id of ids)exclude?set.add(id):set.delete(id);
  next.excluded=[...set].sort();
  if(exclude&&next.selectedTrend){next.selectedTrend.sampleIds=next.selectedTrend.sampleIds.filter(id=>!set.has(id));if(next.selectedTrend.sampleIds.length<3)next.selectedTrend.enabled=false;}
  return next;
}
export function saveEdit(library, entry, draft, existingId=null) {
  validateEditLibrary(library);
  const name=draft.name.trim();
  if(!name || name.length>100)throw new Error('편집본 이름을 1–100자로 입력하세요.');
  if(library.edits.some(e=>e.id!==existingId&&e.name===name))throw new Error('같은 편집본 이름이 있습니다. 다른 이름을 입력하세요.');
  const existing=existingId?library.edits.find(e=>e.id===existingId):null;
  if(existingId&&!existing)throw new Error('갱신할 편집본이 없습니다. 새 편집본으로 저장하세요.');
  if(existing && (existing.workspace.entries[0].hash!==entry.hash || existing.workspace.entries[0].pointId!==entry.pointId))throw new Error('갱신할 편집본의 원본 구간이 다릅니다.');
  const id=existingId??crypto.randomUUID();
  const edited={...entry,id:crypto.randomUUID(),alias:name,labelMode:'custom',visible:true,excludedSamples:{[entry.pointId]:[...draft.excluded]},editVariant:{id,name,pointId:entry.pointId,preprocess:draft.preprocess??false,trend:structuredClone(draft.trend),selectedTrend:structuredClone(draft.selectedTrend??{enabled:false,sampleIds:[]})}};
  validateSampleSelection(edited,entry.measurement);validateEditVariant(edited.editVariant,entry.measurement);
  const view={activeId:edited.id,mode:'kinetic',unit:draft.unit??'kPa',branch:'all',kineticValue:draft.kineticValue??'residual',kineticTable:structuredClone(draft.kineticTable),axes:structuredClone(draft.axes),display:{method:'raw',strength:2,trend:false,overlay:false,edit:false}};
  const {coordinate,sources}=captureCoordinate([edited],view);
  coordinate.id=id;coordinate.name=name;coordinate.updatedAt=new Date().toISOString();coordinate.createdAt=existing?.createdAt??coordinate.createdAt;
  const next=structuredClone(library);
  if(existing)next.edits[next.edits.findIndex(e=>e.id===id)]=coordinate;else next.edits.push(coordinate);
  validateEditLibrary(next);return {library:next,record:coordinate,sources};
}
