/**
 * AgenteGomoku.js
 * ---------------------------------------------------------------------------
 * Agente para Gomoku (cinco o más en línea) con apertura Swap2, compatible con
 * el ambiente del curso (gomoku.js). Se carga DESPUÉS de gomoku.js:
 *
 *   <script src='gomoku.js'></script>
 *   <script src='AgenteGomoku.js'></script>
 *   ...
 *   client.setPlayers({ 'agente': new AgenteGomoku(), ... })
 *
 * Interfaz exigida por el ambiente: compute(board, move_state, time)
 *   - board: matriz de caracteres ' ', 'B', 'W', indexada board[y][x]
 *   - posiciones: [x, y] = [columna, fila]
 *   - move_state: '1' | '2' | '3' | 'B' | 'W'  (ver comentario de Agent)
 *   - time: milisegundos que le quedan al agente en la partida
 *
 * Estrategia:
 *   1. Tabla de patrones precalculada (3^8 configuraciones de una línea de 9
 *      casillas) que clasifica cada jugada en cinco / cuatro abierto / cuatro /
 *      tres abierto / tres / dos abierto / dos. Se mantiene incrementalmente.
 *   2. Táctica inmediata: ganar ya, bloquear un cinco del rival.
 *   3. VCF (victoria por cuatros continuos) propia.
 *   4. Alfa-beta (negamax) con profundización iterativa, tabla de transposición,
 *      generación de jugadas restringida cuando hay amenazas, y extensión de
 *      jugadas forzadas.
 *   5. Verificación final: descartar jugadas que le dejan un VCF al rival.
 *   Todo en un solo hilo y con presupuesto de tiempo por jugada.
 *
 * Solo se expone una variable global (AgenteGomoku) para no chocar con el
 * código de otros agentes cargados en la misma página.
 */
