'use strict';
/* =========================================================================
 * ui.js — HUD e telas em DOM (menu, how to play, upgrades, settings,
 * level up, pause, game over, banners). O HUD só escreve no DOM quando
 * um valor muda, para não pesar no frame.
 * ========================================================================= */
(function () {
  const BL = window.BL;
  const U = BL.U;
  const $ = (id) => document.getElementById(id);

  function setText(el, v) {
    if (el._v !== v) {
      el._v = v;
      el.textContent = v;
    }
  }
  function setW(el, pct) {
    const v = Math.round(U.clamp(pct, 0, 1) * 400) / 4;
    if (el._w !== v) {
      el._w = v;
      el.style.width = v + '%';
    }
  }
  function setH(el, pct) {
    const v = Math.round(U.clamp(pct, 0, 1) * 100);
    if (el._h !== v) {
      el._h = v;
      el.style.height = v + '%';
    }
  }
  function toggle(el, cls, on) {
    if (el['_' + cls] !== on) {
      el['_' + cls] = on;
      el.classList.toggle(cls, on);
    }
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const icon = (key, cls) => `<img class="${cls || 'ico'}" src="${BL.Sprites.iconURLs[key] || ''}" alt="">`;

  const UI = (BL.UI = {
    game: null,
    screen: 'menu',
    settingsReturn: 'menu',
    runOpts: { mode: 'endless' }, // modo escolhido no menu (infinito / capítulo da história)
    introBack: 'select',
    upTab: 'shop',
    slotEls: [],
    fpsT: 0,
    frames: 0,

    init(game) {
      this.game = game;
      document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-act]');
        if (!el) return;
        BL.Audio.init();
        BL.Audio.play('click');
        this.action(el.dataset.act, el);
      });
      this.buildSettings();
      document.body.classList.toggle('touch', BL.Input.touchMode);
      this.showScreen('menu');
      this.updateMenuFoot();
    },

    action(act, el) {
      const g = this.game;
      switch (act) {
        case 'play':
          this.runOpts = { mode: 'endless' };
          this.openSelect();
          break;
        case 'story':
          this.showScreen('story');
          this.renderStory();
          break;
        case 'chapter':
          if (!BL.Story.isOpen(+el.dataset.i)) return;
          this.runOpts = { mode: 'story', chapter: +el.dataset.i };
          this.openSelect();
          break;
        case 'pick':
          if (this.selected === el.dataset.id) return this.action('start');
          this.selected = el.dataset.id;
          this.renderSelect();
          break;
        case 'start':
          if (!BL.Save.isUnlocked(BL.Characters.get(this.selected))) return;
          if (this.runOpts.mode === 'story') this.showIntro('select');
          else this.launch();
          break;
        case 'begin':
          this.launch();
          break;
        case 'next':
          // tela de vitória -> próximo capítulo com o mesmo personagem
          this.runOpts = { mode: 'story', chapter: g.chapter.index + 1 };
          this.selected = BL.Save.data.character;
          this.showIntro('menu');
          break;
        case 'skip':
          g.skipWave();
          if (el && el.blur) el.blur(); // senão o ESPAÇO (dash) "clica" no botão de novo
          break;
        case 'banish':
          g.toggleBanish();
          break;
        case 'fullscreen':
          if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
          else this.enterFullscreen(true);
          break;
        case 'howto':
        case 'upgrades':
          this.showScreen(act);
          if (act === 'upgrades') this.renderUpgrades();
          break;
        case 'settings':
          this.settingsReturn = g.state === 'paused' ? 'pause' : 'menu';
          if (g.state === 'paused') $('pause').classList.add('hidden');
          this.showScreen('settings');
          break;
        case 'back':
          if (this.screen === 'settings' && this.settingsReturn === 'pause') {
            $('settings').classList.add('hidden');
            $('pause').classList.remove('hidden');
            this.screen = 'pause';
          } else if (this.screen === 'select' && this.runOpts.mode === 'story') {
            this.showScreen('story');
            this.renderStory();
          } else if (this.screen === 'intro' && this.introBack === 'select') this.openSelect();
          else if (this.screen === 'intro') {
            this.hideAllScreens();
            g.toMenu();
          } else this.showScreen('menu');
          break;
        case 'tab':
          this.upTab = el.dataset.tab;
          this.renderUpgrades();
          break;
        case 'buy':
          if (BL.Save.buyMeta(el.dataset.id)) BL.Audio.play('select');
          this.renderUpgrades();
          break;
        case 'resume':
          g.resume();
          break;
        case 'quit':
        case 'menu':
          this.hideAllScreens();
          g.toMenu();
          break;
        case 'retry':
          this.enterFullscreen();
          this.hideAllScreens();
          g.newRun();
          break;
        case 'card':
          g.chooseCard(+el.dataset.i);
          break;
        case 'reroll':
          g.reroll();
          break;
        case 'reset':
          if (el.dataset.confirm) {
            BL.Save.reset();
            el.textContent = 'PROGRESSO APAGADO';
            delete el.dataset.confirm;
          } else {
            el.dataset.confirm = '1';
            el.textContent = 'CLIQUE DE NOVO PARA CONFIRMAR';
          }
          break;
      }
    },

    /** tela cheia no celular (precisa ser chamado dentro de um toque/clique) */
    enterFullscreen(force) {
      if (!force && !(BL.Input.touchMode && BL.Save.data.settings.fullscreen)) return;
      const el = document.documentElement;
      if (document.fullscreenElement || document.webkitFullscreenElement) return;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!req) return; // iPhone: use "Adicionar à Tela de Início"
      try {
        const p = req.call(el, { navigationUI: 'hide' });
        if (p && p.catch) p.catch(() => {});
      } catch (e) {
        /* navegador recusou */
      }
    },

    hideAllScreens() {
      for (const id of ['menu', 'select', 'story', 'intro', 'howto', 'upgrades', 'settings', 'levelup', 'pause', 'gameover']) $(id).classList.add('hidden');
      clearInterval(this.portraitTimer);
    },

    // ============================================== SELEÇÃO DE PERSONAGEM
    openSelect() {
      this.selected = BL.Save.data.character;
      this.showScreen('select');
      this.renderSelect();
    },
    launch() {
      this.enterFullscreen();
      this.hideAllScreens();
      this.game.newRun(this.selected, this.runOpts);
    },

    /** fileira de personagens + painel de detalhes do selecionado */
    renderSelect() {
      const D = BL.Abilities.DEFS;
      const P = BL.Sprites.portraits;
      const cur = this.selected;
      const c = BL.Characters.get(cur);
      const open = (ch) => BL.Save.isUnlocked(ch);
      const ro = this.runOpts;
      $('select-mode').textContent = ro.mode === 'story' ? 'STORY MODE · CHAPTER ' + (ro.chapter + 1) + ' · ' + BL.Story.chapters[ro.chapter].name : 'ENDLESS MODE';
      $('char-list').innerHTML = BL.Characters.list
        .map(
          (ch, i) => `<button class="char ${ch.id === cur ? 'on' : ''} ${open(ch) ? '' : 'locked'}" data-act="pick" data-id="${ch.id}" style="--cc:${ch.color}">
            <div class="ch-key">${BL.Input.touchMode ? '' : '[' + (i + 1) + ']'}</div>
            <div class="portrait"><img src="${open(ch) ? P[ch.id][0] : BL.Sprites.portraitsLocked[ch.id]}" data-id="${ch.id}" alt=""></div>
            <div class="ch-name">${esc(ch.short)}</div>
          </button>`
        )
        .join('');
      const det = $('char-detail');
      det.style.setProperty('--cc', c.color);
      if (open(c)) {
        const bar = (label, v) => `<div class="cbar"><span>${label}</span>${Array.from({ length: 5 }, (_, k) => `<i class="${k < v ? 'on' : ''}"></i>`).join('')}</div>`;
        det.innerHTML = `<div class="cd-head"><div class="ch-name">${esc(c.name)}</div><div class="ch-title">${esc(c.title)}</div></div>
          <div class="ch-start">${c.start.map(([id, l]) => `<div>${icon(D[id].icon)}<span>${esc(D[id].name)}${l > 1 ? ' ' + U.roman(l) : ''}</span></div>`).join('')}</div>
          <div class="ch-trait"><b>${esc(c.trait.name)}</b><span>${esc(c.trait.desc)}</span></div>
          <div class="ch-bars">${bar('SPD', c.bars.spd)}${bar('DMG', c.bars.dmg)}${bar('HP', c.bars.hp)}${bar('TEC', c.bars.tec)}</div>`;
      } else {
        const wave = (BL.bossIndex(c.unlock.boss) + 1) * BL.CFG.BOSS_EVERY;
        det.innerHTML = `<div class="cd-lock"><b>LOCKED</b><span>Derrote <em>${esc(c.name)}</em> no <em>ENDLESS MODE</em> (boss da wave ${wave}) para jogar com ele.</span></div>`;
      }
      $('start-btn').classList.toggle('disabled', !open(c));
      // o personagem selecionado "corre" no lugar
      clearInterval(this.portraitTimer);
      if (!open(c)) return;
      let f = 0;
      const img = document.querySelector(`#char-list img[data-id="${cur}"]`);
      this.portraitTimer = setInterval(() => {
        f = (f + 1) % 4;
        if (img) img.src = P[cur][f];
      }, 140);
    },

    // ======================================================= MODO HISTÓRIA
    renderStory() {
      const St = BL.Story;
      $('story-list').innerHTML = `<div class="chapters">${St.chapters
        .map((c, i) => {
          const open = St.isOpen(i), done = St.isCleared(i);
          return `<button class="chapter ${open ? '' : 'locked'} ${done ? 'done' : ''}" data-act="chapter" data-i="${i}">
            <div class="cp-n">${done ? '★' : U.pad2(i + 1)}</div>
            <div class="cp-main"><b>${esc(c.name)}</b><span class="cp-sub">${esc(c.sub)}</span><span>${esc(open ? c.goal : 'Conclua o capítulo anterior para liberar.')}</span></div>
            <div class="cp-side"><span>${c.waves} WAVES</span><b>${done ? 'CLEARED' : open ? '+' + c.reward + ' EP' : 'LOCKED'}</b></div>
          </button>`;
        })
        .join('')}</div>`;
    },
    /** abertura do capítulo; back = para onde o BACK volta ('select' | 'menu') */
    showIntro(back) {
      const c = BL.Story.chapters[this.runOpts.chapter];
      this.introBack = back;
      $('intro-chapter').textContent = 'CHAPTER ' + (c.index + 1) + ' · ' + c.sub;
      $('intro-title').textContent = c.name;
      $('intro-lines').innerHTML = c.intro.map((l, i) => `<p style="--d:${i * 0.45}s"><b>EGO</b>${esc(l)}</p>`).join('');
      $('intro-goal').innerHTML = `<em>GOAL</em><b>${esc(c.goal)}</b>${c.startLevels ? `<span>Você começa com ${c.startLevels} cartas de bônus.</span>` : ''}`;
      this.showScreen('intro');
    },
    selectStep(d) {
      const L = BL.Characters.list;
      const i = L.findIndex((c) => c.id === this.selected);
      this.selected = L[(i + d + L.length) % L.length].id;
      BL.Audio.play('click');
      this.renderSelect();
    },
    showScreen(id) {
      this.hideAllScreens();
      $(id).classList.remove('hidden');
      this.screen = id;
      if (id === 'menu') this.updateMenuFoot();
    },
    updateMenuFoot() {
      const s = BL.Save.data.stats;
      $('menu-foot').innerHTML = s.totalRuns
        ? `BEST WAVE <b>${s.bestWave}</b> · BEST COMBO <b>${s.bestCombo}</b> · EGO POINTS <b>${BL.Save.data.ego}</b>`
        : 'Sobreviva. Evolua. Torne-se o <b>melhor atacante do mundo</b>.';
    },

    toMenu() {
      $('hud').classList.add('hidden');
      $('touch-ui').classList.add('hidden');
      $('boss-bar').classList.add('hidden');
      $('banner-layer').innerHTML = '';
      document.body.classList.remove('flow-on');
      this.showScreen('menu');
    },

    // ================================================================= HUD
    onRunStart(g) {
      $('hud').classList.remove('hidden');
      $('hud-name').textContent = g.player.char.short;
      $('hud-name').style.color = g.player.char.color;
      $('boss-bar').classList.add('hidden');
      $('banner-layer').innerHTML = '';
      $('touch-ui').classList.toggle('hidden', !BL.Input.touchMode);
      $('fps').classList.toggle('hidden', !BL.Save.data.settings.showFps);
      document.body.classList.remove('flow-on');
      this.refreshSlots(g);
    },

    refreshSlots(g) {
      const wrap = $('slots');
      wrap.innerHTML = '';
      this.slotEls = [];
      g.build.weapons.forEach((w, i) => {
        const d = document.createElement('div');
        d.className = 'slot' + (w.def.evolved ? ' evo' : '');
        d.title = w.def.name;
        d.innerHTML = `${icon(w.def.icon)}<div class="cd"></div><span class="k">${i + 1}</span><span class="lv">${w.def.evolved ? '★' : U.roman(w.level)}</span><span class="nm">${esc(w.def.name)}</span>`;
        wrap.appendChild(d);
        this.slotEls.push({ w, cd: d.querySelector('.cd'), el: d });
      });
      // dash sempre visível
      const d = document.createElement('div');
      d.className = 'slot dash';
      d.innerHTML = `${icon('dribble')}<div class="cd"></div><span class="k">${BL.Input.touchMode ? '' : 'SPC'}</span><span class="nm">DASH</span>`;
      wrap.appendChild(d);
      this.dashEl = d.querySelector('.cd');
      const ps = $('passives');
      ps.innerHTML = g.build.passives.map((p) => `<div class="pslot" title="${esc(p.def.name)}">${icon(p.def.icon)}<span>${U.roman(p.level)}</span></div>`).join('');
    },

    updateHUD(g) {
      const p = g.player;
      setText($('hud-level'), 'LEVEL ' + g.level);
      setW($('hp-fill'), p.hp / p.stats.maxHp);
      setText($('hp-text'), Math.ceil(p.hp) + '/' + Math.round(p.stats.maxHp));
      toggle($('hud-player'), 'low', p.hp / p.stats.maxHp < 0.3);
      setW($('xp-fill'), g.xp / g.xpNeed);
      const wv = g.waves;
      setText($('wave-text'), 'WAVE ' + U.pad2(wv.wave) + (g.chapter ? '/' + U.pad2(wv.cfg.total) : ''));
      toggle($('skip-btn'), 'hidden', !!g.dying || g.cleared || !wv.canSkip());
      const tl = wv.timeLeft <= 0 && (wv.bossAlive || wv.bossPending > 0) ? 'DEFEAT THE BOSS' : 'TIME ' + U.pad2(Math.ceil(wv.timeLeft));
      setText($('time-text'), tl);
      toggle($('hud-wave'), 'boss', !!g.boss);
      setText($('kills-text'), 'KILLS ' + g.kills);

      // combo
      const cb = $('combo');
      toggle(cb, 'hidden', g.combo < 2);
      if (g.combo >= 2) {
        setText($('combo-n'), 'x' + U.pad2(g.combo));
        setW($('combo-fill'), g.comboT > 0 ? g.comboT / 2.6 : 0);
        const tier = g.combo >= 100 ? 't4' : g.combo >= 50 ? 't3' : g.combo >= 25 ? 't2' : g.combo >= 10 ? 't1' : 't0';
        if (cb._tier !== tier) {
          cb.classList.remove('t0', 't1', 't2', 't3', 't4');
          cb.classList.add(tier);
          cb._tier = tier;
        }
        if (cb._last !== g.combo) {
          cb._last = g.combo;
          cb.classList.remove('bump');
          void cb.offsetWidth;
          cb.classList.add('bump');
        }
      }

      // flow
      const fw = $('flow-wrap');
      if (g.flowT > 0) setW($('flow-fill'), g.flowT / g.flowMax);
      else setW($('flow-fill'), g.flow / 100);
      toggle(fw, 'ready', g.flow >= 100 && g.flowT <= 0);
      toggle(fw, 'active', g.flowT > 0);
      toggle($('btn-flow'), 'ready', g.flow >= 100 && g.flowT <= 0);
      if (BL.Input.touchMode) {
        // anel de carga do FLOW e de recarga do DASH nos botões de toque
        const fl = Math.round((g.flowT > 0 ? g.flowT / g.flowMax : g.flow / 100) * 50) / 50;
        const bf = $('btn-flow');
        if (bf._f !== fl) {
          bf._f = fl;
          bf.style.setProperty('--p', fl);
        }
        const dc = Math.round((p.dashCd > 0 ? 1 - p.dashCd / p.stats.dashCd : 1) * 50) / 50;
        const bd = $('btn-dash');
        if (bd._f !== dc) {
          bd._f = dc;
          bd.style.setProperty('--p', dc);
          bd.classList.toggle('cooling', dc < 1);
        }
      }

      // cooldowns
      for (const s of this.slotEls) setH(s.cd, s.w.cdMax > 0 ? s.w.cd / s.w.cdMax : 0);
      if (this.dashEl) setH(this.dashEl, p.dashCd > 0 ? p.dashCd / p.stats.dashCd : 0);

      // boss
      if (g.boss) setW($('boss-fill'), g.boss.hp / g.boss.maxHp);

      if (BL.Save.data.settings.showFps) setText($('fps'), (BL.fps || 0) + ' FPS · ' + g.enemies.length + ' EN');
    },

    setFlowMode(on) {
      document.body.classList.toggle('flow-on', on);
    },

    showBoss(e) {
      $('boss-name').innerHTML = `<b>${esc(e.displayName)}</b><span>${esc(e.boss.title)}</span>`;
      $('boss-bar').style.setProperty('--bc', e.boss.color);
      $('boss-bar').classList.remove('hidden');
    },
    hideBoss() {
      $('boss-bar').classList.add('hidden');
    },

    banner(text, style, sub) {
      const layer = $('banner-layer');
      const old = layer.querySelector('.banner.' + style);
      if (old) old.remove();
      const d = document.createElement('div');
      d.className = 'banner ' + (style || 'wave');
      d.innerHTML = `<div class="bt">${esc(text)}</div>${sub ? `<div class="bs">${esc(sub)}</div>` : ''}`;
      layer.appendChild(d);
      d.addEventListener('animationend', () => d.remove());
    },

    // ============================================================ LEVEL UP
    /** keep = só redesenha (modo BANISH ligado/desligado), sem reanimar as cartas */
    showLevelUp(g, keep) {
      const el = $('levelup');
      el.classList.remove('hidden');
      $('touch-ui').classList.add('hidden');
      const cards = $('cards');
      cards.classList.toggle('banish', g.banishMode);
      cards.innerHTML = g.cards
        .map((c, i) => {
          let lvl = '';
          if (c.kind === 'new') lvl = '<span class="new">NEW!</span>';
          else if (c.kind === 'up') lvl = `LV ${U.roman(c.level - 1)} → <b>${U.roman(c.level)}</b>`;
          else if (c.kind === 'evo') lvl = '<span class="evo-tag">★ EVOLUÇÃO ★</span>';
          const pips = c.max ? `<div class="pips">${Array.from({ length: c.max }, (_, k) => `<i class="${k < c.level ? 'on' : ''}"></i>`).join('')}</div>` : '';
          return `<button class="card ${c.kind} ${keep ? 'still' : 'locked'}" data-act="card" data-i="${i}" style="--d:${i * 70}ms">
            <div class="ctype">${c.type}</div>
            <div class="cicon">${icon(c.icon)}</div>
            <div class="cname">${esc(c.name)}</div>
            <div class="clvl">${lvl}</div>
            ${pips}
            <div class="ctext">${esc(c.text)}</div>
            <div class="ckey">${BL.Input.touchMode ? '' : '[' + (i + 1) + ']'}</div>
          </button>`;
        })
        .join('');
      // evita clique acidental logo que as cartas aparecem
      setTimeout(() => cards.querySelectorAll('.card').forEach((c) => c.classList.remove('locked')), 350);
      const rb = $('reroll-btn');
      rb.classList.toggle('hidden', g.build.rerolls <= 0);
      rb.textContent = `REROLL (${g.build.rerolls}) [R]`;
      const bb = $('banish-btn');
      bb.classList.toggle('hidden', g.build.banishes <= 0);
      bb.classList.toggle('on', g.banishMode);
      bb.textContent = g.banishMode ? 'PICK A CARD TO BANISH' : `BANISH (${g.build.banishes}) [B]`;
      $('lu-build').innerHTML = this.buildIcons(g.build);
      // modo história: cartas de bônus antes da primeira wave
      const free = g.freePicks > 0;
      $('lu-title').textContent = free ? 'EGO TRAINING' : 'LEVEL UP!';
      $('lu-level').textContent = free ? g.freePicks + (g.freePicks > 1 ? ' BONUS CARDS' : ' BONUS CARD') : 'LEVEL ' + (g.level - g.pendingLevels + 1);
    },
    hideLevelUp() {
      $('levelup').classList.add('hidden');
      if (BL.Input.touchMode) $('touch-ui').classList.remove('hidden');
    },

    buildIcons(b) {
      return (
        b.weapons.map((w) => `<span class="bi ${w.def.evolved ? 'evo' : ''}" title="${esc(w.def.name)}">${icon(w.def.icon)}<i>${w.def.evolved ? '★' : U.roman(w.level)}</i></span>`).join('') +
        '<span class="sep"></span>' +
        b.passives.map((p) => `<span class="bi" title="${esc(p.def.name)}">${icon(p.def.icon)}<i>${U.roman(p.level)}</i></span>`).join('')
      );
    },

    // =============================================================== PAUSE
    showPause(g) {
      const s = g.player.stats;
      $('pause-build').innerHTML = this.buildIcons(g.build);
      const pct = (v) => (v >= 0 ? '+' : '') + Math.round(v * 100) + '%';
      $('pause-stats').innerHTML = [
        ['HP', Math.ceil(g.player.hp) + '/' + Math.round(s.maxHp)],
        ['DANO', pct(s.might - 1)],
        ['VELOC.', pct(s.speed / 92 - 1)],
        ['RECARGA', pct(1 - s.cdMul)],
        ['ÁREA', pct(s.area - 1)],
        ['ALCANCE', pct(s.range - 1)],
        ['CRÍTICO', Math.round(s.crit * 100) + '%'],
        ['ARMADURA', s.armor],
        ['REGEN', s.regen.toFixed(1) + '/s'],
        ['COLETA', Math.round(s.magnet) + 'px'],
      ]
        .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`)
        .join('');
      $('pause').classList.remove('hidden');
      $('touch-ui').classList.add('hidden');
      this.screen = 'pause';
    },
    hidePause() {
      $('pause').classList.add('hidden');
      $('settings').classList.add('hidden');
      if (BL.Input.touchMode) $('touch-ui').classList.remove('hidden');
      this.screen = 'game';
    },

    // =========================================================== GAME OVER
    showGameOver(r) {
      $('touch-ui').classList.add('hidden');
      $('boss-bar').classList.add('hidden');
      const rec = (k) => (r.rec[k] ? '<em>NEW RECORD!</em>' : '');
      const next = r.victory && r.hasNext;
      const title = $('go-title');
      title.textContent = r.victory ? (r.hasNext ? 'STAGE CLEAR!' : "WORLD'S BEST STRIKER!") : 'GAME OVER';
      title.classList.toggle('win', !!r.victory);
      $('go-next').classList.toggle('hidden', !next);
      $('go-retry').classList.toggle('primary', !next);
      const un = $('go-unlock');
      un.classList.toggle('hidden', !r.unlocked.length);
      un.innerHTML = r.unlocked.map((c) => `<img src="${BL.Sprites.portraits[c.id][0]}" alt=""><span>NEW STRIKER UNLOCKED: <b style="color:${c.color}">${esc(c.name)}</b></span>`).join('');
      $('go-stats').innerHTML = `
        <div class="go-char" style="--cc:${r.char.color}"><img src="${BL.Sprites.portraits[r.char.id][0]}" alt=""><span>${r.story ? 'CH. ' + (r.chapter.index + 1) + ' · ' + esc(r.chapter.name) : 'STRIKER'}</span><b>${esc(r.char.name)}</b></div>
        <div><span>${r.story ? 'WAVE' : 'WAVE REACHED'}</span><b>${r.wave}${r.story ? '/' + r.total : ''}</b>${rec('wave')}</div>
        <div><span>LEVEL</span><b>${r.level}</b>${rec('level')}</div>
        <div><span>KILLS</span><b>${r.kills}</b>${rec('kills')}</div>
        <div><span>BEST COMBO</span><b>${r.combo}</b>${rec('combo')}</div>
        <div><span>TIME SURVIVED</span><b>${U.fmtTime(r.time)}</b>${rec('time')}</div>
        <div><span>BOSSES</span><b>${r.bosses}</b></div>`;
      const entries = Object.entries(r.damage).sort((a, b) => b[1] - a[1]).slice(0, 6);
      const max = entries.length ? entries[0][1] : 1;
      const D = BL.Abilities.DEFS;
      $('go-damage').innerHTML = entries
        .map(([id, v]) => {
          const d = D[id];
          const name = d ? d.name : id === 'flow' ? 'FLOW BURST' : id.toUpperCase();
          return `<div class="dm">${d ? icon(d.icon) : icon('flow_burst')}<span>${esc(name)}</span><div class="dbar"><i style="width:${(v / max) * 100}%"></i></div><b>${Math.round(v)}</b></div>`;
        })
        .join('');
      $('go-ego').innerHTML = `+${r.ego} EGO POINTS <small>(${r.reward ? 'first clear +' + r.reward + ' · ' : ''}total ${BL.Save.data.ego})</small>`;
      $('go-build').innerHTML = this.buildIcons(r.build);
      $('gameover').classList.remove('hidden');
      this.screen = 'gameover';
    },

    // ============================================================ UPGRADES
    renderUpgrades() {
      const S = BL.Save.data;
      $('ego-total').textContent = S.ego;
      document.querySelectorAll('#upgrades .tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === this.upTab));
      const body = $('up-body');
      if (this.upTab === 'shop') {
        body.innerHTML = `<div class="shop">${BL.MetaUpgrades.map((u) => {
          const l = BL.Save.metaLevel(u.id);
          const maxed = l >= u.max;
          const cost = maxed ? 0 : u.cost(l);
          const pips = Array.from({ length: u.max }, (_, k) => `<i class="${k < l ? 'on' : ''}"></i>`).join('');
          return `<div class="shop-item ${maxed ? 'maxed' : ''}">
            ${icon(u.icon)}
            <div class="si-main"><b>${u.name}</b><span>${esc(u.desc)}</span><div class="pips">${pips}</div></div>
            <button class="btn small ${!maxed && S.ego >= cost ? 'primary' : 'disabled'}" data-act="buy" data-id="${u.id}" ${maxed ? 'disabled' : ''}>${maxed ? 'MAX' : cost + ' EP'}</button>
          </div>`;
        }).join('')}</div>`;
      } else if (this.upTab === 'stats') {
        const s = S.stats;
        const rows = [
          ['BEST WAVE', s.bestWave], ['BEST COMBO', s.bestCombo], ['TOTAL GOALS', s.totalKills],
          ['MAX TIME', U.fmtTime(s.bestTime)], ['BEST LEVEL', s.bestLevel], ['BEST KILLS', s.bestKills],
          ['BOSSES DEFEATED', s.bossesDefeated], ['EVOLUTIONS', s.evolutions], ['RUNS', s.totalRuns],
          ['TOTAL TIME', U.fmtTime(s.totalTime)],
          ['STORY', S.story.cleared + '/' + BL.Story.chapters.length],
          ['STRIKERS', BL.Characters.list.filter((c) => BL.Save.isUnlocked(c)).length + '/' + BL.Characters.list.length],
        ];
        body.innerHTML = `<div class="records">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
      } else {
        const D = BL.Abilities.DEFS;
        const known = S.codex;
        const entry = (id) => {
          const d = D[id];
          const k = !!known[id];
          let recipe = '';
          if (d.evolved) {
            const from = Object.values(D).find((x) => x.evo && x.evo.into === id);
            recipe = `<div class="recipe">${from.name} ${U.roman(from.max)} + ${D[from.evo.need].name} ${U.roman(from.evo.lvl)}</div>`;
          }
          return `<div class="codex-item ${k ? '' : 'unknown'} ${d.evolved ? 'evo' : ''}">
            ${icon(d.icon)}<div><b>${k ? d.name : d.evolved ? d.name : '???'}</b><span>${k ? esc(d.desc) : 'Ainda não descoberta.'}</span>${recipe}</div></div>`;
        };
        const evos = Object.keys(D).filter((k) => D[k].evolved);
        const n = Object.keys(known).length;
        body.innerHTML = `<div class="codex-count">DESCOBERTAS: ${n}/${Object.keys(D).length}</div>
          <h3>SKILLS</h3><div class="codex">${BL.Abilities.WEAPONS.map(entry).join('')}</div>
          <h3>PASSIVES</h3><div class="codex">${BL.Abilities.PASSIVES.map(entry).join('')}</div>
          <h3>EVOLUTIONS</h3><div class="codex">${evos.map(entry).join('')}</div>`;
      }
    },

    // ============================================================ SETTINGS
    buildSettings() {
      const s = BL.Save.data.settings;
      const box = $('settings-body');
      box.innerHTML = `
        <label class="row"><span>MUSIC</span><input type="range" min="0" max="1" step="0.05" id="set-music" value="${s.music}"></label>
        <label class="row"><span>SFX</span><input type="range" min="0" max="1" step="0.05" id="set-sfx" value="${s.sfx}"></label>
        <div class="row"><span>SCREEN SHAKE</span><button class="btn small toggle" id="set-shake"></button></div>
        <div class="row"><span>DAMAGE NUMBERS</span><button class="btn small toggle" id="set-dmg"></button></div>
        <div class="row"><span>AIM (DIRECT SHOT)</span><button class="btn small toggle" id="set-aim"></button></div>
        <div class="row"><span>SHOW FPS</span><button class="btn small toggle" id="set-fps"></button></div>
        <label class="row"><span>JOYSTICK SENS. (CELULAR)</span><input type="range" min="0.4" max="1" step="0.05" id="set-joy" value="${s.joySens}"><b id="set-joy-v"></b></label>
        <div class="row"><span>VIBRAÇÃO (CELULAR)</span><button class="btn small toggle" id="set-vib"></button></div>
        <div class="row"><span>TELA CHEIA AUTO (CELULAR)</span><button class="btn small toggle" id="set-fs"></button></div>
        <div class="row"><span>PROGRESSO</span><button class="btn small danger" data-act="reset">APAGAR SAVE</button></div>`;
      const refresh = () => {
        $('set-shake').textContent = s.shake ? 'ON' : 'OFF';
        $('set-dmg').textContent = s.damageNumbers ? 'ON' : 'OFF';
        $('set-aim').textContent = s.aim === 'mouse' ? 'MOUSE' : 'AUTO';
        $('set-fps').textContent = s.showFps ? 'ON' : 'OFF';
        $('set-vib').textContent = s.vibration ? 'ON' : 'OFF';
        $('set-fs').textContent = s.fullscreen ? 'ON' : 'OFF';
        $('set-joy-v').textContent = Math.round(s.joySens * 100) + '%';
        $('fps').classList.toggle('hidden', !s.showFps);
      };
      const save = () => {
        BL.Save.save();
        BL.Audio.applyVolumes();
        refresh();
      };
      $('set-music').addEventListener('input', (e) => {
        s.music = +e.target.value;
        save();
      });
      $('set-sfx').addEventListener('input', (e) => {
        s.sfx = +e.target.value;
        save();
      });
      $('set-joy').addEventListener('input', (e) => {
        s.joySens = +e.target.value;
        save();
      });
      const tog = (id, fn) =>
        $(id).addEventListener('click', () => {
          BL.Audio.init();
          BL.Audio.play('click');
          fn();
          save();
        });
      tog('set-shake', () => (s.shake = !s.shake));
      tog('set-dmg', () => (s.damageNumbers = !s.damageNumbers));
      tog('set-aim', () => (s.aim = s.aim === 'mouse' ? 'auto' : 'mouse'));
      tog('set-fps', () => (s.showFps = !s.showFps));
      tog('set-vib', () => (s.vibration = !s.vibration));
      tog('set-fs', () => (s.fullscreen = !s.fullscreen));
      refresh();
    },
  });
})();
