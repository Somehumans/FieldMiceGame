import { TRUMP_CARD_TYPES } from './trumpCards.js';

import { STARTING_LIVES } from './engine.js';

const LIFE_HEART_SVG = `<svg class="life-heart-svg" viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;

/** Row of hearts for stakes / costs (filled only). */
export function stakesHeartsHtml(count) {
  const n = Math.max(0, Math.min(STARTING_LIVES, count));
  const hearts = Array.from({ length: n }, () =>
    `<span class="hearts-inline hearts-inline--stakes">${LIFE_HEART_SVG}</span>`
  ).join('');
  return `<span class="hearts-inline-row">${hearts}</span>`;
}

/** Row of hearts showing current lives (filled + empty slots). */
export function livesHeartsHtml(current, max = STARTING_LIVES) {
  const hearts = Array.from({ length: max }, (_, i) => {
    const cls = i < current ? 'hearts-inline--full' : 'hearts-inline--empty';
    return `<span class="hearts-inline ${cls}">${LIFE_HEART_SVG}</span>`;
  }).join('');
  return `<span class="hearts-inline-row">${hearts}</span>`;
}

/** Shop prices are paid in lives (hearts), not generic dots. */
function shopCostHeartsHtml(cost) {
  const n = Math.max(0, Math.min(STARTING_LIVES, cost));
  const hearts = Array.from({ length: n }, () =>
    `<span class="shop-cost-heart">${LIFE_HEART_SVG}</span>`
  ).join('');
  return `<span class="shop-cost-hearts">${hearts}</span>`;
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
      opponentTrumpFan: document.getElementById('opponent-trump-fan'),
      opponentLives: document.getElementById('opponent-lives'),
      playerLives: document.getElementById('player-lives'),
      opponentName: document.getElementById('opponent-name'),
      playerName: document.getElementById('player-name'),
      opponentScore: document.getElementById('opponent-score'),
      playerScore: document.getElementById('player-score'),
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
      gameToast: document.getElementById('game-toast')
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
    const maxLives = state.maxLives ?? STARTING_LIVES;
    this.renderLives('opponent', state.opponent.lives, maxLives);
    this.renderLives('player', state.you.lives, maxLives);
    this.renderScore('opponent', state.opponent, state.targetValue);
    this.renderScore('player', state.you, state.targetValue);
    this.renderTurnBanner(isYourTurn, state.phase);
    this.updateButtons(isYourTurn, state);
    this.updateShopButton(isYourTurn, state, showShopIcon);
    this.el.deckCount.textContent = state.deckCount;
    this.fitCardRows();
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
    if (label) label.classList.toggle('hidden', count === 0);

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
  }

  // --- Lives ---

  renderLives(side, lives, maxLives = STARTING_LIVES) {
    const container = side === 'opponent' ? this.el.opponentLives : this.el.playerLives;
    if (container.children.length !== maxLives) {
      container.innerHTML = '';
      for (let i = 0; i < maxLives; i++) {
        const heart = document.createElement('div');
        heart.className = 'life-heart';
        heart.innerHTML = LIFE_HEART_SVG;
        container.appendChild(heart);
      }
    }
    for (let i = 0; i < maxLives; i++) {
      container.children[i].className = i < lives ? 'life-heart active' : 'life-heart lost';
    }
  }

  animateLivesLost(side, fromLives, toLives) {
    const container = side === 'opponent' ? this.el.opponentLives : this.el.playerLives;
    for (let i = toLives; i < fromLives; i++) {
      if (container.children[i]) container.children[i].className = 'life-heart losing';
    }
  }

  // --- Score ---

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

  showRoundResult(data, perspective) {
    const isWinner = data.winner === perspective;
    const isDraw = data.winner === 'draw';
    const maxLives = data.maxLives ?? STARTING_LIVES;

    let titleClass, titleText, emoji, tagline;
    if (isDraw) {
      titleClass = 'draw';
      titleText = 'Dead heat!';
      emoji = '🤝';
      tagline = 'Nobody loses hearts this round. Phew!';
    } else if (isWinner) {
      titleClass = 'win';
      titleText = 'You got \'em!';
      emoji = '🎉';
      tagline = `They pay the bet — ${stakesHeartsHtml(data.livesLost)}`;
    } else {
      titleClass = 'lose';
      titleText = 'Ouch!';
      emoji = '💔';
      tagline = `You paid the bet — ${stakesHeartsHtml(data.livesLost)}`;
    }

    const betLine = `Round ${data.roundNumber} bet: ${stakesHeartsHtml(data.stakes)}`;
    const nextBet = stakesHeartsHtml(data.roundNumber + 1);

    this.showOverlay(`
      <div class="round-result round-result--${titleClass}">
        <div class="result-emoji" aria-hidden="true">${emoji}</div>
        <h2 class="result-title ${titleClass}">${titleText}</h2>
        <p class="result-tagline">${tagline}</p>
        <div class="result-scores">
          <span class="result-score-you">You <strong>${data.yourTotal}</strong></span>
          <span class="result-score-vs">vs</span>
          <span class="result-score-opp">Them <strong>${data.oppTotal}</strong></span>
        </div>
        <p class="result-target">Aim was <strong>${data.target}</strong></p>
        <div class="result-hearts-panel">
          <div class="result-hearts-block">
            <span class="result-hearts-label">Your hearts</span>
            ${livesHeartsHtml(data.yourLives, maxLives)}
          </div>
          <div class="result-hearts-block">
            <span class="result-hearts-label">Their hearts</span>
            ${livesHeartsHtml(data.oppLives, maxLives)}
          </div>
        </div>
        <p class="result-bet-note">${betLine}</p>
        <p class="result-next-stakes">Next round bet: ${nextBet}</p>
        <button class="overlay-btn" id="next-round-btn">Next Round</button>
      </div>
    `);
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
        `Spend hearts to buy trumps — this round's bet is ${stakesHeartsHtml(roundStakes)}`;
    }

    const container = this.el.shopOverlayCards;
    container.innerHTML = '';
    shop.forEach((item, i) => {
      const el = document.createElement('div');
      const cantAfford = !item.sold && playerLives <= item.cost;
      el.className = `shop-item ${item.sold ? 'sold' : ''} ${cantAfford ? 'unaffordable' : ''}`;
      el.innerHTML = `
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-desc">${item.description}</div>
        <div class="shop-item-cost">${shopCostHeartsHtml(item.cost)}</div>
      `;
      if (!item.sold && !cantAfford) el.addEventListener('click', () => onBuy(i));
      container.appendChild(el);
    });
    this.el.shopCloseBtn.onclick = onSkip;
    this.el.shopOverlay.classList.remove('hidden');
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
