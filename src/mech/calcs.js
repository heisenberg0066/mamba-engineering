// MechWorkbench first slice: bolted joint, shaft fatigue, rolling-bearing life (ISO 281 basic), spur gear (Lewis),
// helical compression spring, ISO 286 fits, Mohr's circle. Units: mm, N, MPa, N·m unless stated.
import { Trace, N } from '../core/trace.js';

// ---------------- Mohr's circle ----------------
export function mohr(inp) {
  const t = new Trace("Plane stress transformation — Mohr's circle");
  const { sx, sy, txy } = inp;
  t.give('\\sigma_x', sx, 'MPa'); t.give('\\sigma_y', sy, 'MPa'); t.give('\\tau_{xy}', txy, 'MPa');
  t.assume('Plane stress (σz = τxz = τyz = 0). Sign convention: τxy positive when it acts in +y on the +x face (counter-clockwise).');
  t.section('Circle');
  const C = t.step('Centre', 'C = \\dfrac{\\sigma_x + \\sigma_y}{2}', `C = \\dfrac{${N(sx)} + ${N(sy)}}{2}`, (sx + sy) / 2, 'MPa', 'C');
  const R = t.step('Radius', 'R = \\sqrt{\\left(\\dfrac{\\sigma_x - \\sigma_y}{2}\\right)^2 + \\tau_{xy}^2}', `R = \\sqrt{${N((sx - sy) / 2)}^2 + ${N(txy)}^2}`, Math.hypot((sx - sy) / 2, txy), 'MPa', 'R');
  t.section('Principal stresses');
  const s1 = t.step('Maximum principal stress', '\\sigma_1 = C + R', `\\sigma_1 = ${N(C)} + ${N(R)}`, C + R, 'MPa', '\\sigma_1');
  const s2 = t.step('Minimum principal stress', '\\sigma_2 = C - R', `\\sigma_2 = ${N(C)} - ${N(R)}`, C - R, 'MPa', '\\sigma_2');
  const thp = t.step('Principal angle (from x to σ1, ccw +)', '\\theta_p = \\tfrac{1}{2}\\operatorname{atan2}(2\\tau_{xy},\\ \\sigma_x - \\sigma_y)', `\\theta_p = \\tfrac{1}{2}\\operatorname{atan2}(${N(2 * txy)},\\ ${N(sx - sy)})`, 0.5 * Math.atan2(2 * txy, sx - sy) * 180 / Math.PI, 'deg', '\\theta_p');
  const tmax = t.step('Maximum in-plane shear', '\\tau_{max} = R', '', R, 'MPa', '\\tau_{max}');
  const s3 = 0; const sAbs = Math.max(Math.abs(s1 - s2), Math.abs(s1 - s3), Math.abs(s2 - s3)) / 2;
  t.step('Absolute maximum shear (3-D, σ3 = 0)', '\\tau_{abs} = \\tfrac{1}{2}\\max(|\\sigma_1-\\sigma_2|, |\\sigma_1|, |\\sigma_2|)', '', sAbs, 'MPa', '\\tau_{abs}');
  const vm = t.step('von Mises equivalent stress', "\\sigma' = \\sqrt{\\sigma_x^2 - \\sigma_x\\sigma_y + \\sigma_y^2 + 3\\tau_{xy}^2}", `\\sigma' = \\sqrt{${N(sx)}^2 - ${N(sx)}\\times${N(sy)} + ${N(sy)}^2 + 3\\times${N(txy)}^2}`, Math.sqrt(sx * sx - sx * sy + sy * sy + 3 * txy * txy), 'MPa', "\\sigma'");
  if (inp.Sy > 0) { t.section('Yield check'); const nd = t.step('Safety factor (distortion energy)', "n = S_y/\\sigma'", `n = ${N(inp.Sy)}/${N(vm)}`, inp.Sy / vm, '', 'n'); t.check('No yielding (n > 1)', nd > 1); }
  const rot = (th) => { const c = Math.cos(2 * th), s = Math.sin(2 * th); return { sx: C + (sx - sy) / 2 * c + txy * s, sy: C - (sx - sy) / 2 * c - txy * s, txy: -(sx - sy) / 2 * s + txy * c }; };
  t.ref("Mohr's circle: Shigley's Mechanical Engineering Design, ch. 3-6/3-7.");
  return { trace: t.toJSON(), results: { s1: { v: s1, u: 'MPa', label: 'σ1' }, s2: { v: s2, u: 'MPa', label: 'σ2' }, tmax: { v: tmax, u: 'MPa', label: 'τmax in-plane' }, thp: { v: thp, u: '°', label: 'θp' }, vm: { v: vm, u: 'MPa', label: "von Mises σ'" } }, viz: { C, R, s1, s2, thp, rot, inp } };
}

