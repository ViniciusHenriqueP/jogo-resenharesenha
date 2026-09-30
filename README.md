# Blue Lock: Ego Survivor

Roguelite/survivor top-down em pixel art inspirado em **Blue Lock**, feito em HTML5 Canvas + JavaScript puro, sem dependências.

## Como jogar

Abra o `index.html` direto no navegador (funciona via `file://`), ou use um servidor local como o Live Server.

| Ação | Teclado | Celular |
|---|---|---|
| Mover (8 direções) | `WASD` / setas | joystick virtual (lado esquerdo) |
| Dash | `Espaço` / `Shift` | botão DASH |
| Ativar FLOW | `F` | botão FLOW |
| Escolher carta | clique ou `1` `2` `3` · `R` = reroll | toque |
| Pausar | `Esc` / `P` | botão II |

### No celular

O modo toque liga sozinho: joystick virtual à esquerda (aparece onde você encosta o dedo), botões **DASH** (com anel de recarga) e **FLOW** (com anel de carga) à direita. Funciona deitado ou em pé. O jogo entra em tela cheia ao começar a partida e vibra em eventos importantes; as duas coisas podem ser desligadas em SETTINGS. No iPhone, onde o Safari não permite tela cheia, use *Compartilhar → Adicionar à Tela de Início*. Se um teclado for usado, os controles de toque somem automaticamente.

## Personagens

| | Habilidades iniciais | Traço exclusivo |
|---|---|---|
| **Isagi** | Direct Shot + Meta Vision | +20% de dano em rivais marcados |
| **Rin** | Curve Shot II | +15% de dano, +10% de crítico, +30% de dano crítico, -10 HP |
| **Nagi** | One-Touch + Sky Volley | -12% de recarga, +10% de XP, -5% de velocidade |
| **Chigiri** | Spin Shot + Dribble | +20% de velocidade, -30% de recarga do dash, -15 HP |

## Sistemas

- **Waves** de 60s com dificuldade progressiva; eventos *High Press* e *Counter Attack*; elites.
- **Bosses** a cada 5 waves (Raizen, Tetsuda, Mikagami, Kurogane), com ataques telegrafados e fase de fúria abaixo de 50% de HP. Depois da wave 20 eles voltam mais fortes.
- **9 habilidades ativas, 10 passivas, 7 evoluções** (arma nível V + passiva nível III). As receitas ficam em UPGRADES → CODEX.
- **Combo**, **FLOW** (tecla F), **EGO** (fica mais forte quando cercado).
- **Meta-progressão**: EGO POINTS ganhos por partida compram upgrades permanentes. Recordes e códex ficam salvos no `localStorage`.
- Configurações: volumes, screen shake, números de dano, mira automática ou pelo mouse, FPS.

## Estrutura

```
index.html
css/style.css
js/
  core.js         namespace BL, config, utilitários
  storage.js      save, recordes, upgrades permanentes
  audio.js        efeitos sonoros e música sintetizados (WebAudio)
  characters.js   personagens jogáveis
  sprites.js      pixel art procedural + fonte bitmap
  input.js        teclado, mouse, joystick touch
  collision.js    spatial hash, colisão, flow field (pathfinding)
  map.js          geração procedural da arena
  particles.js    partículas, anéis, textos, telegraphs
  projectiles.js  bolas do jogador e dos inimigos
  player.js       jogador
  enemy.js        inimigos, IA e bosses
  abilities.js    habilidades, evoluções, cartas de level up
  waves.js        waves, spawn e eventos
  ui.js           HUD e telas
  game.js         estado do jogo, combate, render
  main.js         boot e loop
assets/           vazio: sprites, sons e música são gerados por código
```

Os scripts são clássicos (não ES modules) para o jogo abrir sem servidor. Cada arquivo registra seu módulo em `window.BL`, e a ordem de carregamento no `index.html` importa.

### Adicionando conteúdo

- **Habilidade:** nova entrada em `DEFS` no `js/abilities.js` (`stats(level)` + `fire(game, weapon, stats)` para armas, `apply(stats, level)` para passivas).
- **Personagem:** nova entrada em `js/characters.js` (paleta do sprite, habilidades iniciais, traço).
- **Inimigo:** nova entrada em `BL.EnemyTypes` no `js/enemy.js` e um peso em `typeWeights()` no `js/waves.js`.

### Modo debug

Abra com `index.html?debug=1`: `N` pula a wave, `L` sobe de nível, `B` chama o boss, `K` mata os inimigos, `J` enche o FLOW, `M` maximiza as habilidades atuais, `G` ativa o god mode.

---

Fan game sem fins comerciais. Blue Lock e seus personagens pertencem a Muneyuki Kaneshiro, Yusuke Nomura e Kodansha.
