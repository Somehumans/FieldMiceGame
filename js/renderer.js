import { TRUMP_CARD_TYPES } from './trumpCards.js';
import { mcCoinHtml, syncMcCoinAnimations } from './micecoin.js';

/** Row of coins for stakes / costs. */
export function stakesMcHtml(count) {
  const n = Math.max(0, count);
  if (n === 0) return `<span class="mc-stakes-row"><span class="mc-stakes-label">0 MC</span></span>`;
  const maxIcons = 8;
  const coins = Array.from({ length: Math.min(n, maxIcons) }, () => mcCoinHtml('mc-coin--sm')).join('');
  const overflow = n > maxIcons ? `<span class="mc-stakes-overflow">+${n - maxIcons}</span>` : '';
  return `<span class="mc-stakes-row">${coins}${overflow}<span class="mc-stakes-label">${n} MC</span></span>`;
}

/** Balance display with animated coin + amount. */
export function mcBalanceHtml(amount, { spin = true } = {}) {
  return `<span class="mc-balance">${mcCoinHtml('mc-coin--balance', spin)}<span class="mc-amount">${amount}</span><span class="mc-label">MC</span></span>`;
}

function shopCostMcHtml(cost) {
  return stakesMcHtml(cost);
}

export class Renderer {
  constructor() {
    this.el = {};
    this._fitRowsBound = () => this.fitCardRows();
  }

  init() {
    this.initCardViewer();
    this.el = {
      centerCol: document.getElementById('center-col'),
      opponentCards: document.getElementById('opponent-cards'),
      playerCards: document.getElementById('player-cards'),
      trumpHand: document.getElementById('trump-hand'),
      trumpHandBadge: document.getElementById('trump-hand-badge'),
      opponentTrumpStack: document.querySelector('.opp-trump-stack'),
      opponentTrumpFan: document.getElementById('opponent-trump-fan'),
      opponentLives: document.getElementById('opponent-lives'),
      playerLives: document.getElementById('player-lives'),
      opponentName: document.getElementById('opponent-name'),
      playerName: document.getElementById('player-name'),
      opponentScore: document.getElementById('opponent-score'),
      playerScore: document.getElementById('player-score'),
      roundStakesWrap: document.getElementById('round-stakes-wrap'),
      roundNumber: document.getElementById('round-number'),
      roundStakesHearts: document.getElementById('round-stakes-hearts'),
      turnBanner: document.getElementById('turn-banner'),
      btnDraw: document.getElementById('btn-draw'),
      btnKeep: document.getElementById('btn-keep'),
      shopBtn: document.getElementById('shop-btn'),
      deckCount: document.getElementById('deck-count'),
      pauseBtn: document.getElementById('pause-btn'),
      pauseOverlay: document.getElementById('pause-overlay'),
      overlay: document.getElementById('overlay'),
      overlayContent: document.getElementById('overlay-content'),
      trumpSelectOverlay: document.getElementById('trump-select-overlay'),
      trumpSelectCards: document.getElementById('trump-select-cards'),
      trumpCancelBtn: document.getElementById('trump-cancel-btn'),
      trumpUseOverlay: document.getElementById('trump-use-overlay'),
      trumpUseImg: document.getElementById('trump-use-img'),
      trumpUseName: document.getElementById('trump-use-name'),
      trumpUseDesc: document.getElementById('trump-use-desc'),
      trumpUseWarning: document.getElementById('trump-use-warning'),
      trumpUseBtn: document.getElementById('trump-use-btn'),
      trumpUseCancelBtn: document.getElementById('trump-use-cancel-btn'),
      targetSelectOverlay: document.getElementById('target-select-overlay'),
      targetSelectTitle: document.getElementById('target-select-title'),
      targetSelectCards: document.getElementById('target-select-cards'),
      targetCancelBtn: document.getElementById('target-cancel-btn'),
      shopOverlay: document.getElementById('shop-overlay'),
      shopOverlayCards: document.getElementById('shop-overlay-cards'),
      shopCloseBtn: document.getElementById('shop-close-btn'),
      gameContainer: document.getElementById('game-container'),
      gameToast: document.getElementById('game-toast'),
      roundEndCutscene: document.getElementById('round-end-cutscene'),
      roundEndBeatResults: document.getElementById('round-end-beat-results'),
      roundEndBeatRound: document.getElementById('round-end-beat-round'),
    };

    if (this.el.centerCol && typeof ResizeObserver !== 'undefined') {
      this._rowResizeObs?.disconnect();
      this._rowResizeObs = new ResizeObserver(this._fitRowsBound);
      this._rowResizeObs.observe(this.el.centerCol);
    }
    window.addEventListener('resize', this._fitRowsBound);
  }

