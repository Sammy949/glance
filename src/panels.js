/* Pointer and keyboard resizing, following Ren's sidebar interaction. */
export function resizePanel({ panel, side, min, max, initial, property, key, onResize }) {
  let width = initial;
  try {
    const saved = Number(localStorage.getItem(key));
    if (Number.isFinite(saved) && saved >= min) width = saved;
  } catch {}
  const handle = document.createElement('div');
  handle.className = `panel-resize ${panel.id}-resize`;
  handle.tabIndex = 0;
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', `Resize ${panel.id}`);
  handle.setAttribute('aria-controls', panel.id);
  handle.setAttribute('aria-valuemin', String(min));
  handle.setAttribute('aria-valuemax', String(max));
  document.body.append(handle);
  const apply = () => {
    width = Math.max(min, Math.min(max, width));
    document.documentElement.style.setProperty(property, `${width}px`);
    handle.setAttribute('aria-valuenow', String(width));
    handle.setAttribute('aria-valuetext', `${width} pixels`);
    onResize?.();
  };
  const remember = () => {
    try { localStorage.setItem(key, String(width)); } catch {}
  };
  const direction = side === 'right' ? 1 : -1;
  let drag;
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    handle.focus();
    drag = { id: event.pointerId, x: event.clientX, width };
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing');
  });
  handle.addEventListener('pointermove', (event) => {
    if (drag?.id !== event.pointerId) return;
    width = drag.width + (event.clientX - drag.x) * direction;
    apply();
  });
  const finish = () => {
    if (!drag) return;
    drag = null;
    document.body.classList.remove('resizing');
    remember();
  };
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.addEventListener(event, finish);
  window.addEventListener('blur', finish);
  handle.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    width = event.key === 'Home' ? min : event.key === 'End' ? max
      : width + (event.key === 'ArrowRight' ? 16 : -16) * direction;
    apply(); remember();
  });
  handle.addEventListener('dblclick', () => { width = initial; apply(); remember(); });
  apply();
  return { get width() { return width; } };
}
