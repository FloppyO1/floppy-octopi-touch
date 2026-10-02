/**
 * Safety net for screens that are not 1024×600 (another panel, a mode the display picked by itself): the
 * app keeps its layout and is scaled to fit the window, centred, with bars on the free sides. The
 * `position: fixed` overlays (dialogs, screensaver, toasts) are inside the element, and a transform makes
 * it their containing block, so they scale with it. Pointer hit testing follows the transform.
 */
export const APP_WIDTH = 1024;
export const APP_HEIGHT = 600;

export interface Fit {
  scale: number;
  left: number;
  top: number;
}

/** `null` when the window already is the app's size (within 1 %). */
export function fitFor(width: number, height: number): Fit | null {
  if (!(width > 0 && height > 0)) return null;
  const scale = Math.min(width / APP_WIDTH, height / APP_HEIGHT);
  if (Math.abs(scale - 1) < 0.01) return null;
  return {
    scale: Number(scale.toFixed(4)),
    left: Math.round((width - APP_WIDTH * scale) / 2),
    top: Math.round((height - APP_HEIGHT * scale) / 2),
  };
}

export function fitToWindow(el: HTMLElement): () => void {
  const apply = () => {
    const fit = fitFor(window.innerWidth, window.innerHeight);
    el.dataset.scaled = fit ? String(fit.scale) : '';
    Object.assign(el.style, {
      position: fit ? 'absolute' : '',
      width: fit ? `${APP_WIDTH}px` : '',
      height: fit ? `${APP_HEIGHT}px` : '',
      left: fit ? `${fit.left}px` : '',
      top: fit ? `${fit.top}px` : '',
      transformOrigin: fit ? '0 0' : '',
      transform: fit ? `scale(${fit.scale})` : '',
    });
  };
  apply();
  window.addEventListener('resize', apply);
  return () => window.removeEventListener('resize', apply);
}