// ---------------- ISO 286 fits ----------------
const SIZE = [3, 6, 10, 18, 30, 50, 80, 120, 180, 250, 315, 400, 500];
// standard tolerance grades (µm) for nominal size ranges up to 500 mm (ISO 286-1 values as commonly published)
const IT = {
  5: [4, 5, 6, 8, 9, 11, 13, 15, 18, 20, 23, 25, 27],
  6: [6, 8, 9, 11, 13, 16, 19, 22, 25, 29, 32, 36, 40],
  7: [10, 12, 15, 18, 21, 25, 30, 35, 40, 46, 52, 57, 63],
  8: [14, 18, 22, 27, 33, 39, 46, 54, 63, 72, 81, 89, 97],
  9: [25, 30, 36, 43, 52, 62, 74, 87, 100, 115, 130, 140, 155],
  10: [40, 48, 58, 70, 84, 100, 120, 140, 160, 185, 210, 230, 250],
  11: [60, 75, 90, 110, 130, 160, 190, 220, 250, 290, 320, 360, 400],
};
// shaft fundamental deviation for p (µm) by range (ISO 286-2 values as commonly published)
const P_EI = [6, 12, 15, 18, 22, 26, 32, 37, 43, 50, 56, 62, 68];
function rangeIdx(D) { for (let i = 0; i < SIZE.length; i++) if (D <= SIZE[i]) return i; return -1; }
function roundDev(v) { const a = Math.abs(v); const r = a < 45 ? Math.round(a) : a < 200 ? 5 * Math.round(a / 5) : 10 * Math.round(a / 10); return Math.sign(v) * r; }
export function itValue(D, grade) { const i = rangeIdx(D); if (i < 0 || !IT[grade]) return NaN; return IT[grade][i]; }
function geoMean(D) { const i = rangeIdx(D); const lo = i === 0 ? 1 : SIZE[i - 1]; return Math.sqrt(lo * SIZE[i]); }
export function shaftDev(D, letter, grade) {
  // returns {es, ei} µm
  const Dm = geoMean(D), i = rangeIdx(D), ITg = itValue(D, grade);
  let es, ei;
  switch (letter) {
    case 'd': es = roundDev(-16 * Math.pow(Dm, 0.44)); break;
    case 'e': es = roundDev(-11 * Math.pow(Dm, 0.41)); break;
    case 'f': es = roundDev(-5.5 * Math.pow(Dm, 0.41)); break;
    case 'g': es = roundDev(-2.5 * Math.pow(Dm, 0.34)); break;
    case 'h': es = 0; break;
    case 'js': es = ITg / 2; ei = -ITg / 2; break;
    case 'k': ei = (grade >= 4 && grade <= 7) ? Math.round(0.6 * Math.cbrt(Dm)) : 0; break;
    case 'm': ei = itValue(D, 7) - itValue(D, 6); break;
    case 'n': ei = Math.round(5 * Math.pow(Dm, 0.34)); break;
    case 'p': ei = P_EI[i]; break;
    default: throw new Error('Shaft letter not supported: ' + letter);
  }
  if (es === undefined) es = ei + ITg; if (ei === undefined) ei = es - ITg;
  return { es, ei };
}
export function holeDev(D, letter, grade) {
  const ITg = itValue(D, grade); const L = letter.toLowerCase();
  if (['d', 'e', 'f', 'g', 'h'].includes(L)) { const s = shaftDev(D, L, grade); const EI = -s.es; return { EI, ES: EI + ITg }; }
  if (L === 'js') return { ES: ITg / 2, EI: -ITg / 2 };
  if (['k', 'm', 'n', 'p'].includes(L)) {
    // special rule: ES = -ei(shaft) + Δ, Δ = IT_n − IT_(n−1), for K, M, N ≤ IT8 and P ≤ IT7
    const s = shaftDev(D, L, grade);
    const lim = L === 'p' ? 7 : 8;
    const delta = grade <= lim ? (itValue(D, grade) - itValue(D, grade - 1)) : 0;
    let ES = -s.ei + delta;
    if (L === 'k' && grade > 8) ES = 0;
    return { ES, EI: ES - ITg };
  }
  throw new Error('Hole letter not supported: ' + letter);
}
export function fits(inp) {
  const t = new Trace('ISO 286 limits and fits');
  const D = inp.D;
  t.give('D', D, 'mm', 'nominal size');
  t.assume('Values computed from the ISO 286 system (standard tolerance table + fundamental-deviation formulas). Some deviations can differ by 1–2 µm from the official tables; check against a licensed copy of ISO 286-2 before manufacturing.');
  const i = rangeIdx(D); if (i < 0 || D <= 0) throw new Error('Nominal size must be 0 < D ≤ 500 mm');
  const lo = i === 0 ? 0 : SIZE[i - 1];
  t.section('Hole ' + inp.holeL + inp.holeG);
  const ITh = t.step(`Tolerance grade IT${inp.holeG} for ${lo}–${SIZE[i]} mm`, `IT${inp.holeG}`, '', itValue(D, inp.holeG), 'um', `IT${inp.holeG}`);
  const h = holeDev(D, inp.holeL, +inp.holeG);
  t.step('Hole lower deviation', 'EI', '', h.EI, 'um', 'EI');
  t.step('Hole upper deviation', 'ES = EI + IT', `ES = ${N(h.EI)} + ${N(ITh)}`, h.ES, 'um', 'ES');
  t.section('Shaft ' + inp.shaftL + inp.shaftG);
  const ITs = t.step(`Tolerance grade IT${inp.shaftG}`, `IT${inp.shaftG}`, '', itValue(D, inp.shaftG), 'um', `IT${inp.shaftG}`);
  const s = shaftDev(D, inp.shaftL, +inp.shaftG);
  t.step('Shaft upper deviation', 'es', '', s.es, 'um', 'es');
  t.step('Shaft lower deviation', 'ei = es - IT', `ei = ${N(s.es)} - ${N(ITs)}`, s.ei, 'um', 'ei');
  t.section('Fit');
  const cmax = t.step('Maximum clearance', 'C_{max} = ES - ei', `C_{max} = ${N(h.ES)} - (${N(s.ei)})`, h.ES - s.ei, 'um', 'C_{max}');
  const cmin = t.step('Minimum clearance (negative = interference)', 'C_{min} = EI - es', `C_{min} = ${N(h.EI)} - (${N(s.es)})`, h.EI - s.es, 'um', 'C_{min}');
  const type = cmin >= 0 ? 'clearance fit' : cmax <= 0 ? 'interference fit' : 'transition fit';
  t.note(`Result: ${type}.`);
  t.ref('ISO 286-1/-2 system; Roloff/Matek Maschinenelemente ch. 2; Shigley ch. 7-8 (limits and fits).');
  return { trace: t.toJSON(), results: { hole: { v: `${N(D)} ${inp.holeL}${inp.holeG}: ${h.EI >= 0 ? '+' : ''}${h.EI} / ${h.ES >= 0 ? '+' : ''}${h.ES} µm`, u: '', label: 'Hole limits' }, shaft: { v: `${inp.shaftL}${inp.shaftG}: ${s.ei >= 0 ? '+' : ''}${s.ei} / ${s.es >= 0 ? '+' : ''}${s.es} µm`, u: '', label: 'Shaft limits' }, cmax: { v: cmax, u: 'µm', label: 'Max clearance' }, cmin: { v: cmin, u: 'µm', label: 'Min clearance' }, type: { v: type, u: '', label: 'Fit type' } }, viz: { D, h, s, type, cmax, cmin } };
}

