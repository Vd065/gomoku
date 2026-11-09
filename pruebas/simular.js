/**
 * Simulador en Node: ejecuta el Environment REAL de gomoku.js (sin modificarlo)
 * con un Konekti mínimo simulado, para enfrentar agentes sin navegador.
 *
 * Uso:  node pruebas/simular.js [partidas] [tamaño] [segundos]
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function crearContexto() {
  const elements = {};
  const vc = (id) => elements[id] || (elements[id] = { value: '', innerHTML: '' });
  const ctx = {
    console, Date, Math, setTimeout, clearTimeout,
    Konekti: { vc, client: { canvas: { setText() {} } } }
  };
  vm.createContext(ctx);
  vm.runInContext('class MainClient {}', ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'gomoku.js'), 'utf8'), ctx, { filename: 'gomoku.js' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'AgenteGomoku.js'), 'utf8'), ctx, { filename: 'AgenteGomoku.js' });
  // Aleatorio rápido (misma lógica que RandomPlayer, sin los bucles de espera)
  vm.runInContext(`
    class FastRandom extends Agent {
      constructor(){ super(); this.board = new Board() }
      compute(board, s){
        var mv = this.board.valid_moves(board), pick = () => mv.splice(Math.floor(Math.random()*mv.length),1)[0]
        if (s=='1') return [pick(), pick(), pick()]
        if (s=='2' || s=='3') return Math.random()<0.5 ? 'BLACK' : pick()
        return pick()
      }
    }
    globalThis.FastRandom = FastRandom
    globalThis.AgenteGomoku = AgenteGomoku
  `, ctx);
  return { ctx, vc };
}

// Envuelve un agente para medir el tiempo de cada jugada
function medido(agent, stats) {
  const orig = agent.compute.bind(agent);
  agent.compute = (b, s, t) => {
    const t0 = Date.now();
    const r = orig(b, s, t);
    const dt = Date.now() - t0;
    stats.moves++; stats.total += dt; stats.max = Math.max(stats.max, dt);
    return r;
  };
  return agent;
}

function jugar(nombreNegras, agNegras, nombreBlancas, agBlancas, size, secs) {
  const { ctx, vc } = crearContexto();
  vc('B').value = nombreNegras;
  vc('W').value = nombreBlancas;
  vc('time').value = String(secs);
  vc('size').value = String(size);
  const env = vm.runInContext('new Environment()', ctx);
  const players = {};
  players[nombreNegras] = agNegras(ctx);
  players[nombreBlancas] = agBlancas(ctx);
  env.setPlayers(players);
  env.play();
  return new Promise((resolve) => {
    const iv = setInterval(() => {
      if (env.winner !== '') {
        clearInterval(iv);
        const filas = env.rb.map(r => r.map(c => c === ' ' ? '.' : c).join(' '));
        resolve({ winner: env.winner, board: filas.join('\n'), time: env.ptime });
      }
    }, 20);
  });
}

async function main() {
  const partidas = parseInt(process.argv[2] || '4', 10);
  const size = parseInt(process.argv[3] || '15', 10);
  const secs = parseInt(process.argv[4] || '60', 10);
  const stats = { moves: 0, total: 0, max: 0 };
  const rivales = {
    aleatorio: (ctx) => new ctx.FastRandom(),
    goloso: (ctx) => new ctx.AgenteGomoku({ maxDepth: 1, vcfDepth: 0, maxMoveMs: 30 }),
    agente: (ctx) => new ctx.AgenteGomoku()
  };
  const resumen = {};
  for (const [nombreRival, crearRival] of Object.entries(rivales)) {
    let gana = 0;
    for (let g = 0; g < partidas; g++) {
      const yoNegras = g % 2 === 0;           // alternar quién inicia el Swap2
      const yo = (ctx) => medido(new ctx.AgenteGomoku(), stats);
      const r = yoNegras
        ? await jugar('yo', yo, 'rival', crearRival, size, secs)
        : await jugar('rival', crearRival, 'yo', yo, size, secs);
      const ok = r.winner.startsWith('yo');
      if (ok) gana++;
      console.log(`[${nombreRival}] partida ${g + 1}: ${r.winner}`);
      if (!ok && nombreRival !== 'agente') console.log(r.board);
    }
    resumen[nombreRival] = `${gana}/${partidas}`;
  }
  console.log('\nVictorias de "yo":', resumen);
  console.log(`Jugadas: ${stats.moves}, promedio ${(stats.total / stats.moves).toFixed(1)} ms, máximo ${stats.max} ms`);
}

main();
