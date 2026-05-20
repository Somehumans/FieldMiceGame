/** Match settings — lobby → game (practice + online host) */

import { TRUMP_DECK_COMPOSITION, CONFIGURABLE_TRUMP_ORDER } from './trumpCards.js';

export const DEFAULT_TRUMP_DECK = [...TRUMP_DECK_COMPOSITION];

const VALID_TRUMP_IDS = new Set(CONFIGURABLE_TRUMP_ORDER);

export const TRUMP_DECK_LIMITS = {
  minTotal: 16,
  maxTotal: 120,
  maxPerCard: 4,
};

export const DEFAULT_GAME_SETTINGS = {
  private: false,
  trumpDrawChance: 50,
  turnTimeLimitSec: 25,
  startingLives: 9,
  trumpDeckComposition: [...DEFAULT_TRUMP_DECK],
};

export const SETTINGS_LIMITS = {
  trumpDrawChance: { min: 0, max: 80, step: 5 },
  turnTimeLimitSec: { min: 10, max: 60, step: 5 },
  startingLives: { min: 3, max: 15, step: 1 },
};

export function trumpCountsFromComposition(composition) {
  const counts = {};
  for (const id of CONFIGURABLE_TRUMP_ORDER) counts[id] = 0;
  for (const raw of composition || []) {
    const id = String(raw);
    if (VALID_TRUMP_IDS.has(id)) counts[id]++;
  }
  return counts;
}

export function trumpCompositionFromCounts(counts) {
  const cards = [];
  for (const id of CONFIGURABLE_TRUMP_ORDER) {
    const n = clamp(
      Math.round(Number(counts[id]) || 0),
      0,
      TRUMP_DECK_LIMITS.maxPerCard
    );
    for (let i = 0; i < n; i++) cards.push(id);
  }
  return cards;
}

export function normalizeTrumpDeckComposition(raw) {
  let cards = [];
  if (Array.isArray(raw)) {
    cards = trumpCompositionFromCounts(trumpCountsFromComposition(raw));
  }
  if (cards.length < TRUMP_DECK_LIMITS.minTotal) {
    return [...DEFAULT_TRUMP_DECK];
  }
  if (cards.length > TRUMP_DECK_LIMITS.maxTotal) {
    return cards.slice(0, TRUMP_DECK_LIMITS.maxTotal);
  }
  return cards;
}

export function isTrumpDeckValid(composition) {
  const rawLen = Array.isArray(composition)
    ? trumpCompositionFromCounts(trumpCountsFromComposition(composition)).length
    : 0;
  return (
    rawLen >= TRUMP_DECK_LIMITS.minTotal && rawLen <= TRUMP_DECK_LIMITS.maxTotal
  );
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
  if (
    Object.prototype.hasOwnProperty.call(raw, 'trumpDeckComposition') ||
    Object.prototype.hasOwnProperty.call(raw, 'deckCards')
  ) {
    const pile = raw.trumpDeckComposition ?? raw.deckCards;
    s.trumpDeckComposition = normalizeTrumpDeckComposition(pile);
  }
  delete s.deckCards;
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
    trumpDeckComposition: [...s.trumpDeckComposition],
  };
}
