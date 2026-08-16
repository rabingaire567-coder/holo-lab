/* ============================================================
   HOLO·LAB — 3D DESIGN STUDIO (Blender-style editor)
   ------------------------------------------------------------
   Place library assets in a real 3D viewport, transform them
   (move / rotate / scale) with grid snapping, wire component
   pins in 3D, customize appearance (color / opacity / label),
   and run the same circuit + mechanical simulator on the build.
   ============================================================ */
import * as THREE from 'three';
import { getAsset } from './assets.js';
import { simulate } from './simulator.js';

const STATUS_COLOR = { ok: 0x3dff88, warn: 0xffb300, fail: 0xff3355 };
const PIN_COLOR = 0x00e5ff;
const GRID = 40; // world units, matches GridHelper 40x40

/* which 3D shape each asset uses */
const SHAPE = {
  battery: 'cylX', resistor: 'box', capacitor: 'cyl', diode: 'dome', transistor: 'ic',
  led: 'led', ic: 'ic', mcu: 'ic', transformer: 'transformer', speaker: 'speaker',
  switch: 'switch', fuse: 'box', inductor: 'coil', relay: 'box', button: 'switch',
  seg7: 'seg', potentiometer: 'box', ldr: 'box', crystal: 'box', regulator: 'ic',
  antenna: 'antenna', servo: 'servo', display: 'seg',
  gear: 'gear', gearLarge: 'gear', shaft: 'cylX', bearing: 'cyl', spring: 'spring',
  pulley: 'pulley', pulleyLarge: 'pulley', belt: 'belt', bolt: 'bolt', chassis: 'box',
  piston: 'piston', linkage: 'link', hinge: 'hinge', coupling: 'coupling', cam: 'cam',
  gearbox: 'box', washer: 'disc', joint: 'hinge', motorMount: 'box', leadScrew: 'screw'
};

const SHAPE_OFFSET = 0.35; // pin height above the floor (in shape units)

function fillMat(color, opacity) {
  return new THREE.MeshPhongMaterial({
    color, transparent: true, opacity: opacity == null ? 0.5 : opacity,
    side: THREE.DoubleSide, shininess: 50,
    emissive: new THREE.Color(color).multiplyScalar(0.22)
  });
}
function edgeMat(color) {
  return new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
}
function edges(geo, color) {
  return new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat(color));
}

function box(w, h, d, mat, ec, y = 0) {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, h / 2 + y, 0);
  g.add(new THREE.Mesh(geo, mat));
  g.add(edges(geo, ec));
  return g;
}
function cyl(r, h, mat, ec, seg = 24, y = 0) {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(r, r, h, seg);
  geo.translate(0, h / 2 + y, 0);
  g.add(new THREE.Mesh(geo, mat));
  g.add(edges(geo, ec));
  return g;
}
function cylX(r, len, mat, ec, seg = 24) {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(r, r, len, seg);
  geo.rotateZ(Math.PI / 2);
  g.add(new THREE.Mesh(geo, mat));
  g.add(edges(geo, ec));
  return g;
}
function disc(r, h, mat, ec) { return cyl(r, h, mat, ec, 28); }