  setDisplayNames(playerName, opponentName) {
    if (this.el.playerName) this.el.playerName.textContent = playerName || 'You';
    if (this.el.opponentName) this.el.opponentName.textContent = opponentName || 'Opponent';
  }

  render(state, isYourTurn, showShopIcon = false) {
    this.renderOpponentCards(state.opponent);
    this.renderPlayerCards(state.you);
    this.renderTrumpHand(state.you.trumpCards);
    this.renderOpponentTrumpFan(state.opponent.trumpCardCount);
    this.renderLives('opponent', state.opponent.lives);
    this.renderLives('player', state.you.lives);
    this.renderScore('opponent', state.opponent, state.targetValue);
    this.renderScore('player', state.you, state.targetValue);
    this.renderRoundStakes(state.roundNumber, state.roundStakes, state.phase);
    this.renderTurnBanner(isYourTurn, state.phase);
    this.updateButtons(isYourTurn, state);
    this.updateShopButton(isYourTurn, state, showShopIcon);
    this.el.deckCount.textContent = state.deckCount;
    this.fitCardRows();
    syncMcCoinAnimations(this.el.gameContainer || document);
  }

  /** Scale / overlap center hand rows so cards stay inside the table at any width. */
  fitCardRows() {
    requestAnimationFrame(() => {
      this.fitCardRow(this.el.opponentCards);
      this.fitCardRow(this.el.playerCards);
      this.fitTrumpHand();
    });
  }

  fitCardRow(rowEl) {
    if (!rowEl) return;

    rowEl.classList.remove('card-row--overlap');
    rowEl.style.removeProperty('--card-overlap');
    rowEl.style.removeProperty('--row-card-w');
    rowEl.style.removeProperty('--row-card-h');

    const cards = rowEl.querySelectorAll('.card');
    const n = cards.length;
    if (n === 0) return;

    const root = getComputedStyle(document.documentElement);
    const baseW = parseFloat(root.getPropertyValue('--play-card-w')) || 130;
    const baseH = parseFloat(root.getPropertyValue('--play-card-h')) || 182;
    const gap = parseFloat(getComputedStyle(rowEl).gap) || 12;
    const parent = this.el.centerCol || rowEl.parentElement;
    const avail = (parent?.clientWidth ?? 0) - 12;
    if (avail <= 0) return;

    const needed = n * baseW + Math.max(0, n - 1) * gap;
    if (needed <= avail) return;

    const minScale = 0.55;
    let scale = avail / needed;
    scale = Math.max(minScale, Math.min(1, scale));

    const w = Math.floor(baseW * scale);
    const h = Math.floor(baseH * scale);
    rowEl.style.setProperty('--row-card-w', `${w}px`);
    rowEl.style.setProperty('--row-card-h', `${h}px`);

    const scaledGap = gap * scale;
    const scaledNeeded = n * w + Math.max(0, n - 1) * scaledGap;
    if (scaledNeeded <= avail || n < 2) return;

    const overlap = Math.min(w * 0.52, (scaledNeeded - avail) / (n - 1) + 6);
    rowEl.style.setProperty('--card-overlap', `${Math.ceil(overlap)}px`);
    rowEl.classList.add('card-row--overlap');
  }

