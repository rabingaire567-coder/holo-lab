/* ============================================================
   HOLO·LAB — Main Application
   ------------------------------------------------------------
   Scene setup · 3D hologram render · command parser ·
   impact simulation · component registry UI · console log
   ============================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildAssembly, HOLO_COLOR, setPartState } from './models.js';
import {
  cloneModelState, computeState, partStatus, describeFailure, getModel
} from './parts.js';
import { ASSETS, getAsset, iconSvg } from './assets.js';
import { CreatorLab } from './workbench.js';

/* ================= DOM ================= */
const viewport = document.getElementById('viewport');
const consoleLog = document.getElementById('console-log');
const consoleForm = document.getElementById('console-form');
const consoleText = document.getElementById('console-text');
const partListEl = document.getElementById('part-list');
const panelCount = document.getElementById('panel-count');
const modelNameEl = document.getElementById('model-name');
const sysStateEl = document.getElementById('sys-state');
const infoPopup = document.getElementById('info-popup');
const quickActionsEl = document.getElementById('quick-actions');
const legendEl = document.getElementById('legend');
const workbenchEl = document.getElementById('workbench');
const labResults = document.getElementById('lab-results');
const panelHeaderLabel = document.querySelector('.panel-header > span');
const modeTabs = document.querySelectorAll('[data-mode]');
const catTabs = document.querySelectorAll('[data-cat]');
const toolTabs = document.querySelectorAll('[data-tool]');
const btnSimulate = document.getElementById('btn-simulate');
const btnExample = document.getElementById('btn-example');
const btnClear = document.getElementById('btn-clear');

/* ================= CREATOR LAB ================= */
const lab = new CreatorLab(workbenchEl);
let currentCat = 'electronics';
let selectedAsset = null;

/* ================= 3D SCENE ================= */
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x04070d, 0.011);

const camera = new THREE.PerspectiveCamera(50, viewport.clientWidth / viewport.clientHeight, 0.1, 200);
camera.position.set(0, 13, 20);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 1, 0);
controls.maxPolarAngle = Math.PI * 0.55;
controls.minDistance = 6;
controls.maxDistance = 45;

/* grid floor */
const grid = new THREE.GridHelper(40, 40, 0x00e5ff, 0x0a4a5e);
grid.material.transparent = true;
grid.material.opacity = 0.18;
scene.add(grid);

/* floating particles */
const pGeo = new THREE.BufferGeometry();
const pCount = 600;
const pPos = new Float32Array(pCount * 3);
for (let i = 0; i < pCount; i++) {
  pPos[i * 3] = (Math.random() - 0.5) * 80;
  pPos[i * 3 + 1] = Math.random() * 30;
  pPos[i * 3 + 2] = (Math.random() - 0.5) * 80;
}
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const pMat = new THREE.PointsMaterial({
  color: HOLO_COLOR, size: 0.08, transparent: true, opacity: 0.5,
  blending: THREE.AdditiveBlending, depthWrite: false
});
const particles = new THREE.Points(pGeo, pMat);
scene.add(particles);

/* rotating emitter ring under the board */
const ringGeo = new THREE.RingGeometry(6.5, 6.7, 64);
const ringMat = new THREE.MeshBasicMaterial({
  color: HOLO_COLOR, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending, depthWrite: false
});
const emitter = new THREE.Mesh(ringGeo, ringMat);
emitter.rotation.x = -Math.PI / 2;
emitter.position.y = -0.1;
scene.add(emitter);

const ringGeo2 = new THREE.RingGeometry(9.4, 9.55, 64);
const ringMat2 = new THREE.MeshBasicMaterial({
  color: 0x005577, transparent: true, opacity: 0.25, side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending, depthWrite: false
});
const emitter2 = new THREE.Mesh(ringGeo2, ringMat2);
emitter2.rotation.x = -Math.PI / 2;
emitter2.position.y = -0.12;
scene.add(emitter2);

/* ================= STATE ================= */
let modelId = 'electronics';
let state = null;
let assemblyGroup = null;
let partGroups = {};
let built = false;

