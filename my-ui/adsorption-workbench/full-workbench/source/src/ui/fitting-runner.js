import {defaultFitSettings,fittingPayload,fitSignature,currentFitResult} from '../core/fitting-job.js';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const fmt=v=>Number.isFinite(v)?Number(v.toPrecision(5)).toString():'—';
const direction=d=>d===-1?'짧아짐 (빨라짐)':d===1?'길어짐 (느려짐)':'거의 일정';
const axis=a=>a==='temperature'?'온도 증가':'압력 증가';

export function mountFittingRunner(host,{getSet,onChange,onResult,onBusy}){
  let running=false,job=null,timer=null,pollFailures=0,runSet=null,cancelPending=false,loadedId=null;
  host.className='fit-runner';
  host.innerHTML=`<div class="fit-section-heading"><div><span class="page-eyebrow">JOINT FITTING</span><h3>Joint fitting</h3></div><div class="fit-run-actions"><button id="fit-cancel" hidden>계산 취소</button><button id="fit-run" class="primary">Fitting 시작</button></div></div>
  <p class="fit-note">체크한 데이터 전체에서 α · D/R² · β를 함께 찾습니다. 같은 조건의 반복 측정은 t50·t90의 기하평균으로 경향을 비교합니다.</p>
  <details id="fit-calculation-settings" open><summary>계산 설정</summary><div class="fit-model-inputs"><label>모델 K <input id="fit-k" type="number" min="0.000000001" step="any" placeholder="직접 입력"></label><label>모델 Vs/Vg <input id="fit-volume" type="number" min="0.000000001" step="any" placeholder="직접 입력"></label><label>잔차 방식<select id="fit-loss"><option value="log10">로그 · 양수 점만</option><option value="linear">원값 · 전체 점</option></select></label><label>경향 허용차 (%)<input id="fit-tolerance" type="number" min="0" max="30" step="1"></label></div>
  <p class="fit-note">K는 해당 구간의 흡착 평형 기울기(모델의 무차원 정의), Vs/Vg는 흡착제 부피 ÷ 기체 부피입니다. BEL의 매니폴드 Vs 또는 파일 헤더 K와 구분하세요. 모델에는 곱 ω=K×Vs/Vg가 들어갑니다. 공통값은 모든 조건에 같은 값을 쓰는 가정이며 아래에서 조건별 값을 지정할 수 있습니다.</p>
  <div class="fit-model-inputs"><label>온도에 따른 속도<select id="fit-temperatureDirection"><option value="auto">데이터 전체에서 판단</option><option value="faster">온도 증가 → 빨라짐</option><option value="slower">온도 증가 → 느려짐</option></select></label><label>압력에 따른 속도<select id="fit-pressureDirection"><option value="auto">데이터 전체에서 판단</option><option value="faster">압력 증가 → 빨라짐</option><option value="slower">압력 증가 → 느려짐</option></select></label></div>
  <p class="fit-note">자동 판단은 비교 가능한 조건쌍의 시간비 기울기 중앙값으로 t50·t90 각각의 전체 방향을 정합니다. 압력 묶음 간격은 온도 비교 조건과 반복 측정 묶음에도 적용됩니다. 허용차는 측정 불확도가 아닌 사용자 설정입니다.</p>
  <details><summary>초기값 · 탐색 범위</summary><div class="fit-result-scroll"><table class="fit-result-table"><thead><tr><th>계수</th><th>초기값</th><th>하한</th><th>상한</th></tr></thead><tbody id="fit-parameter-inputs"></tbody></table></div></details>
  <details><summary>조건별 K · Vs/Vg</summary><p class="fit-note">비워두면 위 공통값을 사용합니다. 각 조건의 단위와 부피 정의를 맞춘 값을 입력하세요.</p><div class="fit-result-scroll"><table class="fit-result-table"><thead><tr><th>데이터</th><th>K</th><th>Vs/Vg</th></tr></thead><tbody id="fit-fixed-inputs"></tbody></table></div></details></details>
  <p id="fit-job-status" role="status" aria-live="polite"></p><progress id="fit-job-progress" hidden></progress><div id="fit-results" hidden></div>`;
  const $=id=>host.querySelector('#'+id);
  const status=(text,error=false)=>{$('fit-job-status').textContent=text;$('fit-job-status').classList.toggle('error',error);};
  const cfg=()=>getSet().fitSettings??=defaultFitSettings();
  function edit(){onChange();renderResult();onResult();}
  for(const [field,id] of [['K','k'],['volume','volume'],['loss','loss'],['tolerance','tolerance'],['temperatureDirection','temperatureDirection'],['pressureDirection','pressureDirection']]){
    $('fit-'+id).oninput=()=>{cfg()[field]=['K','volume','tolerance'].includes(field)?($('fit-'+id).value===''?null:Number($('fit-'+id).value)):$('fit-'+id).value;edit();};
  }
  const request=async(path,options={})=>{
    const response=await fetch(path,{...options,signal:AbortSignal.timeout(20000)});
    let value;try{value=await response.json();}catch{throw new Error('계산 서버가 응답하지 않습니다. 최신 server.py 또는 업데이트된 앱을 다시 실행하세요.');}
    if(!response.ok)throw new Error(value.error??'계산 요청에 실패했습니다.');return value;
  };
  function finish(){running=false;job=null;cancelPending=false;clearTimeout(timer);onBusy(false);refresh();}
  async function poll(){
    try{
      const value=await request('/api/fitting/jobs/'+job);pollFailures=0;
      if(value.status==='running'){
        status(cancelPending?'취소 요청 처리 중…':value.progress?.message??'계산 중…');
        if(value.progress?.total){$('fit-job-progress').max=value.progress.total;$('fit-job-progress').value=value.progress.current;}
        timer=setTimeout(poll,800);return;
      }
      if(value.status==='done'){
        runSet.fitResult={...value.result,inputSignature:runSet.runningSignature,completedAt:new Date().toISOString()};delete runSet.runningSignature;
        onChange();status(value.result.status==='converged'?'계산이 끝났습니다. 적합도와 경향을 확인한 뒤 세트를 저장하세요.':'계산 결과에 확인할 사항이 있습니다. 수렴·경향·오차를 확인하세요.');
      }else{delete runSet.runningSignature;status(value.error??'계산을 완료하지 못했습니다.',true);}
      finish();onResult();
    }catch(error){
      pollFailures++;status(error.message+(pollFailures<4?' · 상태를 다시 확인합니다.':' · 서버 계산이 남아 있을 수 있습니다. 취소를 누르거나 서버 상태를 확인하세요.'),true);
      if(pollFailures<4)timer=setTimeout(poll,2000);
      else {$('fit-cancel').disabled=false;$('fit-cancel').textContent='상태 다시 확인';$('fit-cancel').onclick=()=>{pollFailures=0;poll();};}
    }
  }
  async function cancel(){if(!job)return;try{await request('/api/fitting/jobs/'+job+'/cancel',{method:'POST'});cancelPending=true;status('취소 요청 처리 중…');}catch(error){status(error.message,true);}}
  $('fit-cancel').onclick=cancel;
  $('fit-run').onclick=async()=>{
    if(running)return;const set=getSet(),payload=fittingPayload(set);
    if(!payload.items.length){status('Fitting할 데이터에 체크하세요.',true);return;}
    if(!Number.isFinite(payload.settings.K)||payload.settings.K<=0||!Number.isFinite(payload.settings.volume)||payload.settings.volume<=0){$('fit-calculation-settings').open=true;status('계산에 필요한 모델 K와 Vs/Vg 공통값을 입력하세요. 조건별로 다른 값은 아래에서 지정할 수 있습니다.',true);return;}
    running=true;runSet=set;onBusy(true);refresh();status('계산 요청 중…');
    try{
      const value=await request('/api/fitting/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      job=value.id;set.runningSignature=JSON.stringify(payload);pollFailures=0;$('fit-cancel').onclick=cancel;$('fit-cancel').textContent='계산 취소';poll();
    }catch(error){status(error.message,true);finish();}
  };
  function numberInput(value,change,label){const input=el('input');input.type='number';input.step='any';input.value=value??'';input.setAttribute('aria-label',label);input.disabled=running;input.onchange=()=>{change(input.value===''?null:Number(input.value));edit();};return input;}
  function refresh(){
    const set=getSet();if(!set)return;const s={...defaultFitSettings(),...set.fitSettings};
    if(loadedId!==set.id){loadedId=set.id;if(!running)status('');}
    $('fit-run').disabled=running||!set.items.some(item=>item.included);$('fit-cancel').hidden=!running;$('fit-job-progress').hidden=!running;
    for(const [field,id] of [['K','k'],['volume','volume'],['loss','loss'],['tolerance','tolerance'],['temperatureDirection','temperatureDirection'],['pressureDirection','pressureDirection']]){$('fit-'+id).value=s[field]??'';$('fit-'+id).disabled=running;}
    $('fit-parameter-inputs').replaceChildren();
    for(const [i,name] of ['α','β','D/R² (s⁻¹)'].entries()){
      const row=el('tr');row.append(el('th',name));
      for(let j=0;j<3;j++){const cell=el('td');cell.append(numberInput(j===0?s.initial[i]:s.bounds[i][j-1],v=>{if(j===0)cfg().initial[i]=v;else cfg().bounds[i][j-1]=v;},`${name} ${['초기값','하한','상한'][j]}`));row.append(cell);}$('fit-parameter-inputs').append(row);
    }
    $('fit-fixed-inputs').replaceChildren();
    for(const item of set.items.filter(i=>i.included)){const row=el('tr');row.append(el('th',`${item.label} · ${item.pointId}`));for(const field of ['K','volume']){const td=el('td');td.append(numberInput(s.overrides?.[item.id]?.[field],v=>{const values=cfg().overrides[item.id]??={};if(v===null)delete values[field];else values[field]=v;},`${item.label} ${item.pointId} ${field==='K'?'K':'Vs/Vg'}`));row.append(td);}$('fit-fixed-inputs').append(row);}
    renderResult();
  }
  function renderResult(){
    const set=getSet(),result=set?.fitResult,out=$('fit-results');out.replaceChildren();out.hidden=!result;if(!result)return;
    const valid=!!currentFitResult(set),failed=result.checks.filter(c=>!c.passed).length;
    out.append(el('h3','Fitting 결과'),el('p',valid?'현재 세트의 계산 결과':'세트나 설정이 변경되었습니다. 이전 결과이며 재계산이 필요합니다.',valid?'fit-note':'fit-stale'));
    out.append(el('p',`${result.series.length}곡선 · ${result.elapsed.toFixed(1)}초 · ${result.solverSuccess?'최적화 수렴':'최적화 미수렴'} · 경향 ${result.checks.length?`${result.checks.length-failed}/${result.checks.length} 비교 만족`:'미평가'}`,'fit-result-summary'));
    out.append(el('p',`K=${fmt(result.settings.K)}, Vs/Vg=${fmt(result.settings.volume)} (조건별 지정은 아래 상세값 적용) · ${result.settings.loss==='log10'?'로그 RMSE':'원값 RMSE'} · 허용차 ${result.settings.tolerance}%`,'fit-note'));
    for(const warning of result.warnings)out.append(el('p',warning,'fit-result-warning'));
    const scroll=el('div',undefined,'fit-result-scroll'),table=el('table',undefined,'fit-result-table'),head=el('tr');
    for(const name of ['데이터','α','D/R² (s⁻¹)','β','오차 (개별 → 공동)','t50 / t90 (s)','사용 / 제외','경계'])head.append(el('th',name));const thead=el('thead');thead.append(head);table.append(thead);
    const body=el('tbody');for(const row of result.series){const tr=el('tr');for(const value of [row.label,fmt(row.alpha),fmt(row.D_over_R2),fmt(row.beta),`${fmt(row.independentRmse)} → ${fmt(row.rmse)}`,row.fittedTimes.map((t,i)=>fmt(t)+(row.extrapolatedTimes[i]?'*':'')).join(' / '),`${row.used} / ${row.excluded}`,row.bounds.join(', ')||'—'])tr.append(el('td',value));body.append(tr);}table.append(body);scroll.append(table);out.append(scroll);
    const detail=el('details'),summary=el('summary','온도 · 압력 경향 비교');detail.append(summary);
    for(const s of result.summaries)detail.append(el('p',`${axis(s.axis)} · ${s.metric}: ${s.comparisons?direction(s.direction):'비교 가능한 조건 없음'} · ${s.comparisons}쌍${s.dataConflicts?' · 원자료 충돌 '+s.dataConflicts+'쌍':''}`,'fit-note'));
    const checks=el('div',undefined,'fit-result-scroll'),ct=el('table',undefined,'fit-result-table'),ch=el('tr');['조건 / 지표','비교 데이터','관측 시간비','모델 시간비','판정'].forEach(t=>ch.append(el('th',t)));ct.append(ch);
    const labels=ids=>ids.map(id=>result.series.find(s=>s.id===id)?.label??id).join(', ');
    for(const c of result.checks){const tr=el('tr');[`${axis(c.axis)} / ${c.metric}`,`${labels(c.a)} → ${labels(c.b)}`,fmt(c.observedRatio),fmt(c.fittedRatio),c.passed?'만족':'확인 필요'].forEach(v=>tr.append(el('td',v)));ct.append(tr);}checks.append(ct);detail.append(checks);out.append(detail);
    const fixed=el('details');fixed.append(el('summary','계산에 사용한 조건별 고정 입력'));for(const r of result.series)fixed.append(el('p',`${r.label} · ${r.temperature} K · ${fmt(r.pressure)} kPa · K=${fmt(r.K)} · Vs/Vg=${fmt(r.volume)} · ω=${fmt(r.omega)}`,'fit-note'));out.append(fixed);
    out.append(el('p','점: 입력 데이터 · 선: Joint fitting 모델. * 관측 시간 밖 외삽. '+result.interpretation,'fit-note'));
  }
  return {refresh,get result(){return currentFitResult(getSet());},get running(){return running;}};
}
