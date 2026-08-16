/* ============================================================
   HOLO·LAB — Component Registry + Impact Engine
   ------------------------------------------------------------
   MODEL DOMAIN: electronics
   To add a NEW model domain (housing, robotics, mechanical...):
   1) Define a new MODELS[x].parts array following the same shape.
   2) The command parser + 3D builder auto-discover it via its id.
   ============================================================ */

export const MODELS = {
  electronics: {
    id: 'electronics',
    name: 'ELECTRONIC CIRCUIT CORE',
    tagline: '12-component power & control board with LED output',
    removeableCore: false, // the PCB itself is structural
    parts: [
      {
        id: 'pcb',
        name: 'Printed Circuit Board',
        category: 'CHASSIS / STRUCTURE',
        structural: true,
        description: 'The physical foundation of the system. Copper traces etched on a fiberglass substrate route every electrical signal between components.',
        howItWorks: 'A thin layer of copper foil is printed with a mask, then acid-etched to leave only the desired conductive paths. Solder pads at each trace end anchor components in place.',
        impactMessage: 'PCB is structural — it cannot be removed without dismantling the whole assembly. Treat it as the "housing" of the circuit.',
        affected: [],
        position: [0, 0.25, 0]
      },
      {
        id: 'battery',
        name: 'Power Cell',
        category: 'POWER SOURCE',
        description: 'Stores chemical energy and converts it into electrical current that drives the entire circuit.',
        howItWorks: 'A chemical reaction between the anode and cathode pushes electrons through the external circuit, creating a voltage differential (electromotive force). This is the energy backbone of the system.',
        impactMessage: 'PRIMARY POWER LOSS — the battery is the only energy source. Without it the entire circuit is dead: no current, no logic, no output. Every downstream component enters NO-POWER state.',
        affected: [
          { part: 'switch', mode: 'no-power' },
          { part: 'capacitor', mode: 'no-power' },
          { part: 'resistor', mode: 'no-power' },
          { part: 'diode', mode: 'no-power' },
          { part: 'transistor', mode: 'no-power' },
          { part: 'led', mode: 'no-power' },
          { part: 'ic', mode: 'no-power' },
          { part: 'mcu', mode: 'no-power' },
          { part: 'transformer', mode: 'no-power' },
          { part: 'speaker', mode: 'no-power' }
        ],
        position: [-6.5, 0.75, 2.6]
      },
      {
        id: 'switch',
        name: 'Toggle Switch',
        category: 'CONTROL',
        description: 'Manually opens or closes the power path, acting as the master gate between the battery and the rest of the circuit.',
        howItWorks: 'A spring-loaded contact bridge physically connects or disconnects two terminals. When closed, current flows; when open, the circuit is interrupted.',
        impactMessage: 'CIRCUIT OPEN — the power path is severed. No current flows past the switch. Components stay intact but the system has no output until the switch is restored.',
        affected: [
          { part: 'led', mode: 'no-control' },
          { part: 'speaker', mode: 'no-signal' }
        ],
        position: [-4.6, 0.55, 3.4]
      },
      {
        id: 'resistor',
        name: 'Current-Limiting Resistor',
        category: 'PASSIVE PROTECTION',
        description: 'Limits the current flowing into the LED, preventing it from exceeding its rated forward current.',
        howItWorks: 'Resistive material converts excess electrical energy into heat, dropping the voltage across its terminals and thereby capping the current (Ohm\u2019s law: I = V / R).',
        impactMessage: 'OVER-CURRENT — without the resistor, nothing limits current into the LED. The LED exceeds its maximum forward current rating and BURNS OUT. The capacitor is also exposed to excess charge stress.',
        affected: [
          { part: 'led', mode: 'burned-out' },
          { part: 'capacitor', mode: 'over-voltage' }
        ],
        position: [-2.8, 0.55, 2.6]
      },
      {
        id: 'capacitor',
        name: 'Smoothing Capacitor',
        category: 'PASSIVE FILTER',
        description: 'Stores a small charge reservoir and smooths out voltage ripple from the power source, keeping the supply rail stable.',
        howItWorks: 'Two conductive plates separated by a dielectric store charge proportional to applied voltage. It charges when voltage is high and discharges when it dips, flattening ripple.',
        impactMessage: 'VOLTAGE RIPPLE — without smoothing, the supply rail ripples. The LED flickers and the IC output becomes noisy and unreliable under load.',
        affected: [
          { part: 'led', mode: 'flicker' },
          { part: 'ic', mode: 'noisy' }
        ],
        position: [-1.3, 0.7, 3.3]
      },
      {
        id: 'diode',
        name: 'Rectifier Diode',
        category: 'PROTECTION / RECTIFY',
        description: 'Allows current to flow in only one direction, preventing reverse-polarity damage to sensitive components.',
        howItWorks: 'A p-n junction conducts forward bias and blocks reverse bias. It acts as a one-way valve for electrons.',
        impactMessage: 'REVERSE-POLARITY RISK — without rectification, reverse current can flow back through the supply path and damage sensitive IC and speaker circuitry.',
        affected: [
          { part: 'ic', mode: 'reverse' },
          { part: 'speaker', mode: 'reverse' }
        ],
        position: [0.4, 0.55, 2.6]
      },
      {
        id: 'transistor',
        name: 'Switching Transistor',
        category: 'ACTIVE SWITCH',
        description: 'A tiny electronic switch controlled by the microcontroller that gates the LED on and off with no moving parts.',
        howItWorks: 'A small base current controls a much larger collector-to-emitter current. In cutoff it blocks; in saturation it conducts — giving the MCU a way to drive high-power loads.',
        impactMessage: 'SWITCHING LOST — the transistor is the only component that can gate the LED from the microcontroller logic. The LED is stuck OFF and cannot be driven.',
        affected: [
          { part: 'led', mode: 'no-control' }
        ],
        position: [2.1, 0.55, 2.9]
      },
      {
        id: 'led',
        name: 'Indicator LED',
        category: 'OUTPUT',
        description: 'The primary visual output — a light-emitting diode that glows to show the circuit is alive and switching correctly.',
        howItWorks: 'Electrons recombine with holes in the p-n junction, releasing energy as photons. The band-gap material determines the emitted color.',
        impactMessage: 'NO LIGHT OUTPUT — the circuit loses its only visual feedback. The rest of the system keeps running but you cannot observe it.',
        affected: [],
        position: [2.1, 0.9, 0.4]
      },
      {
        id: 'ic',
        name: 'Op-Amp IC Chip',
        category: 'SIGNAL PROCESSING',
        description: 'An operational-amplifier integrated circuit that conditions and boosts the signals between the microcontroller and the speaker.',
        howItWorks: 'Thousands of transistors etched into a silicon die amplify the voltage difference between its two inputs, multiplying weak logic signals into audio-grade drive.',
        impactMessage: 'SIGNAL CHAIN BROKEN — without the op-amp there is no amplification. The speaker receives no usable drive signal and stays silent; the MCU loses its output stage.',
        affected: [
          { part: 'speaker', mode: 'no-signal' },
          { part: 'mcu', mode: 'no-signal' }
        ],
        position: [5.6, 0.45, 3.0]
      },
      {
        id: 'mcu',
        name: 'Microcontroller',
        category: 'CONTROL / BRAIN',
        description: 'The "brain" of the system — runs a program that sequences the LED, drives the IC, and manages overall timing.',
        howItWorks: 'A CPU core executes stored program instructions from flash memory, reading inputs and toggling output pins at thousands of cycles per second.',
        impactMessage: 'NO INTELLIGENCE — nothing issues control logic. The transistor never gets its gate signal, the IC gets no program, and the system stops behaving intelligently.',
        affected: [
          { part: 'transistor', mode: 'no-control' },
          { part: 'ic', mode: 'no-signal' },
          { part: 'speaker', mode: 'no-signal' }
        ],
        position: [4.6, 0.45, -2.2]
      },
      {
        id: 'transformer',
        name: 'Step-Down Transformer',
        category: 'POWER CONVERSION',
        description: 'Converts a higher AC input voltage down to a safe level for the rest of the board.',
        howItWorks: 'An alternating current in the primary coil induces a voltage in the secondary coil via magnetic coupling. The turn ratio sets the output voltage.',
        impactMessage: 'NO VOLTAGE CONVERSION — downstream logic is starved of its correct operating voltage. The board cannot power its rail safely.',
        affected: [
          { part: 'ic', mode: 'no-power' },
          { part: 'mcu', mode: 'no-power' }
        ],
        position: [-6.5, 0.75, -2.6]
      },
      {
        id: 'speaker',
        name: 'Output Speaker',
        category: 'OUTPUT / AUDIO',
        description: 'Converts the amplified electrical signal into audible sound — the audio output stage of the system.',
        howItWorks: 'A varying current runs through a voice coil inside a magnetic field, pushing a diaphragm back and forth to create pressure waves in the air.',
        impactMessage: 'NO AUDIO OUTPUT — the sound stage is silent. The electrical system still runs, but the auditory feedback channel is gone.',
        affected: [],
        position: [-1.2, 0.6, -3.2]
      }
    ]
  }
};

