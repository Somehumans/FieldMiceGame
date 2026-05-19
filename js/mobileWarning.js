/** Warn on small screens that the game is designed for desktop play. */

const STORAGE_KEY = 'fieldmice_pc_warning_dismissed_v1';
const MOBILE_MQ = '(max-width: 900px)';

function isDismissed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch { /* ignore */ }
}

function ensureOverlay() {
  let overlay = document.getElementById('mobile-pc-warning');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'mobile-pc-warning';
  overlay.className = 'mobile-pc-warning hidden';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'mobile-pc-warning-title');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="mobile-pc-warning__panel">
      <p class="mobile-pc-warning__badge" aria-hidden="true">🖥️</p>
      <h2 id="mobile-pc-warning-title" class="mobile-pc-warning__title">Best on PC</h2>
      <p class="mobile-pc-warning__body">
        <strong>Field Mice - 21</strong> is designed for desktop play. On phones and tablets the layout is tighter and some controls are harder to use.
      </p>
      <p class="mobile-pc-warning__hint">For the best experience, play on a computer with a mouse or trackpad.</p>
      <button type="button" id="mobile-pc-warning-dismiss" class="menu-btn mobile-pc-warning__btn">
        Continue anyway
      </button>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#mobile-pc-warning-dismiss')?.addEventListener('click', () => {
    dismiss();
    syncVisibility(overlay);
  });

  return overlay;
}

function syncVisibility(overlay) {
  const mq = window.matchMedia(MOBILE_MQ);
  const show = mq.matches && !isDismissed();
  overlay.classList.toggle('hidden', !show);
  overlay.setAttribute('aria-hidden', show ? 'false' : 'true');
}

/** Show PC-use warning on narrow viewports until dismissed. */
export function initMobileWarning() {
  const overlay = ensureOverlay();
  const mq = window.matchMedia(MOBILE_MQ);

  syncVisibility(overlay);
  mq.addEventListener('change', () => syncVisibility(overlay));
}
