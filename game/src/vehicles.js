// Arcade car physics, road-following traffic and wanted-level police pursuit.

import { CAR_TYPES, COLORS, ROAD, TUNING, WORLD } from './config.js';
import { isBlocked } from './world.js';

const TWO_PI = Math.PI * 2;
let nextCarId = 1;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, amount) => a + (b - a) * amount;
const wrapAngle = (angle) => {
  while (angle > Math.PI) angle -= TWO_PI;
  while (angle < -Math.PI) angle += TWO_PI;
  return angle;
};

const DIR_VECTORS = Object.freeze([
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
]);
const DIR_ANGLES = Object.freeze([0, Math.PI / 2, Math.PI, -Math.PI / 2]);

function rightVector(direction) {
  const vector = DIR_VECTORS[direction];
  return { x: -vector.y, y: vector.x };
}

function nodeCenter(i, j) {
  return { x: ROAD.xs[i], y: ROAD.ys[j] };
}

function nodeValid(i, j) {
  return i >= 0 && j >= 0 && i < ROAD.xs.length && j < ROAD.ys.length;
}

function nextNode(i, j, direction) {
  const vector = DIR_VECTORS[direction];
  return { i: i + vector.x, j: j + vector.y };
}

function nodeDirection(fromI, fromJ, toI, toJ) {
  if (toI > fromI) return 0;
  if (toJ > fromJ) return 1;
  if (toI < fromI) return 2;
  return 3;
}

function nearestNode(x, y) {
  let best = { i: 0, j: 0, distance: Infinity };
  for (let j = 0; j < ROAD.ys.length; j += 1) {
    for (let i = 0; i < ROAD.xs.length; i += 1) {
      const distance = Math.hypot(ROAD.xs[i] - x, ROAD.ys[j] - y);
      if (distance < best.distance) best = { i, j, distance };
    }
  }
  return best;
}

function pathBetween(start, target) {
  const startKey = `${start.i},${start.j}`;
  const targetKey = `${target.i},${target.j}`;
  const queue = [start];
  const seen = new Map([[startKey, null]]);
  while (queue.length > 0) {
    const current = queue.shift();
    const currentKey = `${current.i},${current.j}`;
    if (currentKey === targetKey) break;
    for (let direction = 0; direction < 4; direction += 1) {
      const next = nextNode(current.i, current.j, direction);
      const key = `${next.i},${next.j}`;
      if (!nodeValid(next.i, next.j) || seen.has(key)) continue;
      seen.set(key, current);
      queue.push(next);
    }
  }
  if (!seen.has(targetKey)) return [];
  const path = [];
  let cursor = { i: target.i, j: target.j };
  while (cursor) {
    path.push(cursor);
    cursor = seen.get(`${cursor.i},${cursor.j}`);
  }
  path.reverse();
  return path;
}

export class Car {
  constructor(type, x, y, angle = 0, options = {}) {
    this.id = nextCarId++;
    this.type = CAR_TYPES[type] ? type : 'sedan';
    this.spec = CAR_TYPES[this.type];
    this.x = x;
    this.y = y;
    this.angle = wrapAngle(angle);
    this.speed = options.speed ?? 0;
    this.lateral = 0;
    this.pushX = 0;
    this.pushY = 0;
    this.steer = 0;
    this.driver = options.driver ?? 'none';
    this.color = options.color ?? COLORS.cars[(this.id * 7) % COLORS.cars.length];
    this.ai = options.ai ?? null;
    this.length = this.spec.length;
    this.width = this.spec.width;
    this.radius = this.length * 0.42;
    this.handbrake = false;
    this.skidding = false;
    this.hitFlash = 0;
    this.crashThisFrame = 0;
    this.throttle = 0;
    this.damage = 0;
    this.lightPhase = (this.id * 0.37) % 2;
    this.stoppedFor = 0;
    this.wheelSpin = 0;
    this.name = options.name ?? this.spec.label;
  }
}

export function createCar(type, x, y, angle = 0, options = {}) {
  return new Car(type, x, y, angle, options);
}

