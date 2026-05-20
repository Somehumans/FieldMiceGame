function opponentOf(player) {
  return player === 'host' ? 'guest' : 'host';
}

function drawTrumpToHand(engine, player) {
  const id = engine.drawTrumpCard();
  if (id) engine.players[player].trumpCards.push(id);
  return id;
}

function returnLastFaceUp(engine, player) {
  const cards = engine.players[player].faceUp;
  if (!cards.length) return null;
  const c = cards.pop();
  engine.deck.push(c);
  engine.shuffleDeck();
  return c;
}

function drawSpecificCard(engine, player, value) {
  const idx = engine.deck.indexOf(value);
  if (idx === -1) return null;
  engine.deck.splice(idx, 1);
  engine.players[player].faceUp.push(value);
  return value;
}

function drawBestCard(engine, player) {
  const target = engine.goForTarget ?? engine.targetValue;
  const base = engine.getHandTotal(player);
  let chosenIdx = -1;
  let bestTotal = -1;
  for (let i = 0; i < engine.deck.length; i++) {
    const c = engine.deck[i];
    const t = base + c;
    if (t <= target && t > bestTotal) {
      bestTotal = t;
      chosenIdx = i;
    }
  }
  if (chosenIdx === -1 && engine.deck.length > 0) {
    chosenIdx = 0;
    for (let i = 1; i < engine.deck.length; i++) {
      if (engine.deck[i] < engine.deck[chosenIdx]) chosenIdx = i;
    }
  }
  if (chosenIdx === -1) return null;
  const card = engine.deck.splice(chosenIdx, 1)[0];
  engine.players[player].faceUp.push(card);
  return card;
}

function trumpSwitch(engine, player, discard, draw) {
  const hand = engine.players[player].trumpCards;
  for (let d = 0; d < discard && hand.length > 0; d++) {
    hand.splice(Math.floor(Math.random() * hand.length), 1);
  }
  const gained = [];
  for (let i = 0; i < draw; i++) {
    const id = engine.drawTrumpCard();
    if (id) {
      hand.push(id);
      gained.push(id);
    }
  }
  return gained;
}

