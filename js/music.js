/** Shared background music — game + lobby */

const DEFAULT_MUSIC_VOLUME = 0.06;
const NOW_PLAYING_VISIBLE_MS = 5500;
const STORAGE_KEY = 'fieldmice_audio_v1';

function bindTap(el, handler) {
  if (!el) return;
  let lastPointerAt = 0;
  el.addEventListener('pointerup', (e) => {
    lastPointerAt = Date.now();
    if (e.cancelable) e.preventDefault();
    handler(e);
  });
  el.addEventListener('click', (e) => {
    if (Date.now() - lastPointerAt < 500) return;
    handler(e);
  });
}

function loadAudioSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveAudioSettings(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota / private mode */
  }
}

export class MusicPlayer {
  constructor() {
    this.tracks = [
      { title: 'In the Name of Z', artist: 'Real Heroes', src: 'Music/In the Name of Z.mp3', thumb: 'Music/In the name of Z.jpg' },
      { title: 'Solitude', artist: 'Ava Low', src: 'Music/Solitude.mp3', thumb: 'Music/Solitude.jpg' },
      { title: 'Change My Style', artist: 'Glow Machine', src: 'Music/Change My Style.mp3', thumb: 'Music/Change My Style.jpg' },
    ];
    this.currentIndex = 0;
    this.audio = new Audio();
    this.isPlaying = false;
    this.isMuted = false;
    this.savedVolume = DEFAULT_MUSIC_VOLUME;
    this.sfxVolume = 0.7;
    this.sfxMuted = false;

    const saved = loadAudioSettings();
    if (saved) {
      if (typeof saved.musicVolume === 'number') this.savedVolume = saved.musicVolume;
      if (typeof saved.musicMuted === 'boolean') this.isMuted = saved.musicMuted;
      if (typeof saved.sfxVolume === 'number') this.sfxVolume = saved.sfxVolume;
      if (typeof saved.sfxMuted === 'boolean') this.sfxMuted = saved.sfxMuted;
    }

    this._npHideTimer = null;
    this._npVisible = false;

    this.audio.addEventListener('loadedmetadata', () => this.applyMusicOutput());
    this.applyMusicOutput();
  }

  persistSettings() {
    saveAudioSettings({
      musicVolume: this.savedVolume,
      musicMuted: this.isMuted,
      sfxVolume: this.sfxVolume,
      sfxMuted: this.sfxMuted,
    });
  }

  applyMusicOutput() {
    const vol = this.isMuted ? 0 : this.savedVolume;
    this.audio.volume = vol;
    if (vol <= 0 || this.isMuted) {
      this.audio.pause();
    } else if (this.isPlaying) {
      this.audio.play().catch(() => {});
    }
  }

  init(options = {}) {
    const { pauseMenu = false } = options;

    this.setupChrome();
    if (pauseMenu) this.setupPauseMenuControls();

    this.audio.addEventListener('ended', () => this.next());
    this.loadTrack(0, { notify: false });
    this.autoplay();
  }

  setupChrome() {
    this.topMuteBtn = document.getElementById('music-mute-top');
    this.nowPlayingEl = document.getElementById('music-now-playing');
    this.npThumbEl = document.getElementById('music-np-thumb');
    this.npTitleEl = document.getElementById('music-np-title');
    this.npArtistEl = document.getElementById('music-np-artist');

    bindTap(this.topMuteBtn, () => this.toggleMute());

    if (this.nowPlayingEl) {
      bindTap(this.nowPlayingEl, () => this.hideNowPlaying());
    }

    this.syncTopMuteButton();
  }

  setupPauseMenuControls() {
    const musicSlider = document.getElementById('music-volume');
    const musicMuteBtn = document.getElementById('music-mute-btn');
    const sfxSlider = document.getElementById('sfx-volume');
    const sfxMuteBtn = document.getElementById('sfx-mute-btn');
    if (!musicSlider || !musicMuteBtn) return;

    musicSlider.value = String(this.isMuted ? 0 : Math.round(this.savedVolume * 100));

    const onMusicSlide = (e) => {
      this.setMusicVolume(Number(e.target.value) / 100);
    };
    musicSlider.addEventListener('input', onMusicSlide);
    musicSlider.addEventListener('change', onMusicSlide);

    bindTap(musicMuteBtn, () => this.toggleMute());

    if (sfxSlider && sfxMuteBtn) {
      sfxSlider.value = String(Math.round(this.sfxVolume * 100));
      if (this.sfxMuted) {
        sfxMuteBtn.textContent = '🔇';
        sfxMuteBtn.classList.add('muted');
      }

      const onSfxSlide = (e) => {
        this.sfxVolume = Number(e.target.value) / 100;
        if (this.sfxVolume === 0) {
          this.sfxMuted = true;
          sfxMuteBtn.textContent = '🔇';
          sfxMuteBtn.classList.add('muted');
        } else {
          this.sfxMuted = false;
          sfxMuteBtn.textContent = '🔊';
          sfxMuteBtn.classList.remove('muted');
        }
        this.persistSettings();
      };
      sfxSlider.addEventListener('input', onSfxSlide);
      sfxSlider.addEventListener('change', onSfxSlide);

      bindTap(sfxMuteBtn, () => {
        this.sfxMuted = !this.sfxMuted;
        sfxMuteBtn.textContent = this.sfxMuted ? '🔇' : '🔊';
        sfxMuteBtn.classList.toggle('muted', this.sfxMuted);
        this.persistSettings();
      });
    }
  }

