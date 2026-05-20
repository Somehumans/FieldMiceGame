import { MusicPlayer } from './music.js';
import { GameEngine } from './engine.js';
import { stakesMcHtml } from './renderer.js';
import { Renderer } from './renderer.js';
import { TRUMP_CARD_TYPES } from './trumpCards.js';
import { Tutorial, GAME_TUTORIAL_STEPS } from './tutorial.js';
import { Multiplayer } from './multiplayer.js';
import { SUPABASE_URL } from './config.js';
import {
  loadStoredSettings,
  normalizeSettings,
  parseSettingsFromUrl,
  saveStoredSettings,
  settingsForEngine,
} from './gameSettings.js';
import { loadStoredUsername } from './username.js';
import { resolveOnlineParams, clearOnlineSession, saveOnlineSession } from './onlineSession.js';
import { initUiSounds, bindButtonClickSounds } from './uiSounds.js';
import { initMobileWarning } from './mobileWarning.js';
import { initTrumpReference } from './trumpCards.js';

class Game {
  static SFX = {
    stopwatch: 'assets/sounds/stopwatch-tick.mp3',
    timeout: 'assets/sounds/timeout-blip.mp3',
    roundLose: 'assets/sounds/round-lose.mp3',
    roundWin: 'assets/sounds/round-win.mp3',
    shopPurchase: 'assets/sounds/shop-purchase.mp3',
  };

  constructor() {
    this.engine = new GameEngine();
    this.renderer = new Renderer();
    this.mode = 'ai';
    this.playerRole = 'host';
    this.aiThinking = false;
    this.turnTimeLimitSec = 25;
    this.turnTimerInterval = null;
    this.turnEndsAt = null;
    /** Milliseconds remaining when trump play animation paused the countdown */
    this._trumpAnimPausedRemainMs = undefined;
    /** @type {MusicPlayer | null} SFX volume for turn timer beeps */
    this.musicPlayer = null;
    /** @type {AudioContext | null} */
    this._timerAudioCtx = null;
    /** @type {Map<string, AudioBuffer>} */
    this._sfxBuffers = new Map();
    /** @type {Map<string, Promise<AudioBuffer | null>>} */
    this._sfxLoadPromises = new Map();
    /** Last displayed second we played a clock tick for (one tick per second). */
    this._lastClockTickSecond = null;
    /** @type {Tutorial | null} */
    this.tutorial = null;
    /** @type {Multiplayer | null} */
    this.mp = null;
    this._roomTouchInterval = null;
    this._lastOnlinePhase = 'idle';
    this._onlineRevealHandled = false;
    this._onlineRoomCode = '';
    this._guestReconcileTimer = null;
  }

  async init() {
    const params = new URLSearchParams(window.location.search);
    const online = resolveOnlineParams(params);
    this.mode = online.room ? 'online' : (online.mode || 'ai');
    this.playerRole = online.role || 'host';
    this._onlineRoomCode = online.room || '';
    const forceTutorial = params.get('tutorial') === '1';
    if (forceTutorial) Tutorial.resetProgress();

    this.renderer.init();
    this.applyMatchSettings(params);
    this.bindEvents();
    this.bindEngineEvents();
    this.setupTutorial();
    void this.preloadSfx(['stopwatch', 'timeout', 'roundLose', 'roundWin', 'shopPurchase']);

    if (this.mode === 'online') {
      await this.initOnline(params);
      return;
    }

    clearOnlineSession();
    this.applyDisplayNames(loadStoredUsername(), 'CPU');
    this.startGame();
    this.maybeStartTutorial(forceTutorial);
  }

  async initOnline(params) {
    const room = this._onlineRoomCode || params.get('room');
    if (!room) {
      window.location.href = 'index.html';
      return;
    }

    if (!SUPABASE_URL || SUPABASE_URL === 'YOUR_SUPABASE_URL') {
      window.location.href = 'index.html';
      return;
    }

    this.mp = new Multiplayer();
    const initResult = await this.mp.init();
    if (!initResult?.ok) {
      window.location.href = 'index.html';
      return;
    }

    this.mp.roomCode = room.toUpperCase();
    this.mp.role = this.playerRole;
    saveOnlineSession({ room: this.mp.roomCode, role: this.playerRole });

    const [roomRow, channelOk] = await Promise.all([
      this.mp.fetchRoom(room),
      this.mp.subscribeToChannel(this.mp.roomCode),
    ]);

    if (!roomRow) {
      window.location.href = 'index.html';
      return;
    }

    if (!channelOk) {
      console.warn('Realtime channel failed to connect for room', this.mp.roomCode);
    }

    this.mp.hostUsername = roomRow.host_username || 'Host';
    this.mp.guestUsername = roomRow.guest_username || '';
    this.mp.myUsername = this.playerRole === 'host'
      ? (roomRow.host_username || loadStoredUsername())
      : (roomRow.guest_username || loadStoredUsername());

    if (roomRow.settings) {
      try {
        const raw = typeof roomRow.settings === 'string'
          ? JSON.parse(roomRow.settings)
          : roomRow.settings;
        this.mp.roomSettings = normalizeSettings(raw);
        saveStoredSettings(this.mp.roomSettings);
        this.engine.applySettings(this.mp.roomSettings);
        this.turnTimeLimitSec = settingsForEngine(this.mp.roomSettings).turnTimeLimitSec;
      } catch { /* use session settings */ }
    }

    this.mp.onEvent = (payload) => this.handleOnlineEvent(payload);
    this.applyDisplayNames();
    void this.mp.touchRoom();

    this._roomTouchInterval = setInterval(() => {
      void this.mp?.touchRoom();
    }, 60000);

    window.addEventListener('beforeunload', () => {
      void this.mp?.leaveRoom();
    });

    this.showOnlineMatchBadge(room);

    if (this.playerRole === 'host') {
      this.startGame();
      this.updateUI();
      this.scheduleHostSyncBurst();
    } else {
      this.setGuestSyncBanner(true);
      this.startGuestSyncLoop();
    }
  }