export const TRUMP_CARD_TYPES = {
  plus_1: {
    id: 'plus_1',
    name: '+1',
    description: "Opponent's total +1",
    category: 'modifier',
    needsTarget: false,
    apply(engine, player) {
      const opponent = player === 'host' ? 'guest' : 'host';
      engine.players[opponent].modifiers.push(1);
      return { message: "+1 to opponent" };
    }
  },

  plus_2: {
    id: 'plus_2',
    name: '+2',
    description: "Opponent's total +2",
    category: 'modifier',
    needsTarget: false,
    apply(engine, player) {
      const opponent = player === 'host' ? 'guest' : 'host';
      engine.players[opponent].modifiers.push(2);
      return { message: "+2 to opponent" };
    }
  },

  plus_3: {
    id: 'plus_3',
    name: '+3',
    description: "Opponent's total +3",
    category: 'modifier',
    needsTarget: false,
    apply(engine, player) {
      const opponent = player === 'host' ? 'guest' : 'host';
      engine.players[opponent].modifiers.push(3);
      return { message: "+3 to opponent" };
    }
  },

  minus_1: {
    id: 'minus_1',
    name: '-1',
    description: 'Your total -1',
    category: 'modifier',
    needsTarget: false,
    apply(engine, player) {
      engine.players[player].modifiers.push(-1);
      return { message: "-1 from your total" };
    }
  },

  minus_2: {
    id: 'minus_2',
    name: '-2',
    description: 'Your total -2',
    category: 'modifier',
    needsTarget: false,
    apply(engine, player) {
      engine.players[player].modifiers.push(-2);
      return { message: "-2 from your total" };
    }
  },

  minus_3: {
    id: 'minus_3',
    name: '-3',
    description: 'Your total -3',
    category: 'modifier',
    needsTarget: false,
    apply(engine, player) {
      engine.players[player].modifiers.push(-3);
      return { message: "-3 from your total" };
    }
  },

  one_up: {
    id: 'one_up',
    name: 'One-Up',
    description: "Opponent loses +1 extra MC if they lose this round. Draw 1 trump card.",
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      engine.players[opponentOf(player)].stakeBonus += 1;
      const drew = drawTrumpToHand(engine, player);
      return { message: drew ? 'One-Up! Drew a trump.' : 'One-Up! (Trump deck empty)' };
    }
  },

  two_up: {
    id: 'two_up',
    name: 'Two-Up',
    description: "Opponent loses +2 extra MC if they lose this round. Draw 1 trump card.",
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      engine.players[opponentOf(player)].stakeBonus += 2;
      const drew = drawTrumpToHand(engine, player);
      return { message: drew ? 'Two-Up! Drew a trump.' : 'Two-Up! (Trump deck empty)' };
    }
  },

  two_up_plus: {
    id: 'two_up_plus',
    name: 'Two-Up+',
    description: "Return opponent's last face-up card to the deck. Opponent loses +2 extra MC if they lose this round.",
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      const opp = opponentOf(player);
      const returned = returnLastFaceUp(engine, opp);
      engine.players[opp].stakeBonus += 2;
      return {
        message: returned
          ? `Two-Up+! Returned opponent's ${returned}.`
          : 'Two-Up+! (Opponent had no face-up cards)'
      };
    }
  },

  draw_2: {
    id: 'draw_2',
    name: '2 Card',
    description: 'Draw the 2 card from the deck if it is still available.',
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      const c = drawSpecificCard(engine, player, 2);
      return { message: c ? 'Drew the 2!' : '2 is not in the deck.' };
    }
  },

  draw_3: {
    id: 'draw_3',
    name: '3 Card',
    description: 'Draw the 3 card from the deck if it is still available.',
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      const c = drawSpecificCard(engine, player, 3);
      return { message: c ? 'Drew the 3!' : '3 is not in the deck.' };
    }
  },

  draw_4: {
    id: 'draw_4',
    name: '4 Card',
    description: 'Draw the 4 card from the deck if it is still available.',
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      const c = drawSpecificCard(engine, player, 4);
      return { message: c ? 'Drew the 4!' : '4 is not in the deck.' };
    }
  },

  draw_5: {
    id: 'draw_5',
    name: '5 Card',
    description: 'Draw the 5 card from the deck if it is still available.',
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      const c = drawSpecificCard(engine, player, 5);
      return { message: c ? 'Drew the 5!' : '5 is not in the deck.' };
    }
  },

  draw_6: {
    id: 'draw_6',
    name: '6 Card',
    description: 'Draw the 6 card from the deck if it is still available.',
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      const c = drawSpecificCard(engine, player, 6);
      return { message: c ? 'Drew the 6!' : '6 is not in the deck.' };
    }
  },

  draw_7: {
    id: 'draw_7',
    name: '7 Card',
    description: 'Draw the 7 card from the deck if it is still available.',
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      const c = drawSpecificCard(engine, player, 7);
      return { message: c ? 'Drew the 7!' : '7 is not in the deck.' };
    }
  },

  remove: {
    id: 'remove',
    name: 'Remove',
    description: "Return opponent's last face-up card to the deck.",
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      const c = returnLastFaceUp(engine, opponentOf(player));
      return { message: c ? `Removed opponent's ${c}!` : 'Nothing to remove.' };
    }
  },

  return_last: {
    id: 'return_last',
    name: 'Return',
    description: 'Return your last face-up card to the deck.',
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      const c = returnLastFaceUp(engine, player);
      return { message: c ? `Returned your ${c}.` : 'Nothing to return.' };
    }
  },

  exchange: {
    id: 'exchange',
    name: 'Exchange',
    description: 'Swap the last face-up card you and your opponent each drew. (Face-down cards cannot be swapped.)',
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      const opp = opponentOf(player);
      const mine = engine.players[player].faceUp;
      const theirs = engine.players[opp].faceUp;
      if (!mine.length || !theirs.length) {
        return { success: false, error: 'Both players need a face-up card' };
      }
      const mi = mine.length - 1;
      const oi = theirs.length - 1;
      const myCard = mine[mi];
      const oppCard = theirs[oi];
      mine[mi] = oppCard;
      theirs[oi] = myCard;
      return { message: `Swapped last cards (${myCard} ↔ ${oppCard})!` };
    }
  },

  trump_switch: {
    id: 'trump_switch',
    name: 'Trump Switch',
    description: 'Discard 2 of your trumps at random, then draw 3 trumps. Works even if you have fewer than 2 other trumps.',
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      const gained = trumpSwitch(engine, player, 2, 3);
      return { message: `Trump Switch! Drew ${gained.length} new trump${gained.length === 1 ? '' : 's'}.` };
    }
  },

  trump_switch_plus: {
    id: 'trump_switch_plus',
    name: 'Trump Switch+',
    description: 'Discard 1 of your trumps at random, then draw 4 trumps. Works even if you have no other trumps.',
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      const gained = trumpSwitch(engine, player, 1, 4);
      return { message: `Trump Switch+! Drew ${gained.length} new trump${gained.length === 1 ? '' : 's'}.` };
    }
  },

  shield: {
    id: 'shield',
    name: 'Shield',
    description: 'You lose 1 fewer MC if you lose this round.',
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      engine.players[player].stakeReduction += 1;
      return { message: 'Shield up! (−1 MC lost if you lose)' };
    }
  },

  shield_plus: {
    id: 'shield_plus',
    name: 'Shield+',
    description: 'You lose 2 fewer MC if you lose this round.',
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      engine.players[player].stakeReduction += 2;
      return { message: 'Shield+! (−2 MC lost if you lose)' };
    }
  },

  destroy: {
    id: 'destroy',
    name: 'Destroy',
    description: "Remove one random trump card from your opponent's hand.",
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      const hand = engine.players[opponentOf(player)].trumpCards;
      if (!hand.length) return { message: 'Destroy — opponent had no trumps.' };
      const i = Math.floor(Math.random() * hand.length);
      const removed = hand.splice(i, 1)[0];
      const name = TRUMP_CARD_TYPES[removed]?.name || removed;
      return { message: `Destroyed opponent's ${name}!` };
    }
  },

  destroy_plus: {
    id: 'destroy_plus',
    name: 'Destroy+',
    description: "Remove all trump cards from your opponent's hand.",
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      const n = engine.players[opponentOf(player)].trumpCards.length;
      engine.players[opponentOf(player)].trumpCards = [];
      return { message: n ? `Destroy+! Cleared ${n} opponent trump${n === 1 ? '' : 's'}.` : 'Destroy+ — none to clear.' };
    }
  },

  destroy_plus_plus: {
    id: 'destroy_plus_plus',
    name: 'Destroy++',
    description: "Clear opponent's trumps and block them from playing trumps this round.",
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      const opp = opponentOf(player);
      const n = engine.players[opp].trumpCards.length;
      engine.players[opp].trumpCards = [];
      engine.players[opp].trumpBlocked = true;
      return {
        message: n
          ? `Destroy++! Cleared ${n} trump${n === 1 ? '' : 's'} and blocked new plays.`
          : 'Destroy++! Opponent cannot play trumps this round.'
      };
    }
  },

  perfect_draw: {
    id: 'perfect_draw',
    name: 'Perfect Draw',
    description: 'Draw the best possible card from the deck for your hand.',
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      const c = drawBestCard(engine, player);
      return { message: c ? `Perfect Draw — drew ${c}!` : 'Deck is empty.' };
    }
  },

  perfect_draw_plus: {
    id: 'perfect_draw_plus',
    name: 'Perfect Draw+',
    description: 'Draw the best possible card. Opponent loses +5 extra MC if they lose this round.',
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      const c = drawBestCard(engine, player);
      engine.players[opponentOf(player)].stakeBonus += 5;
      return {
        message: c
          ? `Perfect Draw+ — drew ${c}! Opponent at +5 stakes.`
          : 'Perfect Draw+ — deck empty, but stakes raised.'
      };
    }
  },

  ultimate_draw: {
    id: 'ultimate_draw',
    name: 'Ultimate Draw',
    description: 'Draw the best possible card, then draw 2 trump cards.',
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      const c = drawBestCard(engine, player);
      const t1 = drawTrumpToHand(engine, player);
      const t2 = drawTrumpToHand(engine, player);
      const trumps = [t1, t2].filter(Boolean).length;
      return {
        message: c
          ? `Ultimate Draw — ${c} + ${trumps} trump${trumps === 1 ? '' : 's'}.`
          : `Ultimate Draw — deck empty, drew ${trumps} trump${trumps === 1 ? '' : 's'}.`
      };
    }
  },

  go_for_17: {
    id: 'go_for_17',
    name: 'Go for 17',
    description: 'Closest to 17 wins this round (replaces other Go For effects).',
    category: 'action',
    needsTarget: false,
    apply(engine) {
      engine.goForTarget = 17;
      return { message: 'Go for 17! Closest to 17 wins.' };
    }
  },

  go_for_24: {
    id: 'go_for_24',
    name: 'Go for 24',
    description: 'Closest to 24 wins this round (replaces other Go For effects).',
    category: 'action',
    needsTarget: false,
    apply(engine) {
      engine.goForTarget = 24;
      return { message: 'Go for 24! Closest to 24 wins.' };
    }
  },

  go_for_27: {
    id: 'go_for_27',
    name: 'Go for 27',
    description: 'Closest to 27 wins this round (replaces other Go For effects).',
    category: 'action',
    needsTarget: false,
    apply(engine) {
      engine.goForTarget = 27;
      return { message: 'Go for 27! Closest to 27 wins.' };
    }
  },

  harvest: {
    id: 'harvest',
    name: 'Harvest',
    description: 'After each trump you play this round, draw 1 more trump card.',
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      engine.players[player].harvest = true;
      return { message: 'Harvest! Extra trump draw after each trump play.' };
    }
  },

  love_your_enemy: {
    id: 'love_your_enemy',
    name: 'Love Your Enemy',
    description: 'Opponent draws the best possible card for them from the deck.',
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      const c = drawBestCard(engine, opponentOf(player));
      return {
        message: c
          ? `Love Your Enemy — opponent drew ${c}!`
          : 'Love Your Enemy — deck empty.'
      };
    }
  },

  body_bag: {
    id: 'body_bag',
    name: 'Body Bag',
    description: "Destroy one of opponent's face-up cards",
    category: 'action',
    needsTarget: true,
    targetType: 'opponent_face_up',
    apply(engine, player, targetIndex) {
      const opponent = player === 'host' ? 'guest' : 'host';
      const cards = engine.players[opponent].faceUp;
      if (targetIndex < 0 || targetIndex >= cards.length) {
        return { success: false, error: 'Invalid target' };
      }
      const removed = cards.splice(targetIndex, 1)[0];
      return { message: `Destroyed opponent's ${removed}` };
    }
  },

  steal: {
    id: 'steal',
    name: 'Steal',
    description: "Take one of opponent's face-up cards",
    category: 'action',
    needsTarget: true,
    targetType: 'opponent_face_up',
    apply(engine, player, targetIndex) {
      const opponent = player === 'host' ? 'guest' : 'host';
      const cards = engine.players[opponent].faceUp;
      if (targetIndex < 0 || targetIndex >= cards.length) {
        return { success: false, error: 'Invalid target' };
      }
      const stolen = cards.splice(targetIndex, 1)[0];
      engine.players[player].faceUp.push(stolen);
      return { message: `Stole opponent's ${stolen}` };
    }
  },

  transfer: {
    id: 'transfer',
    name: 'Transfer',
    description: 'Give one of your face-up cards to opponent',
    category: 'action',
    needsTarget: true,
    targetType: 'own_face_up',
    apply(engine, player, targetIndex) {
      const opponent = player === 'host' ? 'guest' : 'host';
      const cards = engine.players[player].faceUp;
      if (targetIndex < 0 || targetIndex >= cards.length) {
        return { success: false, error: 'Invalid target' };
      }
      const transferred = cards.splice(targetIndex, 1)[0];
      engine.players[opponent].faceUp.push(transferred);
      return { message: `Gave ${transferred} to opponent` };
    }
  },

  return_card: {
    id: 'return_card',
    name: 'Return (pick)',
    description: 'Return one of your face-up cards to the deck (you choose which)',
    category: 'action',
    needsTarget: true,
    targetType: 'own_face_up',
    apply(engine, player, targetIndex) {
      const cards = engine.players[player].faceUp;
      if (targetIndex < 0 || targetIndex >= cards.length) {
        return { success: false, error: 'Invalid target' };
      }
      const returned = cards.splice(targetIndex, 1)[0];
      engine.deck.push(returned);
      engine.shuffleDeck();
      return { message: `Returned ${returned} to deck` };
    }
  },

  speed_loader: {
    id: 'speed_loader',
    name: 'Speed Loader',
    description: 'Draw 2 cards immediately',
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      const drawn = [];
      for (let i = 0; i < 2; i++) {
        const card = engine.drawCard();
        if (card !== null) {
          engine.players[player].faceUp.push(card);
          drawn.push(card);
        }
      }
      return { message: `Drew ${drawn.join(' and ')}` };
    }
  },

  double_down: {
    id: 'double_down',
    name: 'Double Down',
    description: 'Double the stakes (loser loses 2 lives)',
    category: 'action',
    needsTarget: false,
    apply(engine) {
      engine.roundStakes *= 2;
      return { message: `Stakes doubled to ${engine.roundStakes}x!` };
    }
  },

  change: {
    id: 'change',
    name: 'Change',
    description: 'Change the target number',
    category: 'action',
    needsTarget: false,
    apply(engine) {
      const targets = [17, 18, 19, 20, 22, 23, 24, 25];
      const newTarget = targets[Math.floor(Math.random() * targets.length)];
      engine.targetValue = newTarget;
      return { message: `Target changed to ${newTarget}!` };
    }
  }
};

