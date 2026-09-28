import {currentVault,nativeVaultAvailable,vaultCall,chooseVault,activateChosenVault,localPreferences,settleVault,closeNativeWindow,vaultError,acknowledgeVaultSave} from '../storage/vault-store.js';
import {PresetStore} from '../storage/preset-store.js';
import {saveWorkspace} from '../core/workspace.js';
import {dataNumberLabel} from '../core/entry-labels.js';

const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const parentOf=path=>path?.includes('/')?path.slice(0,path.lastIndexOf('/')):'';

function ask(title,{value='',options=null,label='이름'}={}){
  return new Promise(resolve=>{
    const dialog=el('dialog',undefined,'vault-dialog'),form=el('form'),heading=el('h3',title),field=el('label',label);
    const input=el(options?'select':'input');input.required=!options;
    if(options)for(const [value,text] of options)input.append(new Option(text,value));
    input.value=value;field.append(input);form.append(heading,field);
    const actions=el('div',undefined,'vault-actions'),cancel=el('button','취소'),ok=el('button','적용','primary');
    cancel.type='button';ok.type='submit';cancel.onclick=()=>dialog.close();
    actions.append(cancel,ok);form.append(actions);dialog.append(form);document.body.append(dialog);
    let result=null;form.onsubmit=e=>{e.preventDefault();result=options?input.value:input.value.trim();if(result!==''||options)dialog.close();};
    dialog.onclose=()=>{dialog.remove();resolve(result);};dialog.showModal();input.focus();if(!options)input.select();
  });
}