  scheduleHostSyncBurst() {
    const send = () => void this.syncOnlineState();
    send();
    setTimeout(send, 150);
    setTimeout(send, 400);
    setTimeout(send, 900);
  }

  setGuestSyncBanner(visible) {
    const banner = document.getElementById('turn-banner');
    if (!banner) return;
    if (visible) {
      banner.textContent = 'Syncing with host…';
      banner.classList.remove('your-turn', 'opp-turn');
      banner.classList.add('sync-banner');
    } else {
      banner.classList.remove('sync-banner');
    }
  }

  showOnlineMatchBadge(roomCode) {
    const el = document.getElementById('online-match-badge');
    if (!el) return;
    el.textContent = `Live match · Room ${roomCode}`;
    el.classList.remove('hidden');
  }

  startGuestSyncLoop() {
    let attempts = 0;
    let channelPrimed = false;

    const requestSync = async () => {
      if (this.engine.phase !== 'idle') {
        this.stopGuestSyncLoop();
        return;
      }
      if (attempts >= 50) {
        this.stopGuestSyncLoop();
        this.renderer.showGameToastHtml(
          '<span class="toast-opp-event">Still waiting for host…</span> Ask them to refresh.',
          4000
        );
        return;
      }
      attempts += 1;
      if (!channelPrimed) {
        channelPrimed = await this.mp?.waitUntilReady(3000) ?? false;
      }
      await this.mp?.broadcastAction('requestSync');
    };

    void requestSync();
    setTimeout(() => void requestSync(), 100);
    setTimeout(() => void requestSync(), 250);
    setTimeout(() => void requestSync(), 500);
    this._guestSyncTimer = setInterval(() => void requestSync(), 450);
  }

  stopGuestSyncLoop() {
    if (this._guestSyncTimer) {
      clearInterval(this._guestSyncTimer);
      this._guestSyncTimer = null;
    }
    this.setGuestSyncBanner(false);
  }

  applyDisplayNames(playerName, opponentName) {
    if (this.mode === 'online' && this.mp) {
      const names = this.mp.getDisplayNames();
      this.renderer.setDisplayNames(names.player, names.opponent);
      return;
    }
    this.renderer.setDisplayNames(playerName ?? loadStoredUsername(), opponentName ?? 'CPU');
  }

  handleOnlineEvent(payload) {
    if (!payload) return;

    if (payload.type === 'game_state') {
      if (this.playerRole === 'host') return;
      this.applyRemoteState(payload);
      return;
    }

    if (payload.type === 'action' && this.playerRole === 'host') {
      this.applyRemoteAction(payload);
    }
  }

  applyRemoteState(payload) {
    if (!payload.state) return;

    const prevPhase = this.engine.phase;
    this.engine.loadFullState(payload.state);
    this._lastOnlinePhase = this.engine.phase;

    if (payload.names) {
      this.mp.hostUsername = payload.names.host ?? this.mp.hostUsername;
      this.mp.guestUsername = payload.names.guest ?? this.mp.guestUsername;
      this.applyDisplayNames();
    }

    this.stopGuestSyncLoop();
    this.clearGuestReconcile();

    this.updateUI();

    const enteredReveal = prevPhase === 'playing'
      && ['reveal', 'roundEnd', 'gameOver'].includes(this.engine.phase);
    if (enteredReveal && !this._onlineRevealHandled) {
      this._onlineRevealHandled = true;
      this.handleReveal();
    } else if (this.engine.phase === 'playing') {
      this._onlineRevealHandled = false;
    }
  }

  applyRemoteAction(payload) {
    if (payload.action === 'requestSync') {
      void this.syncOnlineState();
      return;
    }

    const role = payload.from === 'guest' ? 'guest' : 'host';
    if (this.engine.currentTurn !== role) return;

    switch (payload.action) {
      case 'hit':
        this.engine.hit(role);
        break;
      case 'stay':
        this.engine.stay(role);
        break;
      case 'skipShop':
        this.engine.skipShop(role);
        break;
      case 'buyFromShop':
        this.engine.buyFromShop(role, payload.shopIndex);
        break;
      case 'useTrump':
        this.engine.useTrumpCard(role, payload.trumpIndex, payload.targetIndex ?? -1);
        break;
      default:
        return;
    }

    void this.syncOnlineState();
    this.updateUI();

    if (['reveal', 'roundEnd', 'gameOver'].includes(this.engine.phase)) {
      this.handleReveal();
    }
  }

