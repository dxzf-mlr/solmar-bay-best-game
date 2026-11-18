// The law in Solmar Bay: a 0-5 star wanted level, police cars that ram the
// player off the road, foot cops who chase and punch on foot, and a wanted
// level that cools down once every cop has lost sight of the player.

import * as THREE from 'three';
import { BALANCE, randomIn } from './config.js';

export function createPolice(G) {
  const police = {
    wanted: 0,
    cars: [],
    cops: [],
    coolTimer: 0,
    sirenTime: 0,
  };

  police.addWanted = function addWantedLevel(stars) {
    if (stars <= 0) return;
    const before = police.wanted;
    police.wanted = Math.min(5, police.wanted + stars);
    if (police.wanted > before) {
      police.coolTimer = 0;
      G.hud.showWanted(police.wanted);
      if (police.wanted >= 3) {
        G.hud.showMessage(`Wanted level ${police.wanted}! Lose the cops!`);
      }
    }
  };

  police.setWanted = function setWantedLevel(stars) {
    police.wanted = Math.max(0, Math.min(5, stars));
    police.coolTimer = 0;
    G.hud.showWanted(police.wanted);
  };

  function spawnPoliceCar() {
    const player = G.player;
    const focus = player.inCar && player.car ? player.car.pos : player.pos;
    const angle = G.rng() * Math.PI * 2;
    const x = focus.x + Math.sin(angle) * 70;
    const z = focus.z + Math.cos(angle) * 70;
    const clamped = G.world.clampToCity(x, z);
    const car = G.vehicles.spawnCar(clamped.x, clamped.z, angle, { police: true });
    car.cruiseSpeed = BALANCE.policeTopSpeed;
    car.ramCooldown = 0;
    police.cars.push(car);
    return car;
  }

  function spawnFootCop() {
    const player = G.player;
    const angle = G.rng() * Math.PI * 2;
    const x = player.pos.x + Math.sin(angle) * 22;
    const z = player.pos.z + Math.cos(angle) * 22;
    const clamped = G.world.clampToCity(x, z);
    const figure = G.player.buildFigure(0x1a2a44, 0xc98d64, 0x1a2a44);
    const cop = {
      group: figure.group,
      limbs: figure,
      pos: new THREE.Vector3(clamped.x, 0, clamped.z),
      heading: 0,
      walkPhase: G.rng() * 6,
      punchCooldown: 0,
    };
    cop.group.position.copy(cop.pos);
    G.scene.add(cop.group);
    police.cops.push(cop);
    return cop;
  }

  function removePoliceCar(car) {
    G.vehicles.removeCar(car);
    const i = police.cars.indexOf(car);
    if (i >= 0) police.cars.splice(i, 1);
  }

  function removeCop(cop) {
    G.scene.remove(cop.group);
    const i = police.cops.indexOf(cop);
    if (i >= 0) police.cops.splice(i, 1);
  }

  police.update = function updatePolice(dt) {
    const player = G.player;
    const playerPos = player.inCar && player.car ? player.car.pos : player.pos;

    // How many units the current stars call for.
    const wantCars = police.wanted === 0 ? 0 : Math.min(police.wanted, 5);
    const wantCops = police.wanted >= 2 ? 2 : police.wanted === 1 ? 1 : 0;
    while (police.cars.length < wantCars) spawnPoliceCar();
    while (police.cars.length > wantCars) removePoliceCar(police.cars[police.cars.length - 1]);
    while (police.cops.length < wantCops) spawnFootCop();
    while (police.cops.length > wantCops) removeCop(police.cops[police.cops.length - 1]);

    // Sirens wail whenever any police car is out.
    const siren = police.cars.length > 0;
    G.audio.setSiren(siren);
    if (siren) {
      police.sirenTime += dt;
      G.audio.updateSiren(police.sirenTime);
    }

    // Police cars hunt the player and ram.
    for (const car of [...police.cars]) {
      const dx = playerPos.x - car.pos.x;
      const dz = playerPos.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      const desired = Math.atan2(dx, dz);
      let diff = desired - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
      const targetSpeed = dist > 60 ? BALANCE.policeTopSpeed : BALANCE.policeTopSpeed * 0.92;
      car.speed = Math.min(targetSpeed, car.speed + 14 * dt);
      car.pos.x += Math.sin(car.heading) * car.speed * dt;
      car.pos.z += Math.cos(car.heading) * car.speed * dt;
      const fixed = G.world.resolveCollision(car.pos.x, car.pos.z, car.radius);
      car.pos.x = fixed.x;
      car.pos.z = fixed.z;
      car.group.position.copy(car.pos);
      car.group.rotation.y = car.heading;
      for (const wheel of car.wheels) {
        wheel.rotation.x += (car.speed * dt) / 0.36;
      }

      car.ramCooldown = Math.max(0, (car.ramCooldown || 0) - dt);
      if (dist < 3.6 && car.ramCooldown <= 0) {
        car.ramCooldown = 1.2;
        if (player.inCar) {
          player.car.speed *= 0.55;
          G.audio.crash();
          G.hud.showMessage('The police rammed you!');
        } else {
          player.damage(BALANCE.carRamDamage);
        }
      }
      // A police car far behind gives up and despawns for a fresh one.
      if (dist > 220) {
        removePoliceCar(car);
      }
    }

    // Foot cops run at the player and punch when they catch up.
    for (const cop of [...police.cops]) {
      const dx = player.pos.x - cop.pos.x;
      const dz = player.pos.z - cop.pos.z;
      const dist = Math.hypot(dx, dz);
      const speed = player.inCar ? 7.5 : 6.4;
      if (dist > 1.4) {
        cop.heading = Math.atan2(dx, dz);
        cop.pos.x += (dx / dist) * speed * dt;
        cop.pos.z += (dz / dist) * speed * dt;
        const fixed = G.world.resolveCollision(cop.pos.x, cop.pos.z, 0.5);
        cop.pos.x = fixed.x;
        cop.pos.z = fixed.z;
      }
      cop.walkPhase += dt * speed * 2;
      const swing = Math.sin(cop.walkPhase) * 0.55;
      cop.limbs.leftLeg.rotation.x = swing;
      cop.limbs.rightLeg.rotation.x = -swing;
      cop.group.position.copy(cop.pos);
      cop.group.rotation.y = cop.heading;

      cop.punchCooldown = Math.max(0, cop.punchCooldown - dt);
      if (dist < 1.6 && cop.punchCooldown <= 0 && !player.inCar) {
        cop.punchCooldown = 1.1;
        player.damage(BALANCE.copPunchDamage);
        G.audio.punch();
      }
      if (dist > 160) removeCop(cop);
    }

    // Cooling down: no cop close by for a while, lose one star at a time.
    if (police.wanted > 0) {
      let nearest = Infinity;
      for (const car of police.cars) {
        nearest = Math.min(nearest, Math.hypot(car.pos.x - playerPos.x, car.pos.z - playerPos.z));
      }
      for (const cop of police.cops) {
        nearest = Math.min(nearest, Math.hypot(cop.pos.x - player.pos.x, cop.pos.z - player.pos.z));
      }
      if (nearest > 70) {
        police.coolTimer += dt;
        if (police.coolTimer >= BALANCE.wantedDecaySeconds) {
          police.coolTimer = 0;
          police.wanted -= 1;
          G.hud.showWanted(police.wanted);
          if (police.wanted === 0) G.hud.showMessage('You lost the cops. Stay clean.');
        }
      } else {
        police.coolTimer = 0;
      }
    }
  };

  police.clearAll = function clearAllPolice() {
    for (const car of [...police.cars]) removePoliceCar(car);
    for (const cop of [...police.cops]) removeCop(cop);
    police.wanted = 0;
    G.hud.showWanted(0);
  };

  return police;
}
