// Dana's story: seven jobs from Mama Rosa, from courier runs to the Bay
// Heist. Each mission is data — a list of steps — run by one small engine:
// go somewhere, drive somewhere, steal a car, deliver it, pick someone up,
// hold F to work a job, gun down an ambush, wait out a vault, escape.
// Money and reputation pay out on completion, and the game saves itself.

import * as THREE from 'three';

const MISSION_DEFS = [
  {
    id: 1,
    name: 'Courier Run',
    briefing:
      'Mama Rosa needs three packages across town before dark. Take a car and hit every drop.',
    reward: 150,
    rep: 5,
    start: { x: 0, z: 64 },
    steps: [
      { type: 'driveTo', x: 192, z: 128, r: 8, label: 'Drop the package at the tower lobby' },
      { type: 'driveTo', x: -128, z: 192, r: 8, label: 'Drop the package at the marina flats' },
      { type: 'driveTo', x: 64, z: -192, r: 8, label: 'Drop the package at the north garage' },
    ],
  },
  {
    id: 2,
    name: 'Repo Job',
    briefing:
      'A red sedan at the east corner skipped its payments. Take it back to the garage on 5th.',
    reward: 300,
    rep: 8,
    start: { x: -64, z: -128 },
    steps: [
      { type: 'goto', x: 192, z: 64, r: 7, label: 'Find the red sedan on the east corner' },
      { type: 'steal', label: 'Get in the target car' },
      { type: 'deliver', x: -64, z: -128, r: 9, label: 'Deliver the sedan to the garage' },
    ],
  },
  {
    id: 3,
    name: 'Getaway Driver',
    briefing:
      'A friend needs wheels after a job went loud. Pick them up, then shake the heat.',
    reward: 500,
    rep: 12,
    start: { x: 0, z: -192 },
    steps: [
      { type: 'goto', x: 128, z: -64, r: 7, label: 'Meet the passenger at the plaza' },
      { type: 'pickup', x: 128, z: -64, r: 7, label: 'Stop and let them in' },
      { type: 'driveTo', x: -192, z: 192, r: 9, label: 'Reach the hideout in the west flats' },
    ],
  },
  {
    id: 4,
    name: 'Smash & Grab',
    briefing:
      'The jewelry store on Marina Row keeps its display cases soft. Smash, grab, run.',
    reward: 800,
    rep: 15,
    start: { x: 64, z: 128 },
    steps: [
      { type: 'goto', x: 128, z: 128, r: 7, label: 'Get to the jewelry store' },
      { type: 'interact', x: 128, z: 128, r: 7, hold: 2.5, label: 'Smash the display (hold F)' },
      { type: 'driveTo', x: -128, z: -192, r: 9, label: 'Escape to the safe house' },
    ],
  },
  {
    id: 5,
    name: 'Harbor Deal',
    briefing:
      'A buyer waits at the end of the pier. It smells like a setup. Bring the pistol.',
    reward: 1200,
    rep: 20,
    start: { x: -256, z: 0 },
    steps: [
      { type: 'goto', x: -330, z: 0, r: 8, label: 'Walk to the end of the pier' },
      { type: 'eliminate', count: 4, label: 'Survive the ambush — take down all four' },
    ],
  },
  {
    id: 6,
    name: 'The Long Con',
    briefing:
      'Three devices, three rooftops of the city grid. Plant them quiet — if the heat hits 3 stars, the con is blown.',
    reward: 2000,
    rep: 25,
    start: { x: 192, z: -128 },
    steps: [
      { type: 'interact', x: 128, z: -192, r: 7, hold: 2, label: 'Plant the device at the north tower (hold F)' },
      { type: 'interact', x: 0, z: 128, r: 7, hold: 2, label: 'Plant the device at the market (hold F)' },
      { type: 'interact', x: -192, z: 0, r: 7, hold: 2, label: 'Plant the device by the beach road (hold F)' },
    ],
  },
  {
    id: 7,
    name: 'Bay Heist',
    briefing:
      'The big one. Hold the bank on Harbor Street for thirty seconds, then run for the boat at the pier.',
    reward: 5000,
    rep: 40,
    start: { x: -64, z: 64 },
    steps: [
      { type: 'goto', x: -64, z: 64, r: 7, label: 'Get inside the bank' },
      { type: 'wait', x: -64, z: 64, r: 9, hold: 30, label: 'Crack the vault — hold the bank' },
      { type: 'escape', x: -330, z: 0, r: 9, label: 'Run for the boat at the end of the pier' },
    ],
  },
];