function boot() {
  state = cloneModelState(modelId);
  computeState(state);
  buildHologram();
  renderPanel();
  sysStateEl.textContent = 'ONLINE';
  modelNameEl.textContent = getModel(modelId).name;
  logOk('HOLO·LAB initialized. Type "help" to see available commands.');
  logSys('Try: create electronics model');
}

function buildHologram() {
  if (assemblyGroup) {
    scene.remove(assemblyGroup);
    disposeGroup(assemblyGroup);
  }
  const model = getModel(modelId);
  const tracePoints = [
    ['battery', 'switch'], ['switch', 'resistor'], ['resistor', 'led'],
    ['resistor', 'capacitor'], ['transistor', 'led'], ['mcu', 'transistor'],
    ['mcu', 'ic'], ['ic', 'speaker'], ['battery', 'transformer'],
    ['transformer', 'diode'], ['diode', 'ic']
  ];
  const { group, partGroups: pg } = buildAssembly(model.parts, tracePoints);
  assemblyGroup = group;
  partGroups = pg;
  scene.add(group);
  sync3D();
  built = true;
  logOk('Holographic model generated: ' + model.name);
  logSys(model.tagline);
}

function disposeGroup(g) {
  g.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
}

/* ================= 3D STATE SYNC ================= */
function sync3D() {
  for (const p of state.parts) {
    const g = partGroups[p.id];
    if (!g) continue;
    const st = partStatus(p);
    setPartState(g, st.cls);
  }
}

/* ================= IMPACT ENGINE ================= */
function removePart(partId) {
  const p = state.parts.find(x => x.id === partId);
  if (!p) return false;
  if (p.structural) {
    logWarn('[' + p.name.toUpperCase() + '] is structural. It cannot be removed without dismantling the assembly.');
    return false;
  }
  if (p.removed) {
    logWarn(p.name + ' is already removed.');
    return false;
  }
  p.removed = true;
  computeState(state);
  logErr('REMOVED: ' + p.name.toUpperCase());
  logErr('   IMPACT > ' + p.impactMessage);
  for (const f of state.parts) {
    if (f.removed || f.id === partId) continue;
    if (f.failures.length) {
      logWarn('   ! ' + f.name + ' -> ' + f.failures.map(describeFailure).join(' + '));
    }
  }
  sync3D();
  renderPanel();
  sysStateEl.textContent = 'IMPACT ANALYZED';
  setTimeout(() => { sysStateEl.textContent = 'ONLINE'; }, 3000);
  return true;
}

function restorePart(partId) {
  const p = state.parts.find(x => x.id === partId);
  if (!p) return false;
  if (!p.removed) {
    logWarn(p.name + ' is already present.');
    return false;
  }
  p.removed = false;
  computeState(state);
  logOk('RESTORED: ' + p.name + ' — re-integrated into the assembly.');
  const stillBad = state.parts.filter(x => !x.removed && x.failures.length);
  if (stillBad.length) {
    logWarn('   Downstream parts still degraded: ' + stillBad.map(x => x.name + ' (' + x.failures.map(describeFailure).join('+') + ')').join(', '));
  } else {
    logOk('   All systems nominal.');
  }
  sync3D();
  renderPanel();
  return true;
}

function resetModel() {
  state = cloneModelState(modelId);
  computeState(state);
  buildHologram();
  renderPanel();
  logOk('MODEL RESET — all components restored to active state.');
}

function dryRunImpact(partId) {
  const p = state.parts.find(x => x.id === partId);
  if (!p) return;
  if (p.structural) {
    logWarn('SIMULATION: ' + p.name + ' is structural — cannot be removed. No cascade.');
    return;
  }
  logSys('SIMULATING REMOVAL OF: ' + p.name.toUpperCase());
  logWarn('   ' + p.impactMessage);
  for (const a of p.affected) {
    const t = state.parts.find(x => x.id === a.part);
    if (t && !t.removed) {
      logWarn('   > ' + t.name + ' [' + describeFailure({ mode: a.mode }) + ']');
    }
  }
  logSys('Simulation complete. Use "remove ' + p.id + '" to apply it for real.');
}

