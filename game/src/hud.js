// Screen-space UI and the live corner minimap.

import { MISSIONS, ROAD, WORLD } from './config.js';
import { nearestCar, speedKmh } from './vehicles.js';

let minimapCanvas = null;
let minimapContext = null;

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function panel(ctx, x, y, width, height, radius = 12, alpha = 0.81) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = `rgba(18, 25, 27, ${alpha})`;
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255, 222, 153, 0.22)';
  ctx.lineWidth = 1;
  roundedRectPath(ctx, x + 0.5, y + 0.5, width - 1, height - 1, radius);
  ctx.stroke();
  ctx.restore();
}

function starPath(ctx, x, y, outer, inner) {
  ctx.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const angle = -Math.PI / 2 + point * (Math.PI / 5);
    const radius = point % 2 === 0 ? outer : inner;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (point === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawMoney(ctx, value) {
  return `$${Math.max(0, Math.round(value)).toLocaleString('en-US')}`;
}

function drawWantedStars(ctx, wanted, x, y, time) {
  const count = 5;
  const pulse = wanted > 0 ? 0.78 + Math.sin(time * 6.4) * 0.22 : 1;
  ctx.save();
  for (let index = 0; index < count; index += 1) {
    const filled = index < wanted;
    starPath(ctx, x + index * 22, y, 7.8, 3.5);
    if (filled) {
      ctx.fillStyle = index < 2 ? '#f4ce66' : '#f07b59';
      ctx.globalAlpha = pulse;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255, 243, 191, 0.72)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255, 242, 207, 0.24)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function healthColor(ratio) {
  if (ratio > 0.62) return '#7dc87d';
  if (ratio > 0.3) return '#f0bf5b';
  return '#ed6758';
}

function drawTopLeft(ctx, scene, view) {
  const player = scene.player;
  const width = 310;
  const height = 91;
  panel(ctx, 22, 22, width, height, 14);

  ctx.save();
  ctx.translate(46, 46);
  ctx.fillStyle = 'rgba(242, 196, 114, 0.17)';
  ctx.beginPath();
  ctx.arc(22, 22, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 224, 152, 0.54)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = '#f8d77f';
  ctx.font = 'bold 17px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MQ', 22, 23);
  ctx.restore();

  ctx.fillStyle = '#fff0ce';
  ctx.font = '600 14px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('MARA QUINN', 82, 47);
  ctx.fillStyle = 'rgba(240, 216, 166, 0.52)';
  ctx.font = '10px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText('GETAWAY DRIVER  /  SOLMAR', 82, 62);

  const healthRatio = player.health / 100;
  ctx.fillStyle = 'rgba(255, 241, 211, 0.12)';
  roundedRectPath(ctx, 82, 73, 208, 9, 4.5);
  ctx.fill();
  const barWidth = 208 * Math.max(0, healthRatio);
  if (barWidth > 1) {
    ctx.fillStyle = healthColor(healthRatio);
    roundedRectPath(ctx, 82, 73, barWidth, 9, 4.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 235, 0.22)';
    roundedRectPath(ctx, 84, 74, Math.max(0, barWidth - 4), 2, 1);
    ctx.fill();
  }
  ctx.fillStyle = '#f6ca6a';
  ctx.font = 'bold 13px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(drawMoney(ctx, player.cash), 309, 48);
  ctx.fillStyle = 'rgba(255, 232, 181, 0.53)';
  ctx.font = '9px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText('CASH', 309, 63);

  if (view.w > 940) {
    ctx.fillStyle = 'rgba(255, 234, 184, 0.54)';
    ctx.font = '10px "Trebuchet MS", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.ceil(player.health)} HP`, 82, 92);
  }
}

function drawWanted(ctx, scene, view) {
  const width = 146;
  const x = view.w - width - 22;
  panel(ctx, x, 22, width, 50, 12);
  ctx.fillStyle = 'rgba(255, 232, 181, 0.54)';
  ctx.font = 'bold 9px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  if (view.w > 780) ctx.fillText('HEAT', x + width - 12, 38);
  drawWantedStars(ctx, scene.wanted, x + 18, 47, scene.time);
  if (scene.muted) {
    ctx.fillStyle = 'rgba(255, 224, 160, 0.42)';
    ctx.font = '8px "Trebuchet MS", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('MUTED', x + 12, 65);
  }
}

function drawObjective(ctx, scene, view) {
  if (scene.missionIndex == null) return;
  const mission = MISSIONS[scene.missionIndex % MISSIONS.length];
  const spot = scene.world.missionSpots[mission.spot % scene.world.missionSpots.length];
  if (!mission || !spot) return;
  const playerX = scene.player.inCar && scene.player.car ? scene.player.car.x : scene.player.x;
  const playerY = scene.player.inCar && scene.player.car ? scene.player.car.y : scene.player.y;
  const distance = Math.round(Math.hypot(spot.x - playerX, spot.y - playerY));
  const compact = view.w < 1080;
  const width = compact ? Math.min(560, view.w - 44) : Math.min(530, view.w - 410);
  if (width < 290) return;
  const y = compact ? 112 : 22;
  const x = view.w / 2 - width / 2;
  panel(ctx, x, y, width, 60, 12, 0.76);
  ctx.fillStyle = '#f4c96d';
  ctx.font = 'bold 9px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${mission.title.toUpperCase()}  /  JOB ${scene.missionIndex + 1}  ·  ${mission.requiresCar ? 'DRIVE' : 'ON FOOT'}`, x + 16, y + 17);
  ctx.fillStyle = '#fff0cf';
  ctx.font = '600 13px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText(mission.objective, x + 16, y + 37);
  ctx.fillStyle = 'rgba(255, 226, 171, 0.64)';
  ctx.textAlign = 'right';
  ctx.font = 'bold 11px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText(`${distance} M`, x + width - 16, y + 37);
  ctx.fillStyle = 'rgba(83, 168, 160, 0.85)';
  roundedRectPath(ctx, x, y + 54, width, 3, 2);
  ctx.fill();
  ctx.fillStyle = '#f0c76a';
  const progress = Math.min(1, Math.max(0, 1 - distance / 900));
  if (progress > 0.01) {
    roundedRectPath(ctx, x, y + 54, width * progress, 3, 2);
    ctx.fill();
  }
}

function ensureMinimap() {
  if (!minimapCanvas) {
    minimapCanvas = document.createElement('canvas');
    minimapCanvas.width = 320;
    minimapCanvas.height = 244;
    minimapContext = minimapCanvas.getContext('2d');
  }
  return minimapContext;
}

function drawMinimapContents(ctx, scene, width, height) {
  const world = scene.world;
  const scale = Math.min((width - 16) / WORLD.width, (height - 20) / WORLD.height);
  const mapWidth = WORLD.width * scale;
  const mapHeight = WORLD.height * scale;
  const offsetX = (width - mapWidth) / 2;
  const offsetY = (height - mapHeight) / 2 + 2;
  const mapX = (x) => offsetX + x * scale;
  const mapY = (y) => offsetY + y * scale;

  ctx.fillStyle = '#24353a';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(61, 87, 83, 0.86)';
  ctx.fillRect(mapX(0), mapY(0), mapWidth, WORLD.beachY * scale);
  ctx.fillStyle = '#d5bc80';
  ctx.fillRect(mapX(0), mapY(WORLD.beachY), mapWidth, (WORLD.seaY - WORLD.beachY) * scale);
  const sea = ctx.createLinearGradient(0, mapY(WORLD.seaY), 0, mapY(WORLD.height));
  sea.addColorStop(0, '#2cb7b9');
  sea.addColorStop(1, '#0f6d7e');
  ctx.fillStyle = sea;
  ctx.fillRect(mapX(0), mapY(WORLD.seaY), mapWidth, (WORLD.height - WORLD.seaY) * scale);

  ctx.strokeStyle = 'rgba(234, 221, 186, 0.46)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (const roadX of ROAD.xs) {
    ctx.moveTo(mapX(roadX), mapY(0));
    ctx.lineTo(mapX(roadX), mapY(WORLD.beachY));
  }
  for (const roadY of ROAD.ys) {
    ctx.moveTo(mapX(0), mapY(roadY));
    ctx.lineTo(mapX(WORLD.width), mapY(roadY));
  }
  ctx.stroke();

  ctx.fillStyle = 'rgba(26, 37, 37, 0.36)';
  for (const building of world.buildings) {
    if (building.w * scale < 1.2 || building.h * scale < 1.2) continue;
    ctx.fillRect(mapX(building.x), mapY(building.y), building.w * scale, building.h * scale);
  }

  for (const car of scene.cars) {
    if (Math.abs(car.speed) < 3 && car.driver !== 'player') continue;
    const police = car.type === 'police';
    ctx.fillStyle = police ? (Math.floor(scene.time * 5) % 2 === 0 ? '#ff625d' : '#5a8cff') : 'rgba(244, 226, 178, 0.65)';
    ctx.beginPath();
    ctx.arc(mapX(car.x), mapY(car.y), police ? 2.7 : 1.35, 0, Math.PI * 2);
    ctx.fill();
  }

  if (scene.missionIndex != null) {
    const mission = MISSIONS[scene.missionIndex % MISSIONS.length];
    const spot = world.missionSpots[mission.spot % world.missionSpots.length];
    if (spot) {
      starPath(ctx, mapX(spot.x), mapY(spot.y), 5.5, 2.4);
      ctx.fillStyle = '#f5c85d';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 244, 197, 0.86)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  const player = scene.player;
  const px = player.inCar && player.car ? player.car.x : player.x;
  const py = player.inCar && player.car ? player.car.y : player.y;
  const angle = player.inCar && player.car ? player.car.angle : player.angle;
  ctx.save();
  ctx.translate(mapX(px), mapY(py));
  ctx.rotate(angle);
  ctx.fillStyle = '#fff1c4';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -4.2);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-5, 4.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(17, 24, 25, 0.8)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawMiniPanel(ctx, scene, view) {
  const size = view.w < 760 || view.h < 610 ? 142 : 178;
  const x = 22;
  const y = view.h - size - 22;
  panel(ctx, x, y, size, size, 13, 0.88);
  ctx.save();
  roundedRectPath(ctx, x + 8, y + 22, size - 16, size - 30, 8);
  ctx.clip();
  const mini = ensureMinimap();
  drawMinimapContents(mini, scene, 320, 244);
  ctx.drawImage(minimapCanvas, x + 8, y + 22, size - 16, size - 30);
  ctx.restore();
  ctx.fillStyle = 'rgba(255, 235, 188, 0.68)';
  ctx.font = 'bold 9px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('SOLMAR  /  CITY MAP', x + 11, y + 15);
  ctx.strokeStyle = 'rgba(255, 232, 175, 0.18)';
  ctx.lineWidth = 1;
  roundedRectPath(ctx, x + 8.5, y + 22.5, size - 17, size - 31, 8);
  ctx.stroke();
}

function drawWeapon(ctx, scene, view) {
  const player = scene.player;
  const width = 174;
  const height = 72;
  const x = view.w - width - 22;
  const y = view.h - height - 22;
  panel(ctx, x, y, width, height, 13);
  ctx.save();
  ctx.translate(x + 28, y + 36);
  ctx.fillStyle = '#d8d0b9';
  ctx.fillRect(-9, -6, 28, 12);
  ctx.fillStyle = '#403f3a';
  ctx.fillRect(6, -3, 19, 6);
  ctx.fillRect(-8, 5, 7, 12);
  ctx.fillStyle = '#f4cc6b';
  ctx.fillRect(-9, -6, 28, 2);
  ctx.restore();
  ctx.fillStyle = 'rgba(255, 234, 185, 0.58)';
  ctx.font = 'bold 9px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('PISTOL', x + 56, y + 29);
  ctx.fillStyle = '#fff0cc';
  ctx.font = 'bold 23px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText(String(player.ammo).padStart(2, '0'), x + 56, y + 55);
  ctx.fillStyle = 'rgba(255, 225, 170, 0.46)';
  ctx.font = '11px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText(`/ ${player.reserve}`, x + 93, y + 55);
  if (player.reloading) {
    ctx.fillStyle = '#f1c565';
    const progress = 1 - player.reloadTimer / 1.15;
    ctx.fillRect(x + 56, y + 61, 94 * Math.max(0, Math.min(1, progress)), 2.5);
    ctx.fillStyle = 'rgba(255, 236, 190, 0.58)';
    ctx.font = '8px "Trebuchet MS", Arial, sans-serif';
    ctx.fillText('RELOADING', x + 56, y + 70);
  }
  if (player.ammo === 0 && !player.reloading) {
    ctx.fillStyle = '#ef725d';
    ctx.font = 'bold 8px "Trebuchet MS", Arial, sans-serif';
    ctx.fillText('PRESS R', x + 56, y + 70);
  }
}

function drawSpeed(ctx, scene, view) {
  if (!scene.player.inCar || !scene.player.car) return;
  const car = scene.player.car;
  const value = Math.round(speedKmh(car));
  const width = 168;
  const x = view.w / 2 - width / 2;
  const y = view.h - 91;
  panel(ctx, x, y, width, 69, 12, 0.75);
  ctx.fillStyle = '#fff0cb';
  ctx.font = 'bold 31px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value).padStart(3, '0'), x + 106, y + 32);
  ctx.fillStyle = 'rgba(255, 229, 174, 0.55)';
  ctx.font = 'bold 9px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('KM/H', x + 111, y + 36);
  ctx.fillStyle = 'rgba(255, 231, 180, 0.48)';
  ctx.font = '9px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(car.name.toUpperCase(), x + width / 2, y + 56);
  ctx.fillStyle = 'rgba(255, 236, 188, 0.12)';
  roundedRectPath(ctx, x + 16, y + 62, width - 32, 2, 1);
  ctx.fill();
  const ratio = Math.min(1, speedKmh(car) / 220);
  ctx.fillStyle = ratio > 0.72 ? '#ef775d' : '#f2c563';
  roundedRectPath(ctx, x + 16, y + 62, (width - 32) * ratio, 2, 1);
  ctx.fill();
}

function drawPrompt(ctx, scene, view, nearest) {
  if (!scene.player.inCar && !nearest) return;
  const label = scene.player.inCar ? 'EXIT VEHICLE' : `ENTER ${nearest.name.toUpperCase()}`;
  const width = 178;
  const x = view.w / 2 - width / 2;
  const y = view.h - 133;
  panel(ctx, x, y, width, 31, 9, 0.77);
  ctx.fillStyle = '#f0c765';
  roundedRectPath(ctx, x + 10, y + 7, 18, 17, 4);
  ctx.fill();
  ctx.fillStyle = '#20292a';
  ctx.font = 'bold 10px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('E', x + 19, y + 16);
  ctx.fillStyle = '#fff0cd';
  ctx.font = 'bold 9px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 35, y + 16.5);
}

export function drawHUD(ctx, scene, view, options = {}) {
  ctx.save();
  drawTopLeft(ctx, scene, view);
  drawWanted(ctx, scene, view);
  drawObjective(ctx, scene, view);
  drawMiniPanel(ctx, scene, view);
  drawWeapon(ctx, scene, view);
  drawSpeed(ctx, scene, view);
  const closest = !scene.player.inCar ? nearestCar(scene.cars, scene.player.x, scene.player.y) : null;
  drawPrompt(ctx, scene, view, options.nearest ?? closest);
  ctx.restore();
}

