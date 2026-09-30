'use strict';
/* =========================================================================
 * storage.js — save persistente (localStorage): configurações, recordes,
 * moeda de meta-progressão (EGO POINTS), upgrades permanentes e códex.
 * ========================================================================= */
(function () {
  const BL = window.BL;
  const KEY = 'bl_ego_survivor_v1';

  const defaults = () => ({
    settings: {
      music: 0.5,
      sfx: 0.7,
      shake: true,
      damageNumbers: true,
      aim: 'auto', // 'auto' | 'mouse'
      showFps: false,
      vibration: true,
      fullscreen: true, // tela cheia automática ao jogar no celular
    },
    stats: {
      bestWave: 0,
      bestCombo: 0,
      bestTime: 0,
      bestLevel: 0,
      bestKills: 0,
      totalKills: 0,
      totalRuns: 0,
      totalTime: 0,
      bossesDefeated: 0,
      evolutions: 0,
    },
    ego: 0,
    character: 'isagi',
    meta: {},
    codex: {},
  });

  function merge(base, data) {
    if (!data || typeof data !== 'object') return base;
    for (const k of Object.keys(base)) {
      if (!(k in data)) continue;
      const bv = base[k];
      if (bv && typeof bv === 'object' && !Array.isArray(bv)) {
        const dv = data[k];
        if (dv && typeof dv === 'object') {
          // settings/stats: só chaves conhecidas; meta/codex: tudo
          if (Object.keys(bv).length) {
            for (const kk of Object.keys(bv)) if (kk in dv) bv[kk] = dv[kk];
          } else Object.assign(bv, dv);
        }
      } else base[k] = data[k];
    }
    return base;
  }

  const Save = (BL.Save = {
    data: defaults(),
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        this.data = merge(defaults(), raw ? JSON.parse(raw) : null);
      } catch (e) {
        this.data = defaults();
      }
    },
    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.data));
      } catch (e) {
        /* modo privado / storage bloqueado: segue sem persistir */
      }
    },
    reset() {
      const settings = this.data.settings;
      this.data = defaults();
      this.data.settings = settings;
      this.save();
    },
    metaLevel(id) {
      return this.data.meta[id] || 0;
    },
    buyMeta(id) {
      const up = BL.MetaUpgrades.find((u) => u.id === id);
      if (!up) return false;
      const lvl = this.metaLevel(id);
      if (lvl >= up.max) return false;
      const cost = up.cost(lvl);
      if (this.data.ego < cost) return false;
      this.data.ego -= cost;
      this.data.meta[id] = lvl + 1;
      this.save();
      return true;
    },
  });

  /** Upgrades permanentes comprados com EGO POINTS no menu UPGRADES */
  BL.MetaUpgrades = [
    { id: 'vitality', name: 'VITALITY', icon: 'stamina', max: 5, desc: '+10 HP máximo', cost: (l) => 60 + l * 50 },
    { id: 'power', name: 'SHOT POWER', icon: 'finishing', max: 5, desc: '+5% de dano', cost: (l) => 80 + l * 60 },
    { id: 'agility', name: 'AGILITY', icon: 'acceleration', max: 5, desc: '+4% de velocidade', cost: (l) => 60 + l * 50 },
    { id: 'magnet', name: 'FIELD SENSE', icon: 'field_reading', max: 4, desc: '+15% raio de coleta de XP', cost: (l) => 50 + l * 40 },
    { id: 'talent', name: 'TALENT', icon: 'ego', max: 5, desc: '+6% de XP ganho', cost: (l) => 90 + l * 70 },
    { id: 'recovery', name: 'RECOVERY', icon: 'stamina', max: 3, desc: '+0.2 HP/s de regeneração', cost: (l) => 100 + l * 80 },
    { id: 'armor', name: 'BODY BALANCE', icon: 'iron_body', max: 3, desc: '+1 de armadura', cost: (l) => 120 + l * 100 },
    { id: 'reroll', name: 'REROLL', icon: 'meta_vision', max: 3, desc: '+1 reroll de cartas por partida', cost: (l) => 150 + l * 120 },
    { id: 'flowstart', name: 'FLOW START', icon: 'flow_state', max: 4, desc: 'Começa a partida com +25% de FLOW', cost: (l) => 70 + l * 60 },
  ];

  Save.load();
})();
