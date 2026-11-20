// SOLMAR's runtime: fixed-step simulation, camera, menus, missions, heat and saves.

import { COLORS, GAME_STATE, MISSIONS, SAVE_KEY, STORY_INTRO, TUNING } from './config.js';
import { Input } from './input.js';
import { createRandom } from './random.js';
import { createWorld, isBlocked } from './world.js';
import { AudioEngine } from './audio.js';
import { createPlayer, syncPlayerToCar } from './player.js';
import { createCar, spawnPolice, spawnTraffic, updateCars } from './vehicles.js';
import { createPedestrians, scarePedestrians, updatePedestrians } from './pedestrians.js';
import { renderScene } from './render.js';
import { drawHUD } from './hud.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const view = { w: window.innerWidth, h: window.innerHeight, dpr: 1 };
const camera = { x: 0, y: 0, w: view.w, h: view.h };
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const requestedSeed = Number.parseInt(params.get('seed') ?? '', 10);
const audio = new AudioEngine();
const input = new Input(canvas, () => audio.init());

let world = null;
let scene = null;
let state = GAME_STATE.TITLE;
let shotMode = false;
let frozen = false;
let currentSeed = 1;
let savedGame = loadSave();
let accumulator = 0;
let lastTime = performance.now();

const ui = {
  saveNotice: 0,
  saveNoticeText: '',
};

function resize() {
  view.w = Math.max(320, window.innerWidth);
  view.h = Math.max(240, window.innerHeight);
  view.dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(view.w * view.dpr);
  canvas.height = Math.round(view.h * view.dpr);
  camera.w = view.w;
  camera.h = view.h;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  if (scene) centerCameraOn(focusPoint().x, focusPoint().y, true);
}

function focusPoint() {
  if (!scene) return { x: 0, y: 0 };
  const player = scene.player;
  return player.inCar && player.car ? { x: player.car.x, y: player.car.y } : { x: player.x, y: player.y };
}

function createPlayScene(gameWorld) {
  const random = createRandom((gameWorld.seed ^ 0x51edbabe) >>> 0);
  const player = createPlayer(gameWorld);
  let cars = spawnTraffic(gameWorld, random, TUNING.trafficCount);
  const parked = createCar('sports', gameWorld.start.carX, gameWorld.start.carY, gameWorld.start.carAngle, {
    driver: 'none',
    name: 'Tidebreak',
    color: '#d9a353',
  });
  cars = cars.filter((car) => Math.hypot(car.x - parked.x, car.y - parked.y) > 105);
  cars.push(parked);
  const pedestrians = createPedestrians(gameWorld, random, TUNING.pedestrianCount);
  return {
    world: gameWorld,
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
    completedJobs: 0,
    time: 0,
    heatTimer: 0,
    policeSpawnTimer: 3.6,
    saveTimer: 0,
    toast: null,
    toastQueue: [],
    playerHitCooldown: 0,
    skidTimer: 0,
    footDustTimer: 0,
    muted: audio.muted,
    frozen: false,
  };
}

function queueToast(toast) {
  if (!scene) return;
  if (!scene.toast) scene.toast = toast;
  else (scene.toastQueue ?? (scene.toastQueue = [])).push(toast);
}

// Word-wrap text to the given pixel width using the canvas's current font.
// Returns at most maxLines lines; a final over-long line is cut with an ellipsis.
function wrapLines(text, maxWidth, maxLines = 3) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = test;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && line && lines[maxLines - 1] !== line) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

function boot() {
  resize();
  window.addEventListener('resize', resize);
  if (shotName) {
    const seed = Number.isFinite(requestedSeed) && requestedSeed > 0 ? requestedSeed : 1;
    currentSeed = seed >>> 0;
    world = createWorld(currentSeed);
    const staged = stageShot(shotName, world);
    scene = staged.scene;
    state = staged.state;
    shotMode = true;
    savedGame = null;
    frozen = Boolean(staged.frozen);
    centerCameraOn(staged.focus.x, staged.focus.y, true);
  } else {
    const seed = Number.isFinite(requestedSeed) && requestedSeed > 0
      ? requestedSeed >>> 0
      : (savedGame?.seed ?? 1);
    currentSeed = seed;
    world = createWorld(seed);
    scene = createPlayScene(world);
    state = GAME_STATE.TITLE;
    centerCameraOn(scene.player.x, scene.player.y + 150, true);
  }
  scene.muted = audio.muted;
  requestAnimationFrame(loop);
}

function centerCameraOn(x, y, instant = false) {
  if (!world) return;
  const maxX = Math.max(0, world.width - view.w);
  const maxY = Math.max(0, world.height - view.h);
  const targetX = maxX > 0 ? clamp(x - view.w / 2, 0, maxX) : -(view.w - world.width) / 2;
  const targetY = maxY > 0 ? clamp(y - view.h / 2, 0, maxY) : -(view.h - world.height) / 2;
  if (instant) {
    camera.x = targetX;
    camera.y = targetY;
  }
  camera.targetX = targetX;
  camera.targetY = targetY;
}

