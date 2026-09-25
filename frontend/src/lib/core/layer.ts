/**
 * Current/total layer from the DisplayLayerProgress plugin (only source: the dashboard never guesses
 * layers). Two shapes carry them, both with numbers as strings and "-" when unknown:
 *
 *   socket plugin message "DisplayLayerProgress-websocket-payload": { currentLayer, totalLayer, … }
 *   GET /plugin/DisplayLayerProgress/values:                         { layer: { current, total }, … }
 */

export const DLP_SOCKET_PLUGIN = 'DisplayLayerProgress-websocket-payload';
export const DLP_VALUES_URL = '/plugin/DisplayLayerProgress/values';

export interface LayerInfo {
  current: number;
  total: number;
}

function toInt(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^\s*\d+\s*$/.test(value)) return null;
  return Number(value);
}

export function parseLayerInfo(data: unknown): LayerInfo | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  const nested = record.layer as Record<string, unknown> | undefined;
  const current = toInt(nested ? nested.current : record.currentLayer);
  const total = toInt(nested ? nested.total : record.totalLayer);
  if (current === null || total === null || total <= 0) return null;
  return { current: Math.min(current, total), total };
}