export function mountVaultBrowser({getCurrent,onMessage,onSelect}){
  const page=document.getElementById('page-data'),layout=page.querySelector('.data-library-layout');
  const toolbar=el('section',undefined,'vault-toolbar');toolbar.setAttribute('aria-label','Vault 보관함');
  toolbar.innerHTML='<div class="vault-heading"><small>VAULT</small><strong data-vault="name"></strong><span data-vault="path"></span></div><div class="vault-actions"><button data-vault="create">새 Vault</button><button data-vault="open">Vault 열기</button><button data-vault="save">지금 저장</button></div><p data-vault="status" role="status"></p>';
  layout.before(toolbar);
  const tree=el('aside',undefined,'vault-tree');tree.setAttribute('aria-label','데이터 폴더');
  tree.innerHTML='<div class="vault-tree-heading"><strong>폴더</strong><button data-vault="new-folder" title="선택 폴더 아래 새 폴더">＋</button></div><div data-vault="folders"></div><div class="vault-folder-actions"><button data-vault="rename-folder">이름 변경</button><button data-vault="move-folder">폴더 이동</button></div>';
  layout.prepend(tree);
  const breadcrumb=el('div',undefined,'vault-breadcrumb');document.getElementById('data-library-host').prepend(breadcrumb);
  const $=name=>page.querySelector(`[data-vault="${name}"]`);
  let folder='',timer=null,lastSaved='',busy=false,saving=null;
  const signature=()=>{const {entries,view}=getCurrent();return JSON.stringify({entries:entries.map(({measurement,text,...e})=>e),view,preferences:localPreferences()});};
  const status=(text,error=false)=>{$('status').textContent=text;$('status').classList.toggle('error',error);};
  const run=fn=>async()=>{if(busy)return;busy=true;try{await fn();}catch(error){status(error.message,true);onMessage(error.message,true);}finally{busy=false;refresh();}};

  async function ensureFiles(){
    const {entries}=getCurrent();
    for(const entry of entries){
      if(entry.vaultPath)continue;
      const same=entries.find(e=>e!==entry&&e.hash===entry.hash&&e.vaultPath);
      entry.vaultPath=same?.vaultPath??await vaultCall('import_file',folder,entry);
    }
  }
  async function save(){
    clearTimeout(timer);
    if(!currentVault())return;
    if(saving){await saving;return save();}
    if(signature()===lastSaved)return;
    const perform=async()=>{
      status('저장 중…');await ensureFiles();
      const {entries,view}=getCurrent(),savedSignature=signature();
      await vaultCall('save_workspace',JSON.parse(saveWorkspace(entries,view)),localPreferences());
      lastSaved=savedSignature;acknowledgeVaultSave();status('Vault에 저장됨');refresh();
    };
    saving=perform();try{await saving;}finally{saving=null;}
    if(signature()!==lastSaved)return save();
  }
  function changed(){
    if(!currentVault()||busy||signature()===lastSaved)return;
    status('변경사항 저장 대기');clearTimeout(timer);
    timer=setTimeout(()=>save().catch(error=>status('저장 실패 · '+error.message,true)),600);
  }
  async function refreshFolders(){const snapshot=await vaultCall('snapshot');currentVault().folders=snapshot.folders;refresh();}
  async function move(source,destination){
    await save();await vaultCall('move',source,destination);
    for(const entry of getCurrent().entries){if(entry.vaultPath===source||entry.vaultPath?.startsWith(source+'/'))entry.vaultPath=destination+entry.vaultPath.slice(source.length);}
    if(folder===source||folder.startsWith(source+'/'))folder=destination+folder.slice(source.length);
    lastSaved=signature();await refreshFolders();status('이동했습니다.');
  }
  function folderOptions(exclude=null){return currentVault().folders.filter(path=>exclude===null||path!==exclude&&!path.startsWith(exclude+'/')).map(path=>[path,path||currentVault().name+' (최상위)']);}
  function refresh(){
    const vault=currentVault(),entries=getCurrent().entries;
    $('name').textContent=vault?.name??'폴더로 보관하는 데이터';$('path').textContent=vault?.path??'새 Vault를 만들면 현재 데이터와 저장한 세트를 복사합니다.';
    for(const name of ['create','open'])$(name).disabled=!nativeVaultAvailable()||busy;
    for(const name of ['save','new-folder'])$(name).disabled=!vault||busy;
    for(const name of ['rename-folder','move-folder'])$(name).disabled=!vault||!folder||busy;
    tree.hidden=!vault;layout.classList.toggle('has-vault',!!vault);
    breadcrumb.textContent=vault?`${vault.name}${folder?' / '+folder.replaceAll('/',' / '):''}`:'전체 데이터';
    $('folders').replaceChildren();
    if(vault)for(const path of [...vault.folders].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))){
      const count=entries.filter(e=>parentOf(e.vaultPath)===path).length;
      const button=el('button',undefined,'vault-folder');button.style.paddingLeft=(12+(path?path.split('/').length:0)*13)+'px';
      button.append(el('span',path?path.split('/').at(-1):vault.name),el('small',String(count)));
      button.title=path||vault.name;button.setAttribute('aria-pressed',String(path===folder));button.onclick=()=>{folder=path;const first=entries.find(e=>parentOf(e.vaultPath)===path);if(first&&!entries.some(e=>e.id===getCurrent().view.activeId&&parentOf(e.vaultPath)===path))onSelect(first);refresh();};$('folders').append(button);
    }
    let shown=0;
    for(const card of document.querySelectorAll('#entries .entry')){
      const entry=entries.find(e=>e.id===card.dataset.entryId);if(!entry)continue;
      card.hidden=!!vault&&parentOf(entry.vaultPath)!==folder;if(!card.hidden)shown++;
      card.querySelector('.vault-entry-location')?.remove();
      if(vault){
        const row=el('div',undefined,'vault-entry-location'),label=el('span',entry.vaultPath??'저장 대기'),button=el('button','이동');
        label.title=entry.vaultPath??'';button.setAttribute('aria-label',`${dataNumberLabel(entry)} 폴더 이동`);
        button.onclick=run(async()=>{const target=await ask('측정파일 이동',{value:parentOf(entry.vaultPath),options:folderOptions(),label:'대상 폴더'});if(target===null)return;await save();const source=entry.vaultPath,destination=[target,source.split('/').at(-1)].filter(Boolean).join('/');if(source!==destination)await move(source,destination);});
        row.append(label,button);card.append(row);
      }
    }
    let empty=document.getElementById('vault-folder-empty');if(!empty){empty=el('p',undefined,'hint');empty.id='vault-folder-empty';document.getElementById('entries').after(empty);}
    empty.hidden=!vault||shown>0;empty.textContent='이 폴더에는 데이터가 없습니다. RAT 열기로 파일을 가져오세요.';
    document.getElementById('data-detail-host').hidden=!!vault&&!entries.some(e=>e.id===getCurrent().view.activeId&&parentOf(e.vaultPath)===folder);
    if(vault){document.getElementById('filesempty').hidden=true;document.getElementById('count').textContent=shown;document.getElementById('count').title=`전체 ${entries.length}개 중 현재 폴더 ${shown}개`;}
    if(!nativeVaultAvailable())status('폴더 보관함은 데스크톱 앱에서 사용할 수 있습니다. 현재 웹 화면의 저장 방식은 유지됩니다.');
  }
  async function switchVault(create){
    const leave=new Event('beforeunload',{cancelable:true});window.dispatchEvent(leave);
    if(leave.defaultPrevented)throw new Error('편집 중인 비교/Fitting 세트나 프리셋을 먼저 저장한 뒤 Vault를 전환하세요.');
    await save();await settleVault();
    const workspace=JSON.parse(saveWorkspace(getCurrent().entries,getCurrent().view));
    const preferences=localPreferences(),library=create?await new PresetStore().exportSnapshot():null;
    if(!await chooseVault(create))return;
    try{if(create){
      await activateChosenVault();
      const imported=new Map();
      for(const entry of workspace.entries){
        if(!imported.has(entry.hash))imported.set(entry.hash,await vaultCall('import_file','',entry));
        entry.vaultPath=imported.get(entry.hash);
      }
      await vaultCall('save_workspace',workspace,preferences);
      for(const [key,state] of Object.entries(library.states))await vaultCall('save_state',key,{...state,revision:0},library.sources);
    }}catch(error){
      // The native root has changed; never keep old mounted libraries on this root.
      onMessage('새 Vault로 일부 항목을 복사하지 못했습니다. 기존 Vault/앱 저장소는 보존됩니다. '+error.message,true);
      await ask('일부 항목을 복사하지 못했습니다. 기존 저장소는 보존됩니다.',{options:[['ok','새 Vault 확인']],label:error.message});
    }
    location.reload();
  }
  $('create').onclick=run(()=>switchVault(true));$('open').onclick=run(()=>switchVault(false));$('save').onclick=run(save);
  $('new-folder').onclick=run(async()=>{const name=await ask('새 하위 폴더');if(name===null)return;folder=await vaultCall('make_folder',folder,name);await refreshFolders();});
  $('rename-folder').onclick=run(async()=>{const name=await ask('폴더 이름 변경',{value:folder.split('/').at(-1)});if(name===null)return;const destination=[parentOf(folder),name].filter(Boolean).join('/');if(destination!==folder)await move(folder,destination);});
  $('move-folder').onclick=run(async()=>{const target=await ask('폴더 이동',{value:parentOf(folder),options:folderOptions(folder),label:'대상 폴더'});if(target===null)return;const destination=[target,folder.split('/').at(-1)].filter(Boolean).join('/');if(destination!==folder)await move(folder,destination);});
  window.addEventListener('adsorption:vault-preferences',changed);
  window.addEventListener('adsorption:vault-error',event=>status('저장소 오류 · '+event.detail.message,true));
  let closing=false;
  window.adsorptionPrepareClose=async()=>{
    if(closing)return;closing=true;
    try{
      const leave=new Event('beforeunload',{cancelable:true});window.dispatchEvent(leave);
      if(leave.defaultPrevented){const result=await ask('저장하지 않은 편집 또는 진행 중인 작업이 있습니다.',{options:[['stay','돌아가서 확인하기'],['close','저장하지 않고 닫기']],label:'그래프 편집·세트 변경은 저장되지 않을 수 있습니다.'});if(result!=='close')return;}
      status('종료 준비 · 작업 화면을 저장하고 있습니다…');
      await save();await settleVault();if(vaultError()&&currentVault())throw vaultError();
      window.adsorptionClosingApproved=true;await closeNativeWindow();
    }catch(error){
      status('종료 전 저장 실패 · '+error.message,true);
      window.adsorptionClosingApproved=false;
      const result=await ask('Vault에 저장하지 못했습니다.',{options:[['stay','앱으로 돌아가기'],['close','저장하지 않고 닫기']],label:error.message});if(result==='close'){window.adsorptionClosingApproved=true;await closeNativeWindow();}
    }finally{closing=false;}
  };
  lastSaved=signature();refresh();
  if(vaultError())status(vaultError().message,true);else if(currentVault())status('Vault를 열었습니다. 변경사항은 자동 저장됩니다.');
  const storage=document.getElementById('storage-description');if(currentVault())storage.textContent='현재 Vault에 측정파일·작업 화면·저장한 프리셋·비교/Fitting 세트·표시 설정을 보관합니다. 세트 편집은 해당 화면의 저장 버튼으로 확정하세요.';
  return {refresh,changed,save,folder:()=>folder};
}