// ---------------- Bolted joint (Shigley ch. 8) ----------------
export const BOLT_CLASSES = { // proof Sp, ultimate Sut, yield Sy (MPa), endurance Se fully corrected for rolled threads (MPa)
  '4.6': [225, 400, 240, 93], '4.8': [310, 420, 340, 93], '5.8': [380, 520, 420, 93], '8.8': [600, 830, 660, 129], '9.8': [650, 900, 720, 140], '10.9': [830, 1040, 940, 162], '12.9': [970, 1220, 1100, 190],
};
export const METRIC_COARSE = { 5: 0.8, 6: 1, 8: 1.25, 10: 1.5, 12: 1.75, 14: 2, 16: 2, 20: 2.5, 24: 3, 30: 3.5, 36: 4 };
export function boltedJoint(inp) {
  const t = new Trace('Bolted joint in tension — stiffness, preload and safety factors');
  const d = inp.d, p = METRIC_COARSE[d] || inp.pitch, [Sp, Sut, Sy, Se] = BOLT_CLASSES[inp.cls];
  t.assume('Hexagon-head bolt and nut, members of one material, pressure-cone (frustum) half-angle 30°, washer face 1.5d.');
  t.assume('External tensile load shared through the joint diagram; threads rolled; fatigue endurance from fully corrected values.');
  t.give('d', d, 'mm'); t.give('p', p, 'mm', 'thread pitch'); t.give('l', inp.l, 'mm', 'grip length');
  t.section('Bolt geometry');
  const At = t.step('Tensile-stress area', 'A_t = \\dfrac{\\pi}{4}(d - 0.9382p)^2', `A_t = \\dfrac{\\pi}{4}(${N(d)} - 0.9382 \\times ${N(p)})^2`, Math.PI / 4 * (d - 0.9382 * p) ** 2, 'mm^2', 'A_t');
  const Ad = t.step('Major-diameter area', 'A_d = \\pi d^2/4', `A_d = \\pi \\times ${N(d)}^2/4`, Math.PI * d * d / 4, 'mm^2', 'A_d');
  const H = 0.875 * d; const Lmin = inp.l + H;
  const Lstd = [10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200, 220, 240, 260, 280, 300].find(x => x >= Lmin) || Math.ceil(Lmin / 10) * 10;
  const L = t.step('Fastener length (next preferred size ≥ l + H)', 'L \\geq l + H,\\ H \\approx 0.875d', `L \\geq ${N(inp.l)} + ${N(H)} = ${N(Lmin)}`, Lstd, 'mm', 'L');
  const LT = t.step('Threaded length', L <= 125 ? 'L_T = 2d + 6' : L <= 200 ? 'L_T = 2d + 12' : 'L_T = 2d + 25', '', L <= 125 ? 2 * d + 6 : L <= 200 ? 2 * d + 12 : 2 * d + 25, 'mm', 'L_T');
  const ld = t.step('Unthreaded length in grip', 'l_d = L - L_T', `l_d = ${N(L)} - ${N(LT)}`, Math.max(0, L - LT), 'mm', 'l_d');
  const lt = t.step('Threaded length in grip', 'l_t = l - l_d', `l_t = ${N(inp.l)} - ${N(ld)}`, inp.l - ld, 'mm', 'l_t');
  t.section('Stiffnesses');
  const Eb = inp.Eb * 1000, Em = inp.Em * 1000; // GPa → MPa
  const kb = t.step('Bolt stiffness', 'k_b = \\dfrac{A_d A_t E_b}{A_d l_t + A_t l_d}', `k_b = \\dfrac{${N(Ad)} \\times ${N(At)} \\times ${N(Eb)}}{${N(Ad)} \\times ${N(lt)} + ${N(At)} \\times ${N(ld)}}`, Ad * At * Eb / (Ad * lt + At * ld), 'N/mm', 'k_b');
  const km = t.step('Member stiffness (frustum, 30°)', 'k_m = \\dfrac{0.5774\\pi E_m d}{2\\ln\\left(5\\dfrac{0.5774l + 0.5d}{0.5774l + 2.5d}\\right)}', `k_m = \\dfrac{0.5774\\pi \\times ${N(Em)} \\times ${N(d)}}{2\\ln\\left(5\\dfrac{0.5774 \\times ${N(inp.l)} + 0.5 \\times ${N(d)}}{0.5774 \\times ${N(inp.l)} + 2.5 \\times ${N(d)}}\\right)}`, 0.5774 * Math.PI * Em * d / (2 * Math.log(5 * (0.5774 * inp.l + 0.5 * d) / (0.5774 * inp.l + 2.5 * d))), 'N/mm', 'k_m');
  const C = t.step('Joint stiffness constant', 'C = \\dfrac{k_b}{k_b + k_m}', `C = \\dfrac{${N(kb)}}{${N(kb)} + ${N(km)}}`, kb / (kb + km), '', 'C');
  t.section('Preload and loads');
  const Fi = inp.preMode === 'value' ? t.give('F_i', inp.Fi * 1000, 'N', 'specified preload') : t.step(`Preload (${inp.preMode === 'perm' ? 'permanent' : 'reusable'} connection)`, `F_i = ${inp.preMode === 'perm' ? '0.90' : '0.75'} A_t S_p`, `F_i = ${inp.preMode === 'perm' ? '0.90' : '0.75'} \\times ${N(At)} \\times ${N(Sp)}`, (inp.preMode === 'perm' ? 0.9 : 0.75) * At * Sp, 'N', 'F_i');
  const T = t.step('Tightening torque', 'T = K F_i d', `T = ${N(inp.K)} \\times ${N(Fi)} \\times ${N(d / 1000)}`, inp.K * Fi * d / 1000, 'N-m', 'T');
  const P = inp.P * 1000 / inp.nb;
  if (inp.nb > 1) t.step('External load per bolt', 'P = P_{total}/N', `P = ${N(inp.P * 1000)}/${inp.nb}`, P, 'N', 'P');
  const Fb = t.step('Bolt force', 'F_b = CP + F_i', `F_b = ${N(C)} \\times ${N(P)} + ${N(Fi)}`, C * P + Fi, 'N', 'F_b');
  const Fm = t.step('Member force (negative = compression)', 'F_m = (1 - C)P - F_i', `F_m = (1 - ${N(C)}) \\times ${N(P)} - ${N(Fi)}`, (1 - C) * P - Fi, 'N', 'F_m');
  t.section('Safety factors');
  const np = t.step('Yielding factor (proof strength)', 'n_p = \\dfrac{S_p A_t}{CP + F_i}', `n_p = \\dfrac{${N(Sp)} \\times ${N(At)}}{${N(Fb)}}`, Sp * At / Fb, '', 'n_p');
  const nL = t.step('Load factor', 'n_L = \\dfrac{S_p A_t - F_i}{CP}', `n_L = \\dfrac{${N(Sp * At)} - ${N(Fi)}}{${N(C)} \\times ${N(P)}}`, (Sp * At - Fi) / (C * P), '', 'n_L');
  const n0 = t.step('Joint-separation factor', 'n_0 = \\dfrac{F_i}{P(1 - C)}', `n_0 = \\dfrac{${N(Fi)}}{${N(P)}(1 - ${N(C)})}`, Fi / (P * (1 - C)), '', 'n_0');
  let nf = null;
  if (inp.fatigue) {
    t.section('Fatigue (load cycling 0 → P, Goodman)');
    const sa = t.step('Alternating stress', '\\sigma_a = \\dfrac{CP}{2A_t}', `\\sigma_a = \\dfrac{${N(C)} \\times ${N(P)}}{2 \\times ${N(At)}}`, C * P / (2 * At), 'MPa', '\\sigma_a');
    const si = t.step('Preload stress', '\\sigma_i = F_i/A_t', `\\sigma_i = ${N(Fi)}/${N(At)}`, Fi / At, 'MPa', '\\sigma_i');
    nf = t.step('Fatigue factor (Goodman)', 'n_f = \\dfrac{S_e(S_{ut} - \\sigma_i)}{S_{ut}\\sigma_a + S_e(\\sigma_m - \\sigma_i)},\\ \\sigma_m = \\sigma_a + \\sigma_i', `n_f = \\dfrac{${N(Se)}(${N(Sut)} - ${N(si)})}{${N(Sut)} \\times ${N(sa)} + ${N(Se)} \\times ${N(sa)}}`, Se * (Sut - si) / (Sut * sa + Se * sa), '', 'n_f');
    t.check('Fatigue factor n_f > 1', nf > 1);
  }
  t.check('Bolt does not reach proof load (n_p > 1)', np > 1); t.check('Joint does not separate (n_0 > 1)', n0 > 1);
  t.ref("Shigley's Mechanical Engineering Design, ch. 8 (joint stiffness, eq. for frustum member stiffness, metric property classes); VDI 2230 gives the full method.");
  return { trace: t.toJSON(), results: { At: { v: At, u: 'mm²', label: 'At' }, kb: { v: kb, u: 'N/mm', label: 'kb' }, km: { v: km, u: 'N/mm', label: 'km' }, C: { v: C, u: '', label: 'C' }, Fi: { v: Fi / 1000, u: 'kN', label: 'Preload Fi' }, T: { v: T, u: 'N·m', label: 'Torque' }, Fb: { v: Fb / 1000, u: 'kN', label: 'Bolt force' }, np: { v: np, u: '', label: 'n_p' }, nL: { v: nL, u: '', label: 'n_L' }, n0: { v: n0, u: '', label: 'n_0 separation' }, ...(nf ? { nf: { v: nf, u: '', label: 'n_f fatigue' } } : {}) }, viz: { kb, km, Fi, P, C, d, l: inp.l, L, ld, lt } };
}

