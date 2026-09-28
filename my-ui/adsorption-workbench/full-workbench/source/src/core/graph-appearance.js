export const defaultGraphAppearance=()=>({xTitleSize:12,yTitleSize:12,legendSize:13,legendVisible:true,insideLegend:false,insideSize:13,insidePosition:'top-right',insideBackground:'white'});
export function normalizeGraphAppearance(value={}){
  const defaults=defaultGraphAppearance(),result={...defaults};
  for(const key of ['xTitleSize','yTitleSize','legendSize','insideSize'])if(Number.isInteger(value?.[key])&&value[key]>=8&&value[key]<=36)result[key]=value[key];
  if(typeof value?.legendVisible==='boolean')result.legendVisible=value.legendVisible;
  if(typeof value?.insideLegend==='boolean')result.insideLegend=value.insideLegend;
  if(['top-right','top-left','bottom-right','bottom-left'].includes(value?.insidePosition))result.insidePosition=value.insidePosition;
  if(['white','transparent'].includes(value?.insideBackground))result.insideBackground=value.insideBackground;
  return result;
}
export function wrapGraphText(text,maxWidth,measure){
  const lines=[];let line='';
  for(const char of String(text)){
    if(char==='\n'){lines.push(line);line='';continue;}
    if(line&&measure(line+char)>maxWidth){lines.push(line.trimEnd());line=char.trimStart();}else line+=char;
  }
  if(line||!lines.length)lines.push(line);
  return lines;
}
export function titleLayout(width,height,xTitle,yTitle,prefs,measure){
  const R=width<500?16:26,T=18;
  let L=width<500?65:84,B=52,xLines=[],yLines=[];
  for(let i=0;i<4;i++){
    xLines=wrapGraphText(xTitle,Math.max(80,width-L-R),t=>measure(t,prefs.xTitleSize));
    B=Math.max(52,32+xLines.length*prefs.xTitleSize*1.2+8);
    yLines=wrapGraphText(yTitle,Math.max(80,height-T-B-8),t=>measure(t,prefs.yTitleSize));
    L=Math.max(width<500?65:84,48+yLines.length*prefs.yTitleSize*1.2+8);
  }
  return {L,R,T,B,xLines,yLines};
}
