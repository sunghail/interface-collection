// Colours and display names used by every chart, so a component or an adsorbent always looks the same.

/** Adsorbent kinds: colour of the bed dot, the vessel in the flowsheet and the sidebar group. */
export const KIND_COLOR = { carbon: "#2563eb", resin: "#d97706", other: "#0e9f9a" };
export const KIND_NAME = { carbon: "활성탄", resin: "고분자 수지", other: "기타" };

/** Component colours, by position in the project's component list. */
export const PALETTE = ["#2563eb", "#16a34a", "#dc2626", "#ea8a0c", "#9333ea", "#0e9f9a", "#92400e",
  "#db2777", "#4b5563", "#65a30d", "#0369a1", "#b45309", "#7c3aed", "#059669", "#be123c", "#1d4ed8",
  "#a16207", "#475569", "#15803d", "#c2410c"];

/** Distinct colours for scenarios in the comparison view. */
export const SCENARIO_COLORS = ["#111827", "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea8a0c"];

/** Blue → red ramp for time snapshots (early = blue, late = red). */
export function timeColor(index, count) {
  const t = count <= 1 ? 1 : index / (count - 1);
  const hue = 215 - 205 * t;
  return `hsl(${hue.toFixed(0)}, 72%, ${46 - 6 * Math.sin(Math.PI * t)}%)`;
}
