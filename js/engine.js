import {
  TRUMP_CARD_TYPES,
  createTrumpDeck,
  shuffleArray,
  drawShopTrumpOffer,
  SHOP_EXCLUSIVE_PLUS_PLUS,
  getShopTrumpTier
} from './trumpCards.js';
import {
  DEFAULT_GAME_SETTINGS,
  DEFAULT_DECK_CARDS,
  normalizeSettings,
} from './gameSettings.js';

/** Default starting Micecoin balance (overridden by match settings) */
export const STARTING_LIVES = DEFAULT_GAME_SETTINGS.startingLives;

export class GameEngine {
  constructor() {
    this.listeners = {};
    this.settings = { ...DEFAULT_GAME_SETTINGS };
    this.trumpDrawChance = DEFAULT_GAME_SETTINGS.trumpDrawChance / 100;
    this.startingLives = DEFAULT_GAME_SETTINGS.startingLives;
    this.deckCards = [...DEFAULT_DECK_CARDS];
    this.reset();
  }

  applySettings(settings = {}) {
    this.settings = normalizeSettings(settings);
    this.trumpDrawChance = this.settings.trumpDrawChance / 100;
    this.startingLives = this.settings.startingLives;
    this.deckCards = [...this.settings.deckCards];
  }

  reset() {
    this.deck = [];
    this.trumpDeck = [];
    this.players = {
      host: this.freshPlayerState(),
      guest: this.freshPlayerState()
    };
    this.currentTurn = null;
    this.roundNumber = 0;
    this.targetValue = 21;
    this.goForTarget = null;
    this.roundStakes = 1;
    this.phase = 'idle';
    this.winner = null;
    this.roundWinner = null;
    this.shop = [];
    this.shopUsedThisTurn = false;
    this.lastMcTransferred = 0;
  }

  freshPlayerState() {
    return {
      faceDown: null,
      faceUp: [],
      modifiers: [],
      trumpCards: [],
      lives: this.startingLives,
      stayed: false,
      /** Extra MC lost when this player loses the round (One-Up, Two-Up, etc.) */
      stakeBonus: 0,
      /** MC saved when this player loses the round (Shield) */
      stakeReduction: 0,
      /** Cannot play trump cards this round */
      trumpBlocked: false,
      /** Draw a trump after each trump you play this round */
      harvest: false
    };
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
    (this.listeners['*'] || []).forEach(cb => cb(event, data));
  }

  shuffleDeck() {
    this.deck = shuffleArray(this.deck);
  }

  createDeck() {
    const source = this.deckCards?.length ? this.deckCards : DEFAULT_DECK_CARDS;
    this.deck = shuffleArray([...source]);
  }

  drawCard() {
    if (this.deck.length === 0) return null;
    return this.deck.pop();
  }

  drawTrumpCard() {
    if (this.trumpDeck.length === 0) {
      this.trumpDeck = createTrumpDeck();
    }
    return this.trumpDeck.pop();
  }

  // --- Shop system ---

  getTrumpCardCost(trumpId) {
    if (SHOP_EXCLUSIVE_PLUS_PLUS.includes(trumpId)) return 3;
    const expensive = [
      'love_your_enemy', 'body_bag', 'steal', 'speed_loader',
      'two_up_plus', 'shield_plus', 'trump_switch_plus', 'destroy_plus', 'perfect_draw_plus',
      'perfect_draw', 'ultimate_draw', 'harvest'
    ];
    return expensive.includes(trumpId) ? 2 : 1;
  }

  generateShop() {
    this.shop = [];
    for (let i = 0; i < 3; i++) {
      const card = drawShopTrumpOffer();
      this.shop.push({ id: card, cost: this.getTrumpCardCost(card), sold: false });
    }
    this.emit('shopUpdated', { shop: this.getShopState() });
  }

  getShopState() {
    return this.shop.map(item => ({
      id: item.id,
      cost: item.cost,
      sold: item.sold,
      shopTier: getShopTrumpTier(item.id),
      name: TRUMP_CARD_TYPES[item.id]?.name || item.id,
      description: TRUMP_CARD_TYPES[item.id]?.description || ''
    }));
  }

