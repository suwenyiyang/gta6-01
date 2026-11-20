// Deterministic screenshot stages. Each scene is built from a seeded world and then
// advanced through the same physics and AI functions the playable loop uses.

import { GAME_STATE, ROAD, TUNING } from './config.js';
import { createRandom, hashString } from './random.js';
import { createCar, enterCar, spawnTraffic, updateCars } from './vehicles.js';
import { createPedestrians, updatePedestrians } from './pedestrians.js';
import { createPlayer } from './player.js';
import { isBlocked } from './world.js';

const STEP = TUNING.fixedStep;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function makeStageScene(world, seed) {
  const random = createRandom(seed);
  const player = createPlayer(world);
  player.cash = 420;
  const cars = spawnTraffic(world, random, TUNING.trafficCount);
  const pedestrians = createPedestrians(world, random, TUNING.pedestrianCount);
  return {
    world,
    random,
    player,
    cars,
    pedestrians,
    particles: [],
    skids: [],
    bullets: [],
    crashes: [],
    streetEvents: [],
    wanted: 0,
    missionIndex: 0,
    time: 0,
    muted: false,
    frozen: true,
    shotName: '',
  };
}

function removeCarsNear(cars, x, y, radius) {
  return cars.filter((car) => Math.hypot(car.x - x, car.y - y) > radius);
}

function playerSportsCar(scene, x, y, angle = 0) {
  scene.cars = removeCarsNear(scene.cars, x, y, 145);
  const car = createCar('sports', x, y, angle, {
    driver: 'none',
    color: '#dd6855',
    name: 'Tidebreak',
  });
  scene.cars.push(car);
  enterCar(car, scene.player);
  return car;
}

function driveControls(car, index) {
  const laneY = Math.round(car.y) + 0;
  const desiredAngle = Math.atan2((laneY - car.y) * 0.16, 450);
  const angleError = wrapAngle(desiredAngle - car.angle);
  const steering = clamp(angleError * 2.4 + Math.sin(index * 0.013) * 0.015, -1, 1);
  const brakePulse = index > 94 && index < 110;
  return {
    throttle: brakePulse ? 0 : (car.speed < 300 ? 1 : 0.15),
    steer: steering,
    handbrake: brakePulse,
  };
}

function chaseControls(car, index) {
  const weave = Math.sin(index * 0.023) * 12;
  const desiredAngle = Math.atan2((ROAD.ys[2] + ROAD.laneOffset + weave - car.y) * 0.14, 420);
  const angleError = wrapAngle(desiredAngle - car.angle);
  return {
    throttle: car.speed < 335 ? 1 : 0.16,
    steer: clamp(angleError * 2.6, -1, 1),
    handbrake: index > 108 && index < 119,
  };
}

function addDrivingEffects(scene, car, index) {
  if (!car || index % 2 !== 0) return;
  if (car.skidding) {
    scene.skids.push({ x: car.x, y: car.y, angle: car.angle, alpha: 0.3 });
    scene.particles.push({
      type: 'dust',
      x: car.x - Math.cos(car.angle) * car.length * 0.42 + (scene.random.next() - 0.5) * 20,
      y: car.y - Math.sin(car.angle) * car.length * 0.42 + (scene.random.next() - 0.5) * 12,
      vx: -Math.cos(car.angle) * 28 + (scene.random.next() - 0.5) * 34,
      vy: -Math.sin(car.angle) * 28 + (scene.random.next() - 0.5) * 34,
      life: 0.65,
      maxLife: 0.65,
      color: '#d7bd8d',
      size: 7,
      alpha: 0.42,
    });
  } else if (Math.abs(car.speed) > 180 && index % 9 === 0) {
    scene.particles.push({
      type: 'dust',
      x: car.x - Math.cos(car.angle) * car.length * 0.48,
      y: car.y - Math.sin(car.angle) * car.length * 0.48,
      vx: -Math.cos(car.angle) * 12,
      vy: -Math.sin(car.angle) * 12,
      life: 0.38,
      maxLife: 0.38,
      color: '#cdb786',
      size: 4.5,
      alpha: 0.28,
    });
  }
}

function advanceEffects(scene, dt) {
  for (const particle of scene.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= Math.exp(-2.2 * dt);
    particle.vy *= Math.exp(-2.2 * dt);
    particle.life -= dt;
  }
  scene.particles = scene.particles.filter((particle) => particle.life > 0);
  for (const skid of scene.skids) skid.alpha = Math.max(0.05, skid.alpha - dt * 0.008);
  scene.skids = scene.skids.slice(-240);
}

function simulate(scene, seconds, options = {}) {
  const steps = Math.round(seconds / STEP);
  for (let index = 0; index < steps; index += 1) {
    scene.time += STEP;
    let carControls = null;
    if (scene.player.inCar && scene.player.car && options.carControls) {
      carControls = options.carControls(scene.player.car, index);
    }
    updateCars(STEP, scene, carControls, scene.random);
    if (!scene.player.inCar && options.footControls) {
      scene.player.updateOnFoot(STEP, options.footControls(scene.player, index), scene.world);
    } else {
      scene.player.updateTimers(STEP);
    }
    updatePedestrians(STEP, scene);
    scene.streetEvents.length = 0;
    addDrivingEffects(scene, scene.player.car, index);
    advanceEffects(scene, STEP);
  }
}

