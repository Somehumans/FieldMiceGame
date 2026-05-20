import {
  DEFAULT_GAME_SETTINGS,
  SETTINGS_LIMITS,
  DECK_LIMITS,
  DEFAULT_DECK_CARDS,
  normalizeSettings,
  loadStoredSettings,
  deckCountsFromCards,
  deckCardsFromCounts,
  isDeckValid,
} from './gameSettings.js';
import { loadStoredUsername, normalizeUsername } from './username.js';

/** Lobby settings overlay before Practice / Create Room */
export class SettingsUI {
  constructor(rootEl, options = {}) {
    this.root = rootEl;
    this.onCancel = options.onCancel ?? (() => {});
    this.onConfirm = options.onConfirm ?? (() => {});
    this.pendingMode = 'ai';
    this.draft = { ...DEFAULT_GAME_SETTINGS };
    this.deckCounts = deckCountsFromCards(DEFAULT_DECK_CARDS);

    this.cache();
    this.buildDeckEditor();
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
      deckEditor: document.getElementById('settings-deck-editor'),
      deckTotal: document.getElementById('settings-deck-total'),
      deckHint: document.getElementById('settings-deck-hint'),
      deckReset: document.getElementById('settings-deck-reset'),
      btnCancel: document.getElementById('settings-cancel'),
      btnStart: document.getElementById('settings-start'),
    };
  }

  buildDeckEditor() {
    const root = this.el.deckEditor;
    if (!root) return;

    root.innerHTML = '';
    this.deckRowEls = {};

    for (let v = 1; v <= 11; v++) {
      const row = document.createElement('div');
      row.className = 'settings-deck-row';
      row.dataset.value = String(v);

      const thumb = document.createElement('img');
      thumb.className = 'settings-deck-thumb';
      thumb.src = `assets/cards/card-${v}.png`;
      thumb.alt = `Card ${v}`;
      thumb.draggable = false;

      const label = document.createElement('span');
      label.className = 'settings-deck-label';
      label.textContent = String(v);

      const minus = document.createElement('button');
      minus.type = 'button';
      minus.className = 'settings-deck-btn';
      minus.dataset.action = 'minus';
      minus.setAttribute('aria-label', `Remove card ${v}`);
      minus.textContent = '−';

      const count = document.createElement('span');
      count.className = 'settings-deck-count';
      count.id = `settings-deck-count-${v}`;
      count.textContent = '0';

      const plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'settings-deck-btn';
      plus.dataset.action = 'plus';
      plus.setAttribute('aria-label', `Add card ${v}`);
      plus.textContent = '+';

      row.append(thumb, label, minus, count, plus);
      root.appendChild(row);
      this.deckRowEls[v] = { row, minus, plus, count };
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

    this.el.deckEditor?.addEventListener('click', (e) => {
      const btn = e.target.closest('.settings-deck-btn');
      if (!btn) return;
      const row = btn.closest('.settings-deck-row');
      if (!row) return;
      const v = Number(row.dataset.value);
      const action = btn.dataset.action;
      if (action === 'plus') this.changeDeckCount(v, 1);
      else if (action === 'minus') this.changeDeckCount(v, -1);
    });

    this.el.deckReset?.addEventListener('click', () => {
      this.deckCounts = deckCountsFromCards(DEFAULT_DECK_CARDS);
      this.renderDeckCounts();
      sync();
    });

    this.el.btnCancel?.addEventListener('click', () => {
      this.hide();
      this.onCancel();
    });

    this.el.btnStart?.addEventListener('click', () => {
      this.syncDraftFromForm();
      if (!isDeckValid(this.draft.deckCards)) return;
      this.onConfirm(this.pendingMode, normalizeSettings({ ...this.draft }), this.getUsername());
    });

    this.root?.addEventListener('click', (e) => {
      if (e.target === this.root) {
        this.hide();
        this.onCancel();
      }
    });
  }

  changeDeckCount(value, delta) {
    const total = this.getDeckTotal();
    const next = (this.deckCounts[value] || 0) + delta;
    if (next < 0) return;
    if (next > DECK_LIMITS.maxPerValue) return;
    if (delta > 0 && total >= DECK_LIMITS.maxTotal) return;

    this.deckCounts[value] = next;
    this.renderDeckCounts();
    this.syncDraftFromForm();
  }

  getDeckTotal() {
    return Object.values(this.deckCounts).reduce((s, n) => s + n, 0);
  }

  renderDeckCounts() {
    const total = this.getDeckTotal();
    for (let v = 1; v <= 11; v++) {
      const els = this.deckRowEls?.[v];
      if (!els) continue;
      const n = this.deckCounts[v] || 0;
      els.count.textContent = String(n);
      els.minus.disabled = n <= 0;
      els.plus.disabled = n >= DECK_LIMITS.maxPerValue || total >= DECK_LIMITS.maxTotal;
    }
    if (this.el.deckTotal) {
      this.el.deckTotal.textContent = `${total} card${total === 1 ? '' : 's'}`;
    }
    const valid = total >= DECK_LIMITS.minTotal && total <= DECK_LIMITS.maxTotal;
    if (this.el.deckHint) {
      this.el.deckHint.textContent = valid
        ? `Each value can appear up to ${DECK_LIMITS.maxPerValue} times.`
        : `Need at least ${DECK_LIMITS.minTotal} cards in the deck (${total} selected).`;
      this.el.deckHint.classList.toggle('settings-deck-hint--warn', !valid);
    }
    if (this.el.btnStart) {
      this.el.btnStart.disabled = !valid;
    }
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
    const deckCards = deckCardsFromCounts(this.deckCounts);
    this.draft = { ...base, deckCards };
    this.renderDeckCounts();
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

    this.deckCounts = deckCountsFromCards(s.deckCards);
    this.draft = { ...s };
    this.renderDeckCounts();
  }

  open(mode = 'ai') {
    this.pendingMode = mode;
    const isOnline = mode === 'online';

    if (this.el.title) {
      this.el.title.textContent = isOnline ? 'Create Room' : 'Practice Match';
    }
    if (this.el.subtitle) {
      this.el.subtitle.textContent = isOnline
        ? 'Set the rules and deck, then share your room code with a friend.'
        : 'Tune the rules and deck for your practice game.';
    }
    if (this.el.privateRow) {
      this.el.privateRow.classList.toggle('hidden', !isOnline);
    }
    if (this.el.btnStart) {
      this.el.btnStart.textContent = isOnline ? 'Create Room' : 'Start Game';
      this.el.btnStart.disabled = false;
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