export function createTrafficCar(world, rng, options = {}) {
  const roll = rng.next();
  let type = 'sedan';
  if (roll > 0.94) type = 'truck';
  else if (roll > 0.83) type = 'sports';
  else if (roll > 0.67) type = 'taxi';
  const vertical = rng.chance(0.5);
  let i;
  let j;
  let direction;
  let x;
  let y;
  let angle;

  if (vertical) {
    i = rng.int(0, ROAD.xs.length - 1);
    const segment = rng.int(0, ROAD.ys.length - 2);
    direction = rng.chance(0.5) ? 1 : 3;
    const fromY = ROAD.ys[segment] + 95;
    const toY = ROAD.ys[segment + 1] - 95;
    y = rng.float(fromY, toY);
    x = ROAD.xs[i] + rightVector(direction).x * ROAD.laneOffset;
    j = direction === 1 ? segment + 1 : segment;
    angle = DIR_ANGLES[direction];
  } else {
    j = rng.int(0, ROAD.ys.length - 1);
    const segment = rng.int(0, ROAD.xs.length - 2);
    direction = rng.chance(0.5) ? 0 : 2;
    const fromX = ROAD.xs[segment] + 95;
    const toX = ROAD.xs[segment + 1] - 95;
    x = rng.float(fromX, toX);
    y = ROAD.ys[j] + rightVector(direction).y * ROAD.laneOffset;
    i = direction === 0 ? segment + 1 : segment;
    angle = DIR_ANGLES[direction];
  }

  const color = type === 'taxi'
    ? '#e7b33f'
    : options.color ?? COLORS.cars[rng.int(0, COLORS.cars.length - 1)];
  const car = new Car(type, x, y, angle, {
    driver: 'ai',
    color,
    ai: {
      mode: 'traffic',
      i,
      j,
      dir: direction,
      pace: rng.float(0.68, 0.93),
      patience: rng.float(0, 4),
      turnBias: rng.float(0, 1),
      repathTimer: 0,
      path: null,
      pathIndex: 0,
      direct: false,
    },
  });
  car.speed = car.spec.maxSpeed * rng.float(0.24, 0.48);
  return car;
}

export function spawnTraffic(world, rng, count = TUNING.trafficCount) {
  const cars = [];
  let attempts = 0;
  while (cars.length < count && attempts < count * 30) {
    attempts += 1;
    const car = createTrafficCar(world, rng);
    if (cars.some((other) => Math.hypot(other.x - car.x, other.y - car.y) < 76)) continue;
    if (isBlocked(car.x, car.y, world)) continue;
    cars.push(car);
  }
  return cars;
}

export function spawnPolice(world, rng, nearX, nearY, existingCars, count = 1) {
  const cruisers = [];
  const candidates = [];
  for (const roadY of ROAD.ys) {
    for (const roadX of ROAD.xs) {
      candidates.push({ x: roadX, y: roadY });
    }
  }
  candidates.sort((a, b) => {
    const da = Math.hypot(a.x - nearX, a.y - nearY);
    const db = Math.hypot(b.x - nearX, b.y - nearY);
    return da - db;
  });
  for (let index = 0; index < count; index += 1) {
    let spot = null;
    for (let candidateIndex = 2; candidateIndex < candidates.length; candidateIndex += 1) {
      const candidate = candidates[(candidateIndex + index * 3) % candidates.length];
      const distance = Math.hypot(candidate.x - nearX, candidate.y - nearY);
      if (distance < 280 || distance > 1250) continue;
      const direction = rng.int(0, 3);
      const right = rightVector(direction);
      const x = candidate.x + right.x * ROAD.laneOffset;
      const y = candidate.y + right.y * ROAD.laneOffset;
      if (existingCars.some((car) => Math.hypot(car.x - x, car.y - y) < 72)) continue;
      spot = { x, y, direction };
      break;
    }
    if (!spot) continue;
    const startNode = nearestNode(spot.x, spot.y);
    const car = new Car('police', spot.x, spot.y, DIR_ANGLES[spot.direction], {
      driver: 'ai',
      color: '#e9e6d5',
      ai: {
        mode: 'police',
        i: startNode.i,
        j: startNode.j,
        dir: spot.direction,
        pace: rng.float(0.92, 1.04),
        repathTimer: 0,
        path: null,
        pathIndex: 0,
        direct: false,
        sirenOffset: rng.float(0, 1),
      },
    });
    car.speed = car.spec.maxSpeed * 0.35;
    cruisers.push(car);
    existingCars.push(car);
  }
  return cruisers;
}

function carCorners(car, x, y, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const halfLength = car.length * 0.46;
  const halfWidth = car.width * 0.46;
  const localPoints = [
    [halfLength, halfWidth], [halfLength, -halfWidth],
    [-halfLength, halfWidth], [-halfLength, -halfWidth],
    [0, 0],
  ];
  return localPoints.map(([localX, localY]) => ({
    x: x + localX * cosine - localY * sine,
    y: y + localX * sine + localY * cosine,
  }));
}

