'use strict';
/* =========================================================================
 * projectiles.js — bolas do jogador (várias trajetórias: reta, curva/
 * teleguiada, órbita, lob/voleio) e projéteis inimigos. Com pooling.
 *
 * Estrutura de um projétil do jogador:
 * { x, y, vx, vy, r, dmg, pierce, life, kind, sprite, behavior,
 *   explodeR, explodeDmg, knock, hitCd, bounce, trail, src, ... }
 * ========================================================================= */
(function () {
  const BL = window.BL;
  const U = BL.U;
  const C = BL.Collision;

  const DEFAULTS = {
    x: 0, y: 0, vx: 0, vy: 0, r: 3, dmg: 10, pierce: 0, life: 1, maxLife: 1,
    sprite: 'normal', behavior: 'straight', spin: 0, spinSpd: 14,
    explodeR: 0, explodeDmg: 0, explodeEnd: false, explodeOnHit: true, knock: 60, hitCd: 0,
    bounce: false, trail: null, trailT: 0, src: 'direct_shot', crit: 0, execute: 0,
    target: null, turn: 0, speed: 0, chain: 0, chainRange: 150,
    orbR: 0, ang: 0, angSpd: 0, // órbita
    back: false, outT: 0, markHit: 0, ghost: null, ghostT: 0, // bumerangue / pós-imagem
    sx: 0, sy: 0, tx: 0, ty: 0, t: 0, dur: 1, h: 40, // lob
    dead: false, shake: 0, stun: 0, gx: 0, gy: 0, hidden: false, color: '#fff', size: 1, scale: 1, glow: null, palette: null, owner: 0, z: 0,
  };

  const Pr = (BL.Projectiles = {
    list: [],
    enemy: [],
    free: [],
    efree: [],
    buf: [],

    reset() {
      for (const p of this.list) this.free.push(p);
      for (const p of this.enemy) this.efree.push(p);
      this.list.length = 0;
      this.enemy.length = 0;
    },

    spawn(o) {
      const p = this.free.pop() || { hit: new Set(), hitT: new Map() };
      Object.assign(p, DEFAULTS, o);
      p.hit.clear();
      p.hitT.clear();
      p.maxLife = p.life;
      if (!p.speed) p.speed = Math.hypot(p.vx, p.vy);
      this.list.push(p);
      return p;
    },

    spawnEnemy(o) {
      const p = this.efree.pop() || {};
      p.x = o.x;
      p.y = o.y;
      p.vx = o.vx;
      p.vy = o.vy;
      p.r = o.r || 3;
      p.dmg = o.dmg || 8;
      p.life = o.life || 3;
      p.sprite = o.sprite || 'enemy';
      p.spin = 0;
      p.accel = o.accel || 0;
      p.turn = o.turn || 0; // curva (rad/s) durante turnT segundos
      p.turnT = o.turnT || 0;
      p.trail = o.trail || null;
      this.enemy.push(p);
      return p;
    },

    update(game, dt) {
      const list = this.list;
      const map = game.map;
      const pl = game.player;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life -= dt;
        p.spin += dt * p.spinSpd;
        if (p.life <= 0 || p.dead) {
          if (!p.dead && p.explodeEnd) game.explode(p.x, p.y, p.explodeEnd.r, p.explodeEnd.dmg, p.src, p.explodeEnd.palette, true);
          this.free.push(p);
          U.removeAt(list, i);
          continue;
        }

        switch (p.behavior) {
          case 'homing': {
            if (!p.target || p.target.dead) p.target = game.nearestEnemy(p.x, p.y, 260, p.hit);
            if (p.target) {
              const want = Math.atan2(p.target.y - p.y, p.target.x - p.x);
              let cur = Math.atan2(p.vy, p.vx);
              let d = want - cur;
              while (d > Math.PI) d -= Math.PI * 2;
              while (d < -Math.PI) d += Math.PI * 2;
              const mx = p.turn * dt;
              cur += U.clamp(d, -mx, mx);
              p.vx = Math.cos(cur) * p.speed;
              p.vy = Math.sin(cur) * p.speed;
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            break;
          }
          case 'boomerang': {
            // vai reto por outT segundos e depois volta para o jogador
            if (!p.back) {
              p.outT -= dt;
              if (p.outT <= 0) {
                p.back = true;
                p.hit.clear();
              }
            } else {
              const dx = pl.x - p.x, dy = pl.y - p.y;
              const d = Math.hypot(dx, dy) || 1;
              if (d < 10) {
                p.dead = true;
                p.life = 0;
                break;
              }
              p.vx = (dx / d) * p.speed * 1.25;
              p.vy = (dy / d) * p.speed * 1.25;
              p.life = Math.max(p.life, 0.2);
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            break;
          }
          case 'orbit': {
            p.ang += p.angSpd * dt;
            p.x = pl.x + Math.cos(p.ang) * p.orbR;
            p.y = pl.y + Math.sin(p.ang) * p.orbR;
            break;
          }
          case 'lob': {
            p.t += dt;
            const k = Math.min(1, p.t / p.dur);
            p.x = U.lerp(p.sx, p.tx, k);
            p.y = U.lerp(p.sy, p.ty, k);
            p.z = Math.sin(k * Math.PI) * p.h;
            if (k >= 1) {
              game.explode(p.tx, p.ty, p.explodeR, p.explodeDmg, p.src, p.palette, false, p.knock);
              p.dead = true;
              p.life = 0;
            }
            break;
          }
          default:
            p.x += p.vx * dt;
            p.y += p.vy * dt;
        }

        // rastro
        if (p.trail) {
          p.trailT -= dt;
          if (p.trailT <= 0) {
            p.trailT = 0.016;
            BL.FX.spawn(p.x + U.rand(-1, 1), p.y - (p.z || 0) + U.rand(-1, 1), -p.vx * 0.05, -p.vy * 0.05, 0.25, p.size > 1 ? 3 : 2, p.trail, 6);
          }
        }

        if (p.ghost) {
          p.ghostT -= dt;
          if (p.ghostT <= 0) {
            p.ghostT = 0.02;
            BL.FX.ghost(p.ghost, p.x - p.gx, p.y - p.gy, 0.22, 0.6);
          }
        }

        if (p.behavior === 'lob') continue;

        // obstáculos
        if (p.behavior !== 'orbit' && p.behavior !== 'boomerang' && !p.ghost) {
          const o = C.pointSolid(map, p.x, p.y);
          if (o) {
            if (p.bounce) {
              p.x -= p.vx * dt;
              p.y -= p.vy * dt;
              // reflete no eixo de menor penetração
              if (C.pointSolid(map, p.x + p.vx * dt, p.y)) p.vx = -p.vx;
              else p.vy = -p.vy;
            } else {
              BL.FX.burst(p.x, p.y, 6, ['#ffffff', '#9aa4c4'], 20, 70, 0.15, 0.3, 1, 2);
              if (p.explodeR) game.explode(p.x, p.y, p.explodeR, p.explodeDmg, p.src, p.palette, p.explodeR > 50, p.knock);
              else if (p.explodeEnd) game.explode(p.x, p.y, p.explodeEnd.r, p.explodeEnd.dmg, p.src, p.explodeEnd.palette, true);
              p.dead = true;
              p.explodeEnd = false;
              continue;
            }
          }
        }

        // inimigos
        const near = game.grid.query(p.x, p.y, p.r + 18, this.buf);
        for (let k = 0; k < near.length; k++) {
          const e = near[k];
          if (e.dead || e.spawnT > 0) continue;
          const rr = p.r + e.r;
          if (U.dist2(p.x, p.y, e.x, e.y) > rr * rr) continue;
          if (p.hitCd > 0) {
            const t = p.hitT.get(e.id);
            if (t !== undefined && game.time < t) continue;
            p.hitT.set(e.id, game.time + p.hitCd);
          } else {
            if (p.hit.has(e.id)) continue;
            p.hit.add(e.id);
          }
          const sp = p.speed || 1;
          game.damageEnemy(e, p.dmg, {
            src: p.src,
            kx: p.behavior === 'orbit' ? e.x - pl.x : p.vx / sp,
            ky: p.behavior === 'orbit' ? e.y - pl.y : p.vy / sp,
            knock: p.knock,
            crit: p.crit,
            execute: p.execute,
            stun: p.stun,
          });
          if (p.markHit && !e.dead) e.markT = Math.max(e.markT, p.markHit);
          if (p.shake) game.shake(p.shake);
          if (p.explodeR && p.explodeOnHit) game.explode(e.x, e.y, p.explodeR, p.explodeDmg, p.src, p.palette, false, p.knock);
          BL.FX.burst(e.x, e.y, 4, ['#ffffff', p.color], 30, 90, 0.1, 0.25, 1, 2);
          if (p.chain > 0) {
            p.chain--;
            const nt = game.nearestEnemy(p.x, p.y, p.chainRange, p.hit);
            if (nt) {
              p.target = nt;
              const a = Math.atan2(nt.y - p.y, nt.x - p.x);
              p.vx = Math.cos(a) * p.speed;
              p.vy = Math.sin(a) * p.speed;
              p.life = Math.max(p.life, 0.8);
            }
          }
          if (--p.pierce < 0) {
            p.dead = true;
            if (p.explodeEnd) {
              game.explode(p.x, p.y, p.explodeEnd.r, p.explodeEnd.dmg, p.src, p.explodeEnd.palette, true);
              p.explodeEnd = false;
            }
            break;
          }
        }
      }

      // ---------------------------------------------- projéteis inimigos
      const en = this.enemy;
      for (let i = en.length - 1; i >= 0; i--) {
        const p = en[i];
        p.life -= dt;
        p.spin += dt * 12;
        if (p.accel) {
          p.vx *= 1 + p.accel * dt;
          p.vy *= 1 + p.accel * dt;
        }
        if (p.turnT > 0) {
          const a = p.turn * Math.min(dt, p.turnT);
          p.turnT -= dt;
          const c = Math.cos(a), sn = Math.sin(a);
          const vx = p.vx * c - p.vy * sn;
          p.vy = p.vx * sn + p.vy * c;
          p.vx = vx;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.trail && Math.random() < 0.5) BL.FX.spawn(p.x, p.y, 0, 0, 0.2, 2, p.trail, 0);
        let kill = p.life <= 0;
        if (!kill && C.pointSolid(map, p.x, p.y)) {
          kill = true;
          BL.FX.burst(p.x, p.y, 5, ['#ff5577', '#ffffff'], 20, 60, 0.1, 0.25, 1, 2);
        }
        if (!kill) {
          const rr = p.r + pl.r - 1;
          if (U.dist2(p.x, p.y, pl.x, pl.y) < rr * rr && pl.canBeHit()) {
            game.hurtPlayer(p.dmg, p);
            kill = true;
          }
        }
        if (kill) {
          this.efree.push(p);
          U.removeAt(en, i);
        }
      }
    },

    draw(ctx, game, view) {
      const B = BL.Sprites.balls;
      const x0 = view.x - 20, y0 = view.y - 40, x1 = view.x + view.w + 20, y1 = view.y + view.h + 20;
      for (const p of this.list) {
        if (p.dead || p.hidden || p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
        const frames = B[p.sprite] || B.normal;
        const img = frames[(Math.floor(p.spin) & 3)];
        const z = p.z || 0;
        if (p.behavior === 'lob' || z) {
          const sh = BL.Sprites.misc.shadowBall;
          ctx.drawImage(sh, Math.round(p.x - 3), Math.round(p.y + 2));
        }
        const sc = p.scale || 1;
        const w = img.width * sc, h = img.height * sc;
        if (p.glow) {
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = p.glow;
          ctx.beginPath();
          ctx.arc(p.x, p.y - z, w * 0.75, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.drawImage(img, Math.round(p.x - w / 2), Math.round(p.y - z - h / 2), w, h);
      }
      for (const p of this.enemy) {
        if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
        const frames = B[p.sprite] || B.enemy;
        const img = frames[(Math.floor(p.spin) & 3)];
        ctx.drawImage(img, Math.round(p.x - img.width / 2), Math.round(p.y - img.height / 2));
      }
    },
  });
})();
