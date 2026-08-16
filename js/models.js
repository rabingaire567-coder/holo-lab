/* ============================================================
   HOLO·LAB — 3D Hologram Model Builders (Three.js)
   ------------------------------------------------------------
   Builds each electronic component as a glowing holographic
   wireframe/solid hybrid group, positioned on the PCB.
   ============================================================ */
import * as THREE from 'three';

export const HOLO_COLOR = 0x00e5ff;
export const ALERT_COLOR = 0xff3355;

const solidMat = new THREE.MeshBasicMaterial({
  color: HOLO_COLOR, transparent: true, opacity: 0.3, depthWrite: false
});
const wireMat = new THREE.MeshBasicMaterial({
  color: HOLO_COLOR, wireframe: true, transparent: true,
  opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending
});
const traceMat = new THREE.LineBasicMaterial({ color: HOLO_COLOR, transparent: true, opacity: 0.35 });

export function makeAlertMaterial() {
  return new THREE.MeshBasicMaterial({
    color: ALERT_COLOR, transparent: true, opacity: 0.28, depthWrite: false
  });
}
export function makeAlertWire() {
  return new THREE.MeshBasicMaterial({
    color: ALERT_COLOR, wireframe: true, transparent: true,
    opacity: 0.65, depthWrite: false, blending: THREE.AdditiveBlending
  });
}

function addMesh(group, geo, x, y, z, rot = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, solidMat);
  m.position.set(x, y, z); m.rotation.set(...rot);
  group.add(m);
  const w = new THREE.Mesh(geo, wireMat);
  w.position.copy(m.position); w.rotation.copy(m.rotation);
  group.add(w);
}

function addPins(group, count, startX, spacing, y, z, len = 0.7, size = 0.07) {
  const pin = new THREE.BoxGeometry(size, len, size);
  for (let i = 0; i < count; i++) {
    const x = startX + i * spacing;
    addMesh(group, pin, x, y + len / 2, z, [0, 0, 0]);
  }
}

/* ---------- Individual component builders ----------
   Each returns a THREE.Group, origin sitting on the PCB top.
   `def` carries { id, position } so app.js can place it.      */

function buildPCB() {
  const g = new THREE.Group();
  const body = new THREE.BoxGeometry(18, 0.5, 12);
  const m = new THREE.Mesh(body, new THREE.MeshBasicMaterial({ color: 0x0a3a4d, transparent: true, opacity: 0.35, depthWrite: false }));
  const w = new THREE.Mesh(body, wireMat);
  g.add(m); g.add(w);
  // corner mounting holes
  const hole = new THREE.CylinderGeometry(0.35, 0.35, 0.6, 16);
  const corners = [[-8.3, -5.3], [8.3, -5.3], [-8.3, 5.3], [8.3, 5.3]];
  for (const [x, z] of corners) addMesh(g, hole, x, 0.25, z);
  return g;
}

function buildBattery() {
  const g = new THREE.Group();
  addMesh(g, new THREE.CylinderGeometry(1.1, 1.1, 2.1, 24), 0, 1.05, 0);
  addMesh(g, new THREE.CylinderGeometry(0.35, 0.35, 0.5, 16), 0, 2.3, 0, [Math.PI / 2, 0, 0]);
  addMesh(g, new THREE.TorusGeometry(1.15, 0.06, 8, 32), 0, 2.15, 0, [Math.PI / 2, 0, 0]);
  addMesh(g, new THREE.CylinderGeometry(1.08, 1.08, 0.12, 24), 0, 0.08, 0);
  return g;
}

function buildSwitch() {
  const g = new THREE.Group();
  addMesh(g, new THREE.BoxGeometry(1.5, 0.35, 1.0), 0, 0.18, 0);
  addMesh(g, new THREE.BoxGeometry(0.14, 1.1, 0.5), 0, 0.9, 0);
  addMesh(g, new THREE.BoxGeometry(0.9, 0.12, 0.14), 0.55, 1.5, 0.12);
  return g;
}

function buildResistor() {
  const g = new THREE.Group();
  addMesh(g, new THREE.BoxGeometry(1.8, 0.7, 0.7), 0, 0.45, 0);
  addMesh(g, new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8), -1.4, 0.35, 0);
  addMesh(g, new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8), 1.4, 0.35, 0);
  for (let i = 0; i < 3; i++) {
    addMesh(g, new THREE.BoxGeometry(1.82, 0.08, 0.74), 0, 0.5 + i * 0.12, 0);
  }
  return g;
}

