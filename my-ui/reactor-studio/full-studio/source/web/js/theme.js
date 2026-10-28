// Colours and display names used by every chart, so a species always looks the same.

export const SPECIES_COLOR = {
  TG: "#2563eb", FFA: "#dc2626", MeOH: "#0e9f9a", FAME: "#16a34a",
  H2O: "#ea8a0c", GL: "#8b5cf6", CaSoap: "#92400e",
};

export const SPECIES_NAME = {
  TG: "TG (기름)", FFA: "FFA (유리지방산)", MeOH: "메탄올", FAME: "FAME (바이오디젤)",
  H2O: "물", GL: "글리세롤", CaSoap: "칼슘 비누",
};

export const BED_COLOR = { acid: "#d97706", cao: "#2563eb" };

/** Distinct colours for scenarios in the comparison view. */
export const SCENARIO_COLORS = ["#111827", "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea8a0c"];

/** Blue → red ramp for time snapshots (early = blue, late = red). */
export function timeColor(index, count) {
  const t = count <= 1 ? 1 : index / (count - 1);
  const hue = 215 - 205 * t;
  return `hsl(${hue.toFixed(0)}, 72%, ${46 - 6 * Math.sin(Math.PI * t)}%)`;
}
