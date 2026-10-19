import { h } from '../ui.js';
import { t } from '../i18n.js';
import { VALIDATION } from '../validation-data.js';
export function makeHomePage(PAGES) {
  const page = { id: 'home', group: 'start', icon: '🏠', title: 'Start' };
  page.render = (main, { go }) => {
    const card = (id, text) => { const p = PAGES.find(x => x.id === id); return h('div', { class: 'home-card', onclick: () => go(id) }, h('div', { class: 'hc-ic' }, p.icon), h('div', { class: 'hc-t' }, t(p.title)), h('div', { class: 'hc-d' }, t(text))); };
    main.append(
      h('div', { class: 'hero' }, h('h1', {}, 'Mamba Engineering'), h('p', {}, t('Thermodynamics, heat transfer and machine elements in one offline workbench — equation solver with units, drag-and-drop cycles, animated visuals, step-by-step solutions and PDF reports.')),
        h('div', { class: 'hero-badges' }, h('span', {}, `✔ ${VALIDATION.total - VALIDATION.failed}/${VALIDATION.total} ${t('validation checks pass')}`), h('span', {}, t('Properties: CoolProp 6.6 (IAPWS-95 / IF97, refrigerants, air)')), h('span', {}, t('Works offline')))),
      h('h2', { class: 'home-h' }, t('Thermodynamics')),
      h('div', { class: 'home-grid' }, card('canvas', 'Drag components, connect streams, watch particles flow and the T-s / P-h charts move as you change inputs. Rankine, refrigeration, Brayton templates.'), card('equations', 'Type equations in any order, EES-style. Units are checked, unknowns counted, properties looked up.'), card('engines', 'Otto, Diesel and Dual cycles with an animated piston synchronised to P-v and T-s.'), card('proptables', 'Steam and refrigerant tables with interpolation shown step by step.'), card('parametric', 'Vary one input, solve many times, plot the result.')),
      h('h2', { class: 'home-h' }, t('Heat transfer')),
      h('div', { class: 'home-grid' }, card('heat-wall', 'Layered walls and insulated pipes with a live temperature colour gradient.'), card('heat-lumped', 'Bodies heating or cooling in time.'), card('heat-fin', 'Pin and plate fins: efficiency and temperature along the fin.')),
      h('h2', { class: 'home-h' }, t('Machine elements')),
      h('div', { class: 'home-grid' }, card('mech-bolt', 'Joint diagram, preload, torque and safety factors.'), card('mech-shaft', 'Fatigue design with Goodman, Gerber, ASME, Soderberg.'), card('mech-bearing', 'ISO 281 rating life and reliability.'), card('mech-gear', 'Involute gears meshing, Lewis bending.'), card('mech-spring', 'Compression spring design.'), card('mech-fits', 'ISO 286 tolerance zones and fits.'), card('mech-mohr', 'Rotate a stress element on the circle.')),
      h('div', { class: 'ref-note', style: { marginTop: '18px' } }, t('Tip: switch between Education mode (full step-by-step, textbook-table interpolation) and Engineer mode (results first) in the top bar. Every page exports a PDF report.')));
  };
  return page;
}
