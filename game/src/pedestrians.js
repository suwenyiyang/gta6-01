// Sidewalk walkers with a small panic state for gunfire, sirens and speeding cars.

import { CRIMINAL, TUNING } from './config.js';
import { isBlocked } from './world.js';

const TWO_PI = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class Pedestrian {
  constructor(world, rng, group) {
    this.group = group;
    this.routeIndex = rng.int(0, group.points.length - 1);
    this.routeDirection = rng.chance(0.5) ? 1 : -1;
    const origin = group.points[this.routeIndex];
    this.x = origin.x + rng.float(-5, 5);
    this.y = origin.y + rng.float(-5, 5);
    this.angle = rng.float(0, TWO_PI);
    this.targetAngle = this.angle;
    this.walkSpeed = rng.float(38, 66);
    this.runSpeed = rng.float(132, 186);
    this.speed = this.walkSpeed;
    this.state = 'walk';
    this.panicTimer = 0;
    this.idleTimer = rng.float(0, 2.5);
    this.threatX = this.x;
    this.threatY = this.y;
    this.phase = rng.float(0, TWO_PI);
    this.radius = 7;
    this.shirt = rng.pick(CRIMINAL.pedColors);
    this.pants = rng.pick(['#27313d', '#4a3f36', '#5e604c', '#253e45', '#6f5d55']);
    this.skin = rng.pick(CRIMINAL.skinColors);
    this.hair = rng.pick(CRIMINAL.hairColors);
    this.hat = rng.chance(0.17);
    this.bag = rng.chance(0.3);
    this.speedScale = rng.float(0.92, 1.08);
  }

  chooseNextPoint(rng) {
    if (rng.chance(0.13)) this.routeDirection *= -1;
    this.routeIndex = (this.routeIndex + this.routeDirection + this.group.points.length) % this.group.points.length;
  }
}

export function createPedestrians(world, rng, count = TUNING.pedestrianCount) {
  const pedestrians = [];
  const groups = world.pedestrianRouteGroups;
  if (!groups || groups.length === 0) return pedestrians;
  let attempts = 0;
  while (pedestrians.length < count && attempts < count * 24) {
    attempts += 1;
    const group = rng.pick(groups);
    const pedestrian = new Pedestrian(world, rng, group);
    if (isBlocked(pedestrian.x, pedestrian.y, world)) continue;
    if (pedestrians.some((other) => Math.hypot(other.x - pedestrian.x, other.y - pedestrian.y) < 15)) continue;
    pedestrians.push(pedestrian);
  }
  return pedestrians;
}

export function scarePedestrians(pedestrians, x, y, radius = 420, duration = 2.7) {
  const radiusSquared = radius * radius;
  for (const pedestrian of pedestrians) {
    const dx = pedestrian.x - x;
    const dy = pedestrian.y - y;
    if (dx * dx + dy * dy > radiusSquared) continue;
    pedestrian.state = 'flee';
    pedestrian.panicTimer = Math.max(pedestrian.panicTimer, duration);
    pedestrian.threatX = x;
    pedestrian.threatY = y;
    pedestrian.targetAngle = Math.atan2(dy, dx);
  }
}

function movePedestrian(pedestrian, dx, dy, dt, world) {
  const nextX = pedestrian.x + dx * dt;
  const nextY = pedestrian.y + dy * dt;
  if (!isBlocked(nextX, nextY, world)) {
    pedestrian.x = nextX;
    pedestrian.y = nextY;
    return true;
  }
  if (!isBlocked(nextX, pedestrian.y, world)) {
    pedestrian.x = nextX;
    pedestrian.y += dy * dt * 0.15;
    return true;
  }
  if (!isBlocked(pedestrian.x, nextY, world)) {
    pedestrian.y = nextY;
    pedestrian.x += dx * dt * 0.15;
    return true;
  }
  return false;
}

