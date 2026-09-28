import { emptyPresetLibrary, validatePresetLibrary } from '../core/presets.js';
import { digest } from '../core/workspace.js';
import { emptyEditLibrary, validateEditLibrary } from '../core/edits.js';
import {currentVault,vaultCall} from './vault-store.js';

const databaseName = 'adsorption-workbench';
const requestValue = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const transactionDone = transaction => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onabort = () => reject(transaction.error ?? new Error('프리셋 저장이 취소되었습니다.'));
  transaction.onerror = () => {}; // onabort reports the final transaction outcome.
});
function storageError(error) {
  if (error?.name === 'QuotaExceededError') return new Error('브라우저 저장 공간이 부족해 프리셋을 저장하지 못했습니다.');
  return error;
}

export class PresetStore {
  #database;
  async database() {
    if (!this.#database) {
      this.#database = new Promise((resolve, reject) => {
        if (!globalThis.indexedDB) { reject(new Error('이 브라우저에서는 프리셋 저장을 사용할 수 없습니다.')); return; }
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore('library');
          db.createObjectStore('sources', { keyPath: 'hash' });
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('다른 창에서 저장 공간을 사용 중입니다. 그 창을 닫은 뒤 다시 여세요.'));
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); this.#database = null; };
          resolve(db);
        };
      }).catch(error => { this.#database = null; throw storageError(error); });
    }
    return this.#database;
  }
  async load() { return this.loadState('current',validatePresetLibrary,emptyPresetLibrary); }
  async loadEdits() { return this.loadState('edits',validateEditLibrary,emptyEditLibrary); }
  async loadState(key,validate,empty) {
    if(currentVault())return validate(await vaultCall('load_state',key)??empty());
    const db = await this.database(), tx = db.transaction('library', 'readonly'), done = transactionDone(tx);
    const [value] = await Promise.all([requestValue(tx.objectStore('library').get(key)), done]);
    return validate(value ?? empty());
  }
  async readSources(hashes) {
    if(currentVault())return vaultCall('read_sources',hashes);
    const db = await this.database(), tx = db.transaction('sources', 'readonly'), done = transactionDone(tx);
    const requests = [...new Set(hashes)].map(hash => requestValue(tx.objectStore('sources').get(hash)));
    const [sources] = await Promise.all([Promise.all(requests), done]);
    return sources.filter(Boolean);
  }
  async save(library, sources = []) { return this.saveState('current',library,sources,validatePresetLibrary); }
  async saveEdits(library, sources = []) { return this.saveState('edits',library,sources,validateEditLibrary); }
  async saveState(key,library,sources,validate) {
    validate(library);
    const uniqueSources = [...new Map(sources.map(source => [source.hash, source])).values()];
    for (const source of uniqueSources) {
      if (typeof source.text !== 'string' || await digest(source.text) !== source.hash) throw new Error('저장할 원본의 해시가 일치하지 않습니다.');
    }
    if(currentVault())return vaultCall('save_state',key,library,uniqueSources);
    const db = await this.database(), next = structuredClone(library);
    // One read/write transaction protects both raw data and the library revision.
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['library', 'sources'], 'readwrite');
      const stateStore = tx.objectStore('library'), sourceStore = tx.objectStore('sources');
      let failure;
      const abort = error => { failure = error; tx.abort(); };
      tx.onabort = () => reject(storageError(failure ?? tx.error ?? new Error('프리셋 저장에 실패했습니다.')));
      tx.onerror = () => {};
      tx.oncomplete = () => resolve(next);
      const request = stateStore.get(key);
      request.onsuccess = () => {
        if ((request.result?.revision ?? 0) !== library.revision) {
          const error = new Error('다른 창에서 저장 목록이 변경되었습니다. 목록을 다시 확인한 뒤 저장하세요.');
          error.code = 'PRESET_CONFLICT'; abort(error); return;
        }
        next.revision++;
        for (const source of uniqueSources) {
          const existing = sourceStore.get(source.hash);
          existing.onsuccess = () => {
            if (existing.result && existing.result.text !== source.text) { abort(new Error('저장된 원본과 내용이 일치하지 않습니다.')); return; }
            if (!existing.result) sourceStore.add(source);
          };
        }
        stateStore.put(next, key);
      };
    });
  }
  async exportSnapshot(){
    if(currentVault())return vaultCall('export_library');
    const db=await this.database(),tx=db.transaction(['library','sources'],'readonly'),done=transactionDone(tx);
    const [keys,values,sources]=await Promise.all([requestValue(tx.objectStore('library').getAllKeys()),requestValue(tx.objectStore('library').getAll()),requestValue(tx.objectStore('sources').getAll()),done]);
    return {states:Object.fromEntries(keys.map((key,i)=>[key,values[i]])),sources};
  }
}
