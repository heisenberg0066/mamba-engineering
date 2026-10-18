// Validation suite: every number below is either a published textbook answer (source named) or an
// independent hand/analytic calculation (marked "analytic"). Run: npm test
import CoolPropModule from '../node_modules/coolprop-wasm/index.js';
import * as P from '../src/core/props.js';
import { solve } from '../src/core/solver.js';
import { buildSteps } from '../src/core/steps.js';
import { solveFlowsheet, TEMPLATES } from '../src/thermo/flowsheet.js';
import { solveIC, IC_DEFAULTS } from '../src/thermo/ic.js';
import { conduction, lumped, fin } from '../src/heat/calcs.js';
import { mohr, fits, boltedJoint, shaft, bearing, spurGear, spring, itValue } from '../src/mech/calcs.js';
import { textbookLookup } from '../src/core/tables.js';
import { parseUnit, toSI } from '../src/core/units.js';
import fs from 'node:fs';

await P.initProps(CoolPropModule);
const results = []; let fail = 0;
function check(group, name, got, want, tolPct, source) {
  const err = Math.abs(got - want) / Math.max(Math.abs(want), 1e-12) * 100;
  const ok = Number.isFinite(got) && err <= tolPct;
  if (!ok) fail++;
  results.push({ group, name, got, want, tolPct, errPct: err, ok, source });
}
function truthy(group, name, cond, source) { if (!cond) fail++; results.push({ group, name, got: cond, want: true, ok: !!cond, source }); }

// ---------- units & solver ----------
truthy('units', 'kJ/kg-K parses to 1000 J/kg-K', Math.abs(parseUnit('kJ/kg-K').f - 1000) < 1e-9, 'analytic');
check('units', '100 °F in K', toSI(100, 'F'), 310.92778, 1e-4, 'analytic');
{ const r = solve('x^2 + y = 11\nx + y^2 = 7'); check('solver', 'simultaneous nonlinear x', r.values.x, 3, 1e-6, 'analytic (x=3, y=2)'); check('solver', 'simultaneous nonlinear y', r.values.y, 2, 1e-6, 'analytic'); }
{ const r = solve('a = 2\nb = a + c'); truthy('solver', 'under-specified system detected', !r.ok && /Under-specified/.test(r.messages[0].msg), 'analytic'); }
{ const r = solve('a = 2 [m]\nb = 3 [s]\nc = a + b'); truthy('solver', 'unit mismatch flagged (m + s)', r.messages.some(m => m.type === 'unit'), 'analytic'); }

// ---------- EES-style equation model: Çengel simple ideal Rankine ----------
const SRC = 'Çengel & Boles, Thermodynamics: An Engineering Approach, "simple ideal Rankine cycle" example (3 MPa, 350 °C, 75 kPa)';
{
  const r = solve(`P[1] = 75 [kPa]; h[1] = enthalpy(Water, P=P[1], x=0); v[1] = volume(Water, P=P[1], x=0)
P[2] = 3 [MPa]; w_p = v[1]*(P[2]-P[1]); h[2] = h[1] + w_p
T[3] = 350 [C]; h[3] = enthalpy(Water, P=P[2], T=T[3]); s[3] = entropy(Water, P=P[2], T=T[3])
h[4] = enthalpy(Water, P=P[1], s=s[3]); x[4] = quality(Water, P=P[1], s=s[3])
eta = ((h[3]-h[4]) - w_p)/(h[3]-h[2])`);
  check('rankine-eqs', 'h1 [kJ/kg]', r.values['h[1]'] / 1000, 384.44, 0.05, SRC);
  check('rankine-eqs', 'w_pump [kJ/kg]', r.values.w_p / 1000, 3.03, 0.5, SRC);
  check('rankine-eqs', 'h3 [kJ/kg]', r.values['h[3]'] / 1000, 3116.1, 0.05, SRC);
  check('rankine-eqs', 'x4', r.values['x[4]'], 0.8861, 0.1, SRC);
  check('rankine-eqs', 'h4 [kJ/kg]', r.values['h[4]'] / 1000, 2403.0, 0.05, SRC);
  check('rankine-eqs', 'thermal efficiency', r.values.eta, 0.260, 0.5, SRC);
  const st = buildSteps(r, { education: true });
  truthy('steps', 'step-by-step generated with textbook interpolation', st.steps.length >= 5 && st.steps.some(s => s.props?.some(p => p.textbook)), 'feature');
}
// textbook-table interpolation equals the EOS value at grid points, and is close in between
{ const tb = textbookLookup('Water', 'h', { P: 3.1e6, T: 623.15 }); check('tables', 'double interpolation h(3.1 MPa, 350 °C) vs EOS', tb.value, tb.exact, 0.1, 'analytic (interpolation error < 0.1 %)'); }