/* ================= COMMAND PARSER ================= */
const ALIASES = {
  battery: ['battery', 'power cell', 'powercell', 'power source', 'cell', 'power'],
  switch: ['switch', 'toggle switch', 'toggle'],
  resistor: ['resistor', 'resistance'],
  capacitor: ['capacitor', 'cap'],
  diode: ['diode'],
  transistor: ['transistor'],
  led: ['led', 'light', 'indicator', 'lamp', 'light emitting diode'],
  ic: ['ic', 'chip', 'op amp', 'opamp', 'op-amp', 'amplifier'],
  mcu: ['mcu', 'microcontroller', 'micro controller', 'controller', 'brain', 'arduino', 'processor'],
  transformer: ['transformer', 'coil'],
  speaker: ['speaker', 'buzzer', 'audio', 'sound'],
  pcb: ['pcb', 'board', 'circuit board', 'chassis', 'housing', 'substrate', 'case']
};

function matchPart(text) {
  const words = text.toLowerCase();
  for (const [id, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      if (words.includes(n)) return id;
    }
  }
  return null;
}

function isModelCommand(text) {
  return /(create|build|make|generate|start|new|show|open|load|model|launch)\b/.test(text) &&
         /(electronic|circuit|board|device|hardware|assembly|components)/.test(text);
}

function handleCommand(raw) {
  const text = raw.trim();
  const t = text.toLowerCase();

  if (!text) return;

  if (/(creator|workbench|builder|build circuit|drawing board)/.test(t)) {
    setMode('creator');
    return;
  }

  if (/(simulate|run sim|test circuit|does it work|will it work|run the sim)/.test(t)) {
    if (document.body.dataset.mode !== 'creator') setMode('creator');
    runCreatorSim();
    return;
  }

  if (/(load example|example circuit|example project|show me a circuit)/.test(t)) {
    setMode('creator');
    lab.loadExample('working');
    logSys('WORKING EXAMPLE LOADED — battery > resistor > LED circuit. Press SIMULATE.');
    return;
  }

  if (isModelCommand(t)) {
    if (state && built) {
      logSys('Model "' + getModel(modelId).name + '" is already loaded. Use "reset model" to rebuild from scratch.');
      return;
    }
    bootModel();
    return;
  }

  if (/(help|commands|what can you do|usage)/.test(t)) {
    showHelp();
    return;
  }

  if (/(reset|rebuild|restore all|reboot)/.test(t)) {
    resetModel();
    return;
  }

  if (/(show|list|what parts|parts list|registry|inventory)/.test(t)) {
    listParts();
    return;
  }

  if (/(what if|simulate|simulation|what happens|impact of|if i remove)/.test(t) && /(remove|delete|take out|missing)/.test(t)) {
    const id = matchPart(t);
    if (id) dryRunImpact(id);
    else logWarn('Which part should I simulate? e.g. "what if i remove battery"');
    return;
  }

  if (/(remove|delete|take out|dismantle|disconnect)/.test(t)) {
    const id = matchPart(t);
    if (id) removePart(id);
    else logWarn('No matching component in that command. Try: remove resistor / remove capacitor / remove led');
    return;
  }

  if (/(add|restore|put back|reinstall|bring back|replace)/.test(t)) {
    const id = matchPart(t);
    if (id) restorePart(id);
    else logWarn('No matching component in that command. Try: add resistor / restore capacitor');
    return;
  }

  if (/(inspect|explain|info|about|describe|what is|details)/.test(t)) {
    const id = matchPart(t);
    if (id) showPartInfo(id);
    else logWarn('Which part? e.g. "inspect capacitor" or "what is a transistor"');
    return;
  }

  if (/(expand|roadmap|future|next|upgrade|add model)/.test(t)) {
    showRoadmap();
    return;
  }

  if (/(housing|enclosure|case design|mechanical)/.test(t)) {
    logSys('In this model the housing is the PCB chassis. The registry is structured so you can add more model domains (mechanical / robotics / housing) — type "roadmap".');
    return;
  }

  logWarn('Command not understood. Type "help" for available commands.');
}

function bootModel() {
  state = cloneModelState(modelId);
  computeState(state);
  buildHologram();
  renderPanel();
  modelNameEl.textContent = getModel(modelId).name;
  sysStateEl.textContent = 'MODEL ACTIVE';
  setTimeout(() => { sysStateEl.textContent = 'ONLINE'; }, 3000);
}

