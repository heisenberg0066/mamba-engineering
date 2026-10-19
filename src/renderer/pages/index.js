import { makeHomePage } from './home.js';
import { makeEquationsPage } from './equations.js';
import { makeCanvasPage } from './canvas.js';
import { makeEnginesPage } from './engines.js';
import { makePropTablesPage } from './proptables.js';
import { makeParametricPage } from './parametric.js';
import { conductionPage, lumpedPage, finPage } from './heat.js';
import { MECH_PAGES } from './mech.js';
import { makeAboutPage } from './about.js';

export const GROUPS = [
  { id: 'start', title: 'Start' }, { id: 'thermo', title: 'Thermodynamics' }, { id: 'heat', title: 'Heat transfer' }, { id: 'mech', title: 'Machine elements' }, { id: 'help', title: 'Help' },
];
const eq = makeEquationsPage();
export const PAGES = [];
PAGES.push(makeHomePage(PAGES), makeCanvasPage(), eq, makeEnginesPage(), makePropTablesPage(), makeParametricPage(eq), conductionPage, lumpedPage, finPage, ...MECH_PAGES, makeAboutPage());