// ---------- canvas templates ----------
P.settings.refState = 'IIR';
{ const r = solveFlowsheet(TEMPLATES.rankine()); check('canvas', 'Rankine η (canvas)', r.values.eta_th, 0.260, 0.5, SRC); }
{ const r = solveFlowsheet(TEMPLATES.rankineReheat()); const s = 'Çengel & Boles, ideal reheat Rankine example (15 MPa, 600 °C, reheat 4 MPa → 600 °C, 10 kPa)';
  check('canvas', 'Reheat Rankine η', r.values.eta_th, 0.450, 0.5, s); check('canvas', 'Reheat: LP-turbine exit quality', r.states.find(x => x.id === 6).x, 0.896, 0.3, s); }
{ const r = solveFlowsheet(TEMPLATES.rankineRegen()); const s = 'Çengel & Boles, ideal regenerative Rankine example with an open FWH (15 MPa, 600 °C, 1.2 MPa, 10 kPa)';
  check('canvas', 'Regenerative: extraction fraction y', r.values.y_splitter1, 0.2270, 0.3, s); check('canvas', 'Regenerative η', r.values.eta_th, 0.463, 0.5, s); }
{ P.settings.refState = 'ASHRAE'; const r = solveFlowsheet(TEMPLATES.vcr()); const s = 'Çengel & Boles, ideal vapour-compression refrigeration example (R-134a, 0.14–0.8 MPa, 0.05 kg/s); ASHRAE reference state as in the textbook tables';
  check('canvas', 'VCR h1 (sat. vapour 0.14 MPa) [kJ/kg]', r.states[0].h / 1000, 239.16, 0.05, s);
  check('canvas', 'VCR h2 [kJ/kg]', r.states[1].h / 1000, 275.39, 0.05, s);
  check('canvas', 'VCR h3 (sat. liquid 0.8 MPa) [kJ/kg]', r.states[2].h / 1000, 95.47, 0.1, s);
  check('canvas', 'VCR Q̇L [kW]', r.values.Q_dot_L / 1000, 7.18, 0.3, s); check('canvas', 'VCR Ẇin [kW]', r.values.W_dot_in / 1000, 1.81, 0.5, s); check('canvas', 'VCR COP_R', r.values.COP_R, 3.97, 0.5, s); P.settings.refState = 'IIR'; }
{ const r = solveFlowsheet(TEMPLATES.brayton()); const s = 'Çengel & Boles, simple ideal Brayton example (r_p = 8, 300 K, 1300 K; variable specific heats)';
  check('canvas', 'Brayton η', r.values.eta_th, 0.426, 0.5, s); check('canvas', 'Brayton back-work ratio', r.values.bwr, 0.403, 0.5, s); }
{ const fsd = TEMPLATES.brayton(); fsd.fluid = 'Air_cold'; const r = solveFlowsheet(fsd); check('canvas', 'Brayton cold-air η = 1 − r_p^(−(k−1)/k)', r.values.eta_th, 1 - Math.pow(8, -(1.005 / 0.718 - 1) / (1.005 / 0.718)), 0.01, 'analytic'); }