/* ================= UI HELPERS ================= */
function log(msg, cls) {
  const line = document.createElement('div');
  line.className = 'log-line ' + cls;
  const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
  line.innerHTML = '<span class="log-time">[' + time + ']</span>' + msg;
  consoleLog.appendChild(line);
  consoleLog.scrollTop = consoleLog.scrollHeight;
}
const logSys = m => log('<span class="log-sys">SYS</span> ' + m, 'log-sys');
const logOk = m => log('<span class="log-sys">OK</span> ' + m, 'log-ok');
const logWarn = m => log('<span class="log-sys">!</span> ' + m, 'log-warn');
const logErr = m => log('<span class="log-sys">X</span> ' + m, 'log-err');
const logUser = m => log(m, 'log-user');

function showHelp() {
  logSys('--- COMMAND REFERENCE ---');
  log('create electronics model .......... build the 3D hologram assembly', 'log-dim');
  log('remove <part> ....................... remove a part & analyze impact', 'log-dim');
  log('add / restore <part> ................ re-integrate a part', 'log-dim');
  log('what if i remove <part> ............. dry-run impact simulation', 'log-dim');
  log('inspect / explain <part> ............ learn how that part works', 'log-dim');
  log('show parts .......................... list component registry', 'log-dim');
  log('reset model ......................... restore all components', 'log-dim');
  log('creator / workbench ................. open the Engineering Creator Lab', 'log-dim');
  log('simulate / does it work ............. run the workbench circuit simulator', 'log-dim');
  log('load example / build circuit ........ load a working example circuit', 'log-dim');
  log('roadmap / expand .................... future model domains', 'log-dim');
  log('parts: battery switch resistor capacitor diode transistor led ic mcu transformer speaker pcb', 'log-dim');
}

function listParts() {
  logSys('--- COMPONENT REGISTRY ---');
  for (const p of state.parts) {
    const st = partStatus(p);
    const mark = st.cls === 'active' ? 'O' : st.cls === 'degraded' ? '!' : 'X';
    log((st.cls === 'removed' ? '<span class="log-err">' : st.cls === 'degraded' ? '<span class="log-warn">' : '<span class="log-ok">') + mark + '</span> ' + p.name + '  -- ' + st.label, 'log-sys');
  }
}

function showPartInfo(id) {
  const p = state.parts.find(x => x.id === id);
  if (!p) return;
  const st = partStatus(p);
  logSys('--- ' + p.name.toUpperCase() + ' [' + p.category + '] ---');
  log(p.description, 'log-dim');
  log('HOW IT WORKS > ' + p.howItWorks, 'log-sys');
  if (p.removed) logErr('STATUS: REMOVED. ' + p.impactMessage);
  else if (p.failures.length) logWarn('STATUS: DEGRADED -> ' + p.failures.map(f => {
    const src = state.parts.find(x => x.id === f.source);
    return (src ? src.name : f.source) + ' removed; ' + describeFailure(f);
  }).join('; '));
  else logOk('STATUS: ACTIVE');
  renderInfoPopup(p);
}

function showRoadmap() {
  logSys('--- ROADMAP: EXPANDABLE MODEL DOMAINS ---');
  log('The registry (js/parts.js) is data-driven. New domains slot in without touching the 3D engine:', 'log-dim');
  log('  MODELS.robotics    -> servos, motors, encoders, joints', 'log-dim');
  log('  MODELS.housing     -> enclosures, fasteners, thermal shells', 'log-dim');
  log('  MODELS.mechanical  -> gears, shafts, linkages, actuators', 'log-dim');
  log('To add one: append a new entry to MODELS, give each part an id/category/description/howItWorks/impactMessage/affected, then add a geometry builder in js/models.js.', 'log-sys');
}

