// Mara Quinn: on-foot movement, car handoff, health, cash, pistol and melee.

import { TUNING } from './config.js';
import { enterCar, exitCar, nearestCar } from './vehicles.js';
import { isBlocked } from './world.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class Player {
  constructor(x, y, options = {}) {
    this.x = x;
    this.y = y;
    this.angle = options.angle ?? 0;
    this.aimAngle = this.angle;
    this.radius = TUNING.playerRadius;
    this.health = options.health ?? TUNING.maxHealth;
    this.cash = options.cash ?? 240;
    this.inCar = false;
    this.car = null;
    this.weapon = 'Pistol';
    this.ammo = options.ammo ?? 12;
    this.reserve = options.reserve ?? 60;
    this.reloadTimer = 0;
    this.reloading = false;
    this.shootCooldown = 0;
    this.punchCooldown = 0;
    this.punchTimer = 0;
    this.muzzleTimer = 0;
    this.walkPhase = 0;
    this.speed = 0;
    this.running = false;
    this.damageFlash = 0;
    this.alive = true;
    this.enteredCarAt = -10;
    this.jacket = '#e96f59';
    this.shirt = '#f4d7aa';
    this.pants = '#263a48';
    this.hair = '#34251f';
  }

  updateOnFoot(dt, controls, world) {
    if (!this.alive || this.inCar) {
      this.updateTimers(dt);
      return;
    }
    const moveX = controls.x ?? 0;
    const moveY = controls.y ?? 0;
    const length = Math.hypot(moveX, moveY);
    const running = Boolean(controls.run) && length > 0;
    const speed = running ? TUNING.playerRunSpeed : TUNING.playerWalkSpeed;
    this.running = running;
    this.speed = length > 0 ? speed : Math.max(0, this.speed - 900 * dt);

    if (length > 0) {
      const nx = moveX / length;
      const ny = moveY / length;
      const stepX = nx * speed * dt;
      const stepY = ny * speed * dt;
      if (!isBlocked(this.x + stepX, this.y, world)) this.x += stepX;
      else if (!isBlocked(this.x, this.y + stepY * 0.25, world)) this.y += stepY * 0.25;
      if (!isBlocked(this.x, this.y + stepY, world)) this.y += stepY;
      else if (!isBlocked(this.x + stepX * 0.25, this.y, world)) this.x += stepX * 0.25;
      this.angle = Math.atan2(ny, nx);
      this.walkPhase += dt * (running ? 13.5 : 8.5);
    } else {
      this.walkPhase += dt * 1.5;
    }
    if (Number.isFinite(controls.aimAngle)) {
      this.aimAngle = controls.aimAngle;
      if (length === 0) this.angle = controls.aimAngle;
    }
    this.aim = Boolean(controls.aim);
    this.updateTimers(dt);
  }

  updateTimers(dt) {
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.punchTimer = Math.max(0, this.punchTimer - dt);
    this.muzzleTimer = Math.max(0, this.muzzleTimer - dt);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.2);
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload();
    }
    if (this.inCar && this.car) {
      this.x = this.car.x;
      this.y = this.car.y;
      this.angle = this.car.angle;
      this.aimAngle = this.car.angle;
    }
  }

  tryEnterNearestCar(cars, world) {
    if (this.inCar || !this.alive) return null;
    const car = nearestCar(cars, this.x, this.y, TUNING.interactDistance);
    if (!car || isBlocked(car.x, car.y, world)) return null;
    if (enterCar(car, this)) {
      this.enteredCarAt = performance.now() / 1000;
      return car;
    }
    return null;
  }

  exitCurrentCar(cars, world) {
    if (!this.inCar) return false;
    return exitCar(this, cars, world);
  }

  fire() {
    if (!this.alive || this.inCar || this.shootCooldown > 0 || this.reloading) return false;
    if (this.ammo <= 0) {
      this.reload();
      return false;
    }
    this.ammo -= 1;
    this.shootCooldown = 0.17;
    this.muzzleTimer = 0.09;
    return true;
  }

  punch() {
    if (!this.alive || this.inCar || this.punchCooldown > 0) return false;
    this.punchCooldown = 0.38;
    this.punchTimer = 0.2;
    return true;
  }

  reload() {
    if (!this.alive || this.inCar || this.reloading || this.ammo >= 12 || this.reserve <= 0) return false;
    this.reloading = true;
    this.reloadTimer = 1.15;
    return true;
  }

  finishReload() {
    const needed = 12 - this.ammo;
    const moved = Math.min(needed, this.reserve);
    this.ammo += moved;
    this.reserve -= moved;
    this.reloading = false;
    this.reloadTimer = 0;
  }

  hurt(amount, source = null) {
    if (!this.alive) return;
    this.health = clamp(this.health - amount, 0, TUNING.maxHealth);
    this.damageFlash = 1;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.source = source;
    }
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, TUNING.maxHealth);
  }

  addCash(amount) {
    this.cash = Math.max(0, Math.round(this.cash + amount));
  }

  serialize() {
    return {
      x: this.inCar && this.car ? this.car.x : this.x,
      y: this.inCar && this.car ? this.car.y : this.y,
      health: this.health,
      cash: this.cash,
      ammo: this.ammo,
      reserve: this.reserve,
      alive: this.alive,
    };
  }
}

export function createPlayer(world) {
  return new Player(world.start.x, world.start.y, { angle: -Math.PI / 2 });
}

export function playerAimAngle(player, worldPoint) {
  if (!worldPoint) return player.angle;
  return Math.atan2(worldPoint.y - player.y, worldPoint.x - player.x);
}

export function syncPlayerToCar(player) {
  if (!player.inCar || !player.car) return;
  player.x = player.car.x;
  player.y = player.car.y;
  player.angle = player.car.angle;
  player.aimAngle = player.car.angle;
}