/** Drawn from deck / random trump gains — not sold in shop as +/++ exclusives */
export const TRUMP_DECK_COMPOSITION = [
  'plus_1', 'plus_1',
  'plus_2', 'plus_2',
  'plus_3', 'plus_3',
  'minus_1', 'minus_1',
  'minus_2', 'minus_2',
  'minus_3', 'minus_3',
  'one_up', 'two_up',
  'draw_2', 'draw_3', 'draw_4', 'draw_5', 'draw_6', 'draw_7',
  'remove', 'return_last', 'return_card',
  'exchange',
  'love_your_enemy',
  'body_bag', 'steal', 'transfer',
  'trump_switch',
  'shield',
  'destroy',
  'perfect_draw', 'perfect_draw',
  'ultimate_draw',
  'go_for_17', 'go_for_17',
  'go_for_24', 'go_for_24',
  'go_for_27', 'go_for_27',
  'harvest',
  'speed_loader',
  'double_down',
  'change'
];

/** Shop-only upgraded trumps (+) — never in the draw deck */
export const SHOP_EXCLUSIVE_PLUS = [
  'two_up_plus',
  'shield_plus',
  'trump_switch_plus',
  'destroy_plus',
  'perfect_draw_plus',
];

/** Shop-only (++), very rare rolls */
export const SHOP_EXCLUSIVE_PLUS_PLUS = [
  'destroy_plus_plus',
];