var AgenteGomoku = (function () {
  'use strict';

  var Base = (typeof Agent === 'function') ? Agent : function () {};

  var EMPTY = 0, BLACK = 1, WHITE = 2, WALL = 3;
  var PAD = 4;                 // borde de "muro" alrededor del tablero
  var WIN = 100000000;         // victoria forzada
  var WIN_SOFT = 30000000;     // victoria casi segura (cuatro abierto / 4-3 sin réplica)
  var INF = 1000000000;
  var MAX_PLY = 40;
  var TIMEOUT = { timeout: true };

  // ------------------------------------------------------------------------
  // Tabla de patrones por dirección.
  // Niveles (lo que se forma al poner una piedra propia en el centro):
  //   0 nada, 1 dos, 2 dos abierto, 3 tres, 4 tres abierto,
  //   5 cuatro, 6 cuatro abierto, 7 cinco
  // ------------------------------------------------------------------------
  var LS = [0, 2, 8, 10, 60, 70, 600, 6000];   // puntaje por nivel
  var NEI = [0, 1, 2, 3, 5, 6, 7, 8];          // posiciones de la línea (centro = 4)
  var OFF = [-4, -3, -2, -1, 1, 2, 3, 4];
  var POW3 = [1, 3, 9, 27, 81, 243, 729, 2187];
  var PAT = new Uint8Array(6561);

  (function buildPatterns() {
    // a[k]: 0 vacío, 1 propia, 2 bloqueada (rival o borde)
    var memo = new Int8Array(6561).fill(-1);
    var a = [0, 0, 0, 0, 1, 0, 0, 0, 0];
    function code() {
      var c = 0;
      for (var k = 0; k < 8; k++) c += a[NEI[k]] * POW3[k];
      return c;
    }
    function level() {
      var key = code();
      if (memo[key] >= 0) return memo[key];
      var five = false, c1 = -1, c2 = -1;
      for (var s = 0; s <= 4; s++) {           // ventanas de 5 que contienen el centro
        var own = 0, emp = -1, bad = false;
        for (var k = s; k < s + 5; k++) {
          var v = a[k];
          if (v === 2) { bad = true; break; }
          if (v === 1) own++; else emp = k;
        }
        if (bad) continue;
        if (own === 5) five = true;
        else if (own === 4) { if (c1 < 0) c1 = emp; else if (emp !== c1) c2 = emp; }
      }
      var res;
      if (five) res = 7;
      else if (c2 >= 0) res = 6;               // dos casillas que completan cinco
      else if (c1 >= 0) res = 5;
      else {
        res = 0;
        for (var e = 0; e < 9 && res < 4; e++) {
          if (a[e] !== 0) continue;
          a[e] = 1;
          var l = level();
          a[e] = 0;
          var r = l === 6 ? 4 : l === 5 ? 3 : l === 4 ? 2 : l === 3 ? 1 : 0;
          if (r > res) res = r;
        }
      }
      memo[key] = res;
      return res;
    }
    for (var c = 0; c < 6561; c++) {
      var t = c;
      for (var k = 0; k < 8; k++) { a[NEI[k]] = t % 3; t = (t / 3) | 0; }
      a[4] = 1;
      PAT[c] = level();
    }
  })();

  // ------------------------------------------------------------------------
  // Combinación de las 4 direcciones de una casilla (clave de 12 bits).
  // Clases: 8 cinco, 7 ganadora (cuatro abierto, doble cuatro, cuatro-tres),
  //         6 cuatro, 5 doble tres, 4 tres abierto, 0-3 menores
  // ------------------------------------------------------------------------
  var CLS = new Uint8Array(4096), CSC = new Int32Array(4096), MAXL = new Uint8Array(4096);
  (function buildCombos() {
    for (var key = 0; key < 4096; key++) {
      var n7 = 0, n6 = 0, n5 = 0, n4 = 0, sc = 0, mx = 0;
      for (var d = 0; d < 4; d++) {
        var l = (key >> (3 * d)) & 7;
        sc += LS[l];
        if (l > mx) mx = l;
        if (l === 7) n7++; else if (l === 6) n6++; else if (l === 5) n5++; else if (l === 4) n4++;
      }
      var c;
      if (n7) { c = 8; sc += 100000; }
      else if (n6 || n5 >= 2 || (n5 && n4)) { c = 7; sc += 10000; }
      else if (n5) c = 6;
      else if (n4 >= 2) { c = 5; sc += 3000; }
      else if (n4) c = 4;
      else c = mx > 3 ? 3 : mx;
      CLS[key] = c; CSC[key] = sc; MAXL[key] = mx;
    }
  })();

  function xorshift(seed) {
    var s = seed | 0 || 0x2545f491;
    return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return s | 0; };
  }

  class AgenteGomoku extends Base {
    constructor(cfg) {
      super();
      this.cfg = Object.assign({
        maxMoveMs: 1000,   // tope de tiempo por jugada (ms)
        timeShare: 30,     // por jugada usar como máximo tiempoRestante / timeShare
        maxDepth: 20,      // profundidad máxima del alfa-beta
        vcfDepth: 16,      // cuatros consecutivos máximos en la búsqueda VCF
        rootWidth: 20,     // jugadas candidatas en la raíz
        ttBits: 19         // tabla de transposición de 2^ttBits entradas
      }, cfg || {});
      var ts = 1 << this.cfg.ttBits;
      this.ttMask = ts - 1;
      this.ttKey = new Int32Array(ts);
      this.ttVal = new Int32Array(ts);
      this.ttDepth = new Int8Array(ts).fill(-1);
      this.ttFlag = new Uint8Array(ts);
      this.ttMove = new Int32Array(ts);
      this.n = 0;
      this.nodes = 0;
      this.deadline = 0;
    }

    // ============================ interfaz ============================
    compute(board, move_state, time) {
      var t0 = Date.now();
      var deadline = t0 + this._budget(time);
      var state = String(move_state);
      var res;
      try {
        this._load(board);
        if (state === '1') res = this._opening(deadline);
        else if (state === '2' || state === '3') res = this._chooseColor(deadline);
        else if (state === 'B') res = this._xy(this._bestMove(BLACK, deadline));
        else if (state === 'W') res = this._xy(this._bestMove(WHITE, deadline));
        else res = this._xy(this._bestMove(this._sideToMove(), deadline));
      } catch (e) {
        res = null;
      }
      return this._validate(board, state, res);
    }

    // ======================= tiempo y validación ======================
    _budget(time) {
      var rem = (typeof time === 'number' && isFinite(time) && time > 0) ? time : 60000;
      return Math.max(10, Math.min(this.cfg.maxMoveMs, rem / this.cfg.timeShare));
    }

    _validate(board, state, res) {
      var n = board.length;
      var free = function (p) {
        return Array.isArray(p) && p.length === 2 && Number.isInteger(p[0]) && Number.isInteger(p[1]) &&
          p[0] >= 0 && p[1] >= 0 && p[0] < n && p[1] < n && board[p[1]][p[0]] === ' ';
      };
      if (state === '1') {
        if (Array.isArray(res) && res.length === 3 && res.every(free) &&
          String(res[0]) !== String(res[1]) && String(res[0]) !== String(res[2]) && String(res[1]) !== String(res[2])) return res;
        return this._emergencyCells(board, 3);
      }
      if (state === '2' || state === '3') {
        if (res === 'BLACK' || free(res)) return res;
        return 'BLACK';
      }
      if (free(res)) return res;
      return this._emergencyCells(board, 1)[0];
    }

    // Casillas libres más cercanas al centro (respaldo ante cualquier error)
    _emergencyCells(board, k) {
      var n = board.length, m = (n - 1) / 2, list = [];
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++)
        if (board[y][x] === ' ') list.push([x, y, Math.abs(x - m) + Math.abs(y - m)]);
      list.sort(function (a, b) { return a[2] - b[2]; });
      var out = [];
      for (var i = 0; i < k && i < list.length; i++) out.push([list[i][0], list[i][1]]);
      while (out.length < k) out.push([0, 0]);
      return out;
    }

    // ===================== estructura del tablero =====================
    _setup(n) {
      if (n === this.n) return;
      this.n = n;
      var W = n + 2 * PAD, S = W * W;
      this.W = W;
      this.cells = new Uint8Array(S);
      this.nb = new Int16Array(S);                 // piedras a distancia <= 2
      this.keys = [null, new Uint16Array(S), new Uint16Array(S)];
      this.cnt = [null, new Int32Array(9), new Int32Array(9)];
      this.steps = [1, W, W + 1, W - 1];
      var inner = [];
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) inner.push((y + PAD) * W + x + PAD);
      this.inner = Int32Array.from(inner);
      var nbo = [];
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) if (dx || dy) nbo.push(dy * W + dx);
      this.nbOff = Int32Array.from(nbo);
      var r = xorshift(0x9e3779b9 ^ (n * 7919));
      this.z1 = [null, new Int32Array(S), new Int32Array(S)];
      this.z2 = [null, new Int32Array(S), new Int32Array(S)];
      for (var p = 1; p <= 2; p++) for (var i = 0; i < S; i++) { this.z1[p][i] = r(); this.z2[p][i] = r(); }
      this.side1 = r(); this.side2 = r();
      this.mv = []; this.ms = [];
      for (var k = 0; k <= MAX_PLY + 2; k++) { this.mv.push(new Int32Array(n * n)); this.ms.push(new Float64Array(n * n)); }
      this.ttDepth.fill(-1);
    }

    _load(board) {
      var n = board.length;
      this._setup(n);
      var cells = this.cells, inner = this.inner;
      cells.fill(WALL);
      for (var t = 0; t < inner.length; t++) cells[inner[t]] = EMPTY;
      this.nb.fill(0);
      this.keys[1].fill(0); this.keys[2].fill(0);
      this.cnt[1].fill(0); this.cnt[2].fill(0);
      this.cnt[1][0] = n * n; this.cnt[2][0] = n * n;
      this.tot = [0, 0, 0];
      this.h1 = 0; this.h2 = 0;
      this.stones = 0; this.nBlack = 0; this.nWhite = 0;
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
        var ch = board[y][x];
        if (ch === 'B') { this._make(this._idx(x, y), BLACK); this.nBlack++; }
        else if (ch === 'W') { this._make(this._idx(x, y), WHITE); this.nWhite++; }
      }
    }

    _idx(x, y) { return (y + PAD) * this.W + x + PAD; }
    _xy(i) { return [i % this.W - PAD, ((i / this.W) | 0) - PAD]; }
    _sideToMove() { return this.nBlack > this.nWhite ? WHITE : BLACK; }

    _applyKey(p, q, nk) {
      var K = this.keys[p], ok = K[q];
      if (ok === nk) return;
      this.tot[p] += CSC[nk] - CSC[ok];
      var C = this.cnt[p];
      C[CLS[ok]]--; C[CLS[nk]]++;
      K[q] = nk;
    }

    // Recalcula el nivel en la dirección d de la casilla vacía q, para ambos jugadores
    _updDir(q, d) {
      var s = this.steps[d], cells = this.cells, i1 = 0, i2 = 0;
      for (var j = 0; j < 8; j++) {
        var v = cells[q + OFF[j] * s];
        if (v === EMPTY) continue;
        var w = POW3[j];
        if (v === BLACK) { i1 += w; i2 += 2 * w; }
        else if (v === WHITE) { i1 += 2 * w; i2 += w; }
        else { i1 += 2 * w; i2 += 2 * w; }
      }
      var sh = 3 * d, mask = ~(7 << sh);
      this._applyKey(1, q, (this.keys[1][q] & mask) | (PAT[i1] << sh));
      this._applyKey(2, q, (this.keys[2][q] & mask) | (PAT[i2] << sh));
    }

    _lines(c) {
      var cells = this.cells;
      for (var d = 0; d < 4; d++) {
        var s = this.steps[d];
        for (var k = 1; k <= 4; k++) {
          var q = c + k * s;
          if (cells[q] === EMPTY) this._updDir(q, d);
          q = c - k * s;
          if (cells[q] === EMPTY) this._updDir(q, d);
        }
      }
    }

    _make(c, p) {
      this.cells[c] = p;
      this.h1 ^= this.z1[p][c]; this.h2 ^= this.z2[p][c];
      this.stones++;
      var nb = this.nb, o = this.nbOff;
      for (var k = 0; k < o.length; k++) nb[c + o[k]]++;
      this._applyKey(1, c, 0); this._applyKey(2, c, 0);
      this._lines(c);
    }

    _unmake(c) {
      var p = this.cells[c];
      this.cells[c] = EMPTY;
      this.h1 ^= this.z1[p][c]; this.h2 ^= this.z2[p][c];
      this.stones--;
      var nb = this.nb, o = this.nbOff;
      for (var k = 0; k < o.length; k++) nb[c + o[k]]--;
      for (var d = 0; d < 4; d++) this._updDir(c, d);
      this._lines(c);
    }

    _find(p, cls) {
      var cells = this.cells, K = this.keys[p], inner = this.inner;
      for (var t = 0; t < inner.length; t++) {
        var i = inner[t];
        if (cells[i] === EMPTY && CLS[K[i]] === cls) return i;
      }
      return -1;
    }

    // Casilla que completa cinco para p en las líneas que pasan por m
    _findFiveNear(m, p) {
      var cells = this.cells, K = this.keys[p];
      for (var d = 0; d < 4; d++) {
        var s = this.steps[d];
        for (var k = 1; k <= 4; k++) {
          var q = m + k * s;
          if (cells[q] === EMPTY && CLS[K[q]] === 8) return q;
          q = m - k * s;
          if (cells[q] === EMPTY && CLS[K[q]] === 8) return q;
        }
      }
      return -1;
    }

    _eval(p) {
      return Math.round(this.tot[p] * 1.1 - this.tot[3 - p]);
    }

    // ===================== generación de jugadas =====================
    _gen(p, ply, width) {
      var o = 3 - p, cells = this.cells, nb = this.nb, inner = this.inner;
      var KP = this.keys[p], KO = this.keys[o];
      var mv = this.mv[ply], ms = this.ms[ply], cnt = 0, t, i;
      if (this.cnt[o][8] > 0) {                    // obligado a bloquear un cinco
        for (t = 0; t < inner.length; t++) {
          i = inner[t];
          if (cells[i] === EMPTY && CLS[KO[i]] === 8) mv[cnt++] = i;
        }
        return cnt;
      }
      var restricted = this.cnt[o][7] > 0;          // el rival amenaza cuatro abierto
      for (t = 0; t < inner.length; t++) {
        i = inner[t];
        if (cells[i] !== EMPTY || nb[i] === 0) continue;
        var kp = KP[i], ko = KO[i];
        if (restricted && CLS[kp] < 6 && MAXL[ko] < 5) continue;
        mv[cnt] = i;
        ms[cnt] = CSC[kp] + 0.8 * CSC[ko];
        cnt++;
      }
      var lim = cnt < width ? cnt : width;
      for (var a = 0; a < lim; a++) {             // selección parcial de las mejores
        var b = a;
        for (var j = a + 1; j < cnt; j++) if (ms[j] > ms[b]) b = j;
        if (b !== a) {
          var tm = mv[a]; mv[a] = mv[b]; mv[b] = tm;
          var ts = ms[a]; ms[a] = ms[b]; ms[b] = ts;
        }
      }
      return lim;
    }

    // ============================ alfa-beta ============================
    _negamax(p, depth, alpha, beta, ply) {
      if ((++this.nodes & 1023) === 0 && Date.now() > this.deadline) throw TIMEOUT;
      var o = 3 - p;
      if (this.cnt[p][8] > 0) return WIN - ply;
      if (this.cnt[o][8] >= 2) return -(WIN - ply - 1);
      if (depth <= 0) {
        if (this.cnt[o][8] === 1 && ply < MAX_PLY) depth = 1;     // extensión: bloqueo forzado
        else {
          if (this.cnt[o][8] === 0 && this.cnt[p][7] > 0) return WIN_SOFT - ply;
          return this._eval(p);
        }
      }
      if (ply >= MAX_PLY) return this._eval(p);

      var k1 = this.h1 ^ (p === WHITE ? this.side1 : 0);
      var k2 = this.h2 ^ (p === WHITE ? this.side2 : 0);
      var ti = k1 & this.ttMask, ttm = -1;
      if (this.ttDepth[ti] >= 0 && this.ttKey[ti] === k2) {
        ttm = this.ttMove[ti];
        if (this.ttDepth[ti] >= depth) {
          var tv = this.ttVal[ti], tf = this.ttFlag[ti];
          if (tf === 0) return tv;
          if (tf === 1 && tv >= beta) return tv;
          if (tf === 2 && tv <= alpha) return tv;
        }
      }

      var width = ply <= 1 ? 12 : ply === 2 ? 10 : ply === 3 ? 8 : 6;
      var cnt = this._gen(p, ply, width);
      if (cnt === 0) return 0;                     // tablero lleno: empate
      var mv = this.mv[ply];
      if (ttm >= 0) {
        for (var j = 1; j < cnt; j++) if (mv[j] === ttm) { mv[j] = mv[0]; mv[0] = ttm; break; }
      }

      var a0 = alpha, best = -INF, bm = mv[0];
      for (var i = 0; i < cnt; i++) {
        var m = mv[i], v;
        this._make(m, p);
        try { v = -this._negamax(o, depth - 1, -beta, -alpha, ply + 1); }
        finally { this._unmake(m); }
        if (v > best) { best = v; bm = m; }
        if (v > alpha) alpha = v;
        if (alpha >= beta) break;
      }
      this.ttKey[ti] = k2;
      this.ttVal[ti] = best;
      this.ttDepth[ti] = depth;
      this.ttFlag[ti] = best <= a0 ? 2 : best >= beta ? 1 : 0;
      this.ttMove[ti] = bm;
      return best;
    }

    _search(p, deadline) {
      this.deadline = deadline;
      var o = 3 - p, start = Date.now();
      var cnt = this._gen(p, 0, this.cfg.rootWidth);
      if (cnt === 0) return null;
      var order = Array.from(this.mv[0].subarray(0, cnt));
      var best = { move: order[0], score: this._eval(p), depth: 0, order: order.slice() };
      var maxD = Math.min(this.cfg.maxDepth, this.n * this.n - this.stones);
      for (var d = 1; d <= maxD; d++) {
        var alpha = -INF, bm = -1, bs = -INF, vals = new Array(order.length);
        var done = true;
        try {
          for (var k = 0; k < order.length; k++) {
            var m = order[k], v;
            this._make(m, p);
            try { v = -this._negamax(o, d - 1, -INF, -alpha, 1); }
            finally { this._unmake(m); }
            vals[k] = v;
            if (v > bs) { bs = v; bm = m; }
            if (v > alpha) alpha = v;
          }
        } catch (e) {
          if (e !== TIMEOUT) throw e;
          done = false;
        }
        if (!done) break;
        var idx = order.map(function (_, i) { return i; });
        idx.sort(function (a, b) { return vals[b] - vals[a]; });
        order = idx.map(function (i) { return order[i]; });
        best = { move: bm, score: bs, depth: d, order: order.slice() };
        if (bs >= WIN - 1000 || bs <= -(WIN - 1000) || cnt === 1) break;
        if (Date.now() - start > (deadline - start) * 0.35) break;
      }
      return best;
    }

    // =============================== VCF ===============================
    _vcfRoot(p) {
      this.vcfMove = -1;
      this.vcfFail = new Map();
      return this._vcf(p, this.cfg.vcfDepth, 0);
    }

    _vcf(p, depth, ply) {
      if ((++this.nodes & 255) === 0 && Date.now() > this.deadline) throw TIMEOUT;
      var o = 3 - p;
      if (this.cnt[p][8] > 0) { if (ply === 0) this.vcfMove = this._find(p, 8); return true; }
      if (this.cnt[o][8] > 0) {                    // debo bloquear, y el bloqueo debe ser un cuatro
        if (this.cnt[o][8] >= 2) return false;
        var b = this._find(o, 8);
        if (MAXL[this.keys[p][b]] < 5) return false;
        return this._vcfFour(p, b, depth, ply);
      }
      if (depth <= 0 || ply >= MAX_PLY) return false;
      var key = this.h1 ^ (p === WHITE ? this.side1 : 0);
      var f = this.vcfFail.get(key);
      if (f !== undefined && f >= depth) return false;

      var cells = this.cells, K = this.keys[p], inner = this.inner, list = [];
      for (var t = 0; t < inner.length; t++) {
        var i = inner[t];
        if (cells[i] === EMPTY && CLS[K[i]] >= 6) list.push(i);
      }
      list.sort(function (a, b) { return CSC[K[b]] - CSC[K[a]]; });
      for (var j = 0; j < list.length; j++) {
        if (this._vcfFour(p, list[j], depth, ply)) return true;
      }
      this.vcfFail.set(key, depth);
      return false;
    }

    _vcfFour(p, m, depth, ply) {
      var o = 3 - p;
      this._make(m, p);
      try {
        var c8 = this.cnt[p][8];
        if (c8 === 0) return false;
        if (c8 >= 2) { if (ply === 0) this.vcfMove = m; return true; }
        var f = this._findFiveNear(m, p);
        if (f < 0) f = this._find(p, 8);
        if (CLS[this.keys[o][f]] === 8) return false;   // el bloqueo del rival hace cinco
        var r;
        this._make(f, o);
        try { r = this._vcf(p, depth - 1, ply + 1); }
        finally { this._unmake(f); }
        if (r && ply === 0) this.vcfMove = m;
        return r;
      } finally {
        this._unmake(m);
      }
    }

    // ========================= decisión de jugada =========================
    // Devuelve { move, score } con score desde la perspectiva de p
    _think(p, deadline) {
      var o = 3 - p;
      if (this.stones === 0) {
        var c = (this.n - 1) >> 1;
        return { move: this._idx(c, c), score: 0 };
      }
      var w = this._find(p, 8);
      if (w >= 0) return { move: w, score: WIN };
      if (this.cnt[o][8] > 0) {
        return { move: this._find(o, 8), score: this.cnt[o][8] > 1 ? -WIN : this._eval(p) };
      }
      var now = Date.now(), total = Math.max(1, deadline - now);

      this.deadline = now + total * 0.25;
      try {
        if (this._vcfRoot(p) && this.vcfMove >= 0) return { move: this.vcfMove, score: WIN };
      } catch (e) { if (e !== TIMEOUT) throw e; }

      var res = this._search(p, now + total * 0.8);
      if (!res) return null;

      if (res.score < WIN - 1000) {                 // no regalar un VCF al rival
        this.deadline = deadline;
        var order = res.order, chosen = order[0];
        try {
          for (var k = 0; k < order.length && k < 8; k++) {
            chosen = order[k];
            var m = chosen, lose;
            this._make(m, p);
            try { lose = this._vcfRoot(o); } finally { this._unmake(m); }
            if (!lose) break;
            if (k === order.length - 1 || k === 7) chosen = order[0];
          }
        } catch (e) { if (e !== TIMEOUT) throw e; }
        res.move = chosen;
      }
      return res;
    }

    _bestMove(p, deadline) {
      var r = this._think(p, deadline);
      if (r && r.move >= 0) return r.move;
      var c = this._find(p, 0);
      return c;
    }

    // Estados '2' y '3': mueven blancas a continuación. Si la posición favorece
    // a blancas jugamos la blanca; si no, nos quedamos con negras ('BLACK').
    _chooseColor(deadline) {
      var r = this._think(WHITE, deadline);
      if (!r || r.move < 0) return 'BLACK';
      return r.score >= 0 ? this._xy(r.move) : 'BLACK';
    }

    // Estado '1': poner 2 negras y 1 blanca buscando una posición equilibrada,
    // para que al rival le cueste decidir qué color tomar.
    _opening(deadline) {
      var n = this.n, m = (n - 1) >> 1, self = this;
      if (n < 3) return null;
      var c0 = this._idx(m, m), ring = [];
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
        var x = m + dx, y = m + dy;
        if ((dx || dy) && x >= 0 && y >= 0 && x < n && y < n) ring.push(this._idx(x, y));
      }
      if (ring.length < 2) return null;
      var combos = [];
      for (var a = 0; a < ring.length; a++) for (var b = 0; b < ring.length; b++) {
        if (a === b) continue;
        this._make(c0, BLACK); this._make(ring[a], BLACK); this._make(ring[b], WHITE);
        var v = this._eval(WHITE);
        this._unmake(ring[b]); this._unmake(ring[a]); this._unmake(c0);
        combos.push({ b2: ring[a], w: ring[b], v: Math.abs(v) });
      }
      combos.sort(function (p, q) { return p.v - q.v; });
      var top = combos.slice(0, 6), best = top[0], bestV = Infinity;
      for (var i = 0; i < top.length; i++) {
        var left = deadline - Date.now();
        if (left < 5) break;
        var t = top[i];
        this._make(c0, BLACK); this._make(t.b2, BLACK); this._make(t.w, WHITE);
        var res;
        try { res = this._search(WHITE, Date.now() + left / (top.length - i)); }
        finally { this._unmake(t.w); this._unmake(t.b2); this._unmake(c0); }
        var sv = res ? Math.abs(res.score) : t.v;
        if (sv < bestV) { bestV = sv; best = t; }
      }
      return [self._xy(c0), self._xy(best.b2), self._xy(best.w)];
    }
  }

  return AgenteGomoku;
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { AgenteGomoku: AgenteGomoku };
