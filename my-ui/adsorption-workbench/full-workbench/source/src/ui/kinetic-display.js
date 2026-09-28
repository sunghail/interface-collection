// Display-only selection: every result is an unchanged input object, in order.
export const displayMethods = {
  raw: ['원본', '모든 측정점을 표시합니다.'],
  trend: ['① 추세 대표점', '로그 시간 곡선 추세에 가까운 원본 점을 선택합니다.'],
  bend: ['② 작은 굴곡 제거', '앞뒤 점 사이에서 작은 굴곡을 만드는 점을 차례로 숨깁니다.'],
  monotone: ['③ 하강점 연결', '추세 대표점 중 압력이 올라가지 않는 가장 긴 점열을 선택합니다. 시작·끝 점이 제외될 수 있습니다.'],
  smooth: ['④ 매끄러운 하강', 'Normalized response 전용 · 1 이하부터 곡선 흐름에 맞는 원본 점을 선택하고, 반복 흔들림 구간은 일찍 종료합니다.'],
};

// Fit y = a + b log(1 + elapsed / scale) locally. The time axis shown
// to the user stays unchanged; this curve is only a point-selection guide.
export function logTimeTrend(points, origin, scale) {
  const u=x=>Math.log1p(Math.max(0,x-origin)/scale);
  const n=points.length;
  if(!n)return ()=>0;
  let mx=0,my=0;
  for(const p of points){mx+=u(p.x)/n;my+=p.y/n;}
  let cov=0,variance=0;
  for(const p of points){const dx=u(p.x)-mx;cov+=dx*(p.y-my);variance+=dx*dx;}
  const slope=variance>1e-12?cov/variance:0;
  return x=>my+slope*(u(x)-mx);
}

function representatives(points, px, py, strength) {
  const coords=points.map(p=>({x:px(p.x),y:py(p.y)}));
  const origin=points[0].x;
  const firstLater=points.find(p=>p.x>origin);
  const scale=firstLater?firstLater.x-origin:1;
  const width=6+strength*5, result=[0];
  let start=1;
  while(start<points.length-1){
    let end=start+1;
    while(end<points.length-1 && Math.hypot(coords[end].x-coords[start].x,coords[end].y-coords[start].y)<width)end++;
    const lo=Math.max(0,start-2),hi=Math.min(points.length,end+2);
    const trend=logTimeTrend(points.slice(lo,hi),origin,scale);
    let best=start,score=Infinity;
    for(let j=start;j<end;j++){const predicted=trend(points[j].x),screen=py(predicted);const d=Number.isFinite(screen)?Math.abs(coords[j].y-screen):Math.abs(points[j].y-predicted);if(d<score){best=j;score=d;}}
    result.push(best);start=end;
  }
  result.push(points.length-1);return result.map(i=>points[i]);
}

export function selectDisplayPoints(points, method='raw', strength=2, px=p=>p, py=p=>p) {
  if(method==='smooth')return smoothDescent(points,strength);
  if(method==='raw'||points.length<3)return points.slice();
  strength=Math.max(1,Math.min(5,Number(strength)||2));
  if(method==='trend')return representatives(points,px,py,strength);
  if(method==='monotone'){
    const candidates=representatives(points,px,py,strength);
    const lengths=candidates.map(()=>1),previous=candidates.map(()=>-1);
    let best=0;
    for(let i=0;i<candidates.length;i++){
      for(let j=0;j<i;j++)if(candidates[j].y>=candidates[i].y&&lengths[j]+1>lengths[i]){lengths[i]=lengths[j]+1;previous[i]=j;}
      if(lengths[i]>lengths[best])best=i;
    }
    const result=[];for(let i=best;i>=0;i=previous[i])result.push(candidates[i]);return result.reverse();
  }
  if(method==='bend'){
    const kept=points.map((p,i)=>i),tolerance=strength*.6;
    const x=points.map(p=>px(p.x)),y=points.map(p=>py(p.y));
    while(kept.length>2){
      let best=-1,min=Infinity;
      for(let k=1;k<kept.length-1;k++){
        const a=kept[k-1],b=kept[k],c=kept[k+1],dx=x[c]-x[a],dy=y[c]-y[a];
        const d=Math.abs(dx*(y[b]-y[a])-dy*(x[b]-x[a]))/(Math.hypot(dx,dy)||1);
        // Limit the accumulated deviation against ALL skipped original points.
        if(d>=min||d>tolerance)continue;
        let error=0;
        for(let j=a+1;j<c;j++)error=Math.max(error,Math.abs(dx*(y[j]-y[a])-dy*(x[j]-x[a]))/(Math.hypot(dx,dy)||1));
        if(error<=tolerance){min=d;best=k;}
      }
      if(best<0)break;kept.splice(best,1);
    }
    return kept.map(i=>points[i]);
  }
  return points.slice();
}

