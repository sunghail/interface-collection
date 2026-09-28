export function validateEditVariant(variant, measurement) {
  if (variant === undefined) return;
  if(variant?.preprocess!==undefined&&typeof variant.preprocess!=='boolean')throw new Error('전처리 설정이 올바르지 않습니다.');
  const t = variant?.trend;
  if (!variant || typeof variant.id !== 'string' || !variant.id || typeof variant.name !== 'string' || !variant.name.trim() || variant.name.length > 100 || !measurement.points.some(p => p.id === variant.pointId && p.samples.length)) throw new Error('편집본의 이름·원본 구간이 올바르지 않습니다.');
  if (!t || typeof t.enabled !== 'boolean' || !Number.isInteger(t.strength) || t.strength < 1 || t.strength > 5 || [t.min,t.max].some(v => v !== null && (!Number.isFinite(v) || v < 0)) || t.min !== null && t.max !== null && t.min >= t.max) throw new Error('편집본의 추세선 시간·강도가 올바르지 않습니다.');
  const selected=variant.selectedTrend;
  if(selected!==undefined){
    if(selected.toEquilibrium!==undefined&&typeof selected.toEquilibrium!=='boolean')throw new Error('평형 연장 설정이 올바르지 않습니다.');
    const point=measurement.points.find(p=>p.id===variant.pointId);
    if(!selected||typeof selected.enabled!=='boolean'||!Array.isArray(selected.sampleIds)||new Set(selected.sampleIds).size!==selected.sampleIds.length||selected.sampleIds.some(id=>!point.samples.some(s=>s.id===id))||selected.enabled&&selected.sampleIds.length<3)throw new Error('선택점 추세선의 기준점이 올바르지 않습니다.');
  }
}
