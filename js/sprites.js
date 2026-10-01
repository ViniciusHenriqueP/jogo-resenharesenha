'use strict';
/* =========================================================================
 * sprites.js — toda a pixel art é gerada proceduralmente em canvases
 * offscreen na inicialização (personagens, bolas, orbes, obstáculos,
 * ícones de habilidades) + uma fonte bitmap 3x5 para textos no canvas.
 * ========================================================================= */
(function () {
  const BL = window.BL;
  const U = BL.U;
  const S = (BL.Sprites = { chars: {}, balls: {}, orbs: [], icons: {}, iconURLs: {}, misc: {} });

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  S.canvas = canvas;

  /** contorno de 1px ao redor dos pixels opacos (melhora a leitura) */
  function outline(c, color) {
    const ctx = c.getContext('2d');
    const w = c.width, h = c.height;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const src = new Uint8ClampedArray(d);
    const [r, g, b] = U.hexToRgb(color);
    const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 80;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (src[i + 3] > 80) continue;
        if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1)) {
          d[i] = r;
          d[i + 1] = g;
          d[i + 2] = b;
          d[i + 3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  S.outline = outline;

  function silhouette(c, color) {
    const n = canvas(c.width, c.height);
    const x = n.getContext('2d');
    x.drawImage(c, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, n.width, n.height);
    return n;
  }
  S.silhouette = silhouette;

  function flipH(c) {
    const n = canvas(c.width, c.height);
    const x = n.getContext('2d');
    x.translate(c.width, 0);
    x.scale(-1, 1);
    x.drawImage(c, 0, 0);
    return n;
  }

  function scaleUp(c, s) {
    if (s === 1) return c;
    const n = canvas(c.width * s, c.height * s);
    const x = n.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(c, 0, 0, n.width, n.height);
    return n;
  }

  /** desenha um mapa de caracteres (string[]) usando uma paleta */
  function fromMap(rows, pal, scale) {
    scale = scale || 1;
    const c = canvas(rows[0].length * scale, rows.length * scale);
    const x = c.getContext('2d');
    for (let y = 0; y < rows.length; y++) {
      for (let i = 0; i < rows[y].length; i++) {
        const ch = rows[y][i];
        if (ch === '.' || ch === ' ' || !pal[ch]) continue;
        x.fillStyle = pal[ch];
        x.fillRect(i * scale, y * scale, scale, scale);
      }
    }
    return c;
  }
  S.fromMap = fromMap;

  // =============================================================== PERSONAGENS
  // Layout base 16x19 (visto de cima em 3/4), dentro de um canvas 20x22.
  // Âncora visual: (10, 12) = centro do tronco.
  const CW = 20, CH = 22, OX = 2, OY = 2;
  S.CHAR_ANCHOR_X = 10;
  S.CHAR_ANCHOR_Y = 12;

  function drawChar(ctx, o, dir, pose, frame) {
    const P = (x, y, w, h, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(OX + x, OY + y, w, h);
    };
    const run = pose === 'run';
    const bob = run && (frame === 1 || frame === 3) ? -1 : 0;
    const liftL = run && frame === 1 ? 1 : 0;
    const liftR = run && frame === 3 ? 1 : 0;
    const b = o.bulk ? 1 : 0;
    const skin = o.skin, skinD = o.skinD;

    if (dir === 'down' || dir === 'up') {
      // ---- pernas
      const leg = (x, lift, kickOut) => {
        const top = 15;
        if (kickOut) {
          P(x + kickOut, top - 1, 2, 1, skin);
          P(x + kickOut, top, 2, 2, o.socks);
          P(x + kickOut - (kickOut < 0 ? 1 : 0), top + 2, 3, 1, o.boots);
          return;
        }
        P(x, top, 2, 1, skin);
        P(x, top + 1, 2, 2 - lift, o.socks);
        P(x, top + 3 - lift, 2, 1, o.boots);
      };
      if (pose === 'kick') {
        leg(5 - b, 0, 0);
        leg(9 + b, 0, 2);
      } else if (pose === 'dash') {
        leg(4 - b, 1, 0);
        leg(10 + b, 1, 0);
      } else {
        leg(5 - b, liftL, 0);
        leg(9 + b, liftR, 0);
      }
      const yb = bob;
      // ---- shorts
      P(4 - b, 13 + yb, 8 + b * 2, 2, o.shorts);
      P(7, 14 + yb, 2, 1, o.shortsD);
      // ---- braços
      const armSwing = run ? (frame === 1 ? 1 : frame === 3 ? -1 : 0) : 0;
      const raise = pose === 'kick' ? -1 : pose === 'dash' ? 1 : 0;
      const ax1 = 3 - b - (pose === 'kick' ? 1 : 0), ax2 = 12 + b + (pose === 'kick' ? 1 : 0);
      P(ax1, 9 + yb + armSwing + raise, 1, 1, o.shirt);
      P(ax1, 10 + yb + armSwing + raise, 1, 2, skin);
      P(ax2, 9 + yb - armSwing + raise, 1, 1, o.shirt);
      P(ax2, 10 + yb - armSwing + raise, 1, 2, skin);
      // ---- tronco
      P(4 - b, 8 + yb, 8 + b * 2, 5, o.shirt);
      P(4 - b, 12 + yb, 8 + b * 2, 1, o.shirtD);
      P(4 - b, 8 + yb, 1, 5, o.shirt2); // faixas laterais
      P(11 + b, 8 + yb, 1, 5, o.shirt2);
      if (dir === 'down') {
        P(6, 8 + yb, 4, 1, o.shirt2); // gola
        P(7, 8 + yb, 2, 1, skin);
        P(9, 10 + yb, 1, 1, o.shirt2); // escudo
      } else {
        // número nas costas
        P(6, 9 + yb, 1, 3, o.num);
        P(8, 9 + yb, 2, 1, o.num);
        P(9, 10 + yb, 1, 1, o.num);
        P(8, 11 + yb, 2, 1, o.num);
      }
      // ---- cabeça
      P(5, 3 + yb, 6, 5, skin);
      P(5, 7 + yb, 6, 1, skinD);
      if (dir === 'down') {
        P(6, 5 + yb, 1, 2, o.eyeD);
        P(9, 5 + yb, 1, 2, o.eyeD);
        P(6, 6 + yb, 1, 1, o.eye);
        P(9, 6 + yb, 1, 1, o.eye);
        if (o.sleepy) {
          // pálpebras caídas (olhar sonolento)
          P(6, 5 + yb, 1, 1, skinD);
          P(9, 5 + yb, 1, 1, skinD);
        }
      }
      drawHair(P, o, dir, yb);
    } else {
      // ============ lateral (virado para a direita)
      const sw = run ? (frame === 1 ? 1 : frame === 3 ? -1 : 0) : 0;
      const yb = bob;
      if (pose === 'kick') {
        P(6, 15, 2, 1, skin);
        P(6, 16, 2, 2, o.socks);
        P(6, 18, 3, 1, o.boots);
        P(9, 14, 3, 1, skin);
        P(12, 14, 2, 1, o.socks);
        P(13, 13, 2, 2, o.boots);
      } else if (pose === 'dash') {
        P(4, 15, 2, 1, skin);
        P(3, 16, 2, 1, o.socks);
        P(2, 17, 3, 1, o.boots);
        P(10, 15, 2, 1, skin);
        P(11, 16, 2, 1, o.socks);
        P(12, 17, 3, 1, o.boots);
      } else {
        // perna de trás
        P(6 - sw, 15, 2, 1, skinD);
        P(6 - sw, 16, 2, 2, o.socksD);
        P(6 - sw, 18, 3, 1, o.boots);
        // perna da frente
        P(8 + sw, 15, 2, 1, skin);
        P(8 + sw, 16, 2, 2 - (frame === 1 ? 1 : 0), o.socks);
        P(8 + sw, 18 - (frame === 1 ? 1 : 0), 3, 1, o.boots);
      }
      const lean = pose === 'dash' ? 1 : 0;
      P(5 + lean - b, 13 + yb, 6 + b * 2, 2, o.shorts);
      P(5 + lean - b, 8 + yb, 6 + b * 2, 5, o.shirt);
      P(5 + lean - b, 12 + yb, 6 + b * 2, 1, o.shirtD);
      P(5 + lean - b, 8 + yb, 6 + b * 2, 1, o.shirt2);
      // braço
      const ax = pose === 'dash' ? 5 : 7 + sw;
      P(ax + lean, 9 + yb, 2, 1, o.shirt);
      P(ax + lean, 10 + yb, 2, 2, skin);
      // cabeça
      P(6 + lean, 3 + yb, 6, 5, skin);
      P(6 + lean, 7 + yb, 6, 1, skinD);
      P(10 + lean, 5 + yb, 1, 2, o.eyeD);
      P(10 + lean, 6 + yb, 1, 1, o.eye);
      drawHair(P, o, 'side', yb, lean);
    }
  }

  // Penteados-assinatura dos personagens jogáveis (fan designs 16px).
  // Coordenadas no layout 16x19; y = -1 é permitido (margem do canvas).
  const SIGNATURE_HAIR = {
    // duas mechas "antena" no topo, franja repartida
    isagi(P, h, h2, dir, yb, x0) {
      if (dir === 'side') {
        P(x0, 1 + yb, 8, 3, h);
        P(x0, 4 + yb, 3, 3, h);
        P(x0 + 6, 3 + yb, 2, 2, h);
        P(x0 + 2, 1 + yb, 4, 1, h2);
        P(x0 + 4, 0 + yb, 1, 1, h);
        P(x0 + 3, -1 + yb, 1, 1, h);
        P(x0 + 6, 0 + yb, 1, 1, h);
        P(x0 + 7, -1 + yb, 1, 1, h);
        return;
      }
      P(4, 1 + yb, 8, 3, h);
      P(5, 1 + yb, 5, 1, h2);
      P(4, 4 + yb, 1, 3, h);
      P(11, 4 + yb, 1, 3, h);
      P(7, 0 + yb, 1, 1, h);
      P(6, -1 + yb, 1, 1, h);
      P(9, 0 + yb, 1, 1, h);
      P(10, -1 + yb, 1, 1, h);
      if (dir === 'up') P(5, 4 + yb, 6, 3, h);
      else {
        P(5, 4 + yb, 2, 1, h);
        P(8, 4 + yb, 3, 1, h);
        P(10, 5 + yb, 1, 1, h);
      }
    },
    // franja longa repartida no meio, laterais até o queixo
    rin(P, h, h2, dir, yb, x0) {
      if (dir === 'side') {
        P(x0, 1 + yb, 8, 3, h);
        P(x0, 4 + yb, 3, 4, h);
        P(x0 + 5, 3 + yb, 3, 2, h);
        P(x0 + 7, 5 + yb, 1, 1, h);
        P(x0 + 2, 1 + yb, 3, 1, h2);
        return;
      }
      P(4, 1 + yb, 8, 3, h);
      P(4, 0 + yb, 7, 1, h);
      P(6, 1 + yb, 3, 1, h2);
      P(4, 4 + yb, 1, 4, h);
      P(11, 4 + yb, 1, 4, h);
      if (dir === 'up') P(5, 4 + yb, 6, 4, h);
      else {
        P(5, 4 + yb, 2, 1, h);
        P(5, 5 + yb, 1, 2, h);
        P(9, 4 + yb, 2, 1, h);
        P(10, 5 + yb, 1, 2, h);
      }
    },
    // cabelo branco volumoso e bagunçado
    nagi(P, h, h2, dir, yb, x0) {
      if (dir === 'side') {
        P(x0 - 1, 1 + yb, 9, 3, h);
        P(x0 - 1, 4 + yb, 4, 3, h);
        P(x0 + 1, 0 + yb, 2, 1, h);
        P(x0 + 5, 0 + yb, 1, 1, h);
        P(x0 + 6, 3 + yb, 2, 2, h);
        P(x0 - 1, 3 + yb, 1, 1, h2);
        P(x0 + 3, 2 + yb, 1, 1, h2);
        return;
      }
      P(3, 1 + yb, 10, 3, h);
      P(4, 0 + yb, 2, 1, h);
      P(7, 0 + yb, 1, 1, h);
      P(9, 0 + yb, 2, 1, h);
      P(3, 4 + yb, 2, 2, h);
      P(11, 4 + yb, 2, 2, h);
      P(3, 3 + yb, 1, 1, h2);
      P(12, 3 + yb, 1, 1, h2);
      P(6, 2 + yb, 1, 1, h2);
      P(10, 2 + yb, 1, 1, h2);
      if (dir === 'up') {
        P(4, 4 + yb, 8, 3, h);
        P(6, 5 + yb, 1, 1, h2);
      } else {
        P(5, 4 + yb, 1, 2, h);
        P(6, 4 + yb, 2, 1, h);
        P(9, 4 + yb, 2, 1, h);
        P(10, 5 + yb, 1, 1, h);
      }
    },
    // cabelo longo vermelho até os ombros
    chigiri(P, h, h2, dir, yb, x0) {
      if (dir === 'side') {
        P(x0, 1 + yb, 8, 3, h);
        P(x0 - 1, 3 + yb, 4, 8, h);
        P(x0, 5 + yb, 1, 5, h2);
        P(x0 + 6, 3 + yb, 2, 2, h);
        P(x0 + 2, 1 + yb, 4, 1, h2);
        return;
      }
      P(4, 1 + yb, 8, 3, h);
      P(5, 0 + yb, 6, 1, h);
      P(5, 1 + yb, 4, 1, h2);
      P(6, 2 + yb, 1, 1, h2);
      P(3, 3 + yb, 2, 7, h);
      P(11, 3 + yb, 2, 7, h);
      P(3, 9 + yb, 1, 1, h2);
      P(12, 9 + yb, 1, 1, h2);
      if (dir === 'up') {
        P(4, 4 + yb, 8, 7, h);
        P(7, 5 + yb, 1, 4, h2);
      } else {
        P(5, 4 + yb, 1, 2, h);
        P(6, 4 + yb, 1, 1, h);
        P(9, 4 + yb, 2, 1, h);
        P(10, 5 + yb, 1, 1, h);
      }
    },
  };

  function drawHair(P, o, dir, yb, lean) {
    lean = lean || 0;
    const h = o.hair, h2 = o.hair2 || o.hair;
    const st = o.hairStyle;
    if (SIGNATURE_HAIR[st]) return SIGNATURE_HAIR[st](P, h, h2, dir, yb, 5 + lean);
    if (dir === 'side') {
      const x0 = 5 + lean;
      if (st === 'buzz') {
        P(x0 + 1, 2 + yb, 6, 2, h);
        P(x0 + 1, 4 + yb, 2, 2, h);
        return;
      }
      P(x0, 1 + yb, 8, 3, h);
      P(x0, 4 + yb, 3, st === 'long' ? 5 : 3, h);
      if (st === 'spiky') {
        P(x0 + 1, 0 + yb, 1, 1, h2);
        P(x0 + 3, 0 + yb, 1, 1, h2);
        P(x0 + 5, 0 + yb, 1, 1, h2);
        P(x0 - 1, 2 + yb, 1, 2, h2);
        P(x0 + 7, 3 + yb, 1, 1, h2);
      } else if (st === 'mohawk') {
        P(x0 + 1, 0 + yb, 6, 1, h2);
      } else if (st === 'swept') {
        P(x0 + 5, 3 + yb, 3, 2, h);
        P(x0 + 7, 4 + yb, 1, 1, h2);
      }
      return;
    }
    if (st === 'buzz') {
      P(5, 2 + yb, 6, 2, h);
      if (dir === 'up') P(5, 4 + yb, 6, 3, h);
      return;
    }
    // base (todos os outros estilos)
    P(4, 1 + yb, 8, 3, h);
    P(4, 4 + yb, 1, st === 'long' ? 5 : 2, h);
    P(11, 4 + yb, 1, st === 'long' ? 5 : 2, h);
    if (dir === 'up') P(5, 4 + yb, 6, st === 'long' ? 5 : 3, h);
    if (st === 'spiky') {
      P(4, 0 + yb, 1, 1, h2);
      P(6, 0 + yb, 1, 1, h2);
      P(8, 0 + yb, 2, 1, h2);
      P(11, 0 + yb, 1, 1, h2);
      if (dir === 'down') {
        P(6, 4 + yb, 1, 1, h);
        P(8, 4 + yb, 1, 1, h2);
      }
    } else if (st === 'mohawk') {
      P(4, 1 + yb, 8, 3, o.skin);
      P(4, 2 + yb, 8, 1, o.skinD);
      P(6, 0 + yb, 4, 4, h);
      P(7, 0 + yb, 2, 1, h2);
    } else if (st === 'bowl') {
      if (dir === 'down') P(5, 4 + yb, 6, 1, h);
    } else if (st === 'swept') {
      if (dir === 'down') {
        P(5, 4 + yb, 3, 1, h);
        P(5, 5 + yb, 1, 1, h);
      }
      P(3, 2 + yb, 1, 2, h2);
    } else if (st === 'long') {
      if (dir === 'down') P(5, 4 + yb, 2, 1, h2);
    }
  }

  function shade(hex, amt) {
    const [r, g, b] = U.hexToRgb(hex);
    const f = (v) => U.clamp(Math.round(v * amt), 0, 255);
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  }

  const POSES = [
    ['run', 0],
    ['run', 1],
    ['run', 2],
    ['run', 3],
    ['kick', 0],
    ['dash', 0],
  ];
  S.POSE = { run: 0, kick: 4, dash: 5 };

  /** gera todas as direções/poses de um personagem */
  function buildChar(key, o, scale) {
    o = Object.assign(
      {
        skin: '#f2c7a0',
        hair: '#222',
        hairStyle: 'bowl',
        shirt: '#fff',
        shirt2: '#d22',
        shorts: '#222',
        socks: '#fff',
        boots: '#111',
        eye: '#335',
        eyeD: '#0a0a14',
        num: '#fff',
        bulk: false,
        outline: '#07070f',
      },
      o
    );
    o.skinD = shade(o.skin, 0.8);
    o.shirtD = shade(o.shirt, 0.72);
    o.shortsD = shade(o.shorts, 0.7);
    o.socksD = shade(o.socks, 0.7);
    const set = { down: [], up: [], right: [], left: [], fdown: [], fup: [], fright: [], fleft: [], scale: scale || 1 };
    set.ax = 10 * set.scale;
    set.ay = 12 * set.scale;
    set.feet = 8 * set.scale;
    for (const dir of ['down', 'up', 'right']) {
      for (const [pose, f] of POSES) {
        const c = canvas(CW, CH);
        drawChar(c.getContext('2d'), o, dir === 'right' ? 'side' : dir, pose, f);
        outline(c, o.outline);
        const sc = scaleUp(c, set.scale);
        set[dir].push(sc);
        set['f' + dir].push(silhouette(sc, '#ffffff'));
        if (dir === 'right') {
          const fl = flipH(sc);
          set.left.push(fl);
          set.fleft.push(silhouette(fl, '#ffffff'));
        }
      }
    }
    S.chars[key] = set;
    return set;
  }
  S.buildChar = buildChar;

  // ================================================== HERÓIS (jogáveis)
  // Estilo anime chibi: layout 20x28 num canvas 24x32 (margem 2 para o
  // contorno). Cabeça grande, olhos com íris + brilho, cabelo por mapa de
  // pixels (characters.js), número nas costas.
  // Detalhes opcionais do uniforme (look): collar, sockBand, shortsTrim,
  // shortsHem, bootTip, cuff, sleeve + glove (manga longa/luva), wrist
  // (munhequeira), panel + sponsor (painel central da camisa), frontNum
  // (número no peito), tattoo (braço esquerdo), liner / lash (olhos).
  const HW = 24, HH = 32, HOX = 2, HOY = 2;

  // mirrored = quadro lateral que será espelhado (mostra o lado esquerdo)
  function drawHero(ctx, o, hair, dir, pose, frame, mirrored) {
    const P = (x, y, w, h, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(HOX + x, HOY + y, w, h);
    };
    const map = (rows, xo, yo) => {
      const pal = { h: o.hair, H: o.hair2, d: o.hairD, t: o.hairT, T: o.hairT2 };
      for (let y = 0; y < rows.length; y++)
        for (let x = 0; x < rows[y].length; x++) {
          const c = pal[rows[y][x]];
          if (c) P(x + xo, y + yo, 1, 1, c);
        }
    };
    const run = pose === 'run';
    const yb = run && (frame === 1 || frame === 3) ? -1 : 0;
    const sk = o.skin, skD = o.skinD, L = '#140f22';

    if (dir === 'down' || dir === 'up') {
      // ---- pernas (3px de largura, chuteira 4px)
      const leg = (x, lift) => {
        P(x, 23, 3, 1, sk);
        P(x, 24, 3, 3 - lift, o.socks);
        P(x, 24, 3, 1, o.sockBand);
        P(x < 10 ? x - 1 : x, 27 - lift, 4, 1, o.boots);
        P(x < 10 ? x - 1 : x, 27 - lift, 1, 1, o.bootTip || '#9aa4c4');
      };
      if (pose === 'kick') {
        leg(6, 0);
        P(12, 22, 3, 1, sk);
        P(13, 23, 3, 2, o.socks);
        P(14, 25, 4, 1, o.boots);
      } else if (pose === 'dash') {
        leg(5, 1);
        leg(12, 1);
      } else {
        leg(6, run && frame === 1 ? 1 : 0);
        leg(11, run && frame === 3 ? 1 : 0);
      }
      // ---- calção
      P(5, 20 + yb, 10, 3, o.shorts);
      P(9, 21 + yb, 2, 2, o.shortsD);
      P(5, 20 + yb, 1, 2, o.shortsTrim);
      P(14, 20 + yb, 1, 2, o.shortsTrim);
      if (o.shortsHem) {
        P(5, 22 + yb, 4, 1, o.shortsHem);
        P(11, 22 + yb, 4, 1, o.shortsHem);
      }
      // ---- braços
      const sw = run ? (frame === 1 ? 1 : frame === 3 ? -1 : 0) : 0;
      const raise = pose === 'kick' ? -1 : pose === 'dash' ? 1 : 0;
      const spread = pose === 'kick' ? 1 : 0;
      const arm = (x, dy, left) => {
        const y = 14 + yb + dy;
        P(x, y, 2, 2, o.shirt);
        if (o.cuff) P(x, y + 1, 2, 1, o.cuff);
        P(x, y + 2, 2, 2, o.sleeve || sk);
        P(x, y + 4, 2, 1, o.glove || skD);
        if (o.wrist) P(x, y + 3, 2, 1, o.wrist);
        if (o.tattoo && left) {
          P(x, y + 2, 1, 1, o.tattoo);
          P(x + 1, y + 3, 1, 1, o.tattoo);
        }
      };
      // o braço esquerdo do personagem fica à direita da tela quando ele olha para a câmera
      arm(3 - spread, sw + raise, dir === 'up');
      arm(15 + spread, -sw + raise, dir === 'down');
      // ---- camisa
      P(5, 14 + yb, 10, 6, o.shirt);
      P(13, 15 + yb, 2, 5, o.shirtD);
      P(5, 19 + yb, 10, 1, o.shirtD);
      if (!o.panel) {
        P(5, 14 + yb, 1, 3, o.shirt2);
        P(14, 14 + yb, 1, 3, o.shirt2);
      }
      const number = (color) => {
        const num = String(o.number || '10');
        let nx = 10 - Math.ceil((num.length * 4 - 1) / 2);
        for (const ch of num) {
          const g = GLYPHS[ch];
          for (let y = 0; y < 5; y++) for (let i = 0; i < 3; i++) if (g[y][i] === '1') P(nx + i, 15 + yb + y, 1, 1, color);
          nx += 4;
        }
      };
      if (dir === 'down') {
        if (o.panel) {
          // painel central que afunila na cintura, com friso
          P(7, 15 + yb, 6, 2, o.panel);
          P(7, 17 + yb, 6, 3, o.shirt2);
          P(8, 17 + yb, 4, 3, o.panel);
          P(11, 17 + yb, 1, 3, o.panelD);
          P(12, 15 + yb, 1, 2, o.panelD);
          if (o.sponsor) P(8, 17 + yb, 3, 1, o.sponsor);
        }
        P(7, 14 + yb, 2, 1, o.collar);
        P(11, 14 + yb, 2, 1, o.collar);
        P(9, 14 + yb, 2, 1, sk);
        P(9, 15 + yb, 2, 1, o.collar);
        if (o.frontNum) number(o.frontNum);
        else if (!o.panel) {
          P(11, 16 + yb, 2, 2, o.shirt2); // escudo
          P(11, 16 + yb, 1, 1, '#ffffff');
        }
      } else number(o.num);
      P(8, 13 + yb, 4, 1, skD); // pescoço
      // ---- cabeça
      P(5, 4 + yb, 10, 8, sk);
      P(6, 12 + yb, 8, 1, sk);
      P(7, 13 + yb, 6, 1, skD);
      P(4, 8 + yb, 1, 2, sk);
      P(15, 8 + yb, 1, 2, skD);
      if (dir === 'down') {
        P(14, 5 + yb, 1, 7, skD);
        P(6, 11 + yb, 1, 1, o.blush);
        P(13, 11 + yb, 1, 1, o.blush);
        if (o.sleepy) {
          P(5, 9 + yb, 3, 1, L);
          P(12, 9 + yb, 3, 1, L);
          P(6, 10 + yb, 2, 1, o.eye);
          P(12, 10 + yb, 2, 1, o.eye);
        } else {
          P(5, 8 + yb, 3, 1, L);
          P(12, 8 + yb, 3, 1, L);
          P(6, 9 + yb, 2, 2, o.eye);
          P(12, 9 + yb, 2, 2, o.eye);
          P(6, 9 + yb, 2, 1, o.eyeD);
          P(12, 9 + yb, 2, 1, o.eyeD);
          P(6, 9 + yb, 1, 1, '#ffffff');
          P(12, 9 + yb, 1, 1, '#ffffff');
        }
        if (o.liner) {
          P(5, 9 + yb, 1, 1, o.liner);
          P(14, 9 + yb, 1, 1, o.liner);
        }
        if (o.lash) {
          P(5, 10 + yb, 1, 1, o.lash);
          P(14, 10 + yb, 1, 1, o.lash);
        }
        P(9, 12 + yb, 2, 1, o.mouth);
        map(hair.down, 0, yb);
      } else map(hair.up, 0, yb);
      return;
    }

    // =============== lateral (virado para a direita)
    const sw = run ? [0, 2, 0, -2][frame] : 0;
    if (pose === 'kick') {
      P(8, 23, 2, 1, skD);
      P(8, 24, 2, 3, o.socksD);
      P(8, 27, 3, 1, o.boots);
      P(11, 21, 2, 2, sk);
      P(13, 21, 3, 2, o.socks);
      P(16, 20, 2, 3, o.boots);
    } else if (pose === 'dash') {
      P(6, 23, 2, 1, skD);
      P(5, 24, 2, 2, o.socksD);
      P(3, 26, 3, 1, o.boots);
      P(12, 23, 2, 1, sk);
      P(13, 24, 2, 2, o.socks);
      P(14, 26, 3, 1, o.boots);
    } else {
      const lift = run && frame === 1 ? 1 : 0;
      P(8 - sw, 23, 2, 1, skD);
      P(8 - sw, 24, 2, 3, o.socksD);
      P(8 - sw, 27, 3, 1, o.boots);
      P(10 + sw, 23, 2, 1, sk);
      P(10 + sw, 24, 2, 3 - lift, o.socks);
      P(10 + sw, 24, 2, 1, o.sockBand);
      P(10 + sw, 27 - lift, 3, 1, o.boots);
      if (o.bootTip) P(12 + sw, 27 - lift, 1, 1, o.bootTip);
    }
    const ln = pose === 'dash' ? 1 : 0;
    P(7 + ln, 20 + yb, 6, 3, o.shorts);
    P(7 + ln, 20 + yb, 6, 1, o.shortsD);
    if (o.shortsHem) P(7 + ln, 22 + yb, 6, 1, o.shortsHem);
    P(7 + ln, 14 + yb, 6, 6, o.shirt);
    P(7 + ln, 14 + yb, 1, 6, o.shirtD);
    P(7 + ln, 19 + yb, 6, 1, o.shirtD);
    if (o.panel) P(12 + ln, 15 + yb, 1, 5, o.panel);
    P(7 + ln, 14 + yb, 6, 1, o.collar);
    P(9 + ln, 13 + yb, 3, 1, skD);
    const ax = pose === 'dash' ? 6 : 9 + (run ? [0, 1, 0, -1][frame] : 0);
    P(ax + ln, 15 + yb, 2, 2, o.shirt);
    if (o.cuff) P(ax + ln, 16 + yb, 2, 1, o.cuff);
    P(ax + ln, 17 + yb, 2, 2, o.sleeve || sk);
    if (o.glove) P(ax + ln, 18 + yb, 2, 1, o.glove);
    if (o.wrist) P(ax + ln, 18 + yb, 2, 1, o.wrist);
    if (o.tattoo && mirrored) {
      P(ax + ln, 17 + yb, 1, 1, o.tattoo);
      P(ax + ln + 1, 18 + yb, 1, 1, o.tattoo);
    }
    // cabeça
    P(7 + ln, 4 + yb, 8, 8, sk);
    P(8 + ln, 12 + yb, 6, 1, sk);
    P(9 + ln, 13 + yb, 4, 1, skD);
    P(15 + ln, 9 + yb, 1, 2, sk); // nariz
    P(7 + ln, 5 + yb, 1, 7, skD);
    P(13 + ln, 11 + yb, 1, 1, o.blush);
    if (o.sleepy) {
      P(12 + ln, 9 + yb, 3, 1, L);
      P(12 + ln, 10 + yb, 2, 1, o.eye);
    } else {
      P(12 + ln, 8 + yb, 3, 1, L);
      P(12 + ln, 9 + yb, 2, 2, o.eye);
      P(12 + ln, 9 + yb, 2, 1, o.eyeD);
      P(13 + ln, 9 + yb, 1, 1, '#ffffff');
    }
    if (o.liner) P(14 + ln, 9 + yb, 1, 1, o.liner);
    if (o.lash) P(14 + ln, 10 + yb, 1, 1, o.lash);
    P(13 + ln, 12 + yb, 1, 1, o.mouth);
    map(hair.side, ln, yb);
  }

  function buildHero(key, look, hair) {
    const o = Object.assign({ blush: '#f2a39a', mouth: '#b5655a', outline: '#0b0c1c' }, look);
    for (const k of ['collar', 'sockBand', 'shortsTrim']) o[k] = o[k] || o.shirt2;
    if (o.panel) o.panelD = shade(o.panel, 0.78);
    o.skinD = shade(o.skin, 0.84);
    o.shirtD = shade(o.shirt, 0.7);
    o.shortsD = shade(o.shorts, 0.6);
    o.socksD = shade(o.socks, 0.7);
    // âncora = centro do tronco; feet = distância até os pés
    const set = { down: [], up: [], right: [], left: [], fdown: [], fup: [], fright: [], fleft: [], scale: 1, ax: 12, ay: 19, feet: 10 };
    for (const dir of ['down', 'up', 'right']) {
      for (const [pose, f] of POSES) {
        const draw = (mirrored) => {
          const c = canvas(HW, HH);
          drawHero(c.getContext('2d'), o, hair, dir === 'right' ? 'side' : dir, pose, f, mirrored);
          return outline(c, o.outline);
        };
        const c = draw(false);
        set[dir].push(c);
        set['f' + dir].push(silhouette(c, '#ffffff'));
        if (dir === 'right') {
          // tatuagem só existe no braço esquerdo: o quadro "left" é desenhado à parte
          const fl = flipH(o.tattoo ? draw(true) : c);
          set.left.push(fl);
          set.fleft.push(silhouette(fl, '#ffffff'));
        }
      }
    }
    S.chars[key] = set;
    return set;
  }

  const CHAR_DEFS = {
    player: {
      skin: '#f2c7a0', hair: '#141a2e', hair2: '#2e7bff', hairStyle: 'spiky',
      shirt: '#10204a', shirt2: '#1e90ff', shorts: '#0a0d18', socks: '#1e90ff',
      boots: '#f5f7ff', eye: '#35e0ff', num: '#f5f7ff',
    },
    rival: {
      skin: '#e8b48a', hair: '#5a3a22', hairStyle: 'bowl',
      shirt: '#e6e6ee', shirt2: '#d7263d', shorts: '#b81d31', socks: '#e6e6ee',
      boots: '#222', eye: '#402020', num: '#d7263d',
    },
    speedster: {
      skin: '#f0c49a', hair: '#e8e8e8', hairStyle: 'buzz',
      shirt: '#f2c230', shirt2: '#111111', shorts: '#15151a', socks: '#f2c230',
      boots: '#111', eye: '#303030', num: '#111',
    },
    defender: {
      skin: '#a8714c', hair: '#111111', hairStyle: 'buzz', bulk: true,
      shirt: '#2c3e2e', shirt2: '#8fd14f', shorts: '#1b261c', socks: '#8fd14f',
      boots: '#222', eye: '#1a1a1a', num: '#8fd14f',
    },
    striker: {
      skin: '#f2c7a0', hair: '#d94040', hair2: '#ff9a3c', hairStyle: 'mohawk',
      shirt: '#ff7a1a', shirt2: '#ffffff', shorts: '#f2f2f2', socks: '#ff7a1a',
      boots: '#222', eye: '#402010', num: '#fff',
    },
    playmaker: {
      skin: '#f5d0b0', hair: '#e8d5a3', hair2: '#fff3c4', hairStyle: 'long',
      shirt: '#6c2bd9', shirt2: '#e0c3ff', shorts: '#2a0f5c', socks: '#e0c3ff',
      boots: '#111', eye: '#6c2bd9', num: '#e0c3ff',
    },
    elite: {
      skin: '#e8b48a', hair: '#1a0006', hair2: '#ff2d55', hairStyle: 'spiky', bulk: true,
      shirt: '#141418', shirt2: '#ff2d55', shorts: '#0a0a0c', socks: '#ff2d55',
      boots: '#ff2d55', eye: '#ff2d55', num: '#ff2d55',
    },
  };

  // ==================================================================== BOLAS
  function buildBall(size, main, patch, out) {
    const frames = [];
    const n = size + 2;
    const c0 = (size - 1) / 2;
    const r2 = (size / 2) * (size / 2) + 0.4;
    const patches = [
      [-0.3, -0.35],
      [0.35, 0.2],
      [-0.35, 0.4],
    ];
    for (let f = 0; f < 4; f++) {
      const c = canvas(n, n);
      const x = c.getContext('2d');
      const a = (f * Math.PI) / 4;
      for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
          const dx = px - c0, dy = py - c0;
          if (dx * dx + dy * dy > r2) continue;
          x.fillStyle = main;
          x.fillRect(px + 1, py + 1, 1, 1);
        }
      }
      x.fillStyle = patch;
      for (const [ox, oy] of patches) {
        const rx = ox * Math.cos(a) - oy * Math.sin(a);
        const ry = ox * Math.sin(a) + oy * Math.cos(a);
        const px = Math.round(c0 + rx * size * 0.75);
        const py = Math.round(c0 + ry * size * 0.75);
        const ps = size >= 8 ? 2 : 1;
        x.fillRect(px + 1, py + 1, ps, ps);
      }
      // brilho
      x.fillStyle = 'rgba(255,255,255,0.85)';
      x.fillRect(Math.round(c0 - size * 0.2) + 1, Math.round(c0 - size * 0.25) + 1, 1, 1);
      outline(c, out);
      frames.push(c);
    }
    return frames;
  }

  // ===================================================================== ORBES
  function buildOrb(size, cMain, cLight, cDark) {
    const frames = [];
    for (let f = 0; f < 2; f++) {
      const c = canvas(size + 2, size + 2);
      const x = c.getContext('2d');
      const m = (size - 1) / 2;
      for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
          const d = Math.abs(px - m) + Math.abs(py - m);
          if (d > m + 0.1) continue;
          x.fillStyle = px < m && py < m ? cLight : px > m && py > m ? cDark : cMain;
          x.fillRect(px + 1, py + 1, 1, 1);
        }
      }
      if (f === 1) {
        x.fillStyle = '#ffffff';
        x.fillRect(Math.floor(m), Math.floor(m) - 1, 1, 1);
        x.fillRect(Math.floor(m) + 1, Math.floor(m), 1, 1);
      }
      outline(c, '#050814');
      frames.push(c);
    }
    return frames;
  }

  // ================================================================ OBSTÁCULOS
  function buildCone() {
    return outline(
      fromMap(
        ['..........', '....o.....', '....o.....', '...owo....', '...www....', '..ooooo...', '..ooooo...', '.dddddddd.'],
        { o: '#ff7b1a', w: '#f5f5f5', d: '#8a3d0c' }
      ),
      '#140a04'
    );
  }

  function buildPillar() {
    // torre tecnológica 24x40
    const c = canvas(26, 42);
    const x = c.getContext('2d');
    const P = (a, b, w, h, col) => {
      x.fillStyle = col;
      x.fillRect(a + 1, b + 1, w, h);
    };
    P(0, 8, 24, 32, '#141a30');
    P(0, 8, 3, 32, '#1d2644');
    P(21, 8, 3, 32, '#0c101f');
    P(0, 0, 24, 10, '#232d52');
    P(2, 2, 20, 6, '#2f3b69');
    P(4, 3, 16, 3, '#1e90ff');
    P(6, 4, 12, 1, '#9fe8ff');
    for (let i = 0; i < 4; i++) {
      P(5, 14 + i * 6, 14, 2, i % 2 ? '#1e90ff' : '#35e0ff');
      P(5, 16 + i * 6, 14, 1, '#0a0e1c');
    }
    P(0, 37, 24, 3, '#070a14');
    outline(c, '#03050c');
    return c;
  }

  function buildWall(horizontal) {
    // painel de treino acolchoado
    if (horizontal) {
      const c = canvas(50, 24);
      const x = c.getContext('2d');
      const P = (a, b, w, h, col) => {
        x.fillStyle = col;
        x.fillRect(a + 1, b + 1, w, h);
      };
      P(0, 0, 48, 16, '#1b2550');
      P(0, 0, 48, 3, '#2d3d7a');
      P(0, 14, 48, 8, '#0e1430');
      for (let i = 0; i < 4; i++) {
        P(3 + i * 12, 5, 6, 6, '#243170');
        P(4 + i * 12, 6, 4, 1, '#35e0ff');
      }
      P(0, 20, 48, 2, '#060918');
      outline(c, '#03050c');
      return c;
    }
    const c = canvas(14, 62);
    const x = c.getContext('2d');
    const P = (a, b, w, h, col) => {
      x.fillStyle = col;
      x.fillRect(a + 1, b + 1, w, h);
    };
    P(0, 0, 12, 60, '#1b2550');
    P(0, 0, 12, 12, '#2d3d7a');
    P(2, 2, 8, 8, '#243170');
    P(0, 12, 3, 48, '#141c40');
    for (let i = 0; i < 4; i++) P(4, 16 + i * 11, 4, 5, i % 2 ? '#1e90ff' : '#35e0ff');
    P(0, 57, 12, 3, '#060918');
    outline(c, '#03050c');
    return c;
  }

  function buildShadow(w, h) {
    const c = canvas(w, h);
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(0,0,0,0.38)';
    const cx = (w - 1) / 2, cy = (h - 1) / 2;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const dx = (px - cx) / (w / 2), dy = (py - cy) / (h / 2);
        if (dx * dx + dy * dy <= 1) x.fillRect(px, py, 1, 1);
      }
    }
    return c;
  }

  // ============================================================= ÍCONES 10x10
  const ICON_PAL = {
    k: '#0a0a14', w: '#f5f7ff', l: '#9aa4c4', b: '#1e90ff', c: '#35e0ff', d: '#10204a',
    p: '#9b5cff', m: '#e0c3ff', r: '#ff2d55', o: '#ff7b1a', y: '#ffd84a', g: '#5de07a', s: '#f2c7a0',
  };
  const ICONS = {
    direct_shot: ['...kkkk...', '..kwwwwk..', '.kwkkwwwk.', '.kwkwwkwk.', 'bbkwwwkwk.', '.bkwkwwwk.', 'bb.kwwwk..', '....kkk...', '..........', '..........'],
    spin_shot: ['..pppppp..', '.p......p.', 'p..mmmm..p', 'p.m....m.p', 'p.m.ww.m.p', 'p.m..w.m.p', 'p..m...m.p', '.p..mmm..p', '..p......p', '...pppppp.'],
    curve_shot: ['.........w', '........ww', '..cccc..kw', '.c....c...', 'c......c..', 'c.......c.', '.........c', '.........c', '.......cc.', '....ccc...'],
    one_touch: ['......y...', '.....yy...', '....yy....', '...yyyyy..', '.....yy...', '..kk.y....', '.kwwk.....', 'kwkwwk....', 'kwwkwk....', '.kkkk.....'],
    off_ball: ['...bbbb...', '.bb....bb.', 'b..cccc..b', 'b.c....c.b', 'bc..ww..cb', 'bc..ww..cb', 'b.c....c.b', 'b..cccc..b', '.bb....bb.', '...bbbb...'],
    dribble: ['w.....ccc.', 'ww...c....', '.ww.c.....', '..wc......', '..cw......', '.c..ww....', 'c....ww...', '......ww..', '.....kwwk.', '.....kkkk.'],
    meta_vision: ['..........', '...cccc...', '.cc....cc.', 'c..bbbb..c', 'c.bbkkbb.c', 'c.bbkkbb.c', 'c..bbbb..c', '.cc....cc.', '...cccc...', '..........'],
    power_shot: ['...o..o...', '..oyo.oy..', '.oyyooyyo.', '.oykkkkyo.', 'oykwwwwkyo', 'oykwkkwkyo', '.okwwwwko.', '..kwkwwk..', '...kkkk...', '..........'],
    sky_volley: ['...wwww...', '.ww....ww.', 'w........w', 'w........c', '.........c', '........c.', '..kk...c..', '.kwwk.....', '.kwwk.rr..', '..kk..rr..'],
    acceleration: ['.....yyy..', '....yyy...', '...yyy....', '..yyyyyy..', '.....yy...', '....yy....', '...yy.....', '..yy......', '.yy.......', '.y........'],
    long_shot: ['....rr....', '...r..r...', '..r.ww.r..', 'rrr.ww.rrr', '..r....r..', '...r..r...', '....rr....', '..........', 'www.......', 'w.w.w.w.w.'],
    predator_eye: ['..........', 'r........r', '.rr....rr.', '..rrrrrr..', '.rryykyrr.', '.rryykyrr.', '..rrrrrr..', '.rr....rr.', 'r........r', '..........'],
    perfect_control: ['...cccc...', '.cc.ww.cc.', 'c...w....c', 'c...w....c', 'c...wwww.c', 'c........c', 'c........c', '.cc....cc.', '...cccc...', '..........'],
    ego: ['.r..r..r..', '.rr.rr.rr.', '.rrrrrrrr.', '.ryrryrry.', '.rrrrrrrr.', '..........', '.pp....pp.', '..pppppp..', '...pppp...', '....pp....'],
    flow_state: ['..........', 'c...c...c.', 'cc.cc..cc.', '.ccc..cc..', '..c..cc...', '.....c....', 'bb...bb...', '.bb.bb.bb.', '..bbb...bb', '...b......'],
    iron_body: ['.llllllll.', '.lwwwwwwl.', '.lwbbbbwl.', '.lwbwwbwl.', '.lwbbbbwl.', '.lwbwwbwl.', '..lwbbwl..', '...lwwl...', '....ll....', '..........'],
    field_reading: ['.rr....rr.', '.rr....rr.', '.ww....ww.', '.rr....rr.', '.rr....rr.', '.rr....rr.', '..rr..rr..', '...rrrr...', '..........', 'c.c.c.c.c.'],
    finishing: ['....y.....', '...yyy....', 'yyyywyyyy.', '.yywwwyy..', '..ywwwy...', '..yy.yy...', '.yy...yy..', '.y.....y..', '..........', 'wwwwwwwwww'],
    stamina: ['..........', '.rr...rr..', 'rwrr.rrrr.', 'rwrrrrrrr.', 'rrrrrrrrr.', '.rrrrrrr..', '..rrrrr...', '...rrr....', '....r.....', '..........'],
    kaiser_impact: ['.y.y.y....', '.yyyyy....', '..........', 'bb..kkkk..', '.bbkwwwwk.', 'bbbkwkkwk.', '.bbkwwwwk.', 'bb..kkkk..', '..........', '..........'],
    perfect_pass: ['..........', '......c...', 'cccccccc..', '......c...', '..........', '...g......', '..gggggggg', '...g......', '..........', '..........'],
    godspeed: ['c.........', 'cc...yyy..', '.....yy...', 'ccc.yy....', '...yyyyy..', 'cc...yy...', '....yy....', 'c..yy.....', '...y......', '..........'],
    sliding_tackle: ['......o...', '.......o..', '........o.', 'wwww....o.', 'wwwww...o.', 'kkwwwww.o.', '.kkkkkk.o.', '.......o..', '......o...', '..........'],
    awakening: ['....r.....', '...rr..r..', '..rrr.rr..', '..rrrrrr..', '.rryyrrrr.', '.ryyyyrrr.', '.ryywyyrr.', '.rryyyyr..', '..rryyrr..', '...rrrr...'],
    chemical_reaction: ['..........', '.ccc..ppp.', 'c...cp...p', 'c...pc...p', 'c...cp...p', '.ccc..ppp.', '....ww....', '...wyyw...', '....ww....', '..........'],
    two_gun: ['..........', '.kkk......', 'kwwwk.yy..', 'kwkwk.....', 'kwwwk.kkk.', '.kkk.kwwwk', '.yy..kwkwk', '.....kwwwk', '......kkk.', '..........'],
    banish: ['..........', '.rr....rr.', '.rrr..rrr.', '..rrrrrr..', '...rrrr...', '...rrrr...', '..rrrrrr..', '.rrr..rrr.', '.rr....rr.', '..........'],
    heal: ['..........', '....gg....', '....gg....', '..gggggg..', '..gggggg..', '....gg....', '....gg....', '..........', '..........', '..........'],
    flow_burst: ['....cc....', '...cccc...', '..ccwwcc..', '.ccwwwwcc.', 'ccwwwwwwcc', '.ccwwwwcc.', '..ccwwcc..', '...cccc...', '....cc....', '..........'],
    ego_points: ['..pppppp..', '.pmmmmmmp.', 'pmm....mmp', 'pm.pppp.mp', 'pm.p....mp', 'pm.pppp.mp', 'pm.p....mp', 'pmm.pppmmp', '.pmmmmmmp.', '..pppppp..'],
  };
  const EVO_PAL = Object.assign({}, ICON_PAL, { w: '#fff6c4', c: '#ffd84a', b: '#ff9f1a', p: '#ffb000', m: '#fff0a0', l: '#ffe070' });

  function buildIcons() {
    for (const k of Object.keys(ICONS)) {
      const c = outline(fromMap(['..........'.padEnd(12, '.')].concat(ICONS[k].map((r) => '.' + r + '.'), ['............']), ICON_PAL), '#05060c');
      S.icons[k] = c;
      S.iconURLs[k] = c.toDataURL();
      const e = outline(fromMap(['............'].concat(ICONS[k].map((r) => '.' + r + '.'), ['............']), EVO_PAL), '#3a1c00');
      S.icons[k + '_evo'] = e;
      S.iconURLs[k + '_evo'] = e.toDataURL();
    }
  }

  // ================================================================ FONTE 3x5
  const GLYPHS = {
    0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'],
    2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'],
    4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
    6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'],
    8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'],
    A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'],
    C: ['011', '100', '100', '100', '011'], D: ['110', '101', '101', '101', '110'],
    E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
    G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'],
    I: ['111', '010', '010', '010', '111'], J: ['001', '001', '001', '101', '010'],
    K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'],
    M: ['101', '111', '111', '101', '101'], N: ['110', '101', '101', '101', '101'],
    O: ['010', '101', '101', '101', '010'], P: ['110', '101', '110', '100', '100'],
    Q: ['010', '101', '101', '110', '011'], R: ['110', '101', '110', '101', '101'],
    S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'],
    U: ['101', '101', '101', '101', '111'], V: ['101', '101', '101', '101', '010'],
    W: ['101', '101', '111', '111', '101'], X: ['101', '101', '010', '101', '101'],
    Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'],
    '!': ['010', '010', '010', '000', '010'], '+': ['000', '010', '111', '010', '000'],
    '-': ['000', '000', '111', '000', '000'], x: ['000', '101', '010', '101', '000'],
    '.': ['000', '000', '000', '000', '010'], ':': ['000', '010', '000', '010', '000'],
    '%': ['101', '001', '010', '100', '101'], ' ': ['000', '000', '000', '000', '000'],
    "'": ['010', '010', '000', '000', '000'], '?': ['111', '001', '010', '000', '010'],
  };
  const glyphCache = {};
  function glyph(ch, color) {
    const key = ch + color;
    let g = glyphCache[key];
    if (g) return g;
    const rows = GLYPHS[ch] || GLYPHS['?'];
    g = canvas(5, 7);
    const x = g.getContext('2d');
    x.fillStyle = color;
    for (let y = 0; y < 5; y++) for (let i = 0; i < 3; i++) if (rows[y][i] === '1') x.fillRect(i + 1, y + 1, 1, 1);
    outline(g, '#05060c');
    glyphCache[key] = g;
    return g;
  }

  BL.Font = {
    /** largura em pixels (escala 1) */
    width(text) {
      return text.length * 4 + 1;
    },
    draw(ctx, text, x, y, color, scale, align) {
      text = String(text).toUpperCase().replace(/X(?=\d)/g, 'x');
      scale = scale || 1;
      const w = this.width(text) * scale;
      let px = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
      const py = Math.round(y);
      for (let i = 0; i < text.length; i++) {
        const g = glyph(text[i], color);
        ctx.drawImage(g, px, py, 5 * scale, 7 * scale);
        px += 4 * scale;
      }
    },
  };

  // ==================================================================== INIT
  S.init = function () {
    for (const k of Object.keys(CHAR_DEFS)) {
      buildChar(k, CHAR_DEFS[k], 1);
    }
    // personagens jogáveis + retratos grandes (frente, correndo) para a seleção
    S.portraits = {};
    S.portraitsLocked = {};
    for (const c of BL.Characters.list) {
      const set = buildHero('p_' + c.id, c.look, c.hair);
      S.portraits[c.id] = set.down.slice(0, 4).map((f) => scaleUp(f, 5).toDataURL());
      if (!c.unlock) continue;
      S.portraitsLocked[c.id] = scaleUp(silhouette(set.down[0], '#0d1330'), 5).toDataURL();
      // o boss é o próprio herói em escala 2x
      const boss = { scale: 2, ax: set.ax * 2, ay: set.ay * 2, feet: set.feet * 2 };
      for (const k of ['down', 'up', 'right', 'left', 'fdown', 'fup', 'fright', 'fleft']) boss[k] = set[k].map((f) => scaleUp(f, 2));
      S.chars['boss_' + c.unlock.boss] = boss;
    }
    S.balls.normal = buildBall(5, '#f5f7ff', '#10131f', '#05060c');
    S.balls.small = buildBall(3, '#e8fbff', '#35e0ff', '#05060c');
    S.balls.spin = buildBall(7, '#d9c2ff', '#6c2bd9', '#1a0838');
    S.balls.curve = buildBall(5, '#c8fbff', '#1aa7c9', '#03202a');
    S.balls.power = buildBall(8, '#ffd0b8', '#d7263d', '#2a0508');
    S.balls.gold = buildBall(7, '#fff0a0', '#b8860b', '#3a2600');
    S.balls.emperor = buildBall(13, '#ffe28a', '#d7263d', '#2a0508');
    S.balls.predator = buildBall(3, '#ffb3c1', '#ff2d55', '#2a0010');
    S.balls.enemy = buildBall(5, '#ff8fa3', '#5a0010', '#1a0004');
    S.balls.enemyBig = buildBall(10, '#ff5577', '#2a0008', '#12000a');
    S.balls.volley = buildBall(6, '#ffffff', '#1e90ff', '#05060c');
    S.balls.meteor = buildBall(8, '#ffe8b0', '#ff7b1a', '#2a1000');
    S.balls.impact = buildBall(9, '#dfe8ff', '#2f6bff', '#06102a');
    S.balls.magnus = buildBall(11, '#fff0a0', '#2f6bff', '#06102a');
    S.balls.pass = buildBall(6, '#d8fff4', '#2ee6b8', '#03231c');
    S.balls.kaiser = buildBall(11, '#cfe0ff', '#2f6bff', '#06102a');

    S.orbs = [
      buildOrb(5, '#35e0ff', '#c8fbff', '#1a8fb0'),
      buildOrb(7, '#1e90ff', '#9fd0ff', '#0d4fa0'),
      buildOrb(7, '#9b5cff', '#e0c3ff', '#5a2aa8'),
      buildOrb(9, '#ffd84a', '#fff6c4', '#b8860b'),
    ];

    S.misc.cone = buildCone();
    S.misc.pillar = buildPillar();
    S.misc.wallH = buildWall(true);
    S.misc.wallV = buildWall(false);
    S.misc.shadow = buildShadow(14, 5);
    S.misc.shadowBig = buildShadow(30, 9);
    S.misc.shadowBall = buildShadow(6, 3);
    S.misc.heart = outline(fromMap(['.rr.rr.', 'rwrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'], ICON_PAL), '#1a0006');
    S.misc.magnet = outline(fromMap(['rr...rr', 'rr...rr', 'rr...rr', 'rr...rr', '.rr.rr.', '..rrr..'].map((r, i) => (i === 0 ? 'ww...ww' : r)), ICON_PAL), '#1a0006');
    S.misc.crystal = outline(fromMap(['...m...', '..mpm..', '.mpppm.', 'mpppppm', '.mpppm.', '..mpm..', '...m...'], ICON_PAL), '#12002a');
    S.misc.markEye = outline(fromMap(['.ccc.', 'cbkbc', '.ccc.'], ICON_PAL), '#021018');
    S.misc.buff = outline(fromMap(['..m..', '.mmm.', 'mmmmm', '..m..'], ICON_PAL), '#12002a');
    buildIcons();
  };
})();
