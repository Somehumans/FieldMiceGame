import { MusicPlayer } from './music.js';
import { Multiplayer } from './multiplayer.js';
import { saveStoredSettings } from './gameSettings.js';
import { SettingsUI } from './settingsUI.js';
import { loadStoredUsername, saveStoredUsername } from './username.js';
import { saveOnlineSession, clearOnlineSession } from './onlineSession.js';
import { initUiSounds, bindButtonClickSounds, navigateWithButtonClick } from './uiSounds.js';

class Lobby {
  constructor() {
    this.mp = new Multiplayer();
    this.isOnlineAvailable = false;
    this.settingsUI = null;
  }

  async init() {
    this.cacheElements();
    this.settingsUI = new SettingsUI(this.el.settingsOverlay, {
      onCancel: () => {},
      onConfirm: (mode, settings, username) => this.onSettingsConfirm(mode, settings, username),
    });
    this.bindEvents();

    const initResult = await this.mp.init();
    this.isOnlineAvailable = initResult?.ok === true;

    if (this.isOnlineAvailable) {
      this.setOnlineStatus('Online ready — you can create or join a room.', 'ok');
    } else {
      const hint = this.getOnlineUnavailableHint(initResult);
      this.setOnlineStatus(hint, 'err');
      this.el.btnCreate.style.opacity = '0.4';
      this.el.btnCreate.style.pointerEvents = 'none';
      this.el.btnCreate.title = hint;
      this.el.btnShowJoin.style.opacity = '0.4';
      this.el.btnShowJoin.style.pointerEvents = 'none';
      this.el.btnShowJoin.title = hint;
      console.warn('Online play unavailable:', hint, initResult);
    }
  }

  setOnlineStatus(message, kind = '') {
    const el = this.el.onlineStatus;
    if (!el) return;
    el.textContent = message;
    el.classList.remove('online-status--ok', 'online-status--err');
    if (kind) el.classList.add(`online-status--${kind}`);
  }

  getOnlineUnavailableHint(initResult) {
    if (initResult?.error === 'auth') {
      return 'Enable Anonymous sign-in: Supabase → Authentication → Providers';
    }
    if (initResult?.error === 'library') {
      return 'Supabase library failed to load — check your internet / ad blocker';
    }
    return 'Check js/config.js — use http://localhost, not file://';
  }

  cacheElements() {
    this.el = {
      menuMain: document.getElementById('menu-main'),
      joinSection: document.getElementById('join-section'),
      waitingSection: document.getElementById('waiting-section'),
      settingsOverlay: document.getElementById('settings-overlay'),
      btnPlayAI: document.getElementById('btn-play-ai'),
      btnHowToPlay: document.getElementById('btn-how-to-play'),
      btnCreate: document.getElementById('btn-create-room'),
      btnShowJoin: document.getElementById('btn-show-join'),
      joinUsernameInput: document.getElementById('join-username-input'),
      roomCodeInput: document.getElementById('room-code-input'),
      btnJoinRoom: document.getElementById('btn-join-room'),
      btnJoinCancel: document.getElementById('btn-join-cancel'),
      joinError: document.getElementById('join-error'),
      roomCodeDisplay: document.getElementById('room-code-display'),
      copyHint: document.getElementById('copy-hint'),
      waitingHostName: document.getElementById('waiting-host-name'),
      btnEnterMatch: document.getElementById('btn-enter-match'),
      btnCancelRoom: document.getElementById('btn-cancel-room'),
      onlineStatus: document.getElementById('online-status'),
    };
  }

