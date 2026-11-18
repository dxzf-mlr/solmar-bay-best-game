// Deterministic staging for screenshots: ?shot=start|drive|chase|mission
// with an optional ?seed= puts the game into a fixed, readable scene, so the
// screenshots are real renders of the game in a browser. Seeded traffic and
// pedestrians come from G.rng, which main.js seeds from the URL.

export function applyShotStaging(G) {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (!shot) return null;

  const world = G.world;
  const player = G.player;

  if (shot === 'start') {
    // The title screen over a slow orbit of the city at golden hour.
    player.pos.set(0, 0, 96);
    player.group.position.copy(player.pos);
    player.cameraYaw = Math.PI * 0.85;
    player.cameraPitch = 0.42;
    G.setState('menu');
    return 'start';
  }

  if (shot === 'drive') {
    // Dana in her car, cruising the central avenue between the towers.
    const car = G.vehicles.spawnPlayerCar();
    car.pos.set(0, 0, 120);
    car.heading = Math.PI;
    car.speed = 22;
    car.group.position.copy(car.pos);
    car.group.rotation.y = car.heading;
    player.inCar = true;
    player.car = car;
    G.vehicles.playerCar = car;
    player.group.visible = false;
    G.setState('playing');
    G.hud.showMessage('Solmar Bay — drive the coast road.');
    return 'drive';
  }

  if (shot === 'chase') {
    // Three stars, two police cars closing in, a mission objective on screen.
    const car = G.vehicles.spawnPlayerCar();
    car.pos.set(0, 0, 64);
    car.heading = Math.PI;
    car.speed = 26;
    car.group.position.copy(car.pos);
    car.group.rotation.y = car.heading;
    player.inCar = true;
    player.car = car;
    G.vehicles.playerCar = car;
    player.group.visible = false;
    // Mission 4 in progress: the objective line and the beacon show.
    G.missions.currentIndex = 3;
    G.missions.status = 'active';
    G.missions.stepIndex = 2;
    G.missions.beginStep();
    G.police.setWanted(3);
    for (let i = 0; i < 2; i++) {
      const angle = Math.PI + (i - 0.5) * 0.7;
      const pc = G.vehicles.spawnCar(
        car.pos.x + Math.sin(angle) * 26,
        car.pos.z + Math.cos(angle) * 26,
        angle,
        { police: true },
      );
      pc.speed = 24;
      G.police.cars.push(pc);
    }
    G.setState('playing');
    G.hud.showMessage('Three stars! Lose the cops and reach the safe house.');
    return 'chase';
  }

  if (shot === 'mission') {
    // Mission 5 at the pier: Dana on foot, the deal gone wrong, enemies in view.
    G.missions.currentIndex = 4;
    G.missions.status = 'active';
    G.missions.stepIndex = 1;
    player.pos.set(-300, 0, 0);
    player.heading = -Math.PI / 2;
    player.cameraYaw = -Math.PI / 2;
    player.group.position.copy(player.pos);
    player.group.rotation.y = player.heading;
    G.missions.beginStep();
    G.setState('playing');
    G.hud.showMessage('Harbor Deal: survive the ambush.');
    return 'mission';
  }

  return null;
}

// Read the seed from the URL (?seed=12) or fall back to a fixed default so
// a plain load is stable too.
export function readSeedFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = Number(params.get('seed'));
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return 20261118;
}
