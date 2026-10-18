// Textbook-style property tables generated from the equation of state (our own computation, not copied tables),
// and the linear-interpolation trace a student would do by hand.
import { prop, fluidInfo, crit } from './props.js';

const range = (a, b, s) => { const r = []; for (let x = a; x <= b + 1e-9; x += s) r.push(+x.toFixed(6)); return r; };
export const GRIDS = {
  Water: {
    satT: [0.01, ...range(5, 370, 5), 373.95].map(c => c + 273.15),
    satP: [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300, 325, 350, 375, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000, 1100, 1200, 1300, 1400, 1500, 1750, 2000, 2250, 2500, 3000, 3500, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000, 13000, 14000, 15000, 16000, 17000, 18000, 19000, 20000, 21000, 22000].map(k => k * 1e3),
    supP: [0.01, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 6.0, 7.0, 8.0, 9.0, 10, 12.5, 15, 17.5, 20, 25, 30, 35, 40, 50, 60].map(m => m * 1e6),
    supT: [50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300].map(c => c + 273.15),
    liqP: [5, 10, 15, 20, 30, 50].map(m => m * 1e6),
    liqT: [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 320, 340].map(c => c + 273.15),
  },
  _refrigerant: {
    satT: range(-40, 100, 2).map(c => c + 273.15),
    satP: [60, 70, 80, 90, 100, 120, 140, 160, 180, 200, 240, 280, 320, 360, 400, 500, 600, 700, 800, 900, 1000, 1200, 1400, 1600, 1800, 2000, 2500, 3000].map(k => k * 1e3),
    supP: [0.06, 0.10, 0.14, 0.18, 0.20, 0.24, 0.28, 0.32, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00, 1.20, 1.40, 1.60, 2.0, 2.5, 3.0].map(m => m * 1e6),
    supT: range(-40, 180, 10).map(c => c + 273.15),
    liqP: [], liqT: [],
  },
};
export function gridFor(fluid) {
  const f = fluidInfo(fluid);
  if (f.ideal) return null;
  if (f.id === 'Water') return GRIDS.Water;
  if (f.refrigerant) {
    const c = crit(f);
    const g = GRIDS._refrigerant;
    return { ...g, satT: g.satT.filter(T => T < c.T - 0.5), satP: g.satP.filter(P => P < c.P * 0.98), supP: g.supP.filter(P => P < c.P * 0.98) };
  }
  return null;
}
const PROPS = ['v', 'u', 'h', 's'];
function satRow(f, by, val) {
  const a = { [by]: val };
  const r = { [by === 'T' ? 'P' : 'T']: prop(by === 'T' ? 'P' : 'T', f, { ...a, x: 0 }), [by]: val };
  for (const p of PROPS) { r[p + 'f'] = prop(p, f, { ...a, x: 0 }); r[p + 'g'] = prop(p, f, { ...a, x: 1 }); r[p + 'fg'] = r[p + 'g'] - r[p + 'f']; }
  return r;
}
export function satTable(fluid, by = 'T', grid) {
  const f = fluidInfo(fluid); const g = grid || gridFor(f)?.[by === 'T' ? 'satT' : 'satP'] || [];
  return g.map(v => { try { return satRow(f, by, v); } catch { return null; } }).filter(Boolean);
}
export function superheatTable(fluid, P, temps) {
  const f = fluidInfo(fluid); const g = gridFor(f);
  const Ts = prop('T', f, { P, x: 1 });
  const rows = [{ T: Ts, sat: true, v: prop('v', f, { P, x: 1 }), u: prop('u', f, { P, x: 1 }), h: prop('h', f, { P, x: 1 }), s: prop('s', f, { P, x: 1 }) }];
  for (const T of (temps || g.supT)) if (T > Ts + 1e-6) { try { rows.push({ T, v: prop('v', f, { P, T }), u: prop('u', f, { P, T }), h: prop('h', f, { P, T }), s: prop('s', f, { P, T }) }); } catch {} }
  return rows;
}
export function liquidTable(fluid, P, temps) {
  const f = fluidInfo(fluid); const Ts = prop('T', f, { P, x: 0 });
  return (temps || gridFor(f).liqT).filter(T => T < Ts).map(T => ({ T, v: prop('v', f, { P, T }), u: prop('u', f, { P, T }), h: prop('h', f, { P, T }), s: prop('s', f, { P, T }) }));
}
const lerp = (x, x1, x2, y1, y2) => y1 + (x - x1) / (x2 - x1) * (y2 - y1);
function bracket(arr, x) {
  for (let i = 0; i < arr.length - 1; i++) if ((arr[i] - x) * (arr[i + 1] - x) <= 0) return i;
  return -1;
}
// Build a textbook-style lookup for property `out` given args. Returns null when no sensible table path exists.
export function textbookLookup(fluid, out, args) {
  let f; try { f = fluidInfo(fluid); } catch { return null; }
  const g = gridFor(f); if (!g) return null;
  if (!['h', 's', 'v', 'u', 'T', 'P', 'x'].includes(out)) return null;
  const keys = Object.keys(args).sort().join(',');
  const exact = (() => { try { return prop(out, f, args); } catch { return NaN; } })();
  try {
    // saturated mixture by P or T
    if (keys === 'P,x' || keys === 'T,x') {
      const by = args.P !== undefined ? 'P' : 'T'; const val = args[by]; const x = args.x;
      if (!['h', 's', 'v', 'u'].includes(out)) return null;
      const grid = by === 'P' ? g.satP : g.satT;
      const i = bracket(grid, val); if (i < 0) return null;
      const steps = [];
      let row;
      if (Math.abs(grid[i] - val) < 1e-9 * val || Math.abs(grid[i + 1] - val) < 1e-9 * val) {
        row = satRow(f, by, Math.abs(grid[i] - val) < 1e-9 * val ? grid[i] : grid[i + 1]);
        steps.push({ type: 'satRow', by, row });
      } else {
        const r1 = satRow(f, by, grid[i]), r2 = satRow(f, by, grid[i + 1]);
        row = { [by]: val };
        for (const k of [out + 'f', out + 'fg', out + 'g']) row[k] = lerp(val, r1[by], r2[by], r1[k], r2[k]);
        steps.push({ type: 'satInterp', by, r1, r2, val, keys: [out + 'f', out + 'fg'], row });
      }
      const value = row[out + 'f'] + x * row[out + 'fg'];
      steps.push({ type: 'mix', out, x, f: row[out + 'f'], fg: row[out + 'fg'], value });
      return { table: `Saturated ${f.label} — ${by === 'P' ? 'pressure' : 'temperature'} table`, steps, value, exact };
    }
    // superheated / compressed by (P,T) or (P,s) or (P,h)
    if (args.P !== undefined && (args.T !== undefined || args.s !== undefined || args.h !== undefined)) {
      const P = args.P; const inKey = args.T !== undefined ? 'T' : args.s !== undefined ? 's' : 'h';
      const Tsat = prop('T', f, { P, x: 0 });
      if (inKey !== 'T') {
        const sf = prop(inKey, f, { P, x: 0 }), sg = prop(inKey, f, { P, x: 1 });
        if (args[inKey] >= sf && args[inKey] <= sg) {
          // inside the dome: quality from the saturated table
          const grid = g.satP; const i = bracket(grid, P); if (i < 0) return null;
          let row; const steps = [];
          const onGrid = grid.find(p => Math.abs(p - P) < 1e-9 * P);
          if (onGrid) { row = satRow(f, 'P', onGrid); steps.push({ type: 'satRow', by: 'P', row }); }
          else { const r1 = satRow(f, 'P', grid[i]), r2 = satRow(f, 'P', grid[i + 1]); row = { P }; for (const k of Object.keys(r1)) row[k] = lerp(P, r1.P, r2.P, r1[k], r2[k]); steps.push({ type: 'satInterp', by: 'P', r1, r2, val: P, keys: [inKey + 'f', inKey + 'fg', ...(out !== 'x' && out !== 'T' ? [out + 'f', out + 'fg'] : [])], row }); }
          const x = (args[inKey] - row[inKey + 'f']) / row[inKey + 'fg'];
          steps.push({ type: 'quality', inKey, given: args[inKey], f: row[inKey + 'f'], fg: row[inKey + 'fg'], x });
          let value = x;
          if (out === 'T') value = row.T;
          else if (out !== 'x') { value = row[out + 'f'] + x * row[out + 'fg']; steps.push({ type: 'mix', out, x, f: row[out + 'f'], fg: row[out + 'fg'], value }); }
          return { table: `Saturated ${f.label} — pressure table`, steps, value, exact };
        }
      }
      const superheated = inKey === 'T' ? args.T > Tsat : args[inKey] > prop(inKey, f, { P, x: 1 });
      const pGrid = superheated ? g.supP : g.liqP;
      if (!superheated && !pGrid.length) return null;
      const tableFor = (p) => superheated ? superheatTable(f, p) : liquidTable(f, p);
      const lookAt = (p) => {
        const rows = tableFor(p); const col = rows.map(r => r[inKey]);
        const j = bracket(col, args[inKey]); if (j < 0) return null;
        const r1 = rows[j], r2 = rows[j + 1];
        return { P: p, r1, r2, inKey, given: args[inKey], value: lerp(args[inKey], r1[inKey], r2[inKey], r1[out], r2[out]) };
      };
      const steps = [];
      const onGrid = pGrid.find(p => Math.abs(p - P) < 1e-9 * P);
      let value;
      if (onGrid) { const s = lookAt(onGrid); if (!s) return null; steps.push({ type: 'interp', out, ...s }); value = s.value; }
      else {
        const i = bracket(pGrid, P); if (i < 0) return null;
        const a = lookAt(pGrid[i]), b = lookAt(pGrid[i + 1]); if (!a || !b) return null;
        steps.push({ type: 'interp', out, ...a }, { type: 'interp', out, ...b });
        value = lerp(P, pGrid[i], pGrid[i + 1], a.value, b.value);
        steps.push({ type: 'interpP', out, P, P1: pGrid[i], P2: pGrid[i + 1], y1: a.value, y2: b.value, value });
      }
      return { table: `${superheated ? 'Superheated vapour' : 'Compressed liquid'} — ${f.label}`, steps, value, exact };
    }
  } catch { return null; }
  return null;
}