/* ================= PANEL RENDER ================= */
function renderPanel() {
  partListEl.innerHTML = '';
  let active = 0, deg = 0, rem = 0;
  for (const p of state.parts) {
    const st = partStatus(p);
    if (st.cls === 'active') active++;
    else if (st.cls === 'degraded') deg++;
    else rem++;

    const card = document.createElement('div');
    card.className = 'part-card ' + st.cls;
    card.dataset.id = p.id;

    let statusText = st.label;
    if (p.failures.length) {
      statusText += ' - ' + p.failures.map(describeFailure).join(' + ');
    }

    card.innerHTML =
      '<div class="part-card-head">' +
        '<span class="part-dot"></span>' +
        '<span class="part-name">' + p.name + '</span>' +
        '<span class="part-status">' + statusText + '</span>' +
      '</div>' +
      '<div class="part-cat">' + p.category + '</div>' +
      '<div class="part-card-body">' +
        '<div class="p"><strong>WHAT IT DOES</strong><br>' + p.description + '</div>' +
        '<div class="p"><strong>HOW IT WORKS</strong><br>' + p.howItWorks + '</div>' +
        '<div class="p impact"><strong>' + (p.removed ? 'REMOVAL IMPACT' : 'IF REMOVED') + '</strong><br>' + p.impactMessage + '</div>' +
      '</div>';

    card.addEventListener('click', () => {
      card.classList.toggle('open');
      showPartInfo(p.id);
    });

    partListEl.appendChild(card);
  }
  panelCount.textContent = active + ' ACTIVE - ' + deg + ' DEGRADED - ' + rem + ' REMOVED';
  legendEl.innerHTML =
    '<span class="dot g"></span>ACTIVE' +
    '<span class="dot a"></span>DEGRADED' +
    '<span class="dot r"></span>REMOVED';
}

/* ================= INFO POPUP ================= */
function renderInfoPopup(p) {
  const st = partStatus(p);
  const failures = p.failures.length
    ? '<div class="p" style="color:var(--amber)"><strong>DEGRADATION</strong><br>' +
      p.failures.map(f => {
        const src = state.parts.find(x => x.id === f.source);
        return '> ' + (src ? src.name : f.source) + ' removed; ' + describeFailure(f);
      }).join('<br>') + '</div>'
    : '';
  infoPopup.innerHTML =
    '<span class="ip-close">X</span>' +
    '<div class="ip-title">' + p.name + '</div>' +
    '<div class="ip-cat">' + p.category + ' | ' + st.cls.toUpperCase() + '</div>' +
    '<div class="ip-body">' +
      '<div class="p"><strong>FUNCTION</strong><br>' + p.description + '</div>' +
      '<div class="p"><strong>MECHANISM</strong><br>' + p.howItWorks + '</div>' +
      failures +
      '<div class="p" style="color:var(--amber)"><strong>IF REMOVED</strong><br>' + p.impactMessage + '</div>' +
    '</div>';
  infoPopup.hidden = false;
  infoPopup.querySelector('.ip-close').addEventListener('click', () => {
    infoPopup.hidden = true;
  });
}

/* ================= RAYCASTING (click parts in 3D) ================= */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function findPartId(obj) {
  let cur = obj;
  while (cur) {
    if (cur.userData && cur.userData.partId) return cur.userData.partId;
    cur = cur.parent;
  }
  return null;
}

function updatePointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

