/**
 * Sapling UI Modal (prompt/confirm replacement)
 */

let modalController = null;

function createModalDom() {
  const overlay = document.createElement('div');
  overlay.className = 'sapling-modal-overlay';
  overlay.id = 'saplingModalOverlay';
  overlay.hidden = true;

  overlay.innerHTML = `
    <div class="sapling-modal" role="dialog" aria-modal="true" aria-labelledby="saplingModalTitle">
      <div class="sapling-modal-header">
        <h3 class="sapling-modal-title" id="saplingModalTitle"></h3>
      </div>
      <div class="sapling-modal-body">
        <p class="sapling-modal-message" id="saplingModalMessage"></p>
        <div class="sapling-modal-input" id="saplingModalInputWrap" hidden>
          <input type="text" id="saplingModalInput" autocomplete="off">
        </div>
      </div>
      <div class="sapling-modal-actions">
        <button type="button" class="btn btn-secondary" id="saplingModalCancelBtn">取消</button>
        <button type="button" class="btn btn-primary" id="saplingModalConfirmBtn">确定</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  return overlay;
}

function ensureModalElements() {
  let overlay = document.getElementById('saplingModalOverlay');
  if (!overlay) overlay = createModalDom();

  const title = overlay.querySelector('#saplingModalTitle');
  const message = overlay.querySelector('#saplingModalMessage');
  const inputWrap = overlay.querySelector('#saplingModalInputWrap');
  const input = overlay.querySelector('#saplingModalInput');
  const cancelBtn = overlay.querySelector('#saplingModalCancelBtn');
  const confirmBtn = overlay.querySelector('#saplingModalConfirmBtn');

  return { overlay, title, message, inputWrap, input, cancelBtn, confirmBtn };
}

export function getModalController() {
  if (modalController) return modalController;

  let closeFn = null;
  let lastBodyOverflow = '';

  const close = () => {
    if (typeof closeFn === 'function') closeFn();
  };

  const show = ({
    title = '提示',
    message = '',
    mode = 'confirm', // confirm | prompt | alert
    defaultValue = '',
    placeholder = '',
    confirmText = '确定',
    cancelText = '取消',
    danger = false
  } = {}) => {
    return new Promise((resolve) => {
      const { overlay, title: titleEl, message: messageEl, inputWrap, input, cancelBtn, confirmBtn } = ensureModalElements();
      close();

      const previousConfirmClasses = Array.from(confirmBtn.classList);
      const previousCancelText = cancelBtn.textContent;
      const previousConfirmText = confirmBtn.textContent;

      titleEl.textContent = title;
      messageEl.textContent = message;
      cancelBtn.textContent = cancelText;
      confirmBtn.textContent = confirmText;

      confirmBtn.classList.remove('btn-primary', 'btn-danger', 'btn-secondary');
      confirmBtn.classList.add(danger ? 'btn-danger' : 'btn-primary');

      const isPrompt = mode === 'prompt';
      const isAlert = mode === 'alert';
      inputWrap.hidden = !isPrompt;
      cancelBtn.hidden = isAlert;

      if (isPrompt) {
        input.value = defaultValue;
        input.placeholder = placeholder;
      } else {
        input.value = '';
        input.placeholder = '';
      }

      const finish = (result) => {
        overlay.hidden = true;
        document.removeEventListener('keydown', onKeydown, true);
        overlay.removeEventListener('mousedown', onOverlayMouseDown);
        cancelBtn.removeEventListener('click', onCancel);
        confirmBtn.removeEventListener('click', onConfirm);
        input.removeEventListener('keydown', onInputKeydown);
        confirmBtn.className = previousConfirmClasses.join(' ');
        cancelBtn.textContent = previousCancelText;
        confirmBtn.textContent = previousConfirmText;
        cancelBtn.hidden = false;
        document.body.style.overflow = lastBodyOverflow;
        closeFn = null;
        resolve(result);
      };

      const onCancel = () => finish(isPrompt ? null : false);
      const onConfirm = () => finish(isPrompt ? input.value : true);
      const onOverlayMouseDown = (event) => {
        if (event.target === overlay) onCancel();
      };
      const onKeydown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      };
      const onInputKeydown = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onConfirm();
        }
      };

      closeFn = () => finish(isPrompt ? null : false);

      overlay.hidden = false;
      lastBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      overlay.addEventListener('mousedown', onOverlayMouseDown);
      document.addEventListener('keydown', onKeydown, true);
      if (!isAlert) cancelBtn.addEventListener('click', onCancel);
      confirmBtn.addEventListener('click', onConfirm);
      input.addEventListener('keydown', onInputKeydown);

      requestAnimationFrame(() => {
        if (isPrompt) {
          input.focus();
          input.select();
        } else {
          confirmBtn.focus();
        }
      });
    });
  };

  const confirm = async (message, { title = '确认', confirmText = '确定', cancelText = '取消', danger = false } = {}) => {
    return Boolean(await show({ title, message, mode: 'confirm', confirmText, cancelText, danger }));
  };

  const prompt = async (message, {
    title = '请输入',
    defaultValue = '',
    placeholder = '',
    confirmText = '确定',
    cancelText = '取消'
  } = {}) => {
    const result = await show({ title, message, mode: 'prompt', defaultValue, placeholder, confirmText, cancelText });
    if (result === null) return null;
    return String(result);
  };

  const alert = async (message, { title = '提示', confirmText = '确定' } = {}) => {
    await show({ title, message, mode: 'alert', confirmText, cancelText: '取消' });
  };

  modalController = { show, confirm, prompt, alert, close };
  return modalController;
}

