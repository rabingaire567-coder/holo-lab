/* ============================================================
   HOLO·LAB — CREATOR LAB SIMULATOR
   ------------------------------------------------------------
   Builds electrical nets from wires, then validates every
   component (polarity, current limiting, shorts, power).
   Mechanical assets validated by proximity/linkage rules.
   ============================================================ */
import { getAsset } from './assets.js';

const LIMITERS = ['resistor', 'potentiometer', 'ldr'];

/* ---------- geometry ---------- */
function rotateLocal(px, py, w, h, rot) {
  const cx = w / 2, cy = h / 2;
  const dx = px - cx, dy = py - cy;
  let ox = dx, oy = dy;
  switch (rot) {
    case 90: ox = -dy; oy = dx; break;
    case 180: ox = -dx; oy = -dy; break;
    case 270: ox = dy; oy = -dx; break;
  }
  return [cx + ox, cy + oy];
}

export function pinWorld(comp, pin) {
  const a = getAsset(comp.type);
  if (!a) return null;
  const [lx, ly] = rotateLocal(pin.x, pin.y, a.w, a.h, comp.rot || 0);
  return { x: comp.x + lx, y: comp.y + ly, key: comp.id + ':' + pin.id };
}

export function compCenter(comp) {
  const a = getAsset(comp.type);
  return { x: comp.x + (a ? a.w : 2) / 2, y: comp.y + (a ? a.h : 2) / 2 };
}

/* ---------- nets (union-find over pins) ---------- */
export function buildNets(components, wires) {
  const parent = {};
  const pins = [];
  const find = k => {
    while (parent[k] !== k) { parent[k] = parent[parent[k]]; k = parent[k]; }
    return k;
  };
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (const c of components) {
    const a = getAsset(c.type);
    if (!a || !a.pins) continue;
    for (const p of a.pins) {
      const key = c.id + ':' + p.id;
      parent[key] = key;
      pins.push({ key, comp: c, pin: p });
    }
  }
  for (const w of wires) {
    if (parent[w.a] === undefined || parent[w.b] === undefined) continue;
    union(w.a, w.b);
  }
  const nets = {};
  for (const p of pins) {
    const r = find(p.key);
    (nets[r] || (nets[r] = [])).push(p);
  }
  const netOf = key => (parent[key] === undefined ? null : find(key));
  return { nets, netOf, pins };
}

function buildNetGraph(components, netOf) {
  const adj = {};
  const edgeComp = {};
  const addEdge = (r1, r2, cid) => {
    if (r1 === r2) return;
    (adj[r1] || (adj[r1] = [])).push(r2);
    (adj[r2] || (adj[r2] = [])).push(r1);
    edgeComp[r1 + '>' + r2] = cid;
    edgeComp[r2 + '>' + r1] = cid;
  };
  for (const c of components) {
    if (c.type === 'battery') continue;
    if (c.type === 'switch' && c.extra && c.extra.state === 'open') continue;
    const a = getAsset(c.type);
    if (!a || !a.pins || a.pins.length < 2) continue;
    const rs = [];
    for (const p of a.pins) {
      const r = netOf(c.id + ':' + p.id);
      if (r != null) rs.push(r);
    }
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) addEdge(rs[i], rs[j], c.type);
  }
  return { adj, edgeComp };
}

function powerRootsOf(components, netOf) {
  const s = new Set();
  for (const c of components) if (c.type === 'battery') { const r = netOf(c.id + ':+'); if (r != null) s.add(r); }
  return s;
}
function gndRootsOf(components, netOf) {
  const s = new Set();
  for (const c of components) if (c.type === 'battery') { const r = netOf(c.id + ':-'); if (r != null) s.add(r); }
  return s;
}
function reachFrom(graph, roots) {
  const set = new Set(roots);
  const stack = [...roots];
  while (stack.length) {
    const cur = stack.pop();
    for (const nb of graph.adj[cur] || []) if (!set.has(nb)) { set.add(nb); stack.push(nb); }
  }
  return set;
}

