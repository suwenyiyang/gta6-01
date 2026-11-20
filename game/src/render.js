// The whole drawn world: warm ground, rooftops, actors, effects and sunlight.

import { COLORS, ROAD } from './config.js';
import { drawGround } from './world.js';
import { carLightState } from './vehicles.js';

const TWO_PI = Math.PI * 2;
const V_HALF = ROAD.verticalWidth / 2;
const H_HALF = ROAD.horizontalWidth / 2;

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
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

function visible(camera, x, y, width, height, margin = 100) {
  return x + width >= camera.x - margin && x <= camera.x + camera.w + margin
    && y + height >= camera.y - margin && y <= camera.y + camera.h + margin;
}

function drawBuildingShadow(ctx, building) {
  const offsetX = 7 + building.levels * 1.6;
  const offsetY = 10 + building.levels * 3.3;
  ctx.save();
  const gradient = ctx.createLinearGradient(building.x, building.y, building.x + offsetX, building.y + offsetY + building.h);
  gradient.addColorStop(0, 'rgba(58, 37, 27, 0.30)');
  gradient.addColorStop(1, 'rgba(58, 37, 27, 0.06)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(building.x + 4, building.y + building.h - 2);
  ctx.lineTo(building.x + building.w + 4, building.y + building.h - 2);
  ctx.lineTo(building.x + building.w + offsetX, building.y + building.h + offsetY);
  ctx.lineTo(building.x + offsetX, building.y + building.h + offsetY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(58, 37, 27, 0.19)';
  ctx.fillRect(building.x + offsetX * 0.5, building.y + offsetY * 0.6, building.w, building.h * 0.88);
  ctx.restore();
}

function drawBuilding(ctx, building) {
  const inset = Math.min(7, 2 + building.levels * 0.25);
  ctx.fillStyle = 'rgba(46, 36, 31, 0.30)';
  ctx.fillRect(building.x + 3, building.y + 5, building.w, building.h);

  ctx.fillStyle = building.color;
  ctx.fillRect(building.x, building.y, building.w, building.h);
  ctx.fillStyle = 'rgba(255, 228, 177, 0.20)';
  ctx.fillRect(building.x + 2, building.y + 2, building.w - 4, 5);

  ctx.fillStyle = building.roof;
  ctx.fillRect(building.x + inset, building.y + inset, building.w - inset * 2, building.h - inset * 2);
  ctx.strokeStyle = 'rgba(73, 52, 41, 0.54)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(building.x + inset + 0.5, building.y + inset + 0.5, building.w - inset * 2 - 1, building.h - inset * 2 - 1);
  ctx.strokeStyle = 'rgba(255, 235, 192, 0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(building.x + 2.5, building.y + 2.5, building.w - 5, building.h - 5);

  // Glazed strips make the roof read as a lived-in top floor from above.
  const windowY = building.y + inset + 7;
  if (building.h > 58) {
    const windowCount = Math.max(2, Math.floor(building.w / 34));
    ctx.fillStyle = 'rgba(35, 79, 83, 0.54)';
    for (let index = 0; index < windowCount; index += 1) {
      const x = building.x + inset + 10 + index * ((building.w - inset * 2 - 20) / windowCount);
      ctx.fillRect(x, windowY, 8, 4);
      ctx.fillRect(x, building.y + building.h - inset - 12, 8, 4);
    }
  }

  for (const feature of building.features) {
    const width = Math.max(8, building.w * feature.w);
    const height = Math.max(7, building.h * feature.h);
    const x = building.x + inset + feature.x * (building.w - inset * 2);
    const y = building.y + inset + feature.y * (building.h - inset * 2);
    if (feature.type === 'ac') {
      ctx.fillStyle = '#727c7c';
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = '#aeb6b0';
      ctx.fillRect(x + 2, y + 2, width - 4, 2);
      ctx.strokeStyle = 'rgba(44, 51, 50, 0.45)';
      ctx.lineWidth = 1;
      for (let line = 3; line < width - 3; line += 5) {
        ctx.beginPath();
        ctx.moveTo(x + line, y + 4);
        ctx.lineTo(x + line, y + height - 2);
        ctx.stroke();
      }
    } else if (feature.type === 'vent') {
      ctx.fillStyle = '#5f615d';
      ctx.beginPath();
      ctx.arc(x + width * 0.5, y + height * 0.5, Math.min(width, height) * 0.45, 0, TWO_PI);
      ctx.fill();
      ctx.strokeStyle = '#c0b7a4';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x + width * 0.5, y + height * 0.5, Math.min(width, height) * 0.26, 0, TWO_PI);
      ctx.stroke();
    } else if (feature.type === 'skylight') {
      const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
      gradient.addColorStop(0, 'rgba(196, 243, 227, 0.84)');
      gradient.addColorStop(1, 'rgba(53, 120, 132, 0.72)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = 'rgba(235, 243, 211, 0.75)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(x, y, width, height);
    } else if (feature.type === 'pool') {
      ctx.fillStyle = 'rgba(214, 247, 230, 0.9)';
      roundedRectPath(ctx, x - 2, y - 2, width + 4, height + 4, 4);
      ctx.fill();
      ctx.fillStyle = COLORS.seaLight;
      roundedRectPath(ctx, x, y, width, height, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 235, 0.5)';
      ctx.beginPath();
      ctx.moveTo(x + 3, y + height * 0.5);
      ctx.lineTo(x + width - 3, y + height * 0.5);
      ctx.stroke();
    }
  }

  if (building.sign) {
    const labelWidth = Math.min(building.w - 22, Math.max(54, building.sign.length * 8.3));
    const labelX = building.x + building.w * 0.5 - labelWidth * 0.5;
    const labelY = building.y + building.h - inset - 20;
    ctx.fillStyle = 'rgba(47, 41, 36, 0.78)';
    roundedRectPath(ctx, labelX, labelY, labelWidth, 15, 3);
    ctx.fill();
    ctx.fillStyle = building.signColor;
    ctx.font = 'bold 9px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(building.sign, building.x + building.w * 0.5, labelY + 7.8);
  }
}

function drawPropShadow(ctx, prop) {
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#3e2c22';
  ctx.beginPath();
  ctx.ellipse(prop.x + prop.size * 0.32, prop.y + prop.size * 0.52, prop.size * 0.72, prop.size * 0.3, 0.2, 0, TWO_PI);
  ctx.fill();
  ctx.restore();
}

function drawProp(ctx, prop, time) {
  const sway = Math.sin(time * 1.35 + prop.x * 0.01) * 0.045;
  if (prop.type === 'palm') {
    ctx.save();
    ctx.translate(prop.x, prop.y);
    ctx.strokeStyle = '#76573b';
    ctx.lineWidth = Math.max(2.4, prop.size * 0.13);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, prop.size * 0.18);
    ctx.quadraticCurveTo(Math.sin(prop.angle) * prop.size * 0.12, -prop.size * 0.18, 0, -prop.size * 0.38);
    ctx.stroke();
    ctx.translate(0, -prop.size * 0.38);
    ctx.rotate(prop.angle * 0.18 + sway);
    const leafColors = ['#3c7f50', '#4c9559', '#2e7048'];
    for (let leaf = 0; leaf < 7; leaf += 1) {
      const angle = (leaf / 7) * TWO_PI + prop.angle * 0.2;
      const length = prop.size * (0.62 + (leaf % 3) * 0.08);
      ctx.strokeStyle = leafColors[leaf % leafColors.length];
      ctx.lineWidth = Math.max(2, prop.size * 0.08);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(angle - 0.18) * length * 0.6, Math.sin(angle - 0.18) * length * 0.48, Math.cos(angle) * length, Math.sin(angle) * length * 0.78);
      ctx.stroke();
    }
    ctx.fillStyle = '#d6a744';
    for (let nut = 0; nut < 3; nut += 1) {
      ctx.beginPath();
      ctx.arc(Math.cos(nut * 2.1) * 3, Math.sin(nut * 2.1) * 3, 1.8, 0, TWO_PI);
      ctx.fill();
    }
    ctx.restore();
  } else if (prop.type === 'tree') {
    ctx.save();
    ctx.translate(prop.x, prop.y);
    ctx.fillStyle = '#5b4732';
    ctx.fillRect(-2, 0, 4, prop.size * 0.6);
    const colors = ['#4f884c', '#6c9c55', '#3f7446'];
    for (let layer = 0; layer < 3; layer += 1) {
      ctx.fillStyle = colors[(layer + prop.hue) % colors.length];
      ctx.beginPath();
      ctx.arc(Math.cos(layer * 2.1) * prop.size * 0.18, -prop.size * 0.3 + Math.sin(layer * 2.1) * prop.size * 0.14, prop.size * (0.48 - layer * 0.06), 0, TWO_PI);
      ctx.fill();
    }
    ctx.restore();
  } else if (prop.type === 'lamp') {
    ctx.save();
    ctx.translate(prop.x, prop.y);
    ctx.strokeStyle = '#3d4647';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -prop.size * 1.65);
    ctx.quadraticCurveTo(0, -prop.size * 1.9, prop.size * 0.42, -prop.size * 1.82);
    ctx.stroke();
    const glow = ctx.createRadialGradient(prop.size * 0.48, -prop.size * 1.82, 0, prop.size * 0.48, -prop.size * 1.82, prop.size * 0.8);
    glow.addColorStop(0, 'rgba(255, 222, 139, 0.45)');
    glow.addColorStop(1, 'rgba(255, 222, 139, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(prop.size * 0.48, -prop.size * 1.82, prop.size * 0.8, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = '#ffe2a4';
    ctx.beginPath();
    ctx.arc(prop.size * 0.48, -prop.size * 1.82, 2.2, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  } else if (prop.type === 'bench') {
    ctx.save();
    ctx.translate(prop.x, prop.y);
    ctx.rotate(prop.angle);
    ctx.fillStyle = '#8b5e3d';
    ctx.fillRect(-prop.size, -4, prop.size * 2, 8);
    ctx.fillStyle = '#5a4031';
    ctx.fillRect(-prop.size + 2, -6, prop.size * 2 - 4, 3);
    ctx.fillRect(-prop.size + 3, 4, 3, 6);
    ctx.fillRect(prop.size - 6, 4, 3, 6);
    ctx.restore();
  } else if (prop.type === 'umbrella') {
    ctx.save();
    ctx.translate(prop.x, prop.y);
    ctx.strokeStyle = '#8f704b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 3);
    ctx.lineTo(0, -prop.size * 0.5);
    ctx.stroke();
    const colors = prop.hue % 2 === 0 ? ['#ee765f', '#f5e0ad'] : ['#2ba5a4', '#f1dcae'];
    for (let slice = 0; slice < 8; slice += 1) {
      ctx.fillStyle = colors[slice % 2];
      ctx.beginPath();
      ctx.moveTo(0, -prop.size * 0.5);
      ctx.arc(0, -prop.size * 0.5, prop.size, (slice / 8) * TWO_PI, ((slice + 1) / 8) * TWO_PI);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(88, 66, 44, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-prop.size, -prop.size * 0.5);
    ctx.lineTo(prop.size, -prop.size * 0.5);
    ctx.stroke();
    ctx.restore();
  }
}

function drawTrafficSignals(ctx, world, camera, time) {
  ctx.save();
  for (const node of world.intersections) {
    if (!visible(camera, node.x - V_HALF, node.y - H_HALF, V_HALF * 2, H_HALF * 2, 80)) continue;
    const cycle = (time + ((node.col * 0.73 + node.row * 1.17) % 2.4)) % 9.4;
    const eastWest = cycle < 4.4;
    const signals = [
      { x: node.x - V_HALF - 10, y: node.y - H_HALF - 10, green: eastWest },
      { x: node.x + V_HALF + 10, y: node.y + H_HALF + 10, green: eastWest },
      { x: node.x + V_HALF + 10, y: node.y - H_HALF - 10, green: !eastWest && cycle >= 4.8 },
      { x: node.x - V_HALF - 10, y: node.y + H_HALF + 10, green: !eastWest && cycle >= 4.8 },
    ];
    for (const signal of signals) {
      ctx.fillStyle = '#2f3636';
      ctx.fillRect(signal.x - 2, signal.y - 3, 4, 9);
      ctx.fillStyle = signal.green ? '#79d98b' : '#ec6b5b';
      ctx.beginPath();
      ctx.arc(signal.x, signal.y, 2.2, 0, TWO_PI);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawSkidMarks(ctx, skids, camera) {
  for (const skid of skids) {
    if (!visible(camera, skid.x, skid.y, 2, 2, 20)) continue;
    ctx.save();
    ctx.translate(skid.x, skid.y);
    ctx.rotate(skid.angle);
    ctx.globalAlpha = Math.max(0.04, Math.min(0.34, skid.alpha ?? 0.22));
    ctx.fillStyle = '#262321';
    ctx.fillRect(-9, -11, 18, 3);
    ctx.fillRect(-9, 8, 18, 3);
    ctx.restore();
  }
}

function drawMissionMarker(ctx, scene, camera) {
  if (scene.missionIndex == null) return;
  const spot = scene.world.missionSpots[scene.missionIndex % scene.world.missionSpots.length];
  if (!spot || !visible(camera, spot.x - 70, spot.y - 100, 140, 170, 60)) return;
  const pulse = (Math.sin(scene.time * 3.2) + 1) * 0.5;
  ctx.save();
  ctx.translate(spot.x, spot.y);
  const glow = ctx.createRadialGradient(0, 0, 5, 0, 0, 58);
  glow.addColorStop(0, `rgba(255, 207, 91, ${0.22 + pulse * 0.12})`);
  glow.addColorStop(1, 'rgba(255, 207, 91, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 58, 0, TWO_PI);
  ctx.fill();
  ctx.strokeStyle = `rgba(255, 214, 106, ${0.55 + pulse * 0.3})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 28 + pulse * 7, 15 + pulse * 4, 0, 0, TWO_PI);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 235, 179, 0.72)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 19, 10, 0, 0, TWO_PI);
  ctx.stroke();
  ctx.fillStyle = '#f6bd58';
  ctx.beginPath();
  ctx.moveTo(0, -46 + Math.sin(scene.time * 2.6) * 4);
  ctx.lineTo(-8, -58 + Math.sin(scene.time * 2.6) * 4);
  ctx.lineTo(8, -58 + Math.sin(scene.time * 2.6) * 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#273033';
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', 0, -52 + Math.sin(scene.time * 2.6) * 4);
  ctx.fillStyle = 'rgba(34, 40, 41, 0.82)';
  roundedRectPath(ctx, -43, 22, 86, 20, 5);
  ctx.fill();
  ctx.fillStyle = '#ffe4a1';
  ctx.font = 'bold 9px Arial, sans-serif';
  ctx.fillText(spot.name.toUpperCase(), 0, 32.5);
  ctx.restore();
}

function drawCarShadow(ctx, car) {
  ctx.save();
  ctx.translate(car.x + 4, car.y + 7);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(43, 33, 27, 0.28)';
  roundedRectPath(ctx, -car.length * 0.5, -car.width * 0.5, car.length, car.width, 10);
  ctx.fill();
  ctx.restore();
}

function drawWheel(ctx, x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#1f2526';
  roundedRectPath(ctx, -5, -3, 10, 6, 2);
  ctx.fill();
  ctx.restore();
}

export function drawCar(ctx, car, time) {
  const length = car.length;
  const width = car.width;
  const front = length * 0.5;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);

  drawWheel(ctx, -length * 0.27, -width * 0.42, -car.steer * 0.28);
  drawWheel(ctx, length * 0.29, -width * 0.42, car.steer * 0.32);
  drawWheel(ctx, -length * 0.27, width * 0.42, -car.steer * 0.28);
  drawWheel(ctx, length * 0.29, width * 0.42, car.steer * 0.32);

  const bodyGradient = ctx.createLinearGradient(0, -width * 0.5, 0, width * 0.5);
  bodyGradient.addColorStop(0, car.color);
  bodyGradient.addColorStop(0.52, lighten(car.color, 0.08));
  bodyGradient.addColorStop(1, darken(car.color, 0.16));

  if (car.type === 'truck') {
    ctx.fillStyle = '#d9ceb8';
    roundedRectPath(ctx, -length * 0.5, -width * 0.48, length * 0.62, width * 0.96, 5);
    ctx.fill();
    ctx.strokeStyle = '#7b7062';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = bodyGradient;
    roundedRectPath(ctx, length * 0.1, -width * 0.48, length * 0.4, width * 0.96, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 247, 219, 0.65)';
    ctx.fillRect(-length * 0.45, -width * 0.38, length * 0.48, 2);
    ctx.fillStyle = '#2f6f78';
    ctx.fillRect(length * 0.28, -width * 0.37, length * 0.12, width * 0.74);
    ctx.fillStyle = 'rgba(101, 73, 48, 0.5)';
    ctx.fillRect(-length * 0.4, -width * 0.5, length * 0.2, 3);
  } else {
    ctx.fillStyle = bodyGradient;
    roundedRectPath(ctx, -length * 0.5, -width * 0.5, length, width, car.type === 'sports' ? 10 : 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(59, 46, 39, 0.62)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 246, 215, 0.23)';
    roundedRectPath(ctx, -length * 0.39, -width * 0.32, length * 0.2, width * 0.17, 3);
    ctx.fill();

    // Cabin, windscreen and rear glass.
    ctx.fillStyle = darken(car.color, 0.16);
    roundedRectPath(ctx, -length * 0.2, -width * 0.38, length * 0.49, width * 0.76, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(30, 80, 91, 0.88)';
    roundedRectPath(ctx, length * 0.03, -width * 0.31, length * 0.14, width * 0.62, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(55, 115, 122, 0.72)';
    roundedRectPath(ctx, -length * 0.16, -width * 0.28, length * 0.12, width * 0.56, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(238, 233, 204, 0.24)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-length * 0.18, 0);
    ctx.lineTo(length * 0.28, 0);
    ctx.stroke();
  }

  if (car.type === 'taxi') {
    ctx.fillStyle = '#f7e7b9';
    roundedRectPath(ctx, -length * 0.08, -width * 0.13, length * 0.16, width * 0.26, 3);
    ctx.fill();
    ctx.fillStyle = '#2c3735';
    ctx.fillRect(-length * 0.08, -width * 0.05, length * 0.16, width * 0.1);
    ctx.fillStyle = 'rgba(38, 43, 42, 0.65)';
    for (let index = 0; index < 8; index += 1) {
      if (index % 2 === 0) ctx.fillRect(-length * 0.34 + index * 5, width * 0.31, 5, 3);
    }
  } else if (car.type === 'sports') {
    ctx.fillStyle = 'rgba(255, 238, 195, 0.55)';
    ctx.fillRect(-length * 0.36, -1.2, length * 0.7, 2.4);
    ctx.fillStyle = darken(car.color, 0.3);
    roundedRectPath(ctx, -length * 0.51, -width * 0.36, 5, width * 0.72, 2);
    ctx.fill();
  } else if (car.type === 'police') {
    ctx.fillStyle = 'rgba(36, 57, 65, 0.86)';
    ctx.fillRect(-length * 0.26, -width * 0.49, length * 0.44, 4);
    ctx.fillRect(-length * 0.26, width * 0.49 - 4, length * 0.44, 4);
    const phase = carLightState(car, time);
    ctx.fillStyle = '#252b2c';
    roundedRectPath(ctx, -6, -width * 0.16, 12, width * 0.32, 2);
    ctx.fill();
    ctx.fillStyle = phase === 0 ? '#f14e4c' : '#3e73e6';
    ctx.beginPath();
    ctx.arc(-3, 0, 2.7, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = phase === 0 ? '#6f91e7' : '#f2706d';
    ctx.beginPath();
    ctx.arc(3, 0, 2.7, 0, TWO_PI);
    ctx.fill();
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 21);
    glow.addColorStop(0, phase === 0 ? 'rgba(255, 74, 75, 0.26)' : 'rgba(83, 115, 255, 0.26)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 21, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 235, 0.75)';
    ctx.font = 'bold 5px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SMD', 0, width * 0.47);
  }

  ctx.fillStyle = '#fff0b5';
  ctx.beginPath();
  ctx.arc(front - 4, -width * 0.29, 2.1, 0, TWO_PI);
  ctx.arc(front - 4, width * 0.29, 2.1, 0, TWO_PI);
  ctx.fill();
  ctx.fillStyle = '#c94d45';
  ctx.fillRect(-front + 1, -width * 0.34, 3, 4);
  ctx.fillRect(-front + 1, width * 0.34 - 4, 3, 4);

  if (car.hitFlash > 0.02) {
    ctx.globalAlpha = Math.min(0.5, car.hitFlash);
    ctx.fillStyle = '#fff2cb';
    roundedRectPath(ctx, -length * 0.5, -width * 0.5, length, width, 8);
    ctx.fill();
  }
  ctx.restore();
}

function drawPedestrianShadow(ctx, ped) {
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#2d241f';
  ctx.beginPath();
  ctx.ellipse(ped.x + 3, ped.y + 5, 9, 4, ped.angle, 0, TWO_PI);
  ctx.fill();
  ctx.restore();
}

export function drawPedestrian(ctx, ped) {
  const bounce = ped.state === 'idle' ? 0 : Math.sin(ped.phase) * (ped.state === 'flee' ? 2.4 : 1.3);
  ctx.save();
  ctx.translate(ped.x, ped.y + bounce * 0.25);
  ctx.rotate(ped.angle);
  const stride = Math.sin(ped.phase) * (ped.state === 'flee' ? 5.4 : 3.2);
  ctx.strokeStyle = ped.pants;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-2, -2.4);
  ctx.lineTo(-6 - stride, -3.1);
  ctx.moveTo(-2, 2.4);
  ctx.lineTo(-6 + stride, 3.1);
  ctx.stroke();
  ctx.fillStyle = ped.shirt;
  roundedRectPath(ctx, -6, -5, 12, 10, 4);
  ctx.fill();
  ctx.strokeStyle = ped.skin;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  if (ped.state === 'flee') {
    ctx.moveTo(0, -4);
    ctx.lineTo(-2, -8);
    ctx.moveTo(0, 4);
    ctx.lineTo(-2, 8);
  } else {
    ctx.moveTo(0, -4);
    ctx.lineTo(2 + stride * 0.25, -7);
    ctx.moveTo(0, 4);
    ctx.lineTo(2 - stride * 0.25, 7);
  }
  ctx.stroke();
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(3.5, 0, 3.8, 0, TWO_PI);
  ctx.fill();
  ctx.fillStyle = ped.hair;
  ctx.beginPath();
  ctx.arc(2.9, 0, 3.5, Math.PI * 0.72, Math.PI * 1.65);
  ctx.fill();
  if (ped.hat) {
    ctx.fillStyle = '#2e4148';
    ctx.beginPath();
    ctx.arc(3.5, 0, 3.2, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = '#1f2c32';
    ctx.fillRect(0.2, -4.2, 2, 8.4);
  }
  if (ped.bag) {
    ctx.fillStyle = '#725743';
    ctx.fillRect(-8, -5, 4, 10);
  }
  ctx.restore();
}

export function drawPlayer(ctx, player, time) {
  if (!player.alive) {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle + Math.PI / 2);
    ctx.fillStyle = 'rgba(35, 28, 24, 0.2)';
    ctx.beginPath();
    ctx.ellipse(3, 5, 13, 6, 0.4, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = player.jacket;
    roundedRectPath(ctx, -8, -4, 16, 8, 4);
    ctx.fill();
    ctx.fillStyle = player.hair;
    ctx.beginPath();
    ctx.arc(9, 0, 4.2, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#2b221c';
  ctx.beginPath();
  ctx.ellipse(player.x + 4, player.y + 6, 12, 5, player.angle, 0, TWO_PI);
  ctx.fill();
  ctx.restore();

  const moving = player.speed > 10;
  const stride = moving ? Math.sin(player.walkPhase) * (player.running ? 5.3 : 3.8) : 0;
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);
  ctx.strokeStyle = player.pants;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-3, -3);
  ctx.lineTo(-8 - stride, -4.1);
  ctx.moveTo(-3, 3);
  ctx.lineTo(-8 + stride, 4.1);
  ctx.stroke();
  ctx.fillStyle = player.jacket;
  roundedRectPath(ctx, -8, -6, 15, 12, 5);
  ctx.fill();
  ctx.fillStyle = player.shirt;
  ctx.fillRect(-2, -4.2, 5, 8.4);
  ctx.fillStyle = '#26333d';
  ctx.fillRect(-5, -5.7, 3.8, 11.4);
  ctx.strokeStyle = player.jacket;
  ctx.lineWidth = 3.3;
  ctx.beginPath();
  ctx.moveTo(-1, -5);
  ctx.lineTo(player.aim ? 7 : 2 + stride * 0.25, player.aim ? -7 : -8);
  ctx.moveTo(-1, 5);
  ctx.lineTo(2 - stride * 0.25, 8);
  ctx.stroke();
  ctx.fillStyle = '#efc6a2';
  ctx.beginPath();
  ctx.arc(5, 0, 4.4, 0, TWO_PI);
  ctx.fill();
  ctx.fillStyle = player.hair;
  ctx.beginPath();
  ctx.arc(4.2, 0, 4.15, Math.PI * 0.55, Math.PI * 1.5);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-2.4, 1.8, 4.3, 2, -0.2, 0, TWO_PI);
  ctx.fill();
  if (player.aim || player.muzzleTimer > 0) {
    ctx.strokeStyle = '#1d2325';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(7, -4.3);
    ctx.lineTo(15, -4.3);
    ctx.stroke();
    if (player.muzzleTimer > 0) {
      ctx.fillStyle = '#ffd56f';
      ctx.beginPath();
      ctx.arc(17, -4.3, 4.2, 0, TWO_PI);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 242, 170, 0.36)';
      ctx.beginPath();
      ctx.arc(17, -4.3, 9, 0, TWO_PI);
      ctx.fill();
    }
  }
  if (player.punchTimer > 0) {
    ctx.strokeStyle = '#efc6a2';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(2, -4);
    ctx.lineTo(12, -8);
    ctx.stroke();
  }
  if (player.damageFlash > 0) {
    ctx.globalAlpha = player.damageFlash * 0.45;
    ctx.fillStyle = '#f25555';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, TWO_PI);
    ctx.fill();
  }
  ctx.restore();
}

function drawBullets(ctx, bullets) {
  for (const bullet of bullets) {
    ctx.strokeStyle = 'rgba(255, 225, 131, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bullet.x, bullet.y);
    ctx.lineTo(bullet.x - bullet.vx * 0.018, bullet.y - bullet.vy * 0.018);
    ctx.stroke();
  }
}

function drawParticles(ctx, particles) {
  for (const particle of particles) {
    const alpha = Math.max(0, particle.life / Math.max(0.001, particle.maxLife));
    ctx.save();
    ctx.globalAlpha = alpha * (particle.alpha ?? 1);
    if (particle.type === 'dust' || particle.type === 'smoke') {
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * (1.25 - alpha * 0.25), 0, TWO_PI);
      ctx.fill();
    } else if (particle.type === 'spark') {
      ctx.strokeStyle = particle.color;
      ctx.lineWidth = particle.size;
      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(particle.x - particle.vx * 0.025, particle.y - particle.vy * 0.025);
      ctx.stroke();
    } else if (particle.type === 'muzzle') {
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      for (let point = 0; point < 8; point += 1) {
        const angle = (point / 8) * TWO_PI;
        const radius = point % 2 === 0 ? particle.size : particle.size * 0.34;
        const x = particle.x + Math.cos(angle) * radius;
        const y = particle.y + Math.sin(angle) * radius;
        if (point === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    } else if (particle.type === 'confetti') {
      ctx.fillStyle = particle.color;
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation ?? 0);
      ctx.fillRect(-particle.size, -particle.size * 0.45, particle.size * 2, particle.size * 0.9);
    } else {
      ctx.fillStyle = particle.color ?? '#f6c45c';
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, TWO_PI);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawAtmosphere(ctx, view, time) {
  ctx.save();
  const sun = ctx.createLinearGradient(0, 0, view.w, view.h);
  sun.addColorStop(0, 'rgba(255, 190, 92, 0.13)');
  sun.addColorStop(0.45, 'rgba(255, 180, 102, 0.035)');
  sun.addColorStop(1, 'rgba(24, 98, 116, 0.11)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, view.w, view.h);

  const vignette = ctx.createRadialGradient(view.w * 0.5, view.h * 0.43, Math.min(view.w, view.h) * 0.2, view.w * 0.5, view.h * 0.5, Math.max(view.w, view.h) * 0.72);
  vignette.addColorStop(0, 'rgba(19, 27, 31, 0)');
  vignette.addColorStop(0.8, 'rgba(19, 27, 31, 0.09)');
  vignette.addColorStop(1, 'rgba(13, 21, 26, 0.34)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, view.w, view.h);

  ctx.globalAlpha = 0.018;
  ctx.fillStyle = '#fff4d3';
  for (let index = 0; index < 12; index += 1) {
    const y = (index / 12) * view.h + Math.sin(time * 0.15 + index) * 3;
    ctx.fillRect(0, y, view.w, 1);
  }
  ctx.restore();
}

function lighten(hex, amount) {
  const value = hex.replace('#', '');
  const number = Number.parseInt(value.length === 3 ? value.split('').map((part) => part + part).join('') : value, 16);
  const red = Math.min(255, (number >> 16) + Math.round(255 * amount));
  const green = Math.min(255, ((number >> 8) & 255) + Math.round(255 * amount));
  const blue = Math.min(255, (number & 255) + Math.round(255 * amount));
  return `rgb(${red}, ${green}, ${blue})`;
}

function darken(hex, amount) {
  const value = hex.replace('#', '');
  const number = Number.parseInt(value.length === 3 ? value.split('').map((part) => part + part).join('') : value, 16);
  const red = Math.max(0, (number >> 16) - Math.round(255 * amount));
  const green = Math.max(0, ((number >> 8) & 255) - Math.round(255 * amount));
  const blue = Math.max(0, (number & 255) - Math.round(255 * amount));
  return `rgb(${red}, ${green}, ${blue})`;
}

export function renderScene(ctx, scene, camera, view) {
  const { world } = scene;
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  drawGround(ctx, camera, world, scene.time);
  drawMissionMarker(ctx, scene, camera);
  drawSkidMarks(ctx, scene.skids, camera);

  for (const building of world.buildings) {
    if (!visible(camera, building.x, building.y, building.w, building.h, 80)) continue;
    drawBuildingShadow(ctx, building);
  }
  for (const prop of world.props) {
    if (!visible(camera, prop.x - 30, prop.y - 40, 60, 60, 50)) continue;
    drawPropShadow(ctx, prop);
  }
  for (const prop of world.props) {
    if (!visible(camera, prop.x - 40, prop.y - 55, 80, 80, 50)) continue;
    drawProp(ctx, prop, scene.time);
  }
  for (const building of world.buildings) {
    if (!visible(camera, building.x, building.y, building.w, building.h, 80)) continue;
    drawBuilding(ctx, building);
  }
  drawTrafficSignals(ctx, world, camera, scene.time);

  const actors = [];
  for (const pedestrian of scene.pedestrians) {
    if (visible(camera, pedestrian.x - 18, pedestrian.y - 18, 36, 36, 30)) actors.push({ y: pedestrian.y, type: 'ped', value: pedestrian });
  }
  for (const car of scene.cars) {
    if (visible(camera, car.x - car.length, car.y - car.length, car.length * 2, car.length * 2, 50)) actors.push({ y: car.y, type: 'car', value: car });
  }
  if (!scene.player.inCar && scene.player.alive) actors.push({ y: scene.player.y, type: 'player', value: scene.player });
  actors.sort((a, b) => a.y - b.y);
  for (const actor of actors) {
    if (actor.type === 'ped') {
      drawPedestrianShadow(ctx, actor.value);
      drawPedestrian(ctx, actor.value);
    } else if (actor.type === 'car') {
      drawCarShadow(ctx, actor.value);
      drawCar(ctx, actor.value, scene.time);
    } else {
      drawPlayer(ctx, actor.value, scene.time);
    }
  }
  drawBullets(ctx, scene.bullets);
  drawParticles(ctx, scene.particles);
  ctx.restore();
  drawAtmosphere(ctx, view, scene.time);
}
