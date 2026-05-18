const STORAGE_KEY = 'fieldmice_online_session';

/** Remember online match info so game.html never falls back to AI by accident. */
export function saveOnlineSession({ room, role }) {
  if (!room) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: 'online',
      room: String(room).toUpperCase().trim(),
      role: role === 'guest' ? 'guest' : 'host',
    }));
  } catch { /* ignore */ }
}

export function loadOnlineSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.room) return null;
    return {
      mode: 'online',
      room: String(data.room).toUpperCase().trim(),
      role: data.role === 'guest' ? 'guest' : 'host',
    };
  } catch {
    return null;
  }
}

export function clearOnlineSession() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

export function resolveOnlineParams(searchParams) {
  const urlMode = searchParams.get('mode');
  const urlRoom = (searchParams.get('room') || '').toUpperCase().trim();
  const urlRole = searchParams.get('role');

  // Practice / tutorial must never use a leftover online room from sessionStorage
  if (urlMode === 'ai') {
    return { mode: 'ai', role: 'host', room: '' };
  }

  if (urlMode === 'online' && urlRoom) {
    return {
      mode: 'online',
      role: urlRole === 'guest' ? 'guest' : 'host',
      room: urlRoom,
    };
  }

  const stored = loadOnlineSession();
  if (stored?.room) {
    return {
      mode: 'online',
      role: stored.role,
      room: stored.room,
    };
  }

  return {
    mode: urlMode || 'ai',
    role: urlRole || 'host',
    room: '',
  };
}