// ---------------- Shaft fatigue (Shigley ch. 6-7) ----------------
const SURF = { ground: [1.58, -0.085], machined: [4.51, -0.265], hotrolled: [57.7, -0.718], forged: [272, -0.995] };
const REL = { 50: 1, 90: 0.897, 95: 0.868, 99: 0.814, 99.9: 0.753, 99.99: 0.702 };
export function shaft(inp) {
  const t = new Trace('Shaft at a stress concentration — fatigue and first-cycle yield (DE criteria)');
  t.assume('Solid round shaft, fully reversed bending plus steady torsion (general alternating/mean components allowed), infinite-life design.');
  const d = inp.d;
  t.section('Endurance limit (Marin factors)');
  const Sep = t.step("Rotating-beam endurance limit", "S_e' = 0.5 S_{ut}\\ (S_{ut} \\le 1400\\,\\mathrm{MPa})", `S_e' = 0.5 \\times ${N(inp.Sut)}`, inp.Sut <= 1400 ? 0.5 * inp.Sut : 700, 'MPa', "S_e'");
  const [a, b] = SURF[inp.surface];
  const ka = t.step('Surface factor', 'k_a = a S_{ut}^{b}', `k_a = ${a} \\times ${N(inp.Sut)}^{${b}}`, a * Math.pow(inp.Sut, b), '', 'k_a');
  const kb = t.step('Size factor', d <= 51 ? 'k_b = 1.24 d^{-0.107}' : 'k_b = 1.51 d^{-0.157}', `k_b = ${d <= 51 ? '1.24' : '1.51'} \\times ${N(d)}^{${d <= 51 ? '-0.107' : '-0.157'}}`, d <= 51 ? 1.24 * Math.pow(d, -0.107) : 1.51 * Math.pow(d, -0.157), '', 'k_b');
  const ke = t.step(`Reliability factor (${inp.rel} %)`, 'k_e', '', REL[inp.rel], '', 'k_e');
  const Se = t.step('Corrected endurance limit', "S_e = k_a k_b k_c k_d k_e S_e'", `S_e = ${N(ka)} \\times ${N(kb)} \\times 1 \\times 1 \\times ${N(ke)} \\times ${N(Sep)}`, ka * kb * ke * Sep, 'MPa', 'S_e');
  t.section('Stress-concentration factors');
  const Kf = inp.Kf > 0 ? t.give('K_f', inp.Kf, '', 'given') : t.step('Fatigue SCF (bending)', 'K_f = 1 + q(K_t - 1)', `K_f = 1 + ${N(inp.q)}(${N(inp.Kt)} - 1)`, 1 + inp.q * (inp.Kt - 1), '', 'K_f');
  const Kfs = inp.Kfs > 0 ? t.give('K_{fs}', inp.Kfs, '', 'given') : t.step('Fatigue SCF (torsion)', 'K_{fs} = 1 + q_s(K_{ts} - 1)', `K_{fs} = 1 + ${N(inp.qs)}(${N(inp.Kts)} - 1)`, 1 + inp.qs * (inp.Kts - 1), '', 'K_{fs}');
  t.section('Stresses');
  const c3 = Math.PI * Math.pow(d / 1000, 3);
  const sa = t.step('Alternating bending stress', '\\sigma_a = K_f\\dfrac{32 M_a}{\\pi d^3}', `\\sigma_a = ${N(Kf)}\\dfrac{32 \\times ${N(inp.Ma)}}{\\pi \\times ${N(d / 1000)}^3}`, Kf * 32 * inp.Ma / c3 / 1e6, 'MPa', '\\sigma_a');
  const sm = t.step('Mean bending stress', '\\sigma_m = K_f\\dfrac{32 M_m}{\\pi d^3}', `\\sigma_m = ${N(Kf)}\\dfrac{32 \\times ${N(inp.Mm)}}{\\pi d^3}`, Kf * 32 * inp.Mm / c3 / 1e6, 'MPa', '\\sigma_m');
  const ta = t.step('Alternating torsional stress', '\\tau_a = K_{fs}\\dfrac{16 T_a}{\\pi d^3}', `\\tau_a = ${N(Kfs)}\\dfrac{16 \\times ${N(inp.Ta)}}{\\pi d^3}`, Kfs * 16 * inp.Ta / c3 / 1e6, 'MPa', '\\tau_a');
  const tm = t.step('Mean torsional stress', '\\tau_m = K_{fs}\\dfrac{16 T_m}{\\pi d^3}', `\\tau_m = ${N(Kfs)}\\dfrac{16 \\times ${N(inp.Tm)}}{\\pi \\times ${N(d / 1000)}^3}`, Kfs * 16 * inp.Tm / c3 / 1e6, 'MPa', '\\tau_m');
  const sae = t.step('von Mises alternating', "\\sigma_a' = \\sqrt{\\sigma_a^2 + 3\\tau_a^2}", `\\sigma_a' = \\sqrt{${N(sa)}^2 + 3 \\times ${N(ta)}^2}`, Math.sqrt(sa * sa + 3 * ta * ta), 'MPa', "\\sigma_a'");
  const sme = t.step('von Mises mean', "\\sigma_m' = \\sqrt{\\sigma_m^2 + 3\\tau_m^2}", `\\sigma_m' = \\sqrt{${N(sm)}^2 + 3 \\times ${N(tm)}^2}`, Math.sqrt(sm * sm + 3 * tm * tm), 'MPa', "\\sigma_m'");
  t.section('Factors of safety');
  const nG = t.step('DE-Goodman', "\\dfrac{1}{n} = \\dfrac{\\sigma_a'}{S_e} + \\dfrac{\\sigma_m'}{S_{ut}}", `\\dfrac{1}{n} = \\dfrac{${N(sae)}}{${N(Se)}} + \\dfrac{${N(sme)}}{${N(inp.Sut)}}`, 1 / (sae / Se + sme / inp.Sut), '', 'n_{Goodman}');
  const r = sme > 0 ? sae / sme : Infinity;
  const nGer = t.step('DE-Gerber', "n = \\dfrac{1}{2}\\left(\\dfrac{S_{ut}}{\\sigma_m'}\\right)^2\\dfrac{\\sigma_a'}{S_e}\\left[-1 + \\sqrt{1 + \\left(\\dfrac{2\\sigma_m' S_e}{S_{ut}\\sigma_a'}\\right)^2}\\right]", '', sme > 0 ? 0.5 * (inp.Sut / sme) ** 2 * (sae / Se) * (-1 + Math.sqrt(1 + (2 * sme * Se / (inp.Sut * sae)) ** 2)) : Se / sae, '', 'n_{Gerber}');
  const nE = t.step('DE-ASME Elliptic', "\\dfrac{1}{n} = \\sqrt{\\left(\\dfrac{\\sigma_a'}{S_e}\\right)^2 + \\left(\\dfrac{\\sigma_m'}{S_y}\\right)^2}", '', 1 / Math.sqrt((sae / Se) ** 2 + (sme / inp.Sy) ** 2), '', 'n_{ASME}');
  const nS = t.step('DE-Soderberg', "\\dfrac{1}{n} = \\dfrac{\\sigma_a'}{S_e} + \\dfrac{\\sigma_m'}{S_y}", '', 1 / (sae / Se + sme / inp.Sy), '', 'n_{Soderberg}');
  const smax = t.step('Maximum von Mises stress', "\\sigma'_{max} = \\sqrt{(\\sigma_m + \\sigma_a)^2 + 3(\\tau_m + \\tau_a)^2}", `\\sigma'_{max} = \\sqrt{(${N(sm)} + ${N(sa)})^2 + 3(${N(tm)} + ${N(ta)})^2}`, Math.sqrt((sm + sa) ** 2 + 3 * (tm + ta) ** 2), 'MPa', "\\sigma'_{max}");
  const ny = t.step('First-cycle yield', "n_y = S_y/\\sigma'_{max}", `n_y = ${N(inp.Sy)}/${N(smax)}`, inp.Sy / smax, '', 'n_y');
  t.check('Infinite life (Goodman n > 1)', nG > 1); t.check('No first-cycle yield (n_y > 1)', ny > 1);
  t.ref("Shigley's Mechanical Engineering Design, ch. 6 (Marin factors, Goodman/Gerber/ASME/Soderberg) and ch. 7 (shaft equations).");
  return { trace: t.toJSON(), results: { Se: { v: Se, u: 'MPa', label: 'Se' }, sa: { v: sae, u: 'MPa', label: "σa'" }, sm: { v: sme, u: 'MPa', label: "σm'" }, nG: { v: nG, u: '', label: 'n Goodman' }, nGer: { v: nGer, u: '', label: 'n Gerber' }, nE: { v: nE, u: '', label: 'n ASME-elliptic' }, nS: { v: nS, u: '', label: 'n Soderberg' }, ny: { v: ny, u: '', label: 'n yield' } }, viz: { sa: sae, sm: sme, Se, Sut: inp.Sut, Sy: inp.Sy, d, inp, rawSa: sa, rawTm: tm } };
}

