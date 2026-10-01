'use strict';
/* =========================================================================
 * story.js — modo história: capítulos com número fixo de waves, boss final
 * e cartas de bônus no início. Cada capítulo é só uma configuração para o
 * Waves (waves.js); o resto do jogo é o mesmo do modo infinito.
 *
 * Para adicionar um capítulo: nova entrada em CHAPTERS com
 * { id, name, sub, intro[], goal, waves, waveTime, offset, bossAt,
 *   startLevels, reward }
 *   offset       waves somadas à dificuldade (wave 1 do capítulo = 1 + offset)
 *   bossAt       { wave: { key, hp } } — hp multiplica o HP base do boss
 *   startLevels  cartas grátis antes da primeira wave
 *   reward       EGO POINTS na primeira vitória
 * ========================================================================= */
(function () {
  const BL = window.BL;

  const CHAPTERS = [
    {
      id: 'selection1',
      name: 'FIRST SELECTION',
      sub: 'TEAM Z',
      intro: [
        'Bem-vindos ao BLUE LOCK, seus pedaços de talento sem lapidar.',
        'Aqui dentro só existe uma regra: quem não marca, desaparece.',
        'Sobreviva às 3 waves. Mostre que o seu ego merece continuar.',
      ],
      goal: 'Sobreviva a 3 waves',
      waves: 3, waveTime: 45, offset: 0,
      bossAt: null,
      startLevels: 0, reward: 80,
    },
    {
      id: 'selection2',
      name: 'SECOND SELECTION',
      sub: 'WORLD FIVE',
      intro: [
        'Vocês acham que evoluíram? Então conheçam o nível do mundo.',
        'JULIAN LOKI. Dezessete anos. Mais rápido do que vocês conseguem pensar.',
        'Não tentem acompanhar. Leiam o campo e devorem ele.',
      ],
      goal: 'Derrote JULIAN LOKI na wave 4',
      waves: 4, waveTime: 45, offset: 1,
      bossAt: { 4: { key: 'loki', hp: 0.7 } },
      startLevels: 3, reward: 120,
    },
    {
      id: 'u20',
      name: 'U-20 JAPAN',
      sub: 'THE GENIUS RETURNS',
      intro: [
        'O Japão inteiro está assistindo. Se perderem, o BLUE LOCK acaba hoje.',
        'Do outro lado está ITOSHI SAE, o único japonês que o mundo respeita.',
        'Ele enxerga o campo inteiro. Enxerguem um passo além.',
      ],
      goal: 'Derrote ITOSHI SAE na wave 4',
      waves: 4, waveTime: 50, offset: 2,
      bossAt: { 4: { key: 'sae', hp: 0.3 } },
      startLevels: 5, reward: 180,
    },
    {
      id: 'nel',
      name: 'NEO EGOIST LEAGUE',
      sub: 'BASTARD MUNCHEN',
      intro: [
        'Bem-vindos à liga dos egoístas. Aqui cada gol tem um preço.',
        'MICHAEL KAISER se chama de imperador. O chute dele é o mais rápido do planeta.',
        'Quando a linha azul aparecer no chão, saiam dela. Depois, tomem o trono.',
      ],
      goal: 'Derrote MICHAEL KAISER na wave 5',
      waves: 5, waveTime: 50, offset: 4,
      bossAt: { 5: { key: 'kaiser', hp: 0.3 } },
      startLevels: 8, reward: 250,
    },
    {
      id: 'newgen',
      name: 'NEW GEN WORLD 11',
      sub: 'THE NEXT RULERS OF THE WORLD',
      intro: [
        'Os onze melhores jovens do planeta. Quatro deles estão na sua frente.',
        'HUGO. LOKI. SAE. KAISER. Um depois do outro, sem intervalo.',
        'Não existe plano. Só existe o seu ego. Vá e seja o melhor do mundo.',
      ],
      goal: 'Derrote os 4 NEW GEN 11 em sequência',
      waves: 4, waveTime: 40, offset: 5,
      bossAt: { 1: { key: 'hugo', hp: 0.45 }, 2: { key: 'loki', hp: 1.6 }, 3: { key: 'sae', hp: 0.35 }, 4: { key: 'kaiser', hp: 0.33 } },
      startLevels: 12, reward: 400,
    },
  ];
  CHAPTERS.forEach((c, i) => (c.index = i));

  BL.Story = {
    chapters: CHAPTERS,
    /** capítulo i está liberado? (o anterior precisa estar concluído) */
    isOpen(i) {
      return i <= BL.Save.data.story.cleared;
    },
    isCleared(i) {
      return i < BL.Save.data.story.cleared;
    },
    wavesCfg(c) {
      return { waveTime: c.waveTime, total: c.waves, offset: c.offset, bossAt: c.bossAt || {}, bossDmg: 0.85 };
    },
  };
})();
