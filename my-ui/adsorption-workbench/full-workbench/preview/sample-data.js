// Entirely synthetic curves for UI demonstration. Not experimental data or a physical model.
export function syntheticRats() {
  return [288.15, 298.15, 308.15].map((temperature, index) => {
    const rows = [
      ',2026-09-28,12:00:00,SYNTHETIC UI ONLY,No experimental data,Demo sample,Generated curves,',
      'HP-DEMO,UI-ARCHIVE,0',
      `1,25,10,60,N2,25,${temperature},760,0.162,0,0,0`,
      '0,0,0', '50',
    ];
    for (const pressure of [1, 3, 7, 12, 20, 30, 50, 75, 100, 150, 250, 400, 600, 800, 1000]) {
      const c0 = pressure + 8;
      const tau = (24 - index * 4) / (1 + pressure / 1000);
      for (let time = 1; time <= 120; time++) {
        const c = pressure + 8 * 1.07 * Math.exp(-time / tau);
        rows.push([time, c, c0, pressure, c, pressure + 12, 10].join(','));
      }
      rows.push('-999,-999', `${pressure},${(20 - index * 1.5) * pressure / (120 + index * 20 + pressure)}`);
    }
    return { name: `SYNTHETIC-${temperature}K.RAT`, text: rows.join('\n') + '\n' };
  });
}