function carBlocked(world, car, x, y, angle) {
  return carCorners(car, x, y, angle).some((point) => isBlocked(point.x, point.y, world));
}

function stepCar(car, dt, world, controls) {
  const spec = car.spec;
  const throttle = clamp(controls.throttle ?? 0, -1, 1);
  const steerInput = clamp(controls.steer ?? 0, -1, 1);
  const handbrake = Boolean(controls.handbrake);
  const brakeOnly = Boolean(controls.brakeOnly);

  car.steer = lerp(car.steer, steerInput, 1 - Math.exp(-11 * dt));
  car.handbrake = handbrake;
  car.throttle = throttle;

  if (brakeOnly) {
    const braking = Math.min(Math.abs(car.speed), spec.brake * dt);
    car.speed -= Math.sign(car.speed) * braking;
  } else if (throttle > 0) {
    const acceleration = spec.accel * (1 - Math.abs(car.speed) / (spec.maxSpeed * 1.05));
    car.speed += Math.max(acceleration, spec.accel * 0.2) * throttle * dt;
  } else if (throttle < 0) {
    if (car.speed > 12) car.speed += spec.brake * throttle * dt;
    else car.speed += spec.accel * 0.58 * throttle * dt;
  } else {
    const drag = spec.brake * 0.08 + Math.abs(car.speed) * 0.42;
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), drag * dt);
  }

  car.speed = clamp(car.speed, -spec.reverseSpeed, spec.maxSpeed);
  if (Math.abs(car.speed) < 1.5 && Math.abs(throttle) < 0.1) car.speed = 0;

  const speedFactor = clamp(Math.abs(car.speed) / 130, 0.1, 1);
  const directionSign = car.speed < -2 ? -1 : 1;
  const grip = handbrake ? 0.64 : 0.95;
  const turn = car.steer * spec.turnRate * speedFactor * directionSign * dt;
  car.angle = wrapAngle(car.angle + turn * (handbrake ? 1.32 : 1));

  const targetLateral = handbrake
    ? -car.steer * Math.min(Math.abs(car.speed), 330) * 0.44
    : -car.steer * Math.abs(car.speed) * 0.055;
  car.lateral = lerp(car.lateral, targetLateral, 1 - Math.exp(-(handbrake ? 2.7 : 8.5) * dt));
  car.lateral *= Math.exp(-(handbrake ? 1.1 : 3.8) * dt);
  if (Math.abs(car.lateral) < 1) car.lateral = 0;

  const sideways = car.angle + Math.PI / 2;
  const dx = Math.cos(car.angle) * car.speed * dt + Math.cos(sideways) * car.lateral * dt + car.pushX * dt;
  const dy = Math.sin(car.angle) * car.speed * dt + Math.sin(sideways) * car.lateral * dt + car.pushY * dt;
  car.pushX *= Math.exp(-5.5 * dt);
  car.pushY *= Math.exp(-5.5 * dt);
  car.skidding = handbrake && Math.abs(car.speed) > 72;
  car.wheelSpin += Math.abs(car.speed) * dt * 0.025;

  const nextX = car.x + dx;
  const nextY = car.y + dy;
  if (!carBlocked(world, car, nextX, nextY, car.angle)) {
    car.x = nextX;
    car.y = nextY;
    car.crashThisFrame = Math.max(car.crashThisFrame, 0);
  } else if (!carBlocked(world, car, nextX, car.y, car.angle)) {
    car.x = nextX;
    car.speed *= 0.54;
    car.lateral *= 0.45;
    car.crashThisFrame = Math.max(car.crashThisFrame, Math.min(1, Math.abs(car.speed) / 120));
  } else if (!carBlocked(world, car, car.x, nextY, car.angle)) {
    car.y = nextY;
    car.speed *= 0.54;
    car.lateral *= 0.45;
    car.crashThisFrame = Math.max(car.crashThisFrame, Math.min(1, Math.abs(car.speed) / 120));
  } else {
    car.crashThisFrame = Math.max(car.crashThisFrame, Math.min(1.2, Math.abs(car.speed) / 100));
    car.speed *= -0.2;
    car.lateral *= -0.16;
  }
  car.hitFlash = Math.max(0, car.hitFlash - dt * 4.5);
  car.damage = Math.min(1, car.damage + Math.max(0, car.crashThisFrame) * dt * 0.34);
}