function buildCapacitor() {
  const g = new THREE.Group();
  addMesh(g, new THREE.CylinderGeometry(0.7, 0.7, 1.2, 20), 0, 0.6, 0);
  addMesh(g, new THREE.CylinderGeometry(0.72, 0.72, 0.1, 20), 0, 1.25, 0);
  addMesh(g, new THREE.CylinderGeometry(0.06, 0.06, 0.8, 8), -0.3, 0.25, 0);
  addMesh(g, new THREE.CylinderGeometry(0.06, 0.06, 0.8, 8), 0.3, 0.25, 0);
  return g;
}

function buildDiode() {
  const g = new THREE.Group();
  addMesh(g, new THREE.BoxGeometry(0.9, 0.5, 0.5), 0, 0.3, 0);
  addMesh(g, new THREE.CylinderGeometry(0.35, 0.35, 0.4, 12), 0.6, 0.3, 0, [0, 0, Math.PI / 2]);
  addMesh(g, new THREE.CylinderGeometry(0.06, 0.06, 1.0, 8), -0.8, 0.28, 0);
  addMesh(g, new THREE.CylinderGeometry(0.06, 0.06, 1.0, 8), 1.0, 0.28, 0);
  return g;
}

function buildTransistor() {
  const g = new THREE.Group();
  addMesh(g, new THREE.BoxGeometry(1.1, 0.55, 0.9), 0, 0.35, 0);
  const legs = [[-0.35, 0], [0, 0], [0.35, 0]];
  for (const [x, z] of legs) {
    addMesh(g, new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8), x, 0.2, z);
  }
  addMesh(g, new THREE.TorusGeometry(0.28, 0.07, 8, 16), 0, 0.78, 0, [Math.PI / 2, 0, 0]);
  return g;
}

function buildLED() {
  const g = new THREE.Group();
  const lens = new THREE.SphereGeometry(0.45, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const lensMat = new THREE.MeshBasicMaterial({ color: 0x3dff88, transparent: true, opacity: 0.45, depthWrite: false });
  const lensWire = new THREE.MeshBasicMaterial({ color: 0x3dff88, wireframe: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const l1 = new THREE.Mesh(lens, lensMat); l1.position.y = 1.05; g.add(l1);
  const l2 = new THREE.Mesh(lens, lensWire); l2.position.y = 1.05; g.add(l2);
  addMesh(g, new THREE.CylinderGeometry(0.35, 0.45, 0.5, 16), 0, 0.55, 0);
  addMesh(g, new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), -0.22, 0.22, 0);
  addMesh(g, new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), 0.22, 0.22, 0);
  return g;
}

function buildIC() {
  const g = new THREE.Group();
  addMesh(g, new THREE.BoxGeometry(2.6, 0.3, 1.5), 0, 0.2, 0);
  addMesh(g, new THREE.BoxGeometry(0.5, 0.08, 1.5), 0, 0.05, 0);
  addMesh(g, new THREE.TorusGeometry(0.22, 0.06, 8, 16), 0, 0.42, 0);
  addPins(g, 8, -0.9, 0.24, 0.1, 0.8);
  addPins(g, 8, -0.9, 0.24, 0.1, -0.8);
  return g;
}

function buildMCU() {
  const g = new THREE.Group();
  addMesh(g, new THREE.BoxGeometry(3.0, 0.35, 2.2), 0, 0.22, 0);
  addMesh(g, new THREE.BoxGeometry(0.6, 0.1, 2.2), 0, 0.06, 0);
  addPins(g, 12, -1.2, 0.22, 0.12, 1.1, 0.9, 0.05);
  addPins(g, 12, -1.2, 0.22, 0.12, -1.1, 0.9, 0.05);
  addMesh(g, new THREE.BoxGeometry(0.8, 0.5, 0.8), 0, 0.55, 0);
  return g;
}

function buildTransformer() {
  const g = new THREE.Group();
  addMesh(g, new THREE.BoxGeometry(1.6, 1.2, 1.6), 0, 0.75, 0);
  addMesh(g, new THREE.TorusGeometry(0.5, 0.18, 10, 20), 0, 0.95, 0, [Math.PI / 2, 0, 0]);
  addMesh(g, new THREE.TorusGeometry(0.5, 0.12, 10, 20), 0, 0.7, 0, [Math.PI / 2, 0, 0]);
  addMesh(g, new THREE.CylinderGeometry(0.07, 0.07, 1.4, 8), -0.6, 0.3, -0.6);
  addMesh(g, new THREE.CylinderGeometry(0.07, 0.07, 1.4, 8), 0.6, 0.3, -0.6);
  return g;
}

function buildSpeaker() {
  const g = new THREE.Group();
  addMesh(g, new THREE.CylinderGeometry(1.5, 1.5, 0.5, 28), 0, 0.3, 0);
  addMesh(g, new THREE.CylinderGeometry(1.05, 1.3, 0.7, 28), 0, 0.75, 0);
  addMesh(g, new THREE.CylinderGeometry(0.4, 0.4, 0.2, 16), 0, 1.05, 0);
  addMesh(g, new THREE.TorusGeometry(1.5, 0.08, 8, 32), 0, 0.56, 0, [Math.PI / 2, 0, 0]);
  return g;
}

const BUILDERS = {
  pcb: buildPCB,
  battery: buildBattery,
  switch: buildSwitch,
  resistor: buildResistor,
  capacitor: buildCapacitor,
  diode: buildDiode,
  transistor: buildTransistor,
  led: buildLED,
  ic: buildIC,
  mcu: buildMCU,
  transformer: buildTransformer,
  speaker: buildSpeaker
};

/* ---------- Label sprites (canvas-generated) ---------- */
function makeLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 96);
  ctx.font = 'bold 46px Orbitron, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,229,255,0.9)'; ctx.shadowBlur = 18;
  ctx.fillStyle = '#00e5ff';
  ctx.fillText(text.toUpperCase(), 256, 48);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(3.4, 0.64, 1);
  return spr;
}

