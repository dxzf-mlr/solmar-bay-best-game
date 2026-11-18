// Cars: a boxy low-poly build (body, cabin, wheels, lights) and arcade driving
// physics — accelerate, brake, reverse, steer that bites harder at low speed,
// and a handbrake that breaks the rear loose. Entering and leaving a car is
// here too, with the wanted-level cost of stealing one.

import * as THREE from 'three';
import { BALANCE } from './config.js';

const CAR_COLORS = [0xc0392b, 0x2e6f8e, 0xe8c547, 0x7d8a96, 0x4a7c59, 0x8e44ad, 0xd35400, 0x1f2a37];

export function buildCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: isPolice ? 0xf2f2f2 : color,
    roughness: 0.35,
    metalness: 0.5,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.25, metalness: 0.4 });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 1 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.58, 2.2), darkMat);
  cabin.position.set(0, 1.1, -0.2);
  cabin.castShadow = true;
  group.add(cabin);

  if (isPolice) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.02, 0.18, 4.42),
      new THREE.MeshStandardMaterial({ color: 0x1a4fa0, roughness: 0.4 }),
    );
    stripe.position.y = 0.62;
    group.add(stripe);
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.16, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 }),
    );
    bar.position.set(0, 1.5, -0.2);
    group.add(bar);
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.14, 0.34),
      new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2 }),
    );
    red.position.set(-0.28, 1.6, -0.2);
    group.add(red);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.14, 0.34),
      new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 2 }),
    );
    blue.position.set(0.28, 1.6, -0.2);
    group.add(blue);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, tyreMat);
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }

  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff2c0,
    emissive: 0xffe9a0,
    emissiveIntensity: 1.2,
  });
  for (const hx of [-0.65, 0.65]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), headMat);
    head.position.set(hx, 0.62, 2.21);
    group.add(head);
  }
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xaa1111,
    emissive: 0x880000,
    emissiveIntensity: 0.8,
  });
  for (const hx of [-0.65, 0.65]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), tailMat);
    tail.position.set(hx, 0.62, -2.21);
    group.add(tail);
  }

  return { group, wheels };
}

