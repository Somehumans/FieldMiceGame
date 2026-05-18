/** Shared background music — game + lobby */

const DEFAULT_MUSIC_VOLUME = 0.125;
const NOW_PLAYING_VISIBLE_MS = 5500;

export class MusicPlayer {
  constructor() {
    this.tracks = [
      { title: 'In the Name of Z', artist: 'Real Heroes', src: 'Music/In the Name of Z.mp3', thumb: 'Music/In the name of Z.jpg' },
      { title: 'Solitude', artist: 'Ava Low', src: 'Music/Solitude.mp3', thumb: 'Music/Solitude.jpg' },
      { title: 'Change My Style', artist: 'Glow Machine', src: 'Music/Change My Style.mp3', thumb: 'Music/Change My Style.jpg' },
    ];
    this.currentIndex = 0;
    this.audio = new Audio();
    this.audio.volume = DEFAULT_MUSIC_VOLUME;
    this.isPlaying = false;
    this.isMuted = false;
    this.savedVolume = DEFAULT_MUSIC_VOLUME;
    this.sfxVolume = 0.7;
    this.sfxMuted = false;
    this._npHideTimer = null;
    this._npVisible = false;
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

    if (this.topMuteBtn) {
      this.topMuteBtn.addEventListener('click', () => this.toggleMute());
    }

    if (this.nowPlayingEl) {
      this.nowPlayingEl.addEventListener('click', () => this.hideNowPlaying());
    }

    this.syncTopMuteButton();
  }

  setupPauseMenuControls() {
    const musicSlider = document.getElementById('music-volume');
    const musicMuteBtn = document.getElementById('music-mute-btn');
    const sfxSlider = document.getElementById('sfx-volume');
    const sfxMuteBtn = document.getElementById('sfx-mute-btn');
    if (!musicSlider || !musicMuteBtn) return;

    musicSlider.value = Math.round(this.savedVolume * 100);

    musicSlider.addEventListener('input', (e) => {
      this.setMusicVolume(e.target.value / 100);
    });

    musicMuteBtn.addEventListener('click', () => this.toggleMute());

    if (sfxSlider && sfxMuteBtn) {
      sfxSlider.addEventListener('input', (e) => {
        this.sfxVolume = e.target.value / 100;
        if (this.sfxVolume === 0) {
          this.sfxMuted = true;
          sfxMuteBtn.textContent = '🔇';
          sfxMuteBtn.classList.add('muted');
        } else {
          this.sfxMuted = false;
          sfxMuteBtn.textContent = '🔊';
          sfxMuteBtn.classList.remove('muted');
        }
      });

      sfxMuteBtn.addEventListener('click', () => {
        this.sfxMuted = !this.sfxMuted;
        sfxMuteBtn.textContent = this.sfxMuted ? '🔇' : '🔊';
        sfxMuteBtn.classList.toggle('muted', this.sfxMuted);
      });
    }
  }

  setMusicVolume(vol) {
    this.savedVolume = vol;
    this.isMuted = vol === 0;
    this.audio.volume = this.isMuted ? 0 : vol;
    this.syncTopMuteButton();
    this.syncPauseMenuMusic();
  }

  syncPauseMenuMusic() {
    const musicSlider = document.getElementById('music-volume');
    const musicMuteBtn = document.getElementById('music-mute-btn');
    if (musicSlider) {
      musicSlider.value = this.isMuted ? 0 : Math.round(this.savedVolume * 100);
    }
    if (musicMuteBtn) {
      musicMuteBtn.textContent = this.isMuted ? '🔇' : '🔊';
      musicMuteBtn.classList.toggle('muted', this.isMuted);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.audio.volume = 0;
    } else {
      this.audio.volume = this.savedVolume;
    }
    this.syncTopMuteButton();
    this.syncPauseMenuMusic();
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
    this.audio.play().then(() => {
      this.isPlaying = true;
      this.showNowPlaying();
    }).catch(() => {
      const resume = () => {
        if (!this.isPlaying) {
          this.audio.play().then(() => {
            this.isPlaying = true;
            this.showNowPlaying();
          }).catch(() => {});
        }
      };
      document.addEventListener('click', resume, { once: true });
      document.addEventListener('keydown', resume, { once: true });
    });
  }

  loadTrack(index, { notify = true } = {}) {
    this.currentIndex = index;
    const track = this.tracks[index];
    this.audio.src = track.src;

    if (this.isPlaying) {
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