function updateCamera(dt) {
  const focus = focusPoint();
  if (state === GAME_STATE.TITLE) focus.y += 150;
  let lookX = 0;
  let lookY = 0;
  if (scene?.player.inCar && scene.player.car) {
    const car = scene.player.car;
    lookX = Math.cos(car.angle) * clamp(car.speed * 0.26, -115, 115);
    lookY = Math.sin(car.angle) * clamp(car.speed * 0.26, -115, 115);
  }
  const maxX = Math.max(0, world.width - view.w);
  const maxY = Math.max(0, world.height - view.h);
  camera.targetX = maxX > 0 ? clamp(focus.x + lookX - view.w / 2, 0, maxX) : -(view.w - world.width) / 2;
  camera.targetY = maxY > 0 ? clamp(focus.y + lookY - view.h / 2, 0, maxY) : -(view.h - world.height) / 2;
  const smoothing = 1 - Math.exp(-TUNING.cameraLerp * dt);
  camera.x += (camera.targetX - camera.x) * smoothing;
  camera.y += (camera.targetY - camera.y) * smoothing;
}

function loop(now) {
  const dt = Math.min(TUNING.maxFrameDelta, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  if (ui.saveNotice > 0) ui.saveNotice -= dt;
  processDiscreteInput();

  if (!shotMode) {
    if (state === GAME_STATE.PLAY && !frozen) {
      accumulator = Math.min(accumulator + dt, TUNING.fixedStep * 6);
      let iterations = 0;
      while (accumulator >= TUNING.fixedStep && iterations < 6) {
        updatePlay(TUNING.fixedStep);
        accumulator -= TUNING.fixedStep;
        iterations += 1;
      }
    } else if (state === GAME_STATE.TITLE) {
      updateAmbient(dt);
      accumulator = 0;
    } else {
      accumulator = 0;
    }
  }
  updateAudioState();
  render();
  scene.muted = audio.muted;
  input.endFrame();
  requestAnimationFrame(loop);
}

function updateAmbient(dt) {
  if (!scene || frozen) return;
  scene.time += dt;
  updateCars(dt, scene, null, scene.random);
  updatePedestrians(dt, scene);
  advanceEffects(dt);
  updateCamera(dt);
  if (scene.toast) scene.toast.timer -= dt;
}

function playerCarControls() {
  return {
    throttle: (input.isDown('forward') ? 1 : 0) - (input.isDown('backward') ? 1 : 0),
    steer: (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0),
    handbrake: input.isDown('handbrake'),
  };
}

function pointerWorld() {
  return { x: camera.x + input.mouse.x, y: camera.y + input.mouse.y };
}

function playerFootControls() {
  const aim = pointerWorld();
  return {
    x: input.horizontal,
    y: input.vertical,
    run: input.isDown('run'),
    aimAngle: Math.atan2(aim.y - scene.player.y, aim.x - scene.player.x),
    aim: true,
  };
}

function updatePlay(dt) {
  if (!scene || !scene.player.alive) return;
  scene.time += dt;
  const player = scene.player;
  scene.playerHitCooldown = Math.max(0, scene.playerHitCooldown - dt);
  scene.policeSpawnTimer = Math.max(0, scene.policeSpawnTimer - dt);

  if (player.inCar && player.car) {
    updateCars(dt, scene, playerCarControls(), scene.random);
    syncPlayerToCar(player);
    player.updateTimers(dt);
    emitPlayerCarEffects(dt);
  } else {
    updateCars(dt, scene, null, scene.random);
    const controls = playerFootControls();
    player.updateOnFoot(dt, controls, scene.world);
    emitFootEffects(dt, controls);
  }

  updatePedestrians(dt, scene);
  processCrashes();
  updateBullets(dt);
  updateWanted(dt);
  updatePoliceContact(dt);
  updateMission();
  advanceEffects(dt);
  updateCamera(dt);
  scene.streetEvents.length = 0;
  scene.saveTimer += dt;
  if (scene.saveTimer > TUNING.saveInterval) {
    scene.saveTimer = 0;
    saveGame(false);
  }
  if (!player.alive) {
    state = GAME_STATE.GAMEOVER;
    audio.setRunning(false);
    audio.crash(1);
  }
}

function emitPlayerCarEffects(dt) {
  const car = scene.player.car;
  if (!car) return;
  scene.skidTimer -= dt;
  if (car.skidding && scene.skidTimer <= 0) {
    scene.skidTimer = 0.045;
    scene.skids.push({ x: car.x, y: car.y, angle: car.angle, alpha: 0.28 });
    if (scene.skids.length > 280) scene.skids.shift();
    addParticle('dust', car.x - Math.cos(car.angle) * car.length * 0.42, car.y - Math.sin(car.angle) * car.length * 0.42, {
      vx: -Math.cos(car.angle) * 35 + (scene.random.next() - 0.5) * 38,
      vy: -Math.sin(car.angle) * 35 + (scene.random.next() - 0.5) * 38,
      life: 0.7,
      size: 7,
      color: '#d8c092',
      alpha: 0.38,
    });
    if (scene.random.chance(0.55)) {
      addParticle('smoke', car.x - Math.cos(car.angle) * car.length * 0.4, car.y - Math.sin(car.angle) * car.length * 0.4, {
        vx: (scene.random.next() - 0.5) * 18,
        vy: (scene.random.next() - 0.5) * 18 - 8,
        life: 0.8,
        size: 6,
        color: 'rgba(210, 203, 182, 0.7)',
        alpha: 0.28,
      });
    }
  }
}

function emitFootEffects(dt, controls) {
  const player = scene.player;
  scene.footDustTimer -= dt;
  if (!player.running || Math.abs(player.speed) < 30 || scene.footDustTimer > 0) return;
  scene.footDustTimer = 0.13;
  addParticle('dust', player.x - Math.cos(player.angle) * 4, player.y - Math.sin(player.angle) * 4 + 4, {
    vx: -Math.cos(player.angle) * 12 + (scene.random.next() - 0.5) * 18,
    vy: -Math.sin(player.angle) * 12 + (scene.random.next() - 0.5) * 18,
    life: 0.34,
    size: 3.4,
    color: '#d6c39a',
    alpha: 0.24,
  });
  void controls;
}

function processCrashes() {
  let strongest = 0;
  for (const crash of scene.crashes) {
    const distance = Math.hypot(crash.x - camera.x - view.w / 2, crash.y - camera.y - view.h / 2);
    if (distance < 1050) strongest = Math.max(strongest, crash.power);
    const playerCar = scene.player.car;
    if (playerCar && (crash.a === playerCar || crash.b === playerCar) && scene.playerHitCooldown <= 0 && crash.power > 0.22) {
      scene.playerHitCooldown = 0.55;
      scene.player.hurt(Math.round(2 + crash.power * 5), 'crash');
    }
    for (let index = 0; index < 5; index += 1) {
      addParticle('spark', crash.x, crash.y, {
        vx: (scene.random.next() - 0.5) * 190,
        vy: (scene.random.next() - 0.5) * 190,
        life: 0.22 + scene.random.next() * 0.18,
        size: 1.3,
        color: scene.random.chance(0.5) ? '#ffd277' : '#f39b5f',
      });
    }
  }
  if (strongest > 0.12) audio.crash(strongest);
}

function updatePoliceContact() {
  if (scene.player.inCar || !scene.player.alive) return;
  for (const car of scene.cars) {
    if (car.ai?.mode !== 'police') continue;
    if (Math.hypot(car.x - scene.player.x, car.y - scene.player.y) < car.width * 0.75 + 10 && Math.abs(car.speed) > 42) {
      if (scene.playerHitCooldown <= 0) {
        scene.playerHitCooldown = 0.7;
        scene.player.hurt(12, 'police');
        raiseHeat(1);
      }
      break;
    }
  }
}

function updateMission() {
  const mission = MISSIONS[scene.missionIndex % MISSIONS.length];
  const spot = scene.world.missionSpots[mission.spot % scene.world.missionSpots.length];
  if (!spot) return;
  const player = scene.player;
  const px = player.inCar && player.car ? player.car.x : player.x;
  const py = player.inCar && player.car ? player.car.y : player.y;
  const distance = Math.hypot(px - spot.x, py - spot.y);
  const rightMode = mission.requiresCar ? player.inCar : !player.inCar;
  if (distance > TUNING.missionRadius || !rightMode) return;

  player.addCash(mission.reward);
  player.heal(8);
  scene.completedJobs += 1;
  scene.missionIndex = (scene.missionIndex + 1) % MISSIONS.length;
  scene.toast = {
    text: 'JOB COMPLETE',
    sub: `${mission.complete}  ·  +$${mission.reward}`,
    timer: 3.6,
    duration: 3.6,
  };
  const nextMission = MISSIONS[scene.missionIndex % MISSIONS.length];
  queueToast({
    text: `${nextMission.title.toUpperCase()} — NEW JOB`,
    sub: nextMission.brief,
    timer: 5.2,
    duration: 5.2,
  });
  for (let index = 0; index < 30; index += 1) {
    addParticle('confetti', spot.x + (scene.random.next() - 0.5) * 70, spot.y + (scene.random.next() - 0.5) * 45, {
      vx: (scene.random.next() - 0.5) * 180,
      vy: -60 - scene.random.next() * 170,
      life: 1.1 + scene.random.next() * 0.8,
      size: 2.2 + scene.random.next() * 2.2,
      color: scene.random.pick([COLORS.gold, COLORS.coral, COLORS.turquoise, COLORS.cream]),
      rotation: scene.random.float(0, Math.PI * 2),
    });
  }
  audio.blip(true);
  saveGame(false);
}

function updateWanted(dt) {
  if (scene.heatTimer > 0) {
    scene.heatTimer = Math.max(0, scene.heatTimer - dt);
    if (scene.heatTimer <= 0 && scene.wanted > 0) {
      scene.wanted -= 1;
      scene.heatTimer = scene.wanted > 0 ? 16 : 0;
    }
  }
  const police = scene.cars.filter((car) => car.ai?.mode === 'police');
  if (scene.wanted > 0) {
    const targetCount = Math.min(5, scene.wanted + 1);
    if (police.length < targetCount && scene.policeSpawnTimer <= 0) {
      const focus = focusPoint();
      const spawned = spawnPolice(scene.world, scene.random, focus.x, focus.y, scene.cars, 1);
      if (spawned.length > 0) {
        scene.policeSpawnTimer = Math.max(2.2, TUNING.policeSpawnInterval - scene.wanted * 0.9);
        scene.toast = { text: 'HEAT RISING', sub: 'UNITS INBOUND', timer: 1.8, duration: 1.8 };
      } else {
        scene.policeSpawnTimer = 1.2;
      }
    }
  }
}

function raiseHeat(stars = 1) {
  scene.wanted = Math.min(TUNING.maxWanted, Math.max(scene.wanted, stars));
  scene.heatTimer = Math.max(scene.heatTimer, 24 + stars * 2);
  scene.policeSpawnTimer = Math.min(scene.policeSpawnTimer, 1.6);
}

function addParticle(type, x, y, options = {}) {
  scene.particles.push({
    type,
    x,
    y,
    vx: options.vx ?? 0,
    vy: options.vy ?? 0,
    life: options.life ?? 0.5,
    maxLife: options.life ?? 0.5,
    color: options.color ?? '#f3cc78',
    size: options.size ?? 2,
    alpha: options.alpha ?? 1,
    rotation: options.rotation ?? 0,
  });
  if (scene.particles.length > 420) scene.particles.splice(0, scene.particles.length - 420);
}

function updateBullets(dt) {
  for (let index = scene.bullets.length - 1; index >= 0; index -= 1) {
    const bullet = scene.bullets[index];
    bullet.life -= dt;
    const nextX = bullet.x + bullet.vx * dt;
    const nextY = bullet.y + bullet.vy * dt;
    let hit = false;
    if (bullet.life <= 0) {
      scene.bullets.splice(index, 1);
      continue;
    }
    if (isBlocked(nextX, nextY, scene.world)) {
      hit = true;
    } else {
      for (const pedestrian of scene.pedestrians) {
        if (Math.hypot(pedestrian.x - nextX, pedestrian.y - nextY) < pedestrian.radius + 3) {
          scarePedestrians(scene.pedestrians, nextX, nextY, 250, 3.5);
          addParticle('spark', nextX, nextY, { vx: (scene.random.next() - 0.5) * 40, vy: -20, life: 0.35, size: 2, color: '#d85c50' });
          raiseHeat(2);
          hit = true;
          break;
        }
      }
      if (!hit) {
        for (const car of scene.cars) {
          if (Math.hypot(car.x - nextX, car.y - nextY) < car.radius + 4) {
            car.hitFlash = 1;
            car.damage = Math.min(1, car.damage + 0.08);
            for (let spark = 0; spark < 4; spark += 1) {
              addParticle('spark', nextX, nextY, {
                vx: (scene.random.next() - 0.5) * 140,
                vy: (scene.random.next() - 0.5) * 140,
                life: 0.2,
                size: 1.5,
                color: '#ffd076',
              });
            }
            if (car.ai?.mode === 'police') raiseHeat(Math.min(3, scene.wanted + 1));
            hit = true;
            break;
          }
        }
      }
    }
    if (hit) {
      addParticle('spark', nextX, nextY, {
        vx: (scene.random.next() - 0.5) * 90,
        vy: (scene.random.next() - 0.5) * 90,
        life: 0.25,
        size: 1.8,
        color: '#ffe29b',
      });
      scene.bullets.splice(index, 1);
      continue;
    }
    bullet.x = nextX;
    bullet.y = nextY;
  }
}

function shoot() {
  const player = scene.player;
  if (player.inCar || !player.alive) return false;
  const aim = pointerWorld();
  player.aimAngle = Math.atan2(aim.y - player.y, aim.x - player.x);
  if (!player.fire()) return false;
  const angle = player.aimAngle;
  const muzzleX = player.x + Math.cos(angle) * 19;
  const muzzleY = player.y + Math.sin(angle) * 19;
  scene.bullets.push({
    x: muzzleX,
    y: muzzleY,
    vx: Math.cos(angle) * TUNING.bulletSpeed,
    vy: Math.sin(angle) * TUNING.bulletSpeed,
    life: TUNING.bulletLife,
  });
  addParticle('muzzle', muzzleX, muzzleY, {
    life: 0.11,
    size: 9,
    color: '#ffe286',
    alpha: 0.95,
  });
  for (let index = 0; index < 3; index += 1) {
    addParticle('spark', muzzleX, muzzleY, {
      vx: Math.cos(angle) * (120 + scene.random.next() * 140) + (scene.random.next() - 0.5) * 90,
      vy: Math.sin(angle) * (120 + scene.random.next() * 140) + (scene.random.next() - 0.5) * 90,
      life: 0.16,
      size: 1.4,
      color: '#ffcf68',
    });
  }
  audio.gunshot();
  scarePedestrians(scene.pedestrians, player.x, player.y, 520, 3.2);
  raiseHeat(Math.max(1, scene.wanted));
  return true;
}

function punch() {
  const player = scene.player;
  if (player.inCar || !player.punch()) return false;
  const reach = 38;
  const targetX = player.x + Math.cos(player.angle) * reach * 0.6;
  const targetY = player.y + Math.sin(player.angle) * reach * 0.6;
  let hit = false;
  for (const pedestrian of scene.pedestrians) {
    if (Math.hypot(pedestrian.x - targetX, pedestrian.y - targetY) > 28) continue;
    scarePedestrians(scene.pedestrians, player.x, player.y, 95, 2.5);
    addParticle('spark', pedestrian.x, pedestrian.y, { life: 0.2, size: 2, color: '#fff0c2' });
    hit = true;
    break;
  }
  if (hit) raiseHeat(1);
  audio.click();
  return true;
}

function advanceEffects(dt) {
  for (const particle of scene.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    if (particle.type === 'confetti') {
      particle.vy += 170 * dt;
      particle.vx *= Math.exp(-1.5 * dt);
      particle.rotation += dt * 6;
    } else {
      particle.vx *= Math.exp(-2.3 * dt);
      particle.vy *= Math.exp(-2.3 * dt);
    }
    particle.life -= dt;
  }
  scene.particles = scene.particles.filter((particle) => particle.life > 0);
  for (const skid of scene.skids) skid.alpha = Math.max(0.03, skid.alpha - dt * 0.0025);
  if (scene.skids.length > 300) scene.skids.splice(0, scene.skids.length - 300);
  if (scene.toast) {
    scene.toast.timer = Math.max(0, scene.toast.timer - dt);
    if (scene.toast.timer <= 0) {
      scene.toast = (scene.toastQueue && scene.toastQueue.length > 0) ? scene.toastQueue.shift() : null;
    }
  }
}

function processDiscreteInput() {
  if (input.wasPressed('mute')) {
    audio.toggleMuted();
    scene.muted = audio.muted;
  }
  if (shotMode) return;

  if (state === GAME_STATE.TITLE) {
    if (input.wasPressed('confirm')) {
      startNewGame();
      return;
    }
    if (input.wasPressed('continueGame') && savedGame) {
      continueGame();
      return;
    }
    if (input.consumeClick()) {
      const layout = titleLayout();
      if (pointInRect(input.mouse.x, input.mouse.y, layout.newGame)) startNewGame();
      else if (pointInRect(input.mouse.x, input.mouse.y, layout.continue) && savedGame) continueGame();
    }
    return;
  }

  if (state === GAME_STATE.PAUSE) {
    if (input.wasPressed('pause') || input.wasPressed('confirm')) {
      resumeGame();
      return;
    }
    if (input.consumeClick()) {
      const layout = pauseLayout();
      if (pointInRect(input.mouse.x, input.mouse.y, layout.resume)) resumeGame();
      else if (pointInRect(input.mouse.x, input.mouse.y, layout.save)) {
        if (saveGame(false)) {
          ui.saveNotice = 2.2;
          ui.saveNoticeText = 'PROGRESS SAVED';
          audio.blip(true);
        }
      } else if (pointInRect(input.mouse.x, input.mouse.y, layout.quit)) quitToTitle();
    }
    return;
  }

  if (state === GAME_STATE.GAMEOVER) {
    if (input.wasPressed('confirm')) {
      startNewGame();
      return;
    }
    if (input.wasPressed('pause')) {
      quitToTitle(false);
      return;
    }
    if (input.consumeClick()) {
      const layout = gameOverLayout();
      if (pointInRect(input.mouse.x, input.mouse.y, layout.retry)) startNewGame();
      else if (pointInRect(input.mouse.x, input.mouse.y, layout.title)) quitToTitle(false);
    }
    return;
  }

  if (state !== GAME_STATE.PLAY) return;
  if (input.wasPressed('pause')) {
    pauseGame();
    return;
  }
  if (input.wasPressed('interact')) {
    if (scene.player.inCar) {
      if (scene.player.exitCurrentCar(scene.cars, scene.world)) {
        audio.blip(false);
        scene.toast = { text: 'ON FOOT', sub: 'E TO TAKE THE NEAREST CAR', timer: 1.7, duration: 1.7 };
      }
    } else {
      const car = scene.player.tryEnterNearestCar(scene.cars, scene.world);
      if (car) {
        audio.blip(true);
        scene.toast = { text: car.name.toUpperCase(), sub: 'E TO STEP OUT', timer: 1.8, duration: 1.8 };
      }
    }
  }
  if (input.wasPressed('punch')) punch();
  if (input.wasPressed('reload')) {
    if (scene.player.reload()) audio.click();
  }
  if (input.consumeClick()) shoot();
}

function pauseGame() {
  if (state !== GAME_STATE.PLAY) return;
  state = GAME_STATE.PAUSE;
  audio.setRunning(false);
  saveGame(false);
}

function resumeGame() {
  if (state !== GAME_STATE.PAUSE) return;
  state = GAME_STATE.PLAY;
  audio.setRunning(true);
  accumulator = 0;
}

function startNewGame() {
  audio.init();
  const seed = Number.isFinite(requestedSeed) && requestedSeed > 0
    ? requestedSeed >>> 0
    : ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
  currentSeed = seed;
  world = createWorld(seed);
  scene = createPlayScene(world);
  scene.muted = audio.muted;
  state = GAME_STATE.PLAY;
  shotMode = false;
  frozen = false;
  accumulator = 0;
  centerCameraOn(scene.player.x, scene.player.y, true);
  audio.setRunning(true);
  audio.blip(true);
  queueToast({ text: 'SALT AIR — NEW JOB', sub: MISSIONS[0].brief, timer: 5.2, duration: 5.2 });
}

function continueGame() {
  const save = loadSave();
  if (!save) return;
  audio.init();
  currentSeed = (save.seed >>> 0) || 1;
  world = createWorld(currentSeed);
  scene = createPlayScene(world);
  scene.muted = audio.muted;
  const player = scene.player;
  player.x = Number.isFinite(save.x) ? save.x : world.start.x;
  player.y = Number.isFinite(save.y) ? save.y : world.start.y;
  if (isBlocked(player.x, player.y, world)) {
    player.x = world.start.x;
    player.y = world.start.y;
  }
  player.health = clamp(Number(save.health) || TUNING.maxHealth, 1, TUNING.maxHealth);
  player.cash = Math.max(0, Number(save.cash) || 0);
  player.ammo = clamp(Number(save.ammo) || 0, 0, 12);
  player.reserve = Math.max(0, Number(save.reserve) || 0);
  player.alive = true;
  scene.missionIndex = clamp(Number(save.missionIndex) || 0, 0, MISSIONS.length - 1);
  scene.completedJobs = Math.max(0, Number(save.completedJobs) || 0);
  scene.wanted = clamp(Number(save.wanted) || 0, 0, TUNING.maxWanted);
  scene.heatTimer = scene.wanted > 0 ? 20 : 0;
  state = GAME_STATE.PLAY;
  shotMode = false;
  frozen = false;
  accumulator = 0;
  centerCameraOn(player.x, player.y, true);
  audio.setRunning(true);
  audio.blip(true);
  scene.toast = { text: 'BACK ON THE STREET', sub: `JOB ${scene.missionIndex + 1}  ·  ${MISSIONS[scene.missionIndex].title.toUpperCase()}`, timer: 2.7, duration: 2.7 };
}

function quitToTitle(save = true) {
  if (save && scene) saveGame(false);
  state = GAME_STATE.TITLE;
  shotMode = false;
  frozen = false;
  const titleSeed = Number.isFinite(requestedSeed) && requestedSeed > 0
    ? requestedSeed >>> 0
    : (savedGame?.seed ?? currentSeed);
  currentSeed = titleSeed;
  world = createWorld(titleSeed);
  scene = createPlayScene(world);
  scene.muted = audio.muted;
  accumulator = 0;
  centerCameraOn(scene.player.x, scene.player.y, true);
  audio.setRunning(false);
}

function saveGame(showToast = false) {
  if (!scene || shotMode) return false;
  const player = scene.player;
  const position = player.inCar && player.car ? { x: player.car.x, y: player.car.y } : { x: player.x, y: player.y };
  const data = {
    version: 1,
    seed: currentSeed >>> 0,
    x: position.x,
    y: position.y,
    health: player.health,
    cash: player.cash,
    ammo: player.ammo,
    reserve: player.reserve,
    missionIndex: scene.missionIndex,
    completedJobs: scene.completedJobs,
    wanted: scene.wanted,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    savedGame = data;
    if (showToast) scene.toast = { text: 'PROGRESS SAVED', sub: 'THE TIDE REMEMBERS', timer: 2.2, duration: 2.2 };
    return true;
  } catch {
    return false;
  }
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !Number.isFinite(parsed.seed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function updateAudioState() {
  scene.muted = audio.muted;
  const car = scene.player.inCar ? scene.player.car : null;
  const active = state === GAME_STATE.PLAY && Boolean(car) && scene.player.alive && !frozen;
  const ratio = car ? Math.min(1, Math.abs(car.speed) / car.spec.maxSpeed) : 0;
  audio.setEngine(active, ratio);
  const policeNear = scene.cars.some((entry) => entry.ai?.mode === 'police' && Math.hypot(entry.x - focusPoint().x, entry.y - focusPoint().y) < 1150);
  audio.setSiren(state === GAME_STATE.PLAY && scene.wanted > 0 && policeNear && scene.player.alive && !frozen);
}

function render() {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.clearRect(0, 0, view.w, view.h);
  if (!scene) return;
  renderScene(ctx, scene, camera, view);
  if (state === GAME_STATE.PLAY || state === GAME_STATE.PAUSE || state === GAME_STATE.GAMEOVER) {
    drawHUD(ctx, scene, view);
  }
  if (state === GAME_STATE.TITLE) drawTitle();
  if (state === GAME_STATE.PAUSE) drawPause();
  if (state === GAME_STATE.GAMEOVER) drawGameOver();
  if (state === GAME_STATE.PLAY) drawToast();
  if (ui.saveNotice > 0) drawSaveNotice();
  canvas.dataset.solmarReady = '1';
  canvas.dataset.solmarState = state;
}

function drawTrackedText(text, centerX, y, size, tracking, color, family = 'Georgia, serif') {
  ctx.save();
  ctx.font = `700 ${size}px ${family}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  let width = 0;
  for (const character of text) width += ctx.measureText(character).width + tracking;
  width -= tracking;
  let x = centerX - width / 2;
  for (const character of text) {
    ctx.fillText(character, x, y);
    x += ctx.measureText(character).width + tracking;
  }
  ctx.restore();
  return width;
}

function drawButton(rect, label, options = {}) {
  const hover = pointInRect(input.mouse.x, input.mouse.y, rect) && !options.disabled;
  ctx.save();
  ctx.shadowColor = options.primary ? 'rgba(238, 177, 77, 0.2)' : 'rgba(0, 0, 0, 0.28)';
  ctx.shadowBlur = hover ? 22 : 12;
  ctx.shadowOffsetY = 4;
  roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 8);
  if (options.primary) {
    const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
    gradient.addColorStop(0, hover ? '#ffdc7b' : '#f1c363');
    gradient.addColorStop(1, hover ? '#eab04a' : '#dba548');
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = hover ? 'rgba(46, 58, 58, 0.94)' : 'rgba(20, 29, 31, 0.82)';
  }
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = options.primary ? 'rgba(255, 239, 178, 0.54)' : options.disabled ? 'rgba(255, 239, 202, 0.12)' : 'rgba(255, 229, 165, 0.4)';
  ctx.lineWidth = 1.2;
  roundedRectPath(ctx, rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1, 8);
  ctx.stroke();
  ctx.fillStyle = options.primary ? '#1c292b' : options.disabled ? 'rgba(255, 240, 206, 0.26)' : '#fff0cc';
  ctx.font = `bold ${options.fontSize ?? 12}px "Trebuchet MS", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.5);
  ctx.restore();
}

function drawCornerBracket(x, y, size, flipX = false, flipY = false) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 221, 148, 0.48)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  const sx = flipX ? -1 : 1;
  const sy = flipY ? -1 : 1;
  ctx.moveTo(x, y + sy * size);
  ctx.lineTo(x, y);
  ctx.lineTo(x + sx * size, y);
  ctx.stroke();
  ctx.restore();
}

