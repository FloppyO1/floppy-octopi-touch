/** Temperature chart colours: one state token per heater (the accent is kept for the UI itself). */
const HEATER_COLORS: Record<string, string> = {
  tool0: '--heating',
  bed: '--cooling',
  chamber: '--paused',
};

export function heaterColorVar(heater: string): string {
  return HEATER_COLORS[heater] ?? (heater.startsWith('tool') ? '--error' : '--idle');
}