export function createVehicles(G) {
  const vehicles = {
    list: [],
    playerCar: null,
  };

  // Spawn a car at a spot, facing a heading, optionally owned by traffic.
  vehicles.spawnCar = function spawnCar(x, z, heading, options) {
    const opts = options || {};
    const color = opts.color !== undefined ? opts.color : CAR_COLORS[Math.floor(G.rng() * CAR_COLORS.length)];
    const built = buildCarMesh(color, !!opts.police);
    const car = {
      group: built.group,
      wheels: built.wheels,
      pos: new THREE.Vector3(x, 0, z),
      heading: heading || 0,
      speed: 0,
      steer: 0,
      color,
      police: !!opts.police,
      traffic: !!opts.traffic,
      missionTarget: !!opts.missionTarget,
      driver: opts.driver || null,
      radius: 2.1,
      dead: false,
      brakeLight: 0,
    };
    car.group.position.copy(car.pos);
    car.group.rotation.y = car.heading;
    G.scene.add(car.group);
    vehicles.list.push(car);
    return car;
  };

  vehicles.removeCar = function removeCar(car) {
    G.scene.remove(car.group);
    const i = vehicles.list.indexOf(car);
    if (i >= 0) vehicles.list.splice(i, 1);
    if (vehicles.playerCar === car) vehicles.playerCar = null;
  };

  // Parked cars the player can steal, scattered along the streets.
  vehicles.spawnParkedCars = function spawnParkedCars(count) {
    const spots = [];
    let tries = 0;
    while (spots.length < count && tries < count * 20) {
      tries += 1;
      const road = G.world.places;
      const along = (Math.floor(G.rng() * 9) - 4) * 64;
      const across = (Math.floor(G.rng() * 9) - 4) * 64;
      const onVertical = G.rng() < 0.5;
      const x = onVertical ? along : across + (G.rng() < 0.5 ? 4 : -4);
      const z = onVertical ? across + (G.rng() < 0.5 ? 4 : -4) : along;
      if (Math.abs(x) > 260 || Math.abs(z) > 260) continue;
      if (Math.hypot(x - road.playerStart.x, z - road.playerStart.z) < 20) continue;
      if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 14)) continue;
      spots.push({ x, z, heading: onVertical ? 0 : Math.PI / 2 });
    }
    for (const s of spots) {
      vehicles.spawnCar(s.x, s.z, s.heading, { traffic: false });
    }
    return spots;
  };

  // The player's own starter car, parked near the spawn point.
  vehicles.spawnPlayerCar = function spawnPlayerCar() {
    const car = vehicles.spawnCar(
      G.world.places.playerStart.x + 6,
      G.world.places.playerStart.z + 4,
      Math.PI / 2,
      { color: 0x2e6f8e },
    );
    car.ownedByPlayer = true;
    return car;
  };

  // Step the driven car one frame: arcade handling, collisions, wheels.
  vehicles.updatePlayerCar = function updatePlayerCar(dt) {
    const car = vehicles.playerCar;
    if (!car) return;
    const input = G.input;

    const forward = input.isDown('KeyW') || input.isDown('ArrowUp');
    const back = input.isDown('KeyS') || input.isDown('ArrowDown');
    const left = input.isDown('KeyA') || input.isDown('ArrowLeft');
    const right = input.isDown('KeyD') || input.isDown('ArrowRight');
    const handbrake = input.isDown('Space');

    if (forward) car.speed += BALANCE.carAcceleration * dt;
    if (back) {
      if (car.speed > 0.5) car.speed -= BALANCE.carBrake * dt;
      else car.speed -= BALANCE.carAcceleration * 0.6 * dt;
    }
    if (!forward && !back) {
      car.speed -= Math.sign(car.speed) * 6 * dt;
      if (Math.abs(car.speed) < 0.4) car.speed = 0;
    }
    car.speed = Math.max(-BALANCE.carReverseSpeed, Math.min(BALANCE.carTopSpeed, car.speed));

    // Steering bites harder the slower we go; the handbrake loosens the rear.
    const steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
    const steerAuthority = 0.55 + (1 - Math.min(1, Math.abs(car.speed) / BALANCE.carTopSpeed)) * 0.45;
    car.steer += (steerTarget * steerAuthority - car.steer) * Math.min(1, dt * 8);
    const turnRate = car.steer * (handbrake ? 2.1 : 1.35) * Math.min(1, Math.abs(car.speed) / 8);
    car.heading += turnRate * Math.sign(car.speed) * dt * (handbrake ? 1.25 : 1);

    let nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
    let nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
    const fixed = G.world.resolveCollision(nx, nz, car.radius);
    if (fixed.hit && Math.abs(car.speed) > 6) {
      G.audio.crash();
      car.speed *= 0.45;
      if (Math.abs(car.speed) > 8) G.police.addWanted(0); // a hard crash draws eyes
    }
    nx = fixed.x;
    nz = fixed.z;
    if (G.world.isInWater(nx, nz)) {
      nx = car.pos.x;
      nz = car.pos.z;
      car.speed *= 0.3;
    }
    const clamped = G.world.clampToCity(nx, nz);
    car.pos.x = clamped.x;
    car.pos.z = clamped.z;

    // Bump into other cars: shove both and trade a little speed.
    for (const other of vehicles.list) {
      if (other === car || other.dead) continue;
      const dx = other.pos.x - car.pos.x;
      const dz = other.pos.z - car.pos.z;
      const d = Math.hypot(dx, dz);
      const min = car.radius + other.radius - 0.3;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const ux = dx / d;
        const uz = dz / d;
        car.pos.x -= ux * push;
        car.pos.z -= uz * push;
        other.pos.x += ux * push;
        other.pos.z += uz * push;
        if (Math.abs(car.speed) > 8) {
          G.audio.crash();
          car.speed *= 0.6;
          if (other.traffic) G.police.addWanted(0);
        }
      }
    }

    car.group.position.copy(car.pos);
    car.group.rotation.y = car.heading;
    for (const wheel of car.wheels) {
      wheel.rotation.x += (car.speed * dt) / 0.36;
    }
    // Front wheels steer visibly.
    car.wheels[0].rotation.y = car.steer * 0.4;
    car.wheels[1].rotation.y = car.steer * 0.4;
  };

  // E near a car: climb in (stealing a stranger's car costs one wanted star).
  // E while driving: climb out beside the car.
  vehicles.tryEnterExit = function tryEnterExitCar() {
    const player = G.player;
    if (player.inCar) {
      const car = player.car;
      player.inCar = false;
      player.car = null;
      vehicles.playerCar = null;
      player.pos.set(
        car.pos.x + Math.sin(car.heading + Math.PI / 2) * 2.6,
        0,
        car.pos.z + Math.cos(car.heading + Math.PI / 2) * 2.6,
      );
      player.group.position.copy(player.pos);
      player.cameraYaw = car.heading + Math.PI;
      G.audio.uiClick();
      return true;
    }
    let best = null;
    let bestD = 4.5;
    for (const car of vehicles.list) {
      if (car.dead || car.police) continue;
      const d = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    if (!best) return false;
    player.inCar = true;
    player.car = best;
    vehicles.playerCar = best;
    player.group.visible = false;
    if (best.traffic) {
      best.traffic = false;
      best.driver = null;
      G.police.addWanted(1);
      G.hud.showMessage('You stole the car! The law is coming.');
    } else if (best.missionTarget) {
      G.hud.showMessage('Target car secured. Get it to the drop-off.');
    } else {
      G.audio.uiClick();
    }
    return true;
  };

  return vehicles;
}
