const STORAGE_KEY = 'fieldmice_username';

export function normalizeUsername(raw) {
  const trimmed = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'Player';
  const safe = trimmed.slice(0, 16);
  return safe.length >= 2 ? safe : 'Player';
}

export function loadStoredUsername() {
  try {
    return normalizeUsername(sessionStorage.getItem(STORAGE_KEY) || '');
  } catch {
    return 'Player';
  }
}

export function saveStoredUsername(name) {
  const normalized = normalizeUsername(name);
  try {
    sessionStorage.setItem(STORAGE_KEY, normalized);
  } catch { /* ignore */ }
  return normalized;
}