function netProps(nets, netOf, components) {
  const graph = buildNetGraph(components, netOf);
  const powered = reachFrom(graph, powerRootsOf(components, netOf));
  const grounded = reachFrom(graph, gndRootsOf(components, netOf));
  const props = r => ({ isPower: powered.has(r), isGnd: grounded.has(r) });
  return { props, netOf, powered, grounded, graph };
}

/* ---------- current-path search ---------- */
function pathHasLimiter(netOf, graph, powered, components, fromCompId, fromPinId) {
  const start = netOf(fromCompId + ':' + fromPinId);
  if (start == null) return false;
  const powerRoots = new Set();
  for (const c of components) {
    if (c.type !== 'battery') continue;
    const r = netOf(c.id + ':+');
    if (r != null) powerRoots.add(r);
  }
  if (powerRoots.has(start)) return false; // direct wire from battery+ → nothing to limit
  // DFS from power roots: does any current-limiting component sit on a path reaching `start`?
  const visited = new Set([...powerRoots]);
  const stack = [...powerRoots];
  while (stack.length) {
    const cur = stack.pop();
    for (const nb of graph.adj[cur] || []) {
      const cid = graph.edgeComp[cur + '>' + nb];
      if (LIMITERS.includes(cid)) return true;
      if (!visited.has(nb)) { visited.add(nb); stack.push(nb); }
    }
  }
  return false;
}

