// Live process diagram: feed → beds in flow order (each optionally followed by a separator) → product.
// Works for the automatic design and for a user-built train. A reactor that is judged against a
// target is outlined green/red, and clicking a reactor opens it in the single-bed view.

import { h, s, fmt } from "./util.js";

const W = { pad: 14, gap: 34, feed: 128, acid: 150, cao: 170, sep: 100, product: 160, vessel: 46, drum: 54 };
const Y = { meohText: 26, vesselTop: 72, vesselBottom: 184, line: 128, height: 286 };

/** Left-to-right slots, so every element knows its own x and the streams can join edge to edge. */
function layout(units) {
  let cursor = W.pad;
  const take = (width) => { const x = cursor; cursor += width; return x; };
  const feed = take(W.feed);
  const slots = units.map((u) => {
    cursor += W.gap;
    const bed = take(W[u.kind]);
    return { bed, width: W[u.kind], sep: u.separator ? take(W.sep) : null };
  });
  cursor += W.gap;
  const product = take(W.product);
  return { feed, slots, product, width: cursor + W.pad };
}

export function renderFlowsheet(flow, params, onPick, summary = null) {
  const units = flow.units;
  const L = layout(units);
  const svg = s("svg", { viewBox: `0 0 ${L.width} ${Y.height}`, class: "flowsheet",
    style: { minWidth: `${Math.round(L.width * 0.62)}px` }, role: "img", "aria-label": "공정 흐름도" });
  svg.append(s("defs", {}, [
    s("marker", { id: "fs-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7,
      orient: "auto-start-reverse" }, [s("path", { d: "M0,0 L10,5 L0,10 z", class: "arrow-head" })]),
  ]));

  box(svg, L.feed, Y.line - 48, W.feed, 96, "feed-box", [
    ["폐식용유", "fs-title"], [`${fmt(flow.feed.oil_kg_h, 0)} kg/h`, "fs-strong"],
    [`FFA ${fmt(flow.feed.ffa_wt, 2)} wt%`, ""], [`산가 ${fmt(flow.feed.acid_value, 2)}`, "fs-muted"],
  ]);

  const custom = flow.mode === "custom";
  const firstCao = units.findIndex((u) => u.kind === "cao");
  const acidBefore = units.slice(0, firstCao < 0 ? units.length : firstCao).map((u, i) => [u, i]).filter(([u]) => u.kind === "acid");
  const checkedAcid = acidBefore.length ? acidBefore[acidBefore.length - 1][1] : -1;
  const lastCao = units.map((u) => u.kind).lastIndexOf("cao");
  const overall = summary?.conversion;

  let from = L.feed + W.feed;           // right edge of the previous element on the main line
  units.forEach((u, i) => {
    const slot = L.slots[i];
    const cx = slot.bed + slot.width / 2;
    let status = "", resultClass = "fs-strong", result;
    if (u.kind === "acid") {
      result = `산가 ${fmt(u.av_in, 2)} → ${fmt(u.av_out, 2)}`;
      if (i === checkedAcid) {
        const ok = u.av_out <= params.target_av + 1e-9;
        status = ok ? "ok" : "bad"; resultClass = ok ? "fs-ok" : "fs-bad";
      }
    } else {
      const soapRisk = u.av_in > params.target_av + 1e-9;
      if (i === lastCao && overall !== undefined && overall !== null) {
        const ok = overall >= params.target_x - 1e-9 && !soapRisk;
        status = ok ? "ok" : "bad"; resultClass = overall >= params.target_x - 1e-9 ? "fs-ok" : "fs-bad";
        result = i === firstCao ? `전환율 ${fmt(u.conversion, 2)} %` : `누적 전환율 ${fmt(overall, 2)} %`;
      } else {
        result = `이 bed 전환율 ${fmt(u.conversion, 1)} %`;
        if (soapRisk) status = "bad";
      }
    }
    stream(svg, from, cx - W.vessel / 2, i === 0 ? "" : `FFA ${fmt(u.ffa_in_wt, 2)}`);
    vessel(svg, cx, u.kind, status, u, onPick);
    methanol(svg, cx, u.meoh_added_kg_h ?? u.meoh_in_kg_h);
    caption(svg, cx, [
      [u.short, "fs-title"],
      [`D ${fmt(u.D, 2)} × L ${fmt(u.L, 2)} m`, ""],
      [custom ? `τ ${fmt(u.tau_min, 1)} min · ${fmt(u.T_c, 0)} °C` : u.kind === "cao"
        ? `τ ${fmt(u.tau_min, 1)} min · 촉매 ${fmt(u.catalyst_kg, 0)} kg` : `τ ${fmt(u.tau_min, 1)} min`, "fs-muted"],
      [result, resultClass],
    ]);
    from = cx + W.vessel / 2;
    if (u.separator) {
      const sx = slot.sep + (W.sep - W.drum) / 2;
      stream(svg, from, sx, "");
      separator(svg, sx, u);
      from = sx + W.drum;
    }
  });

  if (!custom && !units.some((u) => u.kind === "acid")) {
    svg.append(s("text", { x: L.feed, y: Y.height - 12, class: "fs-note" }, "원료 산가가 목표보다 낮아 산촉매 단계를 생략했습니다"));
  }

  stream(svg, from, L.product, "");
  const p = flow.product;
  box(svg, L.product, Y.line - 58, W.product, 116, "product-box", [
    [p.separated ? "제품 (분리 후)" : "제품 (분리 전)", "fs-title"], [`FAME ${fmt(p.fame_kg_h, 1)} kg/h`, "fs-strong"],
    [`글리세롤 ${fmt(p.glycerol_kg_h, 1)} kg/h`, ""], [`남은 TG ${fmt(p.tg_kg_h, 2)} kg/h`, "fs-muted"],
    [`MeOH ${fmt(p.meoh_kg_h, 1)} kg/h`, "fs-muted"],
  ]);
  return h("div.flowsheet-wrap", {}, [svg]);
}

