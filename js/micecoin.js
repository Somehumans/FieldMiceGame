/** Micecoin — fixed viewport, swap frame images in place (no sprite sheet). */

export const MC_FRAME_COUNT = 4;
export const MC_FRAME_MS = 120;
export const MC_FRAME_PATH = (i) => `assets/micecoin/frame-${i}.png`;

for (let i = 0; i < MC_FRAME_COUNT; i++) {
  const preload = new Image();
  preload.src = MC_FRAME_PATH(i);
}

const spinners = new Set();
let timerId = null;
let frameIndex = 0;

function tick() {
  frameIndex = (frameIndex + 1) % MC_FRAME_COUNT;
  const src = MC_FRAME_PATH(frameIndex);
  for (const img of spinners) {
    if (!img.isConnected) {
      spinners.delete(img);
      continue;
    }
    img.src = src;
  }
  if (spinners.size === 0) {
    clearInterval(timerId);
    timerId = null;
  }
}

function registerSpin(img) {
  if (!img || spinners.has(img)) return;
  spinners.add(img);
  img.src = MC_FRAME_PATH(frameIndex);
  if (!timerId) {
    timerId = setInterval(tick, MC_FRAME_MS);
  }
}

/** Wire up spin animation for coins inserted via innerHTML. */
export function syncMcCoinAnimations(root = document) {
  for (const wrap of root.querySelectorAll('.mc-coin--spin')) {
    registerSpin(wrap.querySelector('.mc-coin-img'));
  }
}

export function mcCoinHtml(className = '', spin = false) {
  const spinCls = spin ? ' mc-coin--spin' : '';
  return `<span class="mc-coin-wrap ${className}${spinCls}" role="img" aria-hidden="true"><img class="mc-coin-img" src="${MC_FRAME_PATH(0)}" alt="" draggable="false"></span>`;
}
