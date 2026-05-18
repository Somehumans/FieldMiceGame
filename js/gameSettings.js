/** Match settings — lobby → game (practice + online host) */

export const DEFAULT_GAME_SETTINGS = {
  private: false,
  trumpDrawChance: 40,
  turnTimeLimitSec: 25,
  startingLives: 9,
};

export const SETTINGS_LIMITS = {
  trumpDrawChance: { min: 0, max: 80, step: 5 },
  turnTimeLimitSec: { min: 10, max: 60, step: 5 },
  startingLives: { min: 3, max: 15, step: 1 },
};

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
  };
}
