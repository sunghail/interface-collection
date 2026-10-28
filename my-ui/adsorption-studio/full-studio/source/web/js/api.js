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
    throw new Error("서버에 연결할 수 없습니다. 프로그램(또는 server.py)이 실행 중인지 확인하세요.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error || `서버 오류 (${response.status})`);
  return data;
}

const post = (path, body) => request(path, { method: "POST", body });

export const api = {
  spec: () => request("/api/spec"),
  project: () => request("/api/project"),
  saveProject: (project) => post("/api/project", { project }),
  resetProject: () => post("/api/project/reset", {}),
  library: () => request("/api/library"),
  libraryItem: (id) => request(`/api/library/item?id=${encodeURIComponent(id)}`),
  librarySave: (adsorbent, components) => post("/api/library/save", { adsorbent, components }),
  libraryDelete: (id) => post("/api/library/delete", { id }),
  compare: (project, t_end = null) => post("/api/compare", { project, t_end }),
  batch: (project, request) => post("/api/batch", { project, request }),
  steady: (params, train, project) => post("/api/steady", { params, train, project }),
  rankColumns: (params, project, size = null) => post("/api/rank_columns", { params, project, size }),
  doseSweep: (project, request) => post("/api/dose_sweep", { project, request }),
  bedSweep: (params, project, adsorbent, D, lengths) => post("/api/bed_sweep", { params, project, adsorbent, D, lengths }),
  clearCache: () => post("/api/cache/clear", {}),
  optimize: (params, setup, train, project) => post("/api/optimize", { params, setup, train, project }),
  optimizeStatus: (id) => request(`/api/optimize/status?id=${encodeURIComponent(id)}`),
  optimizeCancel: (id) => post("/api/optimize/cancel", { id }),
  sweep: (params, variable, lo, hi, n, train, project) => post("/api/sweep", { params, variable, lo, hi, n, train, project }),
};
