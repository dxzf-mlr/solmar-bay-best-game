// The HUD: money, reputation, wanted stars, health, speed, the objective
// line, a canvas minimap, toast messages, prompts and the menus (start,
// pause, mission complete / failed, wasted). All DOM, no images.

import { WORLD_HALF } from './config.js';

export function createHud(G) {
  const hud = {};
  const $ = (id) => document.getElementById(id);
  const moneyEl = $('money');
  const repEl = $('rep');
  const starsEl = $('stars');
  const healthFill = $('health-fill');
  const healthText = $('health-text');
  const speedEl = $('speed');
  const objectiveEl = $('objective');
  const promptEl = $('prompt');
  const messageEl = $('message');
  const progressWrap = $('progress-wrap');
  const progressFill = $('progress-fill');
  const mapCanvas = $('minimap');
  const mapCtx = mapCanvas.getContext('2d');
  const flashEl = $('damage-flash');
  const crosshairEl = $('crosshair');

  let messageTimer = null;
  let mapTimer = 0;

  hud.showWanted = function showWantedStars(stars) {
    starsEl.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    starsEl.classList.toggle('hot', stars > 0);
  };

  hud.showMoney = function showMoneyAmount(money, rep) {
    moneyEl.textContent = `$${money.toLocaleString('en-US')}`;
    repEl.textContent = `REP ${rep}`;
  };

  hud.showHealth = function showHealthAmount(health) {
    healthFill.style.width = `${Math.max(0, health)}%`;
    healthText.textContent = `${Math.ceil(Math.max(0, health))}`;
    healthFill.classList.toggle('low', health < 30);
  };

  hud.showSpeed = function showSpeedValue(speedKmh, inCar) {
    if (inCar) {
      speedEl.textContent = `${Math.round(Math.abs(speedKmh))} km/h`;
      speedEl.style.display = 'block';
    } else {
      speedEl.style.display = 'none';
    }
  };

  hud.showObjective = function showObjectiveText(text) {
    objectiveEl.textContent = text;
  };

  hud.setPrompt = function setPromptText(text) {
    promptEl.textContent = text;
    promptEl.style.display = text ? 'block' : 'none';
  };

  hud.setProgress = function setProgressFraction(frac) {
    if (frac > 0) {
      progressWrap.style.display = 'block';
      progressFill.style.width = `${Math.min(100, frac * 100)}%`;
    } else {
      progressWrap.style.display = 'none';
    }
  };

  hud.showMessage = function showToastMessage(text, ms) {
    messageEl.textContent = text;
    messageEl.style.display = 'block';
    if (messageTimer) clearTimeout(messageTimer);
    messageTimer = setTimeout(() => {
      messageEl.style.display = 'none';
    }, ms || 3500);
  };

  hud.flashDamage = function flashDamageOverlay() {
    flashEl.style.opacity = '0.45';
    setTimeout(() => {
      flashEl.style.opacity = '0';
    }, 120);
  };

  hud.showCrosshair = function showCrosshairVisible(visible) {
    crosshairEl.style.display = visible ? 'block' : 'none';
  };

  // The minimap: roads, beach, sea, the player arrow, cops, traffic and the
  // mission marker, drawn top-down with north up.
  hud.drawMinimap = function drawMinimap() {
    const size = mapCanvas.width;
    const scale = size / (WORLD_HALF * 2);
    const toMap = (v) => (v + WORLD_HALF) * scale;
    mapCtx.fillStyle = '#20262b';
    mapCtx.fillRect(0, 0, size, size);
    // Sea and sand on the west edge.
    mapCtx.fillStyle = '#2e6f8e';
    mapCtx.fillRect(0, 0, toMap(-272), size);
    mapCtx.fillStyle = '#d9c08a';
    mapCtx.fillRect(toMap(-272), 0, toMap(-256) - toMap(-272), size);
    // Blocks.
    mapCtx.fillStyle = '#3d454c';
    for (let x = -256; x <= 192; x += 64) {
      for (let z = -256; z <= 192; z += 64) {
        mapCtx.fillRect(toMap(x + 8), toMap(z + 8), 48 * scale, 48 * scale);
      }
    }
    // Roads.
    mapCtx.strokeStyle = '#565e66';
    mapCtx.lineWidth = 3;
    for (const r of [-256, -192, -128, -64, 0, 64, 128, 192, 256]) {
      mapCtx.beginPath();
      mapCtx.moveTo(toMap(r), 0);
      mapCtx.lineTo(toMap(r), size);
      mapCtx.stroke();
      mapCtx.beginPath();
      mapCtx.moveTo(0, toMap(r));
      mapCtx.lineTo(size, toMap(r));
      mapCtx.stroke();
    }
    // Mission marker: a pulsing yellow diamond.
    const marker = G.missions.markerPosition();
    if (marker) {
      const mx = toMap(marker.x);
      const my = toMap(marker.z);
      const pulse = 4 + Math.sin(G.time * 5) * 1.5;
      mapCtx.fillStyle = '#ffd94a';
      mapCtx.beginPath();
      mapCtx.moveTo(mx, my - pulse);
      mapCtx.lineTo(mx + pulse, my);
      mapCtx.lineTo(mx, my + pulse);
      mapCtx.lineTo(mx - pulse, my);
      mapCtx.closePath();
      mapCtx.fill();
    }
    // Traffic as grey dots, police as red dots.
    mapCtx.fillStyle = '#9aa5b1';
    for (const car of G.traffic.cars) {
      mapCtx.fillRect(toMap(car.pos.x) - 1.5, toMap(car.pos.z) - 1.5, 3, 3);
    }
    mapCtx.fillStyle = '#ff5252';
    for (const car of G.police.cars) {
      mapCtx.beginPath();
      mapCtx.arc(toMap(car.pos.x), toMap(car.pos.z), 3, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // The player: a white arrow pointing where they face.
    const p = G.player.inCar && G.player.car ? G.player.car.pos : G.player.pos;
    const heading = G.player.inCar && G.player.car ? G.player.car.heading : G.player.heading;
    const px = toMap(p.x);
    const py = toMap(p.z);
    mapCtx.save();
    mapCtx.translate(px, py);
    mapCtx.rotate(heading);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -6);
    mapCtx.lineTo(4.5, 5);
    mapCtx.lineTo(-4.5, 5);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
  };

  hud.update = function updateHud(dt) {
    mapTimer += dt;
    if (mapTimer > 0.12) {
      mapTimer = 0;
      hud.drawMinimap();
    }
    hud.showHealth(G.player.health);
    hud.showMoney(G.money, G.rep);
    hud.showObjective(G.missions.objectiveText());
    const car = G.vehicles.playerCar;
    hud.showSpeed(car ? car.speed * 3.6 : 0, !!car);
    hud.showCrosshair(!G.player.inCar && G.state === 'playing');
  };

  // Menus: show one panel, hide the rest.
  const panels = ['menu-start', 'menu-pause', 'menu-complete', 'menu-failed', 'menu-wasted'];
  hud.showPanel = function showMenuPanel(id) {
    for (const p of panels) {
      $(p).style.display = p === id ? 'flex' : 'none';
    }
    $('hud').style.display = id === null ? 'block' : 'none';
    if (id === null) {
      $('menu-start').style.display = 'none';
    }
  };

  hud.fillEndScreen = function fillEndScreen(kind, data) {
    if (kind === 'complete') {
      $('complete-title').textContent = `${data.mission.name} — Job Done`;
      $('complete-text').textContent =
        `Mama Rosa pays $${data.mission.reward}. Reputation +${data.mission.rep}. ` +
        (G.missions.currentDef()
          ? `Next up: ${G.missions.currentDef().name}.`
          : 'That was the last job. Solmar Bay is yours.');
    } else if (kind === 'failed') {
      $('failed-title').textContent = `${data.mission.name} — Job Failed`;
      $('failed-text').textContent = data.reason || 'The job fell apart.';
    }
  };

  return hud;
}