const median=a=>{const s=a.slice().sort((a,b)=>a-b);return s.length?s[Math.floor(s.length/2)]:0;};

export function smoothDescent(points,strength=2) {
  strength=Math.max(1,Math.min(5,Number(strength)||2));
  const start=points.findIndex(p=>Number.isFinite(p.y)&&p.y>0&&p.y<=1);
  if(start<0)return [];
  // Estimate a display noise floor only when the tail repeats or reverses.
  // This is a visual heuristic, not an instrument detection limit.
  const tail=points.slice(Math.max(start,points.length-Math.max(8,Math.ceil(points.length/3))));
  const changes=tail.slice(1).map((p,i)=>p.y-tail[i].y).filter(Number.isFinite);
  const unsettled=changes.filter(d=>d>=0).length;
  const floor=changes.length>=5&&unsettled/changes.length>.3
    ?median(changes.filter(d=>Math.abs(d)>1e-14).map(Math.abs))*(1+strength*.4):0;
  const data=[];
  for(let i=start;i<points.length;i++){
    const p=points[i];
    if(!Number.isFinite(p.y)||p.y<=0||p.breakBefore&&i>start)break;
    if(data.length>=3&&p.y<=floor)break;
    if(!data.length||p.x>data.at(-1).x)data.push(p);
  }
  if(data.length<3)return data.length===2&&data[1].y>=data[0].y?[data[0]]:data;
  const x=data.map(p=>p.x),y=data.map(p=>Math.log10(p.y)),n=data.length;
  // Local regression in time–log(residual) coordinates forms a curved guide.
  const radius=2+Math.ceil(strength/2);
  const guide=y.map((_,i)=>{
    const lo=Math.max(0,i-radius),hi=Math.min(n,i+radius+1);
    let mx=0,my=0;for(let j=lo;j<hi;j++){mx+=x[j]/(hi-lo);my+=y[j]/(hi-lo);}
    let cov=0,v=0;for(let j=lo;j<hi;j++){cov+=(x[j]-mx)*(y[j]-my);v+=(x[j]-mx)**2;}
    return my+(v?cov/v:0)*(x[i]-mx);
  });
  const tolerance=.008+.004*strength,span=x.at(-1)-x[0],height=Math.max(.1,Math.max(...y)-Math.min(...y));
  const costs=Array.from({length:n},()=>Array(n).fill(Infinity));
  const angles=Array.from({length:n},()=>Array(n).fill(0));
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
    if(y[j]>=y[i])continue;
    let error=0;
    for(let k=i+1;k<=j;k++){
      const predicted=y[i]+(y[j]-y[i])*(x[k]-x[i])/(x[j]-x[i]);
      error+=((predicted-guide[k])/tolerance)**2;
    }
    costs[i][j]=error+strength;
    angles[i][j]=Math.atan2((y[i]-y[j])/height,(x[j]-x[i])/span);
  }
  // Pair-state dynamic programming balances guide fit, sparse points and bends.
  const dp=Array.from({length:n},()=>Array(n).fill(Infinity));
  const previous=Array.from({length:n},()=>Array(n).fill(-1));
  for(let j=1;j<n;j++)dp[0][j]=costs[0][j];
  for(let i=1;i<n;i++)for(let j=i+1;j<n;j++){
    if(!Number.isFinite(costs[i][j]))continue;
    for(let h=0;h<i;h++){
      const score=dp[h][i]+costs[i][j]+20*strength*(angles[h][i]-angles[i][j])**2;
      if(score<dp[i][j]){dp[i][j]=score;previous[i][j]=h;}
    }
  }
  let end=n-1;
  while(end>0&&!dp.some(row=>Number.isFinite(row[end])))end--;
  if(!end)return [data[0]];
  let best=0;for(let i=1;i<end;i++)if(dp[i][end]<dp[best][end])best=i;
  const chosen=[end];let i=best,j=end;
  while(i>=0){chosen.push(i);const h=previous[i][j];j=i;i=h;}
  return chosen.reverse().map(i=>data[i]);
}
