// Pedestrians: Solmar Bay locals strolling the sidewalks between random
// corners. They flee from a speeding car, and being run down hurts them and
// puts a star on the player. A knocked-down ped gets up again after a while.

import * as THREE from 'three';
import { ROADS, BALANCE, randomIn, pickFrom } from './config.js';

const SHIRTS = [0xd96a4a, 0x4a8fd9, 0x7bc47f, 0xe0a458, 0x9b7bc4, 0x5a6b7c, 0xc45a7a];
const SKINS = [0xc98d64, 0x8a5a3b, 0xe8b98a, 0x6b4423];
const PANTS = [0x2b2f36, 0x4a3b2e, 0x3a4a5a, 0x5a5a5a];

export function createPedestrians(G) {
  const peds = {
    list: [],
    count: 18,
  };

  function randomSidewalkPoint() {
    const road = pickFrom(G.rng, ROADS);
    const along = randomIn(G.rng, -250, 250);
    const side = G.rng() < 0.5 ? 10 : -10;
    if (G.rng() < 0.5) return { x: road + side, z: along };
    return { x: along, z: road + side };
  }

  peds.spawnOne = function spawnPedestrian(x, z) {
    const spot = x !== undefined ? { x, z } : randomSidewalkPoint();
    const figure = G.player.buildFigure(
      pickFrom(G.rng, SHIRTS),
      pickFrom(G.rng, SKINS),
      pickFrom(G.rng, PANTS),
    );
    const ped = {
      group: figure.group,
      limbs: figure,
      pos: new THREE.Vector3(spot.x, 0, spot.z),
      heading: G.rng() * Math.PI * 2,
      target: randomSidewalkPoint(),
      speed: randomIn(G.rng, BALANCE.pedWalkSpeed * 0.8, BALANCE.pedWalkSpeed * 1.3),
      walkPhase: G.rng() * 6,
      state: 'walk',
      downTimer: 0,
      fleeTimer: 0,
    };
    ped.group.position.copy(ped.pos);
    G.scene.add(ped.group);
    peds.list.push(ped);
    return ped;
  };

  peds.init = function initPedestrians() {
    for (let i = 0; i < peds.count; i++) {
      peds.spawnOne();
    }
  };

  // A ped hit by a car: fall over, slide a little, stay down, then get up.
  peds.knockDown = function knockPedDown(ped) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.downTimer = 3.5;
    ped.group.rotation.x = -Math.PI / 2;
    ped.group.position.y = 0.4;
    G.police.addWanted(1);
    G.hud.showMessage('You hit a pedestrian! The police are on their way.');
  };

  peds.update = function updatePedestrians(dt) {
    const player = G.player;
    const playerCar = G.vehicles.playerCar;
    for (const ped of peds.list) {
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          ped.state = 'walk';
          ped.group.rotation.x = 0;
          ped.group.position.y = 0;
          ped.target = randomSidewalkPoint();
        }
        continue;
      }

      // Flee when a fast car closes in.
      let threatX = null;
      let threatZ = null;
      if (playerCar && Math.abs(playerCar.speed) > 6) {
        const d = Math.hypot(playerCar.pos.x - ped.pos.x, playerCar.pos.z - ped.pos.z);
        if (d < 12) {
          threatX = playerCar.pos.x;
          threatZ = playerCar.pos.z;
        }
      }
      if (threatX === null && !player.inCar) {
        const d = Math.hypot(player.pos.x - ped.pos.x, player.pos.z - ped.pos.z);
        if (d < 3 && G.combat && G.combat.justPunched) {
          threatX = player.pos.x;
          threatZ = player.pos.z;
        }
      }
      if (threatX !== null) {
        ped.state = 'flee';
        ped.fleeTimer = 1.6;
        ped.target = {
          x: ped.pos.x + (ped.pos.x - threatX) * 2,
          z: ped.pos.z + (ped.pos.z - threatZ) * 2,
        };
      }

      if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        if (ped.fleeTimer <= 0) {
          ped.state = 'walk';
          ped.target = randomSidewalkPoint();
        }
      }

      const dx = ped.target.x - ped.pos.x;
      const dz = ped.target.z - ped.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2) {
        ped.target = randomSidewalkPoint();
        continue;
      }
      const run = ped.state === 'flee';
      const speed = ped.speed * (run ? 2.6 : 1);
      ped.heading = Math.atan2(dx, dz);
      ped.pos.x += (dx / dist) * speed * dt;
      ped.pos.z += (dz / dist) * speed * dt;
      const fixed = G.world.resolveCollision(ped.pos.x, ped.pos.z, 0.5);
      ped.pos.x = fixed.x;
      ped.pos.z = fixed.z;
      if (G.world.isInWater(ped.pos.x, ped.pos.z)) {
        ped.pos.x -= (dx / dist) * speed * dt;
        ped.pos.z -= (dz / dist) * speed * dt;
      }
      const clamped = G.world.clampToCity(ped.pos.x, ped.pos.z);
      ped.pos.x = clamped.x;
      ped.pos.z = clamped.z;

      ped.walkPhase += dt * speed * 2.2;
      const swing = Math.sin(ped.walkPhase) * 0.5;
      ped.limbs.leftLeg.rotation.x = swing;
      ped.limbs.rightLeg.rotation.x = -swing;
      ped.limbs.leftArm.rotation.x = -swing * 0.7;
      ped.limbs.rightArm.rotation.x = swing * 0.7;
      ped.group.position.copy(ped.pos);
      ped.group.rotation.y = ped.heading;

      // Run over by the player's car.
      if (playerCar && Math.abs(playerCar.speed) > 3) {
        const d = Math.hypot(playerCar.pos.x - ped.pos.x, playerCar.pos.z - ped.pos.z);
        if (d < 2.4) {
          peds.knockDown(ped);
        }
      }
    }
  };

  return peds;
}