function separator(svg, sx, u) {
  const cx = sx + W.drum / 2;
  const removed = u.separator;
  svg.append(s("rect", { x: sx, y: Y.line - 15, width: W.drum, height: 30, rx: 15, class: "separator" }));
  svg.append(s("text", { x: cx, y: Y.line - 22, "text-anchor": "middle", class: "fs-small fs-muted" }, "분리기"));
  svg.append(s("line", { x1: cx, x2: cx, y1: Y.line + 15, y2: Y.line + 46, class: "stream side", "marker-end": "url(#fs-arrow)" }));
  const first = u.kind === "cao" ? `글리세롤 ${fmt(removed.GL_kg_h ?? 0, 1)} kg/h` : `물 ${fmt(removed.H2O_kg_h ?? 0, 2)} kg/h`;
  svg.append(s("text", { x: cx, y: Y.line + 62, "text-anchor": "middle", class: "fs-small" }, first));
  svg.append(s("text", { x: cx, y: Y.line + 76, "text-anchor": "middle", class: "fs-small fs-muted" },
    `MeOH ${fmt(removed.MeOH_kg_h ?? 0, 1)} 회수`));
}

function stream(svg, x1, x2, text) {
  if (x2 - x1 < 4) return;
  svg.append(s("line", { x1, x2: x2 - 2, y1: Y.line, y2: Y.line, class: "stream", "marker-end": "url(#fs-arrow)" }));
  if (text) {
    svg.append(s("text", { x: (x1 + x2) / 2, y: Y.line - 9, "text-anchor": "middle", class: "fs-small fs-stream" }, text));
  }
}

function vessel(svg, cx, kind, status, bed, onPick) {
  const group = s("g", { class: `vessel ${kind} ${status}`.trim(), tabindex: 0, role: "button",
    "aria-label": `${bed.short} 자세히 보기` });
  const height = Y.vesselBottom - Y.vesselTop;
  group.append(s("rect", { x: cx - W.vessel / 2, y: Y.vesselTop, width: W.vessel, height, rx: 18, class: "shell" }));
  group.append(s("rect", { x: cx - W.vessel / 2 + 3, y: Y.vesselTop + 18, width: W.vessel - 6, height: height - 36,
    class: "packing" }));
  group.append(s("title", {}, `${bed.label} — 클릭하면 이 bed만 자세히`));
  group.addEventListener("click", () => onPick(bed.id));
  group.addEventListener("keydown", (e) => { if (e.key === "Enter") onPick(bed.id); });
  svg.append(group);
}

function methanol(svg, cx, kgh) {
  const none = !(kgh > 0.05);
  svg.append(s("text", { x: cx, y: Y.meohText, "text-anchor": "middle", class: `fs-small ${none ? "fs-muted" : "fs-meoh"}` },
    none ? "MeOH 추가 없음" : `MeOH ${fmt(kgh, 1)} kg/h`));
  if (!none) {
    svg.append(s("line", { x1: cx, x2: cx, y1: Y.meohText + 8, y2: Y.vesselTop - 3, class: "stream meoh",
      "marker-end": "url(#fs-arrow)" }));
  }
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
