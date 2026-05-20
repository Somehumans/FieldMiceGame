import {
  DEFAULT_GAME_SETTINGS,
  SETTINGS_LIMITS,
  TRUMP_DECK_LIMITS,
  DEFAULT_TRUMP_DECK,
  normalizeSettings,
  loadStoredSettings,
  trumpCountsFromComposition,
  trumpCompositionFromCounts,
  isTrumpDeckValid,
} from './gameSettings.js';
import { CONFIGURABLE_TRUMP_ORDER, TRUMP_CARD_TYPES } from './trumpCards.js';
import { loadStoredUsername, normalizeUsername } from './username.js';

/** Lobby settings overlay before Practice / Create Room */
export class SettingsUI {
  constructor(rootEl, options = {}) {
    this.root = rootEl;
    this.onCancel = options.onCancel ?? (() => {});
    this.onConfirm = options.onConfirm ?? (() => {});
    this.pendingMode = 'ai';
    this.draft = { ...DEFAULT_GAME_SETTINGS };
    this.trumpCounts = trumpCountsFromComposition(DEFAULT_TRUMP_DECK);
    this.trumpFilter = 'all';

    this.cache();
    this.buildTrumpEditor();
    this.bind();
  }

  cache() {
    this.el = {
      title: document.getElementById('settings-title'),
      subtitle: document.getElementById('settings-subtitle'),
      privateRow: document.getElementById('settings-private-row'),
      privateCheck: document.getElementById('settings-private'),
      trumpRange: document.getElementById('settings-trump-chance'),
      trumpVal: document.getElementById('settings-trump-val'),
      timerRange: document.getElementById('settings-timer'),
      timerVal: document.getElementById('settings-timer-val'),
      livesRange: document.getElementById('settings-lives'),
      livesVal: document.getElementById('settings-lives-val'),
      usernameInput: document.getElementById('settings-username'),
      trumpFilterBar: document.getElementById('settings-trump-filter'),
      trumpEditor: document.getElementById('settings-trump-editor'),
      trumpTotal: document.getElementById('settings-trump-total'),
      trumpHint: document.getElementById('settings-trump-hint'),
      trumpReset: document.getElementById('settings-trump-reset'),
      btnCancel: document.getElementById('settings-cancel'),
      btnStart: document.getElementById('settings-start'),
    };
  }

  buildTrumpEditor() {
    const root = this.el.trumpEditor;
    if (!root) return;

    root.innerHTML = '';
    this.trumpRowEls = {};

    for (const id of CONFIGURABLE_TRUMP_ORDER) {
      const card = TRUMP_CARD_TYPES[id];
      if (!card) continue;

      const row = document.createElement('div');
      row.className = 'settings-trump-row';
      row.dataset.trumpId = id;
      row.dataset.category = card.category;

      const thumb = document.createElement('img');
      thumb.className = 'settings-trump-thumb';
      thumb.src = 'assets/cards/trump-back.png';
      thumb.alt = '';
      thumb.draggable = false;

      const label = document.createElement('span');
      label.className = 'settings-trump-label';
      label.textContent = card.name;

      const minus = document.createElement('button');
      minus.type = 'button';
      minus.className = 'settings-trump-btn';
      minus.dataset.action = 'minus';
      minus.setAttribute('aria-label', `Remove ${card.name}`);
      minus.textContent = '−';

      const count = document.createElement('span');
      count.className = 'settings-trump-count';
      count.textContent = '0';

      const plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'settings-trump-btn';
      plus.dataset.action = 'plus';
      plus.setAttribute('aria-label', `Add ${card.name}`);
      plus.textContent = '+';

      row.append(thumb, label, minus, count, plus);
      root.appendChild(row);
      this.trumpRowEls[id] = { row, minus, plus, count };
    }
  }

