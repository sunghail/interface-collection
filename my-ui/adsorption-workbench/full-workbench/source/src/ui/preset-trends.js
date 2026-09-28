import {createDraft} from '../core/edits.js';
import {editCurve,inTimeRange} from '../core/kinetic-edit.js';
import {overallTrend,selectedPointsTrend} from './overall-trend.js';

// Fit with the saved preset's basis and range; only then clip to the active view.
export function presetTrends(restored,view,{id,name,color,opacity=.25}) {
  const entry=restored.entries[0],draft=createDraft(entry,restored.view);
  draft.unit=view.unit;draft.kineticValue=view.kineticValue;
  const curve=editCurve(entry,draft),result=[];
  for(const [kind,settings] of [['all',curve.trendSettings],['selected',curve.selectedTrendSettings]]){
    if(!settings.enabled)continue;
    let data=kind==='all'?overallTrend(curve.trendData,settings.strength,settings):selectedPointsTrend(curve.trendData,settings.sampleIds,settings.strength,settings);
    data=data.filter(p=>inTimeRange(p.x,curve.timeRange)&&inTimeRange(p.x,view.trend));
    if(curve.trendPressure){const {ce,c0}=curve.trendPressure;data=data.map(p=>({...p,y:ce+p.y*(c0-ce)}));}
    if(data.length)result.push({id:`preset-${id}-${kind}`,name,color,opacity,trend:true,selectedTrend:kind==='selected',data});
  }
  return result;
}