  setMusicVolume(vol) {
    this.savedVolume = Math.max(0, Math.min(1, vol));
    this.isMuted = this.savedVolume === 0;
    this.applyMusicOutput();
    this.syncTopMuteButton();
    this.syncPauseMenuMusic();
    this.persistSettings();
  }

  syncPauseMenuMusic() {
    const musicSlider = document.getElementById('music-volume');
    const musicMuteBtn = document.getElementById('music-mute-btn');
    if (musicSlider) {
      musicSlider.value = String(this.isMuted ? 0 : Math.round(this.savedVolume * 100));
    }
    if (musicMuteBtn) {
      musicMuteBtn.textContent = this.isMuted ? '🔇' : '🔊';
      musicMuteBtn.classList.toggle('muted', this.isMuted);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.applyMusicOutput();
    this.syncTopMuteButton();
    this.syncPauseMenuMusic();
    this.persistSettings();
  }

  syncTopMuteButton() {
    if (!this.topMuteBtn) return;
    this.topMuteBtn.textContent = this.isMuted ? '🔇' : '🔊';
    this.topMuteBtn.classList.toggle('muted', this.isMuted);
    this.topMuteBtn.setAttribute('aria-label', this.isMuted ? 'Unmute music' : 'Mute music');
  }

  showNowPlaying() {
    if (!this.nowPlayingEl) return;

    const track = this.tracks[this.currentIndex];
    if (this.npThumbEl) this.npThumbEl.src = track.thumb;
    if (this.npTitleEl) this.npTitleEl.textContent = track.title;
    if (this.npArtistEl) this.npArtistEl.textContent = track.artist;

    clearTimeout(this._npHideTimer);
    this.nowPlayingEl.classList.remove('is-hiding');

    if (this._npVisible) {
      this.nowPlayingEl.classList.remove('is-pulse');
      void this.nowPlayingEl.offsetWidth;
      this.nowPlayingEl.classList.add('is-pulse');
    } else {
      this.nowPlayingEl.classList.add('is-visible');
      this._npVisible = true;
    }

    this._npHideTimer = setTimeout(() => this.hideNowPlaying(), NOW_PLAYING_VISIBLE_MS);
  }

  hideNowPlaying() {
    if (!this.nowPlayingEl || !this._npVisible) return;

    clearTimeout(this._npHideTimer);
    this._npHideTimer = null;
    this.nowPlayingEl.classList.add('is-hiding');
    this.nowPlayingEl.classList.remove('is-pulse');

    const onEnd = (e) => {
      if (e.propertyName !== 'opacity') return;
      this.nowPlayingEl.removeEventListener('transitionend', onEnd);
      if (!this.nowPlayingEl.classList.contains('is-hiding')) return;
      this.nowPlayingEl.classList.remove('is-visible', 'is-hiding');
      this._npVisible = false;
    };
    this.nowPlayingEl.addEventListener('transitionend', onEnd);
  }

  autoplay() {
    if (this.isMuted || this.savedVolume <= 0) {
      this.isPlaying = false;
      return;
    }
    this.audio.play().then(() => {
      this.isPlaying = true;
      this.applyMusicOutput();
      this.showNowPlaying();
    }).catch(() => {
      const resume = () => {
        if (this.isMuted || this.savedVolume <= 0) return;
        this.audio.play().then(() => {
          this.isPlaying = true;
          this.applyMusicOutput();
          this.showNowPlaying();
        }).catch(() => {});
      };
      document.addEventListener('pointerup', resume, { once: true });
      document.addEventListener('keydown', resume, { once: true });
    });
  }

  loadTrack(index, { notify = true } = {}) {
    this.currentIndex = index;
    const track = this.tracks[index];
    this.audio.src = track.src;
    this.applyMusicOutput();

    if (this.isPlaying && !this.isMuted && this.savedVolume > 0) {
      this.audio.play().catch(() => {});
    }

    if (notify) this.showNowPlaying();
  }

  next() {
    const idx = (this.currentIndex + 1) % this.tracks.length;
    this.loadTrack(idx);
  }

  getSfxVolume() {
    return this.sfxMuted ? 0 : this.sfxVolume;
  }
}
