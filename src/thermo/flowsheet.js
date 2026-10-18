// Flowsheet model: components + streams → EES-style equations (the same solver as the equation editor).
// Streams carry P[n], h[n], m[n]; T[n], s[n] are derived by property functions.
import { solve } from '../core/solver.js';
import { prop, state, fluidInfo, Tsat as TsatF } from '../core/props.js';

// port: [name, 'in'|'out', dx, dy] (position relative to the component centre, for the canvas)
export const COMPONENTS = {
  pump:       { label: 'Pump', ports: [['in', 'in', -30, 10], ['out', 'out', 30, -10]], params: { Pspec: 'P', P: 3000, Tsat: 100, ratio: 10, eta: 1 }, work: 'in' },
  compressor: { label: 'Compressor', ports: [['in', 'in', -34, 16], ['out', 'out', 34, -16]], params: { Pspec: 'P', P: 800, Tsat: 31.3, ratio: 8, eta: 1 }, work: 'in' },
  turbine:    { label: 'Turbine', ports: [['in', 'in', -34, -16], ['out', 'out', 34, 16]], params: { Pspec: 'P', P: 10, Tsat: 45.8, ratio: 0.1, eta: 1 }, work: 'out' },
  boiler:     { label: 'Boiler / heater', ports: [['in', 'in', -40, 0], ['out', 'out', 40, 0]], params: { spec: 'T', T: 600, x: 1, dT: 5, Q: 1000, dP: 0 }, heat: 'in' },
  heater:     { label: 'Heater / combustor', ports: [['in', 'in', -40, 0], ['out', 'out', 40, 0]], params: { spec: 'T', T: 1300, x: 1, dT: 5, Q: 1000, dP: 0 }, heat: 'in' },
  condenser:  { label: 'Condenser', ports: [['in', 'in', 40, 0], ['out', 'out', -40, 0]], params: { spec: 'x', T: 30, x: 0, dT: 0, Q: -1000, dP: 0 }, heat: 'out' },
  evaporator: { label: 'Evaporator', ports: [['in', 'in', -40, 0], ['out', 'out', 40, 0]], params: { spec: 'x', T: 0, x: 1, dT: 0, Q: 1000, dP: 0 }, heat: 'in', coolingEffect: true },
  cooler:     { label: 'Heat rejection (cooler)', ports: [['in', 'in', 40, 0], ['out', 'out', -40, 0]], params: { spec: 'T', T: 27, x: 0, dT: 0, Q: -1000, dP: 0 }, heat: 'out' },
  valve:      { label: 'Expansion valve', ports: [['in', 'in', 0, -26], ['out', 'out', 0, 26]], params: { Pspec: 'P', P: 140, Tsat: -18.8, ratio: 0.2 } },
  splitter:   { label: 'Splitter / extraction', ports: [['in', 'in', -20, 0], ['out1', 'out', 20, -12], ['out2', 'out', 20, 12]], params: { yMode: 'auto', y: 0.2 } },
  mixer:      { label: 'Open feedwater heater / mixer', ports: [['in1', 'in', -30, -14], ['in2', 'in', -30, 14], ['out', 'out', 30, 0]], params: { outSpec: 'satliq' } },
  regenerator:{ label: 'Regenerator (recuperator)', ports: [['hin', 'in', 36, -18], ['hout', 'out', -36, -18], ['cin', 'in', -36, 18], ['cout', 'out', 36, 18]], params: { eps: 0.8 } },
};

let uid = 0;
export function newComponent(type, x, y, params = {}) {
  const def = COMPONENTS[type];
  return { id: type + (++uid), type, x, y, label: '', params: { ...def.params, ...params } };
}
export function resetIds(model) {
  let max = 0; for (const c of model.components) { const n = +(c.id.match(/(\d+)$/)?.[1] || 0); if (n > max) max = n; } uid = Math.max(uid, max);
}

