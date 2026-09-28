// Per-file, per-step display/fit exclusions. Raw measurements are never edited.
export function isSampleExcluded(entry,pointId,sampleId) {
  return (entry.excludedSamples?.[pointId]??[]).includes(sampleId);
}
export function toggleSample(entry,pointId,sampleId) {
  const point=entry.measurement.points.find(p=>p.id===pointId);
  if(!point?.samples.some(s=>s.id===sampleId))throw new Error('선택할 원본 샘플을 찾을 수 없습니다.');
  entry.excludedSamples??={};
  const ids=new Set(entry.excludedSamples[pointId]??[]);
  if(ids.has(sampleId))ids.delete(sampleId);else ids.add(sampleId);
  entry.excludedSamples[pointId]=[...ids];
}
export function validateSampleSelection(entry,measurement) {
  if(entry.excludedSamples===undefined)return;
  if(!entry.excludedSamples||typeof entry.excludedSamples!=='object'||Array.isArray(entry.excludedSamples))throw new Error('저장된 점 선택 정보가 올바르지 않습니다.');
  for(const [pointId,ids] of Object.entries(entry.excludedSamples)){
    const point=measurement.points.find(p=>p.id===pointId);
    if(!point||!Array.isArray(ids)||ids.some(id=>!point.samples.some(s=>s.id===id)))throw new Error('저장된 제외점이 원본과 일치하지 않습니다.');
  }
}