  buyFromShop(player, shopIndex) {
    if (this.phase !== 'playing') return { success: false, error: 'Not in playing phase' };
    if (this.currentTurn !== player) return { success: false, error: 'Not your turn' };
    if (this.shopUsedThisTurn) return { success: false, error: 'Already used shop this turn' };
    if (shopIndex < 0 || shopIndex >= this.shop.length) return { success: false, error: 'Invalid shop item' };

    const item = this.shop[shopIndex];
    if (item.sold) return { success: false, error: 'Already sold' };
    if (this.players[player].lives <= item.cost) return { success: false, error: 'Not enough MC (would go broke!)' };

    this.players[player].lives -= item.cost;
    this.players[player].trumpCards.push(item.id);
    item.sold = true;
    this.shopUsedThisTurn = true;

    this.emit('shopPurchase', {
      player,
      cardId: item.id,
      cardName: TRUMP_CARD_TYPES[item.id]?.name || item.id,
      cost: item.cost
    });

    return { success: true, cardId: item.id };
  }

  /** Pass on buying — still counts as your one shop visit this turn. */
  skipShop(player) {
    if (this.phase !== 'playing') return { success: false, error: 'Not in playing phase' };
    if (this.currentTurn !== player) return { success: false, error: 'Not your turn' };
    if (this.shopUsedThisTurn) return { success: false, error: 'Already used shop this turn' };
    if (this.shop.length === 0) return { success: false, error: 'Shop is empty' };

    this.shopUsedThisTurn = true;
    this.emit('shopSkipped', { player });
    return { success: true };
  }

  // --- Core game flow ---

  startGame() {
    this.reset();
    for (const role of ['host', 'guest']) {
      this.players[role].lives = this.startingLives;
    }
    this.trumpDeck = createTrumpDeck();
    this.startNewRound({ force: true });
  }

  startNewRound(options = {}) {
    const { force = false } = options;
    if (!force && !['idle', 'roundEnd'].includes(this.phase)) {
      return { success: false, error: 'Cannot start a new round right now' };
    }

    this.roundNumber++;
    this.createDeck();
    this.trumpDeck = createTrumpDeck();
    this.targetValue = 21;
    this.goForTarget = null;
    this.roundStakes = this.roundNumber;
    this.roundWinner = null;

    for (const role of ['host', 'guest']) {
      const p = this.freshPlayerState();
      p.lives = this.players[role].lives;
      this.players[role] = p;
    }

    this.players.host.faceDown = this.drawCard();
    this.players.guest.faceDown = this.drawCard();
    this.players.host.faceUp.push(this.drawCard());
    this.players.guest.faceUp.push(this.drawCard());

    const hostTrump1 = this.drawTrumpCard();
    const hostTrump2 = this.drawTrumpCard();
    const guestTrump1 = this.drawTrumpCard();
    const guestTrump2 = this.drawTrumpCard();
    if (hostTrump1) this.players.host.trumpCards.push(hostTrump1);
    if (hostTrump2) this.players.host.trumpCards.push(hostTrump2);
    if (guestTrump1) this.players.guest.trumpCards.push(guestTrump1);
    if (guestTrump2) this.players.guest.trumpCards.push(guestTrump2);

    this.generateShop();

    this.currentTurn = 'host';
    this.phase = 'playing';
    this.shopUsedThisTurn = false;

    this.emit('roundStart', {
      round: this.roundNumber,
      hostFaceUp: this.players.host.faceUp[0],
      guestFaceUp: this.players.guest.faceUp[0]
    });

    return { success: true };
  }

  getHandTotal(player) {
    const p = this.players[player];
    let total = 0;
    if (p.faceDown !== null) total += p.faceDown;
    total += p.faceUp.reduce((s, c) => s + c, 0);
    total += p.modifiers.reduce((s, m) => s + m, 0);
    return Math.max(0, total);
  }

  getVisibleTotal(player) {
    const p = this.players[player];
    let total = p.faceUp.reduce((s, c) => s + c, 0);
    total += p.modifiers.reduce((s, m) => s + m, 0);
    return total;
  }

  getTarget(player) {
    return this.goForTarget ?? this.targetValue;
  }

  isBusted(player) {
    return this.getHandTotal(player) > this.getTarget(player);
  }

  hit(player) {
    if (this.phase !== 'playing') return { success: false, error: 'Not in playing phase' };
    if (this.currentTurn !== player) return { success: false, error: 'Not your turn' };
    if (this.players[player].stayed) return { success: false, error: 'Already stayed' };
    if (this.isBusted(player)) {
      return { success: false, error: 'You busted — you cannot draw more cards', busted: true };
    }

    const card = this.drawCard();
    if (card === null) {
      return this.stay(player);
    }

    this.players[player].faceUp.push(card);
    this.players[player].stayed = false;

    let trumpCardGained = null;
    if (Math.random() < this.trumpDrawChance) {
      trumpCardGained = this.drawTrumpCard();
      if (trumpCardGained) {
        this.players[player].trumpCards.push(trumpCardGained);
      }
    }

    const total = this.getHandTotal(player);

    this.emit('hit', { player, card, total, trumpCardGained });
    this.advanceTurn();

    return { success: true, card, total, trumpCardGained };
  }

