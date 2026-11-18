// Solmar Bay boot and main loop. Builds the game context, wires every
// system together, runs the frame loop and owns the state machine:
// menu -> playing -> paused / missionComplete / missionFailed / wasted.

import * as THREE from 'three';
import { makeSeededRandom, BALANCE } from './config.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { buildWorld } from './world.js';
import { createPlayer } from './player.js';
import { createVehicles } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createSave } from './save.js';
import { applyShotStaging, readSeedFromUrl } from './shots.js';

const canvas = document.getElementById('game-canvas');
// ?lowfx=1 runs without antialiasing, shadows or tone mapping, for headless
// testing and weak machines; the normal game keeps all of them.
const lowFx = new URLSearchParams(window.location.search).has('lowfx');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowFx });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(lowFx ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = !lowFx;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = lowFx ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

const G = {
  scene,
  camera,
  renderer,
  input: createInput(canvas),
  audio: createAudio(),
  rng: makeSeededRandom(readSeedFromUrl()),
  time: 0,
  state: 'menu',
  money: 250,
  rep: 0,
  missionJustStarted: false,
};

// Systems, in build order: the world first, then the actors on it.
G.world = buildWorld(G);
G.player = createPlayer(G);
G.vehicles = createVehicles(G);
G.traffic = createTraffic(G);
G.pedestrians = createPedestrians(G);
G.police = createPolice(G);
G.combat = createCombat(G);
G.missions = createMissions(G);
G.hud = createHud(G);
G.save = createSave(G);

G.addMoney = function addMoney(amount) {
  G.money = Math.max(0, G.money + amount);
};

G.addRep = function addRep(amount) {
  G.rep = Math.max(0, G.rep + amount);
};

G.saveGame = function saveGameNow() {
  return G.save.write();
};

G.setState = function setGameState(state, data) {
  G.state = state;
  if (state === 'menu') {
    G.hud.showPanel('menu-start');
    G.input.releaseLock();
  } else if (state === 'playing') {
    G.hud.showPanel(null);
    G.input.requestLock();
  } else if (state === 'paused') {
    G.hud.showPanel('menu-pause');
    G.input.releaseLock();
    G.saveGame();
  } else if (state === 'missionComplete') {
    G.hud.fillEndScreen('complete', data);
    G.hud.showPanel('menu-complete');
    G.input.releaseLock();
  } else if (state === 'missionFailed') {
    G.hud.fillEndScreen('failed', data);
    G.hud.showPanel('menu-failed');
    G.input.releaseLock();
  } else if (state === 'wasted') {
    if (G.missions.status === 'active') {
      G.missions.status = 'idle';
      G.missions.stepIndex = 0;
      G.missions.stepProgress = 0;
      G.combat.clearEnemies();
    }
    G.hud.showPanel('menu-wasted');
    G.input.releaseLock();
  }
};

function startNewGame() {
  G.audio.start();
  G.audio.startRadio();
  G.save.clear();
  G.money = 250;
  G.rep = 0;
  G.missions.currentIndex = 0;
  G.missions.completed = new Set();
  G.missions.status = 'idle';
  G.player.health = BALANCE.playerHealth;
  G.player.pos.set(G.world.places.playerStart.x, 0, G.world.places.playerStart.z);
  G.player.group.position.copy(G.player.pos);
  G.player.inCar = false;
  G.player.car = null;
  G.vehicles.playerCar = null;
  G.police.clearAll();
  G.audio.uiClick();
  G.setState('playing');
}

function continueGame() {
  G.audio.start();
  G.audio.startRadio();
  const data = G.save.read();
  if (data) G.save.apply(data);
  G.audio.uiClick();
  G.setState('playing');
}

function respawnAfterWasted() {
  G.player.health = BALANCE.playerHealth;
  G.player.pos.set(G.world.places.playerStart.x, 0, G.world.places.playerStart.z);
  G.player.group.position.copy(G.player.pos);
  G.player.inCar = false;
  G.player.car = null;
  G.vehicles.playerCar = null;
  G.police.clearAll();
  G.combat.clearEnemies();
  G.money = Math.max(0, G.money - 100);
  G.hud.showMessage('You woke up at the clinic. The city kept your car.');
  G.audio.uiClick();
  G.setState('playing');
}

function wireButton(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}

wireButton('btn-new', startNewGame);
wireButton('btn-continue', continueGame);
wireButton('btn-resume', () => {
  G.audio.uiClick();
  G.setState('playing');
});
wireButton('btn-restart-mission', () => {
  G.missions.failMission('You walked away from the job.');
  G.audio.uiClick();
  G.setState('playing');
});
wireButton('btn-quit-to-menu', () => {
  G.audio.uiClick();
  G.setState('menu');
});
wireButton('btn-next-mission', () => {
  G.audio.uiClick();
  G.setState('playing');
});
wireButton('btn-retry-mission', () => {
  G.audio.uiClick();
  G.setState('playing');
});
wireButton('btn-fail-menu', () => {
  G.audio.uiClick();
  G.setState('menu');
});
wireButton('btn-respawn', respawnAfterWasted);
wireButton('btn-wasted-menu', () => {
  G.audio.uiClick();
  G.setState('menu');
});
wireButton('btn-mute', () => {
  G.audio.setMuted(!G.audio.muted);
  document.getElementById('btn-mute').textContent = G.audio.muted ? 'Unmute (M)' : 'Mute (M)';
});

// The continue button only appears when a save exists.
if (!G.save.hasSave()) {
  const btn = document.getElementById('btn-continue');
  if (btn) btn.style.display = 'none';
}

// Clicking the canvas while playing re-locks the pointer.
canvas.addEventListener('click', () => {
  if (G.state === 'playing') G.input.requestLock();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Show script errors on screen while developing (invisible in normal play).
window.addEventListener('error', (event) => {
  const el = document.getElementById('error');
  if (el) {
    el.style.display = 'block';
    el.textContent = `Error: ${event.message}`;
  }
});

// Populate the streets, then stage a screenshot if one was asked for.
G.traffic.init();
G.pedestrians.init();
G.vehicles.spawnParkedCars(10);
G.vehicles.spawnPlayerCar();

const stagedShot = applyShotStaging(G);
if (!stagedShot) {
  G.setState('menu');
}

const clock = new THREE.Clock();
let menuOrbit = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  G.time += dt;
  const input = G.input;

  // Global keys.
  if (input.wasPressed('KeyM')) {
    G.audio.setMuted(!G.audio.muted);
    const btn = document.getElementById('btn-mute');
    if (btn) btn.textContent = G.audio.muted ? 'Unmute (M)' : 'Mute (M)';
  }

  if (G.state === 'menu') {
    // A slow orbit over the city behind the title screen.
    menuOrbit += dt * 0.03;
    camera.position.set(
      Math.sin(menuOrbit) * 150,
      55 + Math.sin(menuOrbit * 0.7) * 10,
      Math.cos(menuOrbit) * 150,
    );
    camera.lookAt(0, 10, 0);
    G.world.update(dt, G.time, G.player.pos);
    G.traffic.update(dt);
    G.pedestrians.update(dt);
  } else if (G.state === 'playing') {
    if (input.wasPressed('Escape')) {
      G.setState('paused');
    } else {
      G.player.updateCameraLook(dt);
      if (G.player.inCar) {
        G.vehicles.updatePlayerCar(dt);
        G.audio.setEngine(Math.abs(G.vehicles.playerCar.speed) / BALANCE.carTopSpeed, true);
      } else {
        G.player.updateOnFoot(dt);
        G.audio.setEngine(0, false);
        if (input.wasPressed('KeyF')) {
          // Fights on foot: punch up close, pistol otherwise.
          const near = [...G.combat.enemies, ...G.police.cops].some(
            (t) => !t.dead && Math.hypot(t.pos.x - G.player.pos.x, t.pos.z - G.player.pos.z) < 2.2,
          );
          if (near) G.combat.punch();
          else G.combat.shoot();
        }
      }
      G.missions.update(dt);
      if (input.wasPressed('KeyE') && !G.missionJustStarted) {
        G.vehicles.tryEnterExit();
      }
      G.missionJustStarted = false;
      G.traffic.update(dt);
      G.pedestrians.update(dt);
      G.police.update(dt);
      G.combat.update(dt);
      G.player.updateCamera(dt);
      G.world.update(dt, G.time, G.player.inCar && G.player.car ? G.player.car.pos : G.player.pos);
      G.hud.update(dt);
      // Slow health regen out of combat.
      if (G.player.health > 0 && G.player.health < BALANCE.playerHealth) {
        G.player.heal(dt * 1.5);
      }
    }
  } else {
    // Paused or on an end screen: the city idles behind the panel.
    G.world.update(dt, G.time, G.player.pos);
  }

  input.endFrame();
  renderer.render(scene, camera);
}

animate();

// Exposed for headless testing and debugging only.
window.SOLMAR = G;
