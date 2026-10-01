'use strict';
/* =========================================================================
 * abilities.js — definição data-driven de todas as habilidades (armas
 * ativas, passivas e evoluções) + o "Build" do jogador, que gerencia
 * níveis, cooldowns, disparos automáticos e as cartas de level up.
 *
 * Para adicionar uma habilidade nova basta criar uma entrada em DEFS:
 *   arma:    { name, type:'weapon', icon, max, desc, up[], stats(l), fire(g,w,s), evo? }
 *   passiva: { name, type:'passive', icon, max, desc, up[], apply(stats, l) }
 * ========================================================================= */
(function () {
  const BL = window.BL;
  const U = BL.U;
  const Pr = () => BL.Projectiles;

  const lv = (arr, l) => arr[Math.min(l, arr.length) - 1];
  const FIRE = ['#ffffff', '#ffd84a', '#ff7b1a', '#d7263d'];
  const GOLD = ['#fff6c4', '#ffd84a', '#ff9f1a', '#ffffff'];
  const CYAN = ['#ffffff', '#35e0ff', '#1e90ff', '#10204a'];
  const PURPLE = ['#ffffff', '#e0c3ff', '#9b5cff', '#6c2bd9'];
  const ROYAL = ['#ffffff', '#9fc0ff', '#2f6bff', '#0a1a4a'];
  const TEAL = ['#ffffff', '#b8fff0', '#2ee6b8', '#0d6b57'];
  const ORANGE = ['#ffffff', '#ffd84a', '#ff7b00', '#4a4a58'];

  /** mira com antecipação simples do movimento do alvo */
  function leadAngle(p, t, speed) {
    const d = Math.hypot(t.x - p.x, t.y - p.y);
    const tt = Math.min(0.6, d / speed);
    return Math.atan2(t.y + (t.vy || 0) * tt - p.y, t.x + (t.vx || 0) * tt - p.x);
  }

  function shootAtTargets(g, w, s, o) {
    const p = g.player;
    const range = s.range * p.stats.range;
    const speed = s.speed * p.stats.projSpd;
    const aim = o.allowAim ? g.aimAngle() : null;
    let targets = null;
    if (aim === null) {
      targets = g.nearestEnemies(p.x, p.y, range, s.amount, o.pick);
      if (!targets.length) return false;
    }
    let a = 0;
    for (let i = 0; i < s.amount; i++) {
      if (aim !== null) a = aim + (i - (s.amount - 1) / 2) * 0.16;
      else {
        const t = targets[i % targets.length];
        a = leadAngle(p, t, speed);
        if (i >= targets.length) a += Math.ceil((i - targets.length + 1) / 2) * 0.18 * (i % 2 ? 1 : -1);
      }
      Pr().spawn(
        Object.assign(
          {
            x: p.x, y: p.y,
            vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
            life: (range / speed) * 1.3,
            dmg: s.dmg, pierce: s.pierce || 0, src: w.id,
          },
          o.proj
        )
      );
    }
    p.kick(Math.cos(a), Math.sin(a));
    BL.Audio.play(o.sfx || 'kick');
    return true;
  }

  const DEFS = {
    // ================================================================ ARMAS
    direct_shot: {
      name: 'DIRECT SHOT', type: 'weapon', icon: 'direct_shot', max: 5,
      desc: 'Chuta a bola automaticamente no rival mais próximo.',
      up: ['Chute automático no rival mais próximo.', '+1 bola por chute.', '+33% de dano.', 'A bola atravessa +1 rival.', '+1 bola e -15% de recarga.'],
      stats: (l) => ({ dmg: lv([12, 12, 16, 16, 18], l), cd: lv([0.85, 0.85, 0.85, 0.85, 0.72], l), amount: lv([1, 2, 2, 2, 3], l), pierce: lv([0, 0, 0, 1, 1], l), speed: 260, range: 230 }),
      fire: (g, w, s) => shootAtTargets(g, w, s, { allowAim: true, proj: { sprite: 'normal', r: 3, knock: 70, color: '#ffffff' } }),
      evo: { need: 'long_shot', lvl: 3, into: 'perfect_finish' },
    },
    spin_shot: {
      name: 'SPIN SHOT', type: 'weapon', icon: 'spin_shot', max: 5,
      desc: 'Lança uma bola giratória que atravessa rivais e ricocheteia.',
      up: ['Bola giratória na direção do movimento.', '+1 bola giratória.', '+33% de dano e +30% de tamanho.', '+1 bola e mais duração.', '+40% de dano, maior e mais rápida.'],
      stats: (l) => ({ dmg: lv([12, 12, 16, 16, 22], l), cd: lv([2.6, 2.6, 2.4, 2.4, 2.1], l), amount: lv([1, 2, 2, 3, 3], l), dur: lv([2.2, 2.2, 2.6, 2.9, 3.2], l), size: lv([1, 1, 1.3, 1.3, 1.5], l), speed: 150 }),
      fire(g, w, s) {
        const p = g.player;
        const aim = g.aimAngle();
        const base = aim !== null ? aim : Math.atan2(p.faceY, p.faceX);
        const sp = s.speed * p.stats.projSpd;
        const size = s.size * p.stats.area;
        for (let i = 0; i < s.amount; i++) {
          const a = base + (i - (s.amount - 1) / 2) * 0.45;
          Pr().spawn({
            x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 5 * size, scale: size,
            dmg: s.dmg, pierce: 999, hitCd: 0.35, bounce: true, life: s.dur * p.stats.range,
            sprite: 'spin', spinSpd: 22, trail: '#9b5cff', knock: 40, src: w.id, color: '#9b5cff',
          });
        }
        p.kick(Math.cos(base), Math.sin(base));
        BL.Audio.play('kick');
        return true;
      },
      evo: { need: 'acceleration', lvl: 3, into: 'cyclone_drive' },
    },
    curve_shot: {
      name: 'CURVE SHOT', type: 'weapon', icon: 'curve_shot', max: 5,
      desc: 'Chute com efeito: a bola faz uma curva e persegue o alvo.',
      up: ['Bola com efeito que curva até o alvo.', '+1 bola curva.', '+28% de dano e +1 perfuração.', '+1 bola curva.', '+1 bola, +33% de dano, recarga menor.'],
      stats: (l) => ({ dmg: lv([14, 14, 18, 18, 24], l), cd: lv([1.45, 1.45, 1.35, 1.35, 1.2], l), amount: lv([1, 2, 2, 3, 4], l), pierce: lv([1, 1, 2, 2, 3], l), speed: 200, range: 270, turn: 4.2 }),
      fire(g, w, s) {
        const p = g.player;
        const range = s.range * p.stats.range;
        const t = g.nearestEnemies(p.x, p.y, range, s.amount, 'marked');
        if (!t.length) return false;
        const sp = s.speed * p.stats.projSpd;
        for (let i = 0; i < s.amount; i++) {
          const tg = t[i % t.length];
          const side = i % 2 ? 1 : -1;
          const a = Math.atan2(tg.y - p.y, tg.x - p.x) + side * 1.15;
          Pr().spawn({
            x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, behavior: 'homing', target: tg, turn: s.turn,
            dmg: s.dmg, pierce: s.pierce, life: 2.4 * p.stats.range, sprite: 'curve', trail: '#35e0ff', src: w.id, color: '#35e0ff',
          });
        }
        p.kick(t[0].x - p.x, t[0].y - p.y);
        BL.Audio.play('kick');
        return true;
      },
      evo: { need: 'meta_vision', lvl: 3, into: 'phantom_curve' },
    },
    one_touch: {
      name: 'ONE-TOUCH', type: 'weapon', icon: 'one_touch', max: 5,
      desc: 'Toques rápidos de primeira: pequenas bolas disparadas sem parar.',
      up: ['Dispara pequenas bolas rápidas no rival mais próximo.', '+30% de dano.', '-20% de recarga.', 'Dispara 2 bolas por vez.', '+12% de dano e -18% de recarga.'],
      stats: (l) => ({ dmg: lv([5, 6.5, 6.5, 8, 9], l), cd: lv([0.5, 0.5, 0.4, 0.4, 0.33], l), amount: lv([1, 1, 1, 2, 2], l), speed: 360, range: 210 }),
      fire: (g, w, s) => shootAtTargets(g, w, s, { sfx: 'shoot', proj: { sprite: 'small', r: 2, knock: 25, color: '#35e0ff' } }),
      evo: { need: 'predator_eye', lvl: 3, into: 'predator_volley' },
    },
    off_ball: {
      name: 'OFF-BALL MOVEMENT', type: 'weapon', icon: 'off_ball', max: 5,
      desc: 'Movimentação sem bola: uma onda ao seu redor empurra os rivais.',
      up: ['Onda de choque ao redor que empurra rivais.', '+13% de área.', '+75% de dano, recarga menor.', '+15% de área.', '+43% de dano, recarga menor.'],
      stats: (l) => ({ dmg: lv([8, 8, 14, 14, 20], l), cd: lv([3, 3, 2.6, 2.6, 2.2], l), radius: lv([60, 68, 68, 78, 88], l), knock: lv([170, 180, 190, 200, 230], l) }),
      fire(g, w, s) {
        const p = g.player;
        g.shockwave(p.x, p.y, s.radius * p.stats.area, s.dmg, s.knock, w.id, CYAN);
        return true;
      },
      evo: { need: 'perfect_control', lvl: 3, into: 'space_manipulation' },
    },
    dribble: {
      name: 'DRIBBLE', type: 'weapon', icon: 'dribble', max: 5, manual: true,
      desc: 'Seu DASH atravessa rivais causando dano e atordoando.',
      up: ['O DASH [ESPAÇO] causa dano e atordoa rivais.', '-20% de recarga do DASH.', '+75% de dano e DASH 25% mais longo.', 'Finta: o ponto de partida do DASH explode.', '+57% de dano e -25% de recarga.'],
      stats: (l) => ({ dmg: lv([20, 20, 35, 35, 55], l) }),
      apply(s, l) {
        s.dashDmg = lv([20, 20, 35, 35, 55], l);
        s.dashCd *= lv([1, 0.8, 0.8, 0.8, 0.6], l);
        s.dashLen *= lv([1, 1, 1.25, 1.25, 1.35], l);
        s.dashFeint = l >= 4;
      },
      fire: () => true,
      evo: { need: 'ego', lvl: 3, into: 'monster_dribble' },
    },
    meta_vision: {
      name: 'META VISION', type: 'weapon', icon: 'meta_vision', max: 5,
      desc: 'Lê o campo: marca rivais (recebem mais dano) e aumenta a área.',
      up: ['Marca 3 rivais: +25% de dano neles. +5% de área.', 'Marca 4 rivais, +30% de dano. +5% de área.', 'Marca 5 rivais, +35% de dano, recarga menor.', 'Marca 6 rivais, +40% de dano.', 'Marca 8 rivais, +50% de dano, recarga menor.'],
      stats: (l) => ({ cd: lv([8, 8, 7, 7, 6], l), marks: lv([3, 4, 5, 6, 8], l), range: 320 }),
      apply(s, l) {
        s.area *= 1 + 0.05 * l;
        s.markBonus = lv([0.25, 0.3, 0.35, 0.4, 0.5], l);
      },
      fire(g, w, s) {
        const p = g.player;
        const range = s.range * p.stats.range;
        const cands = [];
        for (const e of g.enemies) {
          if (e.dead || e.spawnT > 0) continue;
          if (U.dist2(p.x, p.y, e.x, e.y) > range * range) continue;
          cands.push(e);
        }
        cands.sort((a, b) => (b.isBoss ? 1e9 : b.isElite ? 1e8 : b.maxHp) - (a.isBoss ? 1e9 : a.isElite ? 1e8 : a.maxHp));
        const n = Math.min(s.marks, cands.length);
        for (let i = 0; i < n; i++) {
          const e = cands[i];
          e.markT = 5;
          BL.FX.line(p.x, p.y - 4, e.x, e.y - 6, '#35e0ff', 0.35, 1);
          BL.FX.ring(e.x, e.y, 14, 4, 0.3, '#35e0ff', 1);
        }
        BL.FX.ring(p.x, p.y, 8, range * 0.6, 0.45, '#35e0ff', 1, true);
        if (n) BL.Audio.play('pickup');
        return true;
      },
    },
    power_shot: {
      name: 'POWER SHOT', type: 'weapon', icon: 'power_shot', max: 5,
      desc: 'Chute de força bruta no rival mais resistente: explode no impacto.',
      up: ['Chute potente que explode no impacto.', '+38% de dano.', '+27% de área da explosão.', '+27% de dano e recarga menor.', '2 chutes potentes por vez.'],
      stats: (l) => ({ dmg: lv([40, 55, 55, 70, 80], l), cd: lv([5, 5, 5, 4.2, 4.2], l), radius: lv([44, 44, 56, 56, 62], l), amount: lv([1, 1, 1, 1, 2], l), speed: 280, range: 280 }),
      fire(g, w, s) {
        const p = g.player;
        const r = s.radius * p.stats.area;
        return shootAtTargets(g, w, s, {
          pick: 'tough', sfx: 'power',
          proj: { sprite: 'power', r: 5, dmg: s.dmg * 0.5, knock: 200, trail: '#ff7b1a', color: '#ff7b1a', explodeEnd: { r, dmg: s.dmg, palette: FIRE } },
        });
      },
      evo: { need: 'iron_body', lvl: 3, into: 'emperor_cannon' },
    },
    sky_volley: {
      name: 'SKY VOLLEY', type: 'weapon', icon: 'sky_volley', max: 5,
      desc: 'Lança bolas pelo alto que caem sobre os rivais e explodem.',
      up: ['Bola alta que cai sobre um rival e explode.', '+1 bola.', '+40% de dano.', '+1 bola e +11% de área.', '+14% de dano, +10% de área, recarga menor.'],
      stats: (l) => ({ dmg: lv([25, 25, 35, 35, 40], l), cd: lv([3.2, 3.2, 3.2, 3.2, 2.6], l), amount: lv([1, 2, 2, 3, 3], l), radius: lv([36, 36, 36, 40, 44], l), range: 260, dur: 0.75, h: 60 }),
      fire: (g, w, s) => lobVolley(g, w, s, { sprite: 'volley', palette: CYAN, trail: null }),
      evo: { need: 'finishing', lvl: 3, into: 'meteor_volley' },
    },

    // ------------------------------------------------- NEW GEN WORLD 11
    kaiser_impact: {
      name: 'KAISER IMPACT', type: 'weapon', icon: 'kaiser_impact', max: 5,
      desc: 'O chute mais rápido do mundo: atravessa todos os rivais em linha.',
      up: ['Chute relâmpago que atravessa todos os rivais em linha.', '+29% de dano.', '-12% de recarga e +15% de crítico.', '+28% de dano.', '+22% de dano, recarga menor e explode no fim.'],
      stats: (l) => ({ dmg: lv([70, 90, 90, 115, 140], l), cd: lv([4, 4, 3.5, 3.5, 3], l), crit: lv([0.15, 0.15, 0.3, 0.3, 0.3], l), boom: l >= 5, amount: 1, pierce: 99, speed: 720, range: 420 }),
      fire(g, w, s) {
        const p = g.player;
        const ok = shootAtTargets(g, w, s, {
          pick: 'tough', sfx: 'impact',
          proj: { sprite: 'impact', r: 7, knock: 170, crit: s.crit, trail: '#2f6bff', color: '#2f6bff', glow: '#2f6bff', shake: 1, explodeEnd: s.boom ? { r: 52 * p.stats.area, dmg: 60, palette: ROYAL } : false },
        });
        if (ok) {
          g.shake(3);
          BL.FX.ring(p.x, p.y, 4, 34, 0.22, '#2f6bff', 3);
        }
        return ok;
      },
      evo: { need: 'flow_state', lvl: 3, into: 'kaiser_magnus' },
    },
    perfect_pass: {
      name: 'PERFECT PASS', type: 'weapon', icon: 'perfect_pass', max: 5,
      desc: 'Passe milimétrico: a bola vai até o rival e volta, acertando na ida e na volta.',
      up: ['Passe que vai e volta, acertando na ida e na volta.', '+1 bola.', '+37% de dano.', '+1 bola.', '+27% de dano e recarga menor.'],
      stats: (l) => ({ dmg: lv([16, 16, 22, 22, 28], l), cd: lv([2.4, 2.4, 2.2, 2.2, 1.9], l), amount: lv([1, 2, 2, 3, 3], l), speed: 290, range: 230 }),
      fire: (g, w, s) => passVolley(g, w, s, { sprite: 'pass', trail: '#2ee6b8', color: '#2ee6b8' }),
      evo: { need: 'field_reading', lvl: 3, into: 'beautiful_destruction' },
    },
    godspeed: {
      name: 'GODSPEED', type: 'weapon', icon: 'godspeed', max: 5,
      desc: 'Uma pós-imagem atravessa os rivais em linha, rápida demais para ser vista.',
      up: ['Pós-imagem que corta os rivais em linha e os atordoa.', '+20% de alcance.', '+36% de dano e recarga menor.', '2 pós-imagens por vez.', '+33% de dano, mais alcance e recarga menor.'],
      stats: (l) => ({ dmg: lv([22, 22, 30, 30, 40], l), cd: lv([3.2, 3.2, 2.8, 2.8, 2.4], l), amount: lv([1, 1, 1, 2, 2], l), len: lv([150, 180, 180, 180, 210], l) }),
      fire: (g, w, s) => afterimage(g, w, s, false),
      evo: { need: 'stamina', lvl: 3, into: 'god_sprint' },
    },
    sliding_tackle: {
      name: 'SLIDING TACKLE', type: 'weapon', icon: 'sliding_tackle', max: 5,
      desc: 'Carrinho em leque no rival mais próximo: dano, empurrão e atordoamento.',
      up: ['Carrinho em leque: dano, empurrão e atordoamento.', '+14% de alcance.', '+38% de dano e atordoa por mais tempo.', '+15% de alcance.', '+33% de dano e recarga menor.'],
      stats: (l) => ({ dmg: lv([26, 26, 36, 36, 48], l), cd: lv([2.4, 2.4, 2.2, 2.2, 1.9], l), radius: lv([70, 80, 80, 92, 100], l), stun: lv([0.5, 0.5, 0.8, 0.8, 1], l), knock: 260, arc: 1.05 }),
      fire(g, w, s) {
        const p = g.player;
        const r = s.radius * p.stats.area;
        let a = g.aimAngle();
        if (a === null) {
          const t = g.nearestEnemies(p.x, p.y, r * 1.1, 1);
          if (!t.length) return false;
          a = Math.atan2(t[0].y - p.y, t[0].x - p.x);
        }
        g.cone(p.x, p.y, a, s.arc, r, s.dmg, s.knock, s.stun, w.id, ORANGE);
        p.kick(Math.cos(a), Math.sin(a));
        return true;
      },
    },

    // ============================================================= EVOLUÇÕES
    perfect_finish: {
      name: 'PERFECT FINISH', type: 'weapon', icon: 'direct_shot_evo', max: 1, evolved: true,
      desc: 'Finalização perfeita: chutes dourados que atravessam a defesa e explodem a cada toque.',
      stats: () => ({ dmg: 42, cd: 0.8, amount: 3, pierce: 4, speed: 340, range: 320 }),
      fire(g, w, s) {
        const ok = shootAtTargets(g, w, s, {
          allowAim: true, sfx: 'power',
          proj: { sprite: 'gold', r: 4, knock: 120, trail: '#ffd84a', color: '#ffd84a', glow: '#ffd84a', explodeR: 30, explodeDmg: 18, palette: GOLD },
        });
        if (ok) g.shake(1.5);
        return ok;
      },
    },
    cyclone_drive: {
      name: 'CYCLONE DRIVE', type: 'weapon', icon: 'spin_shot_evo', max: 1, evolved: true,
      desc: 'Um ciclone de bolas gira ao seu redor e dispara tornados giratórios.',
      stats: () => ({ dmg: 22, cd: 1.8, orbs: 4, orbR: 46, tornado: 34 }),
      fire(g, w, s) {
        const p = g.player;
        let count = 0;
        for (const q of Pr().list) if (q.owner === w.uid && !q.dead) count++;
        for (let i = count; i < s.orbs; i++) {
          Pr().spawn({
            behavior: 'orbit', owner: w.uid, orbR: s.orbR * p.stats.area, ang: (i / s.orbs) * Math.PI * 2, angSpd: 3.6,
            dmg: s.dmg, pierce: 1e9, hitCd: 0.3, life: 1e9, sprite: 'spin', scale: 1.4, r: 7, knock: 90, trail: '#b061ff', src: w.id, color: '#b061ff', glow: '#9b5cff',
          });
        }
        const aim = g.aimAngle();
        const a = aim !== null ? aim : Math.atan2(p.faceY, p.faceX);
        Pr().spawn({
          x: p.x, y: p.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, r: 10, scale: 2, dmg: s.tornado, pierce: 999, hitCd: 0.25,
          bounce: true, life: 3 * p.stats.range, sprite: 'spin', spinSpd: 30, trail: '#e0c3ff', knock: 80, src: w.id, color: '#b061ff', glow: '#9b5cff',
        });
        BL.Audio.play('kick');
        return true;
      },
    },
    phantom_curve: {
      name: 'PHANTOM CURVE', type: 'weapon', icon: 'curve_shot_evo', max: 1, evolved: true,
      desc: 'Curvas fantasmas guiadas pela Meta Vision que ricocheteiam entre rivais.',
      stats: () => ({ dmg: 26, cd: 1.2, amount: 6, pierce: 5, chain: 4, speed: 250, range: 320, turn: 7 }),
      fire(g, w, s) {
        const p = g.player;
        const t = g.nearestEnemies(p.x, p.y, s.range * p.stats.range, s.amount, 'marked');
        if (!t.length) return false;
        for (let i = 0; i < s.amount; i++) {
          const tg = t[i % t.length];
          const a = Math.atan2(tg.y - p.y, tg.x - p.x) + (i % 2 ? 1 : -1) * (0.9 + (i >> 1) * 0.3);
          Pr().spawn({
            x: p.x, y: p.y, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed, behavior: 'homing', target: tg, turn: s.turn, chain: s.chain,
            dmg: s.dmg, pierce: s.pierce, life: 3, sprite: 'curve', trail: '#b061ff', src: w.id, color: '#b061ff', glow: '#35e0ff',
          });
        }
        BL.Audio.play('kick');
        p.kick(t[0].x - p.x, t[0].y - p.y);
        return true;
      },
    },
    predator_volley: {
      name: 'PREDATOR VOLLEY', type: 'weapon', icon: 'one_touch_evo', max: 1, evolved: true,
      desc: 'Instinto predador: rajada contínua que caça os rivais enfraquecidos e os executa.',
      stats: () => ({ dmg: 11, cd: 0.13, amount: 1, speed: 420, range: 240 }),
      fire: (g, w, s) =>
        shootAtTargets(g, w, s, { pick: 'weak', sfx: 'shoot', proj: { sprite: 'predator', r: 3, knock: 20, execute: 0.15, crit: 0.1, trail: '#ff2d55', color: '#ff2d55' } }),
    },
    space_manipulation: {
      name: 'SPACE MANIPULATION', type: 'weapon', icon: 'off_ball_evo', max: 1, evolved: true,
      desc: 'Domina o espaço: cria um vórtice que suga rivais e explode.',
      stats: () => ({ cd: 3.4, radius: 115, tick: 7, final: 80, shock: 22 }),
      fire(g, w, s) {
        const p = g.player;
        const r = s.radius * p.stats.area;
        g.zones.push({ kind: 'vortex', x: p.x, y: p.y, r, t: 1.4, max: 1.4, tickT: 0, dmg: s.tick, final: s.final, src: w.id });
        g.shockwave(p.x, p.y, 70 * p.stats.area, s.shock, 200, w.id, PURPLE);
        return true;
      },
    },
    monster_dribble: {
      name: 'MONSTER DRIBBLE', type: 'weapon', icon: 'dribble_evo', max: 1, evolved: true, manual: true,
      desc: 'O monstro interior desperta: DASH curtíssimo que deixa um rastro de fogo azul.',
      stats: () => ({ dmg: 80 }),
      apply(s) {
        s.dashDmg = 80;
        s.dashCd *= 0.42;
        s.dashLen *= 1.5;
        s.dashFeint = true;
        s.dashTrail = true;
      },
      fire: () => true,
    },
    emperor_cannon: {
      name: 'EMPEROR CANNON', type: 'weapon', icon: 'power_shot_evo', max: 1, evolved: true,
      desc: 'Um canhão imperial gigante que atravessa tudo, explodindo pelo caminho.',
      stats: () => ({ dmg: 120, cd: 3.8, amount: 1, speed: 230, range: 380 }),
      fire(g, w, s) {
        const p = g.player;
        const ok = shootAtTargets(g, w, s, {
          pick: 'tough', sfx: 'power',
          proj: {
            sprite: 'emperor', r: 8, pierce: 99, knock: 220, trail: '#ff1e3c', color: '#ff1e3c', glow: '#ff7b1a', shake: 1.5,
            explodeR: 36 * p.stats.area, explodeDmg: 45, palette: FIRE, explodeEnd: { r: 95 * p.stats.area, dmg: 160, palette: FIRE },
          },
        });
        if (ok) g.shake(4);
        return ok;
      },
    },
    meteor_volley: {
      name: 'METEOR VOLLEY', type: 'weapon', icon: 'sky_volley_evo', max: 1, evolved: true,
      desc: 'Uma chuva de voleios flamejantes cai sobre o campo.',
      stats: () => ({ dmg: 55, cd: 2.4, amount: 7, radius: 50, range: 300, dur: 0.9, h: 140 }),
      fire: (g, w, s) => lobVolley(g, w, s, { sprite: 'meteor', palette: FIRE, trail: '#ff7b1a', big: true }),
    },
    kaiser_magnus: {
      name: 'KAISER IMPACT: MAGNUS', type: 'weapon', icon: 'kaiser_impact_evo', max: 1, evolved: true,
      desc: 'O Impact ganha efeito: duas bolas em curva que caçam os rivais e explodem a cada toque.',
      stats: () => ({ dmg: 120, cd: 2.6, amount: 2, pierce: 8, speed: 560, range: 460, turn: 9 }),
      fire(g, w, s) {
        const p = g.player;
        const t = g.nearestEnemies(p.x, p.y, s.range * p.stats.range, s.amount, 'tough');
        if (!t.length) return false;
        const sp = s.speed * p.stats.projSpd;
        for (let i = 0; i < s.amount; i++) {
          const tg = t[i % t.length];
          const a = Math.atan2(tg.y - p.y, tg.x - p.x) + (i % 2 ? 1 : -1) * 0.9;
          Pr().spawn({
            x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, behavior: 'homing', target: tg, turn: s.turn, chain: 3,
            dmg: s.dmg, pierce: s.pierce, life: 2.6, sprite: 'magnus', r: 8, knock: 180, crit: 0.3, shake: 1,
            explodeR: 34 * p.stats.area, explodeDmg: 40, palette: ROYAL, trail: '#ffd84a', src: w.id, color: '#2f6bff', glow: '#2f6bff',
          });
        }
        p.kick(t[0].x - p.x, t[0].y - p.y);
        BL.Audio.play('impact');
        g.shake(4);
        BL.FX.ring(p.x, p.y, 4, 46, 0.25, '#ffd84a', 3);
        return true;
      },
    },
    beautiful_destruction: {
      name: 'BEAUTIFUL DESTRUCTION', type: 'weapon', icon: 'perfect_pass_evo', max: 1, evolved: true,
      desc: 'Uma teia de passes perfeitos varre o campo e marca cada rival atingido.',
      stats: () => ({ dmg: 36, cd: 1.6, amount: 5, speed: 340, range: 300, mark: 4 }),
      fire: (g, w, s) => passVolley(g, w, s, { sprite: 'pass', trail: '#fff0a0', color: '#2ee6b8', glow: '#2ee6b8', scale: 1.5, r: 7, markHit: s.mark }),
    },
    god_sprint: {
      name: 'GOD SPRINT', type: 'weapon', icon: 'godspeed_evo', max: 1, evolved: true,
      desc: 'Três cortes em sequência na velocidade de Deus, deixando um rastro que queima.',
      stats: () => ({ dmg: 60, cd: 1.5, amount: 3, len: 260 }),
      fire: (g, w, s) => afterimage(g, w, s, true),
    },

    // ============================================================= PASSIVAS
    acceleration: {
      name: 'ACCELERATION', type: 'passive', icon: 'acceleration', max: 5,
      desc: 'Explosão de velocidade.', up: ['+8% de velocidade de movimento.'],
      apply: (s, l) => (s.speed *= 1 + 0.08 * l),
    },
    long_shot: {
      name: 'LONG SHOT', type: 'passive', icon: 'long_shot', max: 5,
      desc: 'Chutes de longa distância.', up: ['+12% de alcance e +8% de velocidade dos chutes.'],
      apply(s, l) {
        s.range *= 1 + 0.12 * l;
        s.projSpd *= 1 + 0.08 * l;
      },
    },
    predator_eye: {
      name: 'PREDATOR EYE', type: 'passive', icon: 'predator_eye', max: 5,
      desc: 'Olhos de predador.', up: ['+12% de dano em rivais com pouca vida e +3% de crítico.'],
      apply(s, l) {
        s.lowHpDmg += 0.12 * l;
        s.crit += 0.03 * l;
      },
    },
    perfect_control: {
      name: 'PERFECT CONTROL', type: 'passive', icon: 'perfect_control', max: 5,
      desc: 'Domínio de bola perfeito.', up: ['-7% de recarga de todas as habilidades.'],
      apply: (s, l) => (s.cdMul *= 1 - 0.07 * l),
    },
    ego: {
      name: 'EGO', type: 'passive', icon: 'ego', max: 5,
      desc: 'Cercado, você fica mais forte.', up: ['Com 8+ rivais por perto: +8% de dano e +4% de velocidade (acumula por nível).'],
      apply: (s, l) => (s.egoLvl = l),
    },
    flow_state: {
      name: 'FLOW', type: 'passive', icon: 'flow_state', max: 5,
      desc: 'Entre no estado de FLOW mais vezes.', up: ['+20% de ganho de FLOW, +1s de duração e +10% de poder no FLOW.'],
      apply(s, l) {
        s.flowGain *= 1 + 0.2 * l;
        s.flowDur += l;
        s.flowPower *= 1 + 0.1 * l;
      },
    },
    iron_body: {
      name: 'IRON BODY', type: 'passive', icon: 'iron_body', max: 5,
      desc: 'Físico de aço.', up: ['+15 de HP máximo e +1 de armadura.'],
      apply(s, l) {
        s.maxHp += 15 * l;
        s.armor += l;
      },
    },
    field_reading: {
      name: 'FIELD READING', type: 'passive', icon: 'field_reading', max: 5,
      desc: 'Leitura de campo.', up: ['+25% de raio de coleta e +5% de XP.'],
      apply(s, l) {
        s.magnet *= 1 + 0.25 * l;
        s.xpMul *= 1 + 0.05 * l;
      },
    },
    finishing: {
      name: 'FINISHING', type: 'passive', icon: 'finishing', max: 5,
      desc: 'Instinto de finalizador.', up: ['+8% de dano e +10% de dano crítico.'],
      apply(s, l) {
        s.might *= 1 + 0.08 * l;
        s.critMul += 0.1 * l;
      },
    },
    stamina: {
      name: 'STAMINA', type: 'passive', icon: 'stamina', max: 5,
      desc: 'Fôlego inesgotável.', up: ['+0.4 HP/s de regeneração e +5 de HP máximo.'],
      apply(s, l) {
        s.regen += 0.4 * l;
        s.maxHp += 5 * l;
      },
    },
    awakening: {
      name: 'AWAKENING', type: 'passive', icon: 'awakening', max: 5,
      desc: 'O despertar acontece no limite.', up: ['Com menos de 35% de HP: +10% de dano e +4% de velocidade.'],
      apply: (s, l) => (s.awakenLvl = l),
    },
    chemical_reaction: {
      name: 'CHEMICAL REACTION', type: 'passive', icon: 'chemical_reaction', max: 5,
      desc: 'Suas armas reagem entre si.', up: ['+2% de dano para cada habilidade ativa equipada.'],
      apply: (s, l) => (s.chemLvl = l),
    },
    two_gun: {
      name: 'TWO-GUN VOLLEY', type: 'passive', icon: 'two_gun', max: 5,
      desc: 'Dois gatilhos, um só chute.', up: ['+8% de chance de a habilidade disparar duas vezes seguidas.'],
      apply: (s, l) => (s.doubleShot += 0.08 * l),
    },
  };

  /** cartas "curinga" quando não há mais nada para evoluir */
  const FILLERS = {
    heal: { name: 'RECOVERY', icon: 'heal', text: 'Recupera 30% do HP.', apply: (g) => g.heal(g.player.stats.maxHp * 0.3) },
    flow_burst: { name: 'EGO SURGE', icon: 'flow_burst', text: '+40 de FLOW imediatamente.', apply: (g) => g.addFlow(40, true) },
    ego_points: { name: 'EGO POINTS', icon: 'ego_points', text: '+20 EGO POINTS para upgrades permanentes.', apply: (g) => (g.run.bonusEgo += 20) },
    // LIMIT BREAK: progressão infinita depois que o build está completo
    limit_dmg: { name: 'LIMIT BREAK: POWER', icon: 'finishing', limit: 'dmg', text: '+2% de dano. Acumula sem limite.' },
    limit_cd: { name: 'LIMIT BREAK: TEMPO', icon: 'perfect_control', limit: 'cd', text: '-1% de recarga de tudo. Acumula.' },
    limit_hp: { name: 'LIMIT BREAK: BODY', icon: 'iron_body', limit: 'hp', text: '+5 de HP máximo. Acumula sem limite.' },
  };
  const LIMITS = ['limit_dmg', 'limit_cd', 'limit_hp'];
  const BONUS = ['heal', 'flow_burst', 'ego_points'];

  for (const id of Object.keys(DEFS)) DEFS[id].id = id;

  const WEAPONS = Object.keys(DEFS).filter((k) => DEFS[k].type === 'weapon' && !DEFS[k].evolved);
  const PASSIVES = Object.keys(DEFS).filter((k) => DEFS[k].type === 'passive');

  function lobVolley(g, w, s, o) {
    const p = g.player;
    const range = s.range * p.stats.range;
    const list = g.nearestEnemies(p.x, p.y, range, 16);
    const r = s.radius * p.stats.area;
    U.shuffle(list);
    for (let i = 0; i < s.amount; i++) {
      let tx, ty;
      const t = list[i % Math.max(1, list.length)];
      if (t) {
        tx = t.x + (t.vx || 0) * s.dur * 0.8 + (i >= list.length ? U.rand(-30, 30) : 0);
        ty = t.y + (t.vy || 0) * s.dur * 0.8 + (i >= list.length ? U.rand(-30, 30) : 0);
      } else {
        const a = Math.random() * Math.PI * 2, d = U.rand(40, 130);
        tx = p.x + Math.cos(a) * d;
        ty = p.y + Math.sin(a) * d;
      }
      g.schedule(i * 0.1, () => {
        BL.FX.telegraph({ kind: 'circle', x: tx, y: ty, r, dur: s.dur, color: o.big ? '#ff7b1a' : '#35e0ff' });
        Pr().spawn({
          behavior: 'lob', x: p.x, y: p.y, sx: p.x, sy: p.y, tx, ty, dur: s.dur, h: s.h, t: 0, life: s.dur + 1,
          explodeR: r, explodeDmg: s.dmg, sprite: o.sprite, palette: o.palette, trail: o.trail, knock: 120, src: w.id, big: o.big,
        });
        BL.Audio.play('kick');
      });
    }
    return true;
  }

  /** PERFECT PASS: bolas-bumerangue nos rivais mais distantes dentro do alcance */
  function passVolley(g, w, s, proj) {
    const p = g.player;
    const range = s.range * p.stats.range;
    const t = g.nearestEnemies(p.x, p.y, range, s.amount, 'far');
    if (!t.length) return false;
    const sp = s.speed * p.stats.projSpd;
    for (let i = 0; i < s.amount; i++) {
      const tg = t[i % t.length];
      let a = Math.atan2(tg.y - p.y, tg.x - p.x);
      if (i >= t.length) a += Math.ceil((i - t.length + 1) / 2) * 0.35 * (i % 2 ? 1 : -1);
      Pr().spawn(
        Object.assign(
          {
            x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, behavior: 'boomerang', outT: range / sp,
            dmg: s.dmg, pierce: 999, life: (range / sp) * 2 + 1.5, r: 5, knock: 50, spinSpd: 20, src: w.id,
          },
          proj
        )
      );
    }
    p.kick(t[0].x - p.x, t[0].y - p.y);
    BL.Audio.play('kick');
    return true;
  }

  /** GODSPEED / GOD SPRINT: pós-imagens do jogador que cortam em linha */
  function afterimage(g, w, s, sprint) {
    const p = g.player;
    const len = s.len * p.stats.range;
    const t = g.nearestEnemies(p.x, p.y, len, s.amount);
    if (!t.length) return false;
    const set = BL.Sprites.chars[p.sprite];
    const speed = 640;
    const cut = (tg) => {
      const pl = g.player;
      const a = tg.dead ? Math.random() * Math.PI * 2 : Math.atan2(tg.y - pl.y, tg.x - pl.x);
      const cx = Math.cos(a), cy = Math.sin(a);
      const dir = Math.abs(cx) > Math.abs(cy) ? (cx > 0 ? 'right' : 'left') : cy > 0 ? 'down' : 'up';
      Pr().spawn({
        x: pl.x, y: pl.y, vx: cx * speed, vy: cy * speed, life: len / speed, r: 12, hidden: true,
        ghost: set[dir][BL.Sprites.POSE.dash], gx: set.ax, gy: set.ay,
        dmg: s.dmg, pierce: 999, knock: 70, stun: 0.35, src: w.id, color: '#00e5ff',
      });
      BL.FX.line(pl.x, pl.y, pl.x + cx * len, pl.y + cy * len, '#00e5ff', 0.22, sprint ? 3 : 2);
      if (sprint) {
        // rastro de energia ao longo do corte
        for (let d = 16; d < len; d += 26) g.zones.push({ kind: 'trail', x: pl.x + cx * d, y: pl.y + cy * d, r: 16, t: 1.2, max: 1.2, tickT: 0.1, dmg: 12, src: w.id });
      }
      BL.Audio.play('dash');
    };
    for (let i = 0; i < s.amount; i++) {
      const tg = t[i % t.length];
      if (i === 0) cut(tg);
      else g.schedule(i * 0.13, () => cut(tg));
    }
    return true;
  }

  // =================================================================== BUILD
  class Build {
    constructor(game) {
      this.g = game;
      this.weapons = [];
      this.passives = [];
      this.rerolls = BL.Save.metaLevel('reroll') + (game.player.char.rerolls || 0);
      this.banishes = BL.Save.metaLevel('banish');
      this.banned = new Set();
      this.limit = { dmg: 0, cd: 0, hp: 0 };
    }

    find(id) {
      return this.weapons.find((w) => w.id === id) || this.passives.find((p) => p.id === id);
    }
    level(id) {
      const f = this.find(id);
      return f ? f.level : 0;
    }

    add(id) {
      const def = DEFS[id];
      const ex = this.find(id);
      if (ex) ex.level = Math.min(def.max, ex.level + 1);
      else {
        const inst = { id, def, level: 1, cd: 0.25, cdMax: 1, uid: BL.nextId() };
        (def.type === 'weapon' ? this.weapons : this.passives).push(inst);
        BL.Save.data.codex[id] = true;
      }
      this.recalc();
    }

    evolve(fromId) {
      const w = this.find(fromId);
      if (!w || !w.def.evo) return;
      const into = w.def.evo.into;
      w.id = into;
      w.def = DEFS[into];
      w.level = 1;
      w.cd = 0.2;
      w.uid = BL.nextId();
      BL.Save.data.codex[into] = true;
      this.g.run.evolutions++;
      this.recalc();
      this.g.onEvolve(w);
    }

    recalc() {
      const p = this.g.player;
      const s = BL.BASE_STATS();
      const M = (id) => BL.Save.metaLevel(id);
      s.maxHp += 10 * M('vitality');
      s.might *= 1 + 0.05 * M('power');
      s.speed *= 1 + 0.04 * M('agility');
      s.magnet *= 1 + 0.15 * M('magnet');
      s.xpMul *= 1 + 0.06 * M('talent');
      s.regen += 0.2 * M('recovery');
      s.armor += M('armor');
      s.crit += 0.02 * M('crit');
      for (const ps of this.passives) ps.def.apply(s, ps.level);
      for (const w of this.weapons) if (w.def.apply) w.def.apply(s, w.level);
      if (p.char && p.char.apply) p.char.apply(s); // traço exclusivo do personagem
      if (s.chemLvl) s.might *= 1 + 0.02 * s.chemLvl * this.weapons.length;
      s.might *= 1 + 0.02 * this.limit.dmg;
      s.cdMul *= Math.pow(0.99, this.limit.cd);
      s.maxHp += 5 * this.limit.hp;
      s.cdMul = Math.max(0.4, s.cdMul);
      const oldMax = p.stats.maxHp;
      p.stats = s;
      if (s.maxHp > oldMax) p.hp += s.maxHp - oldMax;
      p.hp = Math.min(p.hp, s.maxHp);
    }

    update(dt) {
      const g = this.g;
      const cdm = g.cdMul();
      for (const w of this.weapons) {
        const d = w.def;
        if (d.manual) {
          w.cd = Math.max(0, g.player.dashCd);
          w.cdMax = g.player.stats.dashCd;
          continue;
        }
        w.cd -= dt;
        if (w.cd <= 0) {
          const st = d.stats(w.level);
          const ok = d.fire(g, w, st);
          w.cdMax = st.cd * cdm;
          w.cd = ok === false ? 0.12 : w.cdMax;
          // TWO-GUN VOLLEY: chance de repetir o disparo na hora
          if (ok !== false && !w.twoGun && Math.random() < g.player.stats.doubleShot) {
            w.cd = 0.14;
            w.twoGun = true;
          } else w.twoGun = false;
        }
      }
    }

    readyEvolutions() {
      return this.weapons.filter((w) => w.def.evo && w.level >= w.def.max && this.level(w.def.evo.need) >= w.def.evo.lvl);
    }

    /** gera n cartas de level up */
    offers(n) {
      n = n || 3;
      const cards = [];
      const evos = this.readyEvolutions();
      if (evos.length) {
        const w = U.pick(evos);
        const into = DEFS[w.def.evo.into];
        cards.push({ kind: 'evo', id: w.id, into: into.id, name: into.name, icon: into.icon, type: 'EVOLUTION', text: into.desc, isNew: false, level: 0 });
      }
      const pool = [];
      const ban = this.banned;
      for (const w of this.weapons) if (!w.def.evolved && w.level < w.def.max && !ban.has(w.id)) pool.push({ id: w.id, w: 3 });
      for (const p of this.passives) if (p.level < p.def.max && !ban.has(p.id)) pool.push({ id: p.id, w: 3 });
      if (this.weapons.length < BL.CFG.WEAPON_SLOTS) for (const id of WEAPONS) if (!this.find(id) && !this.isEvolvedFrom(id) && !ban.has(id)) pool.push({ id, w: 2.2 });
      if (this.passives.length < BL.CFG.PASSIVE_SLOTS) for (const id of PASSIVES) if (!this.find(id) && !ban.has(id)) pool.push({ id, w: 2 });
      // favorece passivas que completam uma evolução pendente
      for (const e of pool) {
        for (const w of this.weapons) if (w.def.evo && w.def.evo.need === e.id && this.level(e.id) < w.def.evo.lvl) e.w += 1.5;
      }
      while (cards.length < n && pool.length) {
        const pick = U.weighted(pool);
        pool.splice(pool.indexOf(pick), 1);
        const def = DEFS[pick.id];
        const cur = this.level(pick.id);
        const next = cur + 1;
        const text = def.type === 'passive' ? def.up[0] : def.up[Math.min(next, def.up.length) - 1];
        cards.push({ kind: cur ? 'up' : 'new', id: pick.id, name: def.name, icon: def.icon, type: def.type === 'weapon' ? 'SKILL' : 'PASSIVE', text: cur ? text : def.desc + (def.type === 'passive' ? ' ' + text : ''), isNew: !cur, level: next, max: def.max });
      }
      // build completo: LIMIT BREAK (acumulável) + 1 bônus
      const fill = U.shuffle(LIMITS.slice()).slice(0, 2).concat(U.shuffle(BONUS.slice()), LIMITS);
      for (let i = 0; cards.length < n; i++) {
        const id = fill[i % fill.length];
        if (cards.some((c) => c.id === id)) continue;
        const f = FILLERS[id];
        const lim = f.limit ? this.limit[f.limit] : 0;
        cards.push({ kind: 'filler', id, name: f.name, icon: f.icon, type: f.limit ? 'LIMIT BREAK' + (lim ? ' x' + lim : '') : 'BONUS', text: f.text, isNew: false, level: 0 });
      }
      return cards;
    }

    isEvolvedFrom(id) {
      return this.weapons.some((w) => w.def.evolved && Object.values(DEFS).some((d) => d.evo && d.evo.into === w.id && d.id === id));
    }

    apply(card) {
      if (card.kind === 'evo') this.evolve(card.id);
      else if (card.kind === 'filler') {
        const f = FILLERS[card.id];
        if (f.limit) {
          this.limit[f.limit]++;
          this.recalc();
        } else f.apply(this.g);
      } else this.add(card.id);
    }

    /** descarta uma carta: ela não aparece mais nesta partida */
    banish(card) {
      if (this.banishes <= 0 || (card.kind !== 'new' && card.kind !== 'up')) return false;
      this.banishes--;
      this.banned.add(card.id);
      return true;
    }
  }

  BL.Abilities = { DEFS, FILLERS, WEAPONS, PASSIVES, Build };
})();
