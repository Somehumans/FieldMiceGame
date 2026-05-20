/** Match settings — lobby → game (practice + online host) */

/** Standard 21 deck: one of each value 1–11 */
export const DEFAULT_DECK_CARDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export const DECK_LIMITS = {
  minTotal: 8,
  maxTotal: 44,
  maxPerValue: 4,
};

export const DEFAULT_GAME_SETTINGS = {
  private: false,
  trumpDrawChance: 50,
  turnTimeLimitSec: 25,
  startingLives: 9,
  deckCards: [...DEFAULT_DECK_CARDS],
};

export const SETTINGS_LIMITS = {
  trumpDrawChance: { min: 0, max: 80, step: 5 },
  turnTimeLimitSec: { min: 10, max: 60, step: 5 },
  startingLives: { min: 3, max: 15, step: 1 },
};

export function deckCountsFromCards(cards) {
  const counts = {};
  for (let v = 1; v <= 11; v++) counts[v] = 0;
  for (const raw of cards || []) {
    const v = Math.round(Number(raw));
    if (v >= 1 && v <= 11) counts[v]++;
  }
  return counts;
}

export function deckCardsFromCounts(counts) {
  const cards = [];
  for (let v = 1; v <= 11; v++) {
    const n = clamp(
      Math.round(Number(counts[v]) || 0),
      0,
      DECK_LIMITS.maxPerValue
    );
    for (let i = 0; i < n; i++) cards.push(v);
  }
  return cards;
}

export function normalizeDeckCards(raw) {
  let cards = [];
  if (Array.isArray(raw)) {
    cards = deckCardsFromCounts(deckCountsFromCards(raw));
  }
  if (cards.length < DECK_LIMITS.minTotal) {
    return [...DEFAULT_DECK_CARDS];
  }
  if (cards.length > DECK_LIMITS.maxTotal) {
    return cards.slice(0, DECK_LIMITS.maxTotal);
  }
  return cards;
}

export function isDeckValid(cards) {
  const n = normalizeDeckCards(cards).length;
  const rawLen = Array.isArray(cards) ? deckCardsFromCounts(deckCountsFromCards(cards)).length : 0;
  return rawLen >= DECK_LIMITS.minTotal && rawLen <= DECK_LIMITS.maxTotal;
}

const STORAGE_KEY = 'fieldmice_game_settings';

export function normalizeSettings(raw = {}) {
  const s = { ...DEFAULT_GAME_SETTINGS, ...raw };
  s.private = Boolean(s.private);
  s.trumpDrawChance = clamp(
    Math.round(Number(s.trumpDrawChance) || DEFAULT_GAME_SETTINGS.trumpDrawChance),
    SETTINGS_LIMITS.trumpDrawChance.min,
    SETTINGS_LIMITS.trumpDrawChance.max
  );
  s.turnTimeLimitSec = clamp(
    Math.round(Number(s.turnTimeLimitSec) || DEFAULT_GAME_SETTINGS.turnTimeLimitSec),
    SETTINGS_LIMITS.turnTimeLimitSec.min,
    SETTINGS_LIMITS.turnTimeLimitSec.max
  );
  s.startingLives = clamp(
    Math.round(Number(s.startingLives) || DEFAULT_GAME_SETTINGS.startingLives),
    SETTINGS_LIMITS.startingLives.min,
    SETTINGS_LIMITS.startingLives.max
  );
  if (Object.prototype.hasOwnProperty.call(raw, 'deckCards')) {
    s.deckCards = normalizeDeckCards(raw.deckCards);
  }
  return s;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function loadStoredSettings() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GAME_SETTINGS };
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_GAME_SETTINGS };
  }
}

export function saveStoredSettings(settings) {
  const normalized = normalizeSettings(settings);
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch { /* ignore */ }
  return normalized;
}

export function parseSettingsFromUrl(params) {
  if (!params.has('lives') && !params.has('timer') && !params.has('trump')) {
    return null;
  }
  return normalizeSettings({
    startingLives: params.get('lives'),
    turnTimeLimitSec: params.get('timer'),
    trumpDrawChance: params.get('trump'),
    private: params.get('private') === '1',
  });
}

export function settingsForEngine(settings) {
  const s = normalizeSettings(settings);
  return {
    private: s.private,
    trumpDrawChance: s.trumpDrawChance / 100,
    turnTimeLimitSec: s.turnTimeLimitSec,
    startingLives: s.startingLives,
    deckCards: [...s.deckCards],
  };
}
