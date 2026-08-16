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
import { DesignStudio } from './studio.js';

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
const panelTitleEl = document.getElementById('panel-title');
const panelTabsEl = document.getElementById('panel-tabs');
const ptabBtns = document.querySelectorAll('[data-ptab]');
const modeTabs = document.querySelectorAll('[data-mode]');
const catTabs = document.querySelectorAll('[data-cat]');
const toolTabs = document.querySelectorAll('[data-tool]');
const btnSimulate = document.getElementById('btn-simulate');
const btnExample = document.getElementById('btn-example');
const btnClear = document.getElementById('btn-clear');
const btnSnap = document.getElementById('btn-snap');
const btnSnap1 = document.getElementById('btn-snap1');
const btnSnap05 = document.getElementById('btn-snap05');
const studioHint = document.getElementById('studio-hint');
const studioBtns = document.querySelectorAll('[data-studio-tool]');
const btnStDesc = document.getElementById('btn-st-desc');

/* ================= CREATOR LAB ================= */
const lab = new CreatorLab(workbenchEl);
let currentCat = 'electronics';
let selectedAsset = null;
let currentPtab = 'assets';

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

const VIEWER_MOUSE = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
const STUDIO_MOUSE = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };

/* grid floor */
const grid = new THREE.GridHelper(40, 40, 0x00e5ff, 0x0a4a5e);
grid.material.transparent = true;
grid.material.opacity = 0.18;
scene.add(grid);

