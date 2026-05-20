/** In-game walkthrough — spotlight highlights + step tooltips */

export const GAME_TUTORIAL_STEPS = [
  {
    title: 'Welcome to Field Mice!',
    body: 'The goal is simple: get as close to <strong>21</strong> as you can without going over. Whoever is closest wins the round!',
    placement: 'center',
  },
  {
    title: 'Your score',
    body: 'This is your total right now — shown as <strong>your number / 21</strong>. Going over 21 is a bust!',
    selector: '#player-score',
    placement: 'left',
  },
  {
    title: 'Your cards',
    body: 'These are your face-up cards. One card stays hidden until the round ends. Tap a card to zoom in.',
    selector: '#player-cards',
    placement: 'top',
  },
  {
    title: "Opponent's cards",
    body: 'The enemy has face-up cards too, plus one hidden card (the <strong>?</strong>). You won\'t know their full total until reveal.',
    selector: '#opponent-cards',
    placement: 'bottom',
  },
  {
    title: 'Draw',
    body: 'On your turn, press <strong>Draw</strong> to take another card from the deck. You might also pick up a random trump!',
    selector: '#btn-draw',
    placement: 'left',
  },
  {
    title: 'Keep',
    body: 'Happy with your total? Press <strong>Keep</strong> to lock in your turn. When both players keep, cards are revealed.',
    selector: '#btn-keep',
    placement: 'left',
  },
  {
    title: 'Turn timer',
    body: 'The clock counts down on your turn. If it hits zero, you automatically keep — so don\'t wait too long!',
    selector: '#turn-timer-clock',
    placement: 'bottom',
    fallbackSelector: '#turn-banner',
  },
  {
    title: 'Trump cards',
    body: 'Special power cards live down here. Tap one on your turn to read it, then play it for sneaky effects.',
    selector: '#trump-hand',
    placement: 'top',
  },
  {
    title: 'The shop',
    body: 'From round 2 onward, open the <strong>Shop</strong> once per turn. Spend MC to buy extra trump cards.',
    selector: '#shop-btn',
    placement: 'right',
    skipIfHidden: true,
  },
  {
    title: 'Your Micecoin',
    body: 'MC is your betting currency. Win a round and you collect the bet from your opponent. Lose and you pay up. Run out of MC and the match is over!',
    selector: '.player-profile .profile-avatar',
    placement: 'right',
    rounded: true,
    padding: 8,
  },
  {
    title: 'Enemy trumps',
    body: 'You can\'t see which trumps they hold — only how many. Watch this stack grow when they draw or shop.',
    selector: '#opponent-fan-area',
    placement: 'bottom',
  },
  {
    title: 'The deck',
    body: 'Number cards are drawn from here. The count shows how many cards are left.',
    selector: '#deck-area',
    placement: 'left',
  },
  {
    title: 'Rising stakes',
    body: 'This shows the <strong>round bet</strong> — how much MC the loser pays (and the winner collects). It goes up each round (round 1 = 1 MC, round 2 = 2, and so on).',
    selector: '#round-stakes-wrap',
    placement: 'left',
  },
  {
    title: "You're ready!",
    body: 'Play a practice match and experiment. Open <strong>Menu</strong> anytime to replay this tutorial.',
    selector: '#pause-btn',
    placement: 'bottom',
  },
];

const STORAGE_KEY = 'fieldmice_tutorial_v1_done';

export class Tutorial {
  constructor(steps, options = {}) {
    this.steps = steps;
    this.onComplete = options.onComplete ?? (() => {});
    this.onStart = options.onStart ?? (() => {});
    this.index = 0;
    this.active = false;

    this.overlay = document.getElementById('tutorial-overlay');
    this.spotlight = document.getElementById('tutorial-spotlight');
    this.tooltip = document.getElementById('tutorial-tooltip');
    this.titleEl = document.getElementById('tutorial-title');
    this.bodyEl = document.getElementById('tutorial-body');
    this.stepEl = document.getElementById('tutorial-step');
    this.btnBack = document.getElementById('tutorial-back');
    this.btnNext = document.getElementById('tutorial-next');
    this.btnSkip = document.getElementById('tutorial-skip');

    this._onResize = () => this.positionCurrentStep();
    this.bindUi();
  }

  static isComplete() {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  static markComplete() {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch { /* ignore */ }
  }

  static resetProgress() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  }

  isActive() {
    return this.active;
  }

