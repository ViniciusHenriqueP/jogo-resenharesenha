'use strict';
/* =========================================================================
 * input.js — teclado (WASD/setas), mouse e controles touch
 * (joystick virtual à esquerda, botões FLOW/DASH à direita).
 * ========================================================================= */
(function () {
  const BL = window.BL;
  const U = BL.U;

  const I = (BL.Input = {
    keys: new Set(),
    pressed: new Set(), // teclas pressionadas neste frame (consumidas pelo jogo)
    mouse: { x: 0, y: 0, active: false },
    joy: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 },
    touchMode: false,
    move: { x: 0, y: 0 },

    init(canvas) {
      window.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        // teclado em uso: esconde os controles de toque (notebooks com tela touch)
        if (this.touchMode && ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) this.setTouchMode(false);
        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
        if (!this.keys.has(k)) this.pressed.add(k);
        this.keys.add(k);
        BL.Audio.init();
      });
      window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
      window.addEventListener('blur', () => {
        this.keys.clear();
        this.joy.active = false;
      });
      canvas.addEventListener('mousemove', (e) => {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
        this.mouse.active = true;
      });

      this.touchMode = BL.CFG.MOBILE;
      window.addEventListener('touchstart', () => this.touchMode || this.setTouchMode(true), { passive: true });
      // evita menu de contexto / seleção em toque longo
      window.addEventListener('contextmenu', (e) => {
        if (this.touchMode) e.preventDefault();
      });
      const zone = document.getElementById('joy-zone');
      const base = document.getElementById('joy-base');
      const knob = document.getElementById('joy-knob');
      // sensibilidade menor = precisa arrastar o dedo mais longe para a velocidade máxima
      const KNOB = 52;
      const radius = () => KNOB / U.clamp(BL.Save.data.settings.joySens || 1, 0.4, 1);
      const place = () => {
        base.style.left = this.joy.ox + 'px';
        base.style.top = this.joy.oy + 'px';
      };
      // posição de repouso: joystick visível no canto inferior esquerdo
      const rest = () => {
        if (this.joy.active) return;
        this.joy.ox = Math.min(110, window.innerWidth * 0.22);
        this.joy.oy = window.innerHeight - Math.min(130, window.innerHeight * 0.2);
        place();
        knob.style.transform = 'translate(-50%,-50%)';
      };
      rest();
      window.addEventListener('resize', rest);
      zone.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          BL.Audio.init();
          if (!this.touchMode) this.setTouchMode(true);
          if (this.joy.active) return;
          const t = e.changedTouches[0];
          this.joy.active = true;
          this.joy.id = t.identifier;
          this.joy.ox = t.clientX;
          this.joy.oy = t.clientY;
          this.joy.x = this.joy.y = 0;
          place();
          base.classList.add('on');
          knob.style.transform = 'translate(-50%,-50%)';
        },
        { passive: false }
      );
      const moveT = (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier !== this.joy.id) continue;
          e.preventDefault();
          const R = radius();
          let dx = t.clientX - this.joy.ox, dy = t.clientY - this.joy.oy;
          const d = Math.hypot(dx, dy);
          if (d > R) {
            // joystick "segue" o dedo quando passa do limite
            this.joy.ox += (dx / d) * (d - R);
            this.joy.oy += (dy / d) * (d - R);
            dx = (dx / d) * R;
            dy = (dy / d) * R;
            place();
          }
          this.joy.x = dx / R;
          this.joy.y = dy / R;
          const kv = KNOB / R; // o botão visual continua dentro da base
          knob.style.transform = `translate(calc(-50% + ${dx * kv}px), calc(-50% + ${dy * kv}px))`;
        }
      };
      const endT = (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier !== this.joy.id) continue;
          this.joy.active = false;
          this.joy.id = null;
          this.joy.x = this.joy.y = 0;
          base.classList.remove('on');
          rest();
        }
      };
      zone.addEventListener('touchmove', moveT, { passive: false });
      zone.addEventListener('touchend', endT);
      zone.addEventListener('touchcancel', endT);

      const bindBtn = (id, key) => {
        const el = document.getElementById(id);
        const down = (e) => {
          e.preventDefault();
          BL.Audio.init();
          this.pressed.add(key);
          el.classList.add('down');
        };
        const up = () => el.classList.remove('down');
        el.addEventListener('touchstart', (e) => {
          down(e);
          this.vibrate(12);
        }, { passive: false });
        el.addEventListener('mousedown', down);
        el.addEventListener('touchend', up);
        el.addEventListener('mouseup', up);
        el.addEventListener('mouseleave', up);
      };
      bindBtn('btn-flow', 'f');
      bindBtn('btn-dash', ' ');
      bindBtn('btn-pause', 'escape');
    },

    setTouchMode(on) {
      this.touchMode = on;
      document.body.classList.toggle('touch', on);
      const g = BL.game;
      if (g) document.getElementById('touch-ui').classList.toggle('hidden', !(on && g.state === 'playing'));
    },

    /** vibração curta (Android); ignorada onde não existe */
    vibrate(pattern) {
      if (!this.touchMode || !BL.Save.data.settings.vibration || !navigator.vibrate) return;
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        /* sem suporte */
      }
    },

    down(...ks) {
      for (const k of ks) if (this.keys.has(k)) return true;
      return false;
    },
    /** consome um "pressionar" (retorna true apenas uma vez por toque) */
    hit(...ks) {
      let r = false;
      for (const k of ks)
        if (this.pressed.has(k)) {
          this.pressed.delete(k);
          r = true;
        }
      return r;
    },
    endFrame() {
      this.pressed.clear();
    },

    getMove() {
      let x = 0, y = 0;
      if (this.down('a', 'arrowleft')) x -= 1;
      if (this.down('d', 'arrowright')) x += 1;
      if (this.down('w', 'arrowup')) y -= 1;
      if (this.down('s', 'arrowdown')) y += 1;
      if (this.joy.active && (Math.abs(this.joy.x) > 0.12 || Math.abs(this.joy.y) > 0.12)) {
        x = this.joy.x;
        y = this.joy.y;
      }
      const l = Math.hypot(x, y);
      if (l > 1) {
        x /= l;
        y /= l;
      }
      this.move.x = x;
      this.move.y = y;
      return this.move;
    },
  });
})();
