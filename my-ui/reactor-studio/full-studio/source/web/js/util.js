// Small DOM, formatting and file helpers shared by every module.

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const SVG_NS = "http://www.w3.org/2000/svg";

/** h("div.card#id", {attrs}, children) — tag with optional .class and #id shorthands. */
export function h(tag, attrs = {}, children = []) {
  const [, name, rest = ""] = tag.match(/^([a-z0-9-]+)(.*)$/i);
  const node = document.createElement(name);
  for (const part of rest.match(/[.#][^.#]+/g) || []) {
    if (part[0] === ".") node.classList.add(part.slice(1));
    else node.id = part.slice(1);
  }
  applyAttrs(node, attrs);
  append(node, children);
  return node;
}

export function s(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  applyAttrs(node, attrs);
  append(node, children);
  return node;
}

function applyAttrs(node, attrs) {
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
    else if (key === "dataset") Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? "" : value);
  }
}

function append(node, children) {
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === "string" || typeof child === "number"
      ? document.createTextNode(String(child)) : child);
  }
}

export const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Number formatting: fixed digits, "-" for missing values. */
export function fmt(value, digits = 2) {
  if (!isNum(value)) return "–";
  return value.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Up to `sig` significant digits, no trailing zeros; switches to 1.2e-3 style for tiny values. */
export function fmtSmart(value, sig = 3) {
  if (!isNum(value)) return "–";
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs < 1e-3 || abs >= 1e6) return value.toExponential(Math.max(sig - 1, 0)).replace("e", "×10^");
  const digits = Math.max(0, sig - 1 - Math.floor(Math.log10(abs)));
  return String(Number(value.toFixed(Math.min(digits, 6))));
}

export function debounce(fn, wait) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

export function download(filename, content, type = "text/plain;charset=utf-8") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  // inside the desktop app (ReactorStudio.exe) the file goes through Windows' "save as" dialog
  if (window.pywebview?.api?.save_file) {
    saveThroughApp(filename, blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = h("a", { href: url, download: filename });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function saveThroughApp(filename, blob) {
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const result = await window.pywebview.api.save_file(filename, String(dataUrl).split(",", 2)[1]);
    if (result?.saved) toast(`저장했습니다: ${result.path}`, "ok");
  } catch (error) {
    toast(`저장하지 못했습니다: ${error.message || error}`, "bad");
  }
}

/** Stable key for a parameter set (object key order does not matter). */
export function paramsKey(params) {
  return JSON.stringify(Object.keys(params).sort().map((k) => [k, params[k]]));
}

let toastTimer = null;
export function toast(message, kind = "info") {
  const node = $("#toast");
  node.textContent = message;
  node.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.className = "toast"; }, 3200);
}

/** Mark a closed drawer/modal hidden for assistive tech; focus leaves it first (a hidden element must not keep focus). */
export function hide(panel) {
  if (!panel) return;
  if (panel.contains(document.activeElement)) document.activeElement.blur();
  panel.setAttribute("aria-hidden", "true");
}

/** Local date (not UTC: in Korea a file saved before 09:00 would otherwise carry yesterday's date). */
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Replace a node's children, skipping null/false entries (optional sections). */
export function mount(root, ...children) {
  root.replaceChildren(...children.filter((c) => c !== null && c !== undefined && c !== false));
}