renderer.domElement.addEventListener('click', event => {
  if (event.target !== renderer.domElement) return;
  updatePointer(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(assemblyGroup, true);
  for (const h of hits) {
    const id = findPartId(h.object);
    if (id) {
      const p = state.parts.find(x => x.id === id);
      if (p) { showPartInfo(id); return; }
    }
  }
});

renderer.domElement.addEventListener('mousemove', event => {
  updatePointer(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(assemblyGroup, true);
  const over = hits.some(h => findPartId(h.object));
  renderer.domElement.style.cursor = over ? 'pointer' : 'grab';
});

/* ================= QUICK ACTIONS ================= */
function setupQuickActions() {
  const actions = [
    { label: 'CREATE MODEL', act: () => { if (state && built) logSys('Model already loaded. Use "reset model" to rebuild.'); else bootModel(); } },
    { label: 'WHAT IF I REMOVE LED', act: () => dryRunImpact('led') },
    { label: 'REMOVE RESISTOR', act: () => removePart('resistor'), cls: 'danger' },
    { label: 'REMOVE BATTERY', act: () => removePart('battery'), cls: 'danger' },
    { label: 'RESET MODEL', act: () => resetModel() },
    { label: 'HELP', act: () => showHelp() }
  ];
  quickActionsEl.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = 'qa-btn' + (a.cls ? ' ' + a.cls : '');
    b.textContent = a.label;
    b.addEventListener('click', () => a.act());
    quickActionsEl.appendChild(b);
  }
}

/* ================= CREATOR LAB UI ================= */
function setMode(mode) {
  document.body.dataset.mode = mode;
  renderer.domElement.hidden = mode === 'creator';
  workbenchEl.hidden = mode !== 'creator';
  labResults.hidden = true;
  const hint = viewport.querySelector('.lab-hint');
  if (hint) hint.style.display = mode === 'creator' ? '' : 'none';
  for (const b of modeTabs) b.classList.toggle('active', b.dataset.mode === mode);
  if (mode === 'creator') {
    panelHeaderLabel.textContent = '◈ ASSET LIBRARY';
    renderPalette(currentCat);
    lab.render();
  } else {
    panelHeaderLabel.textContent = '◈ COMPONENT REGISTRY';
    renderPanel();
    requestAnimationFrame(() => {
      camera.aspect = viewport.clientWidth / viewport.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    });
  }
  logSys('MODE: ' + (mode === 'creator' ? 'CREATOR LAB — pick an asset, place it, wire pins, press SIMULATE' : 'HOLO VIEWER — click a part to inspect it'));
}

function renderPalette(cat) {
  partListEl.innerHTML = '';
  const items = Object.values(ASSETS).filter(a => a.cat === cat);
  panelCount.textContent = items.length + ' ASSETS';
  legendEl.innerHTML = '';
  for (const a of items) {
    const card = document.createElement('div');
    card.className = 'asset-card' + (selectedAsset === a.id ? ' selected' : '');
    const meta = a.cat === 'electronics'
      ? (a.pins ? 'PINS: ' + a.pins.map(p => p.id).join(' · ') : 'NO PINS')
      : (a.attr ? 'ATTR: ' + Object.keys(a.attr).join(' · ') : 'MECHANICAL');
    card.innerHTML =
      '<div class="asset-icon"><svg viewBox="0 0 48 48">' + iconSvg(a.icon) + '</svg></div>' +
      '<div class="asset-meta">' +
        '<div class="am-name">' + a.name + '</div>' +
        '<div class="am-pins">' + meta + '</div>' +
      '</div>';
    card.addEventListener('click', () => {
      selectedAsset = a.id;
      renderPalette(cat);
      showAssetInfo(a);
      lab.setAsset(a.id);
      logSys('ASSET SELECTED: ' + a.name + ' — now click the grid to place it.');
    });
    partListEl.appendChild(card);
  }
}

function showAssetInfo(a) {
  const box = document.createElement('div');
  box.className = 'asset-info';
  box.innerHTML =
    '<div class="ai-name">' + a.name + '</div>' +
    '<div class="ai-cat">' + a.cat.toUpperCase() +
      (a.pins ? ' | PINS: ' + a.pins.map(p => p.id).join(' · ') : '') + '</div>' +
    '<div class="ai-desc">' + a.desc + '</div>' +
    '<div class="ai-spec"><strong style="color:var(--cyan)">HOW IT WORKS:</strong> ' + a.how + '</div>' +
    '<div class="ai-spec" style="color:var(--amber)"><strong>FAILS WHEN:</strong> ' + a.fail + '</div>';
  partListEl.prepend(box);
}

function runCreatorSim() {
  if (!lab.components.length) {
    logWarn('Workbench is empty — place some assets first.');
    return;
  }
  const { results, counts, verdict } = lab.simulateNow();
  const cls = counts.fail ? 'fail' : counts.warn ? 'warn' : 'ok';
  logSys('SIMULATOR: ' + verdict);
  for (const r of results) {
    if (r.s === 'fail') logErr(r.comp.type.toUpperCase() + ': ' + r.m);
    else if (r.s === 'warn') logWarn(r.comp.type.toUpperCase() + ': ' + r.m);
    else logOk(r.comp.type.toUpperCase() + ': ' + r.m);
  }
  labResults.innerHTML = '';
  const close = document.createElement('span');
  close.className = 'lr-close';
  close.textContent = 'X';
  close.addEventListener('click', () => { labResults.hidden = true; });
  const verdictDiv = document.createElement('div');
  verdictDiv.className = 'lr-verdict ' + cls;
  verdictDiv.textContent = verdict;
  const countsDiv = document.createElement('div');
  countsDiv.className = 'lr-counts';
  countsDiv.textContent = counts.fail + ' FAIL · ' + counts.warn + ' WARN · ' + counts.ok + ' OK';
  labResults.appendChild(close);
  labResults.appendChild(verdictDiv);
  labResults.appendChild(countsDiv);
  for (const r of results) {
    const row = document.createElement('div');
    row.className = 'lr-row ' + r.s;
    row.innerHTML = '<span class="lr-tag">' + r.s.toUpperCase() + '</span><span class="lr-name">' + r.comp.type.toUpperCase() + '</span><span class="lr-msg">' + r.m + '</span>';
    labResults.appendChild(row);
  }
  labResults.hidden = false;
  sysStateEl.textContent = counts.fail ? 'DEVICE FAULTY' : counts.warn ? 'PARTIAL FUNCTION' : 'OPERATIONAL';
  setTimeout(() => { sysStateEl.textContent = 'ONLINE'; }, 3000);
}

function wireToolbar() {
  for (const b of modeTabs) b.addEventListener('click', () => setMode(b.dataset.mode));
  for (const b of catTabs) {
    b.addEventListener('click', () => {
      currentCat = b.dataset.cat;
      for (const x of catTabs) x.classList.toggle('active', x === b);
      selectedAsset = null;
      renderPalette(currentCat);
    });
  }
  for (const b of toolTabs) {
    b.addEventListener('click', () => {
      for (const x of toolTabs) x.classList.toggle('active', x === b);
      lab.setTool(b.dataset.tool);
      logSys('TOOL: ' + b.dataset.tool.toUpperCase() + ' — ' + lab._hintText());
    });
  }
  btnSimulate.addEventListener('click', runCreatorSim);
  btnExample.addEventListener('click', () => {
    const order = ['working', 'broken', 'motor', 'mech'];
    const idx = order.indexOf(lab.lastExample || 'working');
    lab.lastExample = order[(idx + 1) % order.length];
    const ex = lab.loadExample(lab.lastExample);
    logSys('EXAMPLE LOADED: ' + lab.lastExample.toUpperCase() + ' — ' + ex.components + ' parts, ' + ex.wires + ' wires. Press SIMULATE.');
  });
  btnClear.addEventListener('click', () => {
    lab.clear();
    labResults.hidden = true;
    logSys('WORKBENCH CLEARED.');
  });
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (lab.pendingPin) {
      lab.pendingPin = null;
      lab.render();
    } else if (document.body.dataset.mode === 'creator') {
      selectedAsset = null;
      lab.setAsset(null);
      renderPalette(currentCat);
      logSys('Selection cleared.');
    }
    labResults.hidden = true;
  });
}

