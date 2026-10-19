## Mamba Engineering 0.1.0 — Phase 1 MVP

An offline Windows workbench for thermodynamics, heat transfer and machine elements. It has a unit-aware equation solver, drag-and-drop cycles, animated visuals, step-by-step solutions and PDF reports. English, Svenska and العربية (right-to-left) are included.

### Downloads (Windows 10/11, 64-bit)
| File | What it is |
|---|---|
| `MambaEngineering-Setup-0.1.0-x64.exe` | Installer (per-user, no admin rights needed). Creates Start-menu and desktop shortcuts and opens `.mep` project files. |
| `MambaEngineering-Portable-0.1.0-x64.exe` | Single-file portable app. Nothing is installed. |
| `MambaEngineering-0.1.0-win-x64.zip` | Unzip anywhere and run `Mamba Engineering.exe`. |

> **Windows SmartScreen:** these builds are **not code-signed**, so Windows may say "Windows protected your PC". Click **More info → Run anyway**. Some browsers may also warn about the download; choose **Keep**.

### What's inside
**Thermodynamics (ThermoStudio)**
- **Equation editor (EES-style):**
  - write equations in any order, with units in `[kPa]`
  - live equation/unknown count and a units check
  - property functions such as `enthalpy(Water, P=…, T=…)`
  - simultaneous blocks solved by Newton–Raphson
  - step-by-step solution, with optional textbook-table interpolation
  - property diagram built from the states in the model
- **System canvas:**
  - drag-and-drop pump, compressor, turbine, boiler/heater, condenser, evaporator, cooler, valve, splitter, open feed-water heater and regenerator
  - connect streams port to port
  - animated flow particles (colour shows temperature; hollow means vapour)
  - live T-s / P-h / P-v / h-s diagrams whose state points move when inputs change
  - parametric sweep with plot and replay
  - generated equations can be opened in the equation editor
  - templates: Rankine (simple, reheat, regenerative), vapour-compression refrigeration, Brayton (simple, regenerative)
- **Engine cycles:** Otto, Diesel and Dual, with an animated piston and crank synchronised with the P-v and T-s diagrams.
- **Property tables:** saturated (by T or by P), superheated and compressed liquid. Linear interpolation is shown step by step next to the exact equation-of-state value. CSV export.
- **Parametric table:** vary any constant of the equation model, then tabulate and plot.

**Heat transfer**
- Composite plane walls, cylinders (pipe/wire insulation) and spheres, with a live temperature colour gradient, heat-flow particles and the critical radius of insulation.
- Lumped-capacitance transient heating/cooling (Biot check, animated body colour, T(t) curve).
- Fins: pin or rectangular; infinite, adiabatic, convective or corrected tip.

**Machine elements (MechWorkbench)**
- Bolted joint (stiffness, preload, torque, safety factors, animated joint diagram)
- Shaft fatigue (Marin factors, DE-Goodman/Gerber/ASME/Soderberg, yield)
- Rolling-bearing life (ISO 281 L10, a1)
- Spur gears (Lewis, Barth Kv, meshing involute gears)
- Helical compression spring
- ISO 286 limits and fits
- Mohr's circle

**Every module** has an interactive animated visual, a step-by-step solution (Education mode) or results first (Engineer mode), and a **PDF report**. Projects are saved as `.mep` files.

### Validation
`npm test` runs 77 checks against published textbook examples (Çengel & Boles; Çengel & Ghajar; Shigley), standard tables (ISO 286, ISO 898-1, ISO 281) and independent analytic solutions. All 77 pass. See `docs/VALIDATION.md`. The packaged app also runs a built-in self-test in CI on `windows-latest`.

### Known limitations
- Notebooks and scripting are not in this release.
- US units are only partly supported, and the diagrams are SI.
- EES files cannot be imported.
- Gears use Lewis + Barth only, not ISO 6336.
- ISO 286 deviations are computed from the standard's formulas, not certified tables.
- There is no psychrometrics, combustion or 2-D conduction yet.
- Some UI text is still English in SV/AR.
