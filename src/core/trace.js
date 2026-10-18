// Step recorder for closed-form engineering calculations (heat transfer, machine elements).
import { fmtNum, unitLatex } from './latex.js';
export class Trace {
  constructor(title) { this.title = title; this.sections = []; this.cur = null; this.checks = []; this.given = []; this.assumptions = []; this.refs = []; }
  section(title) { this.cur = { title, steps: [] }; this.sections.push(this.cur); return this; }
  give(sym, v, u, label) { this.given.push({ sym, v, u, label, latex: `${sym} = ${q(v, u)}` }); return v; }
  assume(text) { this.assumptions.push(text); return this; }
  ref(text) { this.refs.push(text); return this; }
  // step(title, 'symbolic', 'substituted', value, unit, sym)
  step(title, symbolic, substituted, value, unit = '', sym = '') {
    if (!this.cur) this.section('Calculation');
    this.cur.steps.push({ title, symbolic, substituted, result: (sym ? sym + ' = ' : '') + q(value, unit), value, unit });
    return value;
  }
  note(text) { if (!this.cur) this.section('Calculation'); this.cur.steps.push({ note: text }); return this; }
  check(text, ok, detail = '') { this.checks.push({ text, ok, detail }); return ok; }
  toJSON() { return { title: this.title, given: this.given, assumptions: this.assumptions, sections: this.sections, checks: this.checks, refs: this.refs }; }
}
export function q(v, u = '') { return (typeof v === 'number' ? fmtNum(v, 5) : v) + unitLatex(u); }
export const N = (v, s = 5) => fmtNum(v, s);