  bindEvents() {
    this.el.btnPlayAI.addEventListener('click', () => {
      this.settingsUI.open('ai');
    });

    this.el.btnHowToPlay?.addEventListener('click', () => {
      clearOnlineSession();
      window.location.href = 'game.html?mode=ai&tutorial=1';
    });

    this.el.btnCreate.addEventListener('click', () => {
      if (!this.isOnlineAvailable) return;
      this.settingsUI.open('online');
    });

    this.el.btnShowJoin.addEventListener('click', () => this.showJoinUI());
    this.el.btnJoinRoom.addEventListener('click', () => this.joinRoom());
    this.el.btnJoinCancel.addEventListener('click', () => this.hideJoinUI());
    this.el.btnCancelRoom.addEventListener('click', () => this.cancelRoom());
    this.el.btnEnterMatch?.addEventListener('click', () => this.enterMatchAsHost());

    this.el.roomCodeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.joinRoom();
    });

    this.el.copyHint.addEventListener('click', () => {
      navigator.clipboard.writeText(this.mp.roomCode).then(() => {
        this.el.copyHint.textContent = 'Copied!';
        setTimeout(() => { this.el.copyHint.textContent = 'Click to copy'; }, 1500);
      });
    });
  }

  onSettingsConfirm(mode, settings, username) {
    const name = saveStoredUsername(username);
    saveStoredSettings(settings);
    this.settingsUI.hide();

    if (mode === 'ai') {
      clearOnlineSession();
      navigateWithButtonClick('game.html?mode=ai');
      return;
    }

    this.createRoomWithSettings(settings, name);
  }

  showJoinUI() {
    this.el.menuMain.style.display = 'none';
    this.el.joinSection.classList.add('visible');
    this.el.joinError.textContent = '';
    this.el.roomCodeInput.value = '';
    if (this.el.joinUsernameInput) {
      this.el.joinUsernameInput.value = loadStoredUsername();
    }
    this.el.joinUsernameInput?.focus();
  }

  hideJoinUI() {
    this.el.joinSection.classList.remove('visible');
    this.el.menuMain.style.display = 'flex';
  }

  async createRoomWithSettings(settings, username) {
    if (!this.isOnlineAvailable) return;
    this.el.btnCreate.textContent = 'Creating...';
    this.el.btnCreate.disabled = true;

    const code = await this.mp.createRoom(settings, username);
    if (!code) {
      this.el.btnCreate.textContent = 'Create Room';
      this.el.btnCreate.disabled = false;
      return;
    }

    this.el.menuMain.style.display = 'none';
    this.el.roomCodeDisplay.textContent = code;
    this.el.waitingSection.classList.add('visible');

    const privateHint = settings.private ? ' · Private' : '';
    const waitingText = this.el.waitingSection.querySelector('.waiting-text');
    if (waitingText) {
      waitingText.textContent = `Waiting for opponent…${privateHint}`;
    }
    if (this.el.waitingHostName) {
      this.el.waitingHostName.textContent = `Hosting as ${this.mp.hostUsername}`;
    }

    const goToHostGame = (guestUsername) => {
      if (this._hostLaunching) return;
      this._hostLaunching = true;
      if (guestUsername) this.mp.guestUsername = guestUsername;
      this.mp.stopWatchingRoom();
      if (this._hostPollInterval) clearInterval(this._hostPollInterval);
      saveOnlineSession({ room: code, role: 'host' });
      window.location.href = `game.html?mode=online&role=host&room=${code}`;
    };

    this.mp.onEvent = (payload) => {
      if (payload?.type === 'player_joined') {
        goToHostGame(payload.username);
      }
    };

    this.mp.watchRoomForGuest(code, (row) => {
      goToHostGame(row.guest_username);
    });

    this._waitingRoomCode = code;

    const checkForGuest = async () => {
      const row = await this.mp.fetchRoom(code);
      if (row?.guest_id) {
        if (this.el.btnEnterMatch) this.el.btnEnterMatch.disabled = false;
        const waitingText = this.el.waitingSection.querySelector('.waiting-text');
        if (waitingText) waitingText.textContent = 'Opponent joined! Starting match…';
        goToHostGame(row.guest_username);
        return true;
      }
      return false;
    };

    void checkForGuest();
    this._hostPollInterval = setInterval(() => void checkForGuest(), 400);
  }

  async enterMatchAsHost() {
    const code = this._waitingRoomCode || this.mp.roomCode;
    if (!code) return;
    const row = await this.mp.fetchRoom(code);
    if (!row?.guest_id) {
      const waitingText = this.el.waitingSection.querySelector('.waiting-text');
      if (waitingText) waitingText.textContent = 'No opponent in the room yet.';
      return;
    }
    saveOnlineSession({ room: code, role: 'host' });
    window.location.href = `game.html?mode=online&role=host&room=${code}`;
  }

  async joinRoom() {
    if (!this.isOnlineAvailable) return;
    const code = this.el.roomCodeInput.value.trim();
    const username = saveStoredUsername(this.el.joinUsernameInput?.value ?? '');

    if (!code || code.length < 4) {
      this.el.joinError.textContent = 'Enter a valid room code';
      return;
    }

    this.el.btnJoinRoom.textContent = 'Joining...';
    this.el.btnJoinRoom.disabled = true;

    const result = await this.mp.joinRoom(code, username);
    if (!result.success) {
      this.el.joinError.textContent = result.error;
      this.el.btnJoinRoom.textContent = 'Join';
      this.el.btnJoinRoom.disabled = false;
      return;
    }

    if (result.settings) {
      saveStoredSettings(result.settings);
    }

    saveOnlineSession({ room: code, role: 'guest' });
    window.location.href = `game.html?mode=online&role=guest&room=${code.toUpperCase()}`;
  }

  async cancelRoom() {
    if (this._hostPollInterval) clearInterval(this._hostPollInterval);
    this.mp.stopWatchingRoom();
    clearOnlineSession();
    await this.mp.deleteRoom();
    this.el.waitingSection.classList.remove('visible');
    this.el.menuMain.style.display = 'flex';
    this.el.btnCreate.textContent = 'Create Room';
    this.el.btnCreate.disabled = false;
    if (this.el.waitingHostName) this.el.waitingHostName.textContent = '';
    const waitingText = this.el.waitingSection.querySelector('.waiting-text');
    if (waitingText) waitingText.textContent = 'Waiting for opponent...';
  }
}

const lobby = new Lobby();
const musicPlayer = new MusicPlayer();
document.addEventListener('DOMContentLoaded', () => {
  musicPlayer.init();
  initUiSounds(() => musicPlayer.getSfxVolume());
  bindButtonClickSounds();
  lobby.init();
});