// ---------------- Rolling bearing life (ISO 281 basic + a1) ----------------
const DG_TABLE = [ // deep-groove ball bearing: Fa/C0, e, Y (X = 0.56 when Fa/Fr > e)
  [0.014, 0.19, 2.30], [0.028, 0.22, 1.99], [0.056, 0.26, 1.71], [0.084, 0.28, 1.55], [0.11, 0.30, 1.45], [0.17, 0.34, 1.31], [0.28, 0.38, 1.15], [0.42, 0.42, 1.04], [0.56, 0.44, 1.00],
];
const A1 = { 90: 1, 95: 0.64, 96: 0.55, 97: 0.47, 98: 0.37, 99: 0.25 };
export function bearing(inp) {
  const t = new Trace('Rolling-bearing rating life (ISO 281 basic rating life, reliability factor a1)');
  t.assume('Constant load and speed; equivalent dynamic load from X and Y factors; life modification factor a_ISO entered by the user (1 = no correction).');
  const p = inp.type === 'ball' ? 3 : 10 / 3;
  t.section('Equivalent dynamic load');
  let X = inp.X, Y = inp.Y;
  if (inp.type === 'ball' && inp.autoXY && inp.Fa > 0) {
    const r = inp.Fa / inp.C0;
    const ratio = t.step('Relative axial load', 'F_a/C_0', `${N(inp.Fa)}/${N(inp.C0)}`, r, '', 'F_a/C_0');
    let i = DG_TABLE.findIndex(row => row[0] >= r); if (i < 0) i = DG_TABLE.length - 1; if (i === 0) i = 1;
    const [r1, e1, y1] = DG_TABLE[i - 1], [r2, e2, y2] = DG_TABLE[i];
    const f = Math.min(1, Math.max(0, (r - r1) / (r2 - r1)));
    const e = t.step('Load-dependent factor e (interpolated)', 'e = e_1 + \\dfrac{F_a/C_0 - r_1}{r_2 - r_1}(e_2 - e_1)', `e = ${e1} + \\dfrac{${N(ratio)} - ${r1}}{${r2} - ${r1}}(${e2} - ${e1})`, e1 + f * (e2 - e1), '', 'e');
    if (inp.Fa / inp.Fr > e) { X = 0.56; Y = t.step('Axial factor Y (interpolated), X = 0.56 since F_a/F_r > e', 'Y', '', y1 + f * (y2 - y1), '', 'Y'); }
    else { X = 1; Y = 0; t.note('F_a/F_r ≤ e, so X = 1 and Y = 0.'); }
  }
  const P = t.step('Equivalent dynamic load', 'P = X F_r + Y F_a', `P = ${N(X)} \\times ${N(inp.Fr)} + ${N(Y)} \\times ${N(inp.Fa)}`, X * inp.Fr + Y * inp.Fa, 'kN', 'P');
  t.section('Life');
  const L10 = t.step('Basic rating life (million revolutions)', 'L_{10} = \\left(\\dfrac{C}{P}\\right)^{p}', `L_{10} = \\left(\\dfrac{${N(inp.C)}}{${N(P)}}\\right)^{${inp.type === 'ball' ? '3' : '10/3'}}`, Math.pow(inp.C / P, p), '', 'L_{10}\\,[10^6\\,\\mathrm{rev}]');
  const L10h = t.step('Basic rating life in hours', 'L_{10h} = \\dfrac{10^6}{60 n} L_{10}', `L_{10h} = \\dfrac{10^6}{60 \\times ${N(inp.n)}} \\times ${N(L10)}`, 1e6 / (60 * inp.n) * L10, 'h', 'L_{10h}');
  const a1 = t.step(`Reliability factor a1 (${inp.rel} %)`, 'a_1', '', A1[inp.rel], '', 'a_1');
  const Lnm = t.step('Modified rating life', 'L_{nm,h} = a_1 a_{ISO} L_{10h}', `L_{nm,h} = ${N(a1)} \\times ${N(inp.aISO)} \\times ${N(L10h)}`, a1 * inp.aISO * L10h, 'h', 'L_{nm,h}');
  if (inp.Lreq > 0) t.check(`Required life ${inp.Lreq} h reached`, Lnm >= inp.Lreq, `${Math.round(Lnm)} h`);
  const Creq = inp.Lreq > 0 ? t.step('Required dynamic load rating for the required life', 'C_{req} = P\\left(\\dfrac{60 n L_{req}}{10^6 a_1 a_{ISO}}\\right)^{1/p}', '', P * Math.pow(60 * inp.n * inp.Lreq / (1e6 * a1 * inp.aISO), 1 / p), 'kN', 'C_{req}') : null;
  t.ref('ISO 281:2007 rating life and a1 factors; X, Y for deep-groove ball bearings as in Shigley Table 11-1 / manufacturer catalogues.');
  return { trace: t.toJSON(), results: { P: { v: P, u: 'kN', label: 'Equivalent load P' }, L10: { v: L10, u: 'Mrev', label: 'L10' }, L10h: { v: L10h, u: 'h', label: 'L10h' }, Lnm: { v: Lnm, u: 'h', label: 'Lnm,h' }, ...(Creq ? { Creq: { v: Creq, u: 'kN', label: 'C required' } } : {}) }, viz: { inp, P, L10h, Lnm } };
}

