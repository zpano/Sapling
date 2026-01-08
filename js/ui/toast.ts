/**
 * Sapling Toast 通知组件
 * 提取自 content.js
 */

/**
 * 显示 Toast 通知
 * @param {string} message - 通知消息
 * @param {object} options - 选项 { type: 'normal' | 'error', duration: number }
 */
export function showToast(message, options = {}) {
  const { type = 'normal', duration = 2000 } = options;
  
  const toast = document.createElement('div');
  toast.className = 'Sapling-toast';
  
  // 如果是错误消息（包含 ❌ 符号），自动设置为错误类型
  if (type === 'error' || message.includes('❌')) {
    toast.setAttribute('data-type', 'error');
  }
  
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('Sapling-toast-show'), 10);
  setTimeout(() => {
    toast.classList.remove('Sapling-toast-show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