function isLightGreen(direction, node, time) {
  const horizontal = direction === 0 || direction === 2;
  const offset = ((node.i * 0.73 + node.j * 1.17) % 2.4);
  const cycle = (time + offset) % 9.4;
  return horizontal ? cycle < 4.4 : cycle >= 4.8;
}

function routeTraffic(car, dt, world, cars, rng, time) {
  const ai = car.ai;
  if (!ai) return;
  let node = nodeCenter(ai.i, ai.j);
  let right = rightVector(ai.dir);
  let targetX = node.x + right.x * ROAD.laneOffset;
  let targetY = node.y + right.y * ROAD.laneOffset;
  let distance = Math.hypot(targetX - car.x, targetY - car.y);

  if (distance < 38) {
    const turns = [];
    const straight = nextNode(ai.i, ai.j, ai.dir);
    if (nodeValid(straight.i, straight.j)) turns.push({ direction: ai.dir, weight: 0.62 });
    const rightTurn = (ai.dir + 1) % 4;
    const rightNode = nextNode(ai.i, ai.j, rightTurn);
    if (nodeValid(rightNode.i, rightNode.j)) turns.push({ direction: rightTurn, weight: 0.19 });
    const leftTurn = (ai.dir + 3) % 4;
    const leftNode = nextNode(ai.i, ai.j, leftTurn);
    if (nodeValid(leftNode.i, leftNode.j)) turns.push({ direction: leftTurn, weight: 0.19 });
    if (turns.length === 0) {
      ai.dir = (ai.dir + 2) % 4;
    } else {
      let roll = rng.float(0, turns.reduce((sum, entry) => sum + entry.weight, 0));
      for (const entry of turns) {
        roll -= entry.weight;
        if (roll <= 0) {
          ai.dir = entry.direction;
          break;
        }
      }
    }
    const next = nextNode(ai.i, ai.j, ai.dir);
    if (nodeValid(next.i, next.j)) {
      ai.i = next.i;
      ai.j = next.j;
    }
    node = nodeCenter(ai.i, ai.j);
    right = rightVector(ai.dir);
    targetX = node.x + right.x * ROAD.laneOffset;
    targetY = node.y + right.y * ROAD.laneOffset;
    distance = Math.hypot(targetX - car.x, targetY - car.y);
  }

  const desiredAngle = Math.atan2(targetY - car.y, targetX - car.x);
  const angleDifference = wrapAngle(desiredAngle - car.angle);
  const steer = clamp(angleDifference * 2.35, -1, 1);
  let desiredSpeed = car.spec.maxSpeed * (ai.pace ?? 0.8);

  const nodeDistance = Math.hypot(node.x - car.x, node.y - car.y);
  if (nodeDistance < 118 && nodeDistance > 60 && !isLightGreen(ai.dir, ai, time)) {
    desiredSpeed = Math.min(desiredSpeed, Math.max(0, (nodeDistance - 58) * 3.4));
  }
  if (Math.abs(angleDifference) > 0.55) desiredSpeed *= 0.52;
  if (Math.abs(angleDifference) > 1.2) desiredSpeed *= 0.45;

  const forwardX = Math.cos(car.angle);
  const forwardY = Math.sin(car.angle);
  const lookAhead = 52 + Math.abs(car.speed) * 0.36;
  for (const other of cars) {
    if (other === car) continue;
    const deltaX = other.x - car.x;
    const deltaY = other.y - car.y;
    const ahead = deltaX * forwardX + deltaY * forwardY;
    const side = Math.abs(deltaX * -forwardY + deltaY * forwardX);
    if (ahead > 8 && ahead < lookAhead && side < 31) {
      desiredSpeed = Math.min(desiredSpeed, Math.max(0, (ahead - 30) * 2.8));
    }
  }

  const error = desiredSpeed - car.speed;
  let throttle = 0;
  let brakeOnly = false;
  if (error > 16) throttle = clamp(error / 80, 0.12, 1);
  else if (error < -20) brakeOnly = true;
  if (desiredSpeed < 4) brakeOnly = true;

  stepCar(car, dt, world, { throttle, steer, handbrake: false, brakeOnly });
  car.stoppedFor = Math.abs(car.speed) < 5 ? car.stoppedFor + dt : 0;
}

