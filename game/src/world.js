// Solmar Bay itself: a sun-soaked seaside city built from instanced meshes.
// One painted ground texture carries the roads, blocks and beach; the towers,
// houses, palms and lamps are instanced so the whole city costs few draw calls.
// The module also owns the collision boxes and the golden-hour lighting.

import * as THREE from 'three';
import {
  WORLD_HALF,
  ROADS,
  ROAD_STEP,
  ROAD_WIDTH,
  HIGHWAY_AT,
  BEACH_X,
  SEA_X,
  districtOf,
  randomIn,
  pickFrom,
} from './config.js';

function makeFacadeTexture(rng, floors, litChance) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8b7d6b';
  ctx.fillRect(0, 0, 128, 256);
  const cols = 6;
  const rows = floors;
  const cw = 128 / cols;
  const ch = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = rng() < litChance;
      ctx.fillStyle = lit ? '#ffd98a' : '#2c3a4a';
      ctx.fillRect(c * cw + 3, r * ch + 4, cw - 6, ch - 8);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function paintGroundTexture() {
  const size = 1024;
  const scale = size / (WORLD_HALF * 2);
  const toPx = (v) => (v + WORLD_HALF) * scale;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Grass base for the whole island.
  ctx.fillStyle = '#7a9155';
  ctx.fillRect(0, 0, size, size);

  // Sand on the west edge.
  ctx.fillStyle = '#d9c08a';
  ctx.fillRect(0, 0, toPx(BEACH_X) - toPx(-WORLD_HALF), size);

  // City blocks: pale sidewalks with a darker inner yard.
  ctx.fillStyle = '#b9b3a4';
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      const x0 = toPx(rx + ROAD_WIDTH / 2);
      const z0 = toPx(rz + ROAD_WIDTH / 2);
      const w = (ROAD_STEP - ROAD_WIDTH) * scale;
      ctx.fillRect(x0, z0, w, w);
      ctx.fillStyle = '#8fa06b';
      ctx.fillRect(x0 + 6, z0 + 6, w - 12, w - 12);
      ctx.fillStyle = '#b9b3a4';
    }
  }

  // The central park block stays green and open.
  const parkX = toPx(-32 - (ROAD_STEP - ROAD_WIDTH) / 2);
  const parkZ = toPx(-32 - (ROAD_STEP - ROAD_WIDTH) / 2);
  const parkW = (ROAD_STEP - ROAD_WIDTH) * scale;
  ctx.fillStyle = '#5d8148';
  ctx.fillRect(parkX, parkZ, parkW, parkW);

  // Asphalt streets.
  ctx.fillStyle = '#3a3a3f';
  for (const r of ROADS) {
    ctx.fillRect(toPx(r - ROAD_WIDTH / 2), 0, ROAD_WIDTH * scale, size);
    ctx.fillRect(0, toPx(r - ROAD_WIDTH / 2), size, ROAD_WIDTH * scale);
  }
  // The ring highway, wider and darker.
  const hw = 20 * scale;
  ctx.fillRect(toPx(-HIGHWAY_AT) - hw / 2, 0, hw, size);
  ctx.fillRect(toPx(HIGHWAY_AT) - hw / 2, 0, hw, size);
  ctx.fillRect(0, toPx(-HIGHWAY_AT) - hw / 2, size, hw);
  ctx.fillRect(0, toPx(HIGHWAY_AT) - hw / 2, size, hw);

  // Dashed centrelines on the streets.
  ctx.fillStyle = '#e8d44d';
  for (const r of ROADS) {
    for (let d = -WORLD_HALF; d < WORLD_HALF; d += 16) {
      ctx.fillRect(toPx(r) - 1, toPx(d), 2, 7 * scale);
      ctx.fillRect(toPx(d), toPx(r) - 1, 7 * scale, 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeSunTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255, 240, 200, 1)');
  grad.addColorStop(0.35, 'rgba(255, 190, 90, 0.9)');
  grad.addColorStop(1, 'rgba(255, 150, 50, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildWorld(G) {
  const rng = G.rng;
  const scene = G.scene;
  const world = {
    colliders: [],
    water: null,
    sunLight: null,
    clouds: [],
    update: null,
  };

  // Warm dusk sky, haze over the distance.
  scene.background = new THREE.Color(0xffc98a);
  scene.fog = new THREE.Fog(0xf2b878, 220, 700);

  const hemi = new THREE.HemisphereLight(0xffd9a8, 0x5a4a38, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb36b, 1.8);
  sun.position.set(-180, 120, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -130;
  sun.shadow.camera.right = 130;
  sun.shadow.camera.top = 130;
  sun.shadow.camera.bottom = -130;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  world.sunLight = sun;

  // The sun itself, low over the sea to the west.
  const sunSprite = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    new THREE.MeshBasicMaterial({
      map: makeSunTexture(),
      transparent: true,
      depthWrite: false,
      fog: false,
    }),
  );
  sunSprite.position.set(-420, 95, -40);
  sunSprite.lookAt(0, 60, 0);
  scene.add(sunSprite);

  // Ground: one big textured plane.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2),
    new THREE.MeshStandardMaterial({ map: paintGroundTexture(), roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // The sea, west of the beach: from the waterline out to the horizon.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(344, WORLD_HALF * 2),
    new THREE.MeshStandardMaterial({
      color: 0x3580aa,
      roughness: 0.15,
      metalness: 0.2,
      transparent: true,
      opacity: 0.94,
    }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(-468, 0.15, 0);
  sea.receiveShadow = true;
  scene.add(sea);
  world.water = sea;

  // The pier: planks out to sea at z = 0, with posts and a wider end deck.
  const pierWood = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.9 });
  const pierDeck = new THREE.Mesh(new THREE.BoxGeometry(56, 0.6, 12), pierWood);
  pierDeck.position.set(-300, 0.5, 0);
  pierDeck.castShadow = true;
  pierDeck.receiveShadow = true;
  scene.add(pierDeck);
  const pierEnd = new THREE.Mesh(new THREE.BoxGeometry(16, 0.6, 22), pierWood);
  pierEnd.position.set(-330, 0.5, 0);
  pierEnd.castShadow = true;
  pierEnd.receiveShadow = true;
  scene.add(pierEnd);
  const postGeo = new THREE.CylinderGeometry(0.35, 0.35, 3.4, 6);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x5d4630, roughness: 1 });
  const posts = new THREE.InstancedMesh(postGeo, postMat, 24);
  const m4 = new THREE.Matrix4();
  let pi = 0;
  for (let x = -296; x >= -336; x -= 8) {
    for (const z of [-5, 5]) {
      if (pi >= 24) break;
      m4.makeTranslation(x, -0.9, z);
      posts.setMatrixAt(pi, m4);
      pi += 1;
    }
  }
  posts.count = pi;
  scene.add(posts);

  // Buildings, two instanced meshes: towers and low houses.
  const towerTex = makeFacadeTexture(rng, 18, 0.35);
  const houseTex = makeFacadeTexture(rng, 2, 0.5);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const towerMat = new THREE.MeshStandardMaterial({ map: towerTex, roughness: 0.85 });
  const houseMat = new THREE.MeshStandardMaterial({ map: houseTex, roughness: 0.9 });
  const towerSpots = [];
  const houseSpots = [];
  const parkBlock = { x: -32, z: -32 };

  for (const rx of ROADS) {
    for (const rz of ROADS) {
      const bx = rx + ROAD_STEP / 2;
      const bz = rz + ROAD_STEP / 2;
      if (bx > 256 || bz > 256) continue;
      if (bx === parkBlock.x && bz === parkBlock.z) continue;
      const district = districtOf(bx, bz);
      const spots = [];
      if (district === 'downtown') {
        const w = randomIn(rng, 26, 38);
        const h = randomIn(rng, 34, 95);
        const d = randomIn(rng, 26, 38);
        spots.push({ x: bx, z: bz, w, h, d });
        if (rng() < 0.5) {
          spots.push({
            x: bx + randomIn(rng, -8, 8),
            z: bz + randomIn(rng, -8, 8),
            w: randomIn(rng, 18, 26),
            h: randomIn(rng, 20, 45),
            d: randomIn(rng, 18, 26),
          });
        }
      } else if (district === 'midtown') {
        for (let i = 0; i < 3; i++) {
          spots.push({
            x: bx + randomIn(rng, -12, 12),
            z: bz + randomIn(rng, -12, 12),
            w: randomIn(rng, 12, 18),
            h: randomIn(rng, 11, 26),
            d: randomIn(rng, 12, 18),
          });
        }
      } else {
        for (let i = 0; i < 4; i++) {
          spots.push({
            x: bx + randomIn(rng, -14, 14),
            z: bz + randomIn(rng, -14, 14),
            w: randomIn(rng, 9, 13),
            h: randomIn(rng, 5, 9),
            d: randomIn(rng, 9, 13),
          });
        }
      }
      for (const s of spots) {
        // Keep buildings off the beach strip.
        if (s.x - s.w / 2 < BEACH_X + 4) continue;
        const rec = { x: s.x, z: s.z, w: s.w, h: s.h, d: s.d };
        if (s.h >= 30) towerSpots.push(rec);
        else houseSpots.push(rec);
        world.colliders.push({
          minX: s.x - s.w / 2,
          maxX: s.x + s.w / 2,
          minZ: s.z - s.d / 2,
          maxZ: s.z + s.d / 2,
        });
      }
    }
  }

  function fillInstances(list, material) {
    const mesh = new THREE.InstancedMesh(boxGeo, material, Math.max(list.length, 1));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const pos = new THREE.Vector3();
    list.forEach((s, i) => {
      pos.set(s.x, 0, s.z);
      sc.set(s.w, s.h, s.d);
      m.compose(pos, q, sc);
      mesh.setMatrixAt(i, m);
    });
    mesh.count = list.length;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }
  fillInstances(towerSpots, towerMat);
  fillInstances(houseSpots, houseMat);

  // Palm trees along the beach and the park, two instanced meshes.
  const palmSpots = [];
  for (let z = -280; z <= 280; z += 28) {
    palmSpots.push({ x: BEACH_X + 6 + rng() * 8, z: z + randomIn(rng, -6, 6) });
  }
  for (let i = 0; i < 14; i++) {
    palmSpots.push({
      x: parkBlock.x + randomIn(rng, -18, 18),
      z: parkBlock.z + randomIn(rng, -18, 18),
    });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 7, 6);
  trunkGeo.translate(0, 3.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const crownGeo = new THREE.IcosahedronGeometry(2.6, 0);
  crownGeo.scale(1, 0.45, 1);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x3f7a34, roughness: 1 });
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, palmSpots.length);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sc = new THREE.Vector3(1, 1, 1);
    const pos = new THREE.Vector3();
    palmSpots.forEach((p, i) => {
      const lean = randomIn(rng, -0.08, 0.08);
      e.set(lean, rng() * Math.PI * 2, lean);
      q.setFromEuler(e);
      pos.set(p.x, 0, p.z);
      m.compose(pos, q, sc);
      trunks.setMatrixAt(i, m);
      pos.set(p.x, 7.2, p.z);
      m.compose(pos, q, sc);
      crowns.setMatrixAt(i, m);
    });
  }
  trunks.castShadow = true;
  crowns.castShadow = true;
  scene.add(trunks);
  scene.add(crowns);

  // Street lamps at road corners, glowing warm at dusk.
  const lampSpots = [];
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      lampSpots.push({ x: rx + 9, z: rz + 9 });
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 6, 5);
  poleGeo.translate(0, 3, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.6, metalness: 0.5 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  const bulbGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xffe6a8,
    emissive: 0xffc95e,
    emissiveIntensity: 1.6,
  });
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, lampSpots.length);
  {
    const m = new THREE.Matrix4();
    lampSpots.forEach((p, i) => {
      m.makeTranslation(p.x, 0, p.z);
      poles.setMatrixAt(i, m);
      m.makeTranslation(p.x, 6.1, p.z);
      bulbs.setMatrixAt(i, m);
    });
  }
  scene.add(poles);
  scene.add(bulbs);

  // A few drifting clouds, flat white blobs high up.
  const cloudMat = new THREE.MeshBasicMaterial({
    color: 0xfff2dd,
    transparent: true,
    opacity: 0.75,
    fog: false,
  });
  for (let i = 0; i < 8; i++) {
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(randomIn(rng, 18, 34), 8, 6), cloudMat);
    cloud.scale.y = 0.32;
    cloud.position.set(randomIn(rng, -320, 320), randomIn(rng, 110, 160), randomIn(rng, -320, 320));
    scene.add(cloud);
    world.clouds.push(cloud);
  }

  // Push a circle (player, car, ped) out of every building it overlaps.
  // Returns true when anything pushed, so callers can react (damage, stop).
  world.resolveCollision = function resolveCircleCollision(x, z, radius) {
    let hit = false;
    for (const c of world.colliders) {
      const nx = Math.max(c.minX, Math.min(x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - nx;
      const dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        hit = true;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = radius - d;
          x += (dx / d) * push;
          z += (dz / d) * push;
        } else {
          // Dead centre inside the box: shove out along the smallest axis.
          const left = x - c.minX;
          const right = c.maxX - x;
          const back = z - c.minZ;
          const front = c.maxZ - z;
          const m = Math.min(left, right, back, front);
          if (m === left) x = c.minX - radius;
          else if (m === right) x = c.maxX + radius;
          else if (m === back) z = c.minZ - radius;
          else z = c.maxZ + radius;
        }
      }
    }
    return { x, z, hit };
  };

  // The sea blocks movement, except on the pier walkway.
  world.isInWater = function isPointInWater(x, z) {
    if (x < SEA_X + 4) {
      if (Math.abs(z) <= 7 && x >= -340) return false;
      return true;
    }
    return false;
  };

  world.clampToCity = function clampPointToCity(x, z) {
    return {
      x: Math.max(-WORLD_HALF + 6, Math.min(WORLD_HALF - 6, x)),
      z: Math.max(-WORLD_HALF + 6, Math.min(WORLD_HALF - 6, z)),
    };
  };

  // A few handy named places for missions and spawning.
  world.places = {
    diner: { x: 0, z: 64 },
    garage: { x: -64, z: -128 },
    hideout: { x: -192, z: 192 },
    jewelry: { x: 128, z: 128 },
    bank: { x: -64, z: 64 },
    pierEnd: { x: -330, z: 0 },
    park: { x: -32, z: -32 },
    playerStart: { x: 0, z: 96 },
  };

  world.update = function updateWorld(dt, time, focus) {
    world.water.position.y = 0.15 + Math.sin(time * 0.6) * 0.08;
    for (const cloud of world.clouds) {
      cloud.position.x += dt * 1.2;
      if (cloud.position.x > 360) cloud.position.x = -360;
    }
    // Keep the shadow frustum centred on the action.
    if (focus) {
      world.sunLight.position.set(focus.x - 180, 120, focus.z + 80);
      world.sunLight.target.position.set(focus.x, 0, focus.z);
      world.sunLight.target.updateMatrixWorld();
    }
  };

  return world;
}