  stay(player) {
    if (this.phase !== 'playing') return { success: false, error: 'Not in playing phase' };
    if (this.currentTurn !== player) return { success: false, error: 'Not your turn' };

    this.players[player].stayed = true;
    this.emit('stay', { player });

    if (this.players.host.stayed && this.players.guest.stayed) {
      this.revealCards();
      return { success: true, roundEnd: true };
    }

    this.advanceTurn();
    return { success: true, roundEnd: false };
  }

  useTrumpCard(player, trumpIndex, targetIndex = -1) {
    if (this.phase !== 'playing') return { success: false, error: 'Not in playing phase' };
    if (this.currentTurn !== player) return { success: false, error: 'Not your turn' };

    const trumpCards = this.players[player].trumpCards;
    if (trumpIndex < 0 || trumpIndex >= trumpCards.length) {
      return { success: false, error: 'Invalid trump card' };
    }

    const trumpId = trumpCards[trumpIndex];
    const trumpType = TRUMP_CARD_TYPES[trumpId];
    if (!trumpType) return { success: false, error: 'Unknown trump card type' };

    if (this.players[player].trumpBlocked) {
      return { success: false, error: 'Cannot play trump cards this round' };
    }

    if (trumpType.needsTarget && targetIndex === -1) {
      return { success: false, error: 'This card needs a target', needsTarget: true, targetType: trumpType.targetType };
    }

    trumpCards.splice(trumpIndex, 1);

    const result = trumpType.apply(this, player, targetIndex);
    if (result.success === false) {
      trumpCards.splice(trumpIndex, 0, trumpId);
      return result;
    }

    if (this.players[player].harvest) {
      const bonus = this.drawTrumpCard();
      if (bonus) this.players[player].trumpCards.push(bonus);
    }

    this.emit('trumpCardUsed', {
      player,
      cardId: trumpId,
      cardName: trumpType.name,
      message: result.message
    });

    this.advanceTurn();
    return { success: true, ...result };
  }

  advanceTurn() {
    const opponent = this.currentTurn === 'host' ? 'guest' : 'host';
    this.shopUsedThisTurn = false;

    // Opponent checked (stayed) but acted after with draw/trump — they can play again.
    // Round still ends only when both players check on consecutive stays (see stay()).
    if (this.players[opponent].stayed) {
      this.players[opponent].stayed = false;
    }

    this.currentTurn = opponent;
    this.emit('turnChange', { currentTurn: this.currentTurn });
  }

  revealCards() {
    this.phase = 'reveal';

    const hostTotal = this.getHandTotal('host');
    const guestTotal = this.getHandTotal('guest');

    this.emit('reveal', {
      hostFaceDown: this.players.host.faceDown,
      guestFaceDown: this.players.guest.faceDown,
      hostTotal,
      guestTotal
    });

    this.resolveRound(hostTotal, guestTotal);
  }

  resolveRound(hostTotal, guestTotal) {
    const target = this.goForTarget ?? this.targetValue;
    const hostBust = hostTotal > target;
    const guestBust = guestTotal > target;

    if (hostBust && guestBust) {
      this.roundWinner = hostTotal <= guestTotal ? 'host' : 'guest';
    } else if (hostBust) {
      this.roundWinner = 'guest';
    } else if (guestBust) {
      this.roundWinner = 'host';
    } else {
      const hostDiff = target - hostTotal;
      const guestDiff = target - guestTotal;
      if (hostDiff < guestDiff) this.roundWinner = 'host';
      else if (guestDiff < hostDiff) this.roundWinner = 'guest';
      else this.roundWinner = 'draw';
    }

    let mcTransferred = 0;
    if (this.roundWinner !== 'draw') {
      const loser = this.roundWinner === 'host' ? 'guest' : 'host';
      const winner = this.roundWinner;
      const ls = this.players[loser];
      const ws = this.players[winner];
      let damage = this.roundStakes + (ls.stakeBonus || 0);
      damage = Math.max(0, damage - (ls.stakeReduction || 0));
      mcTransferred = damage;
      ls.lives = Math.max(0, ls.lives - damage);
      ws.lives += damage;
    }

    this.lastMcTransferred = mcTransferred;
    this.phase = 'roundEnd';

    this.emit('roundEnd', {
      winner: this.roundWinner,
      loser: this.roundWinner === 'draw' ? null : (this.roundWinner === 'host' ? 'guest' : 'host'),
      hostTotal,
      guestTotal,
      target,
      mcTransferred,
      livesLost: mcTransferred,
      hostLives: this.players.host.lives,
      guestLives: this.players.guest.lives
    });

    if (this.roundWinner !== 'draw') {
      const loser = this.roundWinner === 'host' ? 'guest' : 'host';
      if (this.players[loser].lives <= 0) {
        this.phase = 'gameOver';
        this.winner = this.roundWinner;
        this.emit('gameOver', { winner: this.winner });
      }
    }
  }