// model: { fluid, components: [...], streams: [{ id:n, from:[compId, port], to:[compId, port] }], massFlow: { stream:n, value } , kind }
export function compileFlowsheet(fs) {
  const F = fluidInfo(fs.fluid).id;
  const L = [];
  const errs = [];
  const sOut = new Map(), sIn = new Map();
  for (const s of fs.streams) { sOut.set(s.from[0] + '.' + s.from[1], s.id); sIn.set(s.to[0] + '.' + s.to[1], s.id); }
  const comps = fs.components;
  L.push(`"=== Generated from the system canvas: working fluid ${F} ==="`);
  const massEqs = new Map(); // stream -> equation text defining m[stream]
  const W = [], Qin = [], Qout = [], Qcool = [];
  const pSpec = (c, sin, sout) => {
    const p = c.params;
    if (p.Pspec === 'P') return `P[${sout}] = ${+p.P} [kPa]`;
    if (p.Pspec === 'Tsat') return `P[${sout}] = p_sat(${F}, T=${+p.Tsat} [C])`;
    return `P[${sout}] = ${+p.ratio} * P[${sin}]`;
  };
  for (const c of comps) {
    const def = COMPONENTS[c.type]; const p = c.params;
    const port = (name) => { const key = c.id + '.' + name; const d = def.ports.find(q => q[0] === name)[1]; const n = d === 'in' ? sIn.get(key) : sOut.get(key); if (n === undefined) errs.push(`${c.id}: port "${name}" is not connected`); return n; };
    const id = c.id;
    L.push(`"--- ${def.label} ${id} ---"`);
    switch (c.type) {
      case 'pump': case 'compressor': case 'turbine': {
        const a = port('in'), b = port('out'); if (a === undefined || b === undefined) break;
        L.push(pSpec(c, a, b));
        L.push(`eta_${id} = ${+p.eta}`);
        L.push(`h_s_${id} = enthalpy(${F}, P=P[${b}], s=s[${a}])`);
        if (c.type === 'turbine') { L.push(`h[${b}] = h[${a}] - eta_${id}*(h[${a}] - h_s_${id})`); L.push(`W_dot_${id} = m[${a}]*(h[${a}] - h[${b}])`); W.push(`W_dot_${id}`); }
        else { L.push(`h[${b}] = h[${a}] + (h_s_${id} - h[${a}])/eta_${id}`); L.push(`W_dot_${id} = m[${a}]*(h[${b}] - h[${a}])`); W.push(`-W_dot_${id}`); }
        massEqs.set(b, `m[${b}] = m[${a}]`);
        break;
      }
      case 'boiler': case 'heater': case 'condenser': case 'evaporator': case 'cooler': {
        const a = port('in'), b = port('out'); if (a === undefined || b === undefined) break;
        L.push(+p.dP ? `P[${b}] = P[${a}] - ${+p.dP} [kPa]` : `P[${b}] = P[${a}]`);
        if (p.spec === 'T') L.push(`h[${b}] = enthalpy(${F}, P=P[${b}], T=${+p.T} [C])`);
        else if (p.spec === 'x') L.push(`h[${b}] = enthalpy(${F}, P=P[${b}], x=${+p.x})`);
        else if (p.spec === 'dT') { const hot = c.type === 'boiler' || c.type === 'heater' || c.type === 'evaporator'; L.push(`h[${b}] = enthalpy(${F}, P=P[${b}], T=t_sat(${F}, P=P[${b}]) ${hot ? '+' : '-'} ${Math.max(0.01, +p.dT)} [K])`); }
        else if (p.spec === 'Q') L.push(`Q_dot_${id} = ${+p.Q} [kW]`);
        if (p.spec !== 'Q') L.push(`Q_dot_${id} = m[${a}]*(h[${b}] - h[${a}])`);
        else L.push(`h[${b}] = h[${a}] + Q_dot_${id}/m[${a}]`);
        massEqs.set(b, `m[${b}] = m[${a}]`);
        if (def.heat === 'in') (def.coolingEffect ? Qcool : Qin).push(`Q_dot_${id}`); else Qout.push(`Q_dot_${id}`);
        break;
      }
      case 'valve': {
        const a = port('in'), b = port('out'); if (a === undefined || b === undefined) break;
        L.push(pSpec(c, a, b));
        L.push(`h[${b}] = h[${a}]`);
        massEqs.set(b, `m[${b}] = m[${a}]`);
        break;
      }
      case 'splitter': {
        const a = port('in'), b = port('out1'), d = port('out2'); if ([a, b, d].includes(undefined)) break;
        L.push(`P[${b}] = P[${a}]`, `h[${b}] = h[${a}]`, `P[${d}] = P[${a}]`, `h[${d}] = h[${a}]`);
        if (p.yMode !== 'auto') L.push(`y_${id} = ${+p.y}`);
        else L.push(`"y_${id} (fraction to branch 1) is solved from the mixer outlet condition"`);
        massEqs.set(b, `m[${b}] = y_${id}*m[${a}]`);
        massEqs.set(d, `m[${d}] = m[${a}] - m[${b}]`);
        break;
      }
      case 'mixer': {
        const a = port('in1'), b = port('in2'), o = port('out'); if ([a, b, o].includes(undefined)) break;
        L.push(`P[${o}] = P[${a}]`);
        massEqs.set(o, `m[${o}] = m[${a}] + m[${b}]`);
        if (p.outSpec === 'satliq') { L.push(`h[${o}] = enthalpy(${F}, P=P[${o}], x=0)`); L.push(`m[${o}]*h[${o}] = m[${a}]*h[${a}] + m[${b}]*h[${b}]`); }
        else L.push(`h[${o}] = (m[${a}]*h[${a}] + m[${b}]*h[${b}])/m[${o}]`);
        break;
      }
      case 'regenerator': {
        const hi = port('hin'), ho = port('hout'), ci = port('cin'), co = port('cout'); if ([hi, ho, ci, co].includes(undefined)) break;
        L.push(`eps_${id} = ${+p.eps}`);
        L.push(`P[${ho}] = P[${hi}]`, `P[${co}] = P[${ci}]`);
        L.push(`h_hc_${id} = enthalpy(${F}, P=P[${ci}], T=T[${hi}]) "cold stream heated to the hot inlet temperature (limit)"`);
        L.push(`h[${co}] = h[${ci}] + eps_${id}*(h_hc_${id} - h[${ci}])`);
        L.push(`Q_dot_${id} = m[${ci}]*(h[${co}] - h[${ci}])`);
        L.push(`h[${ho}] = h[${hi}] - Q_dot_${id}/m[${hi}]`);
        massEqs.set(ho, `m[${ho}] = m[${hi}]`); massEqs.set(co, `m[${co}] = m[${ci}]`);
        break;
      }
    }
  }
  // stream properties
  L.push(`"--- stream states ---"`);
  for (const s of fs.streams) { L.push(`T[${s.id}] = temperature(${F}, P=P[${s.id}], h=h[${s.id}])`); L.push(`s[${s.id}] = entropy(${F}, P=P[${s.id}], h=h[${s.id}])`); }
  // mass flows
  L.push(`"--- mass balances (one is replaced by the mass-flow specification) ---"`);
  const ms = fs.massFlow?.stream ?? fs.streams[0]?.id;
  for (const s of fs.streams) {
    if (s.id === ms) L.push(`m[${s.id}] = ${+(fs.massFlow?.value ?? 1)} [kg/s] "specified"`);
    else if (massEqs.has(s.id)) L.push(massEqs.get(s.id));
  }
  // summary
  L.push(`"--- cycle performance ---"`);
  const kind = fs.kind || (comps.some(c => c.type === 'evaporator' || c.type === 'valve') ? 'refrigeration' : 'power');
  const sum = (arr) => arr.length ? arr.join(' + ').replace(/\+ -/g, '- ') : '0';
  if (kind === 'power') {
    L.push(`W_dot_net = ${sum(W)}`);
    if (Qin.length) { L.push(`Q_dot_in = ${sum(Qin)}`); L.push(`eta_th = W_dot_net/Q_dot_in`); }
    if (Qout.length) L.push(`Q_dot_out = -(${sum(Qout)})`);
    const wt = W.filter(w => !w.startsWith('-')), wc = W.filter(w => w.startsWith('-')).map(w => w.slice(1));
    if (wt.length && wc.length) L.push(`bwr = (${sum(wc)})/(${sum(wt)}) "back work ratio"`);
  } else {
    L.push(`W_dot_in = -(${sum(W)})`);
    if (Qcool.length) { L.push(`Q_dot_L = ${sum(Qcool)}`); L.push(`COP_R = Q_dot_L/W_dot_in`); }
    if (Qout.length) { L.push(`Q_dot_H = -(${sum(Qout)})`); L.push(`COP_HP = Q_dot_H/W_dot_in`); }
  }
  return { text: L.join('\n'), errors: errs, kind };
}

