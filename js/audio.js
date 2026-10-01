'use strict';
/* =========================================================================
 * audio.js — efeitos sonoros sintetizados (WebAudio) e música eletrônica
 * procedural com sequenciador. Nenhum arquivo de áudio é necessário.
 * ========================================================================= */
(function () {
  const BL = window.BL;

  const A = (BL.Audio = {
    ctx: null,
    master: null,
    sfxGain: null,
    musicGain: null,
    noiseBuf: null,
    last: {},

    /** Precisa ser chamado a partir de um gesto do usuário (click/tecla). */
    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.connect(comp);
      this.sfxGain = ctx.createGain();
      this.sfxGain.connect(this.master);
      this.musicGain = ctx.createGain();
      this.musicGain.connect(this.master);
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
    },

    applyVolumes() {
      if (!this.ctx) return;
      const s = BL.Save.data.settings;
      this.sfxGain.gain.value = s.sfx * 0.9;
      this.musicGain.gain.value = s.music * 0.55;
    },

    suspend() {
      if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
    },
    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    play(name, opts) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const def = SFX[name];
      if (!def) return;
      const now = this.ctx.currentTime;
      const gap = def.gap || 0.03;
      if (this.last[name] !== undefined && now - this.last[name] < gap) return;
      this.last[name] = now;
      def.fn(now, opts || {});
    },
  });

  // ---------------------------------------------------------------- helpers
  function env(g, t, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function osc(type, f0, f1, t, dur, vol, dest, attack) {
    const c = A.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, vol, attack || 0.005, dur);
    o.connect(g);
    g.connect(dest || A.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  function noise(t, dur, vol, ftype, freq, q, dest, freqEnd) {
    const c = A.ctx;
    const src = c.createBufferSource();
    src.buffer = A.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = ftype;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q || 1;
    const g = c.createGain();
    env(g, t, vol, 0.004, dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest || A.sfxGain);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  function whistle(t, dur, vol) {
    const c = A.ctx;
    const o = osc('sine', 2750, 2750, t, dur, vol);
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 28;
    lg.gain.value = 140;
    lfo.connect(lg);
    lg.connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }

  // --------------------------------------------------------------- efeitos
  const SFX = {
    kick: {
      gap: 0.04,
      fn(t) {
        noise(t, 0.05, 0.22, 'highpass', 1400);
        osc('sine', 190, 55, t, 0.11, 0.45);
      },
    },
    shoot: {
      gap: 0.05,
      fn(t) {
        osc('triangle', 950, 480, t, 0.05, 0.12);
      },
    },
    power: {
      gap: 0.1,
      fn(t) {
        noise(t, 0.12, 0.35, 'bandpass', 900, 0.8, null, 3000);
        osc('sawtooth', 120, 40, t, 0.22, 0.3);
      },
    },
    impact: {
      gap: 0.15,
      fn(t) {
        noise(t, 0.09, 0.4, 'highpass', 2200, 0.8, null, 500);
        osc('sawtooth', 1400, 90, t, 0.16, 0.22);
        osc('sine', 150, 38, t, 0.3, 0.5);
      },
    },
    hit: {
      gap: 0.028,
      fn(t) {
        noise(t, 0.045, 0.16, 'bandpass', 2600, 1.4);
        osc('square', 240, 110, t, 0.04, 0.05);
      },
    },
    kill: {
      gap: 0.035,
      fn(t, o) {
        const p = 1 + Math.min(o.combo || 0, 60) * 0.012;
        osc('square', 420 * p, 840 * p, t, 0.07, 0.07);
        noise(t, 0.06, 0.12, 'lowpass', 1400);
      },
    },
    xp: {
      gap: 0.025,
      fn(t, o) {
        const p = o.pitch || 1;
        osc('sine', 1050 * p, 1600 * p, t, 0.06, 0.09);
      },
    },
    pickup: {
      gap: 0.1,
      fn(t) {
        osc('triangle', 600, 1200, t, 0.12, 0.18);
        osc('triangle', 900, 1800, t + 0.08, 0.12, 0.14);
      },
    },
    levelup: {
      gap: 0.2,
      fn(t) {
        [523, 659, 784, 1047, 1319].forEach((f, i) => osc('square', f, f, t + i * 0.06, 0.12, 0.1));
        [523, 784, 1047].forEach((f) => osc('triangle', f, f, t + 0.32, 0.6, 0.12, null, 0.02));
      },
    },
    select: {
      gap: 0.1,
      fn(t) {
        osc('square', 660, 990, t, 0.08, 0.12);
        osc('square', 990, 1320, t + 0.07, 0.12, 0.1);
      },
    },
    click: {
      gap: 0.04,
      fn(t) {
        osc('square', 880, 880, t, 0.03, 0.05);
      },
    },
    hurt: {
      gap: 0.12,
      fn(t) {
        osc('sawtooth', 280, 80, t, 0.2, 0.25);
        noise(t, 0.12, 0.2, 'lowpass', 900);
      },
    },
    dash: {
      gap: 0.08,
      fn(t) {
        noise(t, 0.2, 0.3, 'bandpass', 500, 1.2, null, 3500);
      },
    },
    wave: {
      gap: 0.5,
      fn(t) {
        whistle(t, 0.22, 0.1);
        whistle(t + 0.3, 0.5, 0.1);
      },
    },
    explosion: {
      gap: 0.06,
      fn(t, o) {
        const big = o.big ? 1.6 : 1;
        noise(t, 0.4 * big, 0.45, 'lowpass', 2200, 0.7, null, 90);
        osc('sine', 130, 30, t, 0.35 * big, 0.55);
      },
    },
    shock: {
      gap: 0.08,
      fn(t) {
        noise(t, 0.25, 0.25, 'bandpass', 300, 0.8, null, 1800);
        osc('sine', 90, 45, t, 0.2, 0.3);
      },
    },
    enemyShot: {
      gap: 0.06,
      fn(t) {
        osc('square', 420, 190, t, 0.06, 0.05);
      },
    },
    charge: {
      gap: 0.2,
      fn(t) {
        osc('sawtooth', 90, 420, t, 0.5, 0.12);
      },
    },
    boss: {
      gap: 1,
      fn(t) {
        osc('sawtooth', 55, 55, t, 1.6, 0.25, null, 0.1);
        osc('sawtooth', 58, 58, t, 1.6, 0.2, null, 0.1);
        for (let i = 0; i < 3; i++) osc('square', 440, 880, t + i * 0.4, 0.3, 0.09);
        noise(t, 0.8, 0.3, 'lowpass', 400);
      },
    },
    bossDown: {
      gap: 1,
      fn(t) {
        noise(t, 1.2, 0.5, 'lowpass', 3000, 0.7, null, 60);
        [392, 523, 659, 784, 1047].forEach((f, i) => osc('square', f, f, t + 0.3 + i * 0.09, 0.2, 0.1));
        whistle(t + 0.9, 0.7, 0.1);
      },
    },
    flow: {
      gap: 1,
      fn(t) {
        osc('sawtooth', 160, 1800, t, 0.6, 0.14);
        noise(t, 0.6, 0.2, 'highpass', 800, 1, null, 6000);
        [523, 659, 784, 988].forEach((f) => osc('triangle', f, f, t + 0.25, 1.1, 0.07, null, 0.05));
      },
    },
    combo: {
      gap: 0.2,
      fn(t, o) {
        const base = 520 + Math.min(o.tier || 0, 8) * 60;
        osc('square', base, base * 1.5, t, 0.1, 0.1);
        osc('square', base * 1.5, base * 2, t + 0.08, 0.14, 0.08);
      },
    },
    evolve: {
      gap: 1,
      fn(t) {
        [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => osc('square', f, f * 1.01, t + i * 0.05, 0.3, 0.08));
        osc('sawtooth', 100, 1600, t, 0.8, 0.1);
      },
    },
    victory: {
      gap: 1,
      fn(t) {
        whistle(t, 0.18, 0.1);
        whistle(t + 0.25, 0.18, 0.1);
        whistle(t + 0.5, 0.7, 0.1);
        [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => osc('square', f, f, t + 0.9 + i * 0.09, 0.25, 0.09));
        [523, 784, 1047].forEach((f) => osc('triangle', f, f, t + 1.5, 0.9, 0.12, null, 0.02));
      },
    },
    gameover: {
      gap: 1,
      fn(t) {
        [440, 392, 330, 262, 196].forEach((f, i) => osc('square', f, f * 0.98, t + i * 0.18, 0.25, 0.1));
        osc('sawtooth', 200, 40, t + 0.9, 1.2, 0.2);
        whistle(t, 0.9, 0.08);
      },
    },
  };

  // ---------------------------------------------------------------- música
  // Sequenciador em 16 passos, 128 BPM, progressão Am - F - C - G.
  const CHORDS = [
    [220.0, 261.63, 329.63], // Am
    [174.61, 220.0, 261.63], // F
    [261.63, 329.63, 392.0], // C
    [196.0, 246.94, 293.66], // G
  ];
  const BASS = [55.0, 43.65, 65.41, 49.0];
  const LEAD = [0, 2, 1, 2, 0, 2, 1, 0, 2, 1, 2, 0, 1, 2, 0, 1];

  const M = (A.music = {
    playing: false,
    intensity: 0,
    step: 0,
    nextTime: 0,
    timer: null,
    bpm: 128,

    start(intensity) {
      if (!A.ctx) return;
      this.intensity = intensity;
      if (this.playing) return;
      this.playing = true;
      this.step = 0;
      this.nextTime = A.ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.tick(), 25);
    },
    stop() {
      this.playing = false;
      clearInterval(this.timer);
      this.timer = null;
    },
    setIntensity(n) {
      this.intensity = n;
    },
    tick() {
      if (!A.ctx || A.ctx.state !== 'running') return;
      const stepDur = 60 / this.bpm / 4;
      // evita "rajada" de notas acumuladas após o contexto ficar suspenso
      if (this.nextTime < A.ctx.currentTime - 0.2) this.nextTime = A.ctx.currentTime + 0.05;
      while (this.nextTime < A.ctx.currentTime + 0.14) {
        this.playStep(this.step, this.nextTime, stepDur);
        this.nextTime += stepDur;
        this.step = (this.step + 1) % 64;
      }
    },
    playStep(step, t, sd) {
      const out = A.musicGain;
      const I = this.intensity;
      const bar = Math.floor(step / 16) % 4;
      const s = step % 16;
      const chord = CHORDS[bar];

      // kick
      if (I === 0 ? s % 8 === 0 : s % 4 === 0) osc('sine', 150, 42, t, 0.22, I === 0 ? 0.35 : 0.6, out);
      // clap
      if (I >= 1 && (s === 4 || s === 12)) noise(t, 0.12, 0.22, 'bandpass', 1700, 0.9, out);
      // hats
      if (I >= 1 && s % 4 === 2) noise(t, 0.035, 0.12, 'highpass', 7500, 1, out);
      if (I >= 2 && s % 2 === 1) noise(t, 0.02, 0.07, 'highpass', 9000, 1, out);
      // bass
      if (I >= 1) {
        if ([0, 3, 6, 8, 11, 14].includes(s)) osc('sawtooth', BASS[bar], BASS[bar], t, sd * 1.6, 0.16, out);
        if (s === 2 || s === 10) osc('sawtooth', BASS[bar] * 2, BASS[bar] * 2, t, sd, 0.12, out);
      } else if (s === 0) {
        osc('triangle', BASS[bar] * 2, BASS[bar] * 2, t, sd * 14, 0.18, out, 0.05);
      }
      // pad no início de cada compasso
      if (s === 0) {
        for (const f of chord) osc('triangle', f, f, t, sd * 15, I === 0 ? 0.05 : 0.035, out, 0.2);
      }
      // arpejo
      if (I === 0 ? s % 4 === 0 : true) {
        const f = chord[LEAD[s] % 3] * (I >= 2 ? 4 : 2);
        const vol = I === 0 ? 0.03 : I === 1 ? 0.035 : 0.05;
        osc(I >= 2 ? 'sawtooth' : 'square', f, f, t, sd * 0.8, vol, out);
      }
      // stab tenso nos momentos de boss/flow
      if (I >= 2 && (s === 0 || s === 6 || s === 12)) {
        for (const f of chord) osc('sawtooth', f * 2, f * 2, t, sd * 1.2, 0.03, out);
      }
    },
  });
})();
