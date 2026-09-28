export function bindNavigation(svg,{pos,bx,by,L,R,T,B,W,H,onRange,preview,hover,click,allowPan=true,panButton=0,wheelZoom=false}) {
  const pw=W-L-R,ph=H-T-B;
  const inside=p=>p.x>=L&&p.x<=W-R&&p.y>=T&&p.y<=H-B;
  let down=null,moved=false;
  const clear=()=>{down=null;moved=false;preview(0,0);svg.classList.remove('dragging');};
  svg.onpointerdown=e=>{
    if((e.button!==0&&e.button!==panButton)||down)return;
    const p=pos(e);if(!inside(p))return;
    e.preventDefault();down={...p,id:e.pointerId,button:e.button};moved=false;svg.setPointerCapture(e.pointerId);
  };
  svg.onpointermove=e=>{
    const p=pos(e);
    if(!down){hover(p);return;}
    if(e.pointerId!==down.id)return;
    if(Math.hypot(p.x-down.x,p.y-down.y)>=5)moved=true;
    if(moved&&allowPan&&down.button===panButton){svg.classList.add('dragging');preview(p.x-down.x,p.y-down.y);}
  };
  svg.onpointerup=e=>{
    if(!down||e.pointerId!==down.id)return;
    const p=pos(e),d=down,dragged=moved||Math.hypot(p.x-d.x,p.y-d.y)>=5;
    clear();if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);
    if(!dragged){if(d.button===0)click(p);return;}
    if(!allowPan||d.button!==panButton)return;
    const dx=(p.x-d.x)/pw*(bx.hi-bx.lo),dy=(p.y-d.y)/ph*(by.hi-by.lo);
    onRange({x:[bx.inverse(bx.lo-dx),bx.inverse(bx.hi-dx)],y:[by.inverse(by.lo+dy),by.inverse(by.hi+dy)]});
  };
  svg.onpointercancel=clear;
  svg.onlostpointercapture=clear;
  svg.oncontextmenu=e=>{if(panButton===2&&inside(pos(e)))e.preventDefault();};
  svg.addEventListener('wheel',e=>{
    if(!wheelZoom&&!e.ctrlKey)return;
    const p=pos(e);if(!inside(p))return;
    e.preventDefault();if(down||!e.deltaY)return;
    const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?ph:1);
    const factor=Math.exp(Math.max(-.7,Math.min(.7,delta*.002)));
    const cx=bx.lo+(p.x-L)/pw*(bx.hi-bx.lo),cy=by.hi-(p.y-T)/ph*(by.hi-by.lo);
    onRange({x:[bx.inverse(cx+(bx.lo-cx)*factor),bx.inverse(cx+(bx.hi-cx)*factor)],y:[by.inverse(cy+(by.lo-cy)*factor),by.inverse(cy+(by.hi-cy)*factor)]});
  },{passive:false});
}
