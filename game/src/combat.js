// Combat: F punches whatever is close on foot, otherwise fires the pistol.
// Hitscan shots draw a tracer line and a muzzle flash, enemies take damage
// and fall, and mission ambushes spawn their own shooters who fire back.

import * as THREE from 'three';
import { BALANCE } from './config.js';

export function createCombat(G) {
  const combat = {
    enemies: [],
    justPunched: false,
    punchCooldown: 0,
    shootCooldown: 0,
    tracers: [],
  };

  // Spawn an armed enemy who stands their ground and shoots at the player.
  combat.spawnEnemy = function spawnEnemy(x, z, health) {
    const figure = G.player.buildFigure(0x3d2b2b, 0x8a5a3b, 0x222222);
    const enemy = {
      group: figure.group,
      limbs: figure,
      pos: new THREE.Vector3(x, 0, z),
      heading: 0,
      health: health || BALANCE.enemyHealth,
      shootTimer: 1 + G.rng() * 1.5,
      dead: false,
      fallTimer: 0,
    };
    enemy.group.position.copy(enemy.pos);
    G.scene.add(enemy.group);
    combat.enemies.push(enemy);
    return enemy;
  };

  combat.removeEnemy = function removeEnemy(enemy) {
    G.scene.remove(enemy.group);
    const i = combat.enemies.indexOf(enemy);
    if (i >= 0) combat.enemies.splice(i, 1);
  };

  combat.clearEnemies = function clearAllEnemies() {
    for (const enemy of [...combat.enemies]) combat.removeEnemy(enemy);
  };

  function spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 }),
    );
    G.scene.add(line);
    combat.tracers.push({ line, life: 0.09 });
  }

  function muzzleFlash(at, dir) {
    const flash = new THREE.PointLight(0xffd28a, 12, 9, 2);
    flash.position.copy(at).addScaledVector(dir, 0.8);
    G.scene.add(flash);
    combat.tracers.push({ line: flash, life: 0.06, isLight: true });
  }

  // The pistol fires from the camera through the crosshair: the nearest
  // enemy, cop or ped within a narrow cone of the aim takes the hit.
  combat.shoot = function shootPistol() {
    if (combat.shootCooldown > 0 || G.player.inCar) return;
    combat.shootCooldown = 0.32;
    G.audio.gunshot();
    const cam = G.camera;
    const origin = cam.position.clone();
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const start = origin.clone().addScaledVector(dir, 1.2);
    muzzleFlash(start, dir);

    let best = null;
    let bestScore = 0.16; // cos of the allowed cone (~9 degrees)
    let bestDist = 90;
    const targets = [];
    for (const e of combat.enemies) if (!e.dead) targets.push(e);
    for (const c of G.police.cops) targets.push(c);
    for (const p of G.pedestrians.list) if (p.state !== 'down') targets.push(p);
    for (const t of targets) {
      const to = new THREE.Vector3(t.pos.x, t.pos.y + 1.2, t.pos.z).sub(origin);
      const dist = to.length();
      if (dist > 90 || dist < 0.5) continue;
      const score = to.normalize().dot(dir);
      if (score > bestScore && dist < bestDist) {
        bestScore = score;
        bestDist = dist;
        best = t;
      }
    }

    const end = best
      ? new THREE.Vector3(best.pos.x, best.pos.y + 1.2, best.pos.z)
      : origin.clone().addScaledVector(dir, 60);
    spawnTracer(start, end);

    if (best) {
      if (best.health !== undefined) {
        // An enemy: damage it, and it falls when its health runs out.
        best.health -= BALANCE.pistolDamage;
        if (best.health <= 0 && !best.dead) {
          best.dead = true;
          best.fallTimer = 0;
          best.group.rotation.x = -Math.PI / 2;
          best.group.position.y = 0.4;
          G.addMoney(25);
          G.hud.showMessage('Target down. +$25');
        }
      } else if (best.state !== undefined) {
        // A pedestrian: shooting one is a crime.
        G.pedestrians.knockDown(best);
      } else {
        // A foot cop: shooting the law costs two stars.
        G.police.addWanted(2);
        G.hud.showMessage('You shot a cop! Wanted level up!');
        const i = G.police.cops.indexOf(best);
        if (i >= 0) {
          G.scene.remove(best.group);
          G.police.cops.splice(i, 1);
        }
      }
    }
  };

  // A punch lands on the nearest person within arm's reach.
  combat.punch = function punchAttack() {
    if (combat.punchCooldown > 0 || G.player.inCar) return;
    combat.punchCooldown = 0.45;
    combat.justPunched = true;
    G.audio.punch();
    const player = G.player;
    let best = null;
    let bestD = 2.2;
    const targets = [];
    for (const e of combat.enemies) if (!e.dead) targets.push(e);
    for (const c of G.police.cops) targets.push(c);
    for (const p of G.pedestrians.list) if (p.state !== 'down') targets.push(p);
    for (const t of targets) {
      const d = Math.hypot(t.pos.x - player.pos.x, t.pos.z - player.pos.z);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (!best) return;
    if (best.health !== undefined) {
      best.health -= BALANCE.punchDamage;
      if (best.health <= 0 && !best.dead) {
        best.dead = true;
        best.group.rotation.x = -Math.PI / 2;
        best.group.position.y = 0.4;
        G.addMoney(25);
      }
    } else if (best.state !== undefined) {
      G.pedestrians.knockDown(best);
    } else {
      G.police.addWanted(1);
      player.damage(BALANCE.copPunchDamage);
    }
  };

  combat.update = function updateCombat(dt) {
    combat.punchCooldown = Math.max(0, combat.punchCooldown - dt);
    combat.shootCooldown = Math.max(0, combat.shootCooldown - dt);
    combat.justPunched = false;

    // Fade tracers and muzzle flashes out.
    for (const t of [...combat.tracers]) {
      t.life -= dt;
      if (t.life <= 0) {
        G.scene.remove(t.line);
        combat.tracers.splice(combat.tracers.indexOf(t), 1);
      }
    }

    // Enemies aim at the player and fire with imperfect aim.
    for (const enemy of [...combat.enemies]) {
      if (enemy.dead) {
        enemy.fallTimer += dt;
        if (enemy.fallTimer > 6) combat.removeEnemy(enemy);
        continue;
      }
      const player = G.player;
      const dx = player.pos.x - enemy.pos.x;
      const dz = player.pos.z - enemy.pos.z;
      const dist = Math.hypot(dx, dz);
      enemy.heading = Math.atan2(dx, dz);
      enemy.group.rotation.y = enemy.heading;
      enemy.shootTimer -= dt;
      if (enemy.shootTimer <= 0 && dist < 55) {
        enemy.shootTimer = 1.4 + G.rng() * 1.2;
        const from = new THREE.Vector3(enemy.pos.x, 1.4, enemy.pos.z);
        const to = new THREE.Vector3(
          player.pos.x + (G.rng() - 0.5) * 2,
          1.2,
          player.pos.z + (G.rng() - 0.5) * 2,
        );
        spawnTracer(from, to);
        muzzleFlash(from, to.clone().sub(from).normalize());
        G.audio.gunshot();
        // Roughly one shot in three finds its mark.
        if (G.rng() < 0.34 && !player.inCar) {
          player.damage(9);
        } else if (G.rng() < 0.2 && player.inCar) {
          player.car.speed *= 0.9;
        }
      }
    }
  };

  return combat;
}
