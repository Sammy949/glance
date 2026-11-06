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

/* The editor | preview split. Same interaction as the panels, but the value is
 * a share of the container (percent), so it holds as the window resizes. The
 * handle is absolutely positioned so it never takes a grid cell. */
export function resizeSplit({ container, before, min, max, initial, property, key, label }) {
  let share = initial;
  try {
    const saved = Number(localStorage.getItem(key));
    if (Number.isFinite(saved) && saved >= min && saved <= max) share = saved;
  } catch {}
  const handle = document.createElement('div');
  handle.className = 'split-resize';
  handle.tabIndex = 0;
  handle.title = 'Drag to resize, double-click to reset';
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', label);
  handle.setAttribute('aria-controls', before.id);
  handle.setAttribute('aria-valuemin', String(min));
  handle.setAttribute('aria-valuemax', String(max));
  before.after(handle);
  const apply = () => {
    share = Math.round(Math.max(min, Math.min(max, share)) * 10) / 10;
    container.style.setProperty(property, `${share}%`);
    handle.setAttribute('aria-valuenow', String(Math.round(share)));
    handle.setAttribute('aria-valuetext', `${Math.round(share)} percent`);
  };
  const remember = () => {
    try { localStorage.setItem(key, String(share)); } catch {}
  };
  let drag;
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    handle.focus();
    drag = { id: event.pointerId, rect: container.getBoundingClientRect() };
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing');
  });
  handle.addEventListener('pointermove', (event) => {
    if (drag?.id !== event.pointerId || !drag.rect.width) return;
    share = ((event.clientX - drag.rect.left) / drag.rect.width) * 100;
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
    share = event.key === 'Home' ? min : event.key === 'End' ? max
      : share + (event.key === 'ArrowRight' ? 2 : -2);
    apply(); remember();
  });
  handle.addEventListener('dblclick', () => { share = initial; apply(); remember(); });
  apply();
}