  canAct(player) {
    return (
      this.phase === 'playing' &&
      this.currentTurn === player &&
      !this.players[player].stayed &&
      !this.isBusted(player)
    );
  }

  getState(perspective) {
    const opponent = perspective === 'host' ? 'guest' : 'host';
    const isRevealed = ['reveal', 'roundEnd', 'gameOver'].includes(this.phase);

    return {
      phase: this.phase,
      roundNumber: this.roundNumber,
      maxLives: this.startingLives,
      targetValue: this.goForTarget ?? this.targetValue,
      baseTargetValue: this.targetValue,
      goForTarget: this.goForTarget,
      roundStakes: this.roundStakes,
      currentTurn: this.currentTurn,
      roundWinner: this.roundWinner,
      winner: this.winner,
      deckCount: this.deck.length,
      shop: this.getShopState(),
      shopUsedThisTurn: this.shopUsedThisTurn,
      you: {
        faceDown: this.players[perspective].faceDown,
        faceUp: [...this.players[perspective].faceUp],
        modifiers: [...this.players[perspective].modifiers],
        trumpCards: [...this.players[perspective].trumpCards],
        lives: this.players[perspective].lives,
        stayed: this.players[perspective].stayed,
        total: this.getHandTotal(perspective),
        busted: this.isBusted(perspective),
      },
      opponent: {
        faceDown: isRevealed ? this.players[opponent].faceDown : null,
        faceUp: [...this.players[opponent].faceUp],
        modifiers: [...this.players[opponent].modifiers],
        trumpCardCount: this.players[opponent].trumpCards.length,
        lives: this.players[opponent].lives,
        stayed: this.players[opponent].stayed,
        visibleTotal: this.getVisibleTotal(opponent),
        total: isRevealed ? this.getHandTotal(opponent) : null
      }
    };
  }

  getFullState() {
    return {
      phase: this.phase,
      roundNumber: this.roundNumber,
      targetValue: this.goForTarget ?? this.targetValue,
      baseTargetValue: this.targetValue,
      goForTarget: this.goForTarget,
      roundStakes: this.roundStakes,
      currentTurn: this.currentTurn,
      roundWinner: this.roundWinner,
      winner: this.winner,
      deck: [...this.deck],
      trumpDeck: [...this.trumpDeck],
      shop: this.shop.map(s => ({ ...s })),
      shopUsedThisTurn: this.shopUsedThisTurn,
      players: {
        host: { ...this.players.host, faceUp: [...this.players.host.faceUp], modifiers: [...this.players.host.modifiers], trumpCards: [...this.players.host.trumpCards] },
        guest: { ...this.players.guest, faceUp: [...this.players.guest.faceUp], modifiers: [...this.players.guest.modifiers], trumpCards: [...this.players.guest.trumpCards] }
      }
    };
  }

  loadFullState(state) {
    this.phase = state.phase;
    this.roundNumber = state.roundNumber;
    this.goForTarget = state.goForTarget ?? null;
    this.targetValue = state.baseTargetValue ?? state.targetValue ?? 21;
    this.roundStakes = state.roundStakes;
    this.currentTurn = state.currentTurn;
    this.roundWinner = state.roundWinner;
    this.winner = state.winner;
    this.deck = [...state.deck];
    this.trumpDeck = [...state.trumpDeck];
    this.shop = (state.shop || []).map(s => ({ ...s }));
    this.shopUsedThisTurn = state.shopUsedThisTurn;
    for (const role of ['host', 'guest']) {
      this.players[role] = {
        ...state.players[role],
        faceUp: [...state.players[role].faceUp],
        modifiers: [...state.players[role].modifiers],
        trumpCards: [...state.players[role].trumpCards]
      };
    }
  }
}