/* ---------- per-shape builders (bottom centered at origin) ---------- */
const SHAPES = {
  box: (a, mat, ec) => box(Math.max(a.w, 0.8), 0.45, Math.max(a.h, 0.8), mat, ec),
  cyl: () => cyl(0.4, 0.85, undefined, undefined),
  cylX: () => cylX(0.42, 1.5, undefined, undefined),
  dome: () => { const g = new THREE.Group(); g.add(cyl(0.32, 0.5, undefined, undefined)); return g; },
  led: () => {
    const g = new THREE.Group();
    g.add(cyl(0.3, 0.45));
    const cap = new THREE.SphereGeometry(0.3, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.translate(0, 0.45, 0);
    g.add(new THREE.Mesh(cap, fillMat(0xff5566, 0.75)));
    g.add(edges(cap, 0x00e5ff));
    return g;
  },
  ic: () => {
    const g = box(1.2, 0.35, 1.2);
    for (let i = -2; i <= 2; i++) {
      g.add(cyl(0.03, 0.35, fillMat(0x8899aa, 1), edgeMat(0x8899aa), 6, 0));
      g.children[g.children.length - 1].position.x = i * 0.35;
      g.children[g.children.length - 1].position.z = 0.55;
    }
    return g;
  },
  transformer: () => {
    const g = box(1.6, 0.5, 1.2);
    const c = cyl(0.3, 0.9);
    c.position.x = -0.5;
    g.add(c);
    const c2 = cyl(0.3, 0.9);
    c2.position.x = 0.5;
    g.add(c2);
    return g;
  },
  speaker: () => {
    const g = cyl(0.75, 0.4);
    const cone = new THREE.ConeGeometry(0.7, 0.35, 24);
    cone.translate(0, 0.4, 0);
    g.add(new THREE.Mesh(cone, fillMat(0x00e5ff, 0.35)));
    g.add(edges(cone, 0x00e5ff));
    return g;
  },
  switch: () => {
    const g = box(1.1, 0.35, 0.7);
    const lever = box(0.08, 0.5, 0.25, fillMat(0xffffff, 0.8), 0xbfeaff, 0.35);
    lever.position.z = -0.12;
    g.add(lever);
    return g;
  },
  seg: () => {
    const g = box(1.4, 0.45, 1.0);
    const seg = box(0.06, 0.06, 0.02, fillMat(0xff3355, 0.9), 0xff3355, 0.23);
    const s = [[-0.4, 0.2], [0, 0.2], [0.4, 0.2], [-0.4, 0], [0.4, 0], [-0.4, -0.2], [0, -0.2], [0.4, -0.2]];
    for (const [x, z] of s) { const p = seg.clone(); p.position.set(x, 0, z); g.add(p); }
    return g;
  },
  antenna: () => {
    const g = box(0.25, 0.2, 0.25);
    const rod = cyl(0.02, 1.6);
    rod.position.y = 0.8;
    g.add(rod);
    const tip = new THREE.SphereGeometry(0.06, 8, 8);
    tip.translate(0, 1.7, 0);
    g.add(new THREE.Mesh(tip, fillMat(0xff3355, 1)));
    return g;
  },
  servo: () => {
    const g = box(1.2, 0.5, 1.2);
    const sh = cylX(0.14, 0.6);
    sh.position.y = 0.75;
    sh.rotateZ(Math.PI / 2);
    g.add(sh);
    return g;
  },
  coil: () => {
    const g = new THREE.Group();
    for (let i = -3; i <= 3; i++) {
      const r = cyl(0.42, 0.16);
      r.position.x = i * 0.2;
      r.position.y = 0.42;
      g.add(r);
    }
    return g;
  },
  gear: (a, mat, ec) => {
    const g = disc(0.55, 0.2, mat, ec);
    const t = 12;
    const tooth = box(0.16, 0.2, 0.55);
    for (let i = 0; i < t; i++) {
      const x = Math.cos(i / t * Math.PI * 2) * 0.58;
      const z = Math.sin(i / t * Math.PI * 2) * 0.58;
      const tg = tooth.clone();
      tg.position.set(x, 0, z);
      tg.rotation.y = -i / t * Math.PI * 2;
      g.add(tg);
    }
    const hole = new THREE.CylinderGeometry(0.09, 0.09, 0.3, 12);
    hole.translate(0, 0.1, 0);
    g.add(new THREE.Mesh(hole, fillMat(0x04070d, 1)));
    return g;
  },
  spring: (a, mat, ec) => {
    const g = new THREE.Group();
    const seg = 24;
    for (let i = 0; i < seg; i++) {
      const t = i / seg;
      const sp = new THREE.SphereGeometry(0.07, 6, 6);
      sp.translate(Math.cos(t * Math.PI * 6) * 0.35, t * 1.1, Math.sin(t * Math.PI * 6) * 0.35);
      g.add(new THREE.Mesh(sp, mat));
    }
    return g;
  },
  pulley: (a, mat, ec) => {
    const g = disc(0.6, 0.25, mat, ec);
    const groove = cyl(0.28, 0.3, fillMat(0x9ad7ea, 0.9), edgeMat(0x9ad7ea), 20);
    g.add(groove);
    return g;
  },
  belt: (a, mat, ec) => {
    const g = new THREE.Group();
    const ring = new THREE.TorusGeometry(0.65, 0.09, 10, 28);
    g.add(new THREE.Mesh(ring, mat));
    g.add(edges(ring, ec));
    return g;
  },
  bolt: () => {
    const g = box(0.55, 0.3, 0.55);
    const sh = cylX(0.14, 1.0);
    sh.position.y = -0.15;
    g.add(sh);
    return g;
  },
  piston: () => {
    const g = cyl(0.5, 0.7);
    const rod = cyl(0.14, 1.0);
    rod.position.x = 1.0;
    rod.rotation.z = Math.PI / 2;
    g.add(rod);
    return g;
  },
  link: () => {
    const g = box(1.9, 0.14, 0.5);
    const h1 = cyl(0.09, 0.3, fillMat(0x04070d, 1), edgeMat(0x9ad7ea), 12, 0.1);
    h1.position.x = -0.8;
    g.add(h1);
    const h2 = h1.clone();
    h2.position.x = 0.8;
    g.add(h2);
    return g;
  },
  hinge: () => {
    const g = box(1.5, 0.2, 0.4);
    const pin = cylX(0.12, 1.7);
    pin.position.y = 0.35;
    g.add(pin);
    return g;
  },
  coupling: () => {
    const g = cyl(0.5, 0.6);
    const l = cylX(0.2, 0.7);
    l.position.x = 0.85;
    l.rotation.z = Math.PI / 2;
    g.add(l);
    const r = l.clone();
    r.position.x = -0.85;
    g.add(r);
    return g;
  },
  cam: () => {
    const g = disc(0.5, 0.25);
    const lobe = cylX(0.22, 0.7);
    lobe.position.y = 0.15;
    lobe.rotateZ(Math.PI / 2);
    g.add(lobe);
    return g;
  },
  disc: () => disc(0.6, 0.12),
  screw: () => {
    const g = cyl(0.3, 1.3);
    const seg = 20;
    for (let i = 0; i < seg; i++) {
      const t = i / seg;
      const sp = new THREE.SphereGeometry(0.06, 6, 6);
      sp.translate(Math.cos(t * Math.PI * 10) * 0.3, t * 1.3, Math.sin(t * Math.PI * 10) * 0.3);
      g.add(new THREE.Mesh(sp, fillMat(0xcccccc, 1)));
    }
    return g;
  }
};

function buildShape(type, a, color, opacity) {
  const mat = fillMat(color, opacity);
  const ec = new THREE.Color(color).multiplyScalar(1.25);
  let shape = (SHAPES[SHAPE[type]] || SHAPES.box)(a, mat, ec);
  return shape;
}

/* ---------- text / status sprites ---------- */
function makeTextSprite(text, color) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 96;
  const ctx = cv.getContext('2d');
  ctx.font = '700 30px Orbitron, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = color; ctx.shadowBlur = 14;
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 48);
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(4, 0.75, 1);
  return sp;
}
function makeStatusSprite(color) {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.beginPath(); ctx.arc(32, 32, 26, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
  ctx.shadowColor = color; ctx.shadowBlur = 12;
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(0.4, 0.4, 1);
  return sp;
}

export class DesignStudio {
  constructor({ scene, canvas, camera, grid }) {
    this.scene = scene;
    this.canvas = canvas;
    this.camera = camera;
    this.grid = grid;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.objects = [];
    this.wires = [];
    this.tool = 'select';
    this.assetId = null;
    this.selected = null;
    this.pendingWire = null;
    this.drag = null;
    this.ghost = null;
    this.snap = true;
    this.snapSize = 1;
    this.counter = 1;
    this.active = false;
    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.selectionBox = null;
    this.callbacks = {};
    this._bind();
  }

  /* ============ lifecycle ============ */
  enter() { this.active = true; this.group.visible = true; if (this.selectionBox) this.selectionBox.visible = true; }
  exit() { this.active = false; this.group.visible = false; if (this.selectionBox) this.selectionBox.visible = false; }

  /* ============ event binding ============ */
  _bind() {
    this.canvas.addEventListener('pointerdown', e => this._down(e));
    this.canvas.addEventListener('pointermove', e => this._move(e));
    this.canvas.addEventListener('pointerup', e => this._up(e));
  }

  _ndc(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
  }
  _planePt(e) {
    this.raycaster.setFromCamera(this._ndc(e), this.camera);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, out);
  }
  _pick(e) {
    this.raycaster.setFromCamera(this._ndc(e), this.camera);
    const hits = this.raycaster.intersectObject(this.group, true);
    for (const h of hits) {
      if (h.object.userData && h.object.userData.pinId) return { kind: 'pin', obj: this.objects.find(o => o.id === h.object.userData.compId), pinId: h.object.userData.pinId };
      const comp = this._walkComp(h.object);
      if (comp) return { kind: 'obj', obj: comp };
    }
    return null;
  }
  _walkComp(o) {
    let cur = o;
    while (cur) {
      if (cur.userData && cur.userData.compId) return this.objects.find(x => x.id === cur.userData.compId);
      cur = cur.parent;
    }
    return null;
  }

  _snapV(v) { return this.snap ? Math.round(v / this.snapSize) * this.snapSize : v; }

  _down(e) {
    if (!this.active || e.button !== 0) return;
    const hit = this._pick(e);

    if (this.tool === 'wire') {
      if (hit && hit.kind === 'pin') this._pinClick(hit.obj, hit.pinId);
      return;
    }
    if (this.tool === 'delete') {
      if (hit && hit.kind === 'obj') { this.removeObject(hit.obj.id); return; }
      return;
    }
    if (this.tool === 'select') {
      if (hit && hit.kind === 'obj') this.select(hit.obj.id); else this.select(null);
      return;
    }
    if (this.tool === 'place') {
      const pt = this._planePt(e);
      if (pt) this.place(Math.round(pt.x), Math.round(pt.z));
      return;
    }
    if (this.tool === 'move' || this.tool === 'rotate' || this.tool === 'scale') {
      if (!hit || hit.kind !== 'obj') return;
      this.select(hit.obj.id);
      const pt = this._planePt(e) || { x: 0, z: 0 };
      const o = hit.obj;
      this.drag = {
        mode: this.tool, obj: o,
        offX: pt.x - o.pos.x, offZ: pt.z - o.pos.z,
        baseY: o.rot.y, baseScale: o.scale,
        baseAng: Math.atan2(pt.x - o.pos.x, pt.z - o.pos.z),
        baseDist: Math.hypot(pt.x - o.pos.x, pt.z - o.pos.z)
      };
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or released pointer */ }
    }
  }

  _move(e) {
    if (!this.active) return;
    if (this.drag) {
      const pt = this._planePt(e);
      if (!pt) return;
      const d = this.drag;
      if (d.mode === 'move') {
        let nx = this._snapV(pt.x - d.offX);
        let nz = this._snapV(pt.z - d.offZ);
        nx = Math.max(-GRID / 2, Math.min(GRID / 2, nx));
        nz = Math.max(-GRID / 2, Math.min(GRID / 2, nz));
        d.obj.pos.x = nx; d.obj.pos.z = nz;
      } else if (d.mode === 'rotate') {
        const ang = Math.atan2(pt.x - d.obj.pos.x, pt.z - d.obj.pos.z);
        let deg = (ang - d.baseAng) * 180 / Math.PI;
        if (this.snap) deg = Math.round(deg / 15) * 15;
        d.obj.rot.y = (d.baseY + deg + 360) % 360;
      } else if (d.mode === 'scale') {
        const dist = Math.hypot(pt.x - d.obj.pos.x, pt.z - d.obj.pos.z) || 1;
        let f = d.baseScale * (dist / (d.baseDist || 1));
        if (this.snap) f = Math.round(f * 10) / 10;
        d.obj.scale = Math.max(0.2, Math.min(5, f));
      }
      this.applyTransform(d.obj);
      return;
    }
    // ghost preview for placement
    if (this.tool === 'place' && this.assetId) {
      const pt = this._planePt(e);
      if (pt && this.ghost) {
        const a = getAsset(this.assetId);
        this.ghost.position.set(this._snapV(pt.x), 0.02, this._snapV(pt.z));
        this.ghost.scale.set(a.w, 1, a.h);
      }
    }
    // hover cursor
    const hit = this._pick(e);
    if (hit && hit.kind === 'pin') this.canvas.style.cursor = 'crosshair';
    else if (hit && hit.kind === 'obj') this.canvas.style.cursor = 'pointer';
    else this.canvas.style.cursor = 'default';
  }

  _up() { this.drag = null; }

  /* ============ object lifecycle ============ */
  place(x, z) {
    if (!this.assetId) return null;
    const a = getAsset(this.assetId);
    if (!a) return null;
    const cx = this._snapV(x), cz = this._snapV(z);
    if (cx < -GRID / 2 || cx > GRID / 2 || cz < -GRID / 2 || cz > GRID / 2) return null;
    return this.addObject(a.id, cx, cz);
  }

  addObject(type, x, z) {
    const a = getAsset(type);
    if (!a) return null;
    const id = 'o' + this.counter++;
    const color = a.cat === 'mechanical' ? 0xffb300 : 0x00e5ff;
    const shape = buildShape(type, a, color, 0.55);
    shape.userData.compId = id;
    for (const mesh of shape.children) mesh.userData.compId = id;

    const obj = {
      id, type, name: a.name, cat: a.cat,
      color, opacity: 0.55, label: a.name,
      pos: { x, z, y: 0 }, rot: { x: 0, y: 0, z: 0 }, scale: 1,
      extra: a.extra ? { ...a.extra } : {},
      attr: a.attr ? { ...a.attr } : {},
      shapeH: 0.8,
      group: shape,
      pins: [], labelSprite: null, statusSprite: null, sim: null
    };

    // pin markers
    if (a.pins) {
      for (const p of a.pins) {
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(0.09, 12, 12),
          new THREE.MeshPhongMaterial({ color: PIN_COLOR, emissive: 0x004466, transparent: true, opacity: 0.95 })
        );
        m.userData.compId = id;
        m.userData.pinId = p.id;
        m.position.set(p.x - a.w / 2, SHAPE_OFFSET, p.y - a.h / 2);
        shape.add(m);
        obj.pins.push({ pinId: p.id, mesh: m, local: new THREE.Vector3(p.x - a.w / 2, SHAPE_OFFSET, p.y - a.h / 2) });
      }
    }
    // bounding height estimate
    const box = new THREE.Box3().setFromObject(shape);
    obj.shapeH = Math.max(0.2, box.max.y - box.min.y);

    obj.labelSprite = makeTextSprite(a.name, '#9fd8ff');
    this.scene.add(obj.labelSprite);
    obj.statusSprite = makeStatusSprite('#00e5ff');
    obj.statusSprite.visible = false;
    this.scene.add(obj.statusSprite);

    this.objects.push(obj);
    this.group.add(shape);
    this.applyTransform(obj);
    this._ghost();
    if (this.callbacks.onChange) this.callbacks.onChange();
    return obj;
  }

  removeObject(id) {
    const o = this.objects.find(x => x.id === id);
    if (!o) return;
    this.wires = this.wires.filter(w => w.a.split(':')[0] !== id && w.b.split(':')[0] !== id);
    if (this.pendingWire && this.pendingWire.compId === id) this.pendingWire = null;
    if (this.selected && this.selected.id === id) this.select(null);
    this.group.remove(o.group);
    o.group.traverse(m => { if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); });
    this.scene.remove(o.labelSprite);
    this.scene.remove(o.statusSprite);
    this.objects = this.objects.filter(x => x.id !== id);
    this.renderWires();
    if (this.callbacks.onChange) this.callbacks.onChange();
  }

  select(id) {
    this.selected = id ? this.objects.find(x => x.id === id) || null : null;
    this._updateSelectionBox();
    if (this.callbacks.onSelect) this.callbacks.onSelect(this.selected);
  }

  applyTransform(o) {
    o.group.position.set(o.pos.x, o.pos.y, o.pos.z);
    o.group.rotation.set(THREE.MathUtils.degToRad(o.rot.x), THREE.MathUtils.degToRad(o.rot.y), THREE.MathUtils.degToRad(o.rot.z));
    o.group.scale.setScalar(o.scale);
    o.labelSprite.position.set(o.pos.x, o.pos.y + o.shapeH * o.scale + 0.7, o.pos.z);
    if (o.statusSprite) o.statusSprite.position.copy(o.labelSprite.position).add(new THREE.Vector3(0, 0.5, 0));
    this.renderWires();
    this._updateSelectionBox();
  }

  /* ============ wiring ============ */
  _pinWorld(o, pinLocal) {
    return o.group.localToWorld(pinLocal.clone());
  }
  _pinClick(o, pinId) {
    if (!this.pendingWire) {
      this.pendingWire = { compId: o.id, pinId };
      this._flashPin(o.id, pinId);
      if (this.callbacks.onLog) this.callbacks.onLog('WIRE: pin ' + pinId + ' of ' + o.name + ' selected — now click the target pin.', 'sys');
      return;
    }
    if (this.pendingWire.compId === o.id && this.pendingWire.pinId === pinId) { this.pendingWire = null; return; }
    const a = this.pendingWire.compId + ':' + this.pendingWire.pinId;
    const b = o.id + ':' + pinId;
    const exists = this.wires.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a));
    if (!exists) {
      this.wires.push({ id: 'w' + this.wires.length, a, b });
      this.renderWires();
    }
    this.pendingWire = null;
    if (this.callbacks.onChange) this.callbacks.onChange();
  }

  _flashPin(compId, pinId) {
    const o = this.objects.find(x => x.id === compId);
    if (!o) return;
    const pin = o.pins.find(p => p.pinId === pinId);
    if (pin) { pin.mesh.material.emissive.setHex(0xffb300); pin.mesh.material.color.setHex(0xffb300); }
  }

  renderWires() {
    for (const w of this.wires) {
      if (!w.line) continue;
      const o1 = this.objects.find(o => o.id === w.a.split(':')[0]);
      const o2 = this.objects.find(o => o.id === w.b.split(':')[0]);
      const p1 = o1 && o1.pins.find(p => p.pinId === w.a.split(':')[1]);
      const p2 = o2 && o2.pins.find(p => p.pinId === w.b.split(':')[1]);
      if (!p1 || !p2) continue;
      const pos = w.line.geometry.attributes.position;
      pos.setXYZ(0, ...this._pinWorld(o1, p1.local).toArray());
      pos.setXYZ(1, ...this._pinWorld(o2, p2.local).toArray());
      pos.needsUpdate = true;
    }
  }
  _rebuildWireLines() {
    for (const w of this.wires) {
      if (w.line) { this.scene.remove(w.line); w.line.geometry.dispose(); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const mat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.85 });
      w.line = new THREE.Line(geo, mat);
      this.scene.add(w.line);
    }
    this.renderWires();
  }

  /* ============ appearance ============ */
  setColor(o, hex) {
    o.color = new THREE.Color(hex).getHex();
    o.group.traverse(m => {
      if (m.isMesh && m.material && m.material.isMeshPhongMaterial) m.material.color.setHex(o.color);
      if (m.isLineSegments) m.material.color.setHex(new THREE.Color(o.color).multiplyScalar(1.25).getHex());
    });
    if (this.callbacks.onChange) this.callbacks.onChange();
  }
  setOpacity(o, v) {
    o.opacity = v;
    o.group.traverse(m => { if (m.isMesh && m.material && m.material.isMeshPhongMaterial) m.material.opacity = v; });
    if (this.callbacks.onChange) this.callbacks.onChange();
  }
  setLabel(o, text) {
    o.label = text;
    o.labelSprite.material.map.dispose();
    o.labelSprite = makeTextSprite(text, '#9fd8ff');
    this.scene.add(o.labelSprite);
    this.applyTransform(o);
    if (this.callbacks.onChange) this.callbacks.onChange();
  }

  /* ============ simulation ============ */
  simulateNow() {
    const components = this.objects.map(o => {
      const a = getAsset(o.type);
      return {
        id: o.id, type: o.type,
        x: Math.round(o.pos.x - a.w / 2), y: Math.round(o.pos.z - a.h / 2),
        rot: o.rot.y, extra: o.extra, attr: o.attr
      };
    });
    const wires = this.wires.map(w => ({ id: w.id, a: w.a, b: w.b }));
    const { results, counts, verdict, short } = simulate(components, wires);
    for (const o of this.objects) delete o.sim;
    for (const r of results) {
      const o = this.objects.find(x => x.id === r.comp.id);
      if (o) o.sim = r.s;
    }
    this._applySim();
    return { results, counts, verdict, short };
  }
  _applySim() {
    for (const o of this.objects) {
      const c = STATUS_COLOR[o.sim] || 0x00e5ff;
      if (o.statusSprite) {
        o.statusSprite.material.map.dispose();
        o.statusSprite = makeStatusSprite('#' + c.toString(16).padStart(6, '0'));
        this.scene.add(o.statusSprite);
        o.statusSprite.visible = !!o.sim;
        this.applyTransform(o);
      }
      o.group.traverse(m => {
        if (m.isLineSegments && o.sim) m.material.color.setHex(c);
      });
    }
  }

  /* ============ selection box ============ */
  _updateSelectionBox() {
    if (this.selectionBox) { this.scene.remove(this.selectionBox); this.selectionBox.geometry.dispose(); this.selectionBox = null; }
    if (!this.selected) return;
    const box = new THREE.Box3().setFromObject(this.selected.group);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const geo = new THREE.BoxGeometry(size.x + 0.15, size.y + 0.15, size.z + 0.15);
    this.selectionBox = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x3dff88, transparent: true, opacity: 0.9 }));
    this.selectionBox.position.copy(center);
    this.selectionBox.visible = this.active;
    this.scene.add(this.selectionBox);
  }

  /* ============ ghost preview ============ */
  _ghost() {
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; }
    if (!this.assetId) return;
    const a = getAsset(this.assetId);
    if (!a) return;
    const geo = new THREE.BoxGeometry(1, 0.04, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0x3dff88, transparent: true, opacity: 0.35, depthWrite: false });
    this.ghost = new THREE.Mesh(geo, mat);
    this.ghost.visible = false;
    this.scene.add(this.ghost);
  }
  _showGhost(on) { if (this.ghost) this.ghost.visible = on; }

  /* ============ tools / assets ============ */
  setTool(tool) {
    this.tool = tool;
    this.pendingWire = null;
    if (this.ghost) this.ghost.visible = (tool === 'place');
    this.canvas.style.cursor = 'default';
  }
  setAsset(id) {
    this.assetId = id;
    this.tool = 'place';
    this._ghost();
    if (this.ghost) this.ghost.visible = true;
  }

  clear() {
    for (const id of [...this.objects.map(o => o.id)]) this.removeObject(id);
    this.wires = [];
    this._rebuildWireLines();
    this.select(null);
    if (this.callbacks.onChange) this.callbacks.onChange();
  }

  /* ============ examples ============ */
  loadExample(kind) {
    this.clear();
    const add = (type, x, z) => {
      const a = getAsset(type);
      const o = this.addObject(type, x, z);
      o.extra = a.extra ? { ...a.extra } : {};
      o.attr = a.attr ? { ...a.attr } : {};
      return o;
    };
    const wire = (a, b) => this.wires.push({ id: 'w' + this.wires.length, a, b });
    if (kind === 'working' || kind === 'broken') {
      const b = add('battery', 1, 0), r = kind === 'broken' ? null : add('resistor', 4, 0), l = add('led', 7, 0);
      wire(b.id + ':+', (r || l).id + ':' + (r ? 'A' : 'A'));
      if (r) wire(r.id + ':B', l.id + ':A');
      wire(l.id + ':K', b.id + ':-');
    } else if (kind === 'motor') {
      const b = add('battery', 1, 0), m = add('motor', 5, 0);
      wire(b.id + ':+', m.id + ':+');
      wire(m.id + ':-', b.id + ':-');
    } else if (kind === 'mech') {
      add('gearLarge', 1, 3);
      add('gear', 6, 3);
      add('pulley', 13, 3);
      add('pulleyLarge', 16, 3);
      add('belt', 14, 7);
      add('shaft', 21, 4);
      add('bearing', 25, 4);
      add('bolt', 1, 13);
      add('chassis', 5, 13);
      add('spring', 11, 13);
    }
    this._rebuildWireLines();
    return { components: this.objects.length, wires: this.wires.length };
  }

  /* ============ config ============ */
  setSnap(on, size) {
    this.snap = on;
    if (size) this.snapSize = size;
  }
}
