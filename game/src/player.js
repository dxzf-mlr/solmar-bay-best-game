// Dana Cruz on foot: a low-poly figure with swinging limbs, WASD movement
// relative to the camera, Shift to run, and a third-person camera that the
// mouse orbits (pointer lock). The camera also serves the car when driving.

import * as THREE from 'three';
import { BALANCE } from './config.js';

function buildPersonFigure(shirtColor, skinColor, pantsColor) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.9 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 1 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.08;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.34), skin);
  head.position.y = 1.66;
  head.castShadow = true;
  group.add(head);
  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.36), hair);
  hairTop.position.y = 1.88;
  group.add(hairTop);

  const legGeo = new THREE.BoxGeometry(0.24, 0.72, 0.26);
  legGeo.translate(0, -0.36, 0);
  const leftLeg = new THREE.Mesh(legGeo, pants);
  leftLeg.position.set(-0.16, 0.72, 0);
  const rightLeg = new THREE.Mesh(legGeo, pants);
  rightLeg.position.set(0.16, 0.72, 0);
  leftLeg.castShadow = true;
  rightLeg.castShadow = true;
  group.add(leftLeg);
  group.add(rightLeg);

  const armGeo = new THREE.BoxGeometry(0.18, 0.62, 0.2);
  armGeo.translate(0, -0.31, 0);
  const leftArm = new THREE.Mesh(armGeo, shirt);
  leftArm.position.set(-0.42, 1.4, 0);
  const rightArm = new THREE.Mesh(armGeo, shirt);
  rightArm.position.set(0.42, 1.4, 0);
  leftArm.castShadow = true;
  rightArm.castShadow = true;
  group.add(leftArm);
  group.add(rightArm);

  return { group, leftLeg, rightLeg, leftArm, rightArm };
}

export function createPlayer(G) {
  const figure = buildPersonFigure(0x2e6f8e, 0xc98d64, 0x2b2f36);
  G.scene.add(figure.group);

  const player = {
    group: figure.group,
    limbs: figure,
    pos: new THREE.Vector3(G.world.places.playerStart.x, 0, G.world.places.playerStart.z),
    heading: Math.PI,
    moveSpeed: 0,
    walkPhase: 0,
    health: BALANCE.playerHealth,
    inCar: false,
    car: null,
    cameraYaw: Math.PI,
    cameraPitch: 0.32,
    cameraDistance: 7,
    invulnerableUntil: 0,
  };

  player.group.position.copy(player.pos);

  // Move on foot, collide with buildings and stay out of the sea.
  player.updateOnFoot = function updatePlayerOnFoot(dt) {
    const input = G.input;
    const run = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = run ? BALANCE.playerRunSpeed : BALANCE.playerWalkSpeed;

    let fx = 0;
    let fz = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) fz -= 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) fz += 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) fx -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) fx += 1;
    const moving = fx !== 0 || fz !== 0;

    // Camera yaw turns the WASD frame.
    const sin = Math.sin(player.cameraYaw);
    const cos = Math.cos(player.cameraYaw);
    let mx = 0;
    let mz = 0;
    if (moving) {
      const len = Math.hypot(fx, fz);
      fx /= len;
      fz /= len;
      mx = fx * cos - fz * sin;
      mz = fx * sin + fz * cos;
      // Face where we walk.
      player.heading = Math.atan2(mx, mz);
    }

    const step = speed * dt;
    let nx = player.pos.x + mx * step;
    let nz = player.pos.z + mz * step;
    const fixed = G.world.resolveCollision(nx, nz, 0.5);
    nx = fixed.x;
    nz = fixed.z;
    if (G.world.isInWater(nx, nz)) {
      nx = player.pos.x;
      nz = player.pos.z;
    }
    const clamped = G.world.clampToCity(nx, nz);
    player.pos.x = clamped.x;
    player.pos.z = clamped.z;
    player.moveSpeed = moving ? speed : 0;

    // Walk cycle: legs and arms swing opposite each other.
    if (moving) {
      player.walkPhase += dt * speed * 1.6;
      const swing = Math.sin(player.walkPhase) * 0.55;
      figure.leftLeg.rotation.x = swing;
      figure.rightLeg.rotation.x = -swing;
      figure.leftArm.rotation.x = -swing * 0.7;
      figure.rightArm.rotation.x = swing * 0.7;
    } else {
      figure.leftLeg.rotation.x *= 0.8;
      figure.rightLeg.rotation.x *= 0.8;
      figure.leftArm.rotation.x *= 0.8;
      figure.rightArm.rotation.x *= 0.8;
    }

    player.group.position.copy(player.pos);
    player.group.rotation.y = player.heading;
    player.group.visible = true;
  };

  // Mouse look: yaw around the player, pitch clamped above the horizon.
  player.updateCameraLook = function updateCameraLook(dt) {
    const input = G.input;
    player.cameraYaw -= input.lookDeltaX * 0.0028;
    player.cameraPitch += input.lookDeltaY * 0.0022;
    player.cameraPitch = Math.max(0.05, Math.min(1.1, player.cameraPitch));
  };

  // Third-person camera behind the player (or behind the car when driving).
  player.updateCamera = function updatePlayerCamera(dt) {
    const cam = G.camera;
    let focus = player.pos;
    let yaw = player.cameraYaw;
    let dist = player.cameraDistance;
    let height = 2.6;
    if (player.inCar && player.car) {
      focus = player.car.pos;
      yaw = player.car.heading + Math.PI;
      dist = 10.5;
      height = 4.2;
      // The camera eases toward the car's rear instead of snapping.
      player.cameraYaw += shortestAngle(player.cameraYaw, yaw) * Math.min(1, dt * 2.2);
      yaw = player.cameraYaw;
    }
    const cx = focus.x + Math.sin(yaw) * Math.cos(player.cameraPitch) * dist;
    const cz = focus.z + Math.cos(yaw) * Math.cos(player.cameraPitch) * dist;
    const cy = focus.y + height + Math.sin(player.cameraPitch) * dist * 0.6;
    cam.position.set(cx, cy, cz);
    // On foot the crosshair floats just above Dana's head; in a car it sits
    // on the road ahead.
    cam.lookAt(focus.x, focus.y + (player.inCar ? 1.6 : 2.1), focus.z);
  };

  function shortestAngle(from, to) {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  player.damage = function damagePlayer(amount) {
    const now = G.time;
    if (now < player.invulnerableUntil) return;
    player.health = Math.max(0, player.health - amount);
    player.invulnerableUntil = now + 0.4;
    G.hud.flashDamage();
    if (player.health <= 0) {
      G.setState('wasted');
    }
  };

  player.heal = function healPlayer(amount) {
    player.health = Math.min(BALANCE.playerHealth, player.health + amount);
  };

  // A fresh figure for other characters (cops, enemies, mission contacts).
  player.buildFigure = buildPersonFigure;

  return player;
}