  fitTrumpHand() {
    const fan = this.el.trumpHand;
    const area = document.getElementById('trump-hand-area');
    if (!fan || !area) return;

    fan.style.removeProperty('--trump-hand-overlap');
    const cards = fan.querySelectorAll('.card');
    const n = cards.length;
    if (n < 2) return;

    const root = getComputedStyle(document.documentElement);
    const cardW = parseFloat(root.getPropertyValue('--trump-card-w')) || 82;
    const defaultOverlap = 24;
    const avail = area.clientWidth - 16;
    const needed = cardW + (n - 1) * (cardW - defaultOverlap);
    if (needed <= avail) return;

    const extra = needed - avail;
    const overlap = Math.min(cardW * 0.62, defaultOverlap + extra / (n - 1));
    fan.style.setProperty('--trump-hand-overlap', `${Math.ceil(overlap)}px`);
  }

  renderOpponentTrumpFan(count) {
    const label = document.querySelector('.opp-trump-label');
    const stack = this.el.opponentTrumpStack;
    const area = document.getElementById('opponent-fan-area');

    if (label) {
      label.classList.toggle('hidden', count === 0);
      label.textContent = count === 1 ? 'Enemy trump' : 'Enemy trumps';
    }
    stack?.classList.toggle('has-trumps', count > 0);
    area?.classList.toggle('has-trumps', count > 0);
    area?.setAttribute('aria-label', count > 0 ? `Opponent has ${count} trump card${count === 1 ? '' : 's'}` : '');

    const countEl = stack?.querySelector('.opp-trump-count');
    if (countEl) {
      countEl.textContent = String(count);
      countEl.classList.toggle('hidden', count === 0);
    }

    this.el.opponentTrumpFan.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const chip = document.createElement('div');
      chip.className = 'opp-trump-chip';
      chip.dataset.trumpFanIndex = i;
      chip.setAttribute('aria-hidden', 'true');
      chip.style.zIndex = String(count - i);
      const edge = document.createElement('span');
      edge.className = 'opp-trump-chip-edge';
      chip.appendChild(edge);
      this.el.opponentTrumpFan.appendChild(chip);
    }
  }

  // --- Card creation ---

  createNumberCard(value) {
    const card = document.createElement('div');
    card.className = 'card deal-anim';
    card.dataset.value = value;

    const img = document.createElement('img');
    img.src = `assets/cards/card-${value}.png`;
    img.alt = `${value}`;
    img.draggable = false;
    card.appendChild(img);

    const badge = document.createElement('div');
    badge.className = 'card-number-badge';
    badge.textContent = value;
    card.appendChild(badge);

    card.addEventListener('click', () => this.showCardViewer(`assets/cards/card-${value}.png`));

    return card;
  }

  createCardBack(options = {}) {
    const card = document.createElement('div');
    card.className = 'card card-back';
    const img = document.createElement('img');
    img.src = 'assets/cards/card-back.png';
    img.alt = 'Card back';
    img.draggable = false;
    card.appendChild(img);
    if (options.mysteryLabel) {
      card.classList.add('card-back--mystery');
      const badge = document.createElement('div');
      badge.className = 'card-mystery-badge';
      badge.textContent = options.mysteryLabel;
      card.appendChild(badge);
    }
    return card;
  }

  createModifierCard(mod) {
    const card = document.createElement('div');
    card.className = 'card modifier-card';
    const sign = mod > 0 ? '+' : '';
    const cls = mod > 0 ? 'positive' : 'negative';
    const val = document.createElement('span');
    val.className = `modifier-value ${cls}`;
    val.textContent = `${sign}${mod}`;
    card.appendChild(val);
    return card;
  }

  createTrumpInHand(trumpId, index) {
    const type = TRUMP_CARD_TYPES[trumpId];
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.trumpIndex = index;

    const img = document.createElement('img');
    img.src = 'assets/cards/trump-back.png';
    img.alt = type?.name || trumpId;
    img.draggable = false;
    card.appendChild(img);

    const label = document.createElement('div');
    label.className = 'trump-card-label';
    label.textContent = type?.name || trumpId;
    card.appendChild(label);

    if (type) {
      const tooltip = document.createElement('div');
      tooltip.className = 'trump-tooltip';
      tooltip.setAttribute('role', 'tooltip');
      tooltip.innerHTML = `<span class="trump-tooltip-name">${type.name}</span><span class="trump-tooltip-desc">${type.description}</span>`;
      card.appendChild(tooltip);
    }

    return card;
  }

  // --- Render sections ---

  renderOpponentCards(data) {
    this.el.opponentCards.innerHTML = '';

    if (data.faceDown !== null) {
      this.el.opponentCards.appendChild(this.createNumberCard(data.faceDown));
    } else {
      this.el.opponentCards.appendChild(this.createCardBack({ mysteryLabel: '?' }));
    }

    data.faceUp.forEach(value => {
      this.el.opponentCards.appendChild(this.createNumberCard(value));
    });

    (data.modifiers || []).forEach(mod => {
      this.el.opponentCards.appendChild(this.createModifierCard(mod));
    });
  }

  renderPlayerCards(data) {
    this.el.playerCards.innerHTML = '';

    const faceDown = this.createNumberCard(data.faceDown);
    faceDown.classList.add('card-hologram');
    faceDown.title = `Hidden card: ${data.faceDown}`;
    const qHint = document.createElement('span');
    qHint.className = 'card-hidden-qmark';
    qHint.textContent = '?';
    qHint.setAttribute('aria-hidden', 'true');
    faceDown.appendChild(qHint);
    this.el.playerCards.appendChild(faceDown);

    data.faceUp.forEach(value => {
      this.el.playerCards.appendChild(this.createNumberCard(value));
    });

    (data.modifiers || []).forEach(mod => {
      this.el.playerCards.appendChild(this.createModifierCard(mod));
    });
  }

  renderTrumpHand(trumpCards) {
    this.el.trumpHand.innerHTML = '';
    trumpCards.forEach((id, i) => {
      this.el.trumpHand.appendChild(this.createTrumpInHand(id, i));
    });

    const badge = this.el.trumpHandBadge;
    const area = document.getElementById('trump-hand-area');
    const n = trumpCards.length;
    if (badge) {
      badge.classList.toggle('hidden', n === 0);
      badge.textContent = n ? `🃏 Your trump${n === 1 ? '' : 's'} (${n})` : '';
    }
    area?.classList.toggle('has-trumps', n > 0);
  }

  // --- Micecoin balance ---

  renderLives(side, mc) {
    const container = side === 'opponent' ? this.el.opponentLives : this.el.playerLives;
    if (!container) return;
    container.innerHTML = mcBalanceHtml(mc);
    container.classList.add('mc-balance-wrap');
  }

  animateLivesLost(side) {
    const container = side === 'opponent' ? this.el.opponentLives : this.el.playerLives;
    container?.classList.add('mc-balance--losing');
    setTimeout(() => container?.classList.remove('mc-balance--losing'), 550);
  }

  // --- Score ---

  renderRoundStakes(roundNumber, roundStakes, phase) {
    const wrap = this.el.roundStakesWrap;
    if (!wrap) return;

    const show = roundNumber > 0 && !['idle'].includes(phase);
    wrap.classList.toggle('hidden', !show);
    if (!show) return;

    if (this.el.roundNumber) {
      this.el.roundNumber.textContent = String(roundNumber);
    }
    if (this.el.roundStakesHearts) {
      this.el.roundStakesHearts.innerHTML = stakesMcHtml(roundStakes ?? roundNumber);
    }
  }

  renderScore(side, data, target) {
    const el = side === 'opponent' ? this.el.opponentScore : this.el.playerScore;
    if (side === 'opponent') {
      el.textContent = data.total !== null ? `${data.total}/${target}` : `${data.visibleTotal}+?/${target}`;
    } else {
      el.textContent = `${data.total}/${target}`;
    }
    el.classList.remove('bust', 'perfect');
    const total = side === 'opponent' ? (data.total ?? data.visibleTotal) : data.total;
    if (total > target) el.classList.add('bust');
    else if (total === target) el.classList.add('perfect');
  }

  // --- Turn banner ---

  renderTurnBanner(isYourTurn, phase) {
    const el = this.el.turnBanner;
    if (phase !== 'playing') {
      el.classList.add('hidden-banner');
      return;
    }
    el.classList.remove('hidden-banner');
    if (isYourTurn) {
      el.textContent = 'Your Turn';
      el.className = 'turn-banner your-turn';
    } else {
      el.textContent = "Opponent's Turn";
      el.className = 'turn-banner opp-turn';
    }
  }

  showOpponentThinking() {
    const el = this.el.turnBanner;
    el.classList.remove('hidden-banner');
    el.textContent = 'Opponent thinking...';
    el.className = 'turn-banner opp-turn ai-thinking';
  }

  updateButtons(isYourTurn, state) {
    const canAct = isYourTurn && state.phase === 'playing';
    this.el.btnDraw.disabled = !canAct;
    this.el.btnKeep.disabled = !canAct;
  }

  // --- Shop icon (left column) ---

  updateShopButton(isYourTurn, state, showShopIcon) {
    const btn = this.el.shopBtn;
    if (!btn) return;

    const shop = state.shop || [];
    const hasShop = showShopIcon && shop.length > 0;
    const canOpen = hasShop && isYourTurn && state.phase === 'playing' && !state.shopUsedThisTurn;

    btn.classList.toggle('hidden', !hasShop);
    btn.disabled = !canOpen;
    btn.classList.toggle('shop-ready', canOpen);
    btn.setAttribute('aria-disabled', canOpen ? 'false' : 'true');
  }

  // --- Overlays ---

  showOverlay(html) {
    this.el.overlayContent.innerHTML = html;
    this.el.overlay.classList.remove('hidden');
  }

  hideOverlay() {
    this.el.overlay.classList.add('hidden');
  }

  _cutsceneWait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  hideRoundEndCutscene() {
    const root = this.el.roundEndCutscene;
    if (!root) return;
    root.classList.add('hidden');
    root.setAttribute('aria-hidden', 'true');
    root.classList.remove('round-end-cutscene--active', 'round-end-cutscene--wipe');
    root.style.cursor = '';
    this.el.roundEndBeatResults?.classList.remove('round-end-beat--visible', 'round-end-beat--exit');
    this.el.roundEndBeatRound?.classList.remove('round-end-beat--visible', 'round-end-beat--exit');
    this.el.roundEndBeatResults?.setAttribute('hidden', '');
    this.el.roundEndBeatRound?.setAttribute('hidden', '');
  }

  async playRoundEndCutscene(data, perspective) {
    const root = this.el.roundEndCutscene;
    const beatResults = this.el.roundEndBeatResults;
    const beatRound = this.el.roundEndBeatRound;
    if (!root || !beatResults || !beatRound) {
      this.showRoundResultFallback(data, perspective);
      return;
    }

    const isWinner = data.winner === perspective;
    const isDraw = data.winner === 'draw';
    const margin = Math.abs(data.yourTotal - data.oppTotal);

    let mood = 'lose';
    let outcome = 'Ouch!';
    let marginText = `You lost by ${margin}`;
    if (isDraw) {
      mood = 'draw';
      outcome = 'Dead heat!';
      marginText = 'A perfect tie — no MC exchanged';
    } else if (isWinner) {
      mood = 'win';
      outcome = "You got 'em!";
      marginText = `You won by ${margin}`;
    }

    const outcomeEl = document.getElementById('round-end-outcome');
    const marginEl = document.getElementById('round-end-margin');
    const yourTotalEl = document.getElementById('round-end-your-total');
    const oppTotalEl = document.getElementById('round-end-opp-total');
    const targetEl = document.getElementById('round-end-target');
    const mcEl = document.getElementById('round-end-hearts');
    const stakesEl = document.getElementById('round-end-stakes');
    const roundNumEl = document.getElementById('round-end-round-num');
    const mcAmount = data.mcTransferred ?? data.stakes ?? 0;

    if (outcomeEl) {
      outcomeEl.textContent = outcome;
      outcomeEl.className = `round-end-outcome round-end-outcome--${mood}`;
    }
    if (marginEl) marginEl.textContent = marginText;
    if (yourTotalEl) yourTotalEl.textContent = String(data.yourTotal);
    if (oppTotalEl) oppTotalEl.textContent = String(data.oppTotal);
    if (targetEl) targetEl.textContent = `Target was ${data.target}`;
    if (mcEl) {
      mcEl.innerHTML = `
        <div class="round-end-hearts-row">
          <span class="round-end-hearts-label">Your MC</span>
          ${mcBalanceHtml(data.yourLives, { spin: false })}
        </div>
        <div class="round-end-hearts-row">
          <span class="round-end-hearts-label">Their MC</span>
          ${mcBalanceHtml(data.oppLives, { spin: false })}
        </div>`;
    }
    if (stakesEl) {
      const paid = isDraw
        ? 'No bet paid'
        : (isWinner
          ? `You win +${mcAmount} MC`
          : `You pay ${mcAmount} MC`);
      stakesEl.innerHTML = `${paid} · Next bet: ${stakesMcHtml(data.roundNumber + 1)}`;
    }
    if (roundNumEl) roundNumEl.textContent = String(data.roundNumber + 1);

    root.classList.remove('hidden');
    root.setAttribute('aria-hidden', 'false');
    root.classList.add('round-end-cutscene--active');
    root.dataset.mood = mood;

    beatRound.setAttribute('hidden', '');
    beatResults.removeAttribute('hidden');

    let skipped = false;
    const onTap = (e) => {
      if (e.target.closest('#next-round-btn')) return;
      skipped = true;
    };
    beatResults.addEventListener('click', onTap, { once: true });

    await this._cutsceneWait(80);
    beatResults.classList.add('round-end-beat--visible');

    const resultsDuration = 2600;
    const start = Date.now();
    while (Date.now() - start < resultsDuration && !skipped) {
      await this._cutsceneWait(80);
    }
    beatResults.removeEventListener('click', onTap);

    beatResults.classList.add('round-end-beat--exit');
    root.classList.add('round-end-cutscene--wipe');
    await this._cutsceneWait(420);
    beatResults.classList.remove('round-end-beat--visible', 'round-end-beat--exit');
    beatResults.setAttribute('hidden', '');
    root.classList.remove('round-end-cutscene--wipe');

    beatRound.removeAttribute('hidden');
    root.classList.add('round-end-cutscene--wipe');
    await this._cutsceneWait(60);
    beatRound.classList.add('round-end-beat--visible');
    await this._cutsceneWait(500);
    root.classList.remove('round-end-cutscene--wipe');
    root.style.cursor = 'default';
  }

  showRoundResultFallback(data, perspective) {
    const isWinner = data.winner === perspective;
    const isDraw = data.winner === 'draw';
    const margin = Math.abs(data.yourTotal - data.oppTotal);
    this.showOverlay(`
      <div class="round-result">
        <h2>${isDraw ? 'Draw' : isWinner ? 'You win!' : 'You lose'}</h2>
        <p>${isDraw ? 'Tie game' : isWinner ? `Won by ${margin}` : `Lost by ${margin}`}</p>
        <button class="overlay-btn" id="next-round-btn">Next Round</button>
      </div>
    `);
  }

  showRoundResult(data, perspective) {
    return this.playRoundEndCutscene(data, perspective);
  }

  showGameOver(winner, perspective) {
    const isWinner = winner === perspective;
    this.showOverlay(`
      <div class="result-title ${isWinner ? 'win' : 'lose'}">${isWinner ? 'Victory!' : 'Defeat'}</div>
      <p>${isWinner ? 'You won the game!' : 'Better luck next time.'}</p>
      <button class="overlay-btn" id="play-again-btn">Play Again</button>
      <button class="overlay-btn" id="back-to-lobby-btn" style="margin-left:8px;opacity:0.7">Lobby</button>
    `);
  }

  showShopOverlay(shop, onBuy, onSkip, playerLives = 99, roundStakes = 1) {
    const subtitle = document.querySelector('.shop-subtitle');
    if (subtitle) {
      subtitle.innerHTML =
        `Spend MC to buy trumps — <strong>+</strong> and <strong>++</strong> cards are shop-only. This round's bet is ${stakesMcHtml(roundStakes)}`;
    }

    const container = this.el.shopOverlayCards;
    container.innerHTML = '';
    shop.forEach((item, i) => {
      const el = document.createElement('div');
      const cantAfford = !item.sold && playerLives <= item.cost;
      const tier = item.shopTier || 'normal';
      el.className = `shop-item shop-item--${tier} ${item.sold ? 'sold' : ''} ${cantAfford ? 'unaffordable' : ''}`;
      const tierBadge = tier === 'plusplus'
        ? '<span class="shop-item-tier shop-item-tier--pp">++ rare</span>'
        : tier === 'plus'
          ? '<span class="shop-item-tier shop-item-tier--plus">+ shop</span>'
          : '';
      el.innerHTML = `
        <div class="shop-item-head">
          <div class="shop-item-name">${item.name}</div>
          ${tierBadge}
        </div>
        <div class="shop-item-desc">${item.description}</div>
        <div class="shop-item-cost">${shopCostMcHtml(item.cost)}</div>
      `;
      if (!item.sold && !cantAfford) el.addEventListener('click', () => onBuy(i));
      container.appendChild(el);
    });
    this.el.shopCloseBtn.onclick = onSkip;
    this.el.shopOverlay.classList.remove('hidden');
    syncMcCoinAnimations(this.el.shopOverlay);
  }

  hideShopOverlay() {
    this.el.shopOverlay.classList.add('hidden');
  }

  showGameToast(message, durationMs = 2800) {
    this.showGameToastHtml(this.escapeHtml(message), durationMs);
  }

  showGameToastHtml(html, durationMs = 2800) {
    const toast = this.el.gameToast;
    if (!toast) return;

    clearTimeout(this._toastTimer);
    toast.innerHTML = html;
    toast.classList.remove('hidden');
    toast.classList.add('game-toast--visible');
    syncMcCoinAnimations(toast);

    this._toastTimer = setTimeout(() => {
      toast.classList.remove('game-toast--visible');
      toast.classList.add('hidden');
    }, durationMs);
  }

  escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  showTrumpSelect(trumpCards, onSelect, onCancel) {
    this.el.trumpSelectCards.innerHTML = '';
    trumpCards.forEach((id, i) => {
      const type = TRUMP_CARD_TYPES[id];
      if (!type) return;
      const el = document.createElement('div');
      el.className = 'trump-select-option';
      el.innerHTML = `
        <div class="trump-select-name">${type.name}</div>
        <div class="trump-select-desc">${type.description}</div>
      `;
      el.addEventListener('click', () => onSelect(i, id));
      this.el.trumpSelectCards.appendChild(el);
    });
    this.el.trumpCancelBtn.onclick = onCancel;
    this.el.trumpSelectOverlay.classList.remove('hidden');
  }

  hideTrumpSelect() { this.el.trumpSelectOverlay.classList.add('hidden'); }

  showTrumpUseConfirm(trumpId, { onUse, onCancel, canUse = true, unusableReason = '' }) {
    const type = TRUMP_CARD_TYPES[trumpId];
    if (!type || !this.el.trumpUseOverlay) return;

    this.el.trumpUseName.textContent = type.name;
    this.el.trumpUseDesc.textContent = type.description;
    if (this.el.trumpUseImg) {
      this.el.trumpUseImg.src = 'assets/cards/trump-back.png';
      this.el.trumpUseImg.alt = type.name;
    }

    const warn = this.el.trumpUseWarning;
    if (warn) {
      warn.textContent = unusableReason;
      warn.classList.toggle('hidden', canUse || !unusableReason);
    }

    if (this.el.trumpUseBtn) {
      this.el.trumpUseBtn.disabled = !canUse;
      this.el.trumpUseBtn.onclick = () => {
        if (canUse) onUse();
      };
    }
    if (this.el.trumpUseCancelBtn) {
      this.el.trumpUseCancelBtn.onclick = onCancel;
    }

    this.el.trumpUseOverlay.classList.remove('hidden');
  }

  hideTrumpUseConfirm() {
    this.el.trumpUseOverlay?.classList.add('hidden');
    if (this.el.trumpUseBtn) this.el.trumpUseBtn.onclick = null;
    if (this.el.trumpUseCancelBtn) this.el.trumpUseCancelBtn.onclick = null;
  }

  showTargetSelect(title, cards, onSelect, onCancel) {
    this.el.targetSelectTitle.textContent = title;
    this.el.targetSelectCards.innerHTML = '';
    cards.forEach((value, i) => {
      const cardEl = this.createNumberCard(value);
      cardEl.classList.add('target-card-option');
      cardEl.addEventListener('click', () => onSelect(i));
      this.el.targetSelectCards.appendChild(cardEl);
    });
    this.el.targetCancelBtn.onclick = onCancel;
    this.el.targetSelectOverlay.classList.remove('hidden');
  }

  hideTargetSelect() { this.el.targetSelectOverlay.classList.add('hidden'); }

  initCardViewer() {
    this.cardViewer = document.getElementById('card-viewer');
    this.cardViewerImg = document.getElementById('card-viewer-img');
    const close = document.getElementById('card-viewer-close');

    this.cardViewer.addEventListener('click', () => this.hideCardViewer());
    close.addEventListener('click', () => this.hideCardViewer());
  }

  showCardViewer(src) {
    if (!this.cardViewer) this.initCardViewer();
    this.cardViewerImg.src = src;
    this.cardViewer.classList.add('visible');
  }

  hideCardViewer() {
    this.cardViewer.classList.remove('visible');
  }

  showTrumpPlay(trumpId, side, handIndex = 0) {
    const type = TRUMP_CARD_TYPES[trumpId];
    if (!type) return Promise.resolve();

    const overlay = document.getElementById('trump-play-overlay');
    const wrap = overlay?.querySelector('.trump-play-card-wrap');
    const nameEl = overlay?.querySelector('.trump-play-name');
    const descEl = overlay?.querySelector('.trump-play-desc');
    const imgEl = overlay?.querySelector('.trump-play-img');
    if (!overlay || !wrap || !nameEl || !descEl) return Promise.resolve();

    nameEl.textContent = type.name;
    descEl.textContent = type.description;
    if (imgEl) {
      imgEl.src = 'assets/cards/trump-back.png';
      imgEl.alt = type.name;
    }

    const sourceEl = this.getTrumpHandCardElement(side, handIndex);
    const from = this.getTrumpPlayOrigin(sourceEl, side);

    wrap.style.setProperty('--from-x', `${from.x}px`);
    wrap.style.setProperty('--from-y', `${from.y}px`);
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');

    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => overlay.classList.add('visible'));
      });
      setTimeout(() => {
        overlay.classList.remove('visible');
        setTimeout(() => {
          overlay.classList.add('hidden');
          overlay.setAttribute('aria-hidden', 'true');
          wrap.style.removeProperty('--from-x');
          wrap.style.removeProperty('--from-y');
          resolve();
        }, 280);
      }, 2100);
    });
  }

  getTrumpHandCardElement(side, handIndex) {
    if (side === 'player') {
      return this.el.trumpHand?.querySelector(`[data-trump-index="${handIndex}"]`);
    }
    const fan = this.el.opponentTrumpFan;
    if (!fan) return null;
    return fan.querySelector(`[data-trump-fan-index="${handIndex}"]`)
      || fan.children[handIndex]
      || fan.lastElementChild;
  }

  getTrumpPlayOrigin(sourceEl, side) {
    if (sourceEl) {
      const r = sourceEl.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    const area = side === 'player'
      ? document.getElementById('trump-hand-area')
      : document.getElementById('opponent-fan-area');
    if (area) {
      const r = area.getBoundingClientRect();
      return {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
      };
    }
    return {
      x: window.innerWidth / 2,
      y: side === 'player' ? window.innerHeight * 0.88 : window.innerHeight * 0.12,
    };
  }

  screenShake() {
    this.el.gameContainer.classList.add('screen-shake');
    setTimeout(() => this.el.gameContainer.classList.remove('screen-shake'), 400);
  }

  damageFlash(side) {
    const el = side === 'opponent' ?
      document.querySelector('.opponent-profile') :
      document.querySelector('.player-profile');
    if (el) {
      el.classList.add('damage-flash');
      setTimeout(() => el.classList.remove('damage-flash'), 500);
    }
  }
}
