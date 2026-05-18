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

  love_your_enemy: {
    id: 'love_your_enemy',
    name: 'Love Your Enemy',
    description: 'Swap all face-up cards with opponent',
    category: 'action',
    needsTarget: false,
    apply(engine, player) {
      const opponent = player === 'host' ? 'guest' : 'host';
      const tempCards = [...engine.players[player].faceUp];
      const tempMods = [...engine.players[player].modifiers];

      engine.players[player].faceUp = [...engine.players[opponent].faceUp];
      engine.players[player].modifiers = [...engine.players[opponent].modifiers];

      engine.players[opponent].faceUp = tempCards;
      engine.players[opponent].modifiers = tempMods;

      return { message: "Swapped all face-up cards!" };
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
    name: 'Return',
    description: 'Return one of your face-up cards to the deck',
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

export const TRUMP_DECK_COMPOSITION = [
  'plus_1', 'plus_1',
  'plus_2', 'plus_2',
  'plus_3', 'plus_3',
  'minus_1', 'minus_1',
  'minus_2', 'minus_2',
  'minus_3', 'minus_3',
  'love_your_enemy',
  'body_bag',
  'steal',
  'transfer',
  'return_card',
  'speed_loader',
  'double_down',
  'change'
];

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