  bind() {
    const sync = () => this.syncDraftFromForm();

    this.el.trumpRange?.addEventListener('input', () => {
      if (this.el.trumpVal) this.el.trumpVal.textContent = `${this.el.trumpRange.value}%`;
      sync();
    });
    this.el.timerRange?.addEventListener('input', () => {
      if (this.el.timerVal) this.el.timerVal.textContent = `${this.el.timerRange.value}s`;
      sync();
    });
    this.el.livesRange?.addEventListener('input', () => {
      if (this.el.livesVal) this.el.livesVal.textContent = this.el.livesRange.value;
      sync();
    });
    this.el.privateCheck?.addEventListener('change', sync);
    this.el.usernameInput?.addEventListener('input', sync);

    this.el.trumpFilterBar?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-trump-filter]');
      if (!btn) return;
      this.trumpFilter = btn.dataset.trumpFilter;
      for (const b of this.el.trumpFilterBar.querySelectorAll('[data-trump-filter]')) {
        b.classList.toggle('active', b.dataset.trumpFilter === this.trumpFilter);
        b.setAttribute('aria-pressed', b.dataset.trumpFilter === this.trumpFilter ? 'true' : 'false');
      }
      this.applyTrumpFilter();
    });

    this.el.trumpEditor?.addEventListener('click', (e) => {
      const btn = e.target.closest('.settings-trump-btn');
      if (!btn) return;
      const row = btn.closest('.settings-trump-row');
      if (!row) return;
      const id = row.dataset.trumpId;
      const action = btn.dataset.action;
      if (action === 'plus') this.changeTrumpCount(id, 1);
      else if (action === 'minus') this.changeTrumpCount(id, -1);
    });

    this.el.trumpReset?.addEventListener('click', () => {
      this.trumpCounts = trumpCountsFromComposition(DEFAULT_TRUMP_DECK);
      this.renderTrumpCounts();
      sync();
    });

    this.el.btnCancel?.addEventListener('click', () => {
      this.hide();
      this.onCancel();
    });

    this.el.btnStart?.addEventListener('click', () => {
      this.syncDraftFromForm();
      if (!isTrumpDeckValid(this.draft.trumpDeckComposition)) return;
      this.onConfirm(this.pendingMode, normalizeSettings({ ...this.draft }), this.getUsername());
    });

    this.root?.addEventListener('click', (e) => {
      if (e.target === this.root) {
        this.hide();
        this.onCancel();
      }
    });
  }

  applyTrumpFilter() {
    for (const id of CONFIGURABLE_TRUMP_ORDER) {
      const els = this.trumpRowEls?.[id];
      if (!els) continue;
      const cat = els.row.dataset.category;
      const show =
        this.trumpFilter === 'all' ||
        (this.trumpFilter === 'modifier' && cat === 'modifier') ||
        (this.trumpFilter === 'action' && cat === 'action');
      els.row.classList.toggle('hidden', !show);
    }
  }

  changeTrumpCount(id, delta) {
    const total = this.getTrumpTotal();
    const next = (this.trumpCounts[id] || 0) + delta;
    if (next < 0) return;
    if (next > TRUMP_DECK_LIMITS.maxPerCard) return;
    if (delta > 0 && total >= TRUMP_DECK_LIMITS.maxTotal) return;

    this.trumpCounts[id] = next;
    this.renderTrumpCounts();
    this.syncDraftFromForm();
  }

  getTrumpTotal() {
    return Object.values(this.trumpCounts).reduce((s, n) => s + n, 0);
  }

  renderTrumpCounts() {
    const total = this.getTrumpTotal();
    for (const id of CONFIGURABLE_TRUMP_ORDER) {
      const els = this.trumpRowEls?.[id];
      if (!els) continue;
      const n = this.trumpCounts[id] || 0;
      els.count.textContent = String(n);
      els.minus.disabled = n <= 0;
      els.plus.disabled =
        n >= TRUMP_DECK_LIMITS.maxPerCard || total >= TRUMP_DECK_LIMITS.maxTotal;
    }
    if (this.el.trumpTotal) {
      this.el.trumpTotal.textContent = `${total} trump${total === 1 ? '' : 's'}`;
    }
    const valid =
      total >= TRUMP_DECK_LIMITS.minTotal && total <= TRUMP_DECK_LIMITS.maxTotal;
    if (this.el.trumpHint) {
      this.el.trumpHint.textContent = valid
        ? `Up to ${TRUMP_DECK_LIMITS.maxPerCard} copies per card. Numbered draw pile stays standard.`
        : `Need at least ${TRUMP_DECK_LIMITS.minTotal} trumps in the pile (${total} selected).`;
      this.el.trumpHint.classList.toggle('settings-trump-hint--warn', !valid);
    }
    if (this.el.btnStart) {
      this.el.btnStart.disabled = !valid;
    }
    this.applyTrumpFilter();
  }

  getUsername() {
    return normalizeUsername(this.el.usernameInput?.value ?? '');
  }

  syncDraftFromForm() {
    const base = normalizeSettings({
      private: this.el.privateCheck?.checked ?? false,
      trumpDrawChance: Number(this.el.trumpRange?.value),
      turnTimeLimitSec: Number(this.el.timerRange?.value),
      startingLives: Number(this.el.livesRange?.value),
    });
    const trumpDeckComposition = trumpCompositionFromCounts(this.trumpCounts);
    this.draft = { ...base, trumpDeckComposition };
    this.renderTrumpCounts();
  }

  fillForm(settings) {
    const s = normalizeSettings(settings);
    if (this.el.trumpRange) {
      this.el.trumpRange.min = SETTINGS_LIMITS.trumpDrawChance.min;
      this.el.trumpRange.max = SETTINGS_LIMITS.trumpDrawChance.max;
      this.el.trumpRange.step = SETTINGS_LIMITS.trumpDrawChance.step;
      this.el.trumpRange.value = String(s.trumpDrawChance);
    }
    if (this.el.trumpVal) this.el.trumpVal.textContent = `${s.trumpDrawChance}%`;

    if (this.el.timerRange) {
      this.el.timerRange.min = SETTINGS_LIMITS.turnTimeLimitSec.min;
      this.el.timerRange.max = SETTINGS_LIMITS.turnTimeLimitSec.max;
      this.el.timerRange.step = SETTINGS_LIMITS.turnTimeLimitSec.step;
      this.el.timerRange.value = String(s.turnTimeLimitSec);
    }
    if (this.el.timerVal) this.el.timerVal.textContent = `${s.turnTimeLimitSec}s`;

    if (this.el.livesRange) {
      this.el.livesRange.min = SETTINGS_LIMITS.startingLives.min;
      this.el.livesRange.max = SETTINGS_LIMITS.startingLives.max;
      this.el.livesRange.step = SETTINGS_LIMITS.startingLives.step;
      this.el.livesRange.value = String(s.startingLives);
    }
    if (this.el.livesVal) this.el.livesVal.textContent = String(s.startingLives);

    if (this.el.privateCheck) this.el.privateCheck.checked = s.private;
    if (this.el.usernameInput) this.el.usernameInput.value = loadStoredUsername();

    this.trumpCounts = trumpCountsFromComposition(s.trumpDeckComposition);
    this.draft = { ...s };
    this.renderTrumpCounts();
  }

  open(mode = 'ai') {
    this.pendingMode = mode;
    const isOnline = mode === 'online';

    if (this.el.title) {
      this.el.title.textContent = isOnline ? 'Create Room' : 'Practice Match';
    }
    if (this.el.subtitle) {
      this.el.subtitle.textContent = isOnline
        ? 'Set the rules and trump pile, then share your room code with a friend.'
        : 'Tune the rules and which trumps can appear in your practice game.';
    }
    if (this.el.privateRow) {
      this.el.privateRow.classList.toggle('hidden', !isOnline);
    }
    if (this.el.btnStart) {
      this.el.btnStart.textContent = isOnline ? 'Create Room' : 'Start Game';
      this.el.btnStart.disabled = false;
    }

    const activeFilter = this.el.trumpFilterBar?.querySelector('[data-trump-filter].active');
    if (!activeFilter && this.el.trumpFilterBar) {
      const allBtn = this.el.trumpFilterBar.querySelector('[data-trump-filter="all"]');
      allBtn?.classList.add('active');
      allBtn?.setAttribute('aria-pressed', 'true');
    }

    this.fillForm(loadStoredSettings());
    this.root?.classList.remove('hidden');
    this.root?.setAttribute('aria-hidden', 'false');
  }

  hide() {
    this.root?.classList.add('hidden');
    this.root?.setAttribute('aria-hidden', 'true');
  }
}
