export function geometryWarning(mapped, operator, message) {
  for (const trip of mapped) {
    trip.geometryWarnings ??= [];
    if (!trip.geometryWarnings.some((w) => w.operator === operator))
      trip.geometryWarnings.push({ operator, message });
  }
  return mapped;
}