  async syncOnlineState() {
    if (this.mode !== 'online' || this.playerRole !== 'host' || !this.mp) return;

    await this.mp.waitUntilReady();
    await this.mp.broadcastGameState(this.engine.getFullState(), {
      names: {
        host: this.mp.hostUsername || 'Host',
        guest: this.mp.guestUsername || 'Guest',
      },
    });
    void this.mp.touchRoom();
  }

  isOnlineGuest() {
    return this.mode === 'online' && this.playerRole === 'guest';
  }

  isOnlineHost() {
    return this.mode === 'online' && this.playerRole === 'host';
  }

  /**
   * Guest: apply move locally immediately (optimistic), then tell the host.
   * Host remains authoritative — a later game_state fixes any mismatch.
   */
  relayOnlineAction(action, data, applyLocal) {
    if (!this.isOnlineGuest() || !this.mp) return false;

    const result = applyLocal();
    if (!result?.success) return true;

    this.updateUI();
    void this.mp.broadcastAction(action, data);
    this.scheduleGuestReconcile();

    if (result.roundEnd) {
      this.handleReveal();
    } else {
      this.afterPlayerAction();
    }
    return true;
  }

  scheduleGuestReconcile() {
    clearTimeout(this._guestReconcileTimer);
    this._guestReconcileTimer = setTimeout(() => {
      if (this.isOnlineGuest() && this.mp) {
        void this.mp.broadcastAction('requestSync');
      }
    }, 500);
  }

  clearGuestReconcile() {
    clearTimeout(this._guestReconcileTimer);
    this._guestReconcileTimer = null;
  }

  shouldRunAI() {
    if (this._onlineRoomCode) return false;
    return this.mode === 'ai'
      && this.engine.currentTurn !== this.playerRole
      && this.engine.phase === 'playing';
  }

  setupTutorial() {
    this.tutorial = new Tutorial(GAME_TUTORIAL_STEPS, {
      onStart: () => {
        this.clearTurnTimer();
        this.renderer.hideShopOverlay();
        this.renderer.el.pauseOverlay?.classList.add('hidden');
      },
      onComplete: () => {
        this.updateUI();
      },
    });
  }