/* ---------- electronics validators ---------- */
const E = {
  battery(comp, ctx) {
    const pPlus = ctx.netOf(comp.id + ':+');
    const pMinus = ctx.netOf(comp.id + ':-');
    if (pPlus == null || pMinus == null) return { s: 'warn', m: 'Terminals not both wired.' };
    if (pPlus === pMinus) return { s: 'fail', m: 'SHORT CIRCUIT — + and − are directly wired together. Overheat / smoke / fuse blows!' };
    return { s: 'ok', m: 'Delivering power to the circuit.' };
  },
  resistor(comp, ctx) {
    return ctx.twoPin(comp, 'Resistor in circuit — limiting current flow.', 'Not connected to the circuit.');
  },
  capacitor(comp, ctx) {
    const r = ctx.twoPin(comp);
    if (r.s !== 'ok') return r;
    const a = ctx.pinPolarity(comp, 'A'), b = ctx.pinPolarity(comp, 'B');
    if ((a.isPower && b.isGnd) || (b.isPower && a.isGnd)) return { s: 'ok', m: 'Charging — smoothing the supply rail.' };
    if (a.isPower || b.isPower) return { s: 'warn', m: 'One side powered — no ground return yet.' };
    return { s: 'warn', m: 'In circuit but sees no power.' };
  },
  led(comp, ctx) {
    const a = ctx.pinPolarity(comp, 'A');
    const k = ctx.pinPolarity(comp, 'K');
    if (!a.connected || !k.connected) return { s: 'warn', m: 'Both pins must be wired (anode + cathode).' };
    if (a.isGnd && k.isPower) return { s: 'fail', m: 'REVERSE BIASED — anode on ground, cathode on power. No light; can damage the LED.' };
    if (a.isPower && k.isGnd) {
      if (ctx.short) return { s: 'fail', m: 'No light — battery is shorted.' };
      const lim = pathHasLimiter(ctx.netOf, ctx.graph, ctx.powered, ctx.components, comp.id, 'A');
      if (lim) return { s: 'ok', m: 'LIT — current correctly limited by a resistor/potentiometer in the path.' };
      return { s: 'fail', m: 'BURNED OUT — no current-limiting resistor between the battery and the LED. Over-current!' };
    }
    if (a.isPower || k.isPower) return { s: 'warn', m: 'Power present but polarity incomplete — needs + on anode and − on cathode.' };
    return { s: 'warn', m: 'Not lit — no power reaching the LED.' };
  },
  diode(comp, ctx) {
    const a = ctx.pinPolarity(comp, 'A'), k = ctx.pinPolarity(comp, 'K');
    if (!a.connected || !k.connected) return { s: 'warn', m: 'Both pins must be wired (anode + cathode).' };
    if (a.isPower && k.isGnd) return { s: 'ok', m: 'Forward biased — conducting (rectifying / protecting).' };
    if (k.isPower) return { s: 'warn', m: 'REVERSE biased — blocking current (acts as a one-way valve).' };
    return { s: 'warn', m: 'No power in the path.' };
  },
  transistor(comp, ctx) {
    const bNet = ctx.netOf(comp.id + ':B'), cNet = ctx.netOf(comp.id + ':C'), eNet = ctx.netOf(comp.id + ':E');
    if (bNet == null || cNet == null || eNet == null) return { s: 'warn', m: 'All three pins (B, C, E) must be wired.' };
    const cP = ctx.props(cNet).isPower, eG = ctx.props(eNet).isGnd;
    if (!cP && !eG) return { s: 'warn', m: 'Collector/emitter path has no power supply.' };
    if (bNet === eNet) return { s: 'warn', m: 'Base tied to emitter — transistor cannot switch.' };
    if (cP && eG) return { s: 'ok', m: 'Switching — small base current gates the collector load.' };
    return { s: 'warn', m: 'In circuit; base signal drives the switch.' };
  },
  switch(comp, ctx) {
    const open = comp.extra && comp.extra.state === 'open';
    const r = ctx.twoPin(comp, open ? 'OPEN — power interrupted downstream (double-click to close).' : 'CLOSED — passing power downstream.', 'Not wired into the circuit.');
    if (open) r.s = 'warn';
    return r;
  },
  fuse(comp, ctx) {
    if (ctx.short) return { s: 'fail', m: 'BLOWN — short circuit detected upstream. Replace the fuse.' };
    return ctx.twoPin(comp, 'Intact — conducting current.', 'Not wired into the circuit.');
  },
  inductor(comp, ctx) {
    return ctx.twoPin(comp, 'In circuit — smoothing current, resisting sudden changes.', 'Not wired into the circuit.');
  },
  motor(comp, ctx) {
    const p = ctx.pinPolarity(comp, '+'), m = ctx.pinPolarity(comp, '-');
    if (!p.connected || !m.connected) return { s: 'warn', m: 'Both motor terminals must be wired (+ and −).' };
    if (p.isPower && m.isGnd) return { s: 'ok', m: 'SPINNING — powered motor rotating the shaft.' };
    if (p.isGnd && m.isPower) return { s: 'warn', m: 'Powered but REVERSED polarity — shaft spins the wrong way.' };
    if (p.isPower || m.isPower) return { s: 'warn', m: 'No ground return — motor cannot spin.' };
    return { s: 'warn', m: 'No power — motor stationary.' };
  },
  buzzer(comp, ctx) {
    const r = ctx.twoPin(comp);
    if (r.s !== 'ok') return r;
    const a = ctx.pinPolarity(comp, '+'), b = ctx.pinPolarity(comp, '-');
    const okPolar = (a.isPower && b.isGnd) || (b.isPower && a.isGnd);
    return okPolar ? { s: 'ok', m: 'BEEPING — audio alert sounding.' } : { s: 'warn', m: 'Powered but check polarity.' };
  },
  speaker(comp, ctx) {
    const r = ctx.twoPin(comp);
    if (r.s !== 'ok') return r;
    return { s: 'ok', m: 'Receiving signal — sound stage active.' };
  },
  relay(comp, ctx) {
    const coil = ctx.pinPolarity(comp, 'C+'), coilM = ctx.pinPolarity(comp, 'C-');
    if (coil.isPower && coilM.isGnd) return { s: 'ok', m: 'Coil energized — contacts closed, switching the load.' };
    if (coil.isPower || coilM.isPower) return { s: 'warn', m: 'Coil powered but no ground return.' };
    return { s: 'warn', m: 'Coil not powered — contacts stay open.' };
  },
  button(comp, ctx) {
    return ctx.twoPin(comp, 'Momentary — held CLOSED (conducts while pressed).', 'Not wired into the circuit.');
  },
  seg7(comp, ctx) {
    const r = ctx.twoPin(comp);
    if (r.s !== 'ok') return r;
    const a = ctx.pinPolarity(comp, 'VCC'), b = ctx.pinPolarity(comp, 'GND');
    const okPolar = (a.isPower && b.isGnd) || (b.isPower && a.isGnd);
    return okPolar ? { s: 'ok', m: 'DISPLAYING digits from the controller.' } : { s: 'warn', m: 'Powered — check display polarity.' };
  },
  ic(comp, ctx) {
    const vcc = ctx.pinPolarity(comp, 'VCC'), gnd = ctx.pinPolarity(comp, 'GND');
    if (vcc.isPower && gnd.isGnd) return { s: 'ok', m: 'Powered — amplifying / processing the input signal.' };
    if (vcc.isPower) return { s: 'warn', m: 'VCC powered but GND missing.' };
    return { s: 'warn', m: 'No power (need VCC on power rail, GND on ground).' };
  },
  mcu(comp, ctx) {
    const vcc = ctx.pinPolarity(comp, 'VCC'), gnd = ctx.pinPolarity(comp, 'GND');
    if (vcc.isPower && gnd.isGnd) return { s: 'ok', m: 'RUNNING PROGRAM — issuing control signals on OUT.' };
    if (vcc.isPower) return { s: 'warn', m: 'VCC powered but GND missing.' };
    return { s: 'warn', m: 'No power (need VCC + GND) — brain is asleep.' };
  },
  crystal(comp, ctx) {
    const r = ctx.twoPin(comp, 'Resonating — providing a precise clock to the MCU.', 'Not wired — no clock reference.');
    return { s: 'ok', m: 'Resonating — quartz clock reference active.' };
  },
  regulator(comp, ctx) {
    const inNet = ctx.pinPolarity(comp, 'IN');
    if (inNet.isPower) return { s: 'ok', m: 'Regulating — stable output voltage on OUT.' };
    return { s: 'warn', m: 'No input voltage on IN — no regulated output.' };
  },
  transformer(comp, ctx) {
    const p1 = ctx.netOf(comp.id + ':P1'), p2 = ctx.netOf(comp.id + ':P2');
    if (p1 != null && p2 != null && p1 !== p2) return { s: 'ok', m: 'Primary excited — voltage induced on the secondary.' };
    return { s: 'warn', m: 'Primary not connected across a source.' };
  },
  antenna(comp, ctx) {
    return { s: 'ok', m: 'Radiating/receiving RF — wireless link active.' };
  },
  servo(comp, ctx) {
    const vcc = ctx.pinPolarity(comp, 'VCC'), gnd = ctx.pinPolarity(comp, 'GND');
    if (vcc.isPower && gnd.isGnd) {
      const sig = ctx.netOf(comp.id + ':SIG');
      if (sig != null) return { s: 'ok', m: 'POSITIONING — following the PWM command on SIG.' };
      return { s: 'warn', m: 'Powered but no signal on SIG.' };
    }
    return { s: 'warn', m: 'Needs VCC (power) + GND (ground).' };
  }
};

