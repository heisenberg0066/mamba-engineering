// Closed-system air-standard cycles (Otto, Diesel, Dual) as EES-style equation models.
import { solve } from '../core/solver.js';
import { prop } from '../core/props.js';

export const IC_DEFAULTS = {
  otto: { fluid: 'Air', r: 8, P1: 100, T1: 17, heatMode: 'q', q_in: 800, T3: 1500, rc: 2, rp: 1.5 },
  diesel: { fluid: 'Air_cold', r: 18, P1: 100, T1: 27, heatMode: 'rc', q_in: 1500, T3: 1800, rc: 2, rp: 1.5 },
  dual: { fluid: 'Air_cold', r: 18, P1: 100, T1: 27, heatMode: 'rc', q_in: 1500, T3: 1800, rc: 1.2, rp: 1.5 },
};
export const IC_REFS = {
  otto: 'Çengel & Boles, ideal Otto example (r = 8, 100 kPa, 17 °C, q_in = 800 kJ/kg, variable specific heats): T_max ≈ 1575 K, P_max ≈ 4.345 MPa, w_net ≈ 418 kJ/kg, η ≈ 52.3 %, MEP ≈ 574 kPa',
  diesel: 'Çengel & Boles, ideal Diesel example (r = 18, r_c = 2, cold-air standard): η ≈ 63.2 %',
  dual: 'Dual (limited-pressure) cycle, cold-air standard; reduces to Otto when r_c = 1 and to Diesel when r_p = 1',
};
export function icEquations(kind, p) {
  const F = p.fluid;
  const L = [`"=== Ideal ${kind[0].toUpperCase() + kind.slice(1)} cycle, air-standard, per unit mass ==="`,
    `r = ${+p.r} "compression ratio v1/v2"`, `P[1] = ${+p.P1} [kPa]`, `T[1] = ${+p.T1} [C]`,
    `"1→2 isentropic compression"`,
    `v[1] = volume(${F}, T=T[1], P=P[1]); s[1] = entropy(${F}, T=T[1], P=P[1]); u[1] = intenergy(${F}, T=T[1], P=P[1])`,
    `v[2] = v[1]/r; s[2] = s[1]`,
    `T[2] = temperature(${F}, v=v[2], s=s[2]); P[2] = pressure(${F}, v=v[2], s=s[2]); u[2] = intenergy(${F}, v=v[2], s=s[2])`, `h[2] = u[2] + P[2]*v[2]`];
  if (kind === 'otto') {
    L.push(`"2→3 constant-volume heat addition"`, `v[3] = v[2]`);
    if (p.heatMode === 'T3') L.push(`T[3] = ${+p.T3} [K]`, `u[3] = intenergy(${F}, T=T[3], v=v[3])`, `q_in = u[3] - u[2]`);
    else L.push(`q_in = ${+p.q_in} [kJ/kg]`, `u[3] = u[2] + q_in`, `T[3] = temperature(${F}, v=v[3], u=u[3])`);
    L.push(`P[3] = pressure(${F}, v=v[3], T=T[3]); s[3] = entropy(${F}, v=v[3], T=T[3])`);
  } else {
    if (kind === 'dual') {
      L.push(`r_p = ${+p.rp} "pressure ratio P_x/P_2 of the constant-volume part"`, `"2→x constant-volume heat addition"`, `v[5] = v[2]; P[5] = r_p*P[2]`, `T[5] = temperature(${F}, v=v[5], P=P[5]); u[5] = intenergy(${F}, v=v[5], P=P[5]); h[5] = u[5] + P[5]*v[5]`, `q_in_v = u[5] - u[2]`, `"x→3 constant-pressure heat addition"`, `P[3] = P[5]`);
    } else L.push(`"2→3 constant-pressure heat addition"`, `P[3] = P[2]`);
    const hb = kind === 'dual' ? 'h[5]' : 'h[2]';
    if (p.heatMode === 'T3') L.push(`T[3] = ${+p.T3} [K]`, `h[3] = enthalpy(${F}, T=T[3], P=P[3])`, `v[3] = volume(${F}, T=T[3], P=P[3])`, `r_c = v[3]/v[2] "cut-off ratio"`);
    else if (p.heatMode === 'q') L.push(`q_in_p = ${+p.q_in} [kJ/kg]${kind === 'dual' ? ' - q_in_v' : ''}`, `h[3] = ${hb} + q_in_p`, `T[3] = temperature(${F}, h=h[3], P=P[3])`, `v[3] = volume(${F}, h=h[3], P=P[3])`, `r_c = v[3]/v[2] "cut-off ratio"`);
    else L.push(`r_c = ${+p.rc} "cut-off ratio v3/v2"`, `v[3] = r_c*v[2]`, `T[3] = temperature(${F}, v=v[3], P=P[3])`, `h[3] = enthalpy(${F}, v=v[3], P=P[3])`);
    if (p.heatMode !== 'q') L.push(`q_in_p = h[3] - ${hb}`);
    L.push(kind === 'dual' ? `q_in = q_in_v + q_in_p` : `q_in = q_in_p`, `s[3] = entropy(${F}, T=T[3], P=P[3])`);
  }
  L.push(`"3→4 isentropic expansion"`, `v[4] = v[1]; s[4] = s[3]`,
    `T[4] = temperature(${F}, v=v[4], s=s[4]); P[4] = pressure(${F}, v=v[4], s=s[4]); u[4] = intenergy(${F}, v=v[4], s=s[4])`,
    `"4→1 constant-volume heat rejection"`, `q_out = u[4] - u[1]`,
    `w_net = q_in - q_out`, `eta_th = w_net/q_in`, `MEP = w_net/(v[1] - v[2]) "mean effective pressure"`);
  return L.join('\n');
}
export function solveIC(kind, p, opts) {
  const text = icEquations(kind, p);
  const res = solve(text, opts);
  res.text = text;
  if (res.ok) res.cycle = icPath(kind, p, res.values);
  return res;
}
// P-v / T-s path points + crank-angle animation table
export function icPath(kind, p, V, n = 40) {
  const F = p.fluid; const pts = [];
  const iso = (va, vb, s) => { for (let k = 0; k <= n; k++) { const v = va * Math.pow(vb / va, k / n); pts.push({ v, s, P: prop('P', F, { v, s }), T: prop('T', F, { v, s }), seg: 'isentropic' }); } };
  const constV = (v, Ta, Tb) => { for (let k = 0; k <= n; k++) { const T = Ta + (Tb - Ta) * k / n; pts.push({ v, T, P: prop('P', F, { v, T }), s: prop('s', F, { v, T }), seg: 'constV' }); } };
  const constP = (P, va, vb) => { for (let k = 0; k <= n; k++) { const v = va + (vb - va) * k / n; pts.push({ v, P, T: prop('T', F, { v, P }), s: prop('s', F, { v, P }), seg: 'constP' }); } };
  iso(V['v[1]'], V['v[2]'], V['s[1]']);
  if (kind === 'otto') constV(V['v[2]'], V['T[2]'], V['T[3]']);
  else if (kind === 'diesel') constP(V['P[2]'], V['v[2]'], V['v[3]']);
  else { constV(V['v[2]'], V['T[2]'], V['T[5]']); constP(V['P[3]'], V['v[2]'], V['v[3]']); }
  iso(V['v[3]'], V['v[4]'], V['s[3]']);
  constV(V['v[1]'], V['T[4]'], V['T[1]']);
  const states = [1, 2, ...(kind === 'dual' ? [5] : []), 3, 4].map(i => ({ id: i === 5 ? 'x' : i, P: V[`P[${i}]`], T: V[`T[${i}]`], v: V[`v[${i}]`], s: V[`s[${i}]`] ?? (i === 2 ? V['s[1]'] : i === 4 ? V['s[3]'] : prop('s', F, { v: V[`v[${i}]`], T: V[`T[${i}]`] })) }));
  return { pts, states };
}
