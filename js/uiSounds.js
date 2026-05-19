/** Short UI click — shared by lobby + game (uses SFX volume from MusicPlayer). */

const BUTTON_CLICK_SRC = 'assets/sounds/button-click.mp3';

let getSfxVolume = () => 0.7;
/** @type {HTMLAudioElement | null} */
let clickTemplate = null;
/** @type {Element | null} */
let lastBtn = null;
let lastPlayAt = 0;

const CLICK_SELECTOR = [
  'button',
  '.menu-btn',
  '.game-btn',
  '.overlay-btn',
  '.shop-icon-btn',
  '.music-mute-top',
  '.mute-btn',
  '.pause-btn',
  '.tutorial-btn',
  '.copy-hint',
].join(',');

function warmClickAudio() {
  if (!clickTemplate) {
    clickTemplate = new Audio(BUTTON_CLICK_SRC);
    clickTemplate.preload = 'auto';
  }
  clickTemplate.load();
}

/**
 * @param {() => number} volumeGetter returns 0–1 SFX volume
 */
export function initUiSounds(volumeGetter) {
  if (volumeGetter) getSfxVolume = volumeGetter;
  warmClickAudio();
}

/** Play immediately inside the user-gesture stack (no async decode). */
export function playButtonClick({ gain = 0.55 } = {}) {
  const vol = getSfxVolume();
  if (vol <= 0) return;

  if (!clickTemplate) warmClickAudio();
  if (!clickTemplate) return;

  const clip = clickTemplate.cloneNode();
  clip.volume = Math.min(1, vol * gain);
  void clip.play().catch(() => {});
}

/** Navigate after a short delay so pointerdown/click SFX can finish (call from click handlers). */
export function navigateWithButtonClick(url, { delayMs = 100 } = {}) {
  window.setTimeout(() => {
    window.location.href = url;
  }, delayMs);
}

/** Play click sound for buttons across the page. */
export function bindButtonClickSounds(root = document) {
  const onInteract = (e) => {
    if (!(e.target instanceof Element)) return;
    const btn = e.target.closest(CLICK_SELECTOR);
    if (!btn || btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;

    const now = Date.now();
    if (btn === lastBtn && now - lastPlayAt < 350) return;
    lastBtn = btn;
    lastPlayAt = now;

    playButtonClick();
  };

  root.addEventListener('pointerdown', onInteract, true);
  root.addEventListener('click', onInteract, true);
}