export function solveFlowsheet(fs, opts = {}) {
  const c = compileFlowsheet(fs);
  if (c.errors.length) return { ok: false, compiled: c, messages: c.errors.map(m => ({ type: 'error', msg: m })) };
  const res = solve(c.text, opts);
  res.compiled = c;
  if (res.ok) {
    res.states = fs.streams.map(s => {
      const P = res.values[`P[${s.id}]`], h = res.values[`h[${s.id}]`];
      const st = state(fs.fluid, { P, h });
      return { id: s.id, ...st, m: res.values[`m[${s.id}]`] };
    });
    res.paths = processPaths(fs, res);
  }
  return res;
}

// intermediate states along each component's process (for property diagrams and animation)
export function processPaths(fs, res, n = 24) {
  const F = fs.fluid; const st = new Map(res.states.map(s => [s.id, s]));
  const sOut = new Map(), sIn = new Map();
  for (const s of fs.streams) { sOut.set(s.from[0] + '.' + s.from[1], s.id); sIn.set(s.to[0] + '.' + s.to[1], s.id); }
  const paths = [];
  for (const c of fs.components) {
    const def = COMPONENTS[c.type];
    const ins = def.ports.filter(p => p[1] === 'in').map(p => sIn.get(c.id + '.' + p[0]));
    const outs = def.ports.filter(p => p[1] === 'out').map(p => sOut.get(c.id + '.' + p[0]));
    const pairs = [];
    if (c.type === 'regenerator') { pairs.push([ins[0], outs[0]], [ins[1], outs[1]]); }
    else if (c.type === 'splitter') continue;
    else if (c.type === 'mixer') { for (const i of ins) pairs.push([i, outs[0], 'mix']); }
    else pairs.push([ins[0], outs[0]]);
    for (const [ia, ib, mode] of pairs) {
      const a = st.get(ia), b = st.get(ib); if (!a || !b) continue;
      const pts = [];
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        try {
          let P, args;
          if (mode === 'mix') { pts.push(k === 0 ? a : b); continue; }
          if (['pump', 'compressor', 'turbine'].includes(c.type)) { P = Math.exp(Math.log(a.P) * (1 - t) + Math.log(b.P) * t); args = { P, s: a.s + (b.s - a.s) * t }; }
          else if (c.type === 'valve') { P = Math.exp(Math.log(a.P) * (1 - t) + Math.log(b.P) * t); args = { P, h: a.h }; }
          else { P = a.P + (b.P - a.P) * t; args = { P, h: a.h + (b.h - a.h) * t }; }
          const T = prop('T', F, args), s = args.s ?? prop('s', F, args), h = args.h ?? prop('h', F, args), v = prop('v', F, args);
          pts.push({ P, T, s, h, v });
        } catch { /* skip */ }
      }
      paths.push({ comp: c.id, type: c.type, from: ia, to: ib, dashed: c.type === 'valve' || mode === 'mix', pts });
    }
  }
  return paths;
}

