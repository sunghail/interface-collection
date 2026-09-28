import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { curveLinear } from '@visx/curve';
import { ChartProvider } from '../vendor/bklit/charts/chart-context';
import { Line } from '../vendor/bklit/charts/line';

// Bklit's upstream shell assumes calendar dates. Its Line and marker components
// can use our numerical scales through this adapter without rounding to dates.
// getTime is an identity protocol for upstream path keys, NOT a Date conversion.
const accessor = d => ({ valueOf: () => d.x, getTime: () => d.x });
const noop = () => {};
export function splitSegments(data, axes) {
  const segments=[];let current=[];
  for(const p of data){
    const valid=Number.isFinite(p.x)&&Number.isFinite(p.y)&&!(axes.x.scale==='log'&&p.x<=0)&&!(axes.y.scale==='log'&&p.y<=0);
    if(p.breakBefore||!valid){if(current.length)segments.push(current);current=[];}
    if(valid)current.push(p);
  }
  if(current.length)segments.push(current);
  return segments;
}
export function bklitMarkup(curves, axes, px, py, width, height) {
  return renderToStaticMarkup(<>{curves.flatMap(c=>splitSegments(c.data,axes).map((data,i)=>{
    const value={data,renderData:data,xScale:px,yScale:py,yScales:{left:py},width,height,innerWidth:width,innerHeight:height,
      margin:{top:0,right:0,bottom:0,left:0},columnWidth:0,containerRef:{current:null},lines:[{dataKey:'y',stroke:c.color,strokeWidth:2}],referenceAreas:[],
      chartPhase:'ready',chartStatus:'ready',yDomainTweenDuration:0,yDomainSkeletonByAxis:{},yDomainTargetByAxis:{},isLoaded:true,animationDuration:0,
      xAccessor:accessor,dateLabels:[],tooltipData:null,setTooltipData:noop,selection:null};
    const desorption=data[0]?.branch==='desorption';
    return <g key={`${c.id}-${i}`} opacity={c.opacity??1} strokeDasharray={c.selectedTrend?'6 4':undefined} data-trend-kind={c.selectedTrend?'selected':c.trend?'all':undefined} data-bklit-series={c.id} data-segment={i} data-branch={data[0]?.branch??'kinetic'}>
      <ChartProvider value={value}><Line dataKey="y" stroke={c.color} strokeWidth={c.pointsOnly?0:c.trend?2.5:2} curve={curveLinear} animate={false} loading={false} fadeEdges={false} showHighlight={false} showMarkers={!c.trend}
        markers={{radius:2.4,ringGap:1,strokeWidth:desorption?1.5:.7,fill:desorption?'white':c.color,stroke:c.color,fadeOnHover:false,showActiveHighlight:false}} />
      </ChartProvider>
    </g>;
  }))}</>);
}