/* ---------- Status helpers ---------- */

const MODE_LABEL = {
  'no-power': 'NO POWER',
  'no-control': 'NO CONTROL SIGNAL',
  'burned-out': 'BURNED OUT',
  'flicker': 'UNSTABLE / FLICKER',
  'over-voltage': 'OVER-STRESSED',
  'reverse': 'REVERSE-POLARITY RISK',
  'noisy': 'NOISY SIGNAL',
  'no-signal': 'NO SIGNAL'
};

export function getModel(modelId = 'electronics') {
  return MODELS[modelId] || MODELS.electronics;
}

export function cloneModelState(modelId = 'electronics') {
  const model = getModel(modelId);
  return {
    id: model.id,
    parts: model.parts.map(p => ({
      ...p,
      removed: false,
      failures: []
    }))
  };
}

export function computeState(state) {
  for (const p of state.parts) p.failures = [];
  for (const p of state.parts) {
    if (p.removed) {
      for (const a of p.affected || []) {
        const t = state.parts.find(x => x.id === a.part);
        if (t && !t.removed) t.failures.push({ source: p.id, mode: a.mode });
      }
    }
  }
  return state;
}

export function partStatus(p) {
  if (p.removed) return { label: 'REMOVED', cls: 'removed' };
  if (p.failures.length) return { label: 'DEGRADED', cls: 'degraded' };
  return { label: 'ACTIVE', cls: 'active' };
}

export function describeFailure(f) {
  return MODE_LABEL[f.mode] || f.mode.toUpperCase();
}

export function failureSummary(p) {
  return p.failures.map(f => {
    const src = p.sourceName || 'source';
    return describeFailure(f);
  }).join(' + ');
}

export function setSourceNames(state) {
  for (const p of state.parts) {
    p.sourceName = p.name;
  }
  return state;
}