  bindUi() {
    if (!this.overlay) return;

    this.btnNext?.addEventListener('click', () => this.next());
    this.btnBack?.addEventListener('click', () => this.back());
    this.btnSkip?.addEventListener('click', () => this.finish(true));

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.finish(true);
    });

    document.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.key === 'Escape') this.finish(true);
      if (e.key === 'ArrowRight' || e.key === 'Enter') this.next();
      if (e.key === 'ArrowLeft') this.back();
    });
  }

  start() {
    if (!this.overlay) return;
    this.index = 0;
    this.active = true;
    this.overlay.classList.remove('hidden');
    this.overlay.setAttribute('aria-hidden', 'false');
    document.getElementById('game-container')?.classList.add('tutorial-active');
    window.addEventListener('resize', this._onResize);
    this.onStart();
    this.showStep(0);
  }

  finish(skipped = false) {
    if (!this.active) return;
    this.active = false;
    document.querySelectorAll('.tutorial-highlight-target').forEach((el) => {
      el.classList.remove('tutorial-highlight-target');
    });
    this.overlay?.classList.add('hidden');
    this.overlay?.setAttribute('aria-hidden', 'true');
    document.getElementById('game-container')?.classList.remove('tutorial-active');
    window.removeEventListener('resize', this._onResize);
    if (!skipped) Tutorial.markComplete();
    this.onComplete(skipped);
  }

  next() {
    if (this.index >= this.steps.length - 1) {
      this.finish(false);
      return;
    }
    let i = this.index + 1;
    while (i < this.steps.length && this.shouldSkipStep(this.steps[i])) i++;
    if (i >= this.steps.length) {
      this.finish(false);
      return;
    }
    this.showStep(i);
  }

  back() {
    if (this.index <= 0) return;
    let i = this.index - 1;
    while (i > 0 && this.shouldSkipStep(this.steps[i])) i--;
    this.showStep(i);
  }

  shouldSkipStep(step) {
    if (!step.skipIfHidden || !step.selector) return false;
    const el = document.querySelector(step.selector);
    if (!el) return true;
    return el.classList.contains('hidden') || el.offsetParent === null;
  }

  resolveTarget(step) {
    const trySel = (sel) => {
      if (!sel) return null;
      const el = document.querySelector(sel);
      if (!el || el.classList.contains('hidden') || el.offsetParent === null) return null;
      return el;
    };
    return trySel(step.selector) ?? trySel(step.fallbackSelector);
  }

  showStep(index) {
    this.index = index;
    const step = this.steps[index];
    const total = this.steps.length;

    if (this.titleEl) this.titleEl.textContent = step.title;
    if (this.bodyEl) this.bodyEl.innerHTML = step.body;
    if (this.stepEl) this.stepEl.textContent = `${index + 1} / ${total}`;
    if (this.btnBack) this.btnBack.disabled = index === 0;
    if (this.btnNext) {
      this.btnNext.textContent = index >= total - 1 ? 'Play!' : 'Next';
    }

    requestAnimationFrame(() => {
      this.positionCurrentStep();
      requestAnimationFrame(() => this.positionCurrentStep());
    });
  }

  positionCurrentStep() {
    document.querySelectorAll('.tutorial-highlight-target').forEach((el) => {
      el.classList.remove('tutorial-highlight-target');
    });

    const step = this.steps[this.index];
    const placement = step.placement || 'bottom';
    const target = this.resolveTarget(step);
    const pad = step.padding ?? 10;

    if (!target || placement === 'center') {
      this.spotlight?.classList.add('hidden');
      this.tooltip?.classList.remove('hidden');
      this.tooltip?.classList.add('tutorial-tooltip--center');
      ['top', 'left', 'bottom', 'right'].forEach((p) => {
        this.tooltip?.classList.remove(`tutorial-tooltip--${p}`);
      });
      this.tooltip?.style.removeProperty('top');
      this.tooltip?.style.removeProperty('left');
      return;
    }

    this.spotlight?.classList.remove('hidden');
    this.tooltip?.classList.remove('tutorial-tooltip--center');

    const rect = target.getBoundingClientRect();
    const x = Math.max(8, rect.left - pad);
    const y = Math.max(8, rect.top - pad);
    const w = Math.min(window.innerWidth - 16, rect.width + pad * 2);
    const h = Math.min(window.innerHeight - 16, rect.height + pad * 2);

    if (this.spotlight) {
      this.spotlight.style.left = `${x}px`;
      this.spotlight.style.top = `${y}px`;
      this.spotlight.style.width = `${w}px`;
      this.spotlight.style.height = `${h}px`;
      this.spotlight.style.borderRadius = step.rounded ? '50%' : '12px';
    }

    target.classList.add('tutorial-highlight-target');
    this.placeTooltip(x, y, w, h, placement);
  }

  placeTooltip(sx, sy, sw, sh, placement) {
    if (!this.tooltip) return;

    this.tooltip.classList.remove(
      'tutorial-tooltip--top',
      'tutorial-tooltip--bottom',
      'tutorial-tooltip--left',
      'tutorial-tooltip--right'
    );
    this.tooltip.classList.add(`tutorial-tooltip--${placement}`);

    const margin = 14;
    const tw = this.tooltip.offsetWidth || 300;
    const th = this.tooltip.offsetHeight || 120;
    let left;
    let top;

    switch (placement) {
      case 'top':
        left = sx + sw / 2 - tw / 2;
        top = sy - th - margin;
        break;
      case 'left':
        left = sx - tw - margin;
        top = sy + sh / 2 - th / 2;
        break;
      case 'right':
        left = sx + sw + margin;
        top = sy + sh / 2 - th / 2;
        break;
      case 'bottom':
      default:
        left = sx + sw / 2 - tw / 2;
        top = sy + sh + margin;
        break;
    }

    left = Math.max(12, Math.min(window.innerWidth - tw - 12, left));
    top = Math.max(12, Math.min(window.innerHeight - th - 12, top));

    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
    this.tooltip.style.setProperty('--tutorial-arrow-x', `${sx + sw / 2 - left}px`);
  }
}
