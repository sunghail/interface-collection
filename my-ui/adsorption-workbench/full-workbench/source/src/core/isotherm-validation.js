import {pressureFactor} from './data.js';

export function parseReference(text,unit='kPa'){
  const factor=pressureFactor(unit),rows=String(text).trim().split(/\r?\n/);
  if(!String(text).trim())throw new Error('X·Y 값을 입력하세요.');
  if(rows.length>5000)throw new Error('한 세트는 5,000행까지 입력할 수 있습니다.');
  return rows.map((line,i)=>{
    const cells=line.trim().split(/[\t,; ]+/);
    if(cells.length!==2||cells.some(v=>!v||!Number.isFinite(Number(v))))throw new Error(`${i+1}행: 숫자 X와 Y 두 개를 입력하세요.`);
    const [x,y]=cells.map(Number);if(x<0)throw new Error(`${i+1}행: 압력은 0 이상이어야 합니다.`);
    return {x:x/factor,y};
  });
}

// Preserve recorded segments: do not bridge branch breaks or average repeated pressures.
export function compareReference(reference,measured){
  const data=measured.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
  const rows=reference.map(p=>{
    let candidates=data.filter(q=>q.x===p.x).map(q=>q.y);
    if(!candidates.length)for(let i=1;i<data.length;i++){
      const a=data[i-1],b=data[i];
      if(b.breakBefore||a.x===b.x||p.x<=Math.min(a.x,b.x)||p.x>=Math.max(a.x,b.x))continue;
      candidates.push(a.y+(b.y-a.y)*(p.x-a.x)/(b.x-a.x));
    }
    const distinct=[...new Set(candidates)];
    if(distinct.length!==1)return {...p,status:distinct.length?'같은 압력의 측정값이 여러 개':'비교 범위 밖',measured:null};
    const value=distinct[0],error=value-p.y;
    return {...p,measured:value,error,relative:p.y===0?null:100*error/Math.abs(p.y),status:'비교 가능'};
  });
  const valid=rows.filter(p=>p.measured!==null);
  return {rows,count:valid.length,rmse:valid.length?Math.sqrt(valid.reduce((s,p)=>s+p.error**2,0)/valid.length):null};
}

export function validateReferenceSets(value){
  if(!Array.isArray(value)||value.length>100)throw new Error('저장한 Validation 세트 형식이 올바르지 않습니다.');
  for(const s of value)if(!s||typeof s.id!=='string'||typeof s.name!=='string'||!s.name.trim()||!['adsorption','desorption'].includes(s.branch)||!Array.isArray(s.data)||!s.data.length||s.data.length>5000||s.data.some(p=>!Number.isFinite(p.x)||p.x<0||!Number.isFinite(p.y)))throw new Error('저장한 Validation 세트에 잘못된 값이 있습니다.');
  return value;
}
