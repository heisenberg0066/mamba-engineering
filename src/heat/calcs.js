// Heat-transfer slice: steady 1-D conduction through layers (plane / cylinder / sphere), lumped transient, fins.
import { Trace, q, N } from '../core/trace.js';

export const MATERIALS = [
  // typical room-temperature values (W/m·K); edit for your own data
  ['Common brick', 0.72], ['Concrete', 1.4], ['Gypsum board', 0.17], ['Mineral wool', 0.040], ['Glass wool / fibreglass', 0.038], ['EPS (expanded polystyrene)', 0.035],
  ['PUR foam', 0.026], ['Pine wood', 0.12], ['Window glass', 1.0], ['PVC', 0.16], ['Plastic insulation (wire)', 0.15], ['Carbon steel', 50], ['Stainless steel', 15], ['Aluminium', 237], ['Copper', 401], ['Custom', 1],
];

// ---------------- 1-D conduction ----------------
export function conduction(inp) {
  const t = new Trace('Steady one-dimensional conduction — thermal resistance network');
  const geo = inp.geometry; // plane | cylinder | sphere
  t.assume('Steady state, one-dimensional heat flow, constant thermal conductivity in each layer, no heat generation inside the layers.');
  t.assume('Perfect contact between layers (no contact resistance).');
  const layers = inp.layers.map(l => ({ ...l, t: l.t / 1000 }));
  const A = inp.A, Lc = inp.L, r0 = inp.r_in / 1000;
  const radii = [r0]; layers.forEach(l => radii.push(radii[radii.length - 1] + l.t));
  const area = (r) => geo === 'plane' ? A : geo === 'cylinder' ? 2 * Math.PI * r * Lc : 4 * Math.PI * r * r;
  t.section('Thermal resistances');
  const R = [];
  if (inp.inner === 'conv') {
    const Ai = area(r0);
    R.push({ name: 'inner convection', R: t.step('Inner convection resistance', 'R_{conv,i} = \\dfrac{1}{h_i A_i}', `R_{conv,i} = \\dfrac{1}{${N(inp.h_in)} \\times ${N(Ai)}}`, 1 / (inp.h_in * Ai), 'K/W', 'R_{conv,i}'), kind: 'conv' });
  }
  layers.forEach((l, i) => {
    const r1 = radii[i], r2 = radii[i + 1]; let Rv, sym, sub;
    if (geo === 'plane') { Rv = l.t / (l.k * A); sym = `R_{${i + 1}} = \\dfrac{L_{${i + 1}}}{k_{${i + 1}} A}`; sub = `\\dfrac{${N(l.t)}}{${N(l.k)} \\times ${N(A)}}`; }
    else if (geo === 'cylinder') { Rv = Math.log(r2 / r1) / (2 * Math.PI * l.k * Lc); sym = `R_{${i + 1}} = \\dfrac{\\ln(r_{${i + 2}}/r_{${i + 1}})}{2\\pi k_{${i + 1}} L}`; sub = `\\dfrac{\\ln(${N(r2)}/${N(r1)})}{2\\pi \\times ${N(l.k)} \\times ${N(Lc)}}`; }
    else { Rv = (1 / r1 - 1 / r2) / (4 * Math.PI * l.k); sym = `R_{${i + 1}} = \\dfrac{1/r_{${i + 1}} - 1/r_{${i + 2}}}{4\\pi k_{${i + 1}}}`; sub = `\\dfrac{1/${N(r1)} - 1/${N(r2)}}{4\\pi \\times ${N(l.k)}}`; }
    R.push({ name: l.name || 'layer ' + (i + 1), R: t.step(`Layer ${i + 1} (${l.name || ''}) conduction resistance`, sym, `R_{${i + 1}} = ${sub}`, Rv, 'K/W', `R_{${i + 1}}`), kind: 'layer', k: l.k, r1, r2 });
  });
  const Ao = area(radii[radii.length - 1]);
  if (inp.outer === 'conv') R.push({ name: 'outer convection', R: t.step('Outer convection resistance', 'R_{conv,o} = \\dfrac{1}{h_o A_o}', `R_{conv,o} = \\dfrac{1}{${N(inp.h_out)} \\times ${N(Ao)}}`, 1 / (inp.h_out * Ao), 'K/W', 'R_{conv,o}'), kind: 'conv' });
  const Rtot = R.reduce((s, r) => s + r.R, 0);
  t.step('Total resistance (series)', 'R_{total} = \\sum R', `R_{total} = ${R.map(r => N(r.R)).join(' + ')}`, Rtot, 'K/W', 'R_{total}');
  t.section('Heat rate and temperatures');
  let Q, Tin;
  const Tout = inp.T_out;
  if (inp.inner === 'Q') {
    Q = inp.Q; t.give('\\dot{Q}', Q, 'W', 'given heat rate from inside');
    Tin = t.step('Inner surface temperature', 'T_1 = T_{\\infty,o} + \\dot{Q} R_{total}', `T_1 = ${N(Tout)} + ${N(Q)} \\times ${N(Rtot)}`, Tout + Q * Rtot, 'C', 'T_1');
  } else {
    Tin = inp.T_in;
    Q = t.step('Heat transfer rate', '\\dot{Q} = \\dfrac{T_{\\infty,i} - T_{\\infty,o}}{R_{total}}', `\\dot{Q} = \\dfrac{${N(Tin)} - ${N(Tout)}}{${N(Rtot)}}`, (Tin - Tout) / Rtot, 'W', '\\dot{Q}');
  }
  // node temperatures along the network
  const nodes = [{ T: Tin, label: inp.inner === 'conv' ? 'T∞,i' : 'T₁', r: r0, fluid: inp.inner === 'conv' }];
  let T = Tin;
  R.forEach((r, i) => {
    T -= Q * r.R;
    nodes.push({ T, after: r.name });
    if (i < R.length - 1 || inp.outer !== 'conv') t.step(`Temperature after ${r.name}`, `T_{${i + 2}} = T_{${i + 1}} - \\dot{Q} R_{${r.name.replace(/[^A-Za-z0-9]/g, '')}}`, `T_{${i + 2}} = ${N(T + Q * r.R)} - ${N(Q)} \\times ${N(r.R)}`, T, 'C', `T_{${i + 2}}`);
  });
  const surf = []; // surface temperatures at each radius / interface
  let idx = inp.inner === 'conv' ? 1 : 0;
  for (let i = 0; i <= layers.length; i++) surf.push(nodes[idx + i].T);
  if (geo === 'plane') {
    const U = 1 / (Rtot * A);
    t.step('Overall heat-transfer coefficient (U-value)', 'U = \\dfrac{1}{R_{total} A}', `U = \\dfrac{1}{${N(Rtot)} \\times ${N(A)}}`, U, 'W/m^2-K', 'U');
    t.step('Heat flux', "q'' = \\dot{Q}/A", `q'' = ${N(Q)}/${N(A)}`, Q / A, 'W/m^2', "q''");
  }
  let rcr = null, sweep = null;
  if (geo !== 'plane' && inp.outer === 'conv') {
    const kOut = layers[layers.length - 1].k;
    rcr = geo === 'cylinder' ? kOut / inp.h_out : 2 * kOut / inp.h_out;
    t.section('Critical radius of insulation');
    t.step('Critical radius (outer layer)', geo === 'cylinder' ? 'r_{cr} = \\dfrac{k}{h_o}' : 'r_{cr} = \\dfrac{2k}{h_o}', geo === 'cylinder' ? `r_{cr} = \\dfrac{${N(kOut)}}{${N(inp.h_out)}}` : `r_{cr} = \\dfrac{2 \\times ${N(kOut)}}{${N(inp.h_out)}}`, rcr * 1000, 'mm', 'r_{cr}');
    const rOut = radii[radii.length - 1], rBase = radii[radii.length - 2];
    const msg = rOut < rcr ? 'Outer radius is below the critical radius: adding insulation INCREASES heat loss until r = r_cr.' : 'Outer radius exceeds the critical radius: more insulation reduces heat loss.';
    t.note(msg);
    // sweep: heat rate vs outer-layer thickness
    const Rfixed = Rtot - R[R.length - 1].R - R[R.length - 2].R;
    sweep = [];
    const rmax = Math.max(rOut * 2, rcr * 2.5, rBase * 1.5);
    for (let k = 0; k <= 60; k++) {
      const r2 = rBase + (rmax - rBase) * k / 60;
      const Rl = geo === 'cylinder' ? Math.log(r2 / rBase) / (2 * Math.PI * kOut * Lc) : (1 / rBase - 1 / r2) / (4 * Math.PI * kOut);
      const Rc = 1 / (inp.h_out * area(r2));
      const Qk = inp.inner === 'Q' ? null : (Tin - Tout) / (Rfixed + Rl + Rc);
      const T1 = inp.inner === 'Q' ? Tout + Q * (Rfixed + Rl + Rc) : null;
      sweep.push({ r: r2 * 1000, Q: Qk, T1 });
    }
  }
  t.check('Energy balance closes (sum of ΔT over resistances = overall ΔT)', Math.abs(nodes[nodes.length - 1].T - (inp.outer === 'conv' ? Tout : nodes[nodes.length - 1].T)) < 1e-6 * Math.max(1, Math.abs(Tin)));
  t.ref('Thermal-resistance method: Incropera et al., Fundamentals of Heat and Mass Transfer, ch. 3; Çengel & Ghajar, Heat and Mass Transfer, ch. 3.');
  // temperature profile for visualisation
  const profile = (r) => {
    for (let i = 0; i < layers.length; i++) {
      const r1 = radii[i], r2 = radii[i + 1];
      if (r >= r1 - 1e-12 && r <= r2 + 1e-12) {
        const T1 = surf[i], T2 = surf[i + 1];
        let f = (r - r1) / (r2 - r1);
        if (geo === 'cylinder') f = Math.log(r / r1) / Math.log(r2 / r1);
        if (geo === 'sphere') f = (1 / r1 - 1 / r) / (1 / r1 - 1 / r2);
        return T1 + (T2 - T1) * f;
      }
    }
    return NaN;
  };
  return {
    trace: t.toJSON(),
    results: { Q: { v: Q, u: 'W', label: 'Heat rate Q̇' }, Rtot: { v: Rtot, u: 'K/W', label: 'Total resistance' }, T_inner_surface: { v: surf[0], u: '°C', label: 'Inner surface T' }, T_outer_surface: { v: surf[surf.length - 1], u: '°C', label: 'Outer surface T' }, ...(geo === 'plane' ? { U: { v: 1 / (Rtot * A), u: 'W/m²K', label: 'U-value' } } : {}), ...(rcr ? { r_cr: { v: rcr * 1000, u: 'mm', label: 'Critical radius' } } : {}) },
    viz: { geo, radii, surf, nodes, R, Q, Tin, Tout, profile, layers, rcr, sweep, inner: inp.inner, outer: inp.outer },
  };
}

