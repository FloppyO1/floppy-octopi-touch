/** Cheap structural equality for small JSON payloads (avoids needless reactive updates). */
export function sameJson(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
