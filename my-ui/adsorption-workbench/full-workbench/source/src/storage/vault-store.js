let vault=null, api=null, pending=Promise.resolve(), failure=null;
export const currentVault=()=>vault;
export const nativeVaultAvailable=()=>typeof api?.vault_boot==='function';
export async function initializeVault(){
  if(document.documentElement.dataset.runtime!=='desktop')return;
  if(typeof window.pywebview?.api?.vault_boot!=='function')await new Promise(resolve=>{
    const timer=setTimeout(resolve,12000);
    window.addEventListener('pywebviewready',()=>{clearTimeout(timer);resolve();},{once:true});
  });
  api=window.pywebview?.api;
  if(!nativeVaultAvailable()){api=null;failure=new Error('Vault 연결을 준비하지 못했습니다. 앱을 다시 실행해 주세요.');return;}
  const result=await api.vault_boot();
  if(result?.error){failure=new Error(result.error);return;}
  vault=result;
}
export function vaultError(){return failure;}
export function vaultCall(action,...args){
  // Serialize native bridge writes and reads; an earlier failure remains visible.
  const task=pending.then(()=>api.vault_call(action,args));
  pending=task.catch(error=>{failure=error;window.dispatchEvent(new CustomEvent('adsorption:vault-error',{detail:error}));});
  return task;
}
export async function settleVault(){await pending;}
export async function chooseVault(create){return api.vault_choose(create);}
export async function activateChosenVault(){vault=await api.vault_boot();if(vault?.error)throw new Error(vault.error);failure=null;return vault;}
export async function closeNativeWindow(){return api.vault_close_window();}
export function acknowledgeVaultSave(){failure=null;}
export const preferenceStorage={
  getItem(key){return vault?(vault.preferences[key]??null):localStorage.getItem(key);},
  setItem(key,value){
    if(!vault){localStorage.setItem(key,value);return;}
    vault.preferences[key]=String(value);
    window.dispatchEvent(new Event('adsorption:vault-preferences'));
  },
};
export function localPreferences(){return Object.fromEntries(['adsorption.preferences','adsorption.graphAppearance','adsorption.kineticTable','adsorption.isothermValidation'].map(key=>[key,preferenceStorage.getItem(key)]).filter(([,value])=>value!==null));}
