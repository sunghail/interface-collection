// Fixed composition: 800 × 500 logical px, rasterized at 2× for a 1600 × 1000 PNG.
export async function plotPng(svg){
  svg.setAttribute('width','800');svg.setAttribute('height','500');
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
  try{
    const img=new Image();img.src=url;await img.decode();
    const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1000;
    canvas.getContext('2d').drawImage(img,0,0,1600,1000);
    return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('그림 변환 실패')),'image/png'));
  }finally{URL.revokeObjectURL(url);}
}
let menu;
export function bindPlotCopy(svg,makeSvg){
  let origin=null,dragged=false;
  svg.addEventListener('pointerdown',e=>{if(e.button===2){origin={x:e.clientX,y:e.clientY};dragged=false;}});
  svg.addEventListener('pointermove',e=>{if(origin&&Math.hypot(e.clientX-origin.x,e.clientY-origin.y)>5)dragged=true;});
  svg.addEventListener('contextmenu',e=>{
    e.preventDefault();if(dragged){origin=null;dragged=false;return;}
    menu?.remove();menu=document.createElement('div');menu.className='plot-copy-menu';
    const copy=document.createElement('button'),save=document.createElement('button'),status=document.createElement('span');
    copy.textContent='그래프 이미지 복사';save.textContent='PNG 저장 (1600 × 1000)';status.textContent='1600 × 1000 · 축 제목·내부 Legend 반영';status.setAttribute('role','status');
    menu.append(copy,save,status);(svg.closest('dialog[open]')??document.body).append(menu);
    menu.style.left=Math.max(8,Math.min(e.clientX,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(e.clientY,innerHeight-menu.offsetHeight-8))+'px';
    const activeMenu=menu;
    copy.onclick=async()=>{try{
      if(!navigator.clipboard?.write||!window.ClipboardItem)throw new Error('이 환경에서는 이미지 복사를 지원하지 않습니다. PNG 저장을 사용하세요.');
      const blob=plotPng(makeSvg());
      await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);status.textContent='복사 완료 · 문서에 Ctrl+V로 붙여넣으세요.';
    }catch(error){status.textContent='복사 실패: '+error.message+' PNG 저장을 사용할 수 있습니다.';}};
    save.onclick=async()=>{try{const blob=await plotPng(makeSvg()),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='adsorption-graph.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);status.textContent='PNG 저장을 요청했습니다.';}catch(error){status.textContent=error.message;}};
    const close=event=>{if(event.type==='keydown'&&event.key!=='Escape')return;if(event.type==='pointerdown'&&activeMenu.contains(event.target))return;activeMenu.remove();document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',close);};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',close);copy.focus();
  });
}
