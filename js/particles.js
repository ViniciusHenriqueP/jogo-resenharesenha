'use strict';
/* =========================================================================
 * particles.js — sistema de efeitos com pools fixos: partículas
 * quadradas, anéis de choque, textos flutuantes, afterimages (rastros),
 * telegraphs de ataques de boss e flashes.
 * ========================================================================= */
(function () {
  const BL = window.BL;
  const U = BL.U;
  const CFG = BL.CFG;

  function makePool(factory, max) {
    const items = [];
    for (let i = 0; i < max; i++) items.push(factory());
    return { items, count: 0, max };
  }
  function acquire(pool) {
    if (pool.count < pool.max) return pool.items[pool.count++];
    // pool cheio: recicla uma partícula aleatória (evita explosão de custo)
    return pool.items[(Math.random() * pool.max) | 0];
  }
  function release(pool, i) {
    const last = --pool.count;
    const t = pool.items[i];
    pool.items[i] = pool.items[last];
    pool.items[last] = t;
  }

  const FX = (BL.FX = {
    parts: makePool(() => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, color: '#fff', drag: 0, grav: 0, glow: false }), CFG.MAX_PARTICLES),
    texts: makePool(() => ({ x: 0, y: 0, vy: 0, life: 0, max: 1, text: '', color: '#fff', scale: 1 }), CFG.MAX_TEXTS),
    rings: makePool(() => ({ x: 0, y: 0, r0: 0, r1: 0, life: 0, max: 1, color: '#fff', width: 2, ground: false }), 120),
    ghosts: makePool(() => ({ img: null, x: 0, y: 0, life: 0, max: 1, alpha: 0.5 }), 160),
    tele: [],
    lines: [],

    reset() {
      this.parts.count = 0;
      this.texts.count = 0;
      this.rings.count = 0;
      this.ghosts.count = 0;
      this.tele.length = 0;
      this.lines.length = 0;
    },

    spawn(x, y, vx, vy, life, size, color, drag, grav, glow) {
      const p = acquire(this.parts);
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.life = p.max = life;
      p.size = size;
      p.color = color;
      p.drag = drag || 0;
      p.grav = grav || 0;
      p.glow = !!glow;
      return p;
    },

    burst(x, y, n, colors, spd0, spd1, life0, life1, size0, size1, opts) {
      opts = opts || {};
      for (let i = 0; i < n; i++) {
        const a = opts.angle !== undefined ? opts.angle + U.rand(-opts.spread, opts.spread) : Math.random() * Math.PI * 2;
        const s = U.rand(spd0, spd1);
        this.spawn(
          x + U.rand(-2, 2), y + U.rand(-2, 2),
          Math.cos(a) * s, Math.sin(a) * s,
          U.rand(life0, life1), Math.round(U.rand(size0, size1)),
          colors[(Math.random() * colors.length) | 0],
          opts.drag !== undefined ? opts.drag : 3, opts.grav || 0, opts.glow
        );
      }
    },

    ring(x, y, r0, r1, life, color, width, ground) {
      const r = acquire(this.rings);
      r.x = x;
      r.y = y;
      r.r0 = r0;
      r.r1 = r1;
      r.life = r.max = life;
      r.color = color;
      r.width = width || 2;
      r.ground = !!ground;
    },

    text(x, y, text, color, scale, life) {
      if (!BL.Save.data.settings.damageNumbers && /^\d/.test(text)) return;
      const t = acquire(this.texts);
      t.x = x + U.rand(-4, 4);
      t.y = y;
      t.vy = -38;
      t.life = t.max = life || 0.6;
      t.text = String(text);
      t.color = color || '#fff';
      t.scale = scale || 1;
    },

    ghost(img, x, y, life, alpha) {
      const g = acquire(this.ghosts);
      g.img = img;
      g.x = x;
      g.y = y;
      g.life = g.max = life;
      g.alpha = alpha || 0.5;
    },

    /** kind: 'circle' {r} | 'line' {x2,y2,w} */
    telegraph(o) {
      o.t = 0;
      this.tele.push(o);
      return o;
    },

    line(x1, y1, x2, y2, color, life, width) {
      this.lines.push({ x1, y1, x2, y2, color, life, max: life, width: width || 1 });
    },

    explosion(x, y, r, palette, big) {
      palette = palette || ['#ffffff', '#ffd84a', '#ff7b1a', '#d7263d'];
      this.burst(x, y, big ? 40 : 22, palette, 40, 160 + r * 2, 0.25, 0.6, 2, big ? 5 : 4, { drag: 4 });
      this.ring(x, y, 4, r, 0.28, palette[1] || '#fff', big ? 4 : 3);
      this.ring(x, y, 2, r * 0.6, 0.18, '#ffffff', 2);
      this.burst(x, y, 10, ['#3a3f55', '#5a6078'], 10, 40, 0.5, 0.9, 3, 5, { drag: 2, grav: -20 });
    },

    update(dt) {
      const P = this.parts;
      for (let i = P.count - 1; i >= 0; i--) {
        const p = P.items[i];
        p.life -= dt;
        if (p.life <= 0) {
          release(P, i);
          continue;
        }
        if (p.drag) {
          const k = Math.exp(-p.drag * dt);
          p.vx *= k;
          p.vy *= k;
        }
        p.vy += p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      const T = this.texts;
      for (let i = T.count - 1; i >= 0; i--) {
        const t = T.items[i];
        t.life -= dt;
        if (t.life <= 0) {
          release(T, i);
          continue;
        }
        t.y += t.vy * dt;
        t.vy *= Math.exp(-4 * dt);
      }
      const R = this.rings;
      for (let i = R.count - 1; i >= 0; i--) {
        const r = R.items[i];
        r.life -= dt;
        if (r.life <= 0) release(R, i);
      }
      const G = this.ghosts;
      for (let i = G.count - 1; i >= 0; i--) {
        const g = G.items[i];
        g.life -= dt;
        if (g.life <= 0) release(G, i);
      }
      for (let i = this.tele.length - 1; i >= 0; i--) {
        const t = this.tele[i];
        t.t += dt;
        if (t.follow) {
          t.x = t.follow.x;
          t.y = t.follow.y;
        }
        if (t.t >= t.dur) U.removeAt(this.tele, i);
      }
      for (let i = this.lines.length - 1; i >= 0; i--) {
        const l = this.lines[i];
        l.life -= dt;
        if (l.life <= 0) U.removeAt(this.lines, i);
      }
    },

    drawGround(ctx, view) {
      // telegraphs
      for (const t of this.tele) {
        const k = t.t / t.dur;
        const blink = Math.floor(t.t * 16) % 2 === 0;
        ctx.globalAlpha = 0.18 + k * 0.25;
        ctx.fillStyle = t.color || '#ff2d55';
        if (t.kind === 'circle') {
          ctx.beginPath();
          ctx.arc(t.x, t.y, t.r * (t.grow ? k : 1), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = blink ? 0.9 : 0.5;
          ctx.strokeStyle = t.color || '#ff2d55';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
          ctx.stroke();
        } else if (t.kind === 'line') {
          ctx.save();
          ctx.translate(t.x, t.y);
          ctx.rotate(t.ang);
          ctx.fillRect(0, -t.w / 2, t.len, t.w);
          ctx.globalAlpha = blink ? 0.9 : 0.5;
          ctx.fillRect(0, -t.w / 2, t.len * k, 2);
          ctx.fillRect(0, t.w / 2 - 2, t.len * k, 2);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
      const R = this.rings;
      for (let i = 0; i < R.count; i++) {
        const r = R.items[i];
        if (!r.ground) continue;
        this._drawRing(ctx, r);
      }
      ctx.globalAlpha = 1;
    },

    _drawRing(ctx, r) {
      const k = 1 - r.life / r.max;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k));
      ctx.globalAlpha = Math.max(0, 1 - k) * (r.ground ? 0.6 : 0.95);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(1, r.width * (1 - k * 0.6));
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.stroke();
    },

    drawGhosts(ctx) {
      const G = this.ghosts;
      for (let i = 0; i < G.count; i++) {
        const g = G.items[i];
        ctx.globalAlpha = (g.life / g.max) * g.alpha;
        ctx.drawImage(g.img, Math.round(g.x), Math.round(g.y));
      }
      ctx.globalAlpha = 1;
    },

    drawTop(ctx, view) {
      const P = this.parts;
      const x0 = view.x - 8, y0 = view.y - 8, x1 = view.x + view.w + 8, y1 = view.y + view.h + 8;
      for (let i = 0; i < P.count; i++) {
        const p = P.items[i];
        if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
        const k = p.life / p.max;
        const s = Math.max(1, Math.round(p.size * (0.4 + 0.6 * k)));
        ctx.globalAlpha = k < 0.3 ? k / 0.3 : 1;
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
      }
      ctx.globalAlpha = 1;
      for (const l of this.lines) {
        ctx.globalAlpha = l.life / l.max;
        ctx.strokeStyle = l.color;
        ctx.lineWidth = l.width;
        ctx.beginPath();
        ctx.moveTo(l.x1, l.y1);
        ctx.lineTo(l.x2, l.y2);
        ctx.stroke();
      }
      const R = this.rings;
      for (let i = 0; i < R.count; i++) {
        const r = R.items[i];
        if (r.ground) continue;
        this._drawRing(ctx, r);
      }
      ctx.globalAlpha = 1;
      const T = this.texts;
      for (let i = 0; i < T.count; i++) {
        const t = T.items[i];
        const k = t.life / t.max;
        ctx.globalAlpha = k < 0.35 ? k / 0.35 : 1;
        const pop = k > 0.85 ? 1 + (k - 0.85) * 3 : 1;
        BL.Font.draw(ctx, t.text, t.x, t.y, t.color, Math.max(1, Math.round(t.scale * pop)), 'center');
      }
      ctx.globalAlpha = 1;
    },
  });
})();
