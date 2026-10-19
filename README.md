# Mamba Engineering

An offline engineering workbench for Windows. It combines **ThermoStudio** (thermal-fluid modelling) and **MechWorkbench** (machine elements) on one shared platform:

- a unit-aware equation solver
- a drag-and-drop cycle canvas
- an animation layer
- step-by-step solutions
- a PDF report engine

The interface is available in English, Svenska and العربية (right-to-left).

**Download:** [latest release](https://github.com/heisenberg0066/mamba-engineering/releases/latest). The installer, portable exe and zip are all Windows x64.

> **The builds are not code-signed.** Windows SmartScreen may show "Windows protected your PC". Click **More info → Run anyway**. The app runs fully offline and needs no admin rights (the installer is per-user).

![System canvas — Rankine cycle](docs/screenshots/02-canvas-rankine.png)

## Phase 1 MVP: what's included

| Area | Modules |
|---|---|
| Thermodynamics | EES-style **equation editor** (units check, equation/unknown count, property functions, simultaneous blocks); **system canvas** (Rankine, reheat, regenerative, refrigeration, Brayton…) with animated flow and live T-s / P-h / P-v / h-s diagrams; **engine cycles** (Otto, Diesel, Dual) with an animated piston; **property tables** with step-by-step interpolation; **parametric table** and sweep plots |
| Heat transfer | Composite wall / pipe & sphere insulation (critical radius), lumped transient cooling, fins |
| Machine elements | Bolted joint, shaft fatigue, rolling-bearing life (ISO 281), spur gears (Lewis), compression spring, ISO 286 fits, Mohr's circle |

Every module has:
- an interactive animated visual
- a step-by-step solution in **Education mode**, or results first in **Engineer mode**
- a **PDF report**

Projects save as `.mep` files. Properties come from **CoolProp 6.6** (MIT, WebAssembly build):
- water from IAPWS-95 or IAPWS-IF97
- the main refrigerants
- air

The refrigerant reference state is selectable: IIR, or ASHRAE to match textbook R-134a tables.

## Screenshots
| | |
|---|---|
| ![](docs/screenshots/02b-canvas-diagrams.png) Live property diagrams | ![](docs/screenshots/03-canvas-refrigeration.png) Refrigeration cycle |
| ![](docs/screenshots/04-equation-editor.png) Equation editor + textbook-style steps | ![](docs/screenshots/05-otto-engine.png) Otto cycle with animated piston |
| ![](docs/screenshots/06-property-tables.png) Property tables + interpolation | ![](docs/screenshots/07-parametric.png) Parametric table |
| ![](docs/screenshots/08-composite-wall.png) Composite wall | ![](docs/screenshots/08b-pipe-insulation.png) Wire insulation / critical radius |
| ![](docs/screenshots/09-lumped-cooling.png) Lumped cooling | ![](docs/screenshots/10-fin.png) Fin |
| ![](docs/screenshots/13-bolted-joint.png) Bolted joint | ![](docs/screenshots/14-shaft-fatigue.png) Shaft fatigue |
| ![](docs/screenshots/15-bearing.png) Bearing life | ![](docs/screenshots/16-spur-gears.png) Spur gears |
| ![](docs/screenshots/17-spring.png) Spring | ![](docs/screenshots/12-iso286-fits.png) ISO 286 fits |
| ![](docs/screenshots/11-mohr.png) Mohr's circle | ![](docs/screenshots/19-arabic-rtl.png) Arabic, right-to-left |

## Validation
`npm test` runs **77 checks**, and **all 77 pass**. Each check names its reference:
- published textbook worked examples: Çengel & Boles *Thermodynamics*; Çengel & Ghajar *Heat and Mass Transfer*; Shigley's *Mechanical Engineering Design*
- standard tables: ISO 286, ISO 898-1, ISO 281
- independent analytic or finite-difference solutions

Highlights:
- **Ideal Rankine (3 MPa / 350 °C / 75 kPa):** η = 26.0 %.
- **Reheat Rankine:** η = 45.0 %, x = 0.896.
- **Regenerative Rankine:** y = 0.227, η = 46.3 %.
- **R-134a refrigerator:** COP 3.97, Q̇L 7.18 kW.
- **Brayton:** η = 42.6 %.
- **Otto:** T_max 1577 K, η 52.5 %, MEP 576 kPa (book: 1575 K, 52.3 %, 574 kPa).
- **Heat transfer:**
  - wire insulation: r_cr = 12.5 mm
  - thermocouple: ≈ 10 s
  - fin: matches the finite-difference solution
- **Machine elements:**
  - Mohr: 104 / −24 / 64 MPa
  - Ø25 H7/g6: 41/7 µm
  - Shigley shaft: Se ≈ 204, n_y 4.58
  - Shigley Lewis gear: 6.94 hp

The full table is in [docs/VALIDATION.md](docs/VALIDATION.md). The packaged app also has a built-in self-test (every page, PDF export, project round-trip, languages). CI runs it on `windows-latest`, both on the unpacked build and after a silent install.

## Build from source
```bash
npm ci
npm test                 # validation suite
npm start                # run the app
npm run dist:win         # Windows installer / portable / zip (on Windows or CI)
MAMBA_SELFTEST=out npx electron .   # self-test + screenshots into ./out
```
Layout:
- `src/core` — units, parser, solver, properties, tables, step builder
- `src/thermo` — flowsheet compiler, IC engines
- `src/heat` and `src/mech` — calculation modules with traces
- `src/renderer` — UI

## Disclaimer
Results are for education and preliminary design. Check them with a qualified engineer before relying on them. ISO 286 deviations are computed from the standard's formulas; verify critical fits against a licensed copy of the standard.

Licence: MIT (see `LICENSE`). Third-party components are listed in `THIRD_PARTY_NOTICES.md`.
