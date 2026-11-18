// Street traffic: AI cars that cruise rectangular loops around city blocks,
// slow down for the car ahead, and brake when the player blocks the road.
// A stolen traffic car leaves the flow and a fresh one joins at the edge.

import { ROADS, ROAD_STEP, BALANCE, randomIn, pickFrom } from './config.js';

export function createTraffic(G) {
  const traffic = {
    cars: [],
    count: 12,
  };

  // A loop is a rectangle of road centrelines around one block.
  function makeLoopRoute(rng) {
    const ix = Math.floor(rng() * 8);
    const iz = Math.floor(rng() * 8);
    const x0 = ROADS[ix];
    const x1 = ROADS[ix + 1];
    const z0 = ROADS[iz];
    const z1 = ROADS[iz + 1];
    const clockwise = rng() < 0.5;
    const corners = clockwise
      ? [
          { x: x0, z: z0 },
          { x: x1, z: z0 },
          { x: x1, z: z1 },
          { x: x0, z: z1 },
        ]
      : [
          { x: x0, z: z0 },
          { x: x0, z: z1 },
          { x: x1, z: z1 },
          { x: x1, z: z0 },
        ];
    return corners;
  }

  traffic.spawnOne = function spawnTrafficCar() {
    const route = makeLoopRoute(G.rng);
    const start = route[0];
    const car = G.vehicles.spawnCar(start.x, start.z, 0, { traffic: true });
    car.route = route;
    car.routeIndex = 1;
    car.cruiseSpeed = randomIn(G.rng, BALANCE.trafficSpeed * 0.8, BALANCE.trafficSpeed * 1.2);
    car.stopped = 0;
    traffic.cars.push(car);
    return car;
  };

  traffic.init = function initTraffic() {
    for (let i = 0; i < traffic.count; i++) {
      traffic.spawnOne();
    }
  };

  function steerToward(car, target, dt) {
    const desired = Math.atan2(target.x - car.pos.x, target.z - car.pos.z);
    let diff = desired - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
    car.heading += turn;
    return Math.abs(diff);
  }

  traffic.update = function updateTraffic(dt) {
    for (const car of [...traffic.cars]) {
      if (car.dead) continue;
      if (!car.traffic) {
        // Stolen or claimed: drop out of the flow.
        traffic.cars.splice(traffic.cars.indexOf(car), 1);
        continue;
      }
      const target = car.route[car.routeIndex];
      const distToTarget = Math.hypot(target.x - car.pos.x, target.z - car.pos.z);
      if (distToTarget < 4) {
        car.routeIndex = (car.routeIndex + 1) % car.route.length;
      }

      // Brake for whatever is directly ahead (car or player).
      let blocked = false;
      const aheadX = car.pos.x + Math.sin(car.heading) * 9;
      const aheadZ = car.pos.z + Math.cos(car.heading) * 9;
      for (const other of G.vehicles.list) {
        if (other === car || other.dead) continue;
        if (Math.hypot(other.pos.x - aheadX, other.pos.z - aheadZ) < 4.5) {
          blocked = true;
          break;
        }
      }
      if (!blocked && !G.player.inCar) {
        if (Math.hypot(G.player.pos.x - aheadX, G.player.pos.z - aheadZ) < 3) blocked = true;
      }

      if (blocked) {
        car.speed = Math.max(0, car.speed - 20 * dt);
      } else {
        car.speed = Math.min(car.cruiseSpeed, car.speed + 8 * dt);
      }

      steerToward(car, target, dt);
      car.pos.x += Math.sin(car.heading) * car.speed * dt;
      car.pos.z += Math.cos(car.heading) * car.speed * dt;

      // Keep them on the roads: a wrong turn is corrected by the next corner.
      const fixed = G.world.resolveCollision(car.pos.x, car.pos.z, car.radius);
      car.pos.x = fixed.x;
      car.pos.z = fixed.z;

      car.group.position.copy(car.pos);
      car.group.rotation.y = car.heading;
      for (const wheel of car.wheels) {
        wheel.rotation.x += (car.speed * dt) / 0.36;
      }
    }

    // Top the flow back up when cars are stolen.
    while (traffic.cars.length < traffic.count) {
      traffic.spawnOne();
    }
  };

  // The nearest drivable car to a point, for missions that need a target car.
  traffic.nearestCarTo = function nearestCarTo(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of G.vehicles.list) {
      if (car.police || car.dead) continue;
      const d = Math.hypot(car.pos.x - x, car.pos.z - z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  };

  return traffic;
}