const SHOP_PLUS_CHANCE = 0.26;
const SHOP_PLUS_PLUS_CHANCE = 0.06;

export function isShopExclusiveTrump(id) {
  return SHOP_EXCLUSIVE_PLUS.includes(id) || SHOP_EXCLUSIVE_PLUS_PLUS.includes(id);
}

export function getShopTrumpTier(id) {
  if (SHOP_EXCLUSIVE_PLUS_PLUS.includes(id)) return 'plusplus';
  if (SHOP_EXCLUSIVE_PLUS.includes(id)) return 'plus';
  return 'normal';
}

/** One shop slot offer (deck card, + exclusive, or rare ++). */
export function drawShopTrumpOffer() {
  const r = Math.random();
  if (r < SHOP_PLUS_PLUS_CHANCE) {
    return SHOP_EXCLUSIVE_PLUS_PLUS[Math.floor(Math.random() * SHOP_EXCLUSIVE_PLUS_PLUS.length)];
  }
  if (r < SHOP_PLUS_PLUS_CHANCE + SHOP_PLUS_CHANCE) {
    return SHOP_EXCLUSIVE_PLUS[Math.floor(Math.random() * SHOP_EXCLUSIVE_PLUS.length)];
  }
  return TRUMP_DECK_COMPOSITION[Math.floor(Math.random() * TRUMP_DECK_COMPOSITION.length)];
}

