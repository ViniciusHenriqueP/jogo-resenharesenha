'use strict';
/* =========================================================================
 * collision.js — spatial hash para inimigos, colisão círculo x obstáculos
 * e flow field (BFS) para os inimigos contornarem obstáculos.
 * ========================================================================= */
(function () {
  const BL = window.BL;
  const U = BL.U;

  /** Grade uniforme; reconstruída a cada frame (inserção O(1)). */
  class SpatialHash {
    constructor(w, h, cell) {
      this.cell = cell;
      this.cols = Math.ceil(w / cell);
      this.rows = Math.ceil(h / cell);
      this.cells = new Array(this.cols * this.rows);
      for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
      this.used = [];
    }
    clear() {
      for (const i of this.used) this.cells[i].length = 0;
      this.used.length = 0;
    }
    insert(e) {
      const cx = U.clamp((e.x / this.cell) | 0, 0, this.cols - 1);
      const cy = U.clamp((e.y / this.cell) | 0, 0, this.rows - 1);
      const i = cy * this.cols + cx;
      const c = this.cells[i];
      if (c.length === 0) this.used.push(i);
      c.push(e);
    }
    /** preenche `out` com entidades nas células que tocam o círculo */
    query(x, y, r, out) {
      out.length = 0;
      const c = this.cell;
      const x0 = U.clamp(((x - r) / c) | 0, 0, this.cols - 1);
      const x1 = U.clamp(((x + r) / c) | 0, 0, this.cols - 1);
      const y0 = U.clamp(((y - r) / c) | 0, 0, this.rows - 1);
      const y1 = U.clamp(((y + r) / c) | 0, 0, this.rows - 1);
      for (let cy = y0; cy <= y1; cy++) {
        const row = cy * this.cols;
        for (let cx = x0; cx <= x1; cx++) {
          const cell = this.cells[row + cx];
          for (let k = 0; k < cell.length; k++) out.push(cell[k]);
        }
      }
      return out;
    }
  }

  const C = (BL.Collision = { SpatialHash });

  let stamp = 1;

  /**
   * Empurra a entidade (x, y, r) para fora de obstáculos e dos limites.
   * Retorna true se houve colisão.
   */
  C.resolve = function (map, e) {
    let hit = false;
    const b = map.bounds;
    const r = e.r;
    if (e.x < b.x0 + r) { e.x = b.x0 + r; hit = true; }
    if (e.x > b.x1 - r) { e.x = b.x1 - r; hit = true; }
    if (e.y < b.y0 + r) { e.y = b.y0 + r; hit = true; }
    if (e.y > b.y1 - r) { e.y = b.y1 - r; hit = true; }

    const cs = map.obsCell;
    const x0 = Math.max(0, ((e.x - r) / cs) | 0), x1 = Math.min(map.obsCols - 1, ((e.x + r) / cs) | 0);
    const y0 = Math.max(0, ((e.y - r) / cs) | 0), y1 = Math.min(map.obsRows - 1, ((e.y + r) / cs) | 0);
    stamp++;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const list = map.obsGrid[cy * map.obsCols + cx];
        for (let k = 0; k < list.length; k++) {
          const o = list[k];
          if (o._stamp === stamp) continue;
          o._stamp = stamp;
          if (o.shape === 'rect') {
            const px = U.clamp(e.x, o.x, o.x + o.w);
            const py = U.clamp(e.y, o.y, o.y + o.h);
            let dx = e.x - px, dy = e.y - py;
            const d2 = dx * dx + dy * dy;
            if (d2 >= r * r) continue;
            hit = true;
            if (d2 > 0.0001) {
              const d = Math.sqrt(d2);
              e.x += (dx / d) * (r - d);
              e.y += (dy / d) * (r - d);
            } else {
              // centro dentro do retângulo: sai pelo lado mais próximo
              const l = e.x - o.x, rr = o.x + o.w - e.x, t = e.y - o.y, bb = o.y + o.h - e.y;
              const m = Math.min(l, rr, t, bb);
              if (m === l) e.x = o.x - r;
              else if (m === rr) e.x = o.x + o.w + r;
              else if (m === t) e.y = o.y - r;
              else e.y = o.y + o.h + r;
            }
          } else {
            const dx = e.x - o.cx, dy = e.y - o.cy;
            const rr = r + o.r;
            const d2 = dx * dx + dy * dy;
            if (d2 >= rr * rr) continue;
            hit = true;
            const d = Math.sqrt(d2) || 0.01;
            e.x = o.cx + (dx / d) * rr;
            e.y = o.cy + (dy / d) * rr;
          }
        }
      }
    }
    return hit;
  };

  /** ponto dentro de obstáculo alto (usado por projéteis). Retorna o obstáculo. */
  C.pointSolid = function (map, x, y) {
    const b = map.bounds;
    if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) return map.boundsObstacle;
    const cx = (x / map.obsCell) | 0, cy = (y / map.obsCell) | 0;
    if (cx < 0 || cy < 0 || cx >= map.obsCols || cy >= map.obsRows) return map.boundsObstacle;
    const list = map.obsGrid[cy * map.obsCols + cx];
    for (let k = 0; k < list.length; k++) {
      const o = list[k];
      if (!o.tall) continue;
      if (o.shape === 'rect') {
        if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return o;
      } else if (U.dist2(x, y, o.cx, o.cy) <= o.r * o.r) return o;
    }
    return null;
  };

  // ------------------------------------------------------------ FLOW FIELD
  class FlowField {
    constructor(map) {
      const cell = (this.cell = BL.CFG.CELL);
      this.cols = Math.ceil(map.w / cell);
      this.rows = Math.ceil(map.h / cell);
      const n = this.cols * this.rows;
      this.blocked = new Uint8Array(n);
      this.dist = new Int32Array(n);
      this.queue = new Int32Array(n);
      const b = map.bounds;
      for (let cy = 0; cy < this.rows; cy++) {
        for (let cx = 0; cx < this.cols; cx++) {
          const x = cx * cell + cell / 2, y = cy * cell + cell / 2;
          let bl = x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1;
          if (!bl) {
            for (const o of map.obstacles) {
              const pad = 5;
              if (o.shape === 'rect') {
                if (o.x - pad < x + cell / 2 && o.x + o.w + pad > x - cell / 2 && o.y - pad < y + cell / 2 && o.y + o.h + pad > y - cell / 2) {
                  // só bloqueia se o obstáculo cobrir boa parte da célula
                  const ox = Math.min(o.x + o.w, x + cell / 2) - Math.max(o.x, x - cell / 2);
                  const oy = Math.min(o.y + o.h, y + cell / 2) - Math.max(o.y, y - cell / 2);
                  if (ox * oy > cell * cell * 0.12 || (ox > cell * 0.6 && oy > 4) || (oy > cell * 0.6 && ox > 4)) {
                    bl = true;
                    break;
                  }
                }
              }
            }
          }
          this.blocked[cy * this.cols + cx] = bl ? 1 : 0;
        }
      }
      this.tx = -1;
      this.ty = -1;
    }

    update(x, y) {
      const cx = U.clamp((x / this.cell) | 0, 0, this.cols - 1);
      const cy = U.clamp((y / this.cell) | 0, 0, this.rows - 1);
      if (cx === this.tx && cy === this.ty) return;
      this.tx = cx;
      this.ty = cy;
      const { cols, rows, dist, blocked, queue } = this;
      dist.fill(-1);
      let head = 0, tail = 0;
      const s = cy * cols + cx;
      dist[s] = 0;
      queue[tail++] = s;
      while (head < tail) {
        const i = queue[head++];
        const d = dist[i] + 1;
        const x0 = i % cols, y0 = (i / cols) | 0;
        if (x0 > 0) { const j = i - 1; if (dist[j] < 0 && !blocked[j]) { dist[j] = d; queue[tail++] = j; } }
        if (x0 < cols - 1) { const j = i + 1; if (dist[j] < 0 && !blocked[j]) { dist[j] = d; queue[tail++] = j; } }
        if (y0 > 0) { const j = i - cols; if (dist[j] < 0 && !blocked[j]) { dist[j] = d; queue[tail++] = j; } }
        if (y0 < rows - 1) { const j = i + cols; if (dist[j] < 0 && !blocked[j]) { dist[j] = d; queue[tail++] = j; } }
      }
    }

    /**
     * Direção sugerida para (x,y) chegar ao alvo. Escreve em out {x,y}.
     * Retorna false se não houver caminho (use perseguição direta).
     * `tdx, tdy` = direção direta ao alvo, usada para desempate/suavização.
     */
    dir(x, y, tdx, tdy, out) {
      const { cols, rows, dist, blocked } = this;
      const cx = (x / this.cell) | 0, cy = (y / this.cell) | 0;
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return false;
      const i = cy * cols + cx;
      const d0 = dist[i];
      if (d0 < 0) return false;
      if (d0 <= 2) return false; // perto: perseguição direta
      let best = d0, bx = 0, by = 0, bestDot = -2;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = cx + ox, ny = cy + oy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const j = ny * cols + nx;
          const dj = dist[j];
          if (dj < 0 || blocked[j]) continue;
          if (ox && oy && (blocked[cy * cols + nx] || blocked[ny * cols + cx])) continue;
          const l = ox && oy ? 0.7071 : 1;
          const dot = (ox * tdx + oy * tdy) * l;
          if (dj < best || (dj === best && dot > bestDot)) {
            best = dj;
            bestDot = dot;
            bx = ox * l;
            by = oy * l;
          }
        }
      }
      if (best === d0) return false;
      // campo aberto: se a direção do fluxo concorda com a direta, usa a direta (movimento mais suave)
      if (bx * tdx + by * tdy > 0.72) {
        out.x = tdx;
        out.y = tdy;
      } else {
        out.x = bx;
        out.y = by;
      }
      return true;
    }
  }
  C.FlowField = FlowField;
})();