/* ---------- mechanical validators ---------- */
const M = {
  gear(comp, ctx) {
    const my = ctx.center(comp);
    const t = (comp.attr && comp.attr.teeth) || 12;
    const r = t * 0.16;
    const mates = ctx.mech.filter(c => c !== comp && (c.type === 'gear' || c.type === 'gearLarge'));
    for (const c of mates) {
      const tr = (c.attr && c.attr.teeth) || 12;
      const rr = tr * 0.16;
      const d = ctx.dist(my, ctx.center(c));
      if (d > (r + rr) - 0.9 && d < (r + rr) + 0.9) {
        const ratio = tr >= t ? tr / t : t / tr;
        return { s: 'ok', m: `MESHED with ${tr}T gear — ratio ${ratio.toFixed(1)}:1${tr > t ? ' torque multiplier' : tr < t ? ' speed multiplier' : ''}.` };
      }
    }
    return { s: 'warn', m: 'Idle — no gear within mesh distance.' };
  },
  shaft(comp, ctx) {
    const sup = ctx.mech.some(c => c.type === 'bearing' && ctx.dist(ctx.center(comp), ctx.center(c)) < 3.2);
    return sup ? { s: 'ok', m: 'Supported by bearings — runs smooth.' } : { s: 'warn', m: 'UNSUPPORTED — will wobble at speed. Add a bearing.' };
  },
  bearing(comp, ctx) {
    const loaded = ctx.mech.some(c => c.type === 'shaft' && ctx.dist(ctx.center(comp), ctx.center(c)) < 3.2);
    return loaded ? { s: 'ok', m: 'Loaded — carrying a shaft.' } : { s: 'warn', m: 'Unused — place it under a shaft.' };
  },
  spring(comp, ctx) {
    return { s: 'ok', m: `Rated ${(comp.attr && comp.attr.force) || 20} N — returns mechanical energy when compressed.` };
  },
  pulley(comp, ctx) {
    const mates = ctx.mech.filter(c => c.type.startsWith('pulley') && c !== comp);
    if (mates.length) return { s: 'ok', m: 'Belt-ready — aligned with another pulley for a drive.' };
    return { s: 'warn', m: 'Idle — pair it with another pulley + belt.' };
  },
  belt(comp, ctx) {
    const pulleys = ctx.mech.filter(c => c.type.startsWith('pulley'));
    return pulleys.length >= 2 ? { s: 'ok', m: `Transmitting power between ${pulleys.length} pulleys.` } : { s: 'warn', m: 'Slack — need at least two pulleys.' };
  },
  bolt(comp, ctx) {
    const near = ctx.mech.some(c => c.type === 'chassis' && ctx.dist(ctx.center(comp), ctx.center(c)) < 3);
    return near ? { s: 'ok', m: 'Fastened — clamping parts to the chassis.' } : { s: 'warn', m: 'Loose — tighten against a mating part.' };
  },
  chassis(comp, ctx) {
    return { s: 'ok', m: 'Structural base — keeps all parts aligned and absorbs vibration.' };
  },
  piston(comp, ctx) {
    const near = ctx.mech.some(c => ['shaft', 'gear', 'gearLarge', 'linkage'].includes(c.type) && ctx.dist(ctx.center(comp), ctx.center(c)) < 3);
    return near ? { s: 'ok', m: 'Linked to the crank — converting rotation to linear stroke.' } : { s: 'warn', m: 'Free — connect to a crank/linkage.' };
  },
  linkage(comp, ctx) {
    const near = ctx.mech.some(c => ['gear', 'gearLarge', 'shaft', 'piston'].includes(c.type) && ctx.dist(ctx.center(comp), ctx.center(c)) < 3);
    return near ? { s: 'ok', m: 'Transmitting motion between joints.' } : { s: 'warn', m: 'Unlinked — motion not transmitted.' };
  },
  hinge(comp, ctx) {
    return { s: 'ok', m: 'Pivot active — one rotational degree of freedom.' };
  },
  coupling(comp, ctx) {
    const shafts = ctx.mech.filter(c => c.type === 'shaft' && ctx.dist(ctx.center(comp), ctx.center(c)) < 3);
    return shafts.length >= 2 ? { s: 'ok', m: 'Joining two shafts — torque transmitted through the coupling.' } : { s: 'warn', m: 'Unused — place between two shaft ends.' };
  },
  cam(comp, ctx) {
    const near = ctx.mech.some(c => c.type === 'shaft' && ctx.dist(ctx.center(comp), ctx.center(c)) < 3);
    return near ? { s: 'ok', m: 'On shaft — converting rotation into the programmed motion profile.' } : { s: 'warn', m: 'Idle — mount it on a shaft.' };
  },
  gearbox(comp, ctx) {
    const gears = ctx.mech.filter(c => c.type.startsWith('gear'));
    return gears.length ? { s: 'ok', m: `Housing a ${gears.length}-gear train — torque multiplied safely.` } : { s: 'warn', m: 'Empty — add a gear train inside.' };
  },
  washer(comp, ctx) {
    const near = ctx.mech.some(c => c.type === 'bolt' && ctx.dist(ctx.center(comp), ctx.center(c)) < 2);
    return near ? { s: 'ok', m: 'Distributing fastener load — prevents loosening.' } : { s: 'warn', m: 'Standalone — place under a bolt head.' };
  },
  joint(comp, ctx) {
    const near = ctx.mech.some(c => c.type === 'shaft' && ctx.dist(ctx.center(comp), ctx.center(c)) < 3);
    return near ? { s: 'ok', m: 'Absorbing angular misalignment between shafts.' } : { s: 'warn', m: 'Missing link — connect two shafts.' };
  },
  motorMount(comp, ctx) {
    const near = ctx.mech.some(c => c.type === 'shaft' && ctx.dist(ctx.center(comp), ctx.center(c)) < 3) ||
      ctx.electronic.some(c => ['motor', 'servo'].includes(c.type) && ctx.dist(ctx.center(comp), ctx.center(c)) < 3);
    return near ? { s: 'ok', m: 'Secured — motor held in precise alignment.' } : { s: 'warn', m: 'Empty — mount a motor here.' };
  },
  leadScrew(comp, ctx) {
    const near = ctx.electronic.some(c => c.type === 'motor' && ctx.dist(ctx.center(comp), ctx.center(c)) < 4);
    return near ? { s: 'ok', m: 'Driven — converting rotation into precise linear travel.' } : { s: 'warn', m: 'Idle — couple it to a motor.' };
  }
};