function drawTitle() {
  const w = view.w;
  const h = view.h;
  ctx.save();
  const wash = ctx.createLinearGradient(0, 0, 0, h);
  wash.addColorStop(0, 'rgba(10, 16, 18, 0.27)');
  wash.addColorStop(0.42, 'rgba(10, 16, 18, 0.36)');
  wash.addColorStop(0.72, 'rgba(10, 16, 18, 0.63)');
  wash.addColorStop(1, 'rgba(8, 13, 15, 0.9)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);

  const sunX = w * 0.5;
  const sunY = h * 0.29;
  const sunRadius = Math.min(w, h) * 0.2;
  const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius);
  glow.addColorStop(0, 'rgba(255, 184, 88, 0.23)');
  glow.addColorStop(0.58, 'rgba(247, 145, 74, 0.08)');
  glow.addColorStop(1, 'rgba(247, 145, 74, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 230, 174, 0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.2, h * 0.128);
  ctx.lineTo(w * 0.8, h * 0.128);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 230, 177, 0.67)';
  ctx.font = 'bold 9px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('A SUN-BAKED COASTAL CRIME STORY', w / 2, h * 0.155);

  const titleSize = Math.max(54, Math.min(132, w * 0.108));
  ctx.save();
  ctx.shadowColor = 'rgba(10, 13, 14, 0.52)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  drawTrackedText('SOLMAR', w / 2 + 3, h * 0.292 + 4, titleSize, titleSize * 0.108, 'rgba(45, 30, 26, 0.52)');
  drawTrackedText('SOLMAR', w / 2, h * 0.292, titleSize, titleSize * 0.108, '#fff0cc');
  ctx.restore();

  ctx.fillStyle = '#ef765f';
  ctx.fillRect(w / 2 - 45, h * 0.365, 90, 3);
  drawTrackedText('SUN. SALT. NO SECOND CHANCES.', w / 2, h * 0.404, Math.max(9, Math.min(13, w * 0.011)), 2.4, 'rgba(255, 226, 164, 0.75)', '"Trebuchet MS", Arial, sans-serif');

  const layout = titleLayout();
  ctx.fillStyle = 'rgba(255, 240, 207, 0.82)';
  ctx.font = '11px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const introLines = wrapLines(STORY_INTRO, Math.min(w - 120, 640), 3);
  const introStartY = Math.max(h * 0.404 + 17, layout.newGame.y - 9 - (introLines.length - 1) * 15);
  introLines.forEach((line, index) => {
    ctx.fillText(line, w / 2, introStartY + index * 15);
  });

  drawButton(layout.newGame, 'NEW GAME', { primary: true, fontSize: 13 });
  drawButton(layout.continue, 'CONTINUE', { disabled: !savedGame, fontSize: 13 });
  if (savedGame) {
    ctx.fillStyle = 'rgba(255, 232, 178, 0.48)';
    ctx.font = '9px "Trebuchet MS", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`CONTINUE  ·  $${Math.round(savedGame.cash || 0).toLocaleString('en-US')}  ·  JOB ${(savedGame.missionIndex || 0) + 1}`, w / 2, layout.continue.y + layout.continue.h + 14);
  }

  const controlsWidth = Math.min(w - 54, 930);
  const controlsX = w / 2 - controlsWidth / 2;
  const controlsY = h - 64;
  ctx.fillStyle = 'rgba(15, 23, 25, 0.66)';
  roundedRectPath(ctx, controlsX, controlsY, controlsWidth, 39, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 224, 155, 0.14)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 234, 187, 0.52)';
  ctx.font = '8px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('CONTROLS', controlsX + 14, controlsY + 14);
  ctx.fillStyle = 'rgba(255, 242, 209, 0.8)';
  ctx.font = '9px "Trebuchet MS", Arial, sans-serif';
  const controls = 'WASD / ARROWS  MOVE     E  ENTER / EXIT     SPACE  HANDBRAKE     F  PUNCH     R  RELOAD     CLICK  FIRE     ESC  PAUSE     M  MUTE';
  ctx.fillText(controls, controlsX + 14, controlsY + 28);
  ctx.fillStyle = 'rgba(255, 231, 176, 0.34)';
  ctx.textAlign = 'right';
  ctx.fillText('ENTER  NEW GAME     C  CONTINUE', controlsX + controlsWidth - 14, controlsY + 14);

  drawCornerBracket(20, 20, 18);
  drawCornerBracket(w - 20, 20, 18, true);
  drawCornerBracket(20, h - 20, 18, false, true);
  drawCornerBracket(w - 20, h - 20, 18, true, true);
  ctx.restore();
}

