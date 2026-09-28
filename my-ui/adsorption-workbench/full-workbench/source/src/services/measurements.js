// UI-facing facade. Core implementations can move to a Node service later
// without putting file parsing or calculations into presentation code.
export { createEntry, saveWorkspace, restoreWorkspace, defaultAxes } from '../core/workspace.js';
export { curveFor, csvExport, validateAxes, pressureFactor, expectedPressure } from '../core/data.js';
export { pointsFor, branchLabels } from '../core/branches.js';

export { isSampleExcluded, toggleSample } from '../core/point-selection.js';
