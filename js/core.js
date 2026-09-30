'use strict';
/* =========================================================================
 * core.js — namespace global, configuração e utilitários matemáticos.
 * Todos os outros arquivos anexam seus módulos em window.BL.
 * (Scripts clássicos em vez de ES modules para o jogo funcionar abrindo
 *  o index.html direto do disco, sem servidor.)
 * ========================================================================= */
(function () {
  const BL = (window.BL = window.BL || {});

  // celular/tablet: toque como entrada principal
  const MOBILE = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window && navigator.maxTouchPoints > 0);

  BL.CFG = {
    MOBILE,
    WORLD_W: 2560,
    WORLD_H: 1760,
    WALL: 136, // espessura das arquibancadas (área sólida nas bordas)
    TRACK: 48, // pista entre arquibancada e gramado
    CELL: 32, // célula do pathfinding / spatial hash
    WAVE_TIME: 60,
    BOSS_EVERY: 5,
    MAX_ENEMIES: 420,
    MAX_PARTICLES: MOBILE ? 800 : 1500, // menos partículas no celular
    MAX_ORBS: 380,
    MAX_TEXTS: 70,
    WEAPON_SLOTS: 6,
    PASSIVE_SLOTS: 6,
    DEBUG: /[?&]debug=1/.test(location.search),
  };

  const U = (BL.U = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    damp: (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt)),
    rand: (a, b) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    chance: (p) => Math.random() < p,
    pick: (arr) => arr[(Math.random() * arr.length) | 0],
    dist2(ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay;
      return dx * dx + dy * dy;
    },
    dist(ax, ay, bx, by) {
      return Math.sqrt(U.dist2(ax, ay, bx, by));
    },
    angle: (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax),
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
      }
      return arr;
    },
    /** entries: [{w: peso, ...}] -> retorna uma entrada */
    weighted(entries) {
      let total = 0;
      for (const e of entries) total += e.w;
      let r = Math.random() * total;
      for (const e of entries) {
        r -= e.w;
        if (r <= 0) return e;
      }
      return entries[entries.length - 1];
    },
    /** remove em O(1) trocando com o último (a ordem não importa) */
    removeAt(arr, i) {
      const last = arr.pop();
      if (i < arr.length) arr[i] = last;
    },
    pad2: (n) => (n < 10 ? '0' + n : '' + n),
    fmtTime(s) {
      s = Math.max(0, Math.floor(s));
      return U.pad2(Math.floor(s / 60)) + ':' + U.pad2(s % 60);
    },
    roman(n) {
      return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || String(n);
    },
    /** RNG determinístico (mulberry32) para geração procedural do mapa */
    makeRng(seed) {
      let a = seed >>> 0;
      const rng = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      rng.range = (lo, hi) => lo + rng() * (hi - lo);
      rng.int = (lo, hi) => Math.floor(lo + rng() * (hi - lo + 1));
      rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
      return rng;
    },
    hexToRgb(hex) {
      const h = hex.replace('#', '');
      const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    },
  });

  let uid = 1;
  BL.nextId = () => uid++;
})();