function drawPause() {
  ctx.save();
  ctx.fillStyle = 'rgba(8, 13, 15, 0.64)';
  ctx.fillRect(0, 0, view.w, view.h);
  const layout = pauseLayout();
  const width = 430;
  const height = 338;
  const x = view.w / 2 - width / 2;
  const y = view.h / 2 - height / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 34;
  ctx.fillStyle = 'rgba(18, 27, 29, 0.97)';
  roundedRectPath(ctx, x, y, width, height, 16);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255, 222, 148, 0.3)';
  ctx.lineWidth = 1.2;
  roundedRectPath(ctx, x + 0.5, y + 0.5, width - 1, height - 1, 16);
  ctx.stroke();
  drawTrackedText('PAUSED', view.w / 2, y + 56, 39, 5, '#fff0cc');
  ctx.fillStyle = 'rgba(255, 225, 166, 0.48)';
  ctx.font = '9px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('THE CITY WAITS.', view.w / 2, y + 84);
  drawButton(layout.resume, 'RESUME');
  drawButton(layout.save, 'SAVE PROGRESS');
  drawButton(layout.quit, 'QUIT TO TITLE');
  ctx.fillStyle = 'rgba(255, 233, 186, 0.42)';
  ctx.font = '9px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText('ESC  RESUME     M  MUTE', view.w / 2, y + height - 24);
  ctx.restore();
}