function directTargetForPolice(car, player) {
  const playerX = player.inCar ? player.car.x : player.x;
  const playerY = player.inCar ? player.car.y : player.y;
  return { x: playerX, y: playerY, distance: Math.hypot(playerX - car.x, playerY - car.y) };
}

function routePolice(car, dt, world, cars, player, wanted) {
  const ai = car.ai;
  if (!ai) return;
  if (wanted <= 0) {
    stepCar(car, dt, world, { throttle: 0, steer: 0, handbrake: false, brakeOnly: true });
    return;
  }
  const target = directTargetForPolice(car, player);
  ai.repathTimer -= dt;

  let targetX = target.x;
  let targetY = target.y;
  ai.direct = target.distance < 330;

  if (!ai.direct) {
    if (ai.repathTimer <= 0 || !ai.path || ai.pathIndex >= ai.path.length) {
      const start = nearestNode(car.x, car.y);
      const destination = nearestNode(target.x, target.y);
      ai.path = pathBetween(start, destination);
      ai.pathIndex = ai.path.length > 1 ? 1 : 0;
      ai.repathTimer = 0.7;
    }
    if (ai.path && ai.path.length > 0) {
      while (ai.pathIndex < ai.path.length) {
        const node = ai.path[ai.pathIndex];
        const center = nodeCenter(node.i, node.j);
        if (Math.hypot(center.x - car.x, center.y - car.y) < 46 && ai.pathIndex < ai.path.length - 1) ai.pathIndex += 1;
        else break;
      }
      const node = ai.path[Math.min(ai.pathIndex, ai.path.length - 1)];
      const center = nodeCenter(node.i, node.j);
      const previous = ai.path[Math.max(0, ai.pathIndex - 1)];
      ai.dir = nodeDirection(previous.i, previous.j, node.i, node.j);
      const right = rightVector(ai.dir);
      targetX = center.x + right.x * ROAD.laneOffset;
      targetY = center.y + right.y * ROAD.laneOffset;
    }
  }

  const desiredAngle = Math.atan2(targetY - car.y, targetX - car.x);
  const angleDifference = wrapAngle(desiredAngle - car.angle);
  const steer = clamp(angleDifference * 2.9, -1, 1);
  let desiredSpeed = car.spec.maxSpeed * (ai.pace ?? 1) * (ai.direct ? 0.95 : 0.83);
  if (Math.abs(angleDifference) > 0.75) desiredSpeed *= 0.52;
  if (ai.direct && target.distance < 82) desiredSpeed = Math.min(desiredSpeed, 100);

  const forwardX = Math.cos(car.angle);
  const forwardY = Math.sin(car.angle);
  for (const other of cars) {
    if (other === car || other.driver === 'player') continue;
    const deltaX = other.x - car.x;
    const deltaY = other.y - car.y;
    const ahead = deltaX * forwardX + deltaY * forwardY;
    const side = Math.abs(deltaX * -forwardY + deltaY * forwardX);
    if (ahead > 10 && ahead < 95 && side < 30) desiredSpeed = Math.min(desiredSpeed, Math.max(20, (ahead - 34) * 3));
  }

  const error = desiredSpeed - car.speed;
  let throttle = 0;
  let brakeOnly = false;
  if (error > 18) throttle = clamp(error / 85, 0.1, 1);
  else if (error < -24) brakeOnly = true;
  stepCar(car, dt, world, { throttle, steer, handbrake: false, brakeOnly });
}

function resolveCarCollisions(cars, scene) {
  for (let first = 0; first < cars.length; first += 1) {
    const a = cars[first];
    for (let second = first + 1; second < cars.length; second += 1) {
      const b = cars[second];
      const deltaX = b.x - a.x;
      const deltaY = b.y - a.y;
      const distance = Math.hypot(deltaX, deltaY);
      const minimum = a.radius + b.radius;
      if (distance >= minimum || distance < 0.001) continue;
      const normalX = deltaX / distance;
      const normalY = deltaY / distance;
      const overlap = minimum - distance;
      const massA = a.spec.mass;
      const massB = b.spec.mass;
      const totalMass = massA + massB;
      a.x -= normalX * overlap * (massB / totalMass);
      a.y -= normalY * overlap * (massB / totalMass);
      b.x += normalX * overlap * (massA / totalMass);
      b.y += normalY * overlap * (massA / totalMass);
      const relative = Math.abs(a.speed - b.speed);
      const impact = clamp((relative + 80) / 360, 0.08, 1);
      a.speed *= 0.71;
      b.speed *= 0.71;
      a.lateral -= normalX * -Math.sin(a.angle) * 55 * impact;
      a.lateral -= normalY * Math.cos(a.angle) * 55 * impact;
      b.lateral += normalX * -Math.sin(b.angle) * 55 * impact;
      b.lateral += normalY * Math.cos(b.angle) * 55 * impact;
      a.pushX -= normalX * 85 * impact;
      a.pushY -= normalY * 85 * impact;
      b.pushX += normalX * 85 * impact;
      b.pushY += normalY * 85 * impact;
      a.hitFlash = Math.max(a.hitFlash, impact);
      b.hitFlash = Math.max(b.hitFlash, impact);
      const impactPointX = (a.x + b.x) * 0.5;
      const impactPointY = (a.y + b.y) * 0.5;
      scene.crashes.push({ x: impactPointX, y: impactPointY, power: impact, a, b });
    }
  }
}