  maybeStartTutorial(forceTutorial) {
    if (this.mode === 'online') return;
    if (!this.tutorial) return;
    if (!forceTutorial && Tutorial.isComplete()) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this.tutorial.start());
    });
  }

  startTutorial() {
    this.renderer.el.pauseOverlay?.classList.add('hidden');
    this.tutorial?.start();
  }

  applyMatchSettings(params) {
    const fromUrl = parseSettingsFromUrl(params);
    const settings = fromUrl ?? loadStoredSettings();
    const engineSettings = settingsForEngine(settings);
    this.engine.applySettings(settings);
    this.turnTimeLimitSec = engineSettings.turnTimeLimitSec;
  }

  startGame() {
    this.engine.startGame();
    this.updateUI();
  }

  bindEvents() {
    this.renderer.el.btnDraw.addEventListener('click', () => this.onDraw());
    this.renderer.el.btnKeep.addEventListener('click', () => this.onKeep());

    this.renderer.el.trumpHand.addEventListener('click', (e) => {
      const card = e.target.closest('.card[data-trump-index]');
      if (card && this.isMyTurn()) {
        const idx = parseInt(card.dataset.trumpIndex);
        this.onTrumpFromHand(idx);
      }
    });

    this.renderer.el.pauseBtn.addEventListener('click', () => {
      this.renderer.el.pauseOverlay.classList.remove('hidden');
    });

    document.getElementById('resume-btn').addEventListener('click', () => {
      this.renderer.el.pauseOverlay.classList.add('hidden');
    });

    document.getElementById('quit-btn').addEventListener('click', async () => {
      if (this.mode === 'online') {
        if (this._roomTouchInterval) clearInterval(this._roomTouchInterval);
        if (this._guestSyncTimer) clearInterval(this._guestSyncTimer);
        await this.mp?.leaveRoom();
        clearOnlineSession();
      }
      window.location.href = 'index.html';
    });

    document.getElementById('tutorial-btn')?.addEventListener('click', () => {
      this.startTutorial();
    });

    this.renderer.el.shopBtn?.addEventListener('click', () => this.openShop());
  }

  bindEngineEvents() {
    this.engine.on('hit', (data) => {
      if (data.trumpCardGained && data.player !== this.playerRole) {
        this.renderer.showGameToastHtml(
          '<span class="toast-opp-event">Opponent drew a mystery trump!</span> <span class="toast-opp-sub">🃏</span>',
          3000
        );
      }
    });

    this.engine.on('turnChange', () => {
      this.updateUI();
    });

    this.engine.on('shopPurchase', (data) => {
      void this.playSfx('shopPurchase');
      if (data.player !== this.playerRole) {
        this.renderer.showGameToastHtml(
          `<span class="toast-opp-event">Opponent bought a trump from the shop!</span> ${stakesMcHtml(data.cost)}`,
          3200
        );
      }
    });
  }

  isMyTurn() {
    return this.engine.currentTurn === this.playerRole && this.engine.phase === 'playing';
  }

  // --- Shop ---

  openShop() {
    if (this.mode !== 'ai' && this.mode !== 'online') return;
    if (this.engine.currentTurn !== this.playerRole) return;
    if (this.engine.phase !== 'playing') return;
    if (this.engine.shopUsedThisTurn) return;

    const shop = this.engine.getShopState();
    if (shop.length === 0) return;

    const lives = this.engine.players[this.playerRole].lives;
    this.renderer.showShopOverlay(
      shop,
      (index) => this.onShopBuy(index),
      () => this.onShopSkip(),
      lives,
      this.engine.roundStakes
    );
  }

  onShopSkip() {
    if (this.relayOnlineAction('skipShop', {}, () => this.engine.skipShop(this.playerRole))) {
      this.renderer.hideShopOverlay();
      return;
    }
    const result = this.engine.skipShop(this.playerRole);
    if (!result.success) return;
    this.renderer.hideShopOverlay();
    this.updateUI();
    this.syncOnlineState();
  }

  onShopBuy(shopIndex) {
    if (this.relayOnlineAction('buyFromShop', { shopIndex }, () => this.engine.buyFromShop(this.playerRole, shopIndex))) {
      this.renderer.hideShopOverlay();
      return;
    }
    const result = this.engine.buyFromShop(this.playerRole, shopIndex);
    if (result.success) {
      this.renderer.hideShopOverlay();
      this.updateUI();
      this.syncOnlineState();
    }
  }

  // --- Player actions ---

  onDraw() {
    if (!this.isMyTurn()) return;
    if (this.relayOnlineAction('hit', {}, () => this.engine.hit(this.playerRole))) return;

    const result = this.engine.hit(this.playerRole);
    if (!result.success) return;

    this.updateUI();
    this.syncOnlineState();
    this.afterPlayerAction();
  }

  onKeep() {
    if (!this.isMyTurn()) return;
    if (this.relayOnlineAction('stay', {}, () => this.engine.stay(this.playerRole))) return;

    const result = this.engine.stay(this.playerRole);
    if (!result.success) return;

    this.updateUI();
    this.syncOnlineState();
    if (result.roundEnd) {
      this.handleReveal();
    } else {
      this.afterPlayerAction();
    }
  }

  onTrumpFromHand(trumpIndex) {
    if (!this.isMyTurn()) return;

    const trumpCards = this.engine.players[this.playerRole].trumpCards;
    const trumpId = trumpCards[trumpIndex];
    const type = TRUMP_CARD_TYPES[trumpId];
    if (!type) return;

    const { canUse, reason } = this.getTrumpUseAvailability(type);
    this.renderer.showTrumpUseConfirm(trumpId, {
      canUse,
      unusableReason: reason,
      onUse: () => {
        this.renderer.hideTrumpUseConfirm();
        this.confirmTrumpUse(trumpIndex, type);
      },
      onCancel: () => this.renderer.hideTrumpUseConfirm(),
    });
  }

  getTrumpUseAvailability(type) {
    if (!type.needsTarget) return { canUse: true, reason: '' };

    const opponent = this.playerRole === 'host' ? 'guest' : 'host';
    if (type.targetType === 'opponent_face_up') {
      if (this.engine.players[opponent].faceUp.length === 0) {
        return { canUse: false, reason: 'Opponent has no face-up cards to target.' };
      }
    } else if (this.engine.players[this.playerRole].faceUp.length === 0) {
      return { canUse: false, reason: 'You have no face-up cards to target.' };
    }
    return { canUse: true, reason: '' };
  }

  confirmTrumpUse(trumpIndex, type) {
    if (type.needsTarget) {
      this.showTargetForTrump(trumpIndex, type);
    } else {
      void this.executeTrump(trumpIndex);
    }
  }

  showTargetForTrump(trumpIndex, type) {
    let cards, title;
    const opponent = this.playerRole === 'host' ? 'guest' : 'host';

    if (type.targetType === 'opponent_face_up') {
      cards = this.engine.players[opponent].faceUp;
      title = "Select an opponent's card";
    } else {
      cards = this.engine.players[this.playerRole].faceUp;
      title = "Select one of your cards";
    }

    if (cards.length === 0) return;

    this.renderer.showTargetSelect(
      title, cards,
      async (targetIndex) => {
        this.renderer.hideTargetSelect();
        await this.executeTrump(trumpIndex, targetIndex);
      },
      () => this.renderer.hideTargetSelect()
    );
  }

  async executeTrump(trumpIndex, targetIndex = -1) {
    const trumpCards = this.engine.players[this.playerRole].trumpCards;
    const trumpId = trumpCards[trumpIndex];
    if (!trumpId) return;

    this.renderer.el.btnDraw.disabled = true;
    this.renderer.el.btnKeep.disabled = true;

    this.pauseTurnClockForTrumpAnimation();
    try {
      await this.renderer.showTrumpPlay(trumpId, 'player', trumpIndex);
    } finally {
      this.resumeTurnClockAfterTrumpAnimation();
    }

    if (this.relayOnlineAction('useTrump', { trumpIndex, targetIndex }, () =>
      this.engine.useTrumpCard(this.playerRole, trumpIndex, targetIndex)
    )) {
      return;
    }

    const result = this.engine.useTrumpCard(this.playerRole, trumpIndex, targetIndex);
    if (!result.success) {
      this.updateUI();
      return;
    }

    this.updateUI();
    this.syncOnlineState();
    this.afterPlayerAction();
  }

  async playOpponentTrump(aiRole, trumpIndex, targetIndex = -1) {
    const trumpId = this.engine.players[aiRole].trumpCards[trumpIndex];
    if (!trumpId) return;

    await this.renderer.showTrumpPlay(trumpId, 'opponent', trumpIndex);
    this.engine.useTrumpCard(aiRole, trumpIndex, targetIndex);
    this.updateUI();
  }

  afterPlayerAction() {
    if (this.engine.phase === 'reveal' || this.engine.phase === 'roundEnd') {
      this.handleReveal();
      return;
    }

    if (this.shouldRunAI()) {
      this.scheduleAI();
    }

    if (this.mode === 'online' && this.isOnlineHost()) {
      this.syncOnlineState();
    }
  }

  // --- Reveal & round end ---

  handleReveal() {
    if (this.mode === 'online' && this.isOnlineHost()) {
      this.syncOnlineState();
    }

    const myTotal = this.engine.getHandTotal(this.playerRole);
    const oppRole = this.playerRole === 'host' ? 'guest' : 'host';
    const oppTotal = this.engine.getHandTotal(oppRole);

    this.updateUI();

    setTimeout(() => {
      const state = this.engine.getState(this.playerRole);
      this.renderer.render(state, false);

      const loser = this.engine.roundWinner === 'draw' ? null :
        (this.engine.roundWinner === 'host' ? 'guest' : 'host');

      if (loser) {
        const side = loser === this.playerRole ? 'player' : 'opponent';
        if (loser === this.playerRole) void this.playSfx('roundLose');
        else void this.playSfx('roundWin');
        this.renderer.screenShake();
        this.renderer.damageFlash(side);
      }

      const data = {
        winner: this.engine.roundWinner,
        yourTotal: myTotal,
        oppTotal,
        target: this.engine.targetValue,
        mcTransferred: this.engine.lastMcTransferred ?? this.engine.roundStakes,
        livesLost: this.engine.lastMcTransferred ?? this.engine.roundStakes,
        stakes: this.engine.roundStakes,
        roundNumber: this.engine.roundNumber,
        yourLives: this.engine.players[this.playerRole].lives,
        oppLives: this.engine.players[oppRole].lives,
        maxLives: this.engine.startingLives,
      };

      const showDelay = this.engine.phase === 'gameOver' ? 1000 : 800;

      setTimeout(async () => {
        if (this.engine.phase === 'gameOver') {
          this.renderer.showGameOver(this.engine.winner, this.playerRole);
        } else {
          await this.renderer.playRoundEndCutscene(data, this.playerRole);
        }
        this.bindResultButtons();
      }, showDelay);
    }, 600);
  }

  bindResultButtons() {
    let nextBtn = document.getElementById('next-round-btn');
    if (nextBtn) {
      const fresh = nextBtn.cloneNode(true);
      nextBtn.replaceWith(fresh);
      nextBtn = fresh;
      nextBtn.addEventListener('click', () => {
        this.renderer.hideRoundEndCutscene();
        this.renderer.hideOverlay();
        if (this.mode === 'online' && !this.isOnlineHost()) return;
        const result = this.engine.startNewRound();
        if (result && !result.success) return;
        this._onlineRevealHandled = false;
        this.updateUI();
        this.syncOnlineState();
        if (this.shouldRunAI()) {
          this.scheduleAI();
        }
      });
    }

    const playAgainBtn = document.getElementById('play-again-btn');
    if (playAgainBtn) {
      playAgainBtn.addEventListener('click', () => {
        this.renderer.hideOverlay();
        if (this.mode === 'online') {
          window.location.href = 'index.html';
          return;
        }
        this.startGame();
      });
    }

    const lobbyBtn = document.getElementById('back-to-lobby-btn');
    if (lobbyBtn) {
      lobbyBtn.addEventListener('click', async () => {
        if (this.mode === 'online') {
          if (this.engine.phase === 'gameOver') await this.mp?.markRoomFinished();
          if (this._roomTouchInterval) clearInterval(this._roomTouchInterval);
          if (this._guestSyncTimer) clearInterval(this._guestSyncTimer);
          await this.mp?.leaveRoom();
          clearOnlineSession();
        }
        window.location.href = 'index.html';
      });
    }
  }

  updateUI() {
    const state = this.engine.getState(this.playerRole);
    const showShop = this.mode === 'ai' || this.mode === 'online';
    this.renderer.render(state, this.isMyTurn(), showShop);
    this.syncTurnTimer();
  }

  /** Urgency pulse runs on outer #game-container frame (matches game border color). */
  getPulseTarget() {
    return document.getElementById('game-container');
  }

  /** Circumference for SVG countdown ring (#turn-clock-progress, r="18"). */
  getTurnClockCircumference() {
    return 2 * Math.PI * 18;
  }

  clearTurnTimer() {
    if (this.turnTimerInterval != null) {
      clearInterval(this.turnTimerInterval);
      this.turnTimerInterval = null;
    }
    this.turnEndsAt = null;
  }

  pauseTurnClockForTrumpAnimation() {
    if (
      !this.turnTimerInterval
      || this.turnEndsAt == null
      || !this.isMyTurn()
      || this.engine.phase !== 'playing'
    ) return;
    this._trumpAnimPausedRemainMs = Math.max(0, this.turnEndsAt - Date.now());
    clearInterval(this.turnTimerInterval);
    this.turnTimerInterval = null;
    this.turnEndsAt = null;
  }

  resumeTurnClockAfterTrumpAnimation() {
    const ms = this._trumpAnimPausedRemainMs;
    this._trumpAnimPausedRemainMs = undefined;
    if (ms === undefined || !this.isMyTurn() || this.engine.phase !== 'playing') return;
    this.turnEndsAt = Date.now() + ms;
    this.turnTimerInterval = setInterval(() => this.tickTurnTimer(), 110);
    this.tickTurnTimer();
  }

  syncTurnTimer() {
    this._trumpAnimPausedRemainMs = undefined;

    const clockWrap = document.getElementById('turn-timer-clock');
    const textEl = document.getElementById('turn-timer-text');
    const progressEl = document.getElementById('turn-clock-progress');
    const C = this.getTurnClockCircumference();

    if (!clockWrap || !textEl || !progressEl) return;

    const onMyTurn = this.isMyTurn() && this.engine.phase === 'playing';
    // Save before clearTurnTimer — shop skip/buy only refresh UI, same turn
    const preservedEndsAt =
      onMyTurn && this.turnEndsAt != null ? this.turnEndsAt : null;

    this.clearTurnTimer();

    progressEl.style.strokeDasharray = `${C}`;

    if (!onMyTurn) {
      clockWrap.classList.add('hidden');
      textEl.textContent = String(this.turnTimeLimitSec);
      progressEl.style.strokeDashoffset = `${C * (1 - 1)}`;
      this._lastClockTickSecond = null;
      const root = this.getPulseTarget();
      if (root) root.style.setProperty('--turn-urgency', '0');
      this.setTurnPulse(0);
      return;
    }

    clockWrap.classList.remove('hidden');

    if (preservedEndsAt != null) {
      this.turnEndsAt = preservedEndsAt;
      this.turnTimerInterval = setInterval(() => this.tickTurnTimer(), 110);
      this.tickTurnTimer();
      return;
    }

    this._lastClockTickSecond = null;
    this.turnEndsAt = Date.now() + this.turnTimeLimitSec * 1000;
    this.turnTimerInterval = setInterval(() => this.tickTurnTimer(), 110);
    this.tickTurnTimer();
  }

  tickTurnTimer() {
    const clockWrap = document.getElementById('turn-timer-clock');
    const textEl = document.getElementById('turn-timer-text');
    const progressEl = document.getElementById('turn-clock-progress');
    const C = this.getTurnClockCircumference();
    if (!clockWrap || !textEl || !progressEl) return;

    if (!this.isMyTurn() || this.engine.phase !== 'playing') {
      this.clearTurnTimer();
      clockWrap.classList.add('hidden');
      this._lastClockTickSecond = null;
      const rootOff = this.getPulseTarget();
      if (rootOff) rootOff.style.setProperty('--turn-urgency', '0');
      this.setTurnPulse(0);
      return;
    }

    const remainSec = Math.max(0, (this.turnEndsAt - Date.now()) / 1000);
    const total = this.turnTimeLimitSec;
    const ratio = total > 0 ? Math.min(1, remainSec / total) : 0;
    const urgency = 1 - ratio;

    const root = this.getPulseTarget();
    if (root) root.style.setProperty('--turn-urgency', Math.min(1, Math.max(0, urgency)).toFixed(4));

    const ceilRemain = Math.max(0, Math.ceil(remainSec));
    this.maybeClockTicks(ratio, ceilRemain);

    progressEl.style.strokeDasharray = `${C}`;
    textEl.textContent = String(ceilRemain);
    progressEl.style.strokeDashoffset = `${C * (1 - ratio)}`;
    this.setTurnPulse(urgency);

    if (remainSec <= 0 && this.turnTimerInterval != null) {
      clearInterval(this.turnTimerInterval);
      this.turnTimerInterval = null;
      textEl.textContent = '0';
      progressEl.style.strokeDashoffset = `${C}`;
      this.enforceTurnDueToTimer();
    }
  }

  /** Your turn ends when the clock hits zero (same as pressing Keep). */
  enforceTurnDueToTimer() {
    if (!this.isMyTurn() || this.engine.phase !== 'playing') return;
    this.renderer.hideShopOverlay();
    this.renderer.hideTargetSelect();
    this.renderer.hideTrumpSelect();
    void this.playSfx('timeout');
    this.onKeep();
  }

  ensureTimerAudioContext() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!this._timerAudioCtx) this._timerAudioCtx = new AC();
    const ctx = this._timerAudioCtx;
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }

  preloadSfx(keys) {
    return Promise.all(keys.map((key) => this.loadSfx(key)));
  }

  loadSfx(key) {
    const src = Game.SFX[key];
    if (!src) return Promise.resolve(null);
    if (this._sfxBuffers.has(key)) return Promise.resolve(this._sfxBuffers.get(key));
    if (this._sfxLoadPromises.has(key)) return this._sfxLoadPromises.get(key);

    const promise = (async () => {
      try {
        const ctx = this.ensureTimerAudioContext();
        if (!ctx) return null;
        const res = await fetch(src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        const buffer = await ctx.decodeAudioData(data);
        this._sfxBuffers.set(key, buffer);
        return buffer;
      } catch (err) {
        console.warn(`SFX "${key}" failed to load:`, err);
        return null;
      }
    })();

    this._sfxLoadPromises.set(key, promise);
    return promise;
  }

  /**
   * @param {keyof typeof Game.SFX} key
   * @param {{ gain?: number }} opts gain multiplier on top of SFX volume (default 1)
   */
  async playSfx(key, { gain = 1 } = {}) {
    const vol = this.musicPlayer?.getSfxVolume() ?? 0;
    if (vol <= 0) return;

    const buffer = await this.loadSfx(key);
    const ctx = this.ensureTimerAudioContext();
    if (!buffer || !ctx) return;

    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buffer;
    g.gain.value = Math.min(1, vol * gain);
    src.connect(g);
    g.connect(ctx.destination);
    src.start(0);
  }

  /** One tick from the stopwatch sample — steady slice per countdown second. */
  playStopwatchTick(vol, { tickIndex = 0 } = {}) {
    const ctx = this.ensureTimerAudioContext();
    const buffer = this._sfxBuffers.get('stopwatch');
    if (!ctx || !buffer) return;

    const tickCount = 60;
    const spacing = buffer.duration / tickCount;
    const idx = tickIndex % tickCount;

    const sliceDur = Math.min(0.14, spacing * 0.9);
    const peak = Math.min(1, vol * 0.75);

    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buffer;
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + sliceDur);
    src.connect(g);
    g.connect(ctx.destination);
    src.start(0, idx * spacing, sliceDur);
  }

  /** One clock tick each time the displayed second changes (steady, no end rush). */
  maybeClockTicks(_ratio, ceilRemain) {
    const vol = this.musicPlayer?.getSfxVolume() ?? 0;
    if (vol <= 0 || ceilRemain < 0) return;
    if (this._lastClockTickSecond === ceilRemain) return;
    this._lastClockTickSecond = ceilRemain;

    const tickIndex = Math.max(0, this.turnTimeLimitSec - ceilRemain);
    void this.loadSfx('stopwatch').then((buf) => {
      if (!buf) return;
      this.playStopwatchTick(vol, { tickIndex });
    });
  }

  setTurnPulse(urgency) {
    const root = this.getPulseTarget();
    if (!root) return;

    const reduceMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!this.isMyTurn() || this.engine.phase !== 'playing' || urgency <= 0) {
      root.classList.remove('turn-pulse');
      root.style.removeProperty('--turn-pulse-period');
      root.style.removeProperty('--turn-pulse-strength');
      return;
    }

    root.style.setProperty('--turn-pulse-strength', urgency.toFixed(3));

    if (reduceMotion) {
      root.classList.add('turn-pulse');
      root.style.removeProperty('--turn-pulse-period');
      return;
    }

    root.classList.add('turn-pulse');
    const periodSec = Math.max(0.4, 2.05 - urgency * 1.75);
    root.style.setProperty('--turn-pulse-period', `${periodSec}s`);
  }

  // --- AI ---

  aiPause(minMs, maxMs) {
    const ms = minMs + Math.random() * (maxMs - minMs);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  scheduleAI() {
    if (!this.shouldRunAI()) return;
    if (this.tutorial?.isActive()) return;
    if (this.aiThinking) return;
    this.aiThinking = true;
    this.renderer.showOpponentThinking();
    const delay = 1400 + Math.random() * 1600;
    setTimeout(() => void this.aiTurn(), delay);
  }

  async aiTurn() {
    try {
      if (!this.shouldRunAI()) return;
      if (this.tutorial?.isActive()) return;
      if (this.engine.phase !== 'playing' || this.engine.currentTurn === this.playerRole) return;

      await this.aiPause(600, 1100);

      const aiRole = this.playerRole === 'host' ? 'guest' : 'host';

      // AI might buy from shop
      if (!this.engine.shopUsedThisTurn && Math.random() < 0.3) {
        const shop = this.engine.getShopState();
        const affordable = shop
          .map((item, i) => ({ ...item, index: i }))
          .filter(item => !item.sold && this.engine.players[aiRole].lives > item.cost);
        if (affordable.length > 0) {
          await this.aiPause(500, 1000);
          const pick = affordable[Math.floor(Math.random() * affordable.length)];
          this.engine.buyFromShop(aiRole, pick.index);
          this.updateUI();
          await this.aiPause(800, 1500);
        }
      }

      const total = this.engine.getHandTotal(aiRole);
      const target = this.engine.getTarget(aiRole);
      const diff = target - total;
      const trumpCards = this.engine.players[aiRole].trumpCards;

      if (this.engine.isBusted(aiRole)) {
        await this.aiPause(600, 1200);
        this.engine.stay(aiRole);
        this.updateUI();
        return;
      }

      // Try to use helpful trump if busting
      if (diff < 0 && trumpCards.length > 0) {
        const helpIdx = this.aiFindHelpfulTrump(aiRole, trumpCards, total, target);
        if (helpIdx !== -1) {
          const trumpId = trumpCards[helpIdx];
          const type = TRUMP_CARD_TYPES[trumpId];
          let targetIndex = -1;
          if (type?.needsTarget) {
            targetIndex = this.aiPickTarget(aiRole, type);
            if (targetIndex === -1) {
              await this.aiPause(900, 1600);
              this.engine.stay(aiRole);
              this.updateUI();
              return;
            }
          }
          await this.aiPause(1000, 2000);
          await this.playOpponentTrump(aiRole, helpIdx, targetIndex);
          return;
        }
      }

      // Offensive trump
      if (trumpCards.length > 0 && Math.random() < 0.2 && diff > 3) {
        const offIdx = trumpCards.findIndex(id =>
          ['plus_1', 'plus_2', 'plus_3', 'double_down'].includes(id)
        );
        if (offIdx !== -1) {
          await this.aiPause(900, 1800);
          await this.playOpponentTrump(aiRole, offIdx);
          return;
        }
      }

      // Hit or stay
      await this.aiPause(1100, 2200);
      if (diff <= 0) {
        this.engine.stay(aiRole);
      } else if (diff >= 7) {
        this.engine.hit(aiRole);
      } else if (diff >= 4) {
        Math.random() < 0.7 ? this.engine.hit(aiRole) : this.engine.stay(aiRole);
      } else {
        Math.random() < 0.35 ? this.engine.hit(aiRole) : this.engine.stay(aiRole);
      }

      this.updateUI();
    } finally {
      this.aiThinking = false;
      this.updateUI();
      this.afterAIAction();
    }
  }

  aiFindHelpfulTrump(aiRole, trumpCards, total, target) {
    const diff = total - target;
    for (let i = 0; i < trumpCards.length; i++) {
      const id = trumpCards[i];
      if (id === 'minus_3' && diff >= 3) return i;
      if (id === 'minus_2' && diff >= 2) return i;
      if (id === 'minus_1' && diff >= 1) return i;
      if (id === 'return_card' && this.engine.players[aiRole].faceUp.length > 0) return i;
      if (id === 'return_last' && this.engine.players[aiRole].faceUp.length > 0) return i;
      if (id === 'perfect_draw' || id === 'ultimate_draw') return i;
      if (id === 'love_your_enemy') return i;
      if (id === 'shield' || id === 'shield_plus') return i;
    }
    return -1;
  }

  aiPickTarget(aiRole, type) {
    const opponent = aiRole === 'host' ? 'guest' : 'host';
    const isOppTarget = type.targetType === 'opponent_face_up';
    const cards = isOppTarget ? this.engine.players[opponent].faceUp : this.engine.players[aiRole].faceUp;
    if (cards.length === 0) return -1;
    let best = 0;
    for (let i = 1; i < cards.length; i++) {
      if (cards[i] > cards[best]) best = i;
    }
    return best;
  }

  afterAIAction() {
    if (['reveal', 'roundEnd', 'gameOver'].includes(this.engine.phase)) {
      this.handleReveal();
      return;
    }
    if (this.shouldRunAI()) {
      this.scheduleAI();
    }
  }
}
const game = new Game();
const musicPlayer = new MusicPlayer();
document.addEventListener('DOMContentLoaded', () => {
  game.musicPlayer = musicPlayer;
  musicPlayer.init({ pauseMenu: true });
  initUiSounds(() => musicPlayer.getSfxVolume());
  bindButtonClickSounds();
  initMobileWarning();
  initTrumpReference();
  game.init();
});
