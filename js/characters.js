'use strict';
/* =========================================================================
 * characters.js — personagens jogáveis (fan designs em pixel art
 * inspirados em Blue Lock). Cada um tem visual próprio, habilidades
 * iniciais diferentes e um traço passivo exclusivo.
 *
 * Para adicionar um personagem: nova entrada em LIST com
 * { id, name, short, title, color, look, hair: {down, up, side},
 *   start: [[abilityId, nível]], trait: {name, desc}, apply(stats), bars }
 *
 * Cabelos são mapas de pixels 20 colunas (layout do herói 20x28):
 *   'h' = cor base · 'H' = brilho · 'd' = sombra · '.' = vazio
 * Rosto (visão de frente): pele em x5..14, y4..13; olhos em x5..7 e x12..14, y8..10.
 * ========================================================================= */
(function () {
  const BL = window.BL;

  // Uniforme do programa: azul-marinho + azul elétrico
  const KIT = { shirt: '#142a5e', shirt2: '#2f9bff', shorts: '#0b0f22', socks: '#1e3f8f', boots: '#f5f7ff', num: '#f5f7ff' };

  const LIST = [
    {
      id: 'isagi',
      name: 'YOICHI ISAGI',
      short: 'ISAGI',
      title: 'O CÉREBRO DO CAMPO',
      color: '#2f9bff',
      look: Object.assign({}, KIT, { skin: '#f6d0ae', hair: '#1f2748', hair2: '#43558f', hairD: '#0b0e22', eye: '#3a8bff', eyeD: '#16398f', number: '11' }),
      hair: {
        down: [
          '........d..d........',
          '.......dh..hd.......',
          '.....ddhhhhhhdd.....',
          '....dhhhHHHhhhhd....',
          '...dhhHHhhhhhhhhd...',
          '...dhhhhhhhhhhhhd...',
          '...dhhhhhdhhhhhhd...',
          '...dhhdhhd.hhdhhd...',
          '...dh...hddh...hd...',
          '...dh..........hd...',
          '...dd..........dd...',
          '....d..........d....',
        ],
        up: [
          '........d..d........',
          '.......dh..hd.......',
          '.....ddhhhhhhdd.....',
          '....dhhhhHHhhhhd....',
          '...dhhhhHHhhhhhhd...',
          '...dhhhhhhhhhhhhd...',
          '...dhhhhhhhhhhhhd...',
          '...dhhhhhhhhhhhhd...',
          '...dhhhdhhhhdhhhd...',
          '...dhhdhhhhhhdhhd...',
          '....dhhhdhhdhhhd....',
          '....ddhd.hd.dhdd....',
        ],
        side: [
          '..........d..d......',
          '.........dh.dh......',
          '......ddhhhhhhd.....',
          '.....dhhhHHHhhhd....',
          '....dhhHHhhhhhhhd...',
          '....dhhhhhhhhhhhhd..',
          '....dhhhhhhhhhdhhd..',
          '....dhhhhhhhd.dhd...',
          '....dhhhhhd.....d...',
          '....dhhhhd..........',
          '.....dhhd...........',
          '.....dd.............',
        ],
      },
      start: [['direct_shot', 1], ['meta_vision', 1]],
      trait: { name: 'SPATIAL AWARENESS', desc: '+20% de dano em rivais marcados pela META VISION.' },
      apply(s) {
        s.markBonus = (s.markBonus || 0.25) + 0.2;
      },
      bars: { spd: 3, dmg: 3, hp: 3, tec: 5 },
    },
    {
      id: 'rin',
      name: 'RIN ITOSHI',
      short: 'RIN',
      title: 'O FINALIZADOR PERFEITO',
      color: '#2ee6b8',
      look: Object.assign({}, KIT, { skin: '#f3cfae', hair: '#15302f', hair2: '#2f5f5b', hairD: '#060f10', eye: '#2ee6b8', eyeD: '#0d6b57', shirt2: '#22c79f', socks: '#0f5e4f', number: '10' }),
      hair: {
        down: [
          '....................',
          '......dddddddd......',
          '.....dhhhhhhhhd.....',
          '....dhhHHhhHHhhd....',
          '...dhhHhhhhhhHhhd...',
          '...dhhhhhhhhhhhhd...',
          '...dhhhhhd.dhhhhd...',
          '...dhhhhd..dhhhhd...',
          '...dhd...d....dhd...',
          '...dhd........dhd...',
          '...dhd........dhd...',
          '...dd..........dd...',
          '....d..........d....',
        ],
        up: [
          '....................',
          '......dddddddd......',
          '.....dhhhhhhhhd.....',
          '....dhhhHHHhhhhd....',
          '...dhhhHHhhhhhhhd...',
          '...dhhhhhhhhhhhhd...',
          '...dhhhhhhhhhhhhd...',
          '...dhhhhhhhhhhhhd...',
          '...dhhhhhhhhhhhhd...',
          '...dhhhhhhhhhhhhd...',
          '...dhhhhhhhhhhhhd...',
          '...dhhhhhhhhhhhhd...',
          '....dhhdhhdhhdhd....',
          '....dd.........dd...',
        ],
        side: [
          '....................',
          '......ddddddd.......',
          '.....dhhhhhhhd......',
          '....dhhHHHhhhhd.....',
          '....dhHhhhhhhhhd....',
          '....dhhhhhhhhhhhd...',
          '....dhhhhhhhhhhhhd..',
          '....dhhhhhhhd..hhd..',
          '....dhhhhhhd....hd..',
          '....dhhhhhd.....d...',
          '....dhhhhd..........',
          '....dhhhd...........',
          '.....dd.............',
        ],
      },
      start: [['curve_shot', 2]],
      trait: { name: 'DESTROYER', desc: '+15% de dano, +10% de crítico e +30% de dano crítico. -10 HP.' },
      apply(s) {
        s.might *= 1.15;
        s.crit += 0.1;
        s.critMul += 0.3;
        s.maxHp -= 10;
      },
      bars: { spd: 3, dmg: 5, hp: 2, tec: 4 },
    },
    {
      id: 'nagi',
      name: 'SEISHIRO NAGI',
      short: 'NAGI',
      title: 'O GÊNIO PREGUIÇOSO',
      color: '#e8ecf5',
      look: Object.assign({}, KIT, { skin: '#f8dcc4', hair: '#e4e9f5', hair2: '#ffffff', hairD: '#98a2c0', eye: '#9aa2bd', eyeD: '#4f5570', sleepy: true, shirt2: '#c8d0e8', socks: '#3a4260', number: '7' }),
      hair: {
        down: [
          '.....h..hh...h......',
          '....dhhdhhdhhhd.....',
          '...dhhhhhhhhhhhhd...',
          '..dhhHHhhhhHHhhhhd..',
          '..dhHHhhhhhhhhhhhd..',
          '.dhhhhhhhhhhhhhhhhd.',
          '..dhhhhhhhhhhhhhhd..',
          '..dhhdhhhdhhhhdhhhd.',
          '..dhd.....dh...hhd..',
          '..dhd..........hhd..',
          '..dd............dd..',
        ],
        up: [
          '.....h..hh...h......',
          '....dhhdhhdhhhd.....',
          '...dhhhhhhhhhhhhd...',
          '..dhhhhHHhhhhhhhhd..',
          '..dhhhHHhhhhhHhhhd..',
          '.dhhhhhhhhhhhhhhhhd.',
          '.dhhhhhhhhhhhhhhhhd.',
          '..dhhhhhhhhhhhhhhd..',
          '..dhhhhhhhhhhhhhhd..',
          '..dhhdhhhhhhhdhhhd..',
          '...dhd.hhhhhd.dhd...',
          '....d...dd....d.....',
        ],
        side: [
          '.......h..hh..h.....',
          '......dhhdhhdhhd....',
          '.....dhhhhhhhhhhd...',
          '....dhhHHhhhhhhhhd..',
          '...dhhHhhhhhhhhhhhd.',
          '...dhhhhhhhhhhhhhhd.',
          '...dhhhhhhhhhhdhhhd.',
          '...dhhhhhhhhd..dhhd.',
          '...dhhhhhhhd.....hd.',
          '...dhhhhhhd.........',
          '....dhhhhd..........',
          '.....dd.hd..........',
        ],
      },
      start: [['one_touch', 1], ['sky_volley', 1]],
      trait: { name: 'GENIUS TRAP', desc: '-12% de recarga de tudo e +10% de XP. -5% de velocidade.' },
      apply(s) {
        s.cdMul *= 0.88;
        s.xpMul *= 1.1;
        s.speed *= 0.95;
      },
      bars: { spd: 2, dmg: 4, hp: 3, tec: 5 },
    },
    {
      id: 'chigiri',
      name: 'HYOMA CHIGIRI',
      short: 'CHIGIRI',
      title: 'A PANTERA VERMELHA',
      color: '#ff3b5c',
      look: Object.assign({}, KIT, { skin: '#f9dcc6', hair: '#d4223f', hair2: '#ff6d86', hairD: '#7a0a22', eye: '#ff5f8f', eyeD: '#a01a45', shirt2: '#ff4d6a', socks: '#6e1428', number: '4' }),
      hair: {
        down: [
          '....................',
          '......dddddddd......',
          '.....dhhHHHhhhd.....',
          '....dhhHHhhhhhhd....',
          '...dhhHhhhhhhhhhd...',
          '...dhhhhhhdhhhhhd...',
          '..dhhhhhhd.dhhhhhd..',
          '..dhhhhhd..dhhhhhd..',
          '..dhd...d..d...dhd..',
          '..dhd..........dhd..',
          '..dhd..........dhd..',
          '..dHd..........dHd..',
          '..dhd..........dhd..',
          '..dhd..........dhd..',
          '..dhd..........dhd..',
          '..dHd..........dHd..',
          '..dhd..........dhd..',
          '..dhd..........dhd..',
          '..dhd..........dhd..',
          '...d............d...',
        ],
        up: [
          '....................',
          '......dddddddd......',
          '.....dhhhhhhhhd.....',
          '....dhhhHHhhhhhd....',
          '...dhhhHHhhhhhhhd...',
          '..dhhhhhhhhhhhhhhd..',
          '..dhhhhhhhhhhhhhhd..',
          '..dhhhhhhHhhhhhhhd..',
          '..dhhhhhhHhhhhhhhd..',
          '..dhhhhhhhhhhhhhhd..',
          '..dhhhhhhhhhhhhhhd..',
          '..dhhhhhhhhhHhhhhd..',
          '..dhhhhhhhhhHhhhhd..',
          '..dhhhhhhhhhhhhhhd..',
          '..dhhhhhhhhhhhhhhd..',
          '..dhhhhhhhhhhhhhhd..',
          '..dhhhhhhhhhhhhhhd..',
          '..dhhhhhhhhhhhhhhd..',
          '..dhhdhhhdhhhdhhhd..',
          '...d...d...d...d....',
        ],
        side: [
          '....................',
          '......ddddddd.......',
          '.....dhhHHhhhd......',
          '....dhhHhhhhhhd.....',
          '...dhhhhhhhhhhhd....',
          '...dhhhhhhhhhhhhd...',
          '...dhhhhhhhhhhhhhd..',
          '...dhhhhhhhhd..dhd..',
          '...dhhhhhhhd....hd..',
          '..dhhhhhhd..........',
          '..dhhhhhhd..........',
          '..dhHhhhhd..........',
          '..dhHhhhd...........',
          '..dhhhhhd...........',
          '..dhhhhhd...........',
          '..dhhhhhd...........',
          '..dhhhhhd...........',
          '..dhhhhhd...........',
          '..dhhhhd............',
          '...dhhd.............',
        ],
      },
      start: [['spin_shot', 1], ['dribble', 1]],
      trait: { name: 'RED PANTHER', desc: '+20% de velocidade e -30% de recarga do DASH. -15 HP.' },
      apply(s) {
        s.speed *= 1.2;
        s.dashCd *= 0.7;
        s.maxHp -= 15;
      },
      bars: { spd: 5, dmg: 3, hp: 2, tec: 3 },
    },
  ];

  BL.Characters = {
    list: LIST,
    get(id) {
      return LIST.find((c) => c.id === id) || LIST[0];
    },
  };
})();
