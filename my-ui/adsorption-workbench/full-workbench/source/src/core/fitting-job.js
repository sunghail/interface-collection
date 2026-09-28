export const defaultFitSettings=()=>({K:null,volume:null,loss:'log10',tolerance:5,temperatureDirection:'auto',pressureDirection:'auto',initial:[.6,.2,.05],bounds:[[.05,5],[.01,3],[.000001,10]],overrides:{}});
export function fittingPayload(set){
  const settings={...defaultFitSettings(),...set.fitSettings};
  return {basis:set.basis,step:set.step,settings,items:set.items.filter(item=>item.included).map(({id,label,pointId,gas,temperature,peq,p0,data,edited})=>({id,label,pointId,gas,temperature,peq,p0,data,edited}))};
}
export const fitSignature=set=>JSON.stringify(fittingPayload(set));
export const currentFitResult=set=>set?.fitResult?.inputSignature===fitSignature(set)?set.fitResult:null;