export function createMissions(G) {
  const missions = {
    defs: MISSION_DEFS,
    currentIndex: 0,
    completed: new Set(),
    status: 'idle', // idle | active | done
    stepIndex: 0,
    stepProgress: 0,
    targetCar: null,
    enemiesToKill: 0,
    enemiesKilledAtStart: 0,
    beacon: null,
    beaconRing: null,
  };

  // A tall light pillar marks the current objective; a ring spins at its base.
  const beaconGeo = new THREE.CylinderGeometry(2.2, 2.2, 40, 16, 1, true);
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffd94a,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  missions.beacon = new THREE.Mesh(beaconGeo, beaconMat);
  missions.beacon.position.y = 20;
  missions.beacon.visible = false;
  G.scene.add(missions.beacon);
  const ringGeo = new THREE.TorusGeometry(3, 0.18, 8, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd94a });
  missions.beaconRing = new THREE.Mesh(ringGeo, ringMat);
  missions.beaconRing.rotation.x = -Math.PI / 2;
  missions.beaconRing.position.y = 0.3;
  missions.beaconRing.visible = false;
  G.scene.add(missions.beaconRing);

  function placeBeacon(x, z, color) {
    missions.beacon.position.x = x;
    missions.beacon.position.z = z;
    missions.beaconRing.position.x = x;
    missions.beaconRing.position.z = z;
    missions.beacon.material.color.setHex(color);
    missions.beaconRing.material.color.setHex(color);
    missions.beacon.visible = true;
    missions.beaconRing.visible = true;
  }

  function hideBeacon() {
    missions.beacon.visible = false;
    missions.beaconRing.visible = false;
  }

  missions.currentDef = function currentMissionDef() {
    return MISSION_DEFS[missions.currentIndex] || null;
  };

  missions.currentStep = function currentMissionStep() {
    const def = missions.currentDef();
    if (!def) return null;
    return def.steps[missions.stepIndex] || null;
  };

  missions.objectiveText = function currentObjectiveText() {
    const def = missions.currentDef();
    if (!def) return 'All jobs done — Solmar Bay is yours, Dana.';
    if (missions.status === 'idle') {
      return `Next job: ${def.name} — go to the green marker to start.`;
    }
    const step = missions.currentStep();
    if (!step) return def.name;
    return `${def.name}: ${step.label}`;
  };

  // Where the minimap and the HUD compass should point.
  missions.markerPosition = function currentMarkerPosition() {
    const def = missions.currentDef();
    if (!def) return null;
    if (missions.status === 'idle') return def.start;
    const step = missions.currentStep();
    if (!step) return def.start;
    if (step.type === 'steal') return missions.targetCar ? { x: missions.targetCar.pos.x, z: missions.targetCar.pos.z } : def.start;
    if (step.x !== undefined) return { x: step.x, z: step.z };
    return def.start;
  };

  missions.startMission = function startCurrentMission() {
    const def = missions.currentDef();
    if (!def || missions.status === 'active') return;
    missions.status = 'active';
    missions.stepIndex = 0;
    missions.stepProgress = 0;
    missions.beginStep();
    G.hud.showMessage(`${def.name}: ${def.briefing}`);
    G.audio.pickup();
  };

  // Step setup: spawn what the step needs (a target car, an ambush, heat).
  missions.beginStep = function beginCurrentStep() {
    const step = missions.currentStep();
    if (!step) return;
    missions.stepProgress = 0;
    if (step.type === 'eliminate') {
      missions.enemiesToKill = step.count;
      missions.enemiesKilledAtStart = G.combat.enemies.filter((e) => e.dead).length;
      const px = G.player.pos.x;
      const pz = G.player.pos.z;
      for (let i = 0; i < step.count; i++) {
        const angle = (i / step.count) * Math.PI * 2 + 0.6;
        G.combat.spawnEnemy(
          Math.max(-320, Math.min(320, px + Math.sin(angle) * 16)),
          Math.max(-320, Math.min(320, pz + Math.cos(angle) * 16)),
        );
      }
      G.hud.showMessage('Ambush! They came out of nowhere!');
    }
    if (missions.currentDef().id === 2 && missions.stepIndex === 0) {
      missions.targetCar = G.vehicles.spawnCar(192, 64, Math.PI / 2, {
        color: 0xc0392b,
        missionTarget: true,
      });
    }
    if (missions.currentDef().id === 3 && missions.stepIndex === 2) {
      G.police.setWanted(2);
      G.hud.showMessage('The job went loud — two stars. Lose them at the hideout.');
    }
    if (missions.currentDef().id === 4 && missions.stepIndex === 2) {
      G.police.setWanted(3);
    }
    if (missions.currentDef().id === 7 && missions.stepIndex === 1) {
      G.police.setWanted(5);
      G.hud.showMessage('Five stars! Every cop in the bay is coming!');
    }
  };

  missions.completeStep = function completeCurrentStep() {
    missions.stepIndex += 1;
    const def = missions.currentDef();
    if (missions.stepIndex >= def.steps.length) {
      missions.completeMission();
      return;
    }
    missions.beginStep();
    G.audio.pickup();
  };

  missions.completeMission = function completeCurrentMission() {
    const def = missions.currentDef();
    G.addMoney(def.reward);
    G.addRep(def.rep);
    missions.completed.add(def.id);
    missions.currentIndex += 1;
    missions.status = 'idle';
    missions.stepIndex = 0;
    missions.stepProgress = 0;
    hideBeacon();
    G.audio.missionDone();
    G.saveGame();
    G.setState('missionComplete', { mission: def });
  };

  missions.failMission = function failCurrentMission(reason) {
    const def = missions.currentDef();
    if (!def || missions.status !== 'active') return;
    missions.status = 'idle';
    missions.stepIndex = 0;
    missions.stepProgress = 0;
    G.combat.clearEnemies();
    hideBeacon();
    G.audio.missionFail();
    G.setState('missionFailed', { mission: def, reason });
  };

  function distTo(x, z) {
    const p = G.player.inCar && G.player.car ? G.player.car.pos : G.player.pos;
    return Math.hypot(p.x - x, p.z - z);
  }

  missions.update = function updateMissions(dt) {
    const def = missions.currentDef();
    if (!def) {
      hideBeacon();
      return;
    }
    // Spin the beacon ring; bob the pillar a little.
    if (missions.beacon.visible) {
      missions.beaconRing.rotation.z += dt * 1.5;
      missions.beacon.position.y = 20 + Math.sin(G.time * 2) * 0.8;
    }

    if (missions.status === 'idle') {
      placeBeacon(def.start.x, def.start.z, 0x7ee787);
      const d = Math.hypot(G.player.pos.x - def.start.x, G.player.pos.z - def.start.z);
      if (d <= 5) {
        G.hud.setPrompt(`Press E to start: ${def.name} — $${def.reward}`);
        if (G.input.wasPressed('KeyE')) {
          G.missionJustStarted = true;
          missions.startMission();
        }
      } else {
        G.hud.setPrompt('');
      }
      return;
    }

    // Active mission: drive the current step.
    const step = missions.currentStep();
    if (!step) return;
    const marker = missions.markerPosition();
    if (marker) placeBeacon(marker.x, marker.z, 0xffd94a);

    // The Long Con blows up if the heat gets too high.
    if (def.id === 6 && G.police.wanted >= 3) {
      missions.failMission('The cops made the con — 3 stars and it is blown.');
      return;
    }

    switch (step.type) {
      case 'goto':
      case 'driveTo':
      case 'escape': {
        if (distTo(step.x, step.z) <= step.r) {
          if (step.type === 'driveTo' && !G.player.inCar) {
            G.hud.setPrompt('You need a car for this drop.');
          } else {
            missions.completeStep();
          }
        }
        break;
      }
      case 'steal': {
        if (G.player.inCar && G.player.car === missions.targetCar) {
          missions.completeStep();
        }
        break;
      }
      case 'deliver': {
        if (
          G.player.inCar &&
          G.player.car === missions.targetCar &&
          distTo(step.x, step.z) <= step.r
        ) {
          missions.completeStep();
        }
        break;
      }
      case 'pickup': {
        const car = G.player.car;
        if (G.player.inCar && car && Math.abs(car.speed) < 2 && distTo(step.x, step.z) <= step.r) {
          missions.stepProgress += dt;
          if (missions.stepProgress > 1.5) {
            G.hud.showMessage('Passenger in. Drive — and do not stop for anyone.');
            missions.completeStep();
          }
        } else {
          missions.stepProgress = 0;
        }
        break;
      }
      case 'interact': {
        if (distTo(step.x, step.z) <= step.r && G.input.isDown('KeyF')) {
          missions.stepProgress += dt;
          G.hud.setProgress(missions.stepProgress / step.hold);
          if (missions.stepProgress >= step.hold) {
            G.hud.setProgress(0);
            missions.completeStep();
          }
        } else {
          missions.stepProgress = Math.max(0, missions.stepProgress - dt);
          G.hud.setProgress(0);
        }
        break;
      }
      case 'wait': {
        if (distTo(step.x, step.z) <= step.r) {
          missions.stepProgress += dt;
          G.hud.setProgress(missions.stepProgress / step.hold);
          if (missions.stepProgress >= step.hold) {
            G.hud.setProgress(0);
            missions.completeStep();
          }
        } else {
          missions.stepProgress = 0;
          G.hud.setProgress(0);
        }
        break;
      }
      case 'eliminate': {
        const deadNow = G.combat.enemies.filter((e) => e.dead).length;
        if (deadNow - missions.enemiesKilledAtStart >= missions.enemiesToKill) {
          missions.completeStep();
        }
        break;
      }
      default:
        break;
    }
  };

  return missions;
}
