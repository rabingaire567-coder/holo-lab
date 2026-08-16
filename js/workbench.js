/* ============================================================
   HOLO·LAB — CREATOR LAB WORKBENCH
   ------------------------------------------------------------
   SVG-based engineering workbench: place components from the
   asset library, wire electronics pins, run the simulator, and
   validate mechanical assemblies — all in hologram style.
   ============================================================ */
import { ASSETS, getAsset, iconSvg } from './assets.js';
import { simulate, pinWorld } from './simulator.js';

export const CELL = 30;
export const COLS = 40;
export const ROWS = 24;
const W = COLS * CELL;
const H = ROWS * CELL;

const COLORS = { ok: '#3dff88', warn: '#ffb300', fail: '#ff3355', idle: '#00e5ff' };

export class CreatorLab {
  constructor(svg) {
    this.svg = svg;
    this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.components = [];
    this.wires = [];
    this.tool = 'place';
    this.assetId = null;
    this.pendingPin = null;
    this.drag = null;
    this.counter = 1;
    this.hint = null;
    this._bindEvents();
  }

  _bindEvents() {
    this.svg.addEventListener('pointerdown', e => this._onDown(e));
    this.svg.addEventListener('pointermove', e => this._onMove(e));
    this.svg.addEventListener('pointerup', e => this._onUp(e));
    this.svg.addEventListener('dblclick', e => this._onDbl(e));
  }