function focusOnPlayer(scene) {
  const x = scene.player.inCar && scene.player.car ? scene.player.car.x : scene.player.x;
  const y = scene.player.inCar && scene.player.car ? scene.player.car.y : scene.player.y;
  return { x, y };
}

function stageStart(scene) {
  scene.missionIndex = 0;
  const parked = createCar('sedan', scene.world.start.carX, scene.world.start.carY, 0, {
    driver: 'none',
    color: '#e1d4b4',
    name: 'Sedan',
  });
  scene.cars.push(parked);
  scene.player.x = scene.world.start.x;
  scene.player.y = scene.world.start.y;
  scene.player.angle = -Math.PI / 2;
  simulate(scene, 1.2);
  const focus = focusOnPlayer(scene);
  return {
    name: 'start',
    state: GAME_STATE.TITLE,
    scene,
    focus: { x: focus.x, y: focus.y + 150 },
    frozen: true,
  };
}

function stageDrive(scene) {
  const x = ROAD.xs[2] + 145;
  const y = ROAD.ys[2] + ROAD.laneOffset;
  const car = playerSportsCar(scene, x, y, 0);
  car.speed = 136;
  scene.missionIndex = 1;
  simulate(scene, 2.55, { carControls: driveControls });
  return {
    name: 'drive',
    state: GAME_STATE.PLAY,
    scene,
    focus: focusOnPlayer(scene),
    frozen: true,
  };
}

function stageChase(scene) {
  const x = ROAD.xs[4] + 80;
  const y = ROAD.ys[2] + ROAD.laneOffset;
  const car = playerSportsCar(scene, x, y, 0);
  car.speed = 205;
  scene.missionIndex = 2;
  scene.wanted = 2;

  scene.cars.push(createCar('police', x - 170, y, 0, {
    driver: 'ai',
    color: '#e9e6d5',
    ai: {
      mode: 'police', i: 3, j: 2, dir: 0, pace: 1.0,
      repathTimer: 0, path: null, pathIndex: 0, direct: false, sirenOffset: 0.1,
    },
  }));
  scene.cars.push(createCar('police', x - 266, y - 2, 0, {
    driver: 'ai',
    color: '#e9e6d5',
    ai: {
      mode: 'police', i: 3, j: 2, dir: 0, pace: 0.96,
      repathTimer: 0, path: null, pathIndex: 0, direct: false, sirenOffset: 0.7,
    },
  }));
  simulate(scene, 2.8, { carControls: chaseControls });
  return {
    name: 'chase',
    state: GAME_STATE.PLAY,
    scene,
    focus: focusOnPlayer(scene),
    frozen: true,
  };
}

function stageMission(scene) {
  const spot = scene.world.missionSpots[0];
  scene.missionIndex = 0;
  scene.wanted = 0;
  let startX = spot.x - 116;
  let startY = spot.y + 12;
  const approachDistance = 116;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const angle = Math.PI + attempt * (Math.PI / 8);
    const candidateX = spot.x + Math.cos(angle) * approachDistance;
    const candidateY = spot.y + Math.sin(angle) * approachDistance;
    let clear = !isBlocked(candidateX, candidateY, scene.world);
    for (let sample = 1; sample <= 10 && clear; sample += 1) {
      const amount = sample / 11;
      const x = candidateX + (spot.x - candidateX) * amount;
      const y = candidateY + (spot.y - candidateY) * amount;
      if (isBlocked(x, y, scene.world)) clear = false;
    }
    if (clear) {
      startX = candidateX;
      startY = candidateY;
      break;
    }
  }
  scene.player.x = startX;
  scene.player.y = startY;
  scene.player.angle = Math.atan2(spot.y - startY, spot.x - startX);
  scene.player.aimAngle = scene.player.angle;
  scene.player.aim = false;
  const parkedX = scene.world.start.carX;
  const parkedY = scene.world.start.carY;
  scene.cars.push(createCar('taxi', parkedX, parkedY, 0, { driver: 'none', color: '#e7b33f', name: 'Taxi' }));

  simulate(scene, 0.2, {
    footControls: (player) => {
      const dx = spot.x - player.x;
      const dy = spot.y - player.y;
      const length = Math.max(0.001, Math.hypot(dx, dy));
      return {
        x: dx / length,
        y: dy / length,
        run: false,
        aimAngle: Math.atan2(dy, dx),
        aim: false,
      };
    },
  });
  return {
    name: 'mission',
    state: GAME_STATE.PLAY,
    scene,
    focus: { x: (scene.player.x + spot.x) / 2, y: (scene.player.y + spot.y) / 2 },
    frozen: true,
  };
}

export function stageShot(name, world) {
  const normalized = name === 'play' ? 'drive' : name === 'end' ? 'chase' : name;
  const validName = ['start', 'drive', 'chase', 'mission'].includes(normalized) ? normalized : 'drive';
  const seed = (world.seed ^ hashString(validName) ^ 0x73a2b1c9) >>> 0;
  const scene = makeStageScene(world, seed);
  scene.shotName = validName;
  if (validName === 'start') return stageStart(scene);
  if (validName === 'chase') return stageChase(scene);
  if (validName === 'mission') return stageMission(scene);
  return stageDrive(scene);
}
