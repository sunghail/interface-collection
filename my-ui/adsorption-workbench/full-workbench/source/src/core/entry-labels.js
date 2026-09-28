// Display identifiers are workspace metadata; raw names and measurements stay intact.
export const dataNumberLabel = entry => `D${String(entry.dataNumber).padStart(2, '0')}`;

export function prepareEntryLabels(entries) {
  const valid = number => Number.isSafeInteger(number) && number > 0;
  let next = Math.max(0, ...entries.map(e => valid(e.dataNumber) ? e.dataNumber : 0)) + 1;
  const used = new Set();
  for (const entry of entries) {
    if (!['number', 'custom'].includes(entry.labelMode)) {
      entry.labelMode = !entry.alias?.trim() || entry.alias === entry.name.replace(/\.rat$/i, '') ? 'number' : 'custom';
    }
    if (!valid(entry.dataNumber) || used.has(entry.dataNumber)) entry.dataNumber = next++;
    used.add(entry.dataNumber);
    if (entry.labelMode === 'number') entry.alias = dataNumberLabel(entry);
  }
  return entries;
}

export function setEntryLabel(entry, name) {
  const value = name.trim().slice(0, 100);
  entry.labelMode = value ? 'custom' : 'number';
  entry.alias = value || dataNumberLabel(entry);
}
