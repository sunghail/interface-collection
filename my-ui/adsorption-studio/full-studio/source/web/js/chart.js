// Line / marker chart drawn as SVG at the container's real pixel width.
//
// createChart(options) -> HTMLElement
//   title, caption, xLabel, yLabel, rightLabel, height
//   series: [{ name, color, x, y, axis: "left"|"right", dash, width, mode: "line"|"markers" }]
//   xMin/xMax, yMin/yMax, rightMin/rightMax    fixed limits (data beyond a limit still widens the axis)
//   hlines: [{ y, label, axis }]   vlines: [{ x, label }]
//   xDigits / yDigits              digits in the hover readout
//
// Hover shows every visible series at the pointed x; legend entries toggle series; the toolbar
// offers an enlarged view, PNG and CSV.

import { h, s, isNum, fmtSmart, download } from "./util.js";

const MARGIN = { top: 14, bottom: 46, left: 58, right: 18, rightAxis: 60 };

export function niceScale(lo, hi, maxTicks = 5) {
  if (!(hi > lo)) hi = lo + (Math.abs(lo) || 1);
  const raw = (hi - lo) / maxTicks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find((f) => f * magnitude >= raw * (1 - 1e-9)) * magnitude;
  const start = Math.floor(lo / step + 1e-9) * step;
  const end = Math.ceil(hi / step - 1e-9) * step;
  // a 2.5 step needs one more decimal than its magnitude says (0, 2.5, 5, 7.5 — not 0, 3, 5, 8)
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9) + (Math.abs(step / magnitude - 2.5) < 1e-9 ? 1 : 0));
  const ticks = [];
  for (let v = start; v <= end + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
  return { lo: start, hi: end, ticks, decimals };
}

function axisRange(series, fixedMin, fixedMax, includeZero = true) {
  const ys = series.flatMap((sr) => sr.y.filter(isNum));
  if (!ys.length) return niceScale(fixedMin ?? 0, fixedMax ?? 1);
  const dataLo = Math.min(...ys), dataHi = Math.max(...ys);
  const lo = fixedMin === undefined ? (includeZero ? Math.min(0, dataLo) : dataLo) : Math.min(fixedMin, dataLo);
  const hi = fixedMax === undefined ? dataHi : Math.max(fixedMax, dataHi > fixedMax * 1.001 ? dataHi : fixedMax);
  return niceScale(lo, hi);
}

// "5.0" in a 0 / 2.5 / 5 / 7.5 axis reads better as "5": drop a trailing ".0" when it carries nothing
const tickText = (value, decimals) => (decimals === 1 ? value.toFixed(1).replace(/\.0$/, "") : value.toFixed(decimals));

/** Nearest index in a (mostly) sorted x array. */
function nearestIndex(xs, x) {
  let lo = 0, hi = xs.length - 1;
  if (hi < 0) return -1;
  if (xs[hi] < xs[0]) {                       // not ascending: fall back to a scan
    let best = 0;
    xs.forEach((v, i) => { if (Math.abs(v - x) < Math.abs(xs[best] - x)) best = i; });
    return best;
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < x) lo = mid; else hi = mid;
  }
  return Math.abs(xs[lo] - x) <= Math.abs(xs[hi] - x) ? lo : hi;
}

export function createChart(options) {
  const card = h("div.chart-card");
  const hidden = new Set(options.hiddenSeries || []);
  const plotBox = h("div.chart-plot");
  const tooltip = h("div.chart-tooltip");
  const legend = h("div.chart-legend");
  plotBox.append(tooltip);

  const toolbar = h("div.chart-tools", {}, [
    h("button.icon-btn", { title: "크게 보기", onclick: () => openZoom(options, hidden) }, "⤢"),
    h("button.icon-btn", { title: "PNG 저장", onclick: () => exportPng(card, options) }, "PNG"),
    h("button.icon-btn", { title: "CSV 저장", onclick: () => exportCsv(options, hidden) }, "CSV"),
  ]);
  card.append(
    h("div.chart-head", {}, [
      h("div", {}, [h("h3", {}, options.title || ""),
        options.caption ? h("p.chart-caption", {}, options.caption) : null]),
      toolbar,
    ]),
    plotBox, legend,
  );

  let lastWidth = 0;
  const render = () => {
    const width = Math.floor(plotBox.clientWidth);
    if (width < 50) return;
    lastWidth = width;
    draw(plotBox, tooltip, options, hidden, width);
    drawLegend(legend, options, hidden, render);
  };
  const observer = new ResizeObserver(() => {
    if (Math.abs(plotBox.clientWidth - lastWidth) > 2) render();
  });
  observer.observe(plotBox);
  card.rerender = render;
  return card;
}

