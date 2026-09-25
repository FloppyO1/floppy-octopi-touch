/** Ordered lists of user items with an `id` (presets, macros): pure operations, the order is the display order. */

export interface WithId {
  id: string;
}

/** Moves the item `id` one place up (-1) or down (+1); unchanged at the ends. */
export function moveById<T extends WithId>(list: readonly T[], id: string, direction: -1 | 1): T[] {
  const from = list.findIndex((item) => item.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= list.length) return [...list];
  const out = [...list];
  [out[from], out[to]] = [out[to], out[from]];
  return out;
}

/** Replaces the item with the same id, or appends it. */
export function upsertById<T extends WithId>(list: readonly T[], item: T): T[] {
  const index = list.findIndex((other) => other.id === item.id);
  if (index < 0) return [...list, item];
  const out = [...list];
  out[index] = item;
  return out;
}

export function removeById<T extends WithId>(list: readonly T[], id: string): T[] {
  return list.filter((item) => item.id !== id);
}

/** Another item already uses this name (trimmed, case-insensitive). */
export function nameTaken(list: readonly (WithId & { name: string })[], id: string, name: string): boolean {
  const key = name.trim().toLocaleLowerCase();
  return list.some((item) => item.id !== id && item.name.trim().toLocaleLowerCase() === key);
}
