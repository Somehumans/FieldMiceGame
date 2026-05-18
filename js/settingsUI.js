import {
  DEFAULT_GAME_SETTINGS,
  SETTINGS_LIMITS,
  normalizeSettings,
  loadStoredSettings,
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

    this.cache();
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
      btnCancel: document.getElementById('settings-cancel'),
      btnStart: document.getElementById('settings-start'),
    };
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

    this.el.btnCancel?.addEventListener('click', () => {
      this.hide();
      this.onCancel();
    });

    this.el.btnStart?.addEventListener('click', () => {
      this.syncDraftFromForm();
      this.onConfirm(this.pendingMode, { ...this.draft }, this.getUsername());
    });

    this.root?.addEventListener('click', (e) => {
      if (e.target === this.root) {
        this.hide();
        this.onCancel();
      }
    });
  }

  getUsername() {
    return normalizeUsername(this.el.usernameInput?.value ?? '');
  }

  syncDraftFromForm() {
    this.draft = normalizeSettings({
      private: this.el.privateCheck?.checked ?? false,
      trumpDrawChance: Number(this.el.trumpRange?.value),
      turnTimeLimitSec: Number(this.el.timerRange?.value),
      startingLives: Number(this.el.livesRange?.value),
    });
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
    this.draft = { ...s };
  }

  open(mode = 'ai') {
    this.pendingMode = mode;
    const isOnline = mode === 'online';

    if (this.el.title) {
      this.el.title.textContent = isOnline ? 'Create Room' : 'Practice Match';
    }
    if (this.el.subtitle) {
      this.el.subtitle.textContent = isOnline
        ? 'Set the rules, then share your room code with a friend.'
        : 'Tune the rules for your practice game.';
    }
    if (this.el.privateRow) {
      this.el.privateRow.classList.toggle('hidden', !isOnline);
    }
    if (this.el.btnStart) {
      this.el.btnStart.textContent = isOnline ? 'Create Room' : 'Start Game';
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
