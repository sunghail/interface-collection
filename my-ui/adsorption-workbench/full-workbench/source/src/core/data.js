import { pointsFor } from './branches.js';
// Measurement pressures in the supplied HP-194 / 1.4.11 RAT files are kPa.
// Header P0 is separately stored as Torr and is not converted here.
const factors = { Torr: 760 / 101.325, kPa: 1, Pa: 1000 };
export function pressureFactor(unit) {
  if (!(unit in factors)) throw new Error('지원하지 않는 압력 단위입니다.');
  return factors[unit];
}
export function expectedPressure(measurement, pointId, unit) {
  const value=measurement.points.find(p=>p.id===pointId)?.samples[0]?.values[2];
  return Number.isFinite(value)?value*pressureFactor(unit):null;
}
export function residualFraction(values) {
  const [,c,c0,ce]=values,denominator=c0-ce;
  const tolerance=1e-12*Math.max(1,Math.abs(c0),Math.abs(ce));
  if(![c,c0,ce].every(Number.isFinite)||Math.abs(denominator)<=tolerance)return NaN;
  return (c-ce)/denominator;
}
export function curveFor(measurement, pointId, mode, unit, branch='all', kineticValue='pressure') {
  const f = pressureFactor(unit);
  if (mode === 'isotherm') return { xLabel: `Pressure (${unit})`, yLabel: 'Uptake (cm³ STP/g)', data: pointsFor(measurement,branch).map(p => ({ x: p.equilibrium.pressure * f, y: p.equilibrium.uptake, pointId: p.id, sampleId: null, branch:p.branch, breakBefore:p.breakBefore })) };
  const p = pointsFor(measurement,branch).find(p => p.id === pointId);
  if(kineticValue==='residual'){
    const data=(p?.samples??[]).map(s=>({x:s.values[0],y:residualFraction(s.values),pointId:p.id,sampleId:s.id}));
    return {xLabel:'Time (s)',yLabel:'(C − Cen) / (C0n − Cen) [−]',pointsOnly:true,data,invalid:data.filter(p=>!Number.isFinite(p.y)).length};
  }
  return { xLabel: 'Time (s)', yLabel: `Pressure (${unit})`, pointsOnly:true, data: (p?.samples ?? []).map(s => ({ x: s.values[0], y: s.values[4] * f, pointId: p.id, sampleId: s.id })) };
}
export function csvExport(m, pointId, mode, unit, branch='all') {
  const quote = v => `"${String(v).replaceAll('"', '""')}"`;
  const rows = mode === 'isotherm'
    ? [['source', 'point', `pressure_${unit}`, 'uptake_cm3_STP_g','branch_inferred'], ...pointsFor(m,branch).map(p => [m.source.name, p.index, p.equilibrium.pressure * pressureFactor(unit), p.equilibrium.uptake,p.branch])]
    : [['source', 'point', 'sample', 'time_s', `C_${unit}`, `C0n_${unit}`, `Cen_${unit}`, `Pt_${unit}`, `Pi_${unit}`, 'Vs_cm3'], ...(pointsFor(m,branch).find(p => p.id === pointId)?.samples ?? []).map(s => [m.source.name, pointId, s.id, s.values[0], ...s.values.slice(1, 6).map(v => v * pressureFactor(unit)), s.values[6]])];
  return '\uFEFF' + rows.map(r => r.map(quote).join(',')).join('\r\n');
}
export function validateAxes(axes) {
  for (const axis of ['x', 'y']) {
    const a = axes[axis];
    if (!a || !['linear', 'log'].includes(a.scale)) throw new Error('축 스케일이 올바르지 않습니다.');
    if (a.min !== null && !Number.isFinite(a.min) || a.max !== null && !Number.isFinite(a.max)) throw new Error('축 범위에는 숫자를 입력하세요.');
    if (a.min !== null && a.max !== null && a.min >= a.max) throw new Error(`${axis.toUpperCase()}축 최소는 최대보다 작아야 합니다.`);
    if (a.scale === 'log' && [a.min, a.max].some(v => v !== null && v <= 0)) throw new Error('로그축 범위는 양수여야 합니다.');
    if (a.step !== null && (!Number.isFinite(a.step) || a.step <= 0)) throw new Error('눈금 간격은 양수여야 합니다.');
  }
}
