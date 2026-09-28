import {preferenceStorage} from '../storage/vault-store.js';
import {normalizeGraphAppearance,wrapGraphText} from '../core/graph-appearance.js';
const key='adsorption.graphAppearance';
let current;
export function graphAppearance(){
  if(!current){try{current=normalizeGraphAppearance(JSON.parse(preferenceStorage.getItem(key)||'{}'));}catch{current=normalizeGraphAppearance();}}
  return {...current};
}
export function applyGraphAppearance(){
  const p=graphAppearance();document.body.style.setProperty('--graph-legend-size',p.legendSize+'px');document.body.dataset.graphLegend=String(p.legendVisible);
}
export function saveGraphAppearance(value){
  current=normalizeGraphAppearance(value);applyGraphAppearance();let persisted=true;
  try{preferenceStorage.setItem(key,JSON.stringify(current));}catch{persisted=false;}
  window.dispatchEvent(new Event('adsorption:graph-appearance'));return persisted;
}
let context;
export function measureGraphText(text,size){
  context??=document.createElement('canvas').getContext('2d');
  if(!context)return String(text).length*size*.65;
  context.font=`${size}px sans-serif`;return context.measureText(String(text)).width;
}
export function appendGraphFooter(svg,legend,notes=[]){
  const prefs=graphAppearance(),ns='http://www.w3.org/2000/svg';
  const [,,width,height]=svg.getAttribute('viewBox').split(' ').map(Number);let y=height+12;
  const blocks=[...(prefs.legendVisible?legend.map(item=>({...item,size:prefs.legendSize})):[]),...notes.map(text=>({text,size:12}))];
  for(const {text,color,size} of blocks){
    const lines=wrapGraphText(text,width-60,t=>measureGraphText(t,size));
    for(const [i,line] of lines.entries()){
      y+=size*1.3;
      if(color&&i===0){const mark=document.createElementNS(ns,'line');for(const [k,v] of Object.entries({x1:16,x2:30,y1:y-size*.3,y2:y-size*.3,stroke:color,'stroke-width':3}))mark.setAttribute(k,v);svg.append(mark);}
      const t=document.createElementNS(ns,'text');for(const [k,v] of Object.entries({x:38,y,'font-size':size,'font-family':'sans-serif',fill:'#45536b'}))t.setAttribute(k,v);t.textContent=line;svg.append(t);
    }y+=6;
  }
  const total=blocks.length?y+12:height;svg.setAttribute('width',width);svg.setAttribute('height',total);svg.setAttribute('viewBox',`0 0 ${width} ${total}`);
  const bg=document.createElementNS(ns,'rect');bg.setAttribute('width',width);bg.setAttribute('height',total);bg.setAttribute('fill','white');svg.prepend(bg);return svg;
}
