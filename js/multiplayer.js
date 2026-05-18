import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { DEFAULT_GAME_SETTINGS, normalizeSettings } from './gameSettings.js';
import { normalizeUsername } from './username.js';

let supabase = null;

function isSupabaseConfigured() {
  return (
    SUPABASE_URL
    && SUPABASE_URL !== 'YOUR_SUPABASE_URL'
    && SUPABASE_ANON_KEY
    && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY'
  );
}

function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (!supabase) {
    const lib = globalThis.supabase;
    if (!lib?.createClient) {
      console.warn('Supabase JS not loaded. Check the script tag in index.html.');
      return null;
    }
    supabase = lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function pickRow(data) {
  if (!data) return null;
  return Array.isArray(data) ? data[0] : data;
}

export class Multiplayer {
  constructor() {
    this.channel = null;
    this.watchChannel = null;
    this.roomCode = null;
    this.roomId = null;
    this.role = null;
    this.playerId = null;
    this.onEvent = null;
    this.roomSettings = { ...DEFAULT_GAME_SETTINGS };
    this.hostUsername = '';
    this.guestUsername = '';
    this.myUsername = '';
    this.channelReady = false;
  }

  waitUntilReady(timeoutMs = 8000) {
    if (this.channelReady) return Promise.resolve(true);
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (this.channelReady) {
          resolve(true);
          return;
        }
        if (Date.now() - started >= timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(tick, 40);
      };
      tick();
    });
  }

  async init() {
    const sb = getSupabase();
    if (!sb) {
      const lib = globalThis.supabase;
      if (!lib?.createClient) {
        return { ok: false, error: 'library' };
      }
      return { ok: false, error: 'config' };
    }

    const { data, error } = await sb.auth.signInAnonymously();
    if (error) {
      console.error('Supabase anonymous sign-in failed:', error.message);
      return { ok: false, error: 'auth', message: error.message };
    }

    this.playerId = data?.user?.id;
    if (!this.playerId) {
      return { ok: false, error: 'auth', message: 'No user id after sign-in' };
    }

    await this.cleanupInactiveRooms();
    return { ok: true };
  }

  async cleanupInactiveRooms() {
    const sb = getSupabase();
    if (!sb) return;
    try {
      await sb.rpc('cleanup_stale_rooms');
    } catch (err) {
      console.warn('cleanup_stale_rooms RPC unavailable:', err?.message);
    }
  }

  async createRoom(settings = {}, username = 'Player') {
    const sb = getSupabase();
    if (!sb) return null;

    const code = generateRoomCode();
    const normalized = normalizeSettings(settings);
    const name = normalizeUsername(username);
    this.roomSettings = normalized;
    this.myUsername = name;
    this.hostUsername = name;
    this.guestUsername = '';

    const row = {
      code,
      host_id: this.playerId,
      host_username: name,
      guest_username: null,
      status: 'waiting',
      is_private: normalized.private,
      settings: normalized,
      last_active_at: new Date().toISOString(),
    };

    let result = await sb.from('rooms').insert(row).select('id').single();

    if (result.error) {
      result = await sb.from('rooms').insert({
        code,
        host_id: this.playerId,
        status: 'waiting',
        last_active_at: new Date().toISOString(),
      }).select('id').single();
    }

    if (result.error) {
      console.error('Failed to create room:', result.error);
      return null;
    }

    this.roomCode = code;
    this.roomId = result.data?.id ?? null;
    this.role = 'host';
    await this.subscribeToChannel(code);

    return code;
  }

  async joinRoom(code, username = 'Player') {
    const sb = getSupabase();
    if (!sb) return { success: false, error: 'Supabase not configured' };

    const upperCode = code.toUpperCase().trim();
    const name = normalizeUsername(username);

    const { data, error } = await sb
      .from('rooms')
      .select('*')
      .eq('code', upperCode)
      .eq('status', 'waiting')
      .single();

    if (error || !data) {
      return { success: false, error: 'Room not found or already in game' };
    }

    if (data.guest_id) {
      return { success: false, error: 'Room is full' };
    }

    let roomSettings = { ...DEFAULT_GAME_SETTINGS };
    if (data.settings) {
      try {
        const raw = typeof data.settings === 'string' ? JSON.parse(data.settings) : data.settings;
        roomSettings = normalizeSettings(raw);
      } catch {
        roomSettings = { ...DEFAULT_GAME_SETTINGS };
      }
    }

    const { error: updateError } = await sb
      .from('rooms')
      .update({
        guest_id: this.playerId,
        guest_username: name,
        status: 'playing',
        last_active_at: new Date().toISOString(),
      })
      .eq('id', data.id)
      .is('guest_id', null);

    if (updateError) {
      return { success: false, error: 'Failed to join room' };
    }

    this.roomCode = upperCode;
    this.roomId = data.id;
    this.role = 'guest';
    this.myUsername = name;
    this.hostUsername = data.host_username || 'Host';
    this.guestUsername = name;
    this.roomSettings = roomSettings;
    await this.subscribeToChannel(upperCode);
    await this.waitUntilReady();

    this.broadcast('player_joined', {
      playerId: this.playerId,
      username: name,
    });

    return {
      success: true,
      settings: roomSettings,
      hostUsername: this.hostUsername,
      guestUsername: name,
    };
  }

  async fetchRoom(code) {
    const sb = getSupabase();
    if (!sb || !code) return null;

    const { data, error } = await sb
      .from('rooms')
      .select('*')
      .eq('code', code.toUpperCase())
      .maybeSingle();

    if (error || !data) return null;
    return data;
  }

  async touchRoom() {
    const sb = getSupabase();
    if (!sb || !this.roomCode) return;

    await sb
      .from('rooms')
      .update({ last_active_at: new Date().toISOString() })
      .eq('code', this.roomCode);
  }

  async markRoomFinished() {
    const sb = getSupabase();
    if (!sb || !this.roomCode) return;

    await sb
      .from('rooms')
      .update({ status: 'finished', last_active_at: new Date().toISOString() })
      .eq('code', this.roomCode);
  }

  getRoomSettings() {
    return { ...this.roomSettings };
  }

  getDisplayNames() {
    const host = this.hostUsername || 'Host';
    const guest = this.guestUsername || 'Guest';
    if (this.role === 'host') {
      return { player: host, opponent: guest || 'Waiting…' };
    }
    return { player: guest, opponent: host };
  }

  watchRoomForGuest(code, onGuestJoined) {
    const sb = getSupabase();
    if (!sb || !code || typeof onGuestJoined !== 'function') return;

    const upper = code.toUpperCase();
    this.stopWatchingRoom();

    this.watchChannel = sb
      .channel(`room-watch:${upper}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `code=eq.${upper}`,
        },
        (payload) => {
          const row = payload.new;
          if (row?.guest_id && row.status === 'playing') {
            onGuestJoined(row);
          }
        }
      )
      .subscribe();
  }

  stopWatchingRoom() {
    const sb = getSupabase();
    if (sb && this.watchChannel) {
      sb.removeChannel(this.watchChannel);
      this.watchChannel = null;
    }
  }

  subscribeToChannel(code) {
    const sb = getSupabase();
    if (!sb) return Promise.resolve(false);

    if (this.channel) {
      sb.removeChannel(this.channel);
      this.channel = null;
      this.channelReady = false;
    }

    const upper = String(code).toUpperCase();
    const channel = sb.channel(`room:${upper}`, {
      config: { broadcast: { self: false } },
    });

    channel.on('broadcast', { event: 'game_event' }, (msg) => {
      const body = msg?.payload ?? msg;
      if (this.onEvent && body) this.onEvent(body);
    });

    this.channel = channel;

    return new Promise((resolve) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.channelReady = true;
          resolve(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('Realtime channel status:', status, upper);
          this.channelReady = false;
          resolve(false);
        }
      });
    });
  }

  async broadcast(type, data = {}) {
    if (!this.channel) return;
    if (!this.channelReady) await this.waitUntilReady(3000);

    const message = {
      type: 'broadcast',
      event: 'game_event',
      payload: { type, ...data, from: this.role, ts: Date.now() },
    };

    await this.channel.send(message);
    await new Promise((r) => setTimeout(r, 35));
    await this.channel.send(message);
  }

  broadcastGameState(state, extra = {}) {
    return this.broadcast('game_state', { state, ...extra });
  }

  broadcastAction(action, data = {}) {
    return this.broadcast('action', { action, ...data });
  }

  async deleteRoom() {
    const sb = getSupabase();
    if (!sb || !this.roomCode) return;

    await sb.from('rooms').delete().eq('code', this.roomCode);
    this.cleanup();
  }

  async leaveRoom() {
    const sb = getSupabase();
    if (!sb || !this.roomCode) {
      this.cleanup();
      return;
    }

    if (this.role === 'host') {
      await this.deleteRoom();
      return;
    }

    if (this.role === 'guest') {
      await sb
        .from('rooms')
        .update({
          guest_id: null,
          guest_username: null,
          status: 'waiting',
          last_active_at: new Date().toISOString(),
        })
        .eq('code', this.roomCode);
    }

    this.cleanup();
  }

  cleanup() {
    this.stopWatchingRoom();
    this.channelReady = false;
    if (this.channel) {
      const sb = getSupabase();
      if (sb) sb.removeChannel(this.channel);
      this.channel = null;
    }
    this.roomCode = null;
    this.roomId = null;
    this.role = null;
  }
}
