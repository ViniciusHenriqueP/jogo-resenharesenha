'use strict';
/* =========================================================================
 * game.js — classe Game: estados (menu, playing, levelup, paused,
 * gameover), modos (infinito / história), loop de atualização, combate,
 * XP, combo, FLOW, câmera e
 * renderização em camadas (chão -> sombras -> entidades ordenadas por Y
 * -> projéteis -> partículas -> overlays de tela).
 * ========================================================================= */
(function () {
  const BL = window.BL;
  const U = BL.U;
  const CFG = BL.CFG;

  const COMBO_MILESTONES = [10, 25, 50, 100, 150, 200, 300, 400, 500, 750, 1000];
  const xpNeed = (L) => Math.floor(100 + 50 * (L - 1) + 10 * Math.pow(L - 1, 1.5));
  BL.xpNeed = xpNeed;

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.state = 'menu';
      this.view = { x: 0, y: 0, w: 640, h: 360 };
      this.scale = 1;
      this.grid = new BL.Collision.SpatialHash(CFG.WORLD_W, CFG.WORLD_H, CFG.CELL);
      this.enemies = [];
      this.orbs = [];
      this.pickups = [];
      this.zones = [];
      this.timers = [];
      this.drawList = [];
      this.buf = [];
      this.ebuf = [];
      this.menuMap = BL.Map.generate(20260930);
      this.map = this.menuMap;
      this.cam = { x: this.map.field.cx, y: this.map.field.cy };
      this.shakeAmt = 0;
      this.time = 0;
      this.menuT = 0;
      this.flowT = 0;
      this.egoActive = false;
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }

    resize() {
      const W = window.innerWidth, H = window.innerHeight;
      let s = Math.min(W, H) / 330;
      if (s >= 2) s = Math.floor(s); // escala inteira = pixels perfeitos
      s = Math.max(1, s);
      this.scale = s;
      this.view.w = Math.ceil(W / s);
      this.view.h = Math.ceil(H / s);
      this.canvas.width = this.view.w;
      this.canvas.height = this.view.h;
      this.ctx.imageSmoothingEnabled = false;
      // vinheta pré-renderizada
      const v = (this.vignette = BL.Sprites.canvas(this.view.w, this.view.h));
      const x = v.getContext('2d');
      const r = Math.hypot(this.view.w, this.view.h) / 2;
      const g = x.createRadialGradient(this.view.w / 2, this.view.h / 2, r * 0.45, this.view.w / 2, this.view.h / 2, r);
      g.addColorStop(0, 'rgba(2,4,12,0)');
      g.addColorStop(1, 'rgba(2,4,12,0.62)');
      x.fillStyle = g;
      x.fillRect(0, 0, this.view.w, this.view.h);
      const hr = x.createRadialGradient(this.view.w / 2, this.view.h / 2, r * 0.35, this.view.w / 2, this.view.h / 2, r);
      hr.addColorStop(0, 'rgba(215,38,61,0)');
      hr.addColorStop(1, 'rgba(215,38,61,0.75)');
      const h = (this.hurtVignette = BL.Sprites.canvas(this.view.w, this.view.h));
      const hx = h.getContext('2d');
      hx.fillStyle = hr;
      hx.fillRect(0, 0, this.view.w, this.view.h);
      if (this.state !== 'playing') this.render();
    }

    // ================================================================ RUN
    /** opts: { mode: 'endless' | 'story', chapter } — sem opts repete a última partida */
    newRun(charId, opts) {
      if (charId) {
        BL.Save.data.character = charId;
        BL.Save.save();
      }
      charId = BL.Save.data.character;
      opts = this.lastRun = opts || this.lastRun || { mode: 'endless' };
      this.mode = opts.mode;
      this.chapter = opts.mode === 'story' ? BL.Story.chapters[opts.chapter] : null;
      BL.Audio.init();
      for (const e of this.enemies) BL.Enemies.release(e);
      this.enemies.length = 0;
      this.orbs.length = 0;
      this.pickups.length = 0;
      this.zones.length = 0;
      this.timers.length = 0;
      BL.Projectiles.reset();
      BL.FX.reset();
      this.map = BL.Map.generate((Math.random() * 1e9) | 0);
      const f = this.map.field;
      this.player = new BL.Player(f.cx, f.cy + 30, charId);
      this.time = 0;
      this.runTime = 0;
      this.kills = 0;
      this.level = 1;
      this.xp = 0;
      this.xpNeed = xpNeed(1);
      this.pendingLevels = 0;
      this.combo = 0;
      this.comboT = 0;
      this.comboDecayT = 0;
      this.maxCombo = 0;
      this.flow = Math.min(100, 20 * BL.Save.metaLevel('flowstart'));
      this.flowT = 0;
      this.flowMax = 8;
      this.flowReady = false;
      this.egoActive = false;
      this.egoCheckT = 0;
      this.trailT = 0;
      this.run = { bossKills: 0, evolutions: 0, bonusEgo: 0, elites: 0, damage: {}, skips: 0, unlocked: [], revives: BL.Save.metaLevel('revive') };
      this.freePicks = this.chapter ? this.chapter.startLevels : 0; // cartas de bônus do modo história
      this.clearT = 0;
      this.cleared = false;
      this.banishMode = false;
      this.boss = null;
      this.timeScale = 1;
      this.hitstop = 0;
      this.dying = 0;
      this.hurtFlash = 0;
      this.whiteFlash = 0;
      this.shakeAmt = 0;
      this.xpPitch = 1;
      this.xpPitchT = 0;
      this.godMode = false;
      this.waves = new BL.Waves(this, this.chapter ? BL.Story.wavesCfg(this.chapter) : null);
      this.build = new BL.Abilities.Build(this);
      // habilidades iniciais do personagem escolhido
      for (const [id, lvl] of this.player.char.start) for (let i = 0; i < lvl; i++) this.build.add(id);
      this.player.hp = this.player.stats.maxHp;
      this.cam.x = this.player.x;
      this.cam.y = this.player.y;
      this.state = 'playing';
      BL.UI.onRunStart(this);
      BL.Audio.music.start(1);
      BL.Audio.music.setIntensity(1);
      this.onWaveStart(1);
    }

    // ============================================================== FRAME
    frame(dt) {
      if (this.state === 'playing') {
        this.update(dt);
        if (this.state !== 'menu') this.render();
      } else if (this.state === 'menu') {
        this.menuT += dt;
        this.renderMenu(dt);
      } else if (this.state === 'gameover') {
        // cena congelada ao fundo, partículas continuam
        BL.FX.update(dt * 0.5);
        this.render();
      }
    }

    update(dtReal) {
      const I = BL.Input;
      if (I.hit('escape', 'p')) {
        if (!this.dying) return this.pause();
      }
      if (CFG.DEBUG) this.debugKeys();

      let dt = dtReal * this.timeScale;
      if (this.hitstop > 0) {
        this.hitstop -= dtReal;
        dt *= 0.2;
      }
      if (this.dying > 0) {
        this.dying -= dtReal;
        dt = dtReal * 0.25;
        if (this.dying <= 0) return this.endRun(false);
      } else if (this.clearT > 0) {
        this.clearT -= dtReal;
        dt = dtReal * 0.5;
        if (this.clearT <= 0) return this.endRun(true);
      } else this.runTime += dt;
      this.time += dt;
      const p = this.player;

      if (!this.dying) {
        if (I.hit(' ', 'shift')) p.tryDash(this);
        if (I.hit('f')) this.activateFlow();
        if (I.hit('q')) this.skipWave();
      }

      // timers agendados
      for (let i = this.timers.length - 1; i >= 0; i--) {
        const t = this.timers[i];
        t.t -= dt;
        if (t.t <= 0) {
          U.removeAt(this.timers, i);
          t.fn();
        }
      }

      if (!this.dying) p.update(dt, this);
      this.updateFlowEgoCombo(dt);
      if (!this.dying) this.build.update(dt);
      this.waves.update(dt);

      this.map.flow.update(p.x, p.y);
      this.rebuildGrid();
      for (const e of this.enemies) if (!e.dead) BL.Enemies.update(this, e, dt);
      this.rebuildGrid();
      BL.Projectiles.update(this, dt);
      this.updateZones(dt);
      this.updateOrbs(dt);
      this.updatePickups(dt);

      // limpeza de mortos
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (e.dead) {
          BL.Enemies.release(e);
          U.removeAt(this.enemies, i);
        }
      }

      BL.FX.update(dt);
      this.updateCamera(dtReal);
      if (this.hurtFlash > 0) this.hurtFlash -= dtReal;
      if (this.whiteFlash > 0) this.whiteFlash -= dtReal;

      BL.Audio.music.setIntensity(this.boss || this.flowT > 0 ? 2 : 1);
      BL.UI.updateHUD(this);

      if ((this.pendingLevels > 0 || this.freePicks > 0) && !this.dying && !this.cleared && this.state === 'playing') this.openLevelUp();
    }

    rebuildGrid() {
      this.grid.clear();
      for (const e of this.enemies) if (!e.dead) this.grid.insert(e);
    }

    updateFlowEgoCombo(dt) {
      const p = this.player;
      if (this.flowT > 0) {
        this.flowT -= dt;
        if (this.flowT <= 0) {
          this.flowT = 0;
          BL.UI.setFlowMode(false);
        }
      }
      // EGO: cercado por muitos rivais
      this.egoCheckT -= dt;
      if (this.egoCheckT <= 0) {
        this.egoCheckT = 0.2;
        const was = this.egoActive;
        this.egoActive = false;
        if (p.stats.egoLvl > 0) {
          this.grid.query(p.x, p.y, 90, this.buf);
          let n = 0;
          for (const e of this.buf) if (!e.dead && U.dist2(e.x, e.y, p.x, p.y) < 8100) n++;
          this.egoActive = n >= 8;
          if (this.egoActive && !was) BL.FX.text(p.x, p.y - 22, 'EGO!', '#b061ff', 2, 0.8);
        }
      }
      // combo decai quando não há abates
      if (this.combo > 0) {
        this.comboT -= dt;
        if (this.comboT <= 0) {
          this.comboDecayT -= dt;
          if (this.comboDecayT <= 0) {
            this.comboDecayT = 0.3;
            this.combo = Math.floor(this.combo * 0.75);
          }
        }
      }
      if (this.xpPitchT > 0) this.xpPitchT -= dt;
      else this.xpPitch = 1;
    }

    // ====================================================== MODIFICADORES
    dmgMul() {
      const s = this.player.stats;
      let m = s.might;
      if (this.flowT > 0) m *= 1.5 * s.flowPower;
      if (this.egoActive) m *= 1 + 0.08 * s.egoLvl;
      if (s.awakenLvl && this.awakened()) m *= 1 + 0.1 * s.awakenLvl;
      if (s.comboDmg) m *= 1 + Math.min(0.25, this.combo * s.comboDmg);
      return m;
    }
    speedMul() {
      const s = this.player.stats;
      let m = 1 + Math.min(this.combo, 100) * 0.001;
      if (this.flowT > 0) m *= 1.35;
      if (this.egoActive) m *= 1 + 0.04 * s.egoLvl;
      if (s.awakenLvl && this.awakened()) m *= 1 + 0.04 * s.awakenLvl;
      return m;
    }
    /** AWAKENING: o jogador está no limite (menos de 35% de HP) */
    awakened() {
      const p = this.player;
      return p.hp < p.stats.maxHp * 0.35;
    }
    cdMul() {
      return this.player.stats.cdMul * (this.flowT > 0 ? 0.6 : 1);
    }
    cdMulFlow() {
      return this.flowT > 0 ? 0.6 : 1;
    }
    comboXpMul() {
      return 1 + Math.min(this.combo, 200) * 0.004;
    }

    /** ângulo de mira do mouse (modo MOUSE nas configurações) ou null */
    aimAngle() {
      const m = BL.Input.mouse;
      if (BL.Save.data.settings.aim !== 'mouse' || !m.active || BL.Input.touchMode) return null;
      const wx = this.view.x + m.x / this.scale, wy = this.view.y + m.y / this.scale;
      return Math.atan2(wy - this.player.y, wx - this.player.x);
    }

    schedule(delay, fn) {
      this.timers.push({ t: delay, fn });
    }

    shake(n) {
      if (!BL.Save.data.settings.shake) return;
      this.shakeAmt = Math.min(14, Math.max(this.shakeAmt, n));
    }

    banner(text, style, sub) {
      BL.UI.banner(text, style, sub);
    }

    // ============================================================ BUSCAS
    nearestEnemies(x, y, range, n, pick) {
      const r2 = range * range;
      const res = [], sc = [];
      for (const e of this.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        const d2 = U.dist2(x, y, e.x, e.y);
        if (d2 > r2) continue;
        let s = d2;
        if (pick === 'marked') s = e.markT > 0 ? d2 * 0.15 : d2;
        else if (pick === 'tough') s = -(e.isBoss ? 1e7 : e.hp) + d2 * 0.0005;
        else if (pick === 'weak') s = (e.hp / e.maxHp) * 60000 + d2;
        else if (pick === 'far') s = -d2;
        else if (e.markT > 0) s *= 0.6;
        if (res.length < n) {
          let i = res.length;
          res.push(e);
          sc.push(s);
          while (i > 0 && sc[i - 1] > s) {
            res[i] = res[i - 1];
            sc[i] = sc[i - 1];
            i--;
          }
          res[i] = e;
          sc[i] = s;
        } else if (s < sc[n - 1]) {
          let i = n - 1;
          while (i > 0 && sc[i - 1] > s) {
            res[i] = res[i - 1];
            sc[i] = sc[i - 1];
            i--;
          }
          res[i] = e;
          sc[i] = s;
        }
      }
      return res;
    }

    nearestEnemy(x, y, range, exclude) {
      let best = null, bd = range * range;
      for (const e of this.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        if (exclude && exclude.has(e.id)) continue;
        const d2 = U.dist2(x, y, e.x, e.y);
        if (d2 < bd) {
          bd = d2;
          best = e;
        }
      }
      return best;
    }

    // ============================================================ COMBATE
    spawnEnemy(type, x, y, opts) {
      if (this.enemies.length >= CFG.MAX_ENEMIES + 40) return null;
      const e = BL.Enemies.create(this, type, x, y, opts);
      this.enemies.push(e);
      return e;
    }

    damageEnemy(e, base, o) {
      if (e.dead) return;
      const s = this.player.stats;
      let dmg = base * this.dmgMul();
      if (e.markT > 0) dmg *= 1 + (s.markBonus || 0.25);
      if (s.lowHpDmg && e.hp < e.maxHp * 0.4) dmg *= 1 + s.lowHpDmg;
      const crit = Math.random() < s.crit + (o.crit || 0);
      if (crit) dmg *= s.critMul;
      let exec = false;
      if (o.execute && !e.isBoss && e.hp - dmg < e.maxHp * o.execute) {
        dmg = e.hp;
        exec = true;
      }
      dmg = Math.max(1, dmg);
      e.hp -= dmg;
      e.flash = 0.1;
      if (o.knock && !e.isBoss) {
        const l = Math.hypot(o.kx, o.ky) || 1;
        const k = o.knock / e.mass;
        e.kx += (o.kx / l) * k;
        e.ky += (o.ky / l) * k;
        const km = Math.hypot(e.kx, e.ky);
        if (km > 380) {
          e.kx *= 380 / km;
          e.ky *= 380 / km;
        }
      }
      if (o.stun && !e.isBoss) e.stun = Math.max(e.stun, o.stun);
      this.run.damage[o.src] = (this.run.damage[o.src] || 0) + dmg;
      if (exec) BL.FX.text(e.x, e.y - 14, 'X', '#ff2d55', 2);
      else BL.FX.text(e.x, e.y - 12 - (e.isBoss ? 14 : 0), Math.round(dmg), crit ? '#ffd84a' : '#ffffff', crit ? 2 : 1, crit ? 0.75 : 0.55);
      BL.Audio.play('hit');
      if (e.hp <= 0) this.killEnemy(e);
    }

    killEnemy(e) {
      e.dead = true;
      this.kills++;
      this.combo++;
      this.comboT = 2.6;
      this.comboDecayT = 0;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      const mi = COMBO_MILESTONES.indexOf(this.combo);
      if (mi >= 0) {
        this.banner('COMBO x' + this.combo, 'combo');
        BL.Audio.play('combo', { tier: mi });
        this.addFlow(5);
        BL.FX.ring(this.player.x, this.player.y, 10, 60, 0.4, '#ffd84a', 2);
      }
      this.addFlow(e.isBoss ? 0 : e.isElite ? 12 : 0.9);
      BL.FX.burst(e.x, e.y, e.isElite ? 26 : 9, e.def.colors.concat(['#ffffff']), 30, 130, 0.25, 0.55, 1, 3);
      BL.Audio.play('kill', { combo: this.combo });

      if (e.isBoss) return this.onBossKilled(e);
      if (e.isElite) {
        this.run.elites++;
        this.shake(5);
        BL.FX.explosion(e.x, e.y, 40, ['#ffffff', '#ff2d55', '#141418', '#ffd84a']);
        for (let i = 0; i < 4; i++) this.dropOrb(e.x + U.rand(-10, 10), e.y + U.rand(-10, 10), e.xp / 4);
        if (Math.random() < 0.7) this.dropPickup(e.x, e.y, U.pick(['heart', 'magnet', 'crystal']));
        return;
      }
      this.dropOrb(e.x, e.y, e.xp);
      if (Math.random() < 0.004) this.dropPickup(e.x, e.y, U.weighted([{ k: 'heart', w: 5 }, { k: 'magnet', w: 2 }, { k: 'crystal', w: 3 }]).k);
    }

    explode(x, y, r, dmg, src, palette, big, knock) {
      BL.FX.explosion(x, y, r, palette, big);
      BL.Audio.play('explosion', { big });
      this.shake(big ? 6 : 2.5);
      this.grid.query(x, y, r + 16, this.ebuf);
      for (const e of this.ebuf) {
        if (e.dead || e.spawnT > 0) continue;
        const rr = r + e.r;
        if (U.dist2(x, y, e.x, e.y) > rr * rr) continue;
        this.damageEnemy(e, dmg, { src, kx: e.x - x, ky: e.y - y, knock: knock || 150 });
      }
    }

    shockwave(x, y, r, dmg, knock, src, palette) {
      BL.FX.ring(x, y, 6, r, 0.3, palette[1], 3);
      BL.FX.ring(x, y, 4, r * 0.7, 0.22, palette[0], 2);
      BL.FX.ring(x, y, 4, r, 0.35, palette[2], 2, true);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        BL.FX.spawn(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, Math.cos(a) * r * 2.5, Math.sin(a) * r * 2.5, 0.25, 2, palette[1], 6);
      }
      BL.Audio.play('shock');
      this.grid.query(x, y, r + 16, this.ebuf);
      for (const e of this.ebuf) {
        if (e.dead || e.spawnT > 0) continue;
        const rr = r + e.r;
        if (U.dist2(x, y, e.x, e.y) > rr * rr) continue;
        this.damageEnemy(e, dmg, { src, kx: e.x - x, ky: e.y - y, knock });
      }
    }

    /** dano em leque (SLIDING TACKLE): ang = direção, half = meia abertura em rad */
    cone(x, y, ang, half, r, dmg, knock, stun, src, palette) {
      for (let i = 0; i < 18; i++) {
        const a = ang + U.rand(-half, half);
        const sp = U.rand(1.6, 3.2) * r;
        BL.FX.spawn(x + Math.cos(a) * 6, y + Math.sin(a) * 6, Math.cos(a) * sp, Math.sin(a) * sp, 0.28, U.randInt(2, 3), U.pick(palette), 5);
      }
      for (const s of [-1, 1]) BL.FX.line(x, y, x + Math.cos(ang + half * s) * r, y + Math.sin(ang + half * s) * r, palette[2], 0.2, 2);
      BL.Audio.play('shock');
      this.shake(2);
      this.grid.query(x, y, r + 16, this.ebuf);
      for (const e of this.ebuf) {
        if (e.dead || e.spawnT > 0) continue;
        const dx = e.x - x, dy = e.y - y;
        const rr = r + e.r;
        if (dx * dx + dy * dy > rr * rr) continue;
        let d = Math.atan2(dy, dx) - ang;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        // rivais colados no jogador sempre são atingidos
        if (Math.abs(d) > half && dx * dx + dy * dy > 18 * 18) continue;
        this.damageEnemy(e, dmg, { src, kx: dx, ky: dy, knock, stun });
      }
    }

    hurtPlayer(dmg, source) {
      const p = this.player;
      if (!p.canBeHit() || this.dying || this.godMode || this.cleared) return;
      dmg = Math.max(1, dmg - p.stats.armor) * (this.flowT > 0 ? 0.7 : 1);
      p.hp -= dmg;
      p.iframes = 0.55;
      p.hurtT = 0.2;
      this.shake(5);
      this.hurtFlash = 0.25;
      BL.Audio.play('hurt');
      BL.Input.vibrate(40);
      BL.FX.text(p.x, p.y - 16, '-' + Math.round(dmg), '#ff2d55', 1, 0.7);
      BL.FX.burst(p.x, p.y, 10, ['#ff2d55', '#ffffff', '#d7263d'], 30, 110, 0.2, 0.45, 1, 3);
      if (p.hp <= 0) {
        p.hp = 0;
        if (this.run.revives > 0) this.revive();
        else this.startDying();
      }
    }

    /** SECOND HALF (upgrade permanente): volta com metade do HP uma vez por partida */
    revive() {
      const p = this.player;
      this.run.revives--;
      p.hp = p.stats.maxHp * 0.5;
      p.iframes = 2.5;
      this.whiteFlash = 0.5;
      this.hitstop = 0.4;
      this.banner('SECOND HALF!', 'gold', 'THE MATCH IS NOT OVER');
      BL.Audio.play('evolve');
      this.shockwave(p.x, p.y, 150, 40, 380, 'flow', ['#ffffff', '#ffd84a', '#ff9f1a']);
    }

    heal(v) {
      const p = this.player;
      const before = p.hp;
      p.hp = Math.min(p.stats.maxHp, p.hp + v);
      const got = Math.round(p.hp - before);
      if (got > 0) BL.FX.text(p.x, p.y - 18, '+' + got, '#5de07a', 1, 0.8);
      BL.FX.burst(p.x, p.y, 12, ['#5de07a', '#ffffff'], 20, 70, 0.3, 0.6, 1, 2, { grav: -60 });
    }

    // ========================================================= DASH HOOKS
    onDash(p) {
      if (p.stats.dashDmg > 0) BL.FX.ring(p.x, p.y, 4, 22, 0.2, '#35e0ff', 2);
    }
    dashStep(p) {
      const s = p.stats;
      const src = this.build.find('monster_dribble') ? 'monster_dribble' : 'dribble';
      if (s.dashDmg > 0) {
        this.grid.query(p.x, p.y, 24, this.buf);
        for (const e of this.buf) {
          if (e.dead || e.spawnT > 0 || p.dashHit.has(e.id)) continue;
          const rr = e.r + p.r + 7;
          if (U.dist2(e.x, e.y, p.x, p.y) > rr * rr) continue;
          p.dashHit.add(e.id);
          this.damageEnemy(e, s.dashDmg, { src, kx: -p.dashY * (Math.random() < 0.5 ? 1 : -1), ky: p.dashX, knock: 140, stun: 0.6 });
          BL.FX.burst(e.x, e.y, 6, ['#ffffff', '#35e0ff'], 60, 160, 0.15, 0.3, 1, 2);
        }
      }
      if (s.dashTrail) {
        this.trailT -= 1 / 60;
        if (this.trailT <= 0) {
          this.trailT = 0.03;
          this.zones.push({ kind: 'trail', x: p.x, y: p.y + 4, r: 16, t: 1.6, max: 1.6, tickT: 0, dmg: 14, src });
        }
      }
    }
    onDashEnd(p) {
      const s = p.stats;
      if (s.dashFeint) {
        const x = p.dashStartX, y = p.dashStartY;
        const src = this.build.find('monster_dribble') ? 'monster_dribble' : 'dribble';
        BL.FX.telegraph({ kind: 'circle', x, y, r: 44, dur: 0.3, color: '#35e0ff' });
        this.schedule(0.3, () => this.explode(x, y, 44, s.dashDmg * 0.8, src, ['#ffffff', '#35e0ff', '#1e90ff', '#10204a'], false, 180));
      }
    }

    // =============================================================== ZONAS
    updateZones(dt) {
      for (let i = this.zones.length - 1; i >= 0; i--) {
        const z = this.zones[i];
        z.t -= dt;
        z.tickT -= dt;
        if (z.kind === 'vortex') {
          this.grid.query(z.x, z.y, z.r, this.buf);
          for (const e of this.buf) {
            if (e.dead || e.isBoss) continue;
            const dx = z.x - e.x, dy = z.y - e.y;
            const d = Math.hypot(dx, dy) || 1;
            if (d > z.r) continue;
            const pull = 150 / Math.max(1, e.mass * 0.6);
            e.x += (dx / d) * pull * dt;
            e.y += (dy / d) * pull * dt;
          }
          if (z.tickT <= 0) {
            z.tickT = 0.2;
            for (const e of this.buf) if (!e.dead && U.dist2(e.x, e.y, z.x, z.y) < z.r * z.r) this.damageEnemy(e, z.dmg, { src: z.src });
          }
          for (let k = 0; k < 3; k++) {
            const a = Math.random() * Math.PI * 2;
            const rr = z.r * U.rand(0.6, 1);
            BL.FX.spawn(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr, -Math.sin(a) * 90 - Math.cos(a) * 60, Math.cos(a) * 90 - Math.sin(a) * 60, 0.4, 2, U.pick(['#9b5cff', '#e0c3ff', '#35e0ff']), 1);
          }
          if (z.t <= 0) this.explode(z.x, z.y, z.r * 0.85, z.final, z.src, ['#ffffff', '#e0c3ff', '#9b5cff', '#6c2bd9'], true, 260);
        } else if (z.kind === 'trail') {
          if (z.tickT <= 0) {
            z.tickT = 0.25;
            this.grid.query(z.x, z.y, z.r, this.buf);
            for (const e of this.buf) if (!e.dead && e.spawnT <= 0 && U.dist2(e.x, e.y, z.x, z.y) < (z.r + e.r) * (z.r + e.r)) this.damageEnemy(e, z.dmg, { src: z.src });
          }
          if (Math.random() < 0.35) BL.FX.spawn(z.x + U.rand(-8, 8), z.y + U.rand(-5, 5), 0, U.rand(-50, -20), 0.35, 2, U.pick(['#35e0ff', '#1e90ff', '#ffffff']), 1);
        }
        if (z.t <= 0) U.removeAt(this.zones, i);
      }
    }

    drawZones(ctx) {
      for (const z of this.zones) {
        const k = z.t / z.max;
        if (z.kind === 'vortex') {
          ctx.globalAlpha = 0.18 + (1 - k) * 0.2;
          ctx.fillStyle = '#6c2bd9';
          ctx.beginPath();
          ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.7;
          ctx.strokeStyle = '#e0c3ff';
          ctx.lineWidth = 1;
          for (let j = 0; j < 3; j++) {
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.r * (0.3 + j * 0.3) * (0.6 + k * 0.4), this.time * (4 + j) + j, this.time * (4 + j) + j + 2.4);
            ctx.stroke();
          }
        } else if (z.kind === 'trail') {
          ctx.globalAlpha = 0.25 * k;
          ctx.fillStyle = '#1e90ff';
          ctx.fillRect(Math.round(z.x - 8), Math.round(z.y - 4), 16, 8);
        }
      }
      ctx.globalAlpha = 1;
    }

    // ============================================================ XP / FLOW
    dropOrb(x, y, value) {
      value = Math.max(1, Math.round(value));
      if (this.orbs.length >= CFG.MAX_ORBS) {
        // funde com um orbe existente para limitar a quantidade
        const o = this.orbs[(Math.random() * this.orbs.length) | 0];
        o.value += value;
        o.tier = this.orbTier(o.value);
        return;
      }
      const a = Math.random() * Math.PI * 2;
      this.orbs.push({ x, y, value, tier: this.orbTier(value), vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, mag: false, spd: 0, t: Math.random() });
    }
    orbTier(v) {
      return v < 15 ? 0 : v < 60 ? 1 : v < 250 ? 2 : 3;
    }

    updateOrbs(dt) {
      const p = this.player;
      const mr = p.stats.magnet;
      const mr2 = mr * mr;
      const cr = p.r + 6;
      for (let i = this.orbs.length - 1; i >= 0; i--) {
        const o = this.orbs[i];
        o.t += dt;
        if (o.vx || o.vy) {
          o.x += o.vx * dt;
          o.y += o.vy * dt;
          const k = Math.exp(-6 * dt);
          o.vx *= k;
          o.vy *= k;
          if (Math.abs(o.vx) + Math.abs(o.vy) < 2) o.vx = o.vy = 0;
        }
        const dx = p.x - o.x, dy = p.y - o.y;
        const d2 = dx * dx + dy * dy;
        if (!this.dying && (o.mag || d2 < mr2)) {
          o.mag = true;
          o.spd = Math.min(620, o.spd + 900 * dt);
          const d = Math.sqrt(d2) || 1;
          const st = Math.min(d, o.spd * dt);
          o.x += (dx / d) * st;
          o.y += (dy / d) * st;
        }
        if (!this.dying && d2 < cr * cr) {
          this.collectOrb(o);
          U.removeAt(this.orbs, i);
        }
      }
    }

    collectOrb(o) {
      this.addXP(o.value);
      this.addFlow(0.15 * Math.sqrt(o.value));
      BL.Audio.play('xp', { pitch: this.xpPitch });
      this.xpPitch = Math.min(2.2, this.xpPitch + 0.03);
      this.xpPitchT = 0.4;
      if (o.tier >= 2) BL.FX.burst(o.x, o.y, 6, ['#ffffff', o.tier === 3 ? '#ffd84a' : '#9b5cff'], 20, 60, 0.2, 0.4, 1, 2);
    }

    addXP(v) {
      v *= this.player.stats.xpMul * this.comboXpMul() * (this.chapter ? this.chapter.xpMul || 1 : 1);
      this.xp += v;
      while (this.xp >= this.xpNeed) {
        this.xp -= this.xpNeed;
        this.level++;
        this.xpNeed = xpNeed(this.level);
        this.pendingLevels++;
      }
    }

    addFlow(v, raw) {
      if (this.flowT > 0) return;
      this.flow = Math.min(100, this.flow + v * (raw ? 1 : this.player.stats.flowGain));
      if (this.flow >= 100 && !this.flowReady) {
        this.flowReady = true;
        this.banner('FLOW READY', 'flowready', BL.Input.touchMode ? 'toque em FLOW' : 'aperte [F]');
      }
    }

    activateFlow() {
      if (this.flow < 100 || this.flowT > 0 || this.dying) return;
      const p = this.player;
      this.flowT = this.flowMax = p.stats.flowDur;
      this.flow = 0;
      this.flowReady = false;
      this.whiteFlash = 0.35;
      this.hitstop = 0.25;
      this.banner('FLOW', 'flow', 'DEVORE O CAMPO');
      BL.Audio.play('flow');
      BL.Input.vibrate([30, 30, 60]);
      this.shake(7);
      this.shockwave(p.x, p.y, 120, 30, 320, 'flow', ['#ffffff', '#35e0ff', '#1e90ff']);
      BL.FX.burst(p.x, p.y, 40, ['#35e0ff', '#1e90ff', '#ffffff'], 60, 220, 0.3, 0.8, 1, 3);
      BL.UI.setFlowMode(true);
    }

    // ============================================================ PICKUPS
    dropPickup(x, y, kind) {
      this.pickups.push({ x, y, kind, t: 0 });
    }
    updatePickups(dt) {
      const p = this.player;
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const k = this.pickups[i];
        k.t += dt;
        const d2 = U.dist2(k.x, k.y, p.x, p.y);
        if (d2 < p.stats.magnet * p.stats.magnet * 0.5) {
          const d = Math.sqrt(d2) || 1;
          k.x += ((p.x - k.x) / d) * 160 * dt;
          k.y += ((p.y - k.y) / d) * 160 * dt;
        }
        if (d2 < 14 * 14 && !this.dying) {
          U.removeAt(this.pickups, i);
          BL.Audio.play('pickup');
          if (k.kind === 'heart') this.heal(p.stats.maxHp * 0.3);
          else if (k.kind === 'magnet') {
            for (const o of this.orbs) o.mag = true;
            BL.FX.ring(p.x, p.y, 10, 200, 0.5, '#35e0ff', 2);
            this.banner('FIELD VISION', 'small', 'todo XP atraído');
          } else if (k.kind === 'crystal') {
            this.addFlow(50, true);
            BL.FX.text(p.x, p.y - 20, '+FLOW', '#35e0ff', 1, 0.8);
          }
        }
      }
    }

    // ============================================================ EVENTOS
    onWaveStart(w) {
      const total = this.waves.cfg.total;
      const last = this.chapter && w === total && !this.waves.isBossWave(w);
      this.banner('WAVE ' + U.pad2(w) + (this.chapter ? '/' + U.pad2(total) : ''), 'wave', this.waves.isBossWave(w) ? 'WARNING: BOSS INCOMING' : last ? 'FINAL WAVE: SURVIVE!' : null);
      BL.Audio.play('wave');
      if (w > 1) this.heal(this.player.stats.maxHp * 0.1);
    }

    onBossSpawn(e) {
      this.boss = e;
      BL.UI.showBoss(e);
      BL.Audio.play('boss');
      BL.Input.vibrate([80, 50, 80]);
      this.shake(8);
      this.banner(e.displayName, 'boss', e.boss.title);
      BL.FX.ring(e.x, e.y, 10, 90, 0.6, e.boss.color, 4);
    }

    onBossKilled(e) {
      this.boss = null;
      this.run.bossKills++;
      BL.UI.hideBoss();
      this.hitstop = 0.7;
      this.whiteFlash = 0.5;
      this.shake(14);
      BL.Audio.play('bossDown');
      this.banner('RIVAL DEFEATED!', 'gold', e.displayName);
      BL.FX.explosion(e.x, e.y, 110, e.boss.palette.concat(['#ffd84a']), true);
      BL.FX.explosion(e.x, e.y, 60, ['#ffffff', '#ffd84a'], true);
      const n = 14;
      for (let i = 0; i < n; i++) this.dropOrb(e.x + U.rand(-30, 30), e.y + U.rand(-30, 30), e.xp / n);
      this.dropPickup(e.x - 12, e.y, 'heart');
      this.dropPickup(e.x + 12, e.y, 'magnet');
      this.addFlow(60, true);
      this.waves.timeLeft = Math.min(this.waves.timeLeft, 4);
      // modo infinito: derrotar um NEW GEN 11 libera ele como personagem jogável
      const ch = BL.Characters.list.find((c) => c.unlock && c.unlock.boss === e.boss.key);
      if (this.mode === 'endless' && ch && !BL.Save.isUnlocked(ch)) {
        BL.Save.data.unlocked[ch.id] = true;
        BL.Save.save();
        this.run.unlocked.push(ch);
        this.schedule(1.6, () => {
          this.banner('NEW STRIKER UNLOCKED!', 'gold', ch.name);
          BL.Audio.play('evolve');
        });
      }
    }

    /** pula o resto da wave: os rivais que faltavam chegam todos de uma vez */
    skipWave() {
      const wv = this.waves;
      if (this.dying || this.cleared || !wv.canSkip()) return;
      const rem = wv.timeLeft;
      const n = wv.skip();
      const ego = Math.ceil(rem / 6);
      this.run.skips++;
      this.run.bonusEgo += ego;
      this.addFlow(rem * 0.3, true);
      this.shake(6);
      BL.Input.vibrate([30, 40, 30]);
      this.banner('WAVE SKIPPED', 'warn', '+' + ego + ' EGO · ' + n + ' RIVALS INCOMING');
    }

    /** modo história: última wave vencida */
    onStageClear() {
      const p = this.player;
      this.cleared = true;
      this.clearT = 2.4;
      this.boss = null;
      BL.UI.hideBoss();
      BL.Audio.music.stop();
      BL.Audio.play('victory');
      BL.Input.vibrate([60, 40, 60, 40, 120]);
      this.whiteFlash = 0.5;
      this.shake(8);
      this.banner('STAGE CLEAR!', 'gold', this.chapter.name);
      BL.Projectiles.enemy.length = 0;
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.dead = true;
        BL.FX.burst(e.x, e.y, 6, e.def.colors.concat(['#ffffff']), 30, 130, 0.25, 0.55, 1, 3);
      }
      for (const o of this.orbs) o.mag = true;
      BL.FX.ring(p.x, p.y, 10, 220, 0.8, '#ffd84a', 4);
    }

    onEvolve(w) {
      const p = this.player;
      this.banner('EVOLUTION!', 'gold', w.def.name);
      BL.Audio.play('evolve');
      this.whiteFlash = 0.4;
      this.shake(6);
      BL.FX.burst(p.x, p.y, 50, ['#fff6c4', '#ffd84a', '#ff9f1a', '#ffffff'], 60, 240, 0.4, 1, 1, 3);
      BL.FX.ring(p.x, p.y, 10, 140, 0.7, '#ffd84a', 4);
    }

    // ========================================================== LEVEL UP
    openLevelUp() {
      this.state = 'levelup';
      this.banishMode = false;
      this.cards = this.build.offers(3);
      BL.Audio.play('levelup');
      BL.Input.vibrate(25);
      BL.UI.showLevelUp(this);
    }

    chooseCard(i) {
      if (this.state !== 'levelup') return;
      const card = this.cards[i];
      if (!card) return;
      if (this.banishMode) {
        this.banishMode = false;
        if (this.build.banish(card)) {
          this.cards = this.build.offers(3);
          BL.Audio.play('click');
        }
        return BL.UI.showLevelUp(this);
      }
      this.build.apply(card);
      BL.Audio.play('select');
      if (this.freePicks > 0) this.freePicks--;
      else this.pendingLevels--;
      const p = this.player;
      BL.FX.ring(p.x, p.y, 6, 50, 0.4, '#35e0ff', 3);
      BL.FX.burst(p.x, p.y, 24, ['#35e0ff', '#ffffff', '#1e90ff'], 40, 140, 0.3, 0.7, 1, 3);
      BL.FX.text(p.x, p.y - 24, 'LEVEL UP', '#35e0ff', 1, 0.9);
      BL.UI.refreshSlots(this);
      if (this.pendingLevels > 0 || this.freePicks > 0) {
        this.cards = this.build.offers(3);
        BL.UI.showLevelUp(this);
      } else {
        this.state = 'playing';
        BL.UI.hideLevelUp();
      }
    }

    /** liga/desliga o modo BANISH: a próxima carta clicada é descartada */
    toggleBanish() {
      if (this.state !== 'levelup' || this.build.banishes <= 0) return;
      this.banishMode = !this.banishMode;
      BL.UI.showLevelUp(this, true);
    }

    reroll() {
      if (this.state !== 'levelup' || this.build.rerolls <= 0) return;
      this.banishMode = false;
      this.build.rerolls--;
      this.cards = this.build.offers(3);
      BL.Audio.play('click');
      BL.UI.showLevelUp(this);
    }

    // ======================================================= PAUSA / FIM
    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      BL.UI.showPause(this);
    }
    resume() {
      if (this.state !== 'paused') return;
      this.state = 'playing';
      BL.UI.hidePause();
    }

    startDying() {
      const p = this.player;
      p.dead = true;
      this.dying = 1.6;
      this.shake(12);
      BL.Audio.music.stop();
      BL.Audio.play('gameover');
      BL.Input.vibrate(250);
      BL.FX.explosion(p.x, p.y, 50, ['#ffffff', '#35e0ff', '#1e90ff', '#10204a'], true);
    }

    /** fim da partida: derrota (qualquer modo) ou vitória (capítulo do modo história) */
    endRun(victory) {
      this.state = 'gameover';
      const S = BL.Save.data;
      const st = S.stats;
      const wave = this.waves.wave;
      const story = this.mode === 'story';
      // recordes só valem no modo infinito
      const rec = story
        ? {}
        : {
            wave: wave > st.bestWave,
            combo: this.maxCombo > st.bestCombo,
            time: this.runTime > st.bestTime,
            level: this.level > st.bestLevel,
            kills: this.kills > st.bestKills,
          };
      let ego = Math.floor(this.kills * 0.08 + (wave - 1) * 12 + this.run.bossKills * 100 + this.level * 2 + this.maxCombo * 0.1) + this.run.bonusEgo;
      let reward = 0, hasNext = false;
      if (story && victory) {
        const i = this.chapter.index;
        if (S.story.cleared <= i) {
          reward = this.chapter.reward; // bônus da primeira vitória
          S.story.cleared = i + 1;
        }
        st.storyClears++;
        hasNext = i + 1 < BL.Story.chapters.length;
        ego += reward;
      }
      ego = Math.floor(ego * (1 + 0.08 * BL.Save.metaLevel('greed')));
      if (!story) {
        st.bestWave = Math.max(st.bestWave, wave);
        st.bestCombo = Math.max(st.bestCombo, this.maxCombo);
        st.bestTime = Math.max(st.bestTime, this.runTime);
        st.bestLevel = Math.max(st.bestLevel, this.level);
        st.bestKills = Math.max(st.bestKills, this.kills);
      }
      st.totalKills += this.kills;
      st.totalRuns++;
      st.totalTime += this.runTime;
      st.bossesDefeated += this.run.bossKills;
      st.evolutions += this.run.evolutions;
      S.ego += ego;
      BL.Save.save();
      BL.UI.showGameOver({
        wave, level: this.level, kills: this.kills, combo: this.maxCombo, time: this.runTime, ego,
        bosses: this.run.bossKills, rec, char: this.player.char, damage: this.run.damage, build: this.build,
        victory, story, chapter: this.chapter, reward, hasNext, unlocked: this.run.unlocked, total: this.waves.cfg.total,
      });
    }

    toMenu() {
      this.state = 'menu';
      this.map = this.menuMap;
      this.boss = null;
      BL.FX.reset();
      BL.Projectiles.reset();
      for (const e of this.enemies) BL.Enemies.release(e);
      this.enemies.length = 0;
      this.orbs.length = 0;
      this.pickups.length = 0;
      this.zones.length = 0;
      this.flowT = 0;
      this.egoActive = false;
      BL.UI.toMenu();
      BL.Audio.music.stop();
      BL.Audio.music.start(0);
      BL.Audio.music.setIntensity(0);
    }

    debugKeys() {
      const I = BL.Input;
      if (I.hit('n')) this.waves.timeLeft = 0.01;
      if (I.hit('l')) this.addXP(this.xpNeed);
      if (I.hit('g')) {
        this.godMode = !this.godMode;
        this.banner(this.godMode ? 'GOD MODE ON' : 'GOD MODE OFF', 'small');
      }
      if (I.hit('k')) for (const e of this.enemies) if (!e.isBoss && !e.dead) this.killEnemy(e);
      if (I.hit('j')) this.flow = 100;
      if (I.hit('b') && !this.waves.bossAlive) this.waves.spawnBoss();
      if (I.hit('m')) {
        // maximiza tudo que já foi pego (testar evoluções)
        for (const w of this.build.weapons) w.level = w.def.max;
        for (const p of this.build.passives) p.level = p.def.max;
        this.build.recalc();
        BL.UI.refreshSlots(this);
      }
    }

    // ============================================================ CÂMERA
    updateCamera(dt) {
      const p = this.player;
      const v = this.view;
      this.cam.x = U.damp(this.cam.x, p.x + p.vx * 0.22, 7, dt);
      this.cam.y = U.damp(this.cam.y, p.y + p.vy * 0.22, 7, dt);
      let sx = 0, sy = 0;
      if (this.shakeAmt > 0) {
        sx = U.rand(-this.shakeAmt, this.shakeAmt);
        sy = U.rand(-this.shakeAmt, this.shakeAmt);
        this.shakeAmt = Math.max(0, this.shakeAmt - dt * 40);
      }
      const m = this.map;
      let vx = this.cam.x - v.w / 2, vy = this.cam.y - v.h / 2;
      vx = v.w >= m.w ? (m.w - v.w) / 2 : U.clamp(vx, 0, m.w - v.w);
      vy = v.h >= m.h ? (m.h - v.h) / 2 : U.clamp(vy, 0, m.h - v.h);
      v.x = Math.round(vx + sx);
      v.y = Math.round(vy + sy);
    }

    // ============================================================ RENDER
    blitGround(ctx, map) {
      const v = this.view;
      const sx = Math.max(0, v.x), sy = Math.max(0, v.y);
      const ex = Math.min(map.w, v.x + v.w), ey = Math.min(map.h, v.y + v.h);
      if (ex > sx && ey > sy) ctx.drawImage(map.ground, sx, sy, ex - sx, ey - sy, sx - v.x, sy - v.y, ex - sx, ey - sy);
    }

    render() {
      if (!this.player) return;
      const ctx = this.ctx;
      const v = this.view;
      const map = this.map;
      const S = BL.Sprites;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#05070f';
      ctx.fillRect(0, 0, v.w, v.h);
      this.blitGround(ctx, map);
      ctx.setTransform(1, 0, 0, 1, -v.x, -v.y);

      this.drawZones(ctx);
      BL.FX.drawGround(ctx, v);

      // orbes de XP
      const x0 = v.x - 16, y0 = v.y - 16, x1 = v.x + v.w + 16, y1 = v.y + v.h + 16;
      for (const o of this.orbs) {
        if (o.x < x0 || o.x > x1 || o.y < y0 || o.y > y1) continue;
        const fr = S.orbs[o.tier];
        const img = fr[Math.floor(o.t * 3 + o.x) % 2];
        const bob = Math.round(Math.sin(o.t * 5 + o.x) * 1);
        ctx.drawImage(img, Math.round(o.x - img.width / 2), Math.round(o.y - img.height / 2) + bob);
      }
      for (const k of this.pickups) {
        const img = S.misc[k.kind];
        const bob = Math.round(Math.sin(k.t * 4) * 2);
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = k.kind === 'heart' ? '#5de07a' : k.kind === 'magnet' ? '#35e0ff' : '#b061ff';
        ctx.fillRect(Math.round(k.x - 6), Math.round(k.y - 6) + bob, 12, 12);
        ctx.globalAlpha = 1;
        ctx.drawImage(img, Math.round(k.x - img.width / 2), Math.round(k.y - img.height / 2) + bob);
      }

      BL.FX.drawGhosts(ctx);

      // entidades ordenadas por Y
      const list = this.drawList;
      list.length = 0;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (e.x < x0 - 30 || e.x > x1 + 30 || e.y < y0 - 30 || e.y > y1 + 40) continue;
        list.push(e);
      }
      for (const o of map.drawables) {
        const ox = o.shape === 'rect' ? o.x : o.cx, oy = o.shape === 'rect' ? o.y : o.cy;
        if (ox < x0 - 60 || ox > x1 + 10 || oy < y0 - 10 || oy > y1 + 70) continue;
        list.push(o);
      }
      const p = this.player;
      if (!p.dead) list.push(p);
      list.sort((a, b) => a.sortY - b.sortY);
      for (const o of list) {
        if (o === p) p.draw(ctx, this);
        else if (o.kind !== undefined) this.drawObstacle(ctx, o, p);
        else BL.Enemies.draw(ctx, this, o);
      }

      BL.Projectiles.draw(ctx, this, v);
      BL.FX.drawTop(ctx, v);

      // ---------------------------------------------------------- tela
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (this.flowT > 0) {
        ctx.fillStyle = 'rgba(30,144,255,0.08)';
        ctx.fillRect(0, 0, v.w, v.h);
        // linhas de velocidade estilo anime
        ctx.strokeStyle = 'rgba(200,240,255,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const cx = v.w / 2, cy = v.h / 2;
        for (let i = 0; i < 16; i++) {
          const a = Math.random() * Math.PI * 2;
          const r0 = Math.max(v.w, v.h) * U.rand(0.42, 0.55);
          const r1 = r0 + U.rand(20, 70);
          ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
          ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        }
        ctx.stroke();
      }
      ctx.drawImage(this.vignette, 0, 0);
      const hpk = p.hp / p.stats.maxHp;
      if (hpk < 0.3 && !p.dead) {
        ctx.globalAlpha = (0.3 - hpk) * 2 * (0.6 + Math.sin(this.time * 6) * 0.4);
        ctx.drawImage(this.hurtVignette, 0, 0);
      }
      if (this.hurtFlash > 0) {
        ctx.globalAlpha = this.hurtFlash * 2.4;
        ctx.drawImage(this.hurtVignette, 0, 0);
      }
      if (this.whiteFlash > 0) {
        ctx.globalAlpha = Math.min(0.7, this.whiteFlash * 1.6);
        ctx.fillStyle = this.flowT > 0 ? '#bfefff' : '#ffffff';
        ctx.fillRect(0, 0, v.w, v.h);
      }
      ctx.globalAlpha = 1;
      this.drawIndicators(ctx);
    }

    drawObstacle(ctx, o, p) {
      const img = BL.Sprites.misc[o.sprite];
      const ox = o.shape === 'rect' ? o.x : o.cx, oy = o.shape === 'rect' ? o.y : o.cy;
      // fica translúcido quando o jogador está atrás
      const behind = o.tall && p.y < o.sortY && p.y > oy + o.dy - 4 && p.x > ox + o.dx - 4 && p.x < ox + o.dx + img.width + 4;
      if (behind) ctx.globalAlpha = 0.55;
      ctx.drawImage(img, ox + o.dx, oy + o.dy);
      ctx.globalAlpha = 1;
    }

    drawIndicators(ctx) {
      const v = this.view;
      const targets = [];
      if (this.boss && !this.boss.dead) targets.push([this.boss, this.boss.boss.color, 6]);
      if (this.build.level('meta_vision') || this.build.find('phantom_curve')) for (const e of this.enemies) if (e.isElite && !e.dead) targets.push([e, '#ff2d55', 4]);
      for (const [e, color, size] of targets) {
        const sx = e.x - v.x, sy = e.y - v.y;
        if (sx >= 0 && sx <= v.w && sy >= 0 && sy <= v.h) continue;
        const cx = v.w / 2, cy = v.h / 2;
        const a = Math.atan2(sy - cy, sx - cx);
        const m = 12;
        const kx = (v.w / 2 - m) / Math.abs(Math.cos(a) || 1e-6);
        const ky = (v.h / 2 - m) / Math.abs(Math.sin(a) || 1e-6);
        const k = Math.min(kx, ky);
        const px = cx + Math.cos(a) * k, py = cy + Math.sin(a) * k;
        ctx.save();
        ctx.translate(Math.round(px), Math.round(py));
        ctx.rotate(a);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.6 + Math.sin(this.time * 8) * 0.3;
        ctx.beginPath();
        ctx.moveTo(size + 2, 0);
        ctx.lineTo(-size, -size);
        ctx.lineTo(-size + 3, 0);
        ctx.lineTo(-size, size);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    renderMenu(dt) {
      const ctx = this.ctx;
      const v = this.view;
      const m = this.menuMap;
      const t = this.menuT;
      const f = m.field;
      const cx = f.cx + Math.sin(t * 0.07) * (f.x1 - f.cx - v.w / 2 - 40);
      const cy = f.cy + Math.sin(t * 0.11) * (f.y1 - f.cy - v.h / 2 - 20);
      v.x = Math.round(U.clamp(cx - v.w / 2, 0, Math.max(0, m.w - v.w)));
      v.y = Math.round(U.clamp(cy - v.h / 2, 0, Math.max(0, m.h - v.h)));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#05070f';
      ctx.fillRect(0, 0, v.w, v.h);
      this.blitGround(ctx, m);
      ctx.setTransform(1, 0, 0, 1, -v.x, -v.y);
      const sorted = m.drawables.slice().sort((a, b) => a.sortY - b.sortY);
      const dummy = { x: -999, y: -999 };
      for (const o of sorted) this.drawObstacle(ctx, o, dummy);
      // partículas de "energia" subindo
      if (Math.random() < 0.6) BL.FX.spawn(v.x + Math.random() * v.w, v.y + v.h + 4, U.rand(-6, 6), U.rand(-40, -15), U.rand(2, 5), U.randInt(1, 2), U.pick(['#35e0ff', '#1e90ff', '#ffffff']), 0);
      BL.FX.update(dt);
      BL.FX.drawTop(ctx, v);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(3,6,18,0.45)';
      ctx.fillRect(0, 0, v.w, v.h);
      ctx.drawImage(this.vignette, 0, 0);
    }
  }

  BL.Game = Game;
})();