export function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createTrumpDeck() {
  return shuffleArray(TRUMP_DECK_COMPOSITION);
}

/* --- In-game trump reference sheet --- */

const TRUMP_REF_ORDER = [
  'plus_1', 'plus_2', 'plus_3',
  'minus_1', 'minus_2', 'minus_3',
  'one_up', 'two_up', 'two_up_plus',
  'draw_2', 'draw_3', 'draw_4', 'draw_5', 'draw_6', 'draw_7',
  'remove', 'return_last', 'return_card', 'exchange',
  'love_your_enemy', 'body_bag', 'steal', 'transfer',
  'trump_switch', 'trump_switch_plus',
  'shield', 'shield_plus',
  'destroy', 'destroy_plus', 'destroy_plus_plus',
  'perfect_draw', 'perfect_draw_plus', 'ultimate_draw',
  'go_for_17', 'go_for_24', 'go_for_27',
  'harvest',
  'speed_loader', 'double_down', 'change',
];

function trumpRefMeta(id) {
  if (SHOP_EXCLUSIVE_PLUS_PLUS.includes(id)) {
    return { label: 'Shop only · very rare', shopOnly: true };
  }
  if (SHOP_EXCLUSIVE_PLUS.includes(id)) {
    return { label: 'Shop only', shopOnly: true };
  }
  const counts = {};
  for (const deckId of TRUMP_DECK_COMPOSITION) {
    counts[deckId] = (counts[deckId] || 0) + 1;
  }
  const n = counts[id] || 0;
  return { label: n === 1 ? '1 in deck' : n ? `${n} in deck` : 'Not in deck', shopOnly: false };
}

