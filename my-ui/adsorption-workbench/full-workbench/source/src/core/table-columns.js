export const kineticColumns = [
  {id:'sample',label:()=> '샘플',index:0},
  {id:'time',label:()=> 'Time (s)',index:1},
  {id:'c',label:unit=>`C (${unit})`,index:2},
  {id:'p0',label:unit=>`Estimated P₀ (${unit})`,index:3},
  {id:'ce',label:unit=>`Cen (${unit})`,index:4},
  {id:'pt',label:unit=>`Pt (${unit})`,index:5},
  {id:'pi',label:unit=>`Pi (${unit})`,index:6},
  {id:'vs',label:()=> 'Vs (cm³)',index:7},
  {id:'status',label:()=> '편집 상태',index:8},
];
const ids=kineticColumns.map(c=>c.id);
export function normalizeTableColumns(value) {
  const order=Array.isArray(value?.order)?[...new Set(value.order.filter(id=>ids.includes(id)))]:[];
  order.push(...ids.filter(id=>!order.includes(id)));
  const hidden=Array.isArray(value?.hidden)?ids.filter(id=>value.hidden.includes(id)):[];
  return {order,hidden:hidden.length===ids.length?[]:hidden};
}
export function visibleTableColumns(value) {
  const {order,hidden}=normalizeTableColumns(value);
  return order.filter(id=>!hidden.includes(id)).map(id=>kineticColumns.find(c=>c.id===id));
}
export function moveTableColumn(order,from,to) {
  const next=[...order],start=next.indexOf(from),end=next.indexOf(to);
  if(start<0||end<0)return next;
  next.splice(start,1);next.splice(end,0,from);return next;
}
export const tableCellText = value => typeof value==='number'?Number(value.toPrecision(9)).toString():String(value??'—');
