'use strict';
/* =========================================================================
 * player.js — o atacante controlado pelo jogador: movimento em 8
 * direções com aceleração suave, dash (drible), animações, i-frames.
 * ========================================================================= */
(function () {
  const BL = window.BL;
  const U = BL.U;

  const BASE_STATS = () => ({
    maxHp: 100,
    speed: 92,
    magnet: 34,
    regen: 0,
    armor: 0,
    might: 1,
    cdMul: 1,
    area: 1,
    range: 1,
    projSpd: 1,
    xpMul: 1,
    crit: 0.05,
    critMul: 1.8,
    lowHpDmg: 0,
    egoLvl: 0,
    flowGain: 1,
    flowDur: 8,
    flowPower: 1,
    dashCd: 2.1,
    dashLen: 1,
    dashDmg: 0,
    markBonus: 0,
    comboDmg: 0, // dano por ponto de combo (traço do Loki)
    awakenLvl: 0,
    chemLvl: 0,
    doubleShot: 0,
  });
  BL.BASE_STATS = BASE_STATS;

  class Player {
    constructor(x, y, charId) {
      this.char = BL.Characters.get(charId);
      this.sprite = 'p_' + this.char.id;
      this.x = x;
      this.y = y;
      this.r = 6;
      this.vx = 0;
      this.vy = 0;
      this.stats = BASE_STATS();
      this.hp = this.stats.maxHp;
      this.dir = 'down';
      this.faceX = 0;
      this.faceY = 1;
      this.moving = false;
      this.animT = 0;
      this.kickT = 0;
      this.kickDir = 'down';
      this.dashT = 0;
      this.dashCd = 0;
      this.dashX = 0;
      this.dashY = 0;
      this.dashHit = new Set();
      this.dashStartX = 0;
      this.dashStartY = 0;
      this.iframes = 0;
      this.hurtT = 0;
      this.ghostT = 0;
      this.trailT = 0;
      this.sortY = y;
      this.dead = false;
    }

    canBeHit() {
      return this.iframes <= 0 && this.dashT <= 0 && !this.dead;
    }

    get dashMax() {
      return this.stats.dashCd;
    }

    /** chamado pelas armas ao chutar: ativa a animação de chute */
    kick(dx, dy) {
      this.kickT = 0.14;
      this.kickDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    }

    tryDash(game) {
      if (this.dashCd > 0 || this.dashT > 0 || this.dead) return;
      const mv = BL.Input.move;
      let dx = mv.x, dy = mv.y;
      if (!dx && !dy) {
        dx = this.faceX;
        dy = this.faceY;
      }
      const l = Math.hypot(dx, dy) || 1;
      this.dashX = dx / l;
      this.dashY = dy / l;
      this.dashT = 0.17 * this.stats.dashLen;
      this.dashCd = this.stats.dashCd * game.cdMulFlow();
      this.dashHit.clear();
      this.dashStartX = this.x;
      this.dashStartY = this.y;
      BL.Audio.play('dash');
      BL.FX.burst(this.x, this.y + 7, 8, ['#c8d0e8', '#9aa4c4'], 20, 60, 0.2, 0.4, 1, 3, { angle: Math.atan2(-this.dashY, -this.dashX), spread: 0.8 });
      game.onDash(this);
    }

    update(dt, game) {
      const s = this.stats;
      const mv = BL.Input.getMove();
      this.moving = mv.x !== 0 || mv.y !== 0;
      const spd = s.speed * game.speedMul();

      if (this.dashT > 0) {
        this.dashT -= dt;
        const ds = 330 * (0.9 + 0.1 * s.dashLen);
        this.vx = this.dashX * ds;
        this.vy = this.dashY * ds;
        this.ghostT -= dt;
        if (this.ghostT <= 0) {
          this.ghostT = 0.025;
          const img = this.currentFrame();
          const set = BL.Sprites.chars[this.sprite];
          BL.FX.ghost(game.flowT > 0 ? set['f' + this.dir][5] : img, this.x - set.ax, this.y - set.ay, 0.25, 0.55);
        }
        game.dashStep(this);
        if (this.dashT <= 0) game.onDashEnd(this);
      } else {
        const tx = mv.x * spd, ty = mv.y * spd;
        // aceleração suave, frenagem mais rápida
        const rate = this.moving ? 16 : 22;
        this.vx = U.damp(this.vx, tx, rate, dt);
        this.vy = U.damp(this.vy, ty, rate, dt);
      }

      this.x += this.vx * dt;
      this.y += this.vy * dt;
      BL.Collision.resolve(game.map, this);

      if (this.moving) {
        this.faceX = mv.x;
        this.faceY = mv.y;
        if (Math.abs(mv.x) > Math.abs(mv.y) * 0.9) this.dir = mv.x > 0 ? 'right' : 'left';
        else this.dir = mv.y > 0 ? 'down' : 'up';
      }
      const v = Math.hypot(this.vx, this.vy);
      this.animT += dt * (v / 9);

      // rastro de velocidade quando rápido (combo alto / flow)
      if (v > 120 && this.dashT <= 0) {
        this.trailT -= dt;
        if (this.trailT <= 0) {
          this.trailT = 0.05;
          BL.FX.spawn(this.x + U.rand(-3, 3), this.y + U.rand(-4, 6), -this.vx * 0.2, -this.vy * 0.2, 0.3, 2, game.flowT > 0 ? '#35e0ff' : '#9aa4c4', 5);
        }
      }

      if (this.kickT > 0) this.kickT -= dt;
      if (this.dashCd > 0) this.dashCd -= dt;
      if (this.iframes > 0) this.iframes -= dt;
      if (this.hurtT > 0) this.hurtT -= dt;
      if (s.regen > 0 && this.hp < s.maxHp) this.hp = Math.min(s.maxHp, this.hp + s.regen * dt);
      this.sortY = this.y;
    }

    currentFrame(flash) {
      const set = BL.Sprites.chars[this.sprite];
      const P = BL.Sprites.POSE;
      let dir = this.dir, idx;
      if (this.dashT > 0) idx = P.dash;
      else if (this.kickT > 0) {
        idx = P.kick;
        dir = this.kickDir;
      } else if (this.moving) idx = Math.floor(this.animT) % 4;
      else idx = 0;
      return set[(flash ? 'f' : '') + dir][idx];
    }

    draw(ctx, game) {
      const x = Math.round(this.x), y = Math.round(this.y);
      const S = BL.Sprites;
      // aura de flow
      if (game.flowT > 0) {
        const t = game.time;
        ctx.globalAlpha = 0.28 + Math.sin(t * 20) * 0.08;
        ctx.fillStyle = '#1e90ff';
        ctx.beginPath();
        ctx.ellipse(x, y - 2, 15 + Math.sin(t * 13) * 1.5, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (Math.random() < 0.7) BL.FX.spawn(x + U.rand(-8, 8), y + U.rand(-2, 10), U.rand(-8, 8), U.rand(-70, -30), 0.45, U.randInt(1, 3), U.pick(['#35e0ff', '#1e90ff', '#ffffff']), 1, 0, true);
      }
      if (game.egoActive) {
        ctx.globalAlpha = 0.22 + Math.sin(game.time * 16) * 0.06;
        ctx.fillStyle = '#b061ff';
        ctx.beginPath();
        ctx.ellipse(x, y + 6, 15, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (Math.random() < 0.3) BL.FX.spawn(x + U.rand(-9, 9), y + 8, 0, U.rand(-50, -20), 0.4, 2, U.pick(['#b061ff', '#ff2d55']), 1);
      }
      const set = S.chars[this.sprite];
      ctx.drawImage(S.misc.shadow, x - 7, y + set.feet - 2);
      // pisca durante invencibilidade
      if (this.iframes > 0 && this.dashT <= 0 && Math.floor(this.iframes * 20) % 2 === 0) return;
      const img = this.currentFrame(this.hurtT > 0.12);
      ctx.drawImage(img, x - set.ax, y - set.ay);
      // olhos brilhando no flow (herói visto de frente, parado ou correndo)
      if (game.flowT > 0 && this.dir === 'down' && this.dashT <= 0 && this.kickT <= 0) {
        const bob = this.moving && Math.floor(this.animT) % 2 === 1 ? -1 : 0;
        ctx.fillStyle = '#9ff4ff';
        ctx.fillRect(x - 4, y - 8 + bob, 2, 1);
        ctx.fillRect(x + 2, y - 8 + bob, 2, 1);
      }
    }
  }

  BL.Player = Player;
})();