// ---------------- Spur gear (geometry + Lewis bending) ----------------
const LEWIS = [[12, 0.245], [13, 0.261], [14, 0.277], [15, 0.290], [16, 0.296], [17, 0.303], [18, 0.309], [19, 0.314], [20, 0.322], [21, 0.328], [22, 0.331], [24, 0.337], [26, 0.346], [28, 0.353], [30, 0.359], [34, 0.371], [38, 0.384], [43, 0.397], [50, 0.409], [60, 0.422], [75, 0.435], [100, 0.447], [150, 0.460], [300, 0.472], [400, 0.480]];
export function lewisY(z) {
  if (z <= 12) return 0.245; if (z >= 400) return 0.480;
  for (let i = 0; i < LEWIS.length - 1; i++) { const [z1, y1] = LEWIS[i], [z2, y2] = LEWIS[i + 1]; if (z >= z1 && z <= z2) return y1 + (z - z1) / (z2 - z1) * (y2 - y1); }
  return 0.485;
}
export function spurGear(inp) {
  const t = new Trace('Spur gear pair — geometry, forces and Lewis bending stress');
  t.assume('Full-depth involute teeth, standard addendum = m, dedendum = 1.25m; load at the tooth tip (Lewis), one tooth pair carrying the load; dynamic factor from Barth.');
  const m = inp.m, z1 = inp.z1, z2 = inp.z2, al = inp.alpha * Math.PI / 180;
  t.section('Geometry');
  const d1 = t.step('Pinion pitch diameter', 'd_1 = m z_1', `d_1 = ${N(m)} \\times ${z1}`, m * z1, 'mm', 'd_1');
  const d2 = t.step('Gear pitch diameter', 'd_2 = m z_2', `d_2 = ${N(m)} \\times ${z2}`, m * z2, 'mm', 'd_2');
  const a = t.step('Centre distance', 'a = (d_1 + d_2)/2', `a = (${N(d1)} + ${N(d2)})/2`, (d1 + d2) / 2, 'mm', 'a');
  const i = t.step('Gear ratio', 'i = z_2/z_1', `i = ${z2}/${z1}`, z2 / z1, '', 'i');
  const rb1 = d1 / 2 * Math.cos(al), rb2 = d2 / 2 * Math.cos(al), ra1 = d1 / 2 + m, ra2 = d2 / 2 + m;
  t.step('Base circle diameters', 'd_b = d\\cos\\alpha', `d_{b1} = ${N(d1)}\\cos ${inp.alpha}^\\circ`, 2 * rb1, 'mm', 'd_{b1}');
  const pb = Math.PI * m * Math.cos(al);
  const eps = t.step('Contact ratio', '\\varepsilon_\\alpha = \\dfrac{\\sqrt{r_{a1}^2 - r_{b1}^2} + \\sqrt{r_{a2}^2 - r_{b2}^2} - a\\sin\\alpha}{\\pi m\\cos\\alpha}', `\\varepsilon_\\alpha = \\dfrac{${N(Math.sqrt(ra1 ** 2 - rb1 ** 2))} + ${N(Math.sqrt(ra2 ** 2 - rb2 ** 2))} - ${N(a * Math.sin(al))}}{${N(pb)}}`, (Math.sqrt(ra1 ** 2 - rb1 ** 2) + Math.sqrt(ra2 ** 2 - rb2 ** 2) - a * Math.sin(al)) / pb, '', '\\varepsilon_\\alpha');
  t.check('Contact ratio ≥ 1.2', eps >= 1.2);
  const zmin = 2 / Math.sin(al) ** 2;
  t.check(`No undercut on the pinion (z1 ≥ ${zmin.toFixed(1)} for a rack-generated tooth)`, z1 >= zmin);
  t.section('Loads');
  const V = t.step('Pitch-line velocity', 'V = \\dfrac{\\pi d_1 n_1}{60}', `V = \\dfrac{\\pi \\times ${N(d1 / 1000)} \\times ${N(inp.n1)}}{60}`, Math.PI * d1 / 1000 * inp.n1 / 60, 'm/s', 'V');
  const T1 = t.step('Pinion torque', 'T_1 = \\dfrac{P}{2\\pi n_1/60}', `T_1 = \\dfrac{${N(inp.P * 1000)}}{2\\pi \\times ${N(inp.n1)}/60}`, inp.P * 1000 / (2 * Math.PI * inp.n1 / 60), 'N-m', 'T_1');
  const Wt = t.step('Transmitted (tangential) load', 'W_t = \\dfrac{2T_1}{d_1}', `W_t = \\dfrac{2 \\times ${N(T1)}}{${N(d1 / 1000)}}`, 2 * T1 / (d1 / 1000), 'N', 'W_t');
  const Wr = t.step('Radial load', 'W_r = W_t\\tan\\alpha', `W_r = ${N(Wt)}\\tan ${inp.alpha}^\\circ`, Wt * Math.tan(al), 'N', 'W_r');
  t.section('Bending stress (Lewis)');
  const Y = t.step('Lewis form factor (interpolated)', 'Y(z_1)', '', lewisY(z1), '', 'Y');
  const kvc = { cast: [3.05, 'cast profile'], cut: [6.1, 'cut or milled profile'], hobbed: [3.56, 'hobbed/shaped (sqrt)'] }[inp.profile];
  const Kv = t.step(`Dynamic factor (Barth/AGMA, ${kvc[1]})`, inp.profile === 'hobbed' ? 'K_v = \\dfrac{3.56 + \\sqrt{V}}{3.56}' : `K_v = \\dfrac{${kvc[0]} + V}{${kvc[0]}}`, '', inp.profile === 'hobbed' ? (3.56 + Math.sqrt(V)) / 3.56 : (kvc[0] + V) / kvc[0], '', 'K_v');
  const sig = t.step('Bending stress', '\\sigma = \\dfrac{K_v W_t}{b\\,m\\,Y}', `\\sigma = \\dfrac{${N(Kv)} \\times ${N(Wt)}}{${N(inp.b)} \\times ${N(m)} \\times ${N(Y)}}`, Kv * Wt / (inp.b * m * Y), 'MPa', '\\sigma');
  const n = t.step('Safety factor against the allowable', 'n = \\dfrac{S_y}{\\sigma}', `n = ${N(inp.Sy)}/${N(sig)}`, inp.Sy / sig, '', 'n');
  const Pallow = t.step(`Power rating for design factor n_d = ${inp.nd}`, 'P_{allow} = \\dfrac{b\\,m\\,Y\\,S_y}{n_d K_v}V', '', inp.b * m * Y * inp.Sy / (inp.nd * Kv) * V / 1000, 'kW', 'P_{allow}');
  t.check(`Safety factor ≥ design factor ${inp.nd}`, n >= inp.nd);
  t.ref("Shigley's Mechanical Engineering Design, ch. 13 (gear geometry) and ch. 14 (Lewis equation, Table 14-2 form factors, Barth dynamic factor). ISO 6336 / AGMA 2001 rating is planned for phase 2.");
  return { trace: t.toJSON(), results: { d1: { v: d1, u: 'mm', label: 'd1' }, d2: { v: d2, u: 'mm', label: 'd2' }, a: { v: a, u: 'mm', label: 'Centre distance' }, eps: { v: eps, u: '', label: 'Contact ratio' }, Wt: { v: Wt, u: 'N', label: 'Wt' }, sigma: { v: sig, u: 'MPa', label: 'σ bending' }, n: { v: n, u: '', label: 'Safety factor' }, Pallow: { v: Pallow, u: 'kW', label: 'Power rating' } }, viz: { m, z1, z2, al, a, Wt, Wr, n1: inp.n1, i } };
}

