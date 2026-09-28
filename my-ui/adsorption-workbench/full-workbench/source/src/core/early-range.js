export function earlyRange(item,end=item.earlyEnd){
  const data=item.data.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
  if(!data.length)return null;
  const min=Math.min(...data.map(p=>p.x)),max=Math.max(...data.map(p=>p.x));
  const proposed=Number.isFinite(end)?end:min+(max-min)*.1;
  const until=Math.max(min,Math.min(max,proposed));
  return {min,max,end:until,points:data.filter(p=>p.x>=min&&p.x<=until),confirmed:Number.isFinite(item.earlyEnd)};
}