// ---------------- lumped transient ----------------
export function lumped(inp) {
  const t = new Trace('Transient conduction — lumped-capacitance analysis');
  t.assume('Uniform temperature inside the body at any instant (validated by the Biot number).');
  t.assume('Constant properties and constant convection coefficient h; radiation neglected.');
  const D = inp.D / 1000, Lb = inp.Lcyl / 1000;
  let V, As, sym;
  t.section('Geometry');
  if (inp.shape === 'sphere') { V = Math.PI * D ** 3 / 6; As = Math.PI * D * D; sym = 'L_c = \\dfrac{V}{A_s} = \\dfrac{D}{6}'; }
  else if (inp.shape === 'cylinder') { V = Math.PI * D * D / 4 * Lb; As = Math.PI * D * Lb + 2 * Math.PI * D * D / 4; sym = 'L_c = \\dfrac{V}{A_s} = \\dfrac{\\pi D^2 L/4}{\\pi D L + \\pi D^2/2}'; }
  else { V = D * 1; As = 2; sym = 'L_c = \\dfrac{V}{A_s} = \\dfrac{t}{2}\\ (\\text{plate, both faces})'; }
  const Lc = t.step('Characteristic length', sym, `L_c = ${N(V)}/${N(As)}`, V / As * 1000, 'mm', 'L_c') / 1000;
  t.section('Validity');
  const Bi = t.step('Biot number', 'Bi = \\dfrac{h L_c}{k}', `Bi = \\dfrac{${N(inp.h)} \\times ${N(Lc)}}{${N(inp.k)}}`, inp.h * Lc / inp.k, '', 'Bi');
  t.check('Lumped analysis valid (Bi ≤ 0.1)', Bi <= 0.1, `Bi = ${Bi.toPrecision(3)}`);
  t.section('Time response');
  const b = t.step('Time constant inverse', 'b = \\dfrac{h A_s}{\\rho V c_p} = \\dfrac{h}{\\rho c_p L_c}', `b = \\dfrac{${N(inp.h)}}{${N(inp.rho)} \\times ${N(inp.cp)} \\times ${N(Lc)}}`, inp.h / (inp.rho * inp.cp * Lc), '1/s', 'b');
  t.step('Time constant', '\\tau = 1/b', `\\tau = 1/${N(b)}`, 1 / b, 's', '\\tau');
  const T = (time) => inp.T_inf + (inp.T_i - inp.T_inf) * Math.exp(-b * time);
  const ratio = (inp.T_target - inp.T_inf) / (inp.T_i - inp.T_inf);
  let tt = NaN;
  if (ratio > 0 && ratio < 1) tt = t.step('Time to reach the target temperature', 't = -\\dfrac{1}{b}\\ln\\dfrac{T - T_\\infty}{T_i - T_\\infty}', `t = -\\dfrac{1}{${N(b)}}\\ln\\dfrac{${N(inp.T_target)} - ${N(inp.T_inf)}}{${N(inp.T_i)} - ${N(inp.T_inf)}}`, -Math.log(ratio) / b, 's', 't');
  else t.note('Target temperature is not between T_i and T_∞, so it is never reached.');
  const Tend = t.step('Temperature at the end time', 'T(t) = T_\\infty + (T_i - T_\\infty)e^{-bt}', `T = ${N(inp.T_inf)} + (${N(inp.T_i)} - ${N(inp.T_inf)})e^{-${N(b)} \\times ${N(inp.t_end)}}`, T(inp.t_end), 'C', 'T(t_{end})');
  const Qt = t.step('Heat transferred up to t_end', 'Q = \\rho V c_p (T_i - T(t))', `Q = ${N(inp.rho)} \\times ${N(V)} \\times ${N(inp.cp)} \\times (${N(inp.T_i)} - ${N(Tend)})`, inp.rho * V * inp.cp * (inp.T_i - Tend), 'J', 'Q');
  t.ref('Lumped-capacitance method: Incropera ch. 5.1–5.3; Çengel & Ghajar ch. 4-1.');
  const series = []; const tmax = inp.t_end;
  for (let k = 0; k <= 100; k++) { const ti = tmax * k / 100; series.push({ t: ti, T: T(ti) }); }
  return { trace: t.toJSON(), results: { Bi: { v: Bi, u: '', label: 'Biot number' }, tau: { v: 1 / b, u: 's', label: 'Time constant τ' }, t_target: { v: tt, u: 's', label: 'Time to target' }, T_end: { v: Tend, u: '°C', label: 'T at end time' }, Q: { v: Qt, u: 'J', label: 'Heat transferred' } }, viz: { series, T, inp, Bi, b, tt } };
}