export function updateCars(dt, scene, playerControls = null, rng = null) {
  const { world, cars, player } = scene;
  scene.crashes.length = 0;
  const random = rng ?? world.rng;

  for (const car of cars) {
    if (car.driver === 'player' && playerControls) {
      stepCar(car, dt, world, playerControls);
    } else if (car.ai?.mode === 'police') {
      routePolice(car, dt, world, cars, player, scene.wanted ?? 0);
    } else if (car.ai?.mode === 'traffic') {
      routeTraffic(car, dt, world, cars, random, scene.time);
    } else if (Math.abs(car.speed) > 1) {
      stepCar(car, dt, world, { throttle: 0, steer: 0, handbrake: false });
    }
    if (car.crashThisFrame > 0.05) {
      scene.crashes.push({ x: car.x, y: car.y, power: car.crashThisFrame, a: car, b: null });
      car.crashThisFrame = 0;
    }
  }
  resolveCarCollisions(cars, scene);
  for (const car of cars) {
    if (car.hitFlash > 0.02) scene.particles.push({
      type: 'spark',
      x: car.x + Math.cos(car.angle) * car.length * 0.35,
      y: car.y + Math.sin(car.angle) * car.length * 0.35,
      vx: random.float(-75, 75),
      vy: random.float(-75, 75),
      life: 0.22,
      maxLife: 0.22,
      color: '#ffd27b',
      size: random.float(1.5, 3),
    });
  }
}

export function enterCar(car, player) {
  if (!car || car.driver === 'player') return false;
  car.driver = 'player';
  car.ai = null;
  car.handbrake = false;
  player.inCar = true;
  player.car = car;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  return true;
}

export function exitCar(player, cars, world) {
  const car = player.car;
  if (!car) return false;
  const sideAngle = car.angle + Math.PI / 2;
  const offsets = [34, -34, 52, -52];
  let found = null;
  for (const offset of offsets) {
    const x = car.x + Math.cos(sideAngle) * offset;
    const y = car.y + Math.sin(sideAngle) * offset;
    if (!isBlocked(x, y, world)) {
      found = { x, y };
      break;
    }
  }
  if (!found) found = { x: car.x, y: car.y };
  car.driver = 'none';
  car.speed = Math.min(Math.abs(car.speed) * 0.32, 35);
  car.lateral = 0;
  player.inCar = false;
  player.car = null;
  player.x = found.x;
  player.y = found.y;
  player.angle = sideAngle;
  for (const other of cars) {
    if (other !== car && Math.hypot(other.x - player.x, other.y - player.y) < other.radius + 12) {
      player.x += 18;
      player.y += 8;
    }
  }
  return true;
}

export function nearestCar(cars, x, y, maxDistance = TUNING.interactDistance) {
  let best = null;
  let bestDistance = maxDistance;
  for (const car of cars) {
    if (car.driver === 'player') continue;
    const distance = Math.hypot(car.x - x, car.y - y);
    if (distance < bestDistance) {
      best = car;
      bestDistance = distance;
    }
  }
  return best;
}

export function speedKmh(car) {
  return Math.abs(car.speed) * 0.58;
}

export function carLightState(car, time) {
  if (car.type !== 'police') return 0;
  return Math.floor((time * 4.2 + car.lightPhase) % 2);
}

export function removePlayerFromCar(player) {
  if (!player.car) return;
  player.car.driver = 'none';
  player.car = null;
  player.inCar = false;
}

export function worldEdgeCheck(car) {
  return car.x < 12 || car.y < 12 || car.x > WORLD.width - 12 || car.y > WORLD.height - 12;
}