  _pt(e) {
    const r = this.svg.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * W,
      y: ((e.clientY - r.top) / r.height) * H
    };
  }

  /* ---------- public API ---------- */
  setTool(tool) {
    this.tool = tool;
    this.pendingPin = null;
    if (this.hint) this.hint.textContent = this._hintText();
  }

  setAsset(id) {
    this.assetId = id;
    this.tool = 'place';
    this.pendingPin = null;
    if (this.hint) this.hint.textContent = this._hintText();
  }

  clear() {
    this.components = [];
    this.wires = [];
    this.pendingPin = null;
    this.render();
  }

  clearSimResults() {
    for (const c of this.components) delete c.sim;
    this.render();
  }

  loadExample(kind) {
    this.clear();
    const add = (type, x, y, extra, attr) => {
      const a = getAsset(type);
      const comp = {
        id: 'c' + this.counter++, type, x, y, rot: 0,
        extra: extra || (a.extra ? { ...a.extra } : {}),
        attr: attr || (a.attr ? { ...a.attr } : {})
      };
      this.components.push(comp);
      return comp;
    };
    const wire = (a, b) => this.wires.push({ id: 'w' + this.wires.length, a, b });

    if (kind === 'working') {
      const b = add('battery', 0, 10), r = add('resistor', 4, 10), l = add('led', 8, 10);
      wire(b.id + ':+', r.id + ':A');
      wire(r.id + ':B', l.id + ':A');
      wire(l.id + ':K', b.id + ':-');
    } else if (kind === 'broken') {
      const b = add('battery', 0, 10), l = add('led', 4, 10);
      wire(b.id + ':+', l.id + ':A');
      wire(l.id + ':K', b.id + ':-');
    } else if (kind === 'motor') {
      const b = add('battery', 0, 8), m = add('motor', 5, 7);
      wire(b.id + ':+', m.id + ':+');
      wire(m.id + ':-', b.id + ':-');
    } else if (kind === 'mech') {
      add('gearLarge', 0, 2, null, { teeth: 24 });
      add('gear', 5, 2, null, { teeth: 12 });
      add('pulley', 12, 2, null, { radius: 1 });
      add('pulleyLarge', 15, 2, null, { radius: 2 });
      add('belt', 13, 6);
      add('shaft', 20, 3);
      add('bearing', 24, 3);
      add('bolt', 0, 12);
      add('chassis', 4, 12);
      add('spring', 10, 12);
    }
    this.render();
    return { components: this.components.length, wires: this.wires.length };
  }

  get state() {
    return {
      components: this.components.map(c => ({ ...c, attr: c.attr ? { ...c.attr } : {}, extra: c.extra ? { ...c.extra } : {} })),
      wires: this.wires.map(w => ({ ...w }))
    };
  }

  simulateNow() {
    const { results, counts, verdict, short } = simulate(this.components, this.wires);
    for (const c of this.components) delete c.sim;
    for (const res of results) res.comp.sim = res.s;
    this.render();
    return { results, counts, verdict, short };
  }

  /* ---------- placement ---------- */
  _occupied(cx, cy) {
    return this.components.some(c => {
      const a = getAsset(c.type);
      return cx >= c.x && cx < c.x + (a ? a.w : 1) && cy >= c.y && cy < c.y + (a ? a.h : 1);
    });
  }

  _place(cx, cy) {
    if (!this.assetId) return false;
    const a = getAsset(this.assetId);
    if (!a) return false;
    if (cx < 0 || cy < 0 || cx + a.w > COLS || cy + a.h > ROWS) return false;
    if (this._occupied(cx, cy)) return false;
    this.components.push({
      id: 'c' + this.counter++,
      type: a.id, x: cx, y: cy, rot: 0,
      extra: a.extra ? { ...a.extra } : {},
      attr: a.attr ? { ...a.attr } : {}
    });
    this.render();
    return true;
  }

  _compAt(cx, cy) {
    for (const c of this.components) {
      const a = getAsset(c.type);
      if (cx >= c.x && cx < c.x + (a ? a.w : 1) && cy >= c.y && cy < c.y + (a ? a.h : 1)) return c;
    }
    return null;
  }

  _nearestPin(comp, px, py) {
    const a = getAsset(comp.type);
    if (!a || !a.pins) return null;
    let best = null, bestD = 26;
    for (const p of a.pins) {
      const w = pinWorld(comp, p);
      const d = Math.hypot(w.x * CELL - px, w.y * CELL - py);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  _pinAt(px, py) {
    for (const c of this.components) {
      const a = getAsset(c.type);
      if (!a || !a.pins) continue;
      for (const p of a.pins) {
        const w = pinWorld(c, p);
        if (Math.hypot(w.x * CELL - px, w.y * CELL - py) < 14) return { comp: c, pin: p };
      }
    }
    return null;
  }

  /* ---------- wiring ---------- */
  _handlePinClick(comp, pin, px, py) {
    if (!this.pendingPin) {
      this.pendingPin = { compId: comp.id, pinId: pin.id };
      this.render();
      return;
    }
    if (this.pendingPin.compId === comp.id && this.pendingPin.pinId === pin.id) {
      this.pendingPin = null;
      this.render();
      return;
    }
    const exists = this.wires.some(w =>
      (w.a === this.pendingPin.compId + ':' + this.pendingPin.pinId && w.b === comp.id + ':' + pin.id) ||
      (w.b === this.pendingPin.compId + ':' + this.pendingPin.pinId && w.a === comp.id + ':' + pin.id));
    if (!exists) this.wires.push({ id: 'w' + this.wires.length, a: this.pendingPin.compId + ':' + this.pendingPin.pinId, b: comp.id + ':' + pin.id });
    this.pendingPin = null;
    this.render();
  }

  /* ---------- events ---------- */
  _onDown(e) {
    const p = this._pt(e);
    const target = e.target;
    const compEl = target.closest('[data-comp]');
    const pinEl = target.closest('[data-pin]');
    const wireEl = target.closest('[data-wire]');

    if (pinEl) {
      if (this.tool === 'wire') {
        this._handlePinClick(this.components.find(c => c.id === pinEl.dataset.comp), pinEl.dataset.pin, p.x, p.y);
        e.stopPropagation();
      } else if (this.tool === 'delete') {
        this._removeComp(pinEl.dataset.comp);
        e.stopPropagation();
      }
      return;
    }

    if (compEl) {
      const comp = this.components.find(c => c.id === compEl.dataset.comp);
      if (!comp) return;
      if (this.tool === 'move') {
        this.drag = { comp, offX: p.x / CELL - comp.x, offY: p.y / CELL - comp.y };
        this.svg.setPointerCapture(e.pointerId);
        e.stopPropagation();
        return;
      }
      if (this.tool === 'rotate') {
        comp.rot = ((comp.rot || 0) + 90) % 360;
        this.render();
        return;
      }
      if (this.tool === 'delete') {
        this._removeComp(comp.id);
        return;
      }
      if (this.tool === 'wire') {
        const pin = this._nearestPin(comp, p.x, p.y);
        if (pin) this._handlePinClick(comp, pin, p.x, p.y);
        return;
      }
      // place tool: ignore (grid click handled on background)
      return;
    }

    if (wireEl && this.tool === 'delete') {
      this.wires = this.wires.filter(w => w.id !== wireEl.dataset.wire);
      this.render();
      return;
    }

    if (this.tool === 'place' && target.classList.contains('bg')) {
      this._place(Math.floor(p.x / CELL), Math.floor(p.y / CELL));
    }
  }

  _onMove(e) {
    if (!this.drag) return;
    const p = this._pt(e);
    const a = getAsset(this.drag.comp.type);
    const nx = Math.round(p.x / CELL - this.drag.offX);
    const ny = Math.round(p.y / CELL - this.drag.offY);
    const c = this.drag.comp;
    const oldX = c.x, oldY = c.y;
    const clamp = (v, mx) => Math.max(0, Math.min(mx, v));
    c.x = clamp(nx, COLS - a.w);
    c.y = clamp(ny, ROWS - a.h);
    if (c.x !== oldX || c.y !== oldY) this.render();
  }

  _onUp() {
    this.drag = null;
  }

  _onDbl(e) {
    const compEl = e.target.closest('[data-comp]');
    if (!compEl) return;
    const comp = this.components.find(c => c.id === compEl.dataset.comp);
    if (comp && comp.type === 'switch') {
      comp.extra.state = comp.extra.state === 'open' ? 'closed' : 'open';
      this.render();
      return true;
    }
  }

  _removeComp(id) {
    this.components = this.components.filter(c => c.id !== id);
    this.wires = this.wires.filter(w => w.a.split(':')[0] !== id && w.b.split(':')[0] !== id);
    if (this.pendingPin && this.pendingPin.compId === id) this.pendingPin = null;
    this.render();
  }

  /* ---------- hint ---------- */
  _hintText() {
    switch (this.tool) {
      case 'place': return this.assetId ? `PLACE MODE — click the grid to drop ${getAsset(this.assetId).name}` : 'PLACE MODE — pick an asset from the library first';
      case 'wire': return 'WIRE MODE — click pin A, then pin B to connect';
      case 'move': return 'MOVE MODE — drag a component to relocate it';
      case 'rotate': return 'ROTATE MODE — click a component to spin it 90°';
      case 'delete': return 'DELETE MODE — click a component or wire to remove it';
    }
  }

  /* ---------- rendering ---------- */
  render() {
    this.svg.innerHTML = '';
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML =
      '<filter id="glow" x="-60%" y="-60%" width="220%" height="220%">' +
      '<feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>' +
      '</filter>' +
      '<pattern id="grid" width="' + CELL + '" height="' + CELL + '" patternUnits="userSpaceOnUse">' +
      '<path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(0,229,255,0.07)" stroke-width="1"/>' +
      '</pattern>';
    this.svg.appendChild(defs);

    const bg = this._el('rect', { class: 'bg', x: 0, y: 0, width: W, height: H, fill: 'url(#grid)' });
    this.svg.appendChild(bg);

    // border
    const border = this._el('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'none', stroke: 'rgba(0,229,255,0.25)', 'stroke-width': 2 });
    this.svg.appendChild(border);

    this._renderWires();
    for (const c of this.components) this._renderComp(c);

    // pending pin highlight
    if (this.pendingPin) {
      const c = this.components.find(x => x.id === this.pendingPin.compId);
      if (c) {
        const a = getAsset(c.type);
        const pin = a.pins.find(p => p.id === this.pendingPin.pinId);
        if (pin) {
          const w = pinWorld(c, pin);
          const hl = this._el('circle', { cx: w.x * CELL, cy: w.y * CELL, r: 11, fill: 'none', stroke: COLORS.warn, 'stroke-width': 3, 'stroke-dasharray': '5 4' });
          this.svg.appendChild(hl);
        }
      }
    }

    // hint bar
    if (!this.hint || !this.hint.isConnected) {
      this.hint = document.createElement('div');
      this.hint.className = 'lab-hint';
      this.svg.parentNode.appendChild(this.hint);
    }
    this.hint.textContent = this._hintText();
  }

  _el(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  _renderWires() {
    for (const w of this.wires) {
      const p1 = this._pinByKey(w.a), p2 = this._pinByKey(w.b);
      if (!p1 || !p2) continue;
      const x1 = p1.x * CELL, y1 = p1.y * CELL, x2 = p2.x * CELL, y2 = p2.y * CELL;
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const bend = 12;
      const d = `M ${x1} ${y1} C ${mx} ${y1 + bend}, ${mx} ${y2 - bend}, ${x2} ${y2}`;
      const hit = this._el('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': 16, 'data-wire': w.id, cursor: 'crosshair' });
      const vis = this._el('path', { d, fill: 'none', stroke: COLORS.idle, 'stroke-width': 2.5, opacity: 0.8, filter: 'url(#glow)', 'data-wire': w.id, 'pointer-events': 'none' });
      this.svg.appendChild(hit);
      this.svg.appendChild(vis);
      // endpoint dots
      for (const [px, py] of [[x1, y1], [x2, y2]]) {
        this.svg.appendChild(this._el('circle', { cx: px, cy: py, r: 3.5, fill: COLORS.idle, opacity: 0.9 }));
      }
    }
  }

  _pinByKey(key) {
    const [cid, pid] = key.split(':');
    const c = this.components.find(x => x.id === cid);
    if (!c) return null;
    const a = getAsset(c.type);
    if (!a || !a.pins) return null;
    const pin = a.pins.find(p => p.id === pid);
    if (!pin) return null;
    return pinWorld(c, pin);
  }

  _renderComp(comp) {
    const a = getAsset(comp.type);
    if (!a) return;
    const cw = a.w * CELL, ch = a.h * CELL;
    const status = comp.sim;
    const col = COLORS[status] || COLORS.idle;

    const g = this._el('g', { 'data-comp': comp.id, transform: `translate(${comp.x * CELL}, ${comp.y * CELL})`, cursor: this.tool === 'move' ? 'grab' : 'pointer' });

    // shadow box
    const box = this._el('rect', {
      x: 2, y: 2, width: cw - 4, height: ch - 4, rx: 6,
      fill: status === 'fail' ? 'rgba(255,51,85,0.10)' : status === 'warn' ? 'rgba(255,179,0,0.08)' : status === 'ok' ? 'rgba(61,255,136,0.06)' : 'rgba(0,229,255,0.05)',
      stroke: col, 'stroke-width': status ? 2 : 1.2, 'stroke-dasharray': status === 'warn' ? '5 4' : null, opacity: 0.9
    });
    g.appendChild(box);

    // rotated inner: icon + pins
    const inner = this._el('g', {});
    if (comp.rot) inner.setAttribute('transform', `rotate(${comp.rot} ${cw / 2} ${ch / 2})`);

    const iconS = this._el('svg', { viewBox: '0 0 48 48', x: 10, y: (ch - (cw - 20)) / 2, width: cw - 20, height: cw - 20, 'pointer-events': 'none' });
    const iconSvgEl = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    iconSvgEl.innerHTML = iconSvg(a.icon);
    iconS.appendChild(iconSvgEl);
    inner.appendChild(iconS);

    if (a.pins) {
      for (const p of a.pins) {
        const w = pinWorld(comp, p);
        const pcx = (w.x - comp.x) * CELL, pcy = (w.y - comp.y) * CELL;
        const c = this._el('circle', {
          'data-pin': p.id, 'data-comp': comp.id, cx: pcx, cy: pcy, r: 5.5,
          fill: 'rgba(0,229,255,0.25)', stroke: COLORS.idle, 'stroke-width': 1.6, cursor: 'crosshair'
        });
        inner.appendChild(c);
        const t = this._el('text', { x: pcx + 8, y: pcy - 7, 'font-size': 11, fill: '#bfeaff', 'font-family': 'Share Tech Mono, monospace', 'data-pin-label': '1' });
        t.textContent = p.id;
        inner.appendChild(t);
      }
    }
    g.appendChild(inner);

    // name label
    const name = this._el('text', {
      x: cw / 2, y: ch + 14, 'text-anchor': 'middle', 'font-size': 11, fill: '#7fb8d4',
      'font-family': 'Orbitron, sans-serif', 'letter-spacing': '1', 'pointer-events': 'none'
    });
    name.textContent = a.name;
    g.appendChild(name);

    this.svg.appendChild(g);
  }
}
