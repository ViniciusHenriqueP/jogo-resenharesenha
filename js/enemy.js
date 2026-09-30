'use strict';
/* =========================================================================
 * enemy.js — tipos de inimigos (rivais), IA, bosses e renderização.
 *
 * Estrutura Enemy:
 * { id, type, def, x, y, r, hp, maxHp, speed, dmg, xp, kx, ky, flash,
 *   stun, markT, buffT, shootT, dir, animT, dead, spawnT, isBoss, ... }
 * ========================================================================= */
(function () {
  const BL = window.BL;
  const U = BL.U;

  /** atributos base (wave 1) — escalados por waves.js */
  const TYPES = (BL.EnemyTypes = {
    rival: { name: 'RIVAL', hp: 10, speed: 40, dmg: 6, xp: 10, r: 6, mass: 1, ai: 'chase', sprite: 'rival', colors: ['#e6e6ee', '#d7263d'] },
    speedster: { name: 'SPEEDSTER', hp: 7, speed: 78, dmg: 5, xp: 10, r: 5, mass: 0.8, ai: 'lunge', sprite: 'speedster', colors: ['#f2c230', '#111111'] },
    defender: { name: 'DEFENDER', hp: 58, speed: 27, dmg: 10, xp: 22, r: 8, mass: 3, ai: 'chase', sprite: 'defender', colors: ['#2c3e2e', '#8fd14f'] },
    striker: { name: 'STRIKER', hp: 18, speed: 36, dmg: 6, xp: 16, r: 6, mass: 1, ai: 'ranged', sprite: 'striker', colors: ['#ff7a1a', '#ffffff'], range: 170, pref: 115, shotCd: 2.6 },
    playmaker: { name: 'PLAYMAKER', hp: 32, speed: 33, dmg: 6, xp: 28, r: 6, mass: 1.2, ai: 'support', sprite: 'playmaker', colors: ['#6c2bd9', '#e0c3ff'], pref: 105 },
    elite: { name: 'ELITE', hp: 280, speed: 47, dmg: 14, xp: 140, r: 8, mass: 5, ai: 'elite', sprite: 'elite', colors: ['#ff2d55', '#141418'], elite: true },
  });

  const BOSSES = (BL.BossDefs = [
    { key: 'raizen', name: 'KAITO RAIZEN', title: 'THE LIGHTNING WINGER', sprite: 'boss_raizen', hp: 2800, speed: 62, dmg: 18, r: 13, xp: 1400, color: '#00e5ff', palette: ['#00e5ff', '#ffd400', '#ffffff'] },
    { key: 'tetsuda', name: 'GOUKI TETSUDA', title: 'THE IRON WALL', sprite: 'boss_tetsuda', hp: 9000, speed: 36, dmg: 24, r: 16, xp: 2400, color: '#ff7b00', palette: ['#ff7b00', '#4a4a58', '#ffffff'] },
    { key: 'mikagami', name: 'SHION MIKAGAMI', title: "THE EMPEROR'S EYE", sprite: 'boss_mikagami', hp: 18000, speed: 50, dmg: 20, r: 13, xp: 3400, color: '#b061ff', palette: ['#b061ff', '#f0f0ff', '#e0c3ff'] },
    { key: 'kurogane', name: 'REN KUROGANE', title: 'THE ABSOLUTE STRIKER', sprite: 'boss_kurogane', hp: 32000, speed: 58, dmg: 26, r: 15, xp: 5000, color: '#ff1e3c', palette: ['#ff1e3c', '#0c0c0e', '#ffffff'] },
  ]);

  const tmp = { x: 0, y: 0 };
  const buf = [];

  const E = (BL.Enemies = {
    free: [],

    create(game, typeKey, x, y, opts) {
      opts = opts || {};
      const def = TYPES[typeKey];
      const sc = game.waves.scaling();
      const e = this.free.pop() || {};
      e.id = BL.nextId();
      e.type = typeKey;
      e.def = def;
      e.x = x;
      e.y = y;
      e.r = def.r;
      e.maxHp = e.hp = Math.round(def.hp * sc.hp * (opts.hpMul || 1));
      e.speed = def.speed * sc.spd * U.rand(0.9, 1.1);
      e.dmg = def.dmg * sc.dmg;
      e.xp = Math.round(def.xp * sc.xp);
      e.mass = def.mass;
      e.sprite = def.sprite;
      e.kx = e.ky = 0;
      e.flash = 0;
      e.stun = 0;
      e.markT = 0;
      e.buffT = 0;
      e.shootT = U.rand(0.8, def.shotCd || 2);
      e.auraT = U.rand(1, 3);
      e.lungeT = U.rand(1, 3);
      e.lockT = 0;
      e.lockX = e.lockY = 0;
      e.dir = 'down';
      e.animT = Math.random() * 4;
      e.moving = true;
      e.dead = false;
      e.spawnT = opts.spawnT || 0;
      e.isBoss = false;
      e.isElite = !!def.elite;
      e.side = Math.random() < 0.5 ? -1 : 1;
      e.pose = 'run';
      e.alpha = 1;
      e.sortY = y;
      e.boss = null;
      e.z = 0;
      return e;
    },

    createBoss(game, idx, cycle, x, y) {
      const bd = BOSSES[idx];
      const e = this.create(game, 'rival', x, y);
      const hpMul = 1 + cycle * 1.4;
      e.type = 'boss';
      e.def = { name: bd.name, colors: bd.palette, ai: 'boss' };
      e.isBoss = true;
      e.boss = bd;
      e.r = bd.r;
      e.maxHp = e.hp = Math.round(bd.hp * hpMul);
      e.speed = bd.speed * (1 + cycle * 0.1);
      e.dmg = bd.dmg * (1 + cycle * 0.35);
      e.xp = Math.round(bd.xp * (1 + cycle));
      e.mass = 999;
      e.sprite = bd.sprite;
      e.st = 'intro';
      e.stT = 1.2;
      e.n = 0;
      e.cyc = 0;
      e.enraged = false;
      e.tempo = 1;
      e.cycleLevel = cycle;
      e.displayName = bd.name + (cycle ? ' ' + U.roman(cycle + 1) : '');
      return e;
    },

    release(e) {
      this.free.push(e);
    },

    // ================================================================ UPDATE
    update(game, e, dt) {
      if (e.flash > 0) e.flash -= dt;
      if (e.markT > 0) e.markT -= dt;
      if (e.buffT > 0) e.buffT -= dt;
      if (e.spawnT > 0) {
        e.spawnT -= dt;
        return;
      }
      const pl = game.player;
      const dx = pl.x - e.x, dy = pl.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const tdx = dx / d, tdy = dy / d;
      const buff = e.buffT > 0 ? 1.3 : 1;
      let spd = e.speed * buff;
      let mx = 0, my = 0;
      e.pose = 'run';

      if (e.isBoss) {
        const r = BOSS_AI[e.boss.key](game, e, dt, tdx, tdy, d);
        mx = r.x;
        my = r.y;
        spd = r.spd;
      } else if (e.stun > 0) {
        e.stun -= dt;
      } else if (e.lockT > 0) {
        e.lockT -= dt;
        mx = e.lockX;
        my = e.lockY;
        spd *= e.lockSpd || 2.4;
        e.pose = 'dash';
        if (Math.random() < 0.5) BL.FX.spawn(e.x, e.y + 6, 0, 0, 0.25, 2, e.def.colors[0], 0);
      } else {
        const ai = e.def.ai;
        if (ai === 'ranged' || ai === 'support') {
          const pref = e.def.pref;
          if (d > pref + 20) {
            this.path(game, e, tdx, tdy);
            mx = tmp.x;
            my = tmp.y;
          } else if (d < pref - 25) {
            mx = -tdx;
            my = -tdy;
          } else {
            mx = -tdy * e.side * 0.6;
            my = tdx * e.side * 0.6;
          }
          if (ai === 'ranged') {
            e.shootT -= dt;
            if (e.shootT <= 0 && d < e.def.range) {
              e.shootT = e.def.shotCd * U.rand(0.85, 1.15);
              const sp = 125 * (1 + game.waves.wave * 0.012);
              BL.Projectiles.spawnEnemy({ x: e.x, y: e.y, vx: tdx * sp, vy: tdy * sp, dmg: e.dmg * 1.3 * buff, r: 3, life: 2.6 });
              e.pose = 'kick';
              e.kickT = 0.2;
              BL.Audio.play('enemyShot');
            }
          } else {
            e.auraT -= dt;
            if (e.auraT <= 0) {
              e.auraT = 3.5;
              BL.FX.ring(e.x, e.y, 6, 90, 0.5, '#b061ff', 2, true);
              game.grid.query(e.x, e.y, 90, buf);
              for (const o of buf) if (!o.isBoss && o !== e && U.dist2(o.x, o.y, e.x, e.y) < 8100) o.buffT = 4;
            }
          }
        } else {
          this.path(game, e, tdx, tdy);
          mx = tmp.x;
          my = tmp.y;
          if (ai === 'lunge' || ai === 'elite') {
            e.lungeT -= dt;
            const range = ai === 'elite' ? 150 : 95;
            if (e.lungeT <= 0 && d < range) {
              e.lungeT = ai === 'elite' ? 3.5 : U.rand(2.2, 3.2);
              e.lockT = ai === 'elite' ? 0.4 : 0.32;
              e.lockX = tdx;
              e.lockY = tdy;
              e.lockSpd = ai === 'elite' ? 3.2 : 2.4;
              e.flash = 0.06;
            }
          }
        }
      }
      if (e.kickT > 0) {
        e.kickT -= dt;
        e.pose = 'kick';
      }

      e.x += (mx * spd + e.kx) * dt;
      e.y += (my * spd + e.ky) * dt;
      const kd = Math.exp(-9 * dt);
      e.kx *= kd;
      e.ky *= kd;

      // separação entre inimigos (evita empilhamento)
      if (!e.isBoss || e.st !== 'leap') {
        game.grid.query(e.x, e.y, e.r + 10, buf);
        let n = 0;
        for (let i = 0; i < buf.length && n < 8; i++) {
          const o = buf[i];
          if (o === e || o.dead) continue;
          const ox = e.x - o.x, oy = e.y - o.y;
          const rr = e.r + o.r;
          const d2 = ox * ox + oy * oy;
          if (d2 >= rr * rr || d2 < 0.0001) continue;
          n++;
          const dd = Math.sqrt(d2);
          const push = ((rr - dd) / dd) * (o.mass / (e.mass + o.mass)) * 0.8;
          e.x += ox * push;
          e.y += oy * push;
        }
        BL.Collision.resolve(game.map, e);
      }

      // dano de contato
      const rr = e.r + pl.r - 2;
      if (d < rr + 1 && pl.canBeHit() && e.z <= 4) game.hurtPlayer(e.dmg * buff, e);

      // animação / direção
      const vx = mx * spd + e.kx, vy = my * spd + e.ky;
      e.vx = vx;
      e.vy = vy;
      e.moving = Math.abs(vx) + Math.abs(vy) > 4;
      e.animT += dt * (Math.hypot(vx, vy) / 9);
      if (e.moving) {
        if (Math.abs(vx) > Math.abs(vy) * 0.9) e.dir = vx > 0 ? 'right' : 'left';
        else e.dir = vy > 0 ? 'down' : 'up';
      }
      e.sortY = e.y;
    },

    path(game, e, tdx, tdy) {
      if (!game.map.flow.dir(e.x, e.y, tdx, tdy, tmp)) {
        tmp.x = tdx;
        tmp.y = tdy;
      }
    },

    // ================================================================= DRAW
    draw(ctx, game, e) {
      const S = BL.Sprites;
      const set = S.chars[e.sprite];
      const sc = set.scale;
      const x = Math.round(e.x), y = Math.round(e.y);
      const t = game.time;

      if (e.spawnT > 0) {
        // aparecendo: silhueta piscando
        ctx.globalAlpha = 0.5;
        ctx.drawImage(S.misc.shadow, x - 7, y + 6);
        if (Math.floor(e.spawnT * 14) % 2) return (ctx.globalAlpha = 1);
        ctx.drawImage(set.fdown[0], x - 10 * sc, y - 12 * sc);
        ctx.globalAlpha = 1;
        return;
      }

      if (e.isElite) {
        ctx.globalAlpha = 0.3 + Math.sin(t * 10 + e.id) * 0.1;
        ctx.fillStyle = '#ff2d55';
        ctx.beginPath();
        ctx.ellipse(x, y + 7, 13, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (Math.random() < 0.25) BL.FX.spawn(x + U.rand(-6, 6), y + U.rand(-10, 8), 0, -30, 0.4, 2, '#ff2d55', 1);
      }
      if (e.isBoss) {
        ctx.globalAlpha = (0.25 + Math.sin(t * 8) * 0.08) * e.alpha;
        ctx.fillStyle = e.boss.color;
        ctx.beginPath();
        ctx.ellipse(x, y + 14, 24, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = e.alpha;
        const z = e.z || 0;
        const shs = z > 0 ? Math.max(0.4, 1 - z / 120) : 1;
        ctx.drawImage(S.misc.shadowBig, x - 15 * shs, y + 14, 30 * shs, 9 * shs);
      } else {
        ctx.drawImage(S.misc.shadow, x - 7, y + 6);
      }

      let idx = 0;
      if (e.pose === 'dash') idx = 5;
      else if (e.pose === 'kick') idx = 4;
      else if (e.moving) idx = Math.floor(e.animT) % 4;
      const frames = e.flash > 0 ? set['f' + e.dir] : set[e.dir];
      const img = frames[idx];
      ctx.drawImage(img, x - 10 * sc, y - 12 * sc - (e.z || 0));
      if (e.buffT > 0 && !e.isBoss) {
        ctx.drawImage(S.misc.buff, x + 4, y - 16 + (Math.floor(t * 6) % 2));
      }
      if (e.markT > 0) {
        ctx.drawImage(S.misc.markEye, x - 3, y - 12 * sc - 8 + (Math.floor(t * 5) % 2));
      }
      ctx.globalAlpha = 1;
      // barra de vida para elites e defensores feridos
      if (!e.isBoss && (e.isElite || (e.type === 'defender' && e.hp < e.maxHp))) {
        const w = 16;
        ctx.fillStyle = '#05060c';
        ctx.fillRect(x - w / 2 - 1, y - 17, w + 2, 4);
        ctx.fillStyle = e.isElite ? '#ff2d55' : '#8fd14f';
        ctx.fillRect(x - w / 2, y - 16, Math.max(1, Math.round((w * e.hp) / e.maxHp)), 2);
      }
    },
  });

  // ================================================================ BOSS IA
  const out = { x: 0, y: 0, spd: 0 };
  function mv(x, y, spd) {
    out.x = x;
    out.y = y;
    out.spd = spd;
    return out;
  }
  function next(e, st, t) {
    e.st = st;
    e.stT = t * e.tempo;
  }
  function radial(game, e, n, spd, off, dmg, sprite, r) {
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2;
      BL.Projectiles.spawnEnemy({ x: e.x, y: e.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, dmg, r: r || 3, life: 4, sprite });
    }
    BL.Audio.play('enemyShot');
  }
  function spread(game, e, n, arc, spd, dmg) {
    const pl = game.player;
    const base = Math.atan2(pl.y - e.y, pl.x - e.x);
    for (let i = 0; i < n; i++) {
      const a = base + (n > 1 ? (i / (n - 1) - 0.5) * arc : 0);
      BL.Projectiles.spawnEnemy({ x: e.x, y: e.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, dmg, r: 3, life: 3.5 });
    }
    BL.Audio.play('enemyShot');
  }
  function summon(game, e, type, n, radius) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      game.spawnEnemy(type, e.x + Math.cos(a) * radius, e.y + Math.sin(a) * radius, { spawnT: 0.6 });
    }
    BL.FX.ring(e.x, e.y, 10, radius + 10, 0.5, e.boss.color, 3, true);
  }
  function enrageCheck(game, e) {
    if (!e.enraged && e.hp < e.maxHp * 0.5) {
      e.enraged = true;
      e.tempo = 0.72;
      e.speed *= 1.25;
      game.banner(e.boss.name.split(' ')[1] + ' ENTERS FLOW!', 'boss');
      BL.FX.ring(e.x, e.y, 10, 120, 0.6, e.boss.color, 4);
      game.shake(8);
      BL.Audio.play('flow');
    }
  }
  function chargeStep(game, e, dt) {
    if (Math.random() < 0.6) {
      const set = BL.Sprites.chars[e.sprite];
      BL.FX.ghost(set[e.dir][5], e.x - 20, e.y - 24, 0.3, 0.5);
    }
    return mv(e.cx, e.cy, e.chargeSpd);
  }
  function startWindup(game, e, len, w, color) {
    const pl = game.player;
    e.cang = Math.atan2(pl.y - e.y, pl.x - e.x);
    e.cx = Math.cos(e.cang);
    e.cy = Math.sin(e.cang);
    BL.FX.telegraph({ kind: 'line', x: e.x, y: e.y, ang: e.cang, len, w, dur: e.stT, color, follow: e });
    BL.Audio.play('charge');
  }

  const BOSS_AI = {
    // ---------------------------------------------- velocidade / investidas
    raizen(game, e, dt, tdx, tdy) {
      enrageCheck(game, e);
      e.stT -= dt;
      switch (e.st) {
        case 'intro':
          if (e.stT <= 0) next(e, 'chase', 1.5);
          return mv(0, 0, 0);
        case 'chase':
          if (e.stT <= 0) {
            e.n = e.enraged ? 4 : 3;
            next(e, 'windup', 0.6);
            startWindup(game, e, 280, 22, '#00e5ff');
          }
          if (Math.random() < 0.3) BL.FX.ghost(BL.Sprites.chars[e.sprite][e.dir][0], e.x - 20, e.y - 24, 0.2, 0.3);
          return mv(tdx, tdy, e.speed);
        case 'windup':
          e.pose = 'kick';
          if (e.stT <= 0) {
            next(e, 'charge', 0.55);
            e.chargeSpd = 420;
            BL.Audio.play('dash');
          }
          return mv(0, 0, 0);
        case 'charge': {
          e.pose = 'dash';
          const hitWall = BL.Collision.pointSolid(game.map, e.x + e.cx * (e.r + 4), e.y + e.cy * (e.r + 4));
          if (e.stT <= 0 || hitWall) {
            if (e.enraged) spread(game, e, 5, 0.9, 140, e.dmg * 0.6);
            if (--e.n > 0) {
              next(e, 'windup', 0.45);
              startWindup(game, e, 280, 22, '#00e5ff');
            } else {
              e.cyc++;
              if (e.cyc % 2 === 0) summon(game, e, 'speedster', 6, 50);
              next(e, 'chase', 2.2);
            }
            return mv(0, 0, 0);
          }
          return chargeStep(game, e, dt);
        }
      }
      return mv(0, 0, 0);
    },

    // --------------------------------------------------- força física
    tetsuda(game, e, dt, tdx, tdy) {
      enrageCheck(game, e);
      e.stT -= dt;
      const pl = game.player;
      switch (e.st) {
        case 'intro':
          if (e.stT <= 0) next(e, 'chase', 2.2);
          return mv(0, 0, 0);
        case 'chase':
          if (e.stT <= 0) {
            e.cyc++;
            if (e.cyc % 2) {
              next(e, 'slamWind', 0.9);
              BL.FX.telegraph({ kind: 'circle', x: e.x, y: e.y, r: 90, dur: e.stT, color: '#ff7b00', follow: e, grow: true });
              BL.Audio.play('charge');
            } else {
              next(e, 'leapWind', 0.5);
              e.lx = pl.x;
              e.ly = pl.y;
              e.sx = e.x;
              e.sy = e.y;
              BL.FX.telegraph({ kind: 'circle', x: e.lx, y: e.ly, r: 75, dur: e.stT + 0.85 * e.tempo, color: '#ff7b00', grow: true });
            }
          }
          return mv(tdx, tdy, e.speed);
        case 'slamWind':
          e.pose = 'kick';
          if (e.stT <= 0) {
            game.shake(9);
            BL.Audio.play('explosion', { big: true });
            BL.FX.explosion(e.x, e.y, 90, ['#ffffff', '#ff7b00', '#4a4a58', '#ffd84a'], true);
            if (U.dist(e.x, e.y, pl.x, pl.y) < 90 + pl.r && pl.canBeHit()) game.hurtPlayer(e.dmg * 1.3, e);
            radial(game, e, e.enraged ? 22 : 16, 105, Math.random(), e.dmg * 0.7);
            next(e, 'recover', 0.8);
          }
          return mv(0, 0, 0);
        case 'leapWind':
          e.pose = 'kick';
          if (e.stT <= 0) {
            next(e, 'leap', 0.85);
            e.leapDur = e.stT;
            BL.Audio.play('dash');
          }
          return mv(0, 0, 0);
        case 'leap': {
          e.pose = 'dash';
          const k = 1 - Math.max(0, e.stT) / e.leapDur;
          e.x = U.lerp(e.sx, e.lx, k);
          e.y = U.lerp(e.sy, e.ly, k);
          e.z = Math.sin(k * Math.PI) * 90;
          if (e.stT <= 0) {
            e.z = 0;
            BL.Collision.resolve(game.map, e);
            game.shake(10);
            BL.Audio.play('explosion', { big: true });
            BL.FX.explosion(e.x, e.y, 75, ['#ffffff', '#ff7b00', '#4a4a58', '#ffd84a'], true);
            if (U.dist(e.x, e.y, pl.x, pl.y) < 75 + pl.r && pl.canBeHit()) game.hurtPlayer(e.dmg * 1.4, e);
            radial(game, e, 10, 120, 0, e.dmg * 0.7);
            if (e.cyc % 4 === 0) summon(game, e, 'defender', e.enraged ? 4 : 3, 60);
            next(e, 'recover', 0.7);
          }
          return mv(0, 0, 0);
        }
        case 'recover':
          if (e.stT <= 0) next(e, 'chase', 2.2);
          return mv(tdx, tdy, e.speed * 0.4);
      }
      return mv(0, 0, 0);
    },

    // ---------------------------------------------------- visão de jogo
    mikagami(game, e, dt, tdx, tdy, d) {
      enrageCheck(game, e);
      e.stT -= dt;
      const pl = game.player;
      switch (e.st) {
        case 'intro':
          if (e.stT <= 0) next(e, 'kite', 2.5);
          return mv(0, 0, 0);
        case 'kite': {
          e.shootT -= dt;
          if (e.shootT <= 0) {
            e.shootT = e.enraged ? 0.6 : 0.9;
            spread(game, e, e.enraged ? 7 : 5, 0.8, 135, e.dmg * 0.6);
            e.kickT = 0.2;
          }
          if (e.stT <= 0) {
            e.cyc++;
            const pick = e.cyc % 3;
            if (pick === 1) {
              next(e, 'spiral', 3);
              e.sa = 0;
              e.sT = 0;
            } else if (pick === 2) next(e, 'blinkOut', 0.35);
            else {
              next(e, 'command', 0.8);
              BL.FX.telegraph({ kind: 'circle', x: e.x, y: e.y, r: 60, dur: e.stT, color: '#b061ff', follow: e, grow: true });
            }
          }
          if (d < 150) return mv(-tdx, -tdy, e.speed);
          if (d > 210) return mv(tdx, tdy, e.speed);
          return mv(-tdy * e.side, tdx * e.side, e.speed * 0.7);
        }
        case 'spiral':
          e.sT -= dt;
          if (e.sT <= 0) {
            e.sT = 0.09;
            e.sa += 0.33;
            const arms = e.enraged ? 3 : 2;
            for (let i = 0; i < arms; i++) {
              const a = e.sa + (i / arms) * Math.PI * 2;
              BL.Projectiles.spawnEnemy({ x: e.x, y: e.y, vx: Math.cos(a) * 110, vy: Math.sin(a) * 110, dmg: e.dmg * 0.55, r: 3, life: 3.5 });
            }
          }
          if (e.stT <= 0) next(e, 'kite', 2.2);
          return mv(0, 0, 0);
        case 'blinkOut':
          e.alpha = Math.max(0.05, e.stT / 0.35);
          if (e.stT <= 0) {
            const a = Math.random() * Math.PI * 2;
            BL.FX.burst(e.x, e.y, 20, ['#b061ff', '#e0c3ff'], 40, 120, 0.3, 0.6, 1, 3);
            e.x = pl.x + Math.cos(a) * 150;
            e.y = pl.y + Math.sin(a) * 150;
            BL.Collision.resolve(game.map, e);
            BL.FX.burst(e.x, e.y, 20, ['#b061ff', '#e0c3ff'], 40, 120, 0.3, 0.6, 1, 3);
            next(e, 'blinkIn', 0.35);
          }
          return mv(0, 0, 0);
        case 'blinkIn':
          e.alpha = 1 - Math.max(0, e.stT / 0.35);
          if (e.stT <= 0) {
            e.alpha = 1;
            radial(game, e, 12, 120, Math.random(), e.dmg * 0.6);
            next(e, 'kite', 2.4);
          }
          return mv(0, 0, 0);
        case 'command':
          if (e.stT <= 0) {
            BL.FX.ring(e.x, e.y, 20, 320, 0.8, '#b061ff', 4, true);
            game.grid.query(e.x, e.y, 350, buf);
            for (const o of buf) if (!o.isBoss) o.buffT = 6;
            summon(game, e, 'striker', 2, 40);
            summon(game, e, 'playmaker', 1, 40);
            game.banner('EMPEROR COMMAND', 'boss');
            next(e, 'kite', 2.5);
          }
          return mv(0, 0, 0);
      }
      return mv(0, 0, 0);
    },

    // ---------------------------------------------------- finalização
    kurogane(game, e, dt, tdx, tdy) {
      enrageCheck(game, e);
      e.stT -= dt;
      const pl = game.player;
      switch (e.st) {
        case 'intro':
          if (e.stT <= 0) next(e, 'chase', 1.8);
          return mv(0, 0, 0);
        case 'chase':
          if (e.stT <= 0) {
            e.cyc++;
            if (e.cyc % 2) {
              next(e, 'aim', 1.1);
              e.cang = Math.atan2(pl.y - e.y, pl.x - e.x);
              e.tele = BL.FX.telegraph({ kind: 'line', x: e.x, y: e.y, ang: e.cang, len: 520, w: 18, dur: e.stT, color: '#ff1e3c', follow: e });
              BL.Audio.play('charge');
            } else {
              e.n = 2;
              next(e, 'windup', 0.5);
              startWindup(game, e, 260, 24, '#ff1e3c');
            }
          }
          return mv(tdx, tdy, e.speed);
        case 'aim':
          e.pose = 'kick';
          if (e.stT > 0.3 * e.tempo) {
            // rastreia o jogador até pouco antes do chute
            const want = Math.atan2(pl.y - e.y, pl.x - e.x);
            let dd = want - e.cang;
            while (dd > Math.PI) dd -= Math.PI * 2;
            while (dd < -Math.PI) dd += Math.PI * 2;
            e.cang += dd * Math.min(1, dt * 5);
            if (e.tele) e.tele.ang = e.cang;
          }
          if (e.stT <= 0) {
            const sp = 400;
            BL.Projectiles.spawnEnemy({ x: e.x, y: e.y, vx: Math.cos(e.cang) * sp, vy: Math.sin(e.cang) * sp, dmg: e.dmg * 1.5, r: 7, life: 2.5, sprite: 'enemyBig', trail: '#ff1e3c' });
            game.shake(7);
            BL.Audio.play('power');
            BL.FX.burst(e.x, e.y, 20, ['#ff1e3c', '#ffffff'], 60, 200, 0.2, 0.4, 2, 3, { angle: e.cang, spread: 0.4 });
            next(e, 'burst', 0.5);
            e.n = e.enraged ? 3 : 2;
          }
          return mv(0, 0, 0);
        case 'burst':
          if (e.stT <= 0) {
            radial(game, e, 20, 115, e.n * 0.16, e.dmg * 0.6);
            if (--e.n > 0) next(e, 'burst', 0.35);
            else next(e, 'chase', 2);
          }
          return mv(0, 0, 0);
        case 'windup':
          e.pose = 'kick';
          if (e.stT <= 0) {
            next(e, 'charge', 0.5);
            e.chargeSpd = 440;
            BL.Audio.play('dash');
          }
          return mv(0, 0, 0);
        case 'charge': {
          e.pose = 'dash';
          const hitWall = BL.Collision.pointSolid(game.map, e.x + e.cx * (e.r + 4), e.y + e.cy * (e.r + 4));
          if (e.stT <= 0 || hitWall) {
            spread(game, e, 3, 0.5, 160, e.dmg * 0.6);
            if (--e.n > 0) {
              next(e, 'windup', 0.4);
              startWindup(game, e, 260, 24, '#ff1e3c');
            } else next(e, 'chase', 1.8);
            return mv(0, 0, 0);
          }
          return chargeStep(game, e, dt);
        }
      }
      return mv(0, 0, 0);
    },
  };
})();
