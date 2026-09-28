// Display fit, separate from observations: smooth log(Y) against log elapsed time.
// Nonpositive samples cannot participate in a logarithmic fit.
export function selectedPointsTrend(points,sampleIds,strength=2,range={}) {
  const ids=new Set(sampleIds);
  return overallTrend(points.filter(p=>ids.has(p.sampleId)),strength,{...range,startAtOne:true});
}
export function overallTrend(points,strength=2,{min=null,max=null,startAtOne=false,extendTo=null}={}) {
  const valid=points.filter(p=>!p.excluded&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.y>0&&(min===null||p.x>=min)&&(max===null||p.x<=max));
  if(valid.length<3)return [];
  if(startAtOne)return descendingTrend(valid,strength,extendTo);
  const start=valid[0].x,end=valid.at(-1).x;
  if(end<=start)return [];
  const scale=valid.find(p=>p.x>start)?.x-start||1;
  const transform=x=>Math.log1p((x-start)/scale);
  const samples=valid.map(p=>({u:transform(p.x),v:Math.log(p.y)}));
  const span=transform(end),bandwidth=span*(.06+.025*Math.max(1,Math.min(5,strength)));
  const result=[];
  for(let i=0;i<=400;i++){
    const u=span*i/400;
    let w=0,sx=0,sy=0,sxx=0,sxy=0;
    for(const p of samples){const dx=p.u-u,weight=Math.exp(-.5*(dx/bandwidth)**2);w+=weight;sx+=weight*dx;sy+=weight*p.v;sxx+=weight*dx*dx;sxy+=weight*dx*p.v;}
    const det=w*sxx-sx*sx;
    const v=det>1e-14?(sy*sxx-sx*sxy)/det:sy/w;
    const y=Math.exp(v);
    if(Number.isFinite(y)&&y>0)result.push({x:start+scale*Math.expm1(u),y,synthetic:true});
  }
  return result;
}

// Constrained display fit: log(y(t)) = -sum(a_j * basis_j(t)), a_j >= 0.
// Every basis is smooth, zero at t=0 and strictly increasing. Thus y(0)=1
// and any nonzero fit decreases immediately, without a joined anchor segment.
// This is a visual trend, not an adsorption kinetic model or altered raw data.
function descendingTrend(points,strength,extendTo) {
  const data=points.filter(p=>p.x>=0&&p.y<=1),end=Math.max(...data.map(p=>p.x));
  if(data.length<3||!(end>0)||!data.some(p=>p.x>0&&p.y<1))return [];
  const first=Math.min(...data.filter(p=>p.x>0).map(p=>p.x));
  const low=Math.max(first/4,end/10000),high=end*4;
  const times=Array.from({length:12},(_,i)=>low*(high/low)**(i/11));
  const basis=t=>[t/end,...times.map(tau=>-Math.expm1(-t/tau)/-Math.expm1(-end/tau))];
  const rows=data.map(p=>basis(p.x)),size=times.length+1;
  const gram=Array.from({length:size},()=>Array(size).fill(0)),rhs=Array(size).fill(0),coef=Array(size).fill(0);
  for(let r=0;r<data.length;r++)for(let j=0;j<size;j++){
    rhs[j]+=rows[r][j]*-Math.log(data[r].y);
    for(let k=0;k<size;k++)gram[j][k]+=rows[r][j]*rows[r][k];
  }
  const ridge=data.length*(.0001+.00015*Math.max(1,Math.min(5,strength))**2);
  for(let j=0;j<size;j++)gram[j][j]+=ridge;
  // Cyclic nonnegative coordinate descent on the convex regularized objective.
  for(let sweep=0;sweep<800;sweep++){
    let change=0;
    for(let j=0;j<size;j++){
      let predicted=0;for(let k=0;k<size;k++)predicted+=gram[j][k]*coef[k];
      const next=Math.max(0,coef[j]+(rhs[j]-predicted)/gram[j][j]);
      change=Math.max(change,Math.abs(next-coef[j]));coef[j]=next;
    }
    if(change<1e-10)break;
  }
  if(!coef.some(c=>c>0))return [];
  const drawEnd=Number.isFinite(extendTo)?Math.max(end,extendTo):end;
  const scale=Math.max(first,end/1000),span=Math.log1p(drawEnd/scale);
  return Array.from({length:401},(_,i)=>{
    const x=i===400?drawEnd:scale*Math.expm1(span*i/400),b=basis(x);
    const loss=b.reduce((sum,v,j)=>sum+v*coef[j],0);
    return {x,y:Math.exp(-loss),synthetic:true};
  });
}