/** Series sharing a `group` are shown/hidden together; `noLegend` series have no legend entry. */
const skey = (sr) => sr.group || sr.name;

function drawLegend(legend, options, hidden, rerender) {
  legend.replaceChildren(...options.series.filter((sr) => sr.x?.length && !sr.noLegend).map((sr) => h("button.legend-item", {
    class: hidden.has(skey(sr)) ? "legend-item off" : "legend-item",
    title: hidden.has(skey(sr)) ? "클릭해서 보이기" : "클릭해서 숨기기",
    onclick: () => { hidden.has(skey(sr)) ? hidden.delete(skey(sr)) : hidden.add(skey(sr)); rerender(); },
  }, [
    h("span.swatch", {
      style: { background: sr.mode === "markers" ? "transparent" : sr.color, borderColor: sr.color, color: sr.color },
      class: sr.mode === "markers" ? "swatch dot" : sr.dash ? "swatch dashed" : "swatch",
    }),
    sr.name + (sr.axis === "right" ? " (오른쪽 축)" : ""),
  ])));
}

function draw(plotBox, tooltip, options, hidden, width) {
  plotBox.querySelector("svg")?.remove();
  const height = options.height || 236;
  const all = options.series.filter((sr) => sr.x?.length);
  const visible = all.filter((sr) => !hidden.has(skey(sr)));
  const right = visible.filter((sr) => sr.axis === "right");
  const left = visible.filter((sr) => sr.axis !== "right");
  const hasRight = all.some((sr) => sr.axis === "right");
  const m = { ...MARGIN, right: hasRight ? MARGIN.rightAxis : MARGIN.right };
  const svg = s("svg", { width, height, viewBox: `0 0 ${width} ${height}`, class: "chart-svg" });
  plotBox.prepend(svg);

  if (!visible.length) {
    svg.append(s("text", { x: width / 2, y: height / 2, "text-anchor": "middle", class: "chart-empty" },
      all.length ? "모든 선이 숨겨져 있습니다" : "표시할 데이터가 없습니다"));
    return;
  }

  const xs = visible.flatMap((sr) => sr.x.filter(isNum));
  const x0 = options.xMin ?? Math.min(...xs);
  const x1 = Math.max(options.xMax ?? Math.max(...xs), x0 + 1e-9);
  const xScale = niceScale(x0, x1);
  const xTicks = xScale.ticks.filter((v) => v >= x0 - 1e-9 && v <= x1 + 1e-9);
  const L = axisRange(left.length ? left : right, options.yMin, options.yMax);
  const R = right.length ? axisRange(right, options.rightMin ?? 0, options.rightMax) : null;

  const pw = width - m.left - m.right, ph = height - m.top - m.bottom;
  const X = (v) => m.left + (v - x0) / (x1 - x0) * pw;
  const Y = (v) => m.top + ph - (v - L.lo) / (L.hi - L.lo) * ph;
  const Y2 = R ? (v) => m.top + ph - (v - R.lo) / (R.hi - R.lo) * ph : Y;

  // grid and axes
  for (const v of L.ticks) {
    svg.append(s("line", { x1: m.left, x2: m.left + pw, y1: Y(v), y2: Y(v), class: "grid" }));
    svg.append(s("text", { x: m.left - 8, y: Y(v) + 4, "text-anchor": "end", class: "tick" }, tickText(v, L.decimals)));
  }
  for (const v of xTicks) {
    svg.append(s("text", { x: X(v), y: m.top + ph + 18, "text-anchor": "middle", class: "tick" }, tickText(v, xScale.decimals)));
  }
  svg.append(s("line", { x1: m.left, x2: m.left + pw, y1: m.top + ph, y2: m.top + ph, class: "axis" }));
  svg.append(s("line", { x1: m.left, x2: m.left, y1: m.top, y2: m.top + ph, class: "axis" }));
  svg.append(s("text", { x: m.left + pw / 2, y: height - 8, "text-anchor": "middle", class: "axis-label" },
    options.xLabel || ""));
  svg.append(s("text", { x: 14, y: m.top + ph / 2, "text-anchor": "middle", class: "axis-label",
    transform: `rotate(-90 14 ${m.top + ph / 2})` }, options.yLabel || ""));
  if (R) {
    const color = right[0].color;
    svg.append(s("line", { x1: m.left + pw, x2: m.left + pw, y1: m.top, y2: m.top + ph, class: "axis" }));
    for (const v of R.ticks) {
      svg.append(s("text", { x: m.left + pw + 8, y: Y2(v) + 4, class: "tick", style: { fill: color } }, tickText(v, R.decimals)));
    }
    svg.append(s("text", { x: width - 12, y: m.top + ph / 2, "text-anchor": "middle", class: "axis-label",
      style: { fill: color }, transform: `rotate(90 ${width - 12} ${m.top + ph / 2})` }, options.rightLabel || ""));
  }

  // data, clipped to the plot area
  const clipId = `clip${Math.random().toString(36).slice(2, 9)}`;
  svg.append(s("defs", {}, [s("clipPath", { id: clipId }, [s("rect", { x: m.left, y: m.top - 1, width: pw, height: ph + 2 })])]));
  const plot = s("g", { "clip-path": `url(#${clipId})` });
  svg.append(plot);

  for (const line of options.hlines || []) {
    if (!isNum(line.y)) continue;
    const y = (line.axis === "right" ? Y2 : Y)(line.y);
    plot.append(s("line", { x1: m.left, x2: m.left + pw, y1: y, y2: y, class: "ref-line" }));
    if (line.label) plot.append(s("text", { x: m.left + pw - 6, y: y - 5, "text-anchor": "end", class: "ref-label" }, line.label));
  }
  for (const line of options.vlines || []) {
    if (!isNum(line.x)) continue;
    plot.append(s("line", { x1: X(line.x), x2: X(line.x), y1: m.top, y2: m.top + ph, class: "ref-line" }));
    if (line.label) plot.append(s("text", { x: X(line.x) + 5, y: m.top + 12, class: "ref-label" }, line.label));
  }

  for (const sr of visible) {
    const mapY = sr.axis === "right" ? Y2 : Y;
    if (sr.mode === "markers") {
      sr.x.forEach((xv, i) => {
        if (isNum(xv) && isNum(sr.y[i])) {
          plot.append(s("circle", { cx: X(xv), cy: mapY(sr.y[i]), r: 4.5, fill: "#fff", stroke: sr.color, "stroke-width": 2 }));
        }
      });
      continue;
    }
    let d = "", pen = false;
    sr.x.forEach((xv, i) => {
      const yv = sr.y[i];
      if (!isNum(xv) || !isNum(yv)) { pen = false; return; }
      d += `${pen ? "L" : "M"}${X(xv).toFixed(1)},${mapY(yv).toFixed(1)}`;
      pen = true;
    });
    plot.append(s("path", { d, fill: "none", stroke: sr.color, "stroke-width": sr.width || 2,
      "stroke-dasharray": sr.dash || null, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  }

  // hover readout
  const cross = s("line", { y1: m.top, y2: m.top + ph, class: "crosshair", visibility: "hidden" });
  const dots = s("g");
  svg.append(cross, dots);
  const overlay = s("rect", { x: m.left, y: m.top, width: pw, height: ph, fill: "transparent" });
  svg.append(overlay);
  const hide = () => { cross.setAttribute("visibility", "hidden"); dots.replaceChildren(); tooltip.classList.remove("show"); };
  overlay.addEventListener("mouseleave", hide);
  overlay.addEventListener("mousemove", (event) => {
    const box = svg.getBoundingClientRect();
    const px = event.clientX - box.left;
    const xv = x0 + (px - m.left) / pw * (x1 - x0);
    const rows = [];
    let snapX = null;
    dots.replaceChildren();
    for (const sr of visible) {
      const i = nearestIndex(sr.x, xv);
      if (i < 0 || !isNum(sr.y[i])) continue;
      if (sr.mode === "markers" && Math.abs(X(sr.x[i]) - px) > 12) continue;
      snapX ??= sr.x[i];
      const mapY = sr.axis === "right" ? Y2 : Y;
      dots.append(s("circle", { cx: X(sr.x[i]), cy: mapY(sr.y[i]), r: 4, fill: sr.color, stroke: "#fff", "stroke-width": 1.5 }));
      rows.push(h("div.tt-row", {}, [h("span.swatch", { style: { background: sr.color } }), h("span.tt-name", {}, sr.name),
        h("b", {}, fmtSmart(sr.y[i], options.yDigits || 4))]));
    }
    if (!rows.length) return hide();
    cross.setAttribute("x1", X(snapX)); cross.setAttribute("x2", X(snapX));
    cross.setAttribute("visibility", "visible");
    tooltip.replaceChildren(h("div.tt-head", {}, `${options.xLabel ? options.xLabel.split(" (")[0].split(":")[0] : "x"} = ${fmtSmart(snapX, options.xDigits || 4)}`), ...rows);
    tooltip.classList.add("show");
    const tipWidth = tooltip.offsetWidth;
    const left = X(snapX) + 14 + tipWidth > width ? X(snapX) - tipWidth - 14 : X(snapX) + 14;
    tooltip.style.left = `${Math.max(4, left)}px`;
    tooltip.style.top = `${m.top + 4}px`;
  });
}

// ------------------------------------------------------------------------------------ export
function openZoom(options, hidden) {
  const modal = document.getElementById("modal");
  const body = modal.querySelector(".modal-body");
  const big = createChart({ ...options, height: Math.max(420, Math.round(window.innerHeight * 0.62)),
    hiddenSeries: [...hidden] });
  body.replaceChildren(big);
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => big.rerender());
}

function exportPng(card, options) {
  const svg = card.querySelector("svg");
  if (!svg) return;
  const width = Number(svg.getAttribute("width")), height = Number(svg.getAttribute("height"));
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = CHART_EXPORT_CSS;
  clone.prepend(style);
  // title above the plot, white background
  const extra = 30;
  clone.setAttribute("height", height + extra);
  clone.setAttribute("viewBox", `0 ${-extra} ${width} ${height + extra}`);
  clone.prepend(s("rect", { x: 0, y: -extra, width, height: height + extra, fill: "#fff" }));
  clone.append(s("text", { x: 12, y: -10, class: "export-title" }, options.title || ""));
  const data = new XMLSerializer().serializeToString(clone);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width * 2; canvas.height = (height + extra) * 2;
    const context = canvas.getContext("2d");
    context.scale(2, 2);
    context.drawImage(image, 0, 0);
    canvas.toBlob((blob) => download(`${slug(options.title)}.png`, blob));
  };
  image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(data);
}

function exportCsv(options, hidden) {
  const series = options.series.filter((sr) => sr.x?.length && !hidden.has(skey(sr)));
  const shared = series.every((sr) => sr.x.length === series[0].x.length && sr.x.every((v, i) => v === series[0].x[i]));
  const cell = (v) => (isNum(v) ? String(v) : "");
  let text;
  if (shared && series.length) {
    text = [[options.xLabel || "x", ...series.map((sr) => sr.name)].join(",")]
      .concat(series[0].x.map((x, i) => [cell(x), ...series.map((sr) => cell(sr.y[i]))].join(","))).join("\n");
  } else {
    text = ["series,x,y"].concat(series.flatMap((sr) => sr.x.map((x, i) => `"${sr.name}",${cell(x)},${cell(sr.y[i])}`))).join("\n");
  }
  download(`${slug(options.title)}.csv`, "﻿" + text, "text/csv;charset=utf-8");
}

const slug = (text) => (text || "chart").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 60);

const CHART_EXPORT_CSS = `
  text { font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; }
  .grid { stroke: #eceef2; } .axis { stroke: #9aa1ad; }
  .tick { font-size: 12px; fill: #6b7280; } .axis-label { font-size: 13px; font-weight: 600; fill: #1f2430; }
  .ref-line { stroke: #111827; stroke-dasharray: 5 4; } .ref-label { font-size: 11px; fill: #374151; }
  .crosshair { display: none; } .export-title { font-size: 15px; font-weight: 700; fill: #111827; }`;