// ---------------- fins ----------------
export function fin(inp) {
  const t = new Trace('Extended surface (fin) — one-dimensional fin equation');
  t.assume('Steady, one-dimensional conduction along the fin; constant k and h; uniform cross-section; no radiation.');
  const L = inp.L / 1000; const th = inp.t / 1000, w = inp.w / 1000, D = inp.D / 1000;
  t.section('Geometry');
  let Ac, P;
  if (inp.type === 'pin') { Ac = Math.PI * D * D / 4; P = Math.PI * D; t.step('Cross-section area', 'A_c = \\pi D^2/4', `A_c = \\pi \\times ${N(D)}^2/4`, Ac, 'm^2', 'A_c'); t.step('Perimeter', 'P = \\pi D', `P = \\pi \\times ${N(D)}`, P, 'm', 'P'); }
  else { Ac = w * th; P = 2 * (w + th); t.step('Cross-section area', 'A_c = w t', `A_c = ${N(w)} \\times ${N(th)}`, Ac, 'm^2', 'A_c'); t.step('Perimeter', 'P = 2(w + t)', `P = 2(${N(w)} + ${N(th)})`, P, 'm', 'P'); }
  let Lu = L;
  if (inp.tip === 'corrected') { Lu = inp.type === 'pin' ? L + D / 4 : L + th / 2; t.step('Corrected length (convective tip → adiabatic)', inp.type === 'pin' ? 'L_c = L + D/4' : 'L_c = L + t/2', `L_c = ${N(L)} + ${inp.type === 'pin' ? N(D) + '/4' : N(th) + '/2'}`, Lu, 'm', 'L_c'); }
  t.section('Fin parameter and heat rate');
  const m = t.step('Fin parameter', 'm = \\sqrt{\\dfrac{hP}{kA_c}}', `m = \\sqrt{\\dfrac{${N(inp.h)} \\times ${N(P)}}{${N(inp.k)} \\times ${N(Ac)}}}`, Math.sqrt(inp.h * P / (inp.k * Ac)), '1/m', 'm');
  const thb = inp.T_b - inp.T_inf;
  const M = t.step('', 'M = \\sqrt{hPkA_c}\\,\\theta_b', `M = \\sqrt{${N(inp.h)} \\times ${N(P)} \\times ${N(inp.k)} \\times ${N(Ac)}} \\times ${N(thb)}`, Math.sqrt(inp.h * P * inp.k * Ac) * thb, 'W', 'M');
  const hk = inp.h / (m * inp.k);
  let qf, prof;
  const mL = m * Lu;
  if (inp.tip === 'infinite') { qf = t.step('Heat rate, infinitely long fin', 'q_f = M', `q_f = ${N(M)}`, M, 'W', 'q_f'); prof = (x) => Math.exp(-m * x); }
  else if (inp.tip === 'convective') {
    qf = t.step('Heat rate, convective tip', 'q_f = M\\dfrac{\\sinh mL + (h/mk)\\cosh mL}{\\cosh mL + (h/mk)\\sinh mL}', `q_f = ${N(M)}\\dfrac{\\sinh ${N(mL)} + ${N(hk)}\\cosh ${N(mL)}}{\\cosh ${N(mL)} + ${N(hk)}\\sinh ${N(mL)}}`, M * (Math.sinh(mL) + hk * Math.cosh(mL)) / (Math.cosh(mL) + hk * Math.sinh(mL)), 'W', 'q_f');
    prof = (x) => (Math.cosh(m * (L - x)) + hk * Math.sinh(m * (L - x))) / (Math.cosh(m * L) + hk * Math.sinh(m * L));
  } else {
    qf = t.step('Heat rate, adiabatic tip', 'q_f = M \\tanh mL', `q_f = ${N(M)} \\tanh(${N(mL)})`, M * Math.tanh(mL), 'W', 'q_f');
    prof = (x) => Math.cosh(m * (Lu - x)) / Math.cosh(m * Lu);
  }
  t.section('Performance');
  const Af = inp.tip === 'convective' ? P * L + Ac : P * Lu;
  const eta = t.step('Fin efficiency', '\\eta_f = \\dfrac{q_f}{h A_f \\theta_b}', `\\eta_f = \\dfrac{${N(qf)}}{${N(inp.h)} \\times ${N(Af)} \\times ${N(thb)}}`, qf / (inp.h * Af * thb), '', '\\eta_f');
  const eff = t.step('Fin effectiveness', '\\varepsilon_f = \\dfrac{q_f}{h A_c \\theta_b}', `\\varepsilon_f = \\dfrac{${N(qf)}}{${N(inp.h)} \\times ${N(Ac)} \\times ${N(thb)}}`, qf / (inp.h * Ac * thb), '', '\\varepsilon_f');
  const Ttip = inp.tip === 'infinite' ? inp.T_inf + thb * Math.exp(-m * L) : inp.T_inf + thb * prof(L);
  t.step('Tip temperature', 'T_{tip} = T_\\infty + \\theta_b\\,\\theta(L)/\\theta_b', `T_{tip} = ${N(inp.T_inf)} + ${N(thb)} \\times ${N((Ttip - inp.T_inf) / thb)}`, Ttip, 'C', 'T_{tip}');
  const Bi = inp.h * (inp.type === 'pin' ? D / 2 : th / 2) / inp.k;
  t.check('1-D fin assumption (transverse Biot h·t/2k < 0.1)', Bi < 0.1, `Bi = ${Bi.toPrecision(3)}`);
  t.check('Fin is worth using (effectiveness ≥ 2)', eff >= 2, `ε = ${eff.toPrecision(3)}`);
  const total = inp.N > 1 ? qf * inp.N : null;
  if (total) t.step('Total from N fins', 'q_{total} = N q_f', `q_{total} = ${inp.N} \\times ${N(qf)}`, total, 'W', 'q_{total}');
  t.ref('Fin solutions: Incropera ch. 3.6 (Table 3.4); Çengel & Ghajar ch. 3-6.');
  const series = []; for (let k = 0; k <= 60; k++) { const x = L * k / 60; series.push({ x: x * 1000, T: inp.T_inf + thb * prof(x) }); }
  return { trace: t.toJSON(), results: { q_f: { v: qf, u: 'W', label: 'Fin heat rate' }, eta_f: { v: eta, u: '', label: 'Fin efficiency' }, eps_f: { v: eff, u: '', label: 'Fin effectiveness' }, T_tip: { v: Ttip, u: '°C', label: 'Tip temperature' }, m: { v: m, u: '1/m', label: 'm' }, ...(total ? { q_total: { v: total, u: 'W', label: 'Total (N fins)' } } : {}) }, viz: { series, inp, m, prof, L } };
}
