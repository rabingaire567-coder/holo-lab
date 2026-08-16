# HOLO·LAB — Interactive Electronics Modeling Suite

An Iron-Man-style **holographic 3D modeling environment** for electronics. Command the system in plain English to generate 3D holograms of electronic assemblies, inspect every component, see how it works, and simulate the impact of removing parts — all in a professional HUD interface.

Plus a full **Engineering Creator Lab**: design real devices on a schematic workbench from a 45-part electronics + mechanical library, wire the pins, and run a physics-based simulator that tells you if your build works — and why not.

![theme](https://img.shields.io/badge/theme-hologram-00e5ff) ![stack](https://img.shields.io/badge/stack-Three.js-blue) ![sim](https://img.shields.io/badge/sim-circuit+mech-3dff88) ![status](https://img.shields.io/badge/status-live-green)

---

## ✨ Features

| Feature | Description |
|---|---|
| 🧊 **Holographic 3D viewer** | Wireframe-glow assembly rendered with Three.js — orbit, zoom, click any part |
| 🎛 **Command console** | Type plain-English commands and the AI-style parser builds/analyzes models |
| 📦 **Component registry** | 12 electronics parts with *function*, *mechanism*, and *removal impact* for each |
| ⚠️ **Impact engine** | Remove a part → dependent components degrade (NO POWER, BURNED OUT, FLICKER…) |
| 🧪 **Dry-run simulation** | `what if i remove <part>` previews the cascade before you apply it |
| ✧ **Engineering Creator Lab** | Schematic workbench: place components, wire pins, run a real circuit + mechanical simulator |
| 🧰 **45-asset library** | 25 electronics (LED, MCU, servo, transformer…) + 20 mechanical (gears, shafts, belts…) with SVG icons and pins |
| ⚙ **Circuit simulator** | Detects shorts, reversed polarity, missing current limiters, open switches — verdicts per component |
| 🔩 **Mechanical simulator** | Gear mesh + ratios, belt/pulley, shaft/bearing, spring force, bolt torque and more |
| 🏗 **Expandable** | Data-driven `MODELS` registry — add robotics / housing / mechanical domains without touching the 3D engine |

## 🔌 Quick start

```bash
# 1. clone (or copy this folder)
git clone https://github.com/<your-user>/<your-repo>.git

# 2. serve locally (any static server works)
python -m http.server 8080
# or:  npx serve .
# or:  open index.html directly
```

Then open `http://localhost:8080`.

## 🚀 Launch from GitHub Pages

The app is 100% static (no build step) — it runs directly on GitHub Pages.

1. Create a repo and push this folder:
   ```bash
   git init
   git add .
   git commit -m "HOLO·LAB interactive modeling suite"
   git branch -M main
   git remote add origin https://github.com/<your-user>/<your-repo>.git
   git push -u origin main
   ```
2. On GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: `main` / `/ (root)`** → Save.
3. Your live app is at `https://<your-user>.github.io/<your-repo>/`

> Three.js is loaded from CDN (`unpkg`), so no assets need to be uploaded.

## 🎮 Commands

```
create electronics model      build the 3D hologram assembly
remove <part>                 remove a part & analyze impact
add / restore <part>          re-integrate a part
what if i remove <part>       dry-run impact simulation
inspect / explain <part>      learn how that part works
show parts                    list the component registry
reset model                   restore all components
creator / workbench           open the Engineering Creator Lab
simulate / does it work       run the workbench simulator
load example                  load a working example circuit
roadmap / expand              future model domains
help                          show command reference
```

**Parts:** battery · switch · resistor · capacitor · diode · transistor · led · ic · mcu · transformer · speaker · pcb

### Example session

```
YOU: create electronics model
SYS: Holographic model generated: ELECTRONIC CIRCUIT CORE
    12-component power & control board with LED output

YOU: what if i remove resistor
SYS: SIMULATING REMOVAL OF: CURRENT-LIMITING RESISTOR
     OVER-CURRENT — nothing limits current into the LED…
     > LED [BURNED OUT]
     > Capacitor [OVER-STRESSED]

YOU: remove resistor          → the LED turns red (degraded) and the part vanishes from the hologram
YOU: add resistor             → everything returns to nominal
```

## 🧬 How the impact engine works

Each part defines `affected: [{ part, mode }]` (see `js/parts.js`). The engine computes failure states from scratch on every change, so cascades are always consistent:

- `remove battery` → every downstream part goes `NO POWER`
- `remove resistor` → `LED → BURNED OUT`, `capacitor → OVER-STRESSED`
- `remove capacitor` → `LED → UNSTABLE`, `IC → NOISY`
- `remove transistor` → `LED → NO CONTROL SIGNAL` (stuck off)

`js/models.js` visualizes it: removed parts **vanish**, degraded parts **glow amber**, active parts **glow cyan**.

## ⚙ Engineering Creator Lab

Click **CREATOR LAB** in the toolbar (or type `creator`), or deep-link straight into it with `#creator` on the URL.

1. **Pick an asset** from the right-panel library — switch between ⚡ ELECTRONICS and ⚙ MECHANICAL tabs.
2. **PLACE** — select a tool, then click the grid. Electronics carry labeled pins (`+`, `-`, `A`, `K`…).
3. **WIRE** — click pin A then pin B to connect (open circuits fail to simulate).
4. **SIMULATE** — every component gets a verdict (OK / WARN / FAIL) and the device gets an overall verdict:
   - ⚡ electronics: shorts, reversed polarity, missing current limiters (LED burn-out!), open switches, unpowered ICs
   - ⚙ mechanical: gear mesh distance + ratio, belt wrap, shaft-in-bearing alignment, spring force, bolt-on-chassis
5. **EXAMPLE** — cycles battery→resistor→LED (working), the no-resistor burn-out (broken), a motor, and a gear/belt mechanical assembly.

Tools: `PLACE · WIRE · MOVE · ROTATE · DELETE` — double-click a switch to open/close it. `ESC` cancels a wire or selection.

### Simulator architecture (`js/simulator.js`)

- Union-find builds electrical **nets** from wires; open switches and unpowered paths break continuity
- Per-component **pin polarity** — power/ground are resolved through the rest of the circuit, so a powered loop can't mark both pins as both
- Current-limiting detection (`pathHasLimiter`) finds a resistor/potentiometer/LDR between the battery and each load
- Mechanical validators check geometry (`pinWorld` in cell units), e.g. gear centers within mesh distance → reports ratio and speed/torque multiplier

## 🏗 Expanding to new model domains

The system is built to grow — new "model types" (like an Iron Man-style suit, housing, or robot) are just data.

**1. Register the domain** — add a key to `MODELS` in `js/parts.js`:

```js
export const MODELS = {
  electronics: { /* existing */ },
  robotics: {
    id: 'robotics',
    name: 'ROBOTIC ARM ASSEMBLY',
    tagline: '4-joint actuator arm with gripper',
    parts: [
      {
        id: 'servo1',
        name: 'Shoulder Servo',
        category: 'ACTUATOR',
        description: '...',
        howItWorks: '...',
        impactMessage: '...',
        affected: [{ part: 'gripper', mode: 'no-power' }],
        position: [0, 1.5, 0]
      }
      // ...more parts
    ]
  }
};
```

**2. Build the 3D geometry** — add a builder in `js/models.js`:

```js
const BUILDERS = {
  // ...existing
  servo1: buildServo,      // any function returning a THREE.Group
};
function buildServo() { /* cylinder + shaft hologram */ }
```

**3. Wire the command** — `app.js` already routes `create <domain> model` once you point `modelId` at the new key (the `modelId` variable at the top of `js/app.js`).

## 📁 Project structure

```
holo-lab/
├── index.html        # HUD layout + Three.js importmap + toolbar
├── css/
│   └── style.css     # holographic HUD theme + creator-lab styles
└── js/
    ├── app.js        # scene, commands, console, panel, raycast, mode switcher
    ├── models.js     # 3D geometry builders + state colors
    ├── parts.js      # component registry + impact engine
    ├── assets.js     # 45-part creator-lab asset library (icons, pins, info)
    ├── simulator.js  # circuit + mechanical simulator engine
    └── workbench.js  # SVG creator-lab workbench (place/wire/move/rotate/delete)
```

## 🛠 Tech

- [Three.js r160](https://threejs.org) — WebGL 3D rendering
- Vanilla JS (ES modules) — no build step
- SVG + CSS — hologram-styled creator workbench
- Orbitron / Share Tech Mono — sci-fi type

## 🧪 Testing

Logic is verifiable headlessly:

```bash
node --check js/app.js && node --check js/models.js && node --check js/parts.js
node --check js/assets.js && node --check js/simulator.js && node --check js/workbench.js
```

The simulator is importable in Node (`import { simulate } from './js/simulator.js'`) — feed it `{id, type, x, y, rot, extra}` components and `{a, b}` wires to verify shorts, polarity, and gear-mesh logic headlessly.
