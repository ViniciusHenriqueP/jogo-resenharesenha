'use strict';
/* =========================================================================
 * main.js — inicialização e loop principal (requestAnimationFrame).
 * ========================================================================= */
(function () {
  const BL = window.BL;

  function boot() {
    BL.Sprites.init();
    const canvas = document.getElementById('game');
    BL.Input.init(canvas);
    const game = (BL.game = new BL.Game(canvas));
    BL.UI.init(game);

    // música do menu começa no primeiro gesto do usuário (política de autoplay)
    const startAudio = () => {
      BL.Audio.init();
      if (game.state === 'menu' && !BL.Audio.music.playing) BL.Audio.music.start(0);
      window.removeEventListener('pointerdown', startAudio);
      window.removeEventListener('keydown', startAudio);
    };
    window.addEventListener('pointerdown', startAudio);
    window.addEventListener('keydown', startAudio);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (game.state === 'playing' && !game.dying) game.pause();
        BL.Audio.suspend();
      } else BL.Audio.resume();
    });

    let last = performance.now();
    let fpsAcc = 0, fpsN = 0;
    function loop(now) {
      requestAnimationFrame(loop);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05; // evita saltos após travadas / abas em segundo plano
      fpsAcc += dt;
      fpsN++;
      if (fpsAcc >= 0.5) {
        BL.fps = Math.round(fpsN / fpsAcc);
        fpsAcc = 0;
        fpsN = 0;
      }
      uiKeys(game);
      game.frame(dt);
      BL.Input.endFrame();
    }
    requestAnimationFrame(loop);
  }

  /** atalhos de teclado das telas (fora do gameplay) */
  function uiKeys(game) {
    const I = BL.Input;
    if (game.state === 'levelup') {
      if (I.hit('1')) game.chooseCard(0);
      else if (I.hit('2')) game.chooseCard(1);
      else if (I.hit('3')) game.chooseCard(2);
      else if (I.hit('r')) game.reroll();
      else if (I.hit('b')) game.toggleBanish();
    } else if (game.state === 'paused') {
      if (I.hit('escape', 'p')) {
        if (BL.UI.screen === 'settings') BL.UI.action('back');
        else game.resume();
      }
    } else if (game.state === 'menu' && BL.UI.screen === 'select') {
      const L = BL.Characters.list;
      for (let i = 0; i < L.length; i++) if (I.hit(String(i + 1))) BL.UI.action('pick', { dataset: { id: L[i].id } });
      if (I.hit('arrowleft', 'a')) BL.UI.selectStep(-1);
      if (I.hit('arrowright', 'd')) BL.UI.selectStep(1);
      if (I.hit('enter', ' ')) BL.UI.action('start');
      if (I.hit('escape')) BL.UI.action('back');
    } else if (BL.UI.screen === 'intro' && game.state !== 'playing') {
      // abertura de capítulo (vinda da seleção ou da tela de vitória)
      if (I.hit('enter', ' ')) BL.UI.action('begin');
      if (I.hit('escape')) BL.UI.action('back');
    } else if (game.state === 'menu' && BL.UI.screen === 'story') {
      const C = BL.Story.chapters;
      for (let i = 0; i < C.length; i++) if (I.hit(String(i + 1))) BL.UI.action('chapter', { dataset: { i } });
      if (I.hit('escape')) BL.UI.action('back');
    } else if (game.state === 'menu') {
      if (I.hit('enter') && BL.UI.screen === 'menu') BL.UI.action('play');
      if (I.hit('escape') && BL.UI.screen !== 'menu') BL.UI.action('back');
    } else if (game.state === 'gameover') {
      if (I.hit('enter')) BL.UI.action(document.getElementById('go-next').classList.contains('hidden') ? 'retry' : 'next');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