// ---------- templates ----------
const S = (id, from, to) => ({ id, from, to });
export const TEMPLATES = {
  rankine: () => ({
    name: 'Ideal Rankine cycle', fluid: 'Water', kind: 'power', massFlow: { stream: 1, value: 1 },
    ref: 'Çengel & Boles, Example "simple ideal Rankine cycle" (3 MPa, 350 °C, 75 kPa): η ≈ 26.0 %',
    components: [
      { id: 'pump1', type: 'pump', x: 160, y: 330, params: { ...COMPONENTS.pump.params, P: 3000 } },
      { id: 'boiler1', type: 'boiler', x: 160, y: 120, params: { ...COMPONENTS.boiler.params, spec: 'T', T: 350 } },
      { id: 'turbine1', type: 'turbine', x: 520, y: 150, params: { ...COMPONENTS.turbine.params, P: 75 } },
      { id: 'condenser1', type: 'condenser', x: 520, y: 360, params: { ...COMPONENTS.condenser.params } },
    ],
    streams: [S(1, ['condenser1', 'out'], ['pump1', 'in']), S(2, ['pump1', 'out'], ['boiler1', 'in']), S(3, ['boiler1', 'out'], ['turbine1', 'in']), S(4, ['turbine1', 'out'], ['condenser1', 'in'])],
  }),
  rankineReheat: () => ({
    name: 'Ideal reheat Rankine cycle', fluid: 'Water', kind: 'power', massFlow: { stream: 1, value: 1 },
    ref: 'Çengel & Boles, ideal reheat example (15 MPa, 600 °C, reheat to 600 °C at 4 MPa, 10 kPa): x ≈ 0.896, η ≈ 45.0 %',
    components: [
      { id: 'pump1', type: 'pump', x: 120, y: 360, params: { ...COMPONENTS.pump.params, P: 15000 } },
      { id: 'boiler1', type: 'boiler', x: 120, y: 120, params: { ...COMPONENTS.boiler.params, T: 600 } },
      { id: 'turbine1', type: 'turbine', x: 390, y: 90, params: { ...COMPONENTS.turbine.params, P: 4000 } },
      { id: 'heater1', type: 'boiler', x: 390, y: 230, params: { ...COMPONENTS.boiler.params, T: 600 } },
      { id: 'turbine2', type: 'turbine', x: 640, y: 200, params: { ...COMPONENTS.turbine.params, P: 10 } },
      { id: 'condenser1', type: 'condenser', x: 560, y: 390, params: { ...COMPONENTS.condenser.params } },
    ],
    streams: [S(1, ['condenser1', 'out'], ['pump1', 'in']), S(2, ['pump1', 'out'], ['boiler1', 'in']), S(3, ['boiler1', 'out'], ['turbine1', 'in']), S(4, ['turbine1', 'out'], ['heater1', 'in']), S(5, ['heater1', 'out'], ['turbine2', 'in']), S(6, ['turbine2', 'out'], ['condenser1', 'in'])],
  }),
  rankineRegen: () => ({
    name: 'Ideal regenerative Rankine (open FWH)', fluid: 'Water', kind: 'power', massFlow: { stream: 5, value: 1 },
    ref: 'Çengel & Boles, ideal regenerative example (15 MPa, 600 °C, extraction 1.2 MPa, 10 kPa): y ≈ 0.227, η ≈ 46.3 %',
    components: [
      { id: 'pump1', type: 'pump', x: 380, y: 420, params: { ...COMPONENTS.pump.params, P: 1200 } },
      { id: 'mixer1', type: 'mixer', x: 220, y: 420, params: { outSpec: 'satliq' } },
      { id: 'pump2', type: 'pump', x: 90, y: 330, params: { ...COMPONENTS.pump.params, P: 15000 } },
      { id: 'boiler1', type: 'boiler', x: 90, y: 110, params: { ...COMPONENTS.boiler.params, T: 600 } },
      { id: 'turbine1', type: 'turbine', x: 330, y: 90, params: { ...COMPONENTS.turbine.params, P: 1200 } },
      { id: 'splitter1', type: 'splitter', x: 450, y: 150, params: { yMode: 'auto', y: 0.2 } },
      { id: 'turbine2', type: 'turbine', x: 600, y: 190, params: { ...COMPONENTS.turbine.params, P: 10 } },
      { id: 'condenser1', type: 'condenser', x: 600, y: 400, params: { ...COMPONENTS.condenser.params } },
    ],
    streams: [S(1, ['condenser1', 'out'], ['pump1', 'in']), S(2, ['pump1', 'out'], ['mixer1', 'in2']), S(3, ['mixer1', 'out'], ['pump2', 'in']), S(4, ['pump2', 'out'], ['boiler1', 'in']), S(5, ['boiler1', 'out'], ['turbine1', 'in']), S(6, ['turbine1', 'out'], ['splitter1', 'in']), S(7, ['splitter1', 'out1'], ['mixer1', 'in1']), S(8, ['splitter1', 'out2'], ['turbine2', 'in']), S(9, ['turbine2', 'out'], ['condenser1', 'in'])],
  }),
  vcr: () => ({
    name: 'Ideal vapour-compression refrigeration', fluid: 'R134a', kind: 'refrigeration', massFlow: { stream: 1, value: 0.05 },
    ref: 'Çengel & Boles, ideal VCR example (R-134a, 0.14 → 0.8 MPa, 0.05 kg/s): Q̇L ≈ 7.18 kW, Ẇin ≈ 1.81 kW, COP_R ≈ 3.97',
    components: [
      { id: 'compressor1', type: 'compressor', x: 560, y: 250, params: { ...COMPONENTS.compressor.params, Pspec: 'P', P: 800 } },
      { id: 'condenser1', type: 'condenser', x: 360, y: 90, params: { ...COMPONENTS.condenser.params } },
      { id: 'valve1', type: 'valve', x: 150, y: 250, params: { ...COMPONENTS.valve.params, Pspec: 'P', P: 140 } },
      { id: 'evaporator1', type: 'evaporator', x: 360, y: 410, params: { ...COMPONENTS.evaporator.params } },
    ],
    streams: [S(1, ['evaporator1', 'out'], ['compressor1', 'in']), S(2, ['compressor1', 'out'], ['condenser1', 'in']), S(3, ['condenser1', 'out'], ['valve1', 'in']), S(4, ['valve1', 'out'], ['evaporator1', 'in'])],
  }),
  brayton: () => ({
    name: 'Brayton cycle (air-standard, closed)', fluid: 'Air', kind: 'power', massFlow: { stream: 1, value: 1 },
    ref: 'Çengel & Boles, simple ideal Brayton example (r_p = 8, 300 K, 1300 K, variable cp): η ≈ 42.6 %, bwr ≈ 0.403',
    components: [
      { id: 'compressor1', type: 'compressor', x: 170, y: 250, params: { ...COMPONENTS.compressor.params, Pspec: 'ratio', ratio: 8 } },
      { id: 'heater1', type: 'heater', x: 360, y: 90, params: { ...COMPONENTS.heater.params, T: 1300 - 273.15 } },
      { id: 'turbine1', type: 'turbine', x: 560, y: 250, params: { ...COMPONENTS.turbine.params, Pspec: 'P', P: 100 } },
      { id: 'cooler1', type: 'cooler', x: 360, y: 410, params: { ...COMPONENTS.cooler.params, T: 300 - 273.15 } },
    ],
    streams: [S(1, ['cooler1', 'out'], ['compressor1', 'in']), S(2, ['compressor1', 'out'], ['heater1', 'in']), S(3, ['heater1', 'out'], ['turbine1', 'in']), S(4, ['turbine1', 'out'], ['cooler1', 'in'])],
  }),
  braytonRegen: () => ({
    name: 'Brayton cycle with regeneration', fluid: 'Air', kind: 'power', massFlow: { stream: 1, value: 1 },
    ref: 'Regenerator effectiveness ε = 0.8 on the Brayton example above (compressor 80 %, turbine 85 %)',
    components: [
      { id: 'compressor1', type: 'compressor', x: 130, y: 260, params: { ...COMPONENTS.compressor.params, Pspec: 'ratio', ratio: 8, eta: 0.8 } },
      { id: 'regenerator1', type: 'regenerator', x: 360, y: 250, params: { eps: 0.8 } },
      { id: 'heater1', type: 'heater', x: 360, y: 80, params: { ...COMPONENTS.heater.params, T: 1300 - 273.15 } },
      { id: 'turbine1', type: 'turbine', x: 600, y: 200, params: { ...COMPONENTS.turbine.params, Pspec: 'P', P: 100, eta: 0.85 } },
      { id: 'cooler1', type: 'cooler', x: 360, y: 430, params: { ...COMPONENTS.cooler.params, T: 300 - 273.15 } },
    ],
    streams: [S(1, ['cooler1', 'out'], ['compressor1', 'in']), S(2, ['compressor1', 'out'], ['regenerator1', 'cin']), S(3, ['regenerator1', 'cout'], ['heater1', 'in']), S(4, ['heater1', 'out'], ['turbine1', 'in']), S(5, ['turbine1', 'out'], ['regenerator1', 'hin']), S(6, ['regenerator1', 'hout'], ['cooler1', 'in'])],
  }),
};