// ---------------- Helical compression spring (Shigley ch. 10) ----------------
export const SPRING_MAT = { // A (MPa·mm^m), m, G (GPa), Ssy/Sut (static, set removed)
  'Music wire A228': [2211, 0.145, 81.7, 0.45], 'Oil-tempered A229': [1855, 0.187, 77.2, 0.50], 'Hard-drawn A227': [1783, 0.190, 80.0, 0.45], 'Chrome-vanadium A232': [2005, 0.168, 77.2, 0.50], 'Chrome-silicon A401': [1974, 0.108, 77.2, 0.50], 'Stainless 302 A313': [1867, 0.146, 69.0, 0.35],
};
export function spring(inp) {
  const t = new Trace('Helical compression spring — static design');
  const [A, mexp, G, ratio] = SPRING_MAT[inp.mat];
  const d = inp.d, D = inp.D, Na = inp.Na;
  t.assume('Round wire, static load, set not removed; Bergsträsser factor for direct + torsional shear with curvature.');
  t.section('Geometry and stiffness');
  const C = t.step('Spring index', 'C = D/d', `C = ${N(D)}/${N(d)}`, D / d, '', 'C');
  t.check('Spring index 4 ≤ C ≤ 12', C >= 4 && C <= 12);
  const KB = t.step('Bergsträsser factor', 'K_B = \\dfrac{4C + 2}{4C - 3}', `K_B = \\dfrac{4 \\times ${N(C)} + 2}{4 \\times ${N(C)} - 3}`, (4 * C + 2) / (4 * C - 3), '', 'K_B');
  const k = t.step('Spring rate', 'k = \\dfrac{d^4 G}{8 D^3 N_a}', `k = \\dfrac{${N(d)}^4 \\times ${N(G * 1000)}}{8 \\times ${N(D)}^3 \\times ${N(Na)}}`, d ** 4 * G * 1000 / (8 * D ** 3 * Na), 'N/mm', 'k');
  const ends = { plain: [0, (Na) => Na + 1, (p, Na) => p * Na + d], plainGround: [1, (Na) => Na + 1, (p, Na) => p * (Na + 1)], squared: [2, (Na) => Na + 3, (p, Na) => p * Na + 3 * d], squaredGround: [2, (Na) => Na + 2, (p, Na) => p * Na + 2 * d] }[inp.ends];
  const Nt = t.step('Total coils', { plain: 'N_t = N_a', plainGround: 'N_t = N_a + 1', squared: 'N_t = N_a + 2', squaredGround: 'N_t = N_a + 2' }[inp.ends], '', { plain: Na, plainGround: Na + 1, squared: Na + 2, squaredGround: Na + 2 }[inp.ends], '', 'N_t');
  const Ls = t.step('Solid length', { plain: 'L_s = d(N_t + 1)', plainGround: 'L_s = dN_t', squared: 'L_s = d(N_t + 1)', squaredGround: 'L_s = dN_t' }[inp.ends], '', { plain: d * (Nt + 1), plainGround: d * Nt, squared: d * (Nt + 1), squaredGround: d * Nt }[inp.ends], 'mm', 'L_s');
  t.section('Load and stress');
  const y = t.step('Deflection under the working load', 'y = F/k', `y = ${N(inp.F)}/${N(k)}`, inp.F / k, 'mm', 'y');
  const tau = t.step('Shear stress', '\\tau = K_B\\dfrac{8FD}{\\pi d^3}', `\\tau = ${N(KB)}\\dfrac{8 \\times ${N(inp.F)} \\times ${N(D)}}{\\pi \\times ${N(d)}^3}`, KB * 8 * inp.F * D / (Math.PI * d ** 3), 'MPa', '\\tau');
  const Sut = t.step('Minimum tensile strength', 'S_{ut} = A/d^{m}', `S_{ut} = ${A}/${N(d)}^{${mexp}}`, A / Math.pow(d, mexp), 'MPa', 'S_{ut}');
  const Ssy = t.step('Torsional yield strength', `S_{sy} = ${ratio} S_{ut}`, `S_{sy} = ${ratio} \\times ${N(Sut)}`, ratio * Sut, 'MPa', 'S_{sy}');
  const n = t.step('Safety factor at the working load', 'n = S_{sy}/\\tau', `n = ${N(Ssy)}/${N(tau)}`, Ssy / tau, '', 'n');
  const L0 = inp.L0 > 0 ? inp.L0 : Ls + y * (1 + 0.15) ;
  if (!(inp.L0 > 0)) t.step('Free length (15 % fractional overrun to solid)', 'L_0 = L_s + 1.15\\,y', `L_0 = ${N(Ls)} + 1.15 \\times ${N(y)}`, L0, 'mm', 'L_0');
  const ys = L0 - Ls;
  const Fs = t.step('Force to close solid', 'F_s = k(L_0 - L_s)', `F_s = ${N(k)}(${N(L0)} - ${N(Ls)})`, k * ys, 'N', 'F_s');
  const ns = t.step('Safety factor when closed solid', 'n_s = \\dfrac{S_{sy}}{K_B 8F_sD/\\pi d^3}', '', Ssy / (KB * 8 * Fs * D / (Math.PI * d ** 3)), '', 'n_s');
  const alpha = { plain: 0.5, plainGround: 0.5, squared: 0.5, squaredGround: 0.5 }[inp.ends] * (inp.fixed ? 1 : 2);
  const Lcr = t.step('Buckling-critical free length (steel)', 'L_{0,cr} = 2.63\\dfrac{D}{\\alpha}', `L_{0,cr} = 2.63\\dfrac{${N(D)}}{${N(alpha)}}`, 2.63 * D / alpha, 'mm', 'L_{0,cr}');
  const W = Math.PI ** 2 * d * d * D * Na * 7.85e-6 / 4 * 9.81; // weight of active coils (N), steel
  const fn = t.step('Natural frequency (both ends against flat plates)', 'f = \\dfrac{1}{2}\\sqrt{\\dfrac{kg}{W}}', '', 0.5 * Math.sqrt(k * 1000 * 9.81 / W), 'Hz', 'f');
  t.check('Working-load safety n ≥ 1.2', n >= 1.2); t.check('Solid safety n_s ≥ 1.2 (spring may be closed solid)', ns >= 1.2); t.check('Not prone to buckling (L0 < L0,cr)', L0 < Lcr);
  t.ref("Shigley's Mechanical Engineering Design, ch. 10 (Table 10-1 end formulas, Table 10-4 strength constants, eq. 10-7 Bergsträsser); EN 13906-1 for the European method.");
  return { trace: t.toJSON(), results: { C: { v: C, u: '', label: 'Index C' }, k: { v: k, u: 'N/mm', label: 'Rate k' }, tau: { v: tau, u: 'MPa', label: 'τ working' }, n: { v: n, u: '', label: 'n working' }, ns: { v: ns, u: '', label: 'n solid' }, L0: { v: L0, u: 'mm', label: 'Free length' }, Ls: { v: Ls, u: 'mm', label: 'Solid length' }, f: { v: fn, u: 'Hz', label: 'f natural' } }, viz: { d, D, Nt, Na, L0, Ls, y, k, F: inp.F, tau, Ssy } };
}
