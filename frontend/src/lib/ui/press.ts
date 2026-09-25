/**
 * Attachment for immediate touch feedback: sets `data-pressed` from pointerdown until the pointer
 * is released or leaves (Chromium delays `:active` on touch screens).
 *
 *   <button {@attach pressable}>…</button>
 */
export function pressable(node: HTMLElement): () => void {
  const on = (event: PointerEvent) => {
    if (event.button === 0 && !(node as HTMLButtonElement).disabled) node.dataset.pressed = '';
  };
  const off = () => delete node.dataset.pressed;
  node.addEventListener('pointerdown', on);
  node.addEventListener('pointerup', off);
  node.addEventListener('pointercancel', off);
  node.addEventListener('pointerleave', off);
  return () => {
    node.removeEventListener('pointerdown', on);
    node.removeEventListener('pointerup', off);
    node.removeEventListener('pointercancel', off);
    node.removeEventListener('pointerleave', off);
  };
}
