/**
 * Kiosk hardening on the web side (enabled with `?kiosk=1`, the Pi launcher adds it): no context
 * menu from long presses, no pinch/double-tap/ctrl+wheel zoom, no drag of images, no text
 * selection, hidden cursor. Chromium flags cover the rest (see deploy/kiosk).
 */
export function kioskRequested(search = location.search): boolean {
  const value = new URLSearchParams(search).get('kiosk');
  return value !== null && value !== '0' && value !== 'false';
}

export function enableKiosk(): () => void {
  const root = document.documentElement;
  root.classList.add('kiosk');

  const prevent = (event: Event) => event.preventDefault();
  const preventMultiTouch = (event: TouchEvent) => {
    if (event.touches.length > 1) event.preventDefault();
  };
  const preventZoomWheel = (event: WheelEvent) => {
    if (event.ctrlKey) event.preventDefault();
  };
  const preventZoomKeys = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && ['+', '-', '=', '0'].includes(event.key)) {
      event.preventDefault();
    }
  };

  const options = { passive: false, capture: true } as const;
  window.addEventListener('contextmenu', prevent, options);
  window.addEventListener('dragstart', prevent, options);
  window.addEventListener('selectstart', prevent, options);
  window.addEventListener('gesturestart', prevent, options);
  window.addEventListener('touchmove', preventMultiTouch, options);
  window.addEventListener('wheel', preventZoomWheel, options);
  window.addEventListener('keydown', preventZoomKeys, options);

  return () => {
    root.classList.remove('kiosk');
    window.removeEventListener('contextmenu', prevent, options);
    window.removeEventListener('dragstart', prevent, options);
    window.removeEventListener('selectstart', prevent, options);
    window.removeEventListener('gesturestart', prevent, options);
    window.removeEventListener('touchmove', preventMultiTouch, options);
    window.removeEventListener('wheel', preventZoomWheel, options);
    window.removeEventListener('keydown', preventZoomKeys, options);
  };
}