/* ---------- main entry ---------- */
export function simulate(components, wires) {
  const { nets, netOf } = buildNets(components, wires);
  const { props, powered, grounded, graph } = netProps(nets, netOf, components);

  // global short detection
  let short = false;
  for (const c of components) {
    if (c.type !== 'battery') continue;
    const p = netOf(c.id + ':+'), m = netOf(c.id + ':-');
    if (p != null && p === m) short = true;
  }

  const ctx = {
    components, nets, netOf, props, short,
    powered, grounded, graph,
    mech: components.filter(c => getAsset(c.type) && getAsset(c.type).cat === 'mechanical'),
    electronic: components.filter(c => getAsset(c.type) && getAsset(c.type).cat === 'electronics'),
    center: compCenter,
    dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); },
    /* polarity of one pin: is its net reachable from battery +/−,
       ignoring this component's own edges (so a loop doesn't
       mark both sides as both power and ground).                */
    pinPolarity(comp, pinId) {
      const others = this.components.filter(c => c.id !== comp.id);
      const g = buildNetGraph(others, this.netOf);
      const r = this.netOf(comp.id + ':' + pinId);
      if (r == null) return { isPower: false, isGnd: false, connected: false };
      const pr = reachFrom(g, powerRootsOf(others, this.netOf));
      const gr = reachFrom(g, gndRootsOf(others, this.netOf));
      return { isPower: pr.has(r), isGnd: gr.has(r), connected: true };
    },
    twoPin(comp, okMsg, noMsg) {
      const [a, b] = this.netPair(comp);
      if (a == null || b == null) return { s: 'warn', m: noMsg || 'Both pins must be wired.' };
      if (a === b) return { s: 'fail', m: 'Pins wired together (short).' };
      return { s: 'ok', m: okMsg || 'Connected in the circuit.' };
    },
    netPair(comp) {
      const a = getAsset(comp.type);
      if (!a || !a.pins) return [null, null];
      const first = a.pins[0], second = a.pins[1];
      return [netOf(comp.id + ':' + first.id), netOf(comp.id + ':' + second.id)];
    }
  };

  const results = [];
  for (const c of components) {
    const a = getAsset(c.type);
    if (!a) continue;
    const validator = a.cat === 'mechanical' ? M[a.sim] : E[a.sim];
    if (!validator) { results.push({ comp: c, s: 'warn', m: 'No validator for ' + c.type }); continue; }
    try {
      const r = validator(c, ctx);
      results.push({ comp: c, s: r.s, m: r.m });
    } catch (err) {
      results.push({ comp: c, s: 'warn', m: 'Validation error: ' + err.message });
    }
  }

  const counts = { ok: 0, warn: 0, fail: 0 };
  for (const r of results) counts[r.s] = (counts[r.s] || 0) + 1;

  let verdict;
  if (short) verdict = 'SHORT CIRCUIT — the battery is directly shorted. Device UNSAFE.';
  else if (counts.fail > 0) verdict = 'DEVICE FAULTY — ' + counts.fail + ' critical fault(s). It will not work correctly.';
  else if (counts.warn > 0) verdict = 'DEVICE PARTIAL — works but ' + counts.warn + ' warning(s) to fix.';
  else verdict = 'DEVICE OPERATIONAL — everything checks out. Build looks good!';

  return { results, counts, verdict, short };
}
