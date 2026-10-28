// Live process diagram: hydrolysate feed → beds in flow order → product.
// Works for the automatic design and for a user-built train. A bed that holds its targets for the service time
// is outlined green (red if not), and clicking a bed opens it in 공정 › bed별.

import { h, s, fmt } from "./util.js";
import { KIND_COLOR } from "./theme.js";

const W = { pad: 14, gap: 36, feed: 150, bed: 170, product: 170, vessel: 46 };
const Y = { vesselTop: 60, vesselBottom: 172, line: 116, height: 272 };

function layout(units) {
  let cursor = W.pad;
  const take = (width) => { const x = cursor; cursor += width; return x; };
  const feed = take(W.feed);
  const slots = units.map(() => { cursor += W.gap; return take(W.bed); });
  cursor += W.gap;
  const product = take(W.product);
  return { feed, slots, product, width: cursor + W.pad };
}

/** flow: the design flowsheet; comps: project components (name, role); summary: design summary. */
export function renderFlowsheet(flow, comps, onPick, summary) {
  const units = flow.units;
  const L = layout(units);
  const svg = s("svg", { viewBox: `0 0 ${L.width} ${Y.height}`, class: "flowsheet",
    style: { minWidth: `${Math.round(L.width * 0.62)}px` }, role: "img", "aria-label": "공정 흐름도" });
  svg.append(s("defs", {}, [
    s("marker", { id: "fs-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7,
      orient: "auto-start-reverse" }, [s("path", { d: "M0,0 L10,5 L0,10 z", class: "arrow-head" })]),
  ]));
  const shown = comps.filter((c) => c.role !== "any" && (flow.feed.C[c.id] || 0) > 0).slice(0, 4);
  box(svg, L.feed, Y.line - 58, W.feed, 116, "feed-box", [
    ["가수분해액", "fs-title"], [`${fmt(flow.feed.flow_l_h, flow.feed.flow_l_h < 10 ? 2 : 0)} L/h`, "fs-strong"],
    ...shown.map((c) => [`${c.name} ${fmt(flow.feed.C[c.id], 2)} g/L`, c.role === "remove" ? "" : "fs-muted"]),
  ]);

  let from = L.feed + W.feed;
  units.forEach((u, i) => {
    const cx = L.slots[i] + W.bed / 2;
    const times = u.assigned.map((c) => u.t_break_h[c]);
    const ok = times.every((t) => t === null || t >= summary.service_h - 1e-9);
    const status = u.assigned.length ? (ok ? "ok" : "bad") : "";
    const names = Object.fromEntries(comps.map((c) => [c.id, c.name]));
    const result = u.assigned.length
      ? [`${u.assigned.map((c) => names[c]).join(", ")} 담당`, ok ? "fs-ok" : "fs-bad"]
      : ["맡은 제거 대상 없음", "fs-muted"];
    stream(svg, from, cx - W.vessel / 2);
    vessel(svg, cx, u.kind, status, u, onPick);
    caption(svg, cx, [
      [u.short, "fs-title"],
      [u.ads_name, ""],
      [`D ${fmt(u.D, u.D < 1 ? 3 : 2)} × L ${fmt(u.L, 2)} m`, "fs-muted"],
      [`EBCT ${fmt(u.EBCT_min, 1)} min · ${fmt(u.mass_kg, u.mass_kg < 10 ? 2 : 0)} kg`, "fs-muted"],
      result,
    ]);
    from = cx + W.vessel / 2;
  });

  stream(svg, from, L.product);
  const p = flow.product;
  box(svg, L.product, Y.line - 58, W.product, 116, "product-box", [
    [`제품 (교체 주기 평균)`, "fs-title"], [`${fmt(p.volume_m3 * 1000, 0)} L / 주기`, "fs-strong"],
    ...shown.map((c) => [`${c.name} ${fmt(p.C[c.id], 3)} g/L`, c.role === "remove" ? "" : "fs-muted"]),
  ]);
  return h("div.flowsheet-wrap", {}, [svg]);
}

function stream(svg, x1, x2) {
  if (x2 - x1 < 4) return;
  svg.append(s("line", { x1, x2: x2 - 2, y1: Y.line, y2: Y.line, class: "stream", "marker-end": "url(#fs-arrow)" }));
}

function vessel(svg, cx, kind, status, bed, onPick) {
  const group = s("g", { class: `vessel ${kind} ${status}`.trim(), tabindex: 0, role: "button",
    "aria-label": `${bed.short} 자세히 보기` });
  const height = Y.vesselBottom - Y.vesselTop;
  group.append(s("rect", { x: cx - W.vessel / 2, y: Y.vesselTop, width: W.vessel, height, rx: 18, class: "shell" }));
  group.append(s("rect", { x: cx - W.vessel / 2 + 3, y: Y.vesselTop + 18, width: W.vessel - 6, height: height - 36,
    class: "packing", style: { fill: KIND_COLOR[kind] || "#94a3b8", opacity: 0.35 } }));
  group.append(s("title", {}, `${bed.label} — 클릭하면 이 bed만 자세히`));
  group.addEventListener("click", () => onPick(bed.id));
  group.addEventListener("keydown", (e) => { if (e.key === "Enter") onPick(bed.id); });
  svg.append(group);
}

function caption(svg, cx, lines) {
  lines.forEach(([text, cls], i) => {
    svg.append(s("text", { x: cx, y: Y.vesselBottom + 20 + i * 16, "text-anchor": "middle",
      class: `fs-line ${cls}`.trim() }, text));
  });
}

function box(svg, x, y, width, height, cls, lines) {
  svg.append(s("rect", { x, y, width, height, rx: 10, class: cls }));
  lines.forEach(([text, c], i) => {
    svg.append(s("text", { x: x + width / 2, y: y + 22 + i * 17, "text-anchor": "middle",
      class: `fs-line ${c}`.trim() }, text));
  });
}