/* ================= EVENTS ================= */
consoleForm.addEventListener('submit', e => {
  e.preventDefault();
  const text = consoleText.value.trim();
  if (!text) return;
  logUser('YOU: ' + text);
  handleCommand(text);
  consoleText.value = '';
});

window.addEventListener('resize', () => {
  camera.aspect = viewport.clientWidth / viewport.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
});

/* ================= ANIMATE ================= */
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  emitter.rotation.z = t * 0.25;
  emitter2.rotation.z = -t * 0.15;
  emitter.material.opacity = 0.25 + Math.sin(t * 1.5) * 0.12;
  particles.rotation.y = t * 0.012;
  if (assemblyGroup) assemblyGroup.rotation.y = t * 0.05;
  controls.update();
  renderer.render(scene, camera);
}

/* ================= BOOT ================= */
function start() {
  wireToolbar();
  setupQuickActions();
  logSys('HOLO·LAB v2.0.0 — Interactive Modeling, Impact Analysis & Engineering Creator Lab.');
  logSys('Awaiting command. Type "help" to see what I can do.');
  boot();
  const m = location.hash.indexOf('creator') >= 0 ? 'creator' : 'viewer';
  setMode(m);
  if (m === 'creator') {
    lab.loadExample('working');
    runCreatorSim();
  }
  animate();
}

start();
