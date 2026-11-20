// Tiny WebAudio synth: no files, no requests, and nothing starts until a user gesture.

const MUTE_KEY = 'solmar-muted-v1';

function midiToFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

export class AudioEngine {
  constructor() {
    this.initialized = false;
    this.context = null;
    this.master = null;
    this.muted = false;
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* storage is optional */ }
    this.engineGain = null;
    this.engineOscillators = [];
    this.engineFilter = null;
    this.sirenGain = null;
    this.sirenOscillator = null;
    this.sirenHigh = false;
    this.sirenActive = false;
    this.musicGain = null;
    this.musicTimer = null;
    this.sirenTimer = null;
    this.nextMusicTime = 0;
    this.musicStep = 0;
    this.noiseBuffer = null;
    this.running = false;
  }

  init() {
    if (this.initialized) {
      if (this.context?.state === 'suspended') this.context.resume().catch(() => {});
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.72;
      this.master.connect(this.context.destination);
      this._makeNoise();
      this._makeEngine();
      this._makeSiren();
      this._makeMusic();
      this.initialized = true;
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    } catch {
      this.initialized = false;
    }
  }

  _makeNoise() {
    const length = Math.floor(this.context.sampleRate * 1.2);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let value = 0;
    for (let index = 0; index < length; index += 1) {
      value = Math.random() * 2 - 1;
      data[index] = value;
    }
    this.noiseBuffer = buffer;
  }

  _makeEngine() {
    const context = this.context;
    this.engineFilter = context.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 310;
    this.engineFilter.Q.value = 1.4;
    this.engineGain = context.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    for (const [type, detune, level] of [['sawtooth', -7, 0.55], ['square', 9, 0.24], ['triangle', 0, 0.28]]) {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = 72;
      oscillator.detune.value = detune;
      const gain = context.createGain();
      gain.gain.value = level;
      oscillator.connect(gain);
      gain.connect(this.engineFilter);
      oscillator.start();
      this.engineOscillators.push(oscillator);
    }
  }

  _makeSiren() {
    const context = this.context;
    this.sirenGain = context.createGain();
    this.sirenGain.gain.value = 0;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 870;
    filter.Q.value = 2.1;
    this.sirenOscillator = context.createOscillator();
    this.sirenOscillator.type = 'sawtooth';
    this.sirenOscillator.frequency.value = 720;
    this.sirenOscillator.connect(filter);
    filter.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOscillator.start();
    this.sirenTimer = window.setInterval(() => {
      if (!this.initialized || !this.sirenActive) return;
      this.sirenHigh = !this.sirenHigh;
      this.sirenOscillator.frequency.setTargetAtTime(this.sirenHigh ? 870 : 650, this.context.currentTime, 0.025);
    }, 310);
  }

  _makeMusic() {
    const context = this.context;
    this.musicGain = context.createGain();
    this.musicGain.gain.value = 0.13;
    this.musicGain.connect(this.master);
    this.nextMusicTime = context.currentTime + 0.12;
    this.musicTimer = window.setInterval(() => this._scheduleMusic(), 90);
  }

  _scheduleMusic() {
    if (!this.initialized) return;
    const context = this.context;
    const bass = [45, 45, 48, 45, 43, 43, 50, 48, 45, 45, 48, 52, 43, 45, 41, 43];
    const accents = [69, 72, 76, 72, 67, 70, 74, 70, 69, 72, 76, 79, 67, 70, 65, 67];
    while (this.nextMusicTime < context.currentTime + 0.22) {
      const step = this.musicStep % bass.length;
      const time = this.nextMusicTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const filter = context.createBiquadFilter();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(midiToFrequency(bass[step] - 12), time);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(420 + (step % 4) * 70, time);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(0.11, time + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);
      oscillator.start(time);
      oscillator.stop(time + 0.23);

      if (step % 4 === 0) {
        const bell = context.createOscillator();
        const bellGain = context.createGain();
        bell.type = 'sine';
        bell.frequency.setValueAtTime(midiToFrequency(accents[step]), time);
        bellGain.gain.setValueAtTime(0.0001, time);
        bellGain.gain.exponentialRampToValueAtTime(0.025, time + 0.02);
        bellGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.48);
        bell.connect(bellGain);
        bellGain.connect(this.musicGain);
        bell.start(time);
        bell.stop(time + 0.52);
      }
      this.musicStep += 1;
      this.nextMusicTime += 0.235;
    }
  }

  setRunning(running) {
    this.running = running;
    if (!this.initialized) return;
    if (!running) {
      this.setEngine(false, 0);
      this.setSiren(false);
    }
  }

  setEngine(active, speedRatio = 0) {
    if (!this.initialized) return;
    const now = this.context.currentTime;
    const gain = active ? 0.026 + speedRatio * 0.055 : 0;
    this.engineGain.gain.setTargetAtTime(gain, now, 0.08);
    const frequency = 62 + speedRatio * 126;
    for (let index = 0; index < this.engineOscillators.length; index += 1) {
      this.engineOscillators[index].frequency.setTargetAtTime(frequency * (index === 1 ? 2.01 : 1), now, 0.08);
    }
    this.engineFilter.frequency.setTargetAtTime(260 + speedRatio * 920, now, 0.1);
  }

  setSiren(active) {
    this.sirenActive = active;
    if (!this.initialized) return;
    const now = this.context.currentTime;
    this.sirenGain.gain.setTargetAtTime(active ? 0.042 : 0, now, active ? 0.04 : 0.16);
  }

  gunshot() {
    if (!this.initialized) return;
    const context = this.context;
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 980;
    filter.Q.value = 0.55;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.42, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.23);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(now);
    source.stop(now + 0.25);
    const thump = context.createOscillator();
    const thumpGain = context.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(115, now);
    thump.frequency.exponentialRampToValueAtTime(42, now + 0.14);
    thumpGain.gain.setValueAtTime(0.34, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);
    thump.connect(thumpGain);
    thumpGain.connect(this.master);
    thump.start(now);
    thump.stop(now + 0.2);
  }

  crash(power = 0.6) {
    if (!this.initialized) return;
    const context = this.context;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(95, now);
    oscillator.frequency.exponentialRampToValueAtTime(38, now + 0.18);
    gain.gain.setValueAtTime(0.16 + power * 0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.32);
    if (this.noiseBuffer) {
      const noise = context.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 460;
      const noiseGain = context.createGain();
      noiseGain.gain.setValueAtTime(0.1 + power * 0.12, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.master);
      noise.start(now);
      noise.stop(now + 0.2);
    }
  }

  blip(up = true) {
    if (!this.initialized) return;
    const context = this.context;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(up ? 620 : 520, now);
    oscillator.frequency.exponentialRampToValueAtTime(up ? 1040 : 300, now + 0.12);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.19);
  }

  click() {
    if (!this.initialized) return;
    const context = this.context;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = 180;
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.07);
  }

  toggleMuted() {
    this.muted = !this.muted;
    try { localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0'); } catch { /* ignored */ }
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.72, this.context.currentTime, 0.03);
    return this.muted;
  }
}
