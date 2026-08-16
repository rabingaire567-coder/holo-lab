# HOLO·LAB — Interactive Electronics Modeling Suite

An Iron-Man-style **holographic 3D modeling environment** for electronics. Command the system in plain English to generate 3D holograms of electronic assemblies, inspect every component, see how it works, and simulate the impact of removing parts — all in a professional HUD interface.

![theme](https://img.shields.io/badge/theme-hologram-00e5ff) ![stack](https://img.shields.io/badge/stack-Three.js-blue) ![status](https://img.shields.io/badge/status-live-green)

---

## ✨ Features

| Feature | Description |
|---|---|
| 🧊 **Holographic 3D viewer** | Wireframe-glow assembly rendered with Three.js — orbit, zoom, click any part |
| 🎛 **Command console** | Type plain-English commands and the AI-style parser builds/analyzes models |
| 📦 **Component registry** | 12 electronics parts with *function*, *mechanism*, and *removal impact* for each |
| ⚠️ **Impact engine** | Remove a part → dependent components degrade (NO POWER, BURNED OUT, FLICKER…) |
| 🧪 **Dry-run simulation** | `what if i remove <part>` previews the cascade before you apply it |
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
├── index.html        # HUD layout + Three.js importmap
├── css/
│   └── style.css     # holographic HUD theme
└── js/
    ├── app.js        # scene, commands, console, panel, raycast
    ├── models.js     # 3D geometry builders + state colors
    └── parts.js      # component registry + impact engine
```

## 🛠 Tech

- [Three.js r160](https://threejs.org) — WebGL 3D rendering
- Vanilla JS (ES modules) — no build step
- Orbitron / Share Tech Mono — sci-fi type

## 🧪 Testing

Logic is verifiable headlessly:

```bash
node --check js/app.js && node --check js/models.js && node --check js/parts.js
```