function drawGameOver() {
  ctx.save();
  ctx.fillStyle = 'rgba(16, 10, 11, 0.72)';
  ctx.fillRect(0, 0, view.w, view.h);
  const layout = gameOverLayout();
  const width = 460;
  const height = 312;
  const x = view.w / 2 - width / 2;
  const y = view.h / 2 - height / 2;
  ctx.fillStyle = 'rgba(26, 20, 20, 0.97)';
  roundedRectPath(ctx, x, y, width, height, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(239, 111, 92, 0.46)';
  ctx.lineWidth = 1.2;
  roundedRectPath(ctx, x + 0.5, y + 0.5, width - 1, height - 1, 16);
  ctx.stroke();
  drawTrackedText('MARA IS DOWN', view.w / 2, y + 65, 36, 3.5, '#f4b09e');
  ctx.fillStyle = 'rgba(255, 220, 200, 0.5)';
  ctx.font = '10px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('The city keeps moving. Try a cleaner line.', view.w / 2, y + 98);
  drawButton(layout.retry, 'TRY AGAIN', { primary: true });
  drawButton(layout.title, 'TITLE SCREEN');
  ctx.fillStyle = 'rgba(255, 224, 196, 0.38)';
  ctx.font = '9px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText('ENTER  TRY AGAIN     ESC  TITLE', view.w / 2, y + height - 25);
  ctx.restore();
}

function drawToast() {
  if (!scene.toast) return;
  const toast = scene.toast;
  const fade = Math.min(1, toast.timer / 0.45);
  const width = Math.min(360, view.w - 80);
  const x = view.w / 2 - width / 2;
  const y = 106;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.fillStyle = 'rgba(17, 25, 27, 0.88)';
  ctx.font = '9px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const subLines = wrapLines(toast.sub, width - 32, 3);
  const height = 49 + (subLines.length - 1) * 14;
  roundedRectPath(ctx, x, y, width, height, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 221, 147, 0.35)';
  ctx.stroke();
  ctx.fillStyle = '#f5c968';
  ctx.font = 'bold 10px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText(toast.text, view.w / 2, y + 22);
  ctx.fillStyle = 'rgba(255, 239, 208, 0.74)';
  ctx.font = '9px "Trebuchet MS", Arial, sans-serif';
  subLines.forEach((line, index) => {
    ctx.fillText(line, view.w / 2, y + 38 + index * 14);
  });
  ctx.restore();
}

function drawSaveNotice() {
  const width = 200;
  const x = view.w / 2 - width / 2;
  const y = view.h - 174;
  ctx.save();
  ctx.globalAlpha = Math.min(1, ui.saveNotice * 2);
  ctx.fillStyle = 'rgba(17, 26, 27, 0.86)';
  roundedRectPath(ctx, x, y, width, 29, 8);
  ctx.fill();
  ctx.fillStyle = '#f3c86b';
  ctx.font = 'bold 9px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ui.saveNoticeText, view.w / 2, y + 15);
  ctx.restore();
}

function titleLayout() {
  const buttonWidth = Math.min(210, view.w * 0.23);
  const buttonHeight = 48;
  const gap = 14;
  const total = buttonWidth * 2 + gap;
  const startX = view.w / 2 - total / 2;
  const y = Math.min(view.h * 0.48, view.h - 190);
  return {
    newGame: { x: startX, y, w: buttonWidth, h: buttonHeight },
    continue: { x: startX + buttonWidth + gap, y, w: buttonWidth, h: buttonHeight },
  };
}

function pauseLayout() {
  const width = 258;
  const x = view.w / 2 - width / 2;
  const panelY = view.h / 2 - 169;
  return {
    resume: { x, y: panelY + 113, w: width, h: 45 },
    save: { x, y: panelY + 170, w: width, h: 45 },
    quit: { x, y: panelY + 227, w: width, h: 45 },
  };
}

function gameOverLayout() {
  const width = 250;
  const x = view.w / 2 - width / 2;
  const y = view.h / 2 - 156;
  return {
    retry: { x, y: y + 131, w: width, h: 46 },
    title: { x, y: y + 189, w: width, h: 46 },
  };
}

function roundedRectPath(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

boot();