// ---------- IC cycles ----------
{ const r = solveIC('otto', IC_DEFAULTS.otto); const s = 'Çengel & Boles, ideal Otto cycle example (r = 8, 100 kPa, 17 °C, 800 kJ/kg; variable specific heats from air tables)';
  check('otto', 'T_max [K]', r.values['T[3]'], 1575.1, 1.0, s); check('otto', 'P_max [MPa]', r.values['P[3]'] / 1e6, 4.345, 1.5, s);
  check('otto', 'w_net [kJ/kg]', r.values.w_net / 1000, 418.17, 1.0, s); check('otto', 'η', r.values.eta_th, 0.523, 1.0, s); check('otto', 'MEP [kPa]', r.values.MEP / 1000, 574, 1.0, s); }
{ const r = solveIC('otto', { ...IC_DEFAULTS.otto, fluid: 'Air_cold' }); const k = 1.005 / 0.718; check('otto', 'cold-air η = 1 − r^(1−k)', r.values.eta_th, 1 - Math.pow(8, 1 - k), 0.01, 'analytic'); }
{ const r = solveIC('diesel', IC_DEFAULTS.diesel); check('diesel', 'η (r = 18, r_c = 2, cold air)', r.values.eta_th, 0.632, 0.3, 'Çengel & Boles, ideal Diesel cycle example (cold-air-standard, r = 18, r_c = 2)'); }
{ const r = solveIC('dual', { ...IC_DEFAULTS.dual, rp: 1.0, rc: 2 }); const d = solveIC('diesel', IC_DEFAULTS.diesel); check('dual', 'Dual with r_p = 1 equals Diesel', r.values.eta_th, d.values.eta_th, 0.01, 'analytic'); }

// ---------- heat transfer ----------
{ // Çengel & Ghajar: insulated electric wire (D = 3 mm, 2 mm plastic k = 0.15, h = 12, L = 5 m, 10 A × 8 V = 80 W, T∞ = 30 °C)
  const r = conduction({ geometry: 'cylinder', layers: [{ name: 'plastic', k: 0.15, t: 2 }], r_in: 1.5, L: 5, A: 1, inner: 'Q', Q: 80, outer: 'conv', h_out: 12, T_out: 30 });
  const s = 'Çengel & Ghajar, Heat and Mass Transfer, insulated electric wire example (critical radius of insulation)';
  check('conduction', 'wire/insulation interface T [°C]', r.results.T_inner_surface.v, 105, 0.5, s);
  check('conduction', 'critical radius [mm]', r.results.r_cr.v, 12.5, 0.01, s);
}
{ // composite plane wall: analytic series resistances
  const r = conduction({ geometry: 'plane', A: 1, layers: [{ k: 0.72, t: 100 }, { k: 0.04, t: 50 }, { k: 0.17, t: 13 }], inner: 'conv', T_in: 20, h_in: 8, outer: 'conv', T_out: -10, h_out: 25 });
  const Rt = 1 / 8 + 0.1 / 0.72 + 0.05 / 0.04 + 0.013 / 0.17 + 1 / 25;
  check('conduction', 'composite wall Q [W]', r.results.Q.v, 30 / Rt, 1e-6, 'analytic (series resistances)');
  check('conduction', 'composite wall U [W/m²K]', r.results.U.v, 1 / Rt, 1e-6, 'analytic');
}
{ const r = lumped({ shape: 'sphere', D: 1, Lcyl: 0, k: 35, rho: 8500, cp: 320, h: 210, T_i: 20, T_inf: 100, T_target: 99.2, t_end: 15 });
  const s = 'Çengel & Ghajar, thermocouple junction example (D = 1 mm sphere, h = 210, k = 35, ρ = 8500, cp = 320): 99 % response in ≈ 10 s';
  check('lumped', 'time to 99 % of the temperature difference [s]', r.results.t_target.v, 10, 1.0, s); truthy('lumped', 'Bi < 0.1', r.results.Bi.v < 0.1, s); }
{ // fin: analytic vs independent finite-difference solution of θ'' = m²θ with convective tip
  const inp = { type: 'pin', D: 5, t: 0, w: 0, L: 50, k: 200, h: 50, T_b: 100, T_inf: 25, tip: 'convective', N: 1 };
  const r = fin(inp);
  const n = 2000, L = 0.05, dx = L / n, Ac = Math.PI * 0.005 ** 2 / 4, Pp = Math.PI * 0.005, m2 = 50 * Pp / (200 * Ac);
  const a = new Float64Array(n + 1), b = new Float64Array(n + 1), c = new Float64Array(n + 1), d = new Float64Array(n + 1);
  b[0] = 1; d[0] = 75;
  for (let i = 1; i < n; i++) { a[i] = 1; b[i] = -(2 + m2 * dx * dx); c[i] = 1; }
  a[n] = 200 / dx; b[n] = -(200 / dx + 50); // -k dθ/dx = hθ at tip
  for (let i = 1; i <= n; i++) { const w = a[i] / b[i - 1]; b[i] -= w * c[i - 1]; d[i] -= w * d[i - 1]; }
  const th = new Float64Array(n + 1); th[n] = d[n] / b[n]; for (let i = n - 1; i >= 0; i--) th[i] = (d[i] - c[i] * th[i + 1]) / b[i];
  const qfd = -200 * Ac * (th[1] - th[0]) / dx - 50 * Pp * dx / 2 * th[0];
  check('fin', 'pin fin heat rate: closed form vs finite difference', r.results.q_f.v, qfd, 0.5, 'analytic (independent finite-difference solution)');
  check('fin', 'tip temperature: closed form vs finite difference [°C]', r.results.T_tip.v, 25 + th[n], 0.1, 'analytic');
}