const SHORT_LABELS = {
  battery: 'POWER CELL', switch: 'SWITCH', resistor: 'RESISTOR',
  capacitor: 'CAPACITOR', diode: 'DIODE', transistor: 'TRANSISTOR',
  led: 'LED', ic: 'OP-AMP IC', mcu: 'MCU', transformer: 'TRANSFORMER',
  speaker: 'SPEAKER', pcb: 'PCB CHASSIS'
};

/* ---------- Whole assembly ---------- */
export function buildAssembly(parts, tracePoints) {
  const group = new THREE.Group();
  const partGroups = {};

  for (const def of parts) {
    const builder = BUILDERS[def.id];
    if (!builder) continue;
    const pg = builder();
    pg.position.set(def.position[0], def.position[1], def.position[2]);
    pg.userData = { partId: def.id };
    const label = makeLabel(SHORT_LABELS[def.id] || def.name);
    label.position.y = def.structural ? -1 : 2.0;
    label.userData = { partId: def.id, isLabel: true };
    pg.add(label);
    group.add(pg);
    partGroups[def.id] = pg;
  }

  // circuit traces
  for (const [a, b] of tracePoints) {
    const ga = partGroups[a], gb = partGroups[b];
    if (!ga || !gb) continue;
    const p1 = ga.position.clone(); p1.y = 0.32;
    const p2 = gb.position.clone(); p2.y = 0.32;
    const mid = p1.clone().add(p2).multiplyScalar(0.5); mid.y = 0.32;
    const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(24));
    group.add(new THREE.Line(geo, traceMat));
  }

  return { group, partGroups };
}

export function setPartAlert(group, on) {
  group.traverse(o => {
    if (!o.isMesh) return;
    if (on) {
      if (o.material === solidMat) { o.material = makeAlertMaterial(); o.userData._swapped = true; }
      else if (o.material === wireMat) { o.material = makeAlertWire(); o.userData._swapped = true; }
    } else if (o.userData._swapped) {
      o.material = (o.material && o.material.wireframe) ? wireMat : solidMat;
      delete o.userData._swapped;
    }
  });
}

const tintMat = (c, wire) => new THREE.MeshBasicMaterial({
  color: c, transparent: true, opacity: wire ? 0.7 : 0.3, depthWrite: false,
  wireframe: wire, blending: wire ? THREE.AdditiveBlending : THREE.NormalBlending
});

export function setPartTint(group, color, on) {
  group.traverse(o => {
    if (!o.isMesh || !o.userData._swapped) return;
    o.material = on
      ? tintMat(color, o.material.wireframe)
      : (o.material.wireframe ? wireMat : solidMat);
  });
}

/* One-stop state sync for a part group.
   mode: 'active' | 'degraded' | 'removed'                              */
export function setPartState(group, mode) {
  hideGroup(group, mode === 'removed');
  if (mode === 'removed') return;
  setPartAlert(group, false);
  if (mode === 'degraded') {
    setPartAlert(group, true);
    setPartTint(group, 0xffb300, true);
  }
}

export function hideGroup(group, hidden) {
  group.visible = !hidden;
}
