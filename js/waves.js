'use strict';
/* =========================================================================
 * waves.js — controle de waves: tempo, escalonamento de dificuldade,
 * spawn contínuo nas bordas da tela, eventos (HIGH PRESS, COUNTER
 * ATTACK), elites e bosses a cada 5 waves.
 * ========================================================================= */
(function () {
  const BL = window.BL;
  const U = BL.U;
  const CFG = BL.CFG;

  class Waves {
    constructor(game) {
      this.g = game;
      this.wave = 1;
      this.timeLeft = CFG.WAVE_TIME;
      this.spawnAcc = 0;
      this.events = [];
      this.bossAlive = null;
      this.bossPending = 0;
      this.setupEvents();
    }

    isBossWave(w) {
      return (w || this.wave) % CFG.BOSS_EVERY === 0;
    }

    /** multiplicadores de atributos da wave atual (crescimento equilibrado) */
    scaling() {
      const w = this.wave - 1;
      return {
        hp: 1 + 0.22 * w + 0.012 * w * w,
        spd: Math.min(1.45, 1 + 0.03 * w),
        dmg: 1 + 0.11 * w,
        xp: 1 + 0.08 * w,
      };
    }

    params() {
      const w = this.wave;
      const boss = this.bossAlive ? 0.55 : 1;
      return {
        rate: (1.3 + 0.5 * w + 0.03 * w * w) * boss,
        maxAlive: Math.min(CFG.MAX_ENEMIES, 45 + 28 * w),
      };
    }

    typeWeights() {
      const w = this.wave;
      const list = [{ t: 'rival', w: 10 }];
      if (w >= 2) list.push({ t: 'speedster', w: 3 + w * 0.3 });
      if (w >= 3) list.push({ t: 'defender', w: 1.6 + w * 0.25 });
      if (w >= 4) list.push({ t: 'striker', w: 1.3 + w * 0.2 });
      if (w >= 6) list.push({ t: 'playmaker', w: 0.7 + w * 0.08 });
      return list;
    }

    setupEvents() {
      const w = this.wave;
      this.events = [];
      // elites (a partir da wave 3)
      if (w >= 3) this.events.push({ at: 30, kind: 'elite' });
      if (w >= 7) this.events.push({ at: 15, kind: 'elite' });
      if (w >= 12) this.events.push({ at: 45, kind: 'elite' });
      // HIGH PRESS: anel de rivais ao redor do jogador
      if (w >= 2 && !this.isBossWave()) this.events.push({ at: 40, kind: 'press' });
      // COUNTER ATTACK: linha de speedsters cruzando a tela
      if (w >= 3 && w % 3 === 0) this.events.push({ at: 20, kind: 'counter' });
      if (this.isBossWave()) this.bossPending = 2.5;
    }

    startNext() {
      this.wave++;
      this.timeLeft = CFG.WAVE_TIME;
      this.setupEvents();
      this.g.onWaveStart(this.wave);
    }

    update(dt) {
      const g = this.g;
      if (this.bossAlive && this.bossAlive.dead) this.bossAlive = null;

      if (this.bossPending > 0) {
        this.bossPending -= dt;
        if (this.bossPending <= 0) this.spawnBoss();
      }

      if (this.timeLeft > 0) this.timeLeft = Math.max(0, this.timeLeft - dt);
      const elapsed = CFG.WAVE_TIME - this.timeLeft;
      for (const ev of this.events) {
        if (!ev.done && elapsed >= ev.at) {
          ev.done = true;
          this.runEvent(ev.kind);
        }
      }

      if (this.timeLeft <= 0 && !this.bossAlive && this.bossPending <= 0) {
        this.startNext();
        return;
      }

      // spawn contínuo
      const P = this.params();
      if (g.enemies.length < P.maxAlive) {
        this.spawnAcc += P.rate * dt;
        const weights = this.typeWeights();
        while (this.spawnAcc >= 1) {
          this.spawnAcc -= 1;
          const t = U.weighted(weights).t;
          const pos = this.offscreenPos();
          if (pos) g.spawnEnemy(t, pos.x, pos.y);
        }
      } else this.spawnAcc = 0;
    }

    /** posição fora da tela, dentro da arena e livre de obstáculos */
    offscreenPos(margin) {
      const g = this.g;
      const p = g.player;
      const v = g.view;
      const b = g.map.bounds;
      margin = margin || 30;
      const hw = v.w / 2 + margin, hh = v.h / 2 + margin;
      for (let i = 0; i < 14; i++) {
        let x, y;
        const side = (Math.random() * 4) | 0;
        if (side === 0) { x = p.x + U.rand(-hw, hw); y = p.y - hh; }
        else if (side === 1) { x = p.x + U.rand(-hw, hw); y = p.y + hh; }
        else if (side === 2) { x = p.x - hw; y = p.y + U.rand(-hh, hh); }
        else { x = p.x + hw; y = p.y + U.rand(-hh, hh); }
        if (x < b.x0 + 10 || x > b.x1 - 10 || y < b.y0 + 10 || y > b.y1 - 10) continue;
        if (BL.Collision.pointSolid(g.map, x, y)) continue;
        return { x, y };
      }
      // fallback: ponto aleatório longe do jogador (jogador encostado num canto)
      for (let i = 0; i < 10; i++) {
        const x = U.rand(b.x0 + 20, b.x1 - 20), y = U.rand(b.y0 + 20, b.y1 - 20);
        if (U.dist(x, y, p.x, p.y) > Math.max(hw, hh) && !BL.Collision.pointSolid(g.map, x, y)) return { x, y };
      }
      return null;
    }

    runEvent(kind) {
      const g = this.g;
      const p = g.player;
      const b = g.map.bounds;
      if (kind === 'elite') {
        const pos = this.offscreenPos(40);
        if (pos) {
          g.spawnEnemy('elite', pos.x, pos.y);
          g.banner('ELITE RIVAL!', 'warn');
        }
      } else if (kind === 'press') {
        const n = Math.min(40, 12 + this.wave * 2);
        const r = Math.min(g.view.w, g.view.h) * 0.5 + 10;
        const types = this.typeWeights();
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const x = U.clamp(p.x + Math.cos(a) * r, b.x0 + 12, b.x1 - 12);
          const y = U.clamp(p.y + Math.sin(a) * r, b.y0 + 12, b.y1 - 12);
          if (BL.Collision.pointSolid(g.map, x, y)) continue;
          g.spawnEnemy(i % 4 === 0 && types.length > 1 ? types[1].t : 'rival', x, y, { spawnT: 0.9 });
        }
        g.banner('HIGH PRESS!', 'warn');
      } else if (kind === 'counter') {
        const n = 10 + this.wave;
        const fromLeft = Math.random() < 0.5;
        const hw = g.view.w / 2 + 20;
        for (let i = 0; i < n; i++) {
          const x = U.clamp(p.x + (fromLeft ? -hw : hw) + U.rand(-30, 30), b.x0 + 10, b.x1 - 10);
          const y = U.clamp(p.y + (i - n / 2) * 16, b.y0 + 10, b.y1 - 10);
          const e = g.spawnEnemy('speedster', x, y);
          if (e) {
            e.lockT = 3.2;
            e.lockX = fromLeft ? 1 : -1;
            e.lockY = 0;
            e.lockSpd = 1.6;
          }
        }
        g.banner('COUNTER ATTACK!', 'warn');
      }
    }

    spawnBoss() {
      const g = this.g;
      const idx = (this.wave / CFG.BOSS_EVERY - 1) % BL.BossDefs.length;
      const cycle = Math.floor((this.wave / CFG.BOSS_EVERY - 1) / BL.BossDefs.length);
      const pos = this.offscreenPos(10) || { x: g.player.x + 200, y: g.player.y };
      const e = BL.Enemies.createBoss(g, idx, cycle, pos.x, pos.y);
      g.enemies.push(e);
      this.bossAlive = e;
      g.onBossSpawn(e);
    }
  }

  BL.Waves = Waves;
})();
