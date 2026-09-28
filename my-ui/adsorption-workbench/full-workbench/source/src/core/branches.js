// Direction-based inference only; original points are never mutated.
export const branchLabels = { adsorption: 'Adsorption (추정)', desorption: 'Desorption (추정)', unknown: '미분류' };
export function classifyPoints(measurement) {
  const points = measurement.points;
  const direction = (a,b) => {
    const delta = b-a, tolerance = 1e-8 * Math.max(1,Math.abs(a),Math.abs(b));
    return Math.abs(delta)<=tolerance ? null : delta>0?'adsorption':'desorption';
  };
  let initial='unknown';
  for(let i=1;i<points.length;i++){const d=direction(points[i-1].equilibrium.pressure,points[i].equilibrium.pressure);if(d){initial=d;break;}}
  let branch=initial, segment=0;
  return points.map((point,i)=>{
    const next=i?direction(points[i-1].equilibrium.pressure,point.equilibrium.pressure):null;
    const changed=!!next&&next!==branch;
    if(changed){branch=next;segment++;}
    return { ...point, branch, segment, breakBefore: changed };
  });
}
export function pointsFor(measurement, filter='all') {
  if(!['all','adsorption','desorption','unknown'].includes(filter))throw new Error('지원하지 않는 구간 분류입니다.');
  return classifyPoints(measurement).filter(p=>filter==='all'||p.branch===filter);
}
