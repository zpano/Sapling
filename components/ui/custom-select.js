/**
 * Sapling Custom Select
 * Turns native <select> into a themed custom dropdown while keeping the original element for state.
 */

export function initCustomSelects(selectElements, { onOpen } = {}) {
  const instances = new Map();
  let openInstance = null;
  let globalListenersBound = false;

  function sync(selectEl) {
    const instance = instances.get(selectEl);
    if (!instance) return;

    const { wrapper, trigger, menu, optionButtons } = instance;
    const selected = selectEl.options[selectEl.selectedIndex];
    trigger.textContent = selected ? selected.textContent : '请选择';
    trigger.disabled = Boolean(selectEl.disabled);

    optionButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === selectEl.value);
    });

    if (wrapper.classList.contains('open') && menu.hidden) {
      wrapper.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    }
  }

  function close(instance, { focusTrigger = false } = {}) {
    if (!instance) return;
    instance.menu.hidden = true;
    instance.wrapper.classList.remove('open');
    instance.trigger.setAttribute('aria-expanded', 'false');
    if (focusTrigger) instance.trigger.focus();
    if (openInstance === instance) openInstance = null;
  }

  function closeOpen() {
    if (!openInstance) return;
    close(openInstance);
  }

  function open(instance) {
    if (!instance || instance.trigger.disabled) return;
    if (typeof onOpen === 'function') onOpen();

    if (openInstance && openInstance !== instance) close(openInstance);
    openInstance = instance;
    instance.menu.hidden = false;
    instance.wrapper.classList.add('open');
    instance.trigger.setAttribute('aria-expanded', 'true');
  }

  function toggle(instance) {
    if (!instance) return;
    if (instance.wrapper.classList.contains('open')) close(instance, { focusTrigger: true });
    else open(instance);
  }

  function initSelect(selectEl) {
    if (!selectEl || instances.has(selectEl)) return;
    const parent = selectEl.parentElement;
    if (!parent) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'sapling-select';

    selectEl.classList.add('sapling-select-native');
    selectEl.tabIndex = -1;

    parent.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'sapling-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    wrapper.appendChild(trigger);

    const menu = document.createElement('div');
    menu.className = 'sapling-select-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'listbox');
    wrapper.appendChild(menu);

    const optionButtons = [];
    Array.from(selectEl.options).forEach((option) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sapling-select-option';
      btn.textContent = option.textContent;
      btn.dataset.value = option.value;
      btn.addEventListener('click', () => {
        selectEl.value = option.value;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        sync(selectEl);
        close(instances.get(selectEl), { focusTrigger: true });
      });
      optionButtons.push(btn);
      menu.appendChild(btn);
    });

    const instance = { wrapper, trigger, menu, optionButtons, selectEl };
    instances.set(selectEl, instance);

    trigger.addEventListener('click', () => toggle(instances.get(selectEl)));

    const label = selectEl.id ? document.querySelector(`label[for="${selectEl.id}"]`) : null;
    if (label) {
      label.addEventListener('click', (event) => {
        event.preventDefault();
        const inst = instances.get(selectEl);
        if (!inst) return;
        inst.trigger.focus();
        open(inst);
      });
    }

    selectEl.addEventListener('change', () => sync(selectEl));
    sync(selectEl);
  }

  function bindGlobalListenersOnce() {
    if (globalListenersBound) return;
    globalListenersBound = true;

    document.addEventListener('mousedown', (event) => {
      if (!openInstance) return;
      const target = event.target;
      if (target instanceof Node && openInstance.wrapper.contains(target)) return;
      close(openInstance);
    });

    document.addEventListener('keydown', (event) => {
      if (!openInstance) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close(openInstance, { focusTrigger: true });
      }
    }, true);
  }

  (Array.isArray(selectElements) ? selectElements : [selectElements])
    .filter(Boolean)
    .forEach(initSelect);

  bindGlobalListenersOnce();

  return {
    initSelect,
    sync,
    syncAll: () => Array.from(instances.keys()).forEach(sync),
    closeOpen,
    closeAll: () => closeOpen(),
    getInstances: () => instances
  };
}

