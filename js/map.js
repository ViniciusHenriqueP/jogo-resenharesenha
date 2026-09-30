'use strict';
/* =========================================================================
 * map.js — geração procedural da arena: campo de futebol noturno dentro
 * de uma instalação de treino futurista, com arquibancadas, pista,
 * obstáculos com colisão (torres, painéis, cones) e decorações.
 * O chão inteiro é pré-renderizado em um canvas offscreen.
 * ========================================================================= */
(function () {
  const BL = window.BL;
  const U = BL.U;
  const CFG = BL.CFG;

  function generate(seed) {
    const rng = U.makeRng(seed);
    const W = CFG.WORLD_W, H = CFG.WORLD_H, WALL = CFG.WALL, TR = CFG.TRACK;
    const bounds = { x0: WALL, y0: WALL, x1: W - WALL, y1: H - WALL };
    const field = { x0: WALL + TR, y0: WALL + TR, x1: W - WALL - TR, y1: H - WALL - TR };
    field.cx = (field.x0 + field.x1) / 2;
    field.cy = (field.y0 + field.y1) / 2;

    const map = {
      w: W, h: H, bounds, field, seed,
      obstacles: [],
      obsCell: 64,
      boundsObstacle: { tall: true, shape: 'bounds' },
    };

    // ------------------------------------------------------------ gols
    const goalW = 128, goalD = 34;
    const goals = [
      { x: field.x0 - goalD, y: field.cy - goalW / 2, side: -1 },
      { x: field.x1, y: field.cy - goalW / 2, side: 1 },
    ];
    map.goals = goals;
    const addRect = (kind, x, y, w, h, extra) => {
      const o = Object.assign({ kind, shape: 'rect', x, y, w, h, tall: true, sortY: y + h }, extra || {});
      map.obstacles.push(o);
      return o;
    };
    const addCircle = (kind, x, y, r, extra) => {
      const o = Object.assign({ kind, shape: 'circle', cx: x, cy: y, r, tall: false, sortY: y + r }, extra || {});
      map.obstacles.push(o);
      return o;
    };
    for (const g of goals) {
      addRect('goalside', g.x, g.y - 3, goalD, 4, { invisible: true });
      addRect('goalside', g.x, g.y + goalW - 1, goalD, 4, { invisible: true });
      const bx = g.side < 0 ? g.x - 2 : g.x + goalD - 2;
      addRect('goalback', bx, g.y, 4, goalW, { invisible: true });
    }

    // ------------------------------------------------------ obstáculos
    const placed = [];
    const centerClear = 230;
    const free = (x, y, w, h, pad) => {
      if (x < field.x0 + 30 || y < field.y0 + 30 || x + w > field.x1 - 30 || y + h > field.y1 - 30) return false;
      const mx = x + w / 2, my = y + h / 2;
      if (U.dist(mx, my, field.cx, field.cy) < centerClear) return false;
      for (const g of goals) if (U.dist(mx, my, g.x + goalD / 2, field.cy) < 240) return false;
      for (const p of placed) {
        if (x - pad < p.x + p.w && x + w + pad > p.x && y - pad < p.y + p.h && y + h + pad > p.y) return false;
      }
      return true;
    };
    const reserve = (x, y, w, h) => placed.push({ x, y, w, h });

    // torres tecnológicas (layout em grade com variação)
    let n = 0;
    for (let tries = 0; tries < 400 && n < 10; tries++) {
      const x = Math.round(rng.range(field.x0 + 80, field.x1 - 110));
      const y = Math.round(rng.range(field.y0 + 80, field.y1 - 110));
      if (!free(x, y - 22, 24, 42, 150)) continue;
      reserve(x, y - 22, 24, 42);
      addRect('pillar', x, y, 24, 18, { sprite: 'pillar', dx: -1, dy: -23 });
      n++;
    }
    // painéis de treino
    n = 0;
    for (let tries = 0; tries < 500 && n < 16; tries++) {
      const hor = rng() < 0.55;
      const w = hor ? 48 : 12, h = hor ? 12 : 48;
      const x = Math.round(rng.range(field.x0 + 60, field.x1 - 110));
      const y = Math.round(rng.range(field.y0 + 60, field.y1 - 110));
      if (!free(x, y - 12, w, h + 12, 110)) continue;
      reserve(x, y - 12, w, h + 12);
      if (hor) addRect('wall', x, y, 48, 10, { sprite: 'wallH', dx: -1, dy: -13 });
      else addRect('wall', x, y, 12, 48, { sprite: 'wallV', dx: -1, dy: -13 });
      n++;
    }
    // linhas de cones (treino de drible)
    n = 0;
    for (let tries = 0; tries < 500 && n < 12; tries++) {
      const count = rng.int(4, 6);
      const hor = rng() < 0.5;
      const zig = rng() < 0.4;
      const sp = 26;
      const w = hor ? count * sp : 20, h = hor ? 20 : count * sp;
      const x = Math.round(rng.range(field.x0 + 60, field.x1 - 200));
      const y = Math.round(rng.range(field.y0 + 60, field.y1 - 200));
      if (!free(x, y, w, h, 90)) continue;
      reserve(x, y, w, h);
      for (let i = 0; i < count; i++) {
        const off = zig ? (i % 2 ? 8 : -8) : 0;
        const cx = hor ? x + i * sp + 10 : x + 10 + off;
        const cy = hor ? y + 10 + off : y + i * sp + 10;
        addCircle('cone', cx, cy, 4, { sprite: 'cone', dx: -5, dy: -8 });
      }
      n++;
    }

    // grade de obstáculos para consulta rápida
    map.obsCols = Math.ceil(W / map.obsCell);
    map.obsRows = Math.ceil(H / map.obsCell);
    map.obsGrid = [];
    for (let i = 0; i < map.obsCols * map.obsRows; i++) map.obsGrid.push([]);
    for (const o of map.obstacles) {
      const x0 = o.shape === 'rect' ? o.x : o.cx - o.r, y0 = o.shape === 'rect' ? o.y : o.cy - o.r;
      const x1 = o.shape === 'rect' ? o.x + o.w : o.cx + o.r, y1 = o.shape === 'rect' ? o.y + o.h : o.cy + o.r;
      for (let cy = (y0 / map.obsCell) | 0; cy <= ((y1 / map.obsCell) | 0); cy++)
        for (let cx = (x0 / map.obsCell) | 0; cx <= ((x1 / map.obsCell) | 0); cx++) map.obsGrid[cy * map.obsCols + cx].push(o);
    }
    map.drawables = map.obstacles.filter((o) => o.sprite);

    map.ground = renderGround(map, rng, placed);
    map.flow = new BL.Collision.FlowField(map);
    return map;
  }

  // =================================================================== CHÃO
  function renderGround(map, rng, placed) {
    const { w: W, h: H, bounds: b, field: f } = map;
    const c = BL.Sprites.canvas(W, H);
    const x = c.getContext('2d');
    const P = (a, bb, w, h, col) => {
      x.fillStyle = col;
      x.fillRect(a, bb, w, h);
    };

    // ---- arquibancadas
    P(0, 0, W, H, '#070a16');
    const crowd = ['#1e90ff', '#e8f0ff', '#10204a', '#35e0ff', '#23315e', '#d7263d', '#f2c7a0'];
    const drawStandBlock = (x0, y0, w, h, vertical) => {
      // fileiras de assentos
      const step = 7;
      if (!vertical) {
        for (let y = y0 + 4; y < y0 + h - 12; y += step) {
          P(x0, y, w, 4, '#111a36');
          P(x0, y + 4, w, 1, '#0a0f22');
          for (let xx = x0 + 2; xx < x0 + w - 2; xx += 3) {
            if (rng() < 0.55) {
              P(xx, y - 1, 2, 3, crowd[(rng() * crowd.length) | 0]);
              if (rng() < 0.6) P(xx, y - 3, 2, 2, rng() < 0.8 ? '#e0b08a' : '#6a4028');
            }
          }
        }
        for (let xx = x0 + 150; xx < x0 + w; xx += 190) P(xx, y0, 10, h, '#05070f');
      } else {
        for (let xx = x0 + 4; xx < x0 + w - 12; xx += step) {
          P(xx, y0, 4, h, '#111a36');
          P(xx + 4, y0, 1, h, '#0a0f22');
          for (let y = y0 + 2; y < y0 + h - 2; y += 3) {
            if (rng() < 0.55) {
              P(xx - 1, y, 3, 2, crowd[(rng() * crowd.length) | 0]);
              if (rng() < 0.6) P(xx + 2, y, 2, 2, rng() < 0.8 ? '#e0b08a' : '#6a4028');
            }
          }
        }
        for (let y = y0 + 150; y < y0 + h; y += 190) P(x0, y, w, 10, '#05070f');
      }
    };
    drawStandBlock(0, 0, W, b.y0, false);
    drawStandBlock(0, b.y1, W, H - b.y1, false);
    drawStandBlock(0, b.y0, b.x0, b.y1 - b.y0, true);
    drawStandBlock(b.x1, b.y0, W - b.x1, b.y1 - b.y0, true);

    // painéis de LED na borda interna das arquibancadas
    const ads = ['EGO SURVIVOR', 'NO.1 STRIKER', 'DEVOUR', 'EGOIST', 'FLOW', 'META VISION'];
    P(b.x0 - 10, b.y0 - 10, b.x1 - b.x0 + 20, 10, '#03050b');
    P(b.x0 - 10, b.y1, b.x1 - b.x0 + 20, 10, '#03050b');
    P(b.x0 - 10, b.y0 - 10, 10, b.y1 - b.y0 + 20, '#03050b');
    P(b.x1, b.y0 - 10, 10, b.y1 - b.y0 + 20, '#03050b');
    let ai = 0;
    for (let xx = b.x0 + 40; xx < b.x1 - 120; xx += 220) {
      const t = ads[ai++ % ads.length];
      BL.Font.draw(x, t, xx, b.y0 - 9, ai % 2 ? '#35e0ff' : '#f5f7ff', 1);
      BL.Font.draw(x, t, xx + 60, b.y1 + 2, ai % 2 ? '#f5f7ff' : '#35e0ff', 1);
    }
    // linha de LED
    x.globalAlpha = 0.9;
    P(b.x0, b.y0 - 2, b.x1 - b.x0, 2, '#1e90ff');
    P(b.x0, b.y1, b.x1 - b.x0, 2, '#1e90ff');
    P(b.x0 - 2, b.y0, 2, b.y1 - b.y0, '#1e90ff');
    P(b.x1, b.y0, 2, b.y1 - b.y0, '#1e90ff');
    x.globalAlpha = 1;

    // ---- pista / piso tecnológico
    P(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, '#121829');
    x.fillStyle = '#18203a';
    for (let xx = b.x0; xx < b.x1; xx += 16) x.fillRect(xx, b.y0, 1, b.y1 - b.y0);
    for (let y = b.y0; y < b.y1; y += 16) x.fillRect(b.x0, y, b.x1 - b.x0, 1);

    // ---- gramado com faixas de corte
    const fw = f.x1 - f.x0, fh = f.y1 - f.y0;
    for (let i = 0, xx = f.x0; xx < f.x1; xx += 64, i++) P(xx, f.y0, Math.min(64, f.x1 - xx), fh, i % 2 ? '#1c4f30' : '#1f5836');
    // ruído de grama
    const grassN = ['#236339', '#184528', '#2a6e40', '#16402a'];
    for (let i = 0; i < (fw * fh) / 26; i++) {
      const gx = f.x0 + ((rng() * fw) | 0), gy = f.y0 + ((rng() * fh) | 0);
      x.fillStyle = grassN[(rng() * 4) | 0];
      x.fillRect(gx, gy, 1, rng() < 0.3 ? 2 : 1);
    }
    // tufos
    for (let i = 0; i < 900; i++) {
      const gx = f.x0 + ((rng() * fw) | 0), gy = f.y0 + ((rng() * fh) | 0);
      P(gx, gy, 1, 2, '#2f7a47');
      P(gx + 2, gy + 1, 1, 2, '#2f7a47');
    }

    // ---- linhas do campo
    const L = '#e8f0ff';
    const lw = 2;
    const line = (a, bb, w, h) => {
      x.globalAlpha = 0.85;
      P(a, bb, w, h, L);
      x.globalAlpha = 1;
    };
    const circle = (cx, cy, r, from, to) => {
      x.globalAlpha = 0.85;
      x.fillStyle = L;
      const steps = Math.ceil(r * 7);
      for (let i = 0; i <= steps; i++) {
        const a = from + ((to - from) * i) / steps;
        x.fillRect(Math.round(cx + Math.cos(a) * r - 1), Math.round(cy + Math.sin(a) * r - 1), lw, lw);
      }
      x.globalAlpha = 1;
    };
    line(f.x0, f.y0, fw, lw);
    line(f.x0, f.y1 - lw, fw, lw);
    line(f.x0, f.y0, lw, fh);
    line(f.x1 - lw, f.y0, lw, fh);
    line(f.cx - 1, f.y0, lw, fh);
    circle(f.cx, f.cy, 110, 0, Math.PI * 2);
    P(f.cx - 3, f.cy - 3, 6, 6, L);
    const boxD = 200, boxW = 480, smallD = 70, smallW = 220;
    for (const side of [-1, 1]) {
      const gx = side < 0 ? f.x0 : f.x1;
      const bx = side < 0 ? gx : gx - boxD;
      line(bx, f.cy - boxW / 2, boxD, lw);
      line(bx, f.cy + boxW / 2, boxD, lw);
      line(side < 0 ? gx + boxD : gx - boxD, f.cy - boxW / 2, lw, boxW + lw);
      const sx = side < 0 ? gx : gx - smallD;
      line(sx, f.cy - smallW / 2, smallD, lw);
      line(sx, f.cy + smallW / 2, smallD, lw);
      line(side < 0 ? gx + smallD : gx - smallD, f.cy - smallW / 2, lw, smallW + lw);
      const px = gx - side * 140;
      P(px - 2, f.cy - 2, 4, 4, L);
      const a0 = side < 0 ? -0.93 : Math.PI - 0.93;
      circle(px, f.cy, 90, a0, a0 + 1.86);
    }
    // escanteios
    circle(f.x0, f.y0, 14, 0, Math.PI / 2);
    circle(f.x1, f.y0, 14, Math.PI / 2, Math.PI);
    circle(f.x0, f.y1, 14, -Math.PI / 2, 0);
    circle(f.x1, f.y1, 14, Math.PI, Math.PI * 1.5);

    // ---- emblema central (olho/cadeado estilizado + "EGO")
    x.globalAlpha = 0.14;
    BL.Font.draw(x, 'EGO', f.cx, f.cy - 40, '#35e0ff', 16, 'center');
    x.globalAlpha = 0.1;
    x.fillStyle = '#35e0ff';
    for (let a = 0; a < Math.PI * 2; a += 0.02) x.fillRect(Math.round(f.cx + Math.cos(a) * 150), Math.round(f.cy + Math.sin(a) * 150), 3, 3);
    x.globalAlpha = 1;

    // ---- gols (rede)
    for (const g of map.goals) {
      const gx = g.x, gy = g.y, gw = 34, gh = 128;
      x.fillStyle = 'rgba(232,240,255,0.25)';
      for (let i = 0; i <= gw; i += 4) x.fillRect(gx + i, gy, 1, gh);
      for (let i = 0; i <= gh; i += 4) x.fillRect(gx, gy + i, gw, 1);
      P(gx, gy - 2, gw, 3, '#f5f7ff');
      P(gx, gy + gh - 1, gw, 3, '#f5f7ff');
      const bx = g.side < 0 ? gx : gx + gw - 3;
      P(bx, gy - 2, 3, gh + 4, '#c8d0e8');
      const px = g.side < 0 ? gx + gw - 3 : gx;
      P(px, gy - 4, 4, 6, '#ffffff');
      P(px, gy + gh - 2, 4, 6, '#ffffff');
    }

    // ---- decorações planas (sem colisão)
    const decoFree = (xx, y, w, h) => {
      if (U.dist(xx, y, f.cx, f.cy) < 170) return false;
      for (const p of placed) if (xx - 20 < p.x + p.w && xx + w + 20 > p.x && y - 20 < p.y + p.h && y + h + 20 > p.y) return false;
      return true;
    };
    // escadas de agilidade
    for (let i = 0, n = 0; i < 200 && n < 9; i++) {
      const hor = rng() < 0.5;
      const len = rng.int(5, 8) * 12;
      const xx = Math.round(rng.range(f.x0 + 60, f.x1 - 160)), y = Math.round(rng.range(f.y0 + 60, f.y1 - 160));
      const w = hor ? len : 20, h = hor ? 20 : len;
      if (!decoFree(xx, y, w, h)) continue;
      placed.push({ x: xx, y, w, h });
      x.globalAlpha = 0.9;
      if (hor) {
        P(xx, y, len, 1, '#ffd84a');
        P(xx, y + 19, len, 1, '#ffd84a');
        for (let k = 0; k <= len; k += 12) P(xx + k, y, 1, 20, '#ffd84a');
      } else {
        P(xx, y, 1, len, '#ffd84a');
        P(xx + 19, y, 1, len, '#ffd84a');
        for (let k = 0; k <= len; k += 12) P(xx, y + k, 20, 1, '#ffd84a');
      }
      x.globalAlpha = 1;
      n++;
    }
    // marcadores holográficos
    for (let i = 0, n = 0; i < 200 && n < 14; i++) {
      const xx = Math.round(rng.range(f.x0 + 50, f.x1 - 50)), y = Math.round(rng.range(f.y0 + 50, f.y1 - 50));
      if (!decoFree(xx - 12, y - 12, 24, 24)) continue;
      n++;
      x.globalAlpha = 0.5;
      x.fillStyle = '#35e0ff';
      for (let a = 0; a < Math.PI * 2; a += 0.12) x.fillRect(Math.round(xx + Math.cos(a) * 11), Math.round(y + Math.sin(a) * 11), 1, 1);
      x.globalAlpha = 0.25;
      x.fillRect(xx - 6, y - 6, 12, 12);
      x.globalAlpha = 1;
    }
    // bolas esquecidas no gramado
    for (let i = 0; i < 26; i++) {
      const xx = Math.round(rng.range(f.x0 + 20, f.x1 - 20)), y = Math.round(rng.range(f.y0 + 20, f.y1 - 20));
      if (!decoFree(xx, y, 5, 5)) continue;
      x.drawImage(BL.Sprites.misc.shadowBall, xx - 1, y + 3);
      x.drawImage(BL.Sprites.balls.normal[(rng() * 4) | 0], xx - 3, y - 3);
    }

    // ---- refletores (brilho suave nos cantos)
    const glow = (gx, gy, r, a) => {
      const g = x.createRadialGradient(gx, gy, 0, gx, gy, r);
      g.addColorStop(0, `rgba(160,210,255,${a})`);
      g.addColorStop(1, 'rgba(160,210,255,0)');
      x.fillStyle = g;
      x.fillRect(gx - r, gy - r, r * 2, r * 2);
    };
    for (const [gx, gy] of [[f.x0, f.y0], [f.x1, f.y0], [f.x0, f.y1], [f.x1, f.y1]]) glow(gx, gy, 520, 0.07);
    glow(f.cx, f.cy, 700, 0.05);
    // torres de iluminação
    for (const [gx, gy] of [[60, 60], [W - 100, 60], [60, H - 100], [W - 100, H - 100]]) {
      P(gx, gy, 40, 40, '#0c1122');
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) P(gx + 4 + i * 9, gy + 4 + j * 9, 7, 7, '#f5f0d0');
      glow(gx + 20, gy + 20, 90, 0.25);
    }
    return c;
  }

  BL.Map = { generate };
})();