function updateWalking(pedestrian, dt, world, rng) {
  if (pedestrian.idleTimer > 0) {
    pedestrian.idleTimer -= dt;
    pedestrian.speed = Math.max(0, pedestrian.speed - 150 * dt);
    pedestrian.state = pedestrian.idleTimer > 0 ? 'idle' : 'walk';
    return;
  }
  const target = pedestrian.group.points[pedestrian.routeIndex];
  const dx = target.x - pedestrian.x;
  const dy = target.y - pedestrian.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 8) {
    pedestrian.chooseNextPoint(rng);
    if (rng.chance(0.23)) pedestrian.idleTimer = rng.float(0.7, 3.4);
    return;
  }
  pedestrian.targetAngle = Math.atan2(dy, dx);
  pedestrian.state = 'walk';
  pedestrian.speed += (pedestrian.walkSpeed * pedestrian.speedScale - pedestrian.speed) * Math.min(1, dt * 5);
  const stepX = Math.cos(pedestrian.targetAngle) * pedestrian.speed;
  const stepY = Math.sin(pedestrian.targetAngle) * pedestrian.speed;
  if (!movePedestrian(pedestrian, stepX, stepY, dt, world)) {
    pedestrian.targetAngle += Math.PI * 0.55;
  }
}

function updateFleeing(pedestrian, dt, world, scene, index) {
  pedestrian.panicTimer -= dt;
  pedestrian.state = 'flee';
  pedestrian.speed += (pedestrian.runSpeed * pedestrian.speedScale - pedestrian.speed) * Math.min(1, dt * 7);
  let angle = Math.atan2(pedestrian.y - pedestrian.threatY, pedestrian.x - pedestrian.threatX);
  if (!Number.isFinite(angle)) angle = pedestrian.angle;
  const wobble = Math.sin(scene.time * 4.6 + index * 1.7) * 0.25;
  pedestrian.targetAngle = angle + wobble;
  const stepX = Math.cos(pedestrian.targetAngle) * pedestrian.speed;
  const stepY = Math.sin(pedestrian.targetAngle) * pedestrian.speed;
  if (!movePedestrian(pedestrian, stepX, stepY, dt, world)) {
    pedestrian.targetAngle += Math.PI * 0.58;
    movePedestrian(pedestrian, Math.cos(pedestrian.targetAngle) * pedestrian.speed, Math.sin(pedestrian.targetAngle) * pedestrian.speed, dt, world);
  }
  if (pedestrian.panicTimer <= 0) {
    pedestrian.state = 'walk';
    pedestrian.speed = pedestrian.walkSpeed;
    pedestrian.chooseNextPoint(scene.random);
  }
}

function avoidTraffic(pedestrian, cars, scene) {
  for (const car of cars) {
    if (Math.abs(car.speed) < 188) continue;
    const dx = pedestrian.x - car.x;
    const dy = pedestrian.y - car.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 78) continue;
    pedestrian.state = 'flee';
    pedestrian.panicTimer = Math.max(pedestrian.panicTimer, 1.4);
    pedestrian.threatX = car.x + Math.cos(car.angle) * 45;
    pedestrian.threatY = car.y + Math.sin(car.angle) * 45;
    pedestrian.targetAngle = Math.atan2(dy, dx);
    if (distance < car.width * 0.62 + 6) {
      scene.streetEvents.push({ type: 'near-miss', x: pedestrian.x, y: pedestrian.y });
    }
    break;
  }
}

export function updatePedestrians(dt, scene) {
  const random = scene.random;
  for (let index = 0; index < scene.pedestrians.length; index += 1) {
    const pedestrian = scene.pedestrians[index];
    avoidTraffic(pedestrian, scene.cars, scene);
    if (pedestrian.state === 'flee' || pedestrian.panicTimer > 0) updateFleeing(pedestrian, dt, scene.world, scene, index);
    else updateWalking(pedestrian, dt, scene.world, random);

    pedestrian.phase += pedestrian.speed * dt * 0.09;
    const turn = Math.atan2(Math.sin(pedestrian.targetAngle - pedestrian.angle), Math.cos(pedestrian.targetAngle - pedestrian.angle));
    pedestrian.angle += clamp(turn, -6.5 * dt, 6.5 * dt);
    pedestrian.x = clamp(pedestrian.x, 8, scene.world.width - 8);
    pedestrian.y = clamp(pedestrian.y, 8, scene.world.height - 8);
  }
}