// ---------- machine elements ----------
{ const r = mohr({ sx: 80, sy: 0, txy: -50, Sy: 0 }); const s = "Shigley's MED, Mohr's-circle example (σx = 80 MPa, τxy = 50 MPa cw): σ1 = 104, σ2 = −24, τ = 64 MPa, 2θp ≈ 51.3°";
  check('mohr', 'σ1 [MPa]', r.results.s1.v, 104.03, 0.05, s); check('mohr', 'σ2 [MPa]', r.results.s2.v, -24.03, 0.1, s); check('mohr', 'τmax [MPa]', r.results.tmax.v, 64.03, 0.05, s); check('mohr', '|θp| [deg]', Math.abs(r.results.thp.v), 25.67, 0.1, s); }
for (const [D, g, v] of [[25, 6, 13], [25, 7, 21], [60, 7, 30], [100, 6, 22], [100, 8, 54], [5, 7, 12]]) check('iso286', `IT${g} for Ø${D}`, itValue(D, g), v, 0, 'ISO 286-1 standard tolerance table (commonly published values)');
{ const r = fits({ D: 25, holeL: 'H', holeG: 7, shaftL: 'g', shaftG: 6 }); const s = 'ISO 286-2 published limits: Ø25 H7 = 0/+21 µm, g6 = −7/−20 µm';
  check('iso286', 'Ø25 H7/g6 max clearance [µm]', r.results.cmax.v, 41, 0, s); check('iso286', 'Ø25 H7/g6 min clearance [µm]', r.results.cmin.v, 7, 0, s); }
{ const r = fits({ D: 25, holeL: 'H', holeG: 7, shaftL: 'p', shaftG: 6 }); const s = 'ISO 286-2 published limits: Ø25 p6 = +22/+35 µm';
  check('iso286', 'Ø25 H7/p6 max interference [µm]', -r.results.cmin.v, 35, 0, s); truthy('iso286', 'H7/p6 is an interference fit', r.results.type.v === 'interference fit', s); }
{ const r = fits({ D: 25, holeL: 'N', holeG: 7, shaftL: 'h', shaftG: 6 }); truthy('iso286', 'Ø25 N7 = −7/−28 µm', r.viz.h.ES === -7 && r.viz.h.EI === -28, 'ISO 286-2 published limits'); }
{ const r = fits({ D: 25, holeL: 'K', holeG: 7, shaftL: 'h', shaftG: 6 }); truthy('iso286', 'Ø25 K7 = +6/−15 µm', r.viz.h.ES === 6 && r.viz.h.EI === -15, 'ISO 286-2 published limits'); }
{ const s = 'ISO 898-1 / Shigley Table 8-1 tensile-stress areas'; for (const [d, At] of [[8, 36.6], [10, 58.0], [12, 84.3], [16, 157], [20, 245]]) { const r = boltedJoint({ d, l: 30, cls: '8.8', Eb: 207, Em: 207, preMode: 'reuse', K: 0.2, P: 5, nb: 1, fatigue: false }); check('bolt', `A_t M${d} [mm²]`, r.results.At.v, At, 0.3, s); } }
{ const r = boltedJoint({ d: 12, l: 40, cls: '8.8', Eb: 207, Em: 207, preMode: 'reuse', K: 0.2, P: 10, nb: 1, fatigue: true });
  const kmHand = 0.5774 * Math.PI * 207000 * 12 / (2 * Math.log(5 * (0.5774 * 40 + 6) / (0.5774 * 40 + 30)));
  check('bolt', 'member stiffness (frustum) [N/mm]', r.results.km.v, kmHand, 1e-6, 'analytic (Shigley eq. 8-22)');
  check('bolt', 'preload 0.75·At·Sp [kN]', r.results.Fi.v, 0.75 * 84.27 * 600 / 1000, 0.1, 'analytic'); }
{ const r = shaft({ d: 28, Ma: 142.4, Mm: 0, Ta: 0, Tm: 124.3, Sut: 735, Sy: 574, surface: 'machined', rel: 99, Kf: 1.58, Kfs: 1.39, Kt: 0, Kts: 0, q: 0, qs: 0 });
  const s = "Shigley's MED, shaft-shoulder fatigue example (d = 28 mm, M = 142.4 N·m, T = 124.3 N·m, Sut = 735, Sy = 574 MPa, R = 0.99)";
  check('shaft', 'Se [MPa]', r.results.Se.v, 205, 1.0, s); check('shaft', 'first-cycle yield n_y', r.results.ny.v, 4.58, 1.0, s);
  const Se = r.results.Se.v; check('shaft', 'Goodman n (hand check)', r.results.nG.v, 1 / (104.5 / Se + 69.5 / 735), 1.0, 'analytic hand calculation'); }
{ const r = bearing({ type: 'ball', C: 30.7, C0: 19, Fr: 3, Fa: 0, X: 1, Y: 0, autoXY: false, n: 1000, rel: 90, aISO: 1, Lreq: 0 });
  check('bearing', 'L10 = (C/P)^3 [Mrev]', r.results.L10.v, Math.pow(30.7 / 3, 3), 1e-6, 'analytic (ISO 281)'); check('bearing', 'L10h [h]', r.results.L10h.v, Math.pow(30.7 / 3, 3) * 1e6 / 60000, 1e-6, 'analytic');
  const r2 = bearing({ type: 'ball', C: 30.7, C0: 19, Fr: 3, Fa: 0, X: 1, Y: 0, autoXY: false, n: 1000, rel: 99, aISO: 1, Lreq: 0 }); check('bearing', 'a1 at 99 % reliability = 0.25', r2.results.Lnm.v / r.results.L10h.v, 0.25, 1e-6, 'ISO 281:2007 Table 12'); }
{ // Shigley Lewis example: P = 8 teeth/in, F = 1.5 in, N = 16, 20°, AISI 1020 as-rolled Sy = 30 kpsi, n_d = 3, 1200 rev/min, cut teeth → H ≈ 6.93 hp
  const r = spurGear({ m: 25.4 / 8, z1: 16, z2: 48, alpha: 20, b: 1.5 * 25.4, P: 1, n1: 1200, Sy: 30 * 6.894757, nd: 3, profile: 'cut' });
  check('gear', 'power rating [hp]', r.results.Pallow.v * 1000 / 745.7, 6.93, 1.0, "Shigley's MED, Lewis-equation spur gear rating example (16 T, P = 8, F = 1.5 in, 1200 rev/min, n_d = 3)"); }
{ const r = spurGear({ m: 3, z1: 20, z2: 40, alpha: 20, b: 30, P: 5, n1: 1500, Sy: 300, nd: 2, profile: 'cut' });
  const ra1 = 33, rb1 = 30 * Math.cos(20 * Math.PI / 180), ra2 = 63, rb2 = 60 * Math.cos(20 * Math.PI / 180);
  check('gear', 'contact ratio (analytic)', r.results.eps.v, (Math.sqrt(ra1 ** 2 - rb1 ** 2) + Math.sqrt(ra2 ** 2 - rb2 ** 2) - 90 * Math.sin(20 * Math.PI / 180)) / (Math.PI * 3 * Math.cos(20 * Math.PI / 180)), 1e-6, 'analytic'); }
{ const r = spring({ mat: 'Music wire A228', d: 2, D: 16, Na: 10, ends: 'squaredGround', F: 50, L0: 0, fixed: true });
  check('spring', 'rate k = d⁴G/(8D³Na) [N/mm]', r.results.k.v, 16 * 81700 / (8 * 4096 * 10), 1e-6, 'analytic');
  const C = 8, KB = (4 * C + 2) / (4 * C - 3);
  check('spring', 'shear stress τ = K_B·8FD/(πd³) [MPa]', r.results.tau.v, KB * 8 * 50 * 16 / (Math.PI * 8), 1e-6, 'analytic (Bergsträsser factor)'); }