const studio = new DesignStudio({ scene, canvas: renderer.domElement, camera, grid });
studio.callbacks.onSelect = sel => {
  if (currentPtab === 'props' && document.body.dataset.mode === 'studio') renderProperties();
  if (sel) logSys('SELECTED: ' + sel.name + ' (' + sel.type + ')');
};
studio.callbacks.onChange = () => {
  if (currentPtab === 'outliner' && document.body.dataset.mode === 'studio') renderOutliner();
  if (currentPtab === 'props' && document.body.dataset.mode === 'studio' && studio.selected) renderProperties();
};
studio.callbacks.onLog = (m, cls) => cls === 'sys' ? logSys(m) : log(m, 'log-dim');

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

  if (/(3d design studio|design studio|studio|blender|3d editor|3d workbench|design mode)/.test(t)) {
    setMode('studio');
    return;
  }

  if (/(simulate|run sim|test circuit|does it work|will it work|run the sim)/.test(t)) {
    if (document.body.dataset.mode === 'creator') runCreatorSim();
    else if (document.body.dataset.mode === 'studio') runStudioSim();
    else { setMode('creator'); runCreatorSim(); }
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
  log('studio / 3d design studio ........... open the Blender-style 3D editor', 'log-dim');
  log('simulate / does it work ............. run the workbench/studio simulator', 'log-dim');
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
  if (document.body.dataset.mode === 'studio') return;
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
  if (document.body.dataset.mode === 'studio') return;
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

/* ================= CREATOR LAB / STUDIO UI ================= */
const MODE_LABEL = {
  viewer: '◈ COMPONENT REGISTRY',
  creator: '◈ ASSET LIBRARY',
  studio: '◈ DESIGN STUDIO'
};

function setMode(mode) {
  document.body.dataset.mode = mode;
  renderer.domElement.hidden = mode === 'creator';
  workbenchEl.hidden = mode !== 'creator';
  labResults.hidden = true;
  const hint = viewport.querySelector('.lab-hint');
  if (hint) hint.style.display = mode === 'creator' ? '' : 'none';
  for (const b of modeTabs) b.classList.toggle('active', b.dataset.mode === mode);

  if (mode === 'studio') studio.enter(); else studio.exit();
  controls.mouseButtons = mode === 'studio' ? STUDIO_MOUSE : VIEWER_MOUSE;

  panelTabsEl.hidden = mode !== 'studio';
  panelTitleEl.textContent = MODE_LABEL[mode];

  if (mode === 'creator') {
    renderPalette(currentCat);
    lab.render();
  } else if (mode === 'studio') {
    currentPtab = 'assets';
    for (const b of ptabBtns) b.classList.toggle('active', b.dataset.ptab === 'assets');
    renderStudioTab();
    studioHint.textContent = studioHintText();
  } else {
    renderPanel();
    requestAnimationFrame(() => {
      camera.aspect = viewport.clientWidth / viewport.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    });
  }
  const modeMsg = {
    viewer: 'HOLO VIEWER — click a part to inspect it',
    creator: 'CREATOR LAB — pick an asset, place it, wire pins, press SIMULATE',
    studio: '3D DESIGN STUDIO — pick an asset, PLACE it, then MOVE / ROTATE / SCALE / WIRE — orbit with MIDDLE mouse'
  }[mode];
  logSys('MODE: ' + modeMsg);
}

function studioHintText() {
  switch (studio.tool) {
    case 'place': return 'PLACE — ' + (studio.assetId ? 'click the grid to drop ' + getAsset(studio.assetId).name : 'pick an asset from the library first');
    case 'wire': return 'WIRE — click pin A, then click pin B to connect';
    case 'move': return 'MOVE — drag the object (snaps to grid when SNAP is on)';
    case 'rotate': return 'ROTATE — drag to spin around Y (15° snap when on)';
    case 'scale': return 'SCALE — drag to resize (0.1 snap when on)';
    case 'delete': return 'DELETE — click an object or wire to remove it';
    default: return 'SELECT — left-click an object · orbit with MIDDLE mouse · scroll to zoom';
  }
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
      if (document.body.dataset.mode === 'studio') {
        studio.setAsset(a.id);
        studioHint.textContent = studioHintText();
      } else {
        lab.setAsset(a.id);
      }
      logSys('ASSET SELECTED: ' + a.name + ' — click the grid/workplane to place it.');
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

/* ---------- simulation results (shared by creator lab + studio) ---------- */
function showSimResults({ results, counts, verdict }) {
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

function runCreatorSim() {
  if (!lab.components.length) { logWarn('Workbench is empty — place some assets first.'); return; }
  showSimResults(lab.simulateNow());
}
function runStudioSim() {
  if (!studio.objects.length) { logWarn('Studio scene is empty — place some assets first.'); return; }
  showSimResults(studio.simulateNow());
}

/* ---------- studio panel tabs ---------- */
function renderStudioTab() {
  if (currentPtab === 'assets') renderPalette(currentCat);
  else if (currentPtab === 'outliner') renderOutliner();
  else renderProperties();
}

function renderOutliner() {
  partListEl.innerHTML = '';
  panelCount.textContent = studio.objects.length + ' OBJECTS';
  legendEl.innerHTML = '';
  if (!studio.objects.length) {
    partListEl.innerHTML = '<div class="outline-empty">No objects placed yet. Pick an asset and use PLACE.</div>';
    return;
  }
  for (const o of studio.objects) {
    const row = document.createElement('div');
    row.className = 'outline-row' + (studio.selected && studio.selected.id === o.id ? ' sel' : '');
    row.innerHTML =
      '<span class="o-dot" style="background:#' + o.color.toString(16).padStart(6, '0') + '"></span>' +
      '<span class="o-name">' + o.label + '</span>' +
      '<span class="o-type">' + o.type.toUpperCase() + '</span>' +
      '<span class="o-del">✕</span>';
    row.addEventListener('click', () => studio.select(o.id));
    row.querySelector('.o-del').addEventListener('click', ev => { ev.stopPropagation(); studio.removeObject(o.id); });
    partListEl.appendChild(row);
  }
}

function renderProperties() {
  partListEl.innerHTML = '';
  panelCount.textContent = '';
  legendEl.innerHTML = '';
  const o = studio.selected;
  if (!o) {
    partListEl.innerHTML = '<div class="props-empty">Select an object in the viewport or the OUTLINER tab to edit its properties.</div>';
    return;
  }
  const a = getAsset(o.type);
  partListEl.innerHTML =
    '<div class="props-box">' +
      '<div class="prop-group"><div class="prop-title">OBJECT · ' + o.name + '</div>' +
        '<div class="prop-row"><label>POS X</label><input type="number" step="0.5" id="pr-x" value="' + o.pos.x + '"></div>' +
        '<div class="prop-row"><label>POS Z</label><input type="number" step="0.5" id="pr-z" value="' + o.pos.z + '"></div>' +
        '<div class="prop-row"><label>POS Y</label><input type="number" step="0.25" id="pr-y" value="' + o.pos.y + '"></div>' +
        '<div class="prop-row"><label>ROT X</label><input type="number" step="15" id="pr-rx" value="' + o.rot.x + '"></div>' +
        '<div class="prop-row"><label>ROT Y</label><input type="number" step="15" id="pr-ry" value="' + o.rot.y + '"></div>' +
        '<div class="prop-row"><label>ROT Z</label><input type="number" step="15" id="pr-rz" value="' + o.rot.z + '"></div>' +
        '<div class="prop-row"><label>SCALE</label><input type="number" step="0.1" id="pr-s" value="' + o.scale + '"></div>' +
      '</div>' +
      '<div class="prop-group"><div class="prop-title">APPEARANCE</div>' +
        '<div class="prop-row"><label>COLOR</label><input type="color" id="pr-color" value="#' + o.color.toString(16).padStart(6, '0') + '"></div>' +
        '<div class="prop-row"><label>OPACITY</label><input type="range" id="pr-op" min="0.15" max="1" step="0.05" value="' + o.opacity + '"></div>' +
        '<div class="prop-row"><label>LABEL</label><input type="text" id="pr-label" value="' + o.label + '"></div>' +
        '<div class="prop-buttons"><button id="pr-reset">RESET COLOR</button></div>' +
      '</div>' +
      '<div class="prop-group"><div class="prop-title">DOCUMENTATION</div>' +
        '<div class="asset-info" style="margin:0"><div class="ai-desc">' + a.desc + '</div>' +
        '<div class="ai-spec"><strong style="color:var(--cyan)">HOW:</strong> ' + a.how + '</div>' +
        '<div class="ai-spec" style="color:var(--amber)"><strong>FAILS WHEN:</strong> ' + a.fail + '</div></div>' +
      '</div>' +
    '</div>';
  const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('input', fn); };
  bind('pr-x', e => { o.pos.x = parseFloat(e.target.value) || 0; studio.applyTransform(o); });
  bind('pr-z', e => { o.pos.z = parseFloat(e.target.value) || 0; studio.applyTransform(o); });
  bind('pr-y', e => { o.pos.y = parseFloat(e.target.value) || 0; studio.applyTransform(o); });
  bind('pr-rx', e => { o.rot.x = parseFloat(e.target.value) || 0; studio.applyTransform(o); });
  bind('pr-ry', e => { o.rot.y = parseFloat(e.target.value) || 0; studio.applyTransform(o); });
  bind('pr-rz', e => { o.rot.z = parseFloat(e.target.value) || 0; studio.applyTransform(o); });
  bind('pr-s', e => { o.scale = Math.max(0.1, parseFloat(e.target.value) || 1); studio.applyTransform(o); });
  bind('pr-color', e => studio.setColor(o, e.target.value));
  bind('pr-op', e => studio.setOpacity(o, parseFloat(e.target.value)));
  bind('pr-label', e => studio.setLabel(o, e.target.value || o.name));
  const reset = document.getElementById('pr-reset');
  if (reset) reset.addEventListener('click', () => studio.setColor(o, o.cat === 'mechanical' ? '#ffb300' : '#00e5ff'));
}

function wireToolbar() {
  for (const b of modeTabs) b.addEventListener('click', () => setMode(b.dataset.mode));
  for (const b of catTabs) {
    b.addEventListener('click', () => {
      currentCat = b.dataset.cat;
      for (const x of catTabs) x.classList.toggle('active', x === b);
      selectedAsset = null;
      renderPalette(currentCat);
      if (document.body.dataset.mode === 'studio') studioHint.textContent = studioHintText();
    });
  }
  for (const b of toolTabs) {
    b.addEventListener('click', () => {
      for (const x of toolTabs) x.classList.toggle('active', x === b);
      lab.setTool(b.dataset.tool);
      logSys('TOOL: ' + b.dataset.tool.toUpperCase() + ' — ' + lab._hintText());
    });
  }
  for (const b of studioBtns) {
    b.addEventListener('click', () => {
      for (const x of studioBtns) x.classList.toggle('active', x === b);
      studio.setTool(b.dataset.studioTool);
      studioHint.textContent = studioHintText();
      logSys('STUDIO TOOL: ' + b.dataset.studioTool.toUpperCase());
    });
  }
  btnSnap.addEventListener('click', () => {
    studio.setSnap(!studio.snap, studio.snapSize);
    btnSnap.textContent = studio.snap ? 'SNAP ON' : 'SNAP OFF';
    btnSnap.classList.toggle('active', studio.snap);
    logSys('GRID SNAP: ' + (studio.snap ? 'ON (' + studio.snapSize + ')' : 'OFF'));
  });
  const setSnapSize = (v, btn) => {
    studio.setSnap(studio.snap, v);
    for (const b of [btnSnap1, btnSnap05]) b.classList.toggle('active', b === btn);
    logSys('SNAP SIZE: ' + v);
  };
  btnSnap1.addEventListener('click', () => setSnapSize(1, btnSnap1));
  btnSnap05.addEventListener('click', () => setSnapSize(0.5, btnSnap05));
  btnStDesc.addEventListener('click', () => {
    if (studio.selected) showAssetInfo(getAsset(studio.selected.type));
    else logWarn('Select an object first.');
  });
  for (const b of ptabBtns) {
    b.addEventListener('click', () => {
      currentPtab = b.dataset.ptab;
      for (const x of ptabBtns) x.classList.toggle('active', x === b);
      renderStudioTab();
    });
  }
  btnSimulate.addEventListener('click', () => {
    if (document.body.dataset.mode === 'studio') runStudioSim(); else runCreatorSim();
  });
  btnExample.addEventListener('click', () => {
    const order = ['working', 'broken', 'motor', 'mech'];
    if (document.body.dataset.mode === 'studio') {
      const idx = order.indexOf(studio.lastExample || 'working');
      studio.lastExample = order[(idx + 1) % order.length];
      const ex = studio.loadExample(studio.lastExample);
      logSys('EXAMPLE LOADED: ' + studio.lastExample.toUpperCase() + ' — ' + ex.components + ' parts, ' + ex.wires + ' wires. Press SIMULATE.');
    } else {
      const idx = order.indexOf(lab.lastExample || 'working');
      lab.lastExample = order[(idx + 1) % order.length];
      const ex = lab.loadExample(lab.lastExample);
      logSys('EXAMPLE LOADED: ' + lab.lastExample.toUpperCase() + ' — ' + ex.components + ' parts, ' + ex.wires + ' wires. Press SIMULATE.');
    }
  });
  btnClear.addEventListener('click', () => {
    if (document.body.dataset.mode === 'studio') { studio.clear(); logSys('STUDIO SCENE CLEARED.'); }
    else { lab.clear(); logSys('WORKBENCH CLEARED.'); }
    labResults.hidden = true;
  });
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (document.body.dataset.mode === 'studio') {
      if (studio.pendingWire) { studio.pendingWire = null; logSys('Wire selection cleared.'); }
      else if (studio.assetId) { studio.setAsset(null); selectedAsset = null; if (currentPtab === 'assets') renderPalette(currentCat); }
      else if (studio.selected) studio.select(null);
    } else {
      if (lab.pendingPin) { lab.pendingPin = null; lab.render(); }
      else if (document.body.dataset.mode === 'creator') { selectedAsset = null; lab.setAsset(null); renderPalette(currentCat); logSys('Selection cleared.'); }
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
  const m = location.hash.indexOf('studio') >= 0 ? 'studio'
    : location.hash.indexOf('creator') >= 0 ? 'creator' : 'viewer';
  setMode(m);
  if (m === 'creator') {
    lab.loadExample('working');
    runCreatorSim();
  } else if (m === 'studio') {
    studio.loadExample('working');
    runStudioSim();
  }
  animate();
}

start();
