'use strict';
/* =========================================================================
 * waves.js — controle de waves: tempo, escalonamento de dificuldade,
 * spawn contínuo nas bordas da tela, eventos (HIGH PRESS, COUNTER
 * ATTACK), elites, bosses e o SKIP WAVE.
 *
 * cfg (opcional — o modo história passa a sua, ver story.js):
 *   waveTime  duração de cada wave em segundos
 *   total     nº de waves (Infinity = modo infinito)
 *   offset    waves somadas à dificuldade (wave 1 com offset 3 = wave 4)
 *   bossAt    { wave: { key, hp } } — bosses fixos; sem isso, a cada 5 waves
 *   bossDmg   multiplicador de dano dos bosses
 * ========================================================================= */
(function () {
  const BL = window.BL;
  const U = BL.U;
  const CFG = BL.CFG;

  class Waves {
    constructor(game, cfg) {
      this.g = game;
      this.cfg = Object.assign({ waveTime: CFG.WAVE_TIME, total: Infinity, offset: 0, bossAt: null, bossDmg: 1 }, cfg);
      this.wave = 1;
      this.timeLeft = this.cfg.waveTime;
      this.spawnAcc = 0;
      this.events = [];
      this.bossAlive = null;
      this.bossPending = 0;
      this.pressureT = 0; // horda extra depois de um SKIP
      this.done = false;
      this.setupEvents();
    }

    /** wave "de dificuldade": a wave atual + o offset do capítulo */
    lvl() {
      return this.wave + this.cfg.offset;
    }

    isBossWave(w) {
      w = w || this.wave;
      if (this.cfg.bossAt) return !!this.cfg.bossAt[w];
      return w % CFG.BOSS_EVERY === 0;
    }

    /** multiplicadores de atributos da wave atual (crescimento equilibrado) */
    scaling() {
      const w = this.lvl() - 1;
      return {
        hp: 1 + 0.22 * w + 0.012 * w * w,
        spd: Math.min(1.45, 1 + 0.03 * w),
        dmg: 1 + 0.11 * w,
        xp: 1 + 0.08 * w,
      };
    }

    params() {
      const w = this.lvl();
      const boss = this.bossAlive ? 0.55 : 1;
      const press = this.pressureT > 0 ? 1.5 : 1;
      return {
        // teto na taxa: o limite de rivais vivos já segura o fim do jogo
        rate: Math.min(26, 1.3 + 0.5 * w + 0.03 * w * w) * boss * press,
        maxAlive: Math.min(CFG.MAX_ENEMIES, 45 + 28 * w + (press > 1 ? 60 : 0)),
      };
    }

    typeWeights() {
      const w = this.lvl();
      const list = [{ t: 'rival', w: 10 }];
      if (w >= 2) list.push({ t: 'speedster', w: 3 + w * 0.3 });
      if (w >= 3) list.push({ t: 'defender', w: 1.6 + w * 0.25 });
      if (w >= 4) list.push({ t: 'striker', w: 1.3 + w * 0.2 });
      if (w >= 6) list.push({ t: 'playmaker', w: 0.7 + w * 0.08 });
      return list;
    }

    setupEvents() {
      const w = this.lvl();
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
      this.timeLeft = this.cfg.waveTime;
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

      if (this.done) return;
      if (this.pressureT > 0) this.pressureT -= dt;
      if (this.timeLeft > 0) this.timeLeft = Math.max(0, this.timeLeft - dt);
      const elapsed = this.cfg.waveTime - this.timeLeft;
      for (const ev of this.events) {
        if (!ev.done && elapsed >= ev.at) {
          ev.done = true;
          this.runEvent(ev.kind);
        }
      }

      if (this.timeLeft <= 0 && !this.bossAlive && this.bossPending <= 0) {
        if (this.wave >= this.cfg.total) {
          this.done = true;
          g.onStageClear();
        } else this.startNext();
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

    // ================================================================= SKIP
    canSkip() {
      return (
        !this.done && !this.bossAlive && this.bossPending <= 0 && !this.isBossWave() &&
        this.wave < this.cfg.total && this.timeLeft > 3 && this.cfg.waveTime - this.timeLeft >= 5
      );
    }

    /**
     * Pula o resto da wave. Não é de graça: os eventos que faltavam disparam
     * agora, os rivais que ainda viriam chegam todos juntos e a wave seguinte
     * começa com spawn acelerado. Retorna quantos rivais vieram na horda.
     */
    skip() {
      const g = this.g;
      const rem = this.timeLeft;
      for (const ev of this.events) {
        if (ev.done) continue;
        ev.done = true;
        this.runEvent(ev.kind);
      }
      const n = Math.min(80, Math.round(this.params().rate * rem * 0.5));
      const weights = this.typeWeights();
      let spawned = 0;
      for (let i = 0; i < n; i++) {
        const pos = this.offscreenPos(30 + Math.random() * 70);
        if (pos && g.spawnEnemy(U.weighted(weights).t, pos.x, pos.y, { spawnT: Math.random() * 1.2 })) spawned++;
      }
      this.pressureT = 15;
      this.startNext();
      return spawned;
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
        const n = Math.min(40, 12 + this.lvl() * 2);
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
        const n = Math.min(34, 10 + this.lvl());
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
      const N = BL.BossDefs.length;
      const fixed = this.cfg.bossAt && this.cfg.bossAt[this.wave];
      let idx, n, hpMul = 1;
      if (fixed) {
        idx = BL.bossIndex(fixed.key);
        n = idx + 1;
        hpMul = fixed.hp || 1;
      } else {
        // n = ordem do boss na partida (wave 5 = 1º, wave 10 = 2º...)
        n = Math.max(1, Math.ceil(this.wave / CFG.BOSS_EVERY));
        idx = (n - 1) % N;
      }
      const pos = this.offscreenPos(10) || { x: g.player.x + 200, y: g.player.y };
      const e = BL.Enemies.createBoss(g, idx, n, pos.x, pos.y, { hpMul, dmgMul: this.cfg.bossDmg });
      g.enemies.push(e);
      this.bossAlive = e;
      g.onBossSpawn(e);
    }
  }

  BL.Waves = Waves;
})();
