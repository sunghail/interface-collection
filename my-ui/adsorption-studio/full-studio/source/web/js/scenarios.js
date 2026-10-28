// Named parameter sets ("시나리오") kept in the browser, with JSON export/import.

import { h, toast, download, today } from "./util.js";
import { state, setParams, setUi, setTrain, emit, trainPayload } from "./store.js";

const KEY = "ads.scenarios.v1";

export function listScenarios() {
  try {
    const items = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function saveAll(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
  emit("scenarios");
}

/** Save `params` (default: the current conditions) and the user-built train, if any, under a name. */
export function saveScenario(name, params = state.params, train = trainPayload()) {
  const clean = name.trim();
  if (!clean) { toast("이름을 입력하세요", "warn"); return false; }
  const items = listScenarios().filter((s) => s.name !== clean);
  const changes = state.spec.parameters.filter((p) => Math.abs(params[p.name] - p.default) > 1e-12).map((p) => p.label);
  if (train) {
    const name = (id) => state.project.adsorbents.find((a) => a.id === id)?.name || id;
    changes.unshift(`${train.mode === "auto" ? "자동" : "직접"} ${train.units.map((u) => name(u.ads)).join(" → ")}`);
  }
  items.push({ name: clean, params: { ...params }, train: train ? structuredClone(train) : null,
    saved: new Date().toISOString(), changes });
  saveAll(items);
  toast(`'${clean}' 저장됨`, "ok");
  return true;
}

export function loadScenario(name) {
  const item = listScenarios().find((s) => s.name === name);
  if (!item) return;
  setParams({ ...state.defaults, ...item.params });
  const ids = state.project.adsorbents.map((a) => a.id);
  const units = (item.train?.units || []).filter((u) => ids.includes(u.ads));
  if (units.length < (item.train?.units?.length || 0)) toast("저장할 때 쓴 흡착제 중 지금 프로젝트에 없는 것은 뺐습니다", "warn");
  if (item.train?.mode === "custom" && units.length) setTrain({ enabled: true, units: structuredClone(units) });
  else setTrain({ enabled: false, auto: units.map((u) => u.ads) });
  emit("params-external");
  toast(`'${name}' 조건을 불러왔습니다`, "ok");
}

export function removeScenario(name) {
  saveAll(listScenarios().filter((s) => s.name !== name));
  setUi({ compare: state.ui.compare.filter((n) => n !== name) });
}

/** Save / pick / load / delete, shown at the top of 공정 › 시나리오 비교. */
export function scenarioManager() {
  const items = listScenarios();
  const picked = state.ui.compare;
  const input = h("input.text", { type: "text", placeholder: "지금 조건에 이름 붙이기 (예: 교체 48 h, 수지 추가)", maxlength: 40,
    onkeydown: (e) => { if (e.key === "Enter" && saveScenario(input.value)) input.value = ""; } });
  const toggle = (name) => {
    const set = new Set(picked);
    set.has(name) ? set.delete(name) : set.add(name);
    setUi({ compare: [...set].slice(-4) });
  };
  return h("section.card.scenarios", {}, [
    h("div.card-head", {}, [h("h2", {}, "시나리오"),
      h("span.muted", {}, "체크한 것(최대 4개)을 현재 조건과 나란히 비교"),
      h("span.spacer"),
      h("button.link-btn", { onclick: exportScenarios }, "파일로 내보내기"),
      h("label.link-btn", {}, ["가져오기",
        h("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: importScenarios })]),
    ]),
    h("div.row", {}, [input, h("button.btn.small.primary", { onclick: () => { if (saveScenario(input.value)) input.value = ""; } }, "저장")]),
    items.length ? h("ul.scenario-list", {}, items.map((item) => h("li", {}, [
      h("label.scenario-name", { title: item.changes?.length ? "바꾼 조건: " + item.changes.join(", ") : "기본 조건" }, [
        h("input", { type: "checkbox", checked: picked.includes(item.name) || null, onchange: () => toggle(item.name) }),
        h("b", {}, item.name),
        h("span.muted", {}, item.changes?.length ? item.changes.join(", ") : "기본값"),
      ]),
      h("button.btn.ghost.small", { title: "이 조건을 왼쪽 패널에 불러오기", onclick: () => loadScenario(item.name) }, "불러오기"),
      h("button.icon-btn", { title: "삭제", onclick: () => { if (confirm(`'${item.name}'을(를) 삭제할까요?`)) removeScenario(item.name); } }, "✕"),
    ]))) : h("p.muted.small", {}, "저장한 시나리오가 없습니다. 조건을 바꾼 뒤 이름을 붙여 저장하세요."),
  ]);
}

function exportScenarios() {
  download(`adsorption_scenarios_${today()}.json`, JSON.stringify(listScenarios(), null, 2), "application/json");
}

async function importScenarios(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    let incoming;
    try { incoming = JSON.parse(await file.text()); } catch { throw new Error("JSON 파일이 아닙니다"); }
    if (!Array.isArray(incoming)) throw new Error("형식이 다릅니다");
    const valid = incoming.filter((s) => s && typeof s.name === "string" && s.params && typeof s.params === "object");
    const merged = new Map(listScenarios().map((s) => [s.name, s]));
    valid.forEach((s) => merged.set(s.name, s));
    saveAll([...merged.values()]);
    toast(`${valid.length}개 시나리오를 가져왔습니다`, "ok");
  } catch (error) {
    toast(`가져오지 못했습니다: ${error.message}`, "bad");
  }
  event.target.value = "";
}
