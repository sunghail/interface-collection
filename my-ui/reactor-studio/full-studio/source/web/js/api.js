// Thin wrappers around the server API. Every call rejects with a readable Korean message.

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error("서버에 연결할 수 없습니다. 터미널에서 server.py가 실행 중인지 확인하세요.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error || `서버 오류 (${response.status})`);
  return data;
}

export const api = {
  spec: () => request("/api/spec"),
  steady: (params, train = null) => request("/api/steady", { method: "POST", body: { params, train } }),
  transient: (params, bed, train = null) => request("/api/transient", { method: "POST", body: { params, bed, train } }),
  startDeactivation: (params, train = null) => request("/api/deactivation", { method: "POST", body: { params, train } }),
  job: (id) => request(`/api/job?id=${encodeURIComponent(id)}`),
  datasets: () => request("/api/fit/datasets"),
  dataset: (name) => request(`/api/fit/dataset?name=${encodeURIComponent(name)}`),
  fit: (target, csv, fitEa) => request("/api/fit", { method: "POST", body: { target, csv, fit_ea: fitEa } }),
  clearCache: () => request("/api/cache/clear", { method: "POST", body: {} }),
  optimize: (params, setup) => request("/api/optimize", { method: "POST", body: { params, setup } }),
  optimizeStatus: (id) => request(`/api/optimize/status?id=${encodeURIComponent(id)}`),
  optimizeCancel: (id) => request("/api/optimize/cancel", { method: "POST", body: { id } }),
  sweep: (params, variable, lo, hi, n) => request("/api/sweep", { method: "POST", body: { params, variable, lo, hi, n } }),
};

/** Start (or reuse) a saponification job and poll until it finishes. onTick(elapsedSeconds). */
export async function runDeactivation(params, train, onTick, isCurrent = () => true) {
  let state = await api.startDeactivation(params, train);
  const started = performance.now();
  while (state.status === "running") {
    if (!isCurrent()) return null;
    onTick?.(state.elapsed_s ?? (performance.now() - started) / 1000);
    await new Promise((resolve) => setTimeout(resolve, 800));
    state = await api.job(state.id);
  }
  if (state.status === "error") throw new Error(state.error);
  if (state.status !== "done") throw new Error("계산 작업을 찾을 수 없습니다. 다시 시도하세요.");
  return state.result;
}
