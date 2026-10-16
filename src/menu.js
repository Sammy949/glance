/* Context menu keyboard and placement model adapted from Ren (MIT). */
export function createMenu(onError) {
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Actions');
  menu.hidden = true;
  document.body.append(menu);
  let previousFocus;
  const close = (restore = false) => {
    if (menu.hidden) return;
    menu.hidden = true;
    if (restore && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };
  const open = (items, x, y, target) => {
    close();
    previousFocus = target?.closest('button, a, [tabindex]') || document.activeElement;
    menu.replaceChildren();
    for (const item of items) {
      if (!item) {
        const separator = document.createElement('div');
        separator.setAttribute('role', 'separator');
        menu.append(separator);
        continue;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label;
      button.setAttribute('role', 'menuitem');
      button.tabIndex = -1;
      button.disabled = !!item.disabled;
      button.onclick = async () => {
        close(true);
        try { await item.run(); } catch (error) { onError?.(error); }
      };
      menu.append(button);
    }
    const hint = document.createElement('p');
    hint.className = 'context-hint';
    hint.textContent = 'Shift + right-click for the browser menu';
    menu.append(hint);
    menu.hidden = false;
    menu.style.left = '8px';
    menu.style.top = '8px';
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, innerHeight - rect.height - 8))}px`;
    menu.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  };
  function bind(element, getItems) {
    const show = (event, keyboard) => {
      if (event.shiftKey && !keyboard) { close(); return; }
      const selection = getSelection();
      const caret = keyboard && selection?.rangeCount && element.contains(selection.anchorNode)
        ? selection.getRangeAt(0).getBoundingClientRect() : null;
      const target = keyboard && selection?.rangeCount && element.contains(selection.anchorNode)
        ? selection.anchorNode.parentElement : event.target;
      const items = getItems(target);
      if (!items?.length) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = caret?.height ? caret : event.target.getBoundingClientRect();
      open(items, keyboard ? rect.left : event.clientX, keyboard ? rect.bottom : event.clientY, event.target);
    };
    element.addEventListener('contextmenu', (event) => show(event, false));
    element.addEventListener('keydown', (event) => {
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) show(event, true);
    });
  }
  menu.addEventListener('mousedown', (event) => event.preventDefault());
  menu.addEventListener('keydown', (event) => {
    event.stopPropagation();
    const buttons = [...menu.querySelectorAll('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault(); close(true);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); document.activeElement.click();
    }
  });
  document.addEventListener('pointerdown', (event) => { if (!menu.contains(event.target)) close(); }, true);
  document.addEventListener('scroll', (event) => { if (!menu.contains(event.target)) close(); }, true);
  window.addEventListener('resize', () => close());
  window.addEventListener('blur', () => close());
  return { bind, close };
}
