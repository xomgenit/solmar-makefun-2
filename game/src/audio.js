// WebAudio-synthesised sound for SOLMAR: no audio files, everything is
// generated (engine hum, siren wail, gunshots, crashes, jingles). The context
// is created lazily on the first user gesture; every call is guarded so the
// game runs silently and safely in a headless browser.
export function createAudio() {
  const audio = {
    ctx: null, muted: false,
    sirenNodes: null, engineNodes: null,

    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return this.ctx;
      }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
      } catch { this.ctx = null; }
      return this.ctx;
    },

    tone(freq, dur, type = 'sine', vol = 0.15, slideTo = null) {
      if (this.muted) return;
      const ctx = this.ensure();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + dur + 0.02);
      } catch { /* silent */ }
    },

    noise(dur, vol = 0.2, lowpass = 1200) {
      if (this.muted) return;
      const ctx = this.ensure();
      if (!ctx) return;
      try {
        const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = lowpass;
        const gain = ctx.createGain();
        gain.gain.value = vol;
        src.connect(filter).connect(gain).connect(ctx.destination);
        src.start();
      } catch { /* silent */ }
    },

    click() { this.tone(660, 0.07, 'square', 0.06); },
    shoot() { this.noise(0.12, 0.25, 3000); this.tone(180, 0.09, 'sawtooth', 0.12, 60); },
    crash() { this.noise(0.25, 0.3, 500); this.tone(70, 0.25, 'sine', 0.25, 40); },
    pickup() { this.tone(880, 0.09, 'sine', 0.12); setTimeout(() => this.tone(1320, 0.12, 'sine', 0.12), 80); },
    cash() { this.tone(1046, 0.08, 'triangle', 0.12); setTimeout(() => this.tone(1568, 0.14, 'triangle', 0.12), 90); },
    jingle() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'triangle', 0.12), i * 110));
    },
    wasted() { [392, 311, 233].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'sawtooth', 0.1), i * 220)); },
    horn() { this.tone(370, 0.18, 'square', 0.07); this.tone(466, 0.18, 'square', 0.05); },

    sirenStart() {
      if (this.muted || this.sirenNodes) return;
      const ctx = this.ensure();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        osc.type = 'triangle'; osc.frequency.value = 900;
        lfo.type = 'sine'; lfo.frequency.value = 0.7;
        lfoGain.gain.value = 350;
        gain.gain.value = 0.045;
        lfo.connect(lfoGain).connect(osc.frequency);
        osc.connect(gain).connect(ctx.destination);
        osc.start(); lfo.start();
        this.sirenNodes = { osc, lfo, gain };
      } catch { this.sirenNodes = null; }
    },

    sirenStop() {
      if (!this.sirenNodes) return;
      try { this.sirenNodes.osc.stop(); this.sirenNodes.lfo.stop(); } catch { /* already stopped */ }
      this.sirenNodes = null;
    },

    engineSet(running, speed01) {
      if (this.muted) { this.engineStop(); return; }
      if (!running) { this.engineStop(); return; }
      const ctx = this.ensure();
      if (!ctx) return;
      try {
        if (!this.engineNodes) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();
          osc.type = 'sawtooth'; osc.frequency.value = 70;
          filter.type = 'lowpass'; filter.frequency.value = 400;
          gain.gain.value = 0.035;
          osc.connect(filter).connect(gain).connect(ctx.destination);
          osc.start();
          this.engineNodes = { osc, gain };
        }
        this.engineNodes.osc.frequency.setTargetAtTime(60 + speed01 * 160, ctx.currentTime, 0.08);
      } catch { /* silent */ }
    },

    engineStop() {
      if (!this.engineNodes) return;
      try { this.engineNodes.osc.stop(); } catch { /* already stopped */ }
      this.engineNodes = null;
    },

    stopAll() { this.sirenStop(); this.engineStop(); },
  };
  return audio;
}