// ---------- report ----------
const pad = (s, n) => String(s).padEnd(n);
let out = `Mamba Engineering validation — ${new Date().toISOString()}\n${results.length} checks, ${fail} failed\n\n`;
for (const r of results) out += `${r.ok ? 'PASS' : 'FAIL'}  ${pad(r.group, 12)} ${pad(r.name, 56)} got ${typeof r.got === 'number' ? r.got.toPrecision(6) : r.got}  ref ${typeof r.want === 'number' ? r.want.toPrecision(6) : r.want}${r.errPct !== undefined ? `  err ${r.errPct.toFixed(3)} % (tol ${r.tolPct} %)` : ''}\n        source: ${r.source}\n`;
fs.mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./out/validation.txt', import.meta.url), out);
fs.writeFileSync(new URL('../docs/VALIDATION.md', import.meta.url), '# Validation results\n\nGenerated by `npm test` (test/run-tests.mjs). Each check names its reference: a published textbook worked example, a standard table, or an independent analytic/hand calculation.\n\n| | Group | Check | Result | Reference value | Error | Source |\n|---|---|---|---|---|---|---|\n' + results.map(r => `| ${r.ok ? '✅' : '❌'} | ${r.group} | ${r.name} | ${typeof r.got === 'number' ? r.got.toPrecision(5) : r.got} | ${typeof r.want === 'number' ? r.want.toPrecision(5) : r.want} | ${r.errPct !== undefined ? r.errPct.toFixed(2) + ' %' : ''} | ${r.source} |`).join('\n') + `\n\n**${results.length - fail}/${results.length} passed.**\n`);
console.log(out);
process.exit(fail ? 1 : 0);