function buildTrumpRefGrid() {
  const grid = document.getElementById('trump-ref-grid');
  if (!grid) return;

  grid.innerHTML = '';
  const frag = document.createDocumentFragment();

  for (const id of TRUMP_REF_ORDER) {
    const card = TRUMP_CARD_TYPES[id];
    if (!card) continue;

    const article = document.createElement('article');
    article.className = `trump-ref-card trump-ref-card--${card.category}`;

    const thumb = document.createElement('div');
    thumb.className = 'trump-ref-thumb';
    const img = document.createElement('img');
    img.src = 'assets/cards/trump-back.png';
    img.alt = '';
    img.draggable = false;
    thumb.appendChild(img);

    const meta = document.createElement('div');
    meta.className = 'trump-ref-meta';

    const title = document.createElement('h3');
    title.className = 'trump-ref-name';
    title.textContent = card.name;

    const desc = document.createElement('p');
    desc.className = 'trump-ref-desc';
    desc.textContent = card.description;

    const tags = document.createElement('div');
    tags.className = 'trump-ref-tags';

    const cat = document.createElement('span');
    cat.className = 'trump-ref-tag trump-ref-tag--category';
    cat.textContent = card.category === 'modifier' ? 'Modifier' : 'Action';
    tags.appendChild(cat);

    const copies = document.createElement('span');
    copies.className = 'trump-ref-tag';
    const refMeta = trumpRefMeta(id);
    copies.textContent = refMeta.label;
    if (refMeta.shopOnly) copies.classList.add('trump-ref-tag--shop');
    tags.appendChild(copies);

    if (SHOP_EXCLUSIVE_PLUS_PLUS.includes(id)) {
      const rare = document.createElement('span');
      rare.className = 'trump-ref-tag trump-ref-tag--rare';
      rare.textContent = '++';
      tags.appendChild(rare);
    } else if (SHOP_EXCLUSIVE_PLUS.includes(id)) {
      const plus = document.createElement('span');
      plus.className = 'trump-ref-tag trump-ref-tag--plus';
      plus.textContent = '+';
      tags.appendChild(plus);
    }

    if (card.needsTarget) {
      const tgt = document.createElement('span');
      tgt.className = 'trump-ref-tag trump-ref-tag--target';
      tgt.textContent = card.targetType === 'opponent_face_up' ? 'Pick opponent card' : 'Pick your card';
      tags.appendChild(tgt);
    }

    meta.append(title, desc, tags);
    article.append(thumb, meta);
    frag.appendChild(article);
  }

  grid.appendChild(frag);
}

export function openTrumpReference() {
  const overlay = document.getElementById('trump-ref-overlay');
  if (!overlay) return;
  buildTrumpRefGrid();
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  document.getElementById('trump-ref-close')?.focus();
}

export function closeTrumpReference() {
  const overlay = document.getElementById('trump-ref-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
}

export function initTrumpReference() {
  const overlay = document.getElementById('trump-ref-overlay');
  if (!overlay) return;

  buildTrumpRefGrid();

  document.getElementById('trump-ref-close')?.addEventListener('click', closeTrumpReference);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeTrumpReference();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
      closeTrumpReference();
    }
  });

  for (const btn of document.querySelectorAll('[data-trump-ref-open]')) {
    btn.addEventListener('click', openTrumpReference);
  }
}
