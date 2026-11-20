// Deterministic coastal-city generation and the static ground layer.

import { COLORS, ROAD, WORLD } from './config.js';
import { createRandom } from './random.js';

const V_HALF = ROAD.verticalWidth / 2;
const H_HALF = ROAD.horizontalWidth / 2;
let activeWorld = null;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function pointInRect(x, y, rect, padding = 0) {
  return x >= rect.x - padding && x <= rect.x + rect.w + padding
    && y >= rect.y - padding && y <= rect.y + rect.h + padding;
}

function rectsOverlap(a, b, gap = 0) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x
    && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

function splitLot(x, y, w, h, rng, depth, out) {
  const canSplitX = w > 190;
  const canSplitY = h > 190;
  if (depth >= 2 || (!canSplitX && !canSplitY)) {
    out.push({ x, y, w, h });
    return;
  }
  const splitX = canSplitX && (!canSplitY || w > h * 1.15 || (w > h && rng.chance(0.62)));
  const fraction = rng.float(0.36, 0.64);
  if (splitX) {
    const left = Math.round(w * fraction);
    splitLot(x, y, left, h, rng, depth + 1, out);
    splitLot(x + left, y, w - left, h, rng, depth + 1, out);
  } else {
    const top = Math.round(h * fraction);
    splitLot(x, y, w, top, rng, depth + 1, out);
    splitLot(x, y + top, w, h - top, rng, depth + 1, out);
  }
}

function newBuilding(lot, block, rng, world) {
  const inset = rng.float(5, 13);
  const x = Math.round(lot.x + inset);
  const y = Math.round(lot.y + inset);
  const w = Math.round(lot.w - inset * 2);
  const h = Math.round(lot.h - inset * 2);
  if (w < 44 || h < 40) return null;

  const centerDistance = Math.hypot(block.centerX - WORLD.width * 0.48, block.centerY - WORLD.height * 0.42);
  const downtown = clamp(1 - centerDistance / 2250, 0, 1);
  const waterfront = block.row === ROAD.ys.length;
  const levels = waterfront
    ? rng.int(1, 4)
    : clamp(Math.round(1 + rng.float(1.5, 4.5) + downtown * rng.float(2, 8)), 1, 13);
  const colorIndex = rng.int(0, COLORS.building.length - 1);
  const roofIndex = (colorIndex + rng.int(1, 4)) % COLORS.roofs.length;
  const features = [];
  const featureCount = rng.int(1, w > 150 && h > 110 ? 4 : 2);
  for (let index = 0; index < featureCount; index += 1) {
    features.push({
      type: rng.chance(0.12) ? 'pool' : rng.pick(['ac', 'vent', 'skylight', 'ac']),
      x: rng.float(0.16, 0.78),
      y: rng.float(0.16, 0.76),
      w: rng.float(0.09, 0.22),
      h: rng.float(0.08, 0.19),
      angle: rng.chance(0.18) ? rng.float(-0.3, 0.3) : 0,
    });
  }

  return {
    id: world.buildings.length,
    blockId: block.id,
    x, y, w, h,
    levels,
    color: COLORS.building[colorIndex],
    roof: COLORS.roofs[roofIndex],
    trim: rng.chance(0.55) ? '#f2dfbb' : '#645950',
    features,
    sign: rng.chance(0.36) ? rng.pick(['CANTINA', 'HOTEL', 'MOTEL', 'ARCADE', 'CAFÉ', 'MARKET', 'CLUB', 'GARAGE']) : null,
    signColor: rng.pick([COLORS.coral, COLORS.turquoise, COLORS.gold, COLORS.cream]),
  };
}

function makeParkDetails(block, rng, props) {
  const style = rng.int(0, 2);
  block.kind = 'park';
  block.parkStyle = style;
  block.parkPath = rng.chance(0.6) ? 'cross' : 'loop';
  if (style === 2 && block.w > 170 && block.h > 130) {
    block.pond = {
      x: block.x + block.w * rng.float(0.42, 0.58),
      y: block.y + block.h * rng.float(0.42, 0.56),
      rx: Math.min(block.w * 0.2, 66),
      ry: Math.min(block.h * 0.18, 48),
    };
  }
  const treeCount = clamp(Math.round((block.w * block.h) / 24000), 2, 8);
  for (let index = 0; index < treeCount; index += 1) {
    props.push({
      type: rng.chance(0.24) ? 'palm' : 'tree',
      x: block.x + rng.float(18, block.w - 18),
      y: block.y + rng.float(18, block.h - 18),
      size: rng.float(14, 27),
      angle: rng.float(0, Math.PI * 2),
      hue: rng.int(0, 2),
    });
  }
  if (block.w > 140) {
    props.push({
      type: 'bench',
      x: block.x + block.w * 0.5 + rng.float(-20, 20),
      y: block.y + block.h * 0.5 + rng.float(-20, 20),
      size: 12,
      angle: rng.float(0, Math.PI * 2),
    });
  }
}

function generateBuildings(world, block, rng) {
  const lots = [];
  splitLot(block.x + 5, block.y + 5, block.w - 10, block.h - 10, rng, 0, lots);
  const isWaterfront = block.row === ROAD.ys.length;
  for (const lot of lots) {
    if (rng.chance(isWaterfront ? 0.48 : 0.93)) {
      const building = newBuilding(lot, block, rng, world);
      if (building) world.buildings.push(building);
    }
  }
  if (world.buildings.length > 0) {
    block.hasBuildings = world.buildings.some((building) => building.blockId === block.id);
  }
}

function generateProps(world, rng) {
  const props = world.props;
  for (let roadIndex = 0; roadIndex < ROAD.xs.length; roadIndex += 1) {
    const x = ROAD.xs[roadIndex];
    for (let y = 145; y < WORLD.beachY - 20; y += 188) {
      if (ROAD.ys.some((roadY) => Math.abs(y - roadY) < H_HALF + 34)) continue;
      const side = (Math.round(y / 188) + roadIndex) % 2 === 0 ? -1 : 1;
      const kind = rng.chance(0.58) ? 'palm' : 'lamp';
      props.push({
        type: kind,
        x: x + side * (V_HALF + 11),
        y,
        size: kind === 'palm' ? rng.float(17, 28) : 11,
        angle: rng.float(0, Math.PI * 2),
        hue: rng.int(0, 2),
      });
    }
  }
  for (let roadIndex = 0; roadIndex < ROAD.ys.length; roadIndex += 1) {
    const y = ROAD.ys[roadIndex];
    for (let x = 175; x < WORLD.width - 20; x += 218) {
      if (ROAD.xs.some((roadX) => Math.abs(x - roadX) < V_HALF + 38)) continue;
      const side = (Math.round(x / 218) + roadIndex) % 2 === 0 ? -1 : 1;
      const kind = rng.chance(0.48) ? 'lamp' : 'palm';
      props.push({
        type: kind,
        x,
        y: y + side * (H_HALF + 11),
        size: kind === 'palm' ? rng.float(16, 26) : 10,
        angle: rng.float(0, Math.PI * 2),
        hue: rng.int(0, 2),
      });
    }
  }
  for (let x = 120; x < WORLD.width; x += 176) {
    const y = WORLD.beachY + rng.float(28, 76);
    if (rng.chance(0.55)) {
      props.push({ type: 'palm', x, y, size: rng.float(19, 32), angle: rng.float(0, Math.PI * 2), hue: rng.int(0, 2) });
    } else {
      props.push({ type: 'umbrella', x, y: y + 16, size: rng.float(15, 23), angle: 0, hue: rng.int(0, 2) });
    }
  }
  for (let x = 210; x < WORLD.width; x += 345) {
    props.push({ type: 'lamp', x, y: WORLD.beachY - 9, size: 11, angle: 0, hue: 0 });
  }
}

function chooseOpenSpot(x, y, world, avoidRoad = true) {
  for (let radius = 0; radius <= 420; radius += 28) {
    const samples = radius === 0 ? 1 : 16;
    for (let index = 0; index < samples; index += 1) {
      const angle = (index / samples) * Math.PI * 2;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (!isBlocked(px, py, world) && (!avoidRoad || !isRoad(px, py, world))) {
        return { x: px, y: py };
      }
    }
  }
  return { x: world.start ? world.start.x : 960, y: world.start ? world.start.y : 2930 };
}

export function createWorld(seedInput = 1) {
  const seed = (Number(seedInput) >>> 0) || 1;
  const rng = createRandom(seed);
  const world = {
    seed,
    width: WORLD.width,
    height: WORLD.height,
    rng,
    blocks: [],
    buildings: [],
    parks: [],
    lots: [],
    props: [],
    missionSpots: [],
    intersections: [],
    sandSpecks: [],
    roadStains: [],
    pedestrianRoutes: [],
    pedestrianRouteGroups: [],
  };
  activeWorld = world;

  let blockId = 0;
  for (let row = 0; row <= ROAD.ys.length; row += 1) {
    const y0 = row === 0 ? 0 : ROAD.ys[row - 1] + H_HALF + ROAD.sidewalk;
    const y1 = row === ROAD.ys.length ? WORLD.beachY : ROAD.ys[row] - H_HALF - ROAD.sidewalk;
    if (y1 - y0 < 76) continue;
    for (let col = 0; col <= ROAD.xs.length; col += 1) {
      const x0 = col === 0 ? 0 : ROAD.xs[col - 1] + V_HALF + ROAD.sidewalk;
      const x1 = col === ROAD.xs.length ? WORLD.width : ROAD.xs[col] - V_HALF - ROAD.sidewalk;
      if (x1 - x0 < 92) continue;
      let kind = 'city';
      const waterfront = row === ROAD.ys.length;
      const parkRoll = rng.next();
      if (parkRoll < (waterfront ? 0.46 : 0.11)) kind = 'park';
      else if (parkRoll < (waterfront ? 0.7 : 0.16)) kind = 'lot';
      const block = {
        id: blockId,
        row,
        col,
        x: Math.round(x0),
        y: Math.round(y0),
        w: Math.round(x1 - x0),
        h: Math.round(y1 - y0),
        centerX: Math.round((x0 + x1) / 2),
        centerY: Math.round((y0 + y1) / 2),
        kind,
        hasBuildings: false,
      };
      blockId += 1;
      if (kind === 'park') {
        makeParkDetails(block, rng, world.props);
        world.parks.push(block);
      } else if (kind === 'lot') {
        block.lotAngle = rng.chance(0.5) ? 0 : Math.PI / 2;
        world.lots.push(block);
      } else {
        generateBuildings(world, block, rng);
      }
      world.blocks.push(block);
    }
  }

  generateProps(world, rng);

  for (let index = 0; index < 170; index += 1) {
    world.sandSpecks.push({
      x: rng.float(0, WORLD.width),
      y: rng.float(WORLD.beachY + 8, WORLD.seaY - 6),
      r: rng.float(1, 3.2),
      alpha: rng.float(0.08, 0.25),
    });
  }
  for (let index = 0; index < 100; index += 1) {
    world.roadStains.push({
      x: rng.float(0, WORLD.width),
      y: rng.float(0, WORLD.beachY),
      rx: rng.float(10, 38),
      ry: rng.float(4, 13),
      alpha: rng.float(0.025, 0.075),
    });
  }

  for (let row = 0; row < ROAD.ys.length; row += 1) {
    for (let col = 0; col < ROAD.xs.length; col += 1) {
      world.intersections.push({ x: ROAD.xs[col], y: ROAD.ys[row], col, row });
    }
  }

  const startRough = { x: 965, y: 2940 };
  const start = chooseOpenSpot(startRough.x, startRough.y, world);
  world.start = {
    x: start.x,
    y: start.y,
    carX: ROAD.xs[1] + 34,
    carY: ROAD.ys[ROAD.ys.length - 1] + ROAD.laneOffset,
    carAngle: 0,
  };

  const roughestCards = [
    { x: 1390, y: 2962, name: 'Marina Steps' },
    { x: 4480, y: 1560, name: 'Arcade Lot' },
    { x: 3630, y: 510, name: 'Radio Tower' },
    { x: 1510, y: 2450, name: 'North Pier' },
  ];
  for (const rough of roughestCards) {
    let spot = chooseOpenSpot(rough.x, rough.y, world);
    if (Math.hypot(spot.x - world.start.x, spot.y - world.start.y) < 190) {
      spot = chooseOpenSpot(rough.x + 280, rough.y - 90, world);
    }
    world.missionSpots.push({ x: spot.x, y: spot.y, name: rough.name });
  }

  // Ordered loops around block edges keep pedestrians on the sidewalk ring.
  for (const block of world.blocks) {
    if (block.w < 100 || block.h < 90) continue;
    const pad = 10;
    const points = [
      { x: Math.max(12, block.x - pad), y: Math.max(12, block.y - pad) },
      { x: Math.min(WORLD.width - 12, block.x + block.w + pad), y: Math.max(12, block.y - pad) },
      { x: Math.min(WORLD.width - 12, block.x + block.w + pad), y: block.y + block.h + pad },
      { x: Math.max(12, block.x - pad), y: block.y + block.h + pad },
    ];
    world.pedestrianRouteGroups.push({ blockId: block.id, points });
    for (const point of points) world.pedestrianRoutes.push(point);
  }

  world.isRoad = (x, y) => isRoad(x, y, world);
  world.isBlocked = (x, y) => isBlocked(x, y, world);
  return world;
}

export function isRoad(x, y, world = activeWorld) {
  const width = world ? world.width : WORLD.width;
  if (x < 0 || x > width || y < 0 || y > WORLD.beachY) return false;
  for (const roadX of ROAD.xs) {
    if (Math.abs(x - roadX) <= V_HALF + 2) return true;
  }
  for (const roadY of ROAD.ys) {
    if (Math.abs(y - roadY) <= H_HALF + 2) return true;
  }
  return false;
}

export function onSidewalk(x, y, world = activeWorld) {
  if (isRoad(x, y, world)) return false;
  const width = world ? world.width : WORLD.width;
  if (x < 0 || x > width || y < 0 || y > WORLD.beachY) return false;
  for (const roadX of ROAD.xs) {
    if (Math.abs(x - roadX) <= V_HALF + ROAD.sidewalk + 5) return true;
  }
  for (const roadY of ROAD.ys) {
    if (Math.abs(y - roadY) <= H_HALF + ROAD.sidewalk + 5) return true;
  }
  return false;
}

export function isBlocked(x, y, world = activeWorld) {
  const width = world ? world.width : WORLD.width;
  const height = world ? world.height : WORLD.height;
  if (x < 6 || y < 6 || x > width - 6 || y > height - 6) return true;
  if (y >= WORLD.seaY) return true;
  if (!world) return false;
  for (const building of world.buildings) {
    if (pointInRect(x, y, building, 2)) return true;
  }
  return false;
}

export function nearestRoadPoint(x, y, world = activeWorld) {
  let best = { x, y, distance: Infinity, horizontal: true };
  for (const roadX of ROAD.xs) {
    const distance = Math.abs(x - roadX);
    if (distance < best.distance) best = { x: roadX, y, distance, horizontal: false };
  }
  for (const roadY of ROAD.ys) {
    const distance = Math.abs(y - roadY);
    if (distance < best.distance) best = { x, y: roadY, distance, horizontal: true };
  }
  return best;
}

export function clampToWorld(entity, radius = 8) {
  entity.x = clamp(entity.x, radius, WORLD.width - radius);
  entity.y = clamp(entity.y, radius, WORLD.height - radius);
}

function visible(camera, x, y, w, h, margin = 80) {
  return x + w >= camera.x - margin && x <= camera.x + camera.w + margin
    && y + h >= camera.y - margin && y <= camera.y + camera.h + margin;
}

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

function drawPark(ctx, block, time) {
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(block.x, block.y, block.w, block.h);
  ctx.fillStyle = COLORS.grassDark;
  ctx.globalAlpha = 0.22;
  ctx.fillRect(block.x, block.y + block.h - 12, block.w, 12);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = COLORS.parkPath;
  ctx.lineWidth = 19;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (block.parkPath === 'cross') {
    ctx.moveTo(block.x + 3, block.y + block.h * 0.52);
    ctx.lineTo(block.x + block.w - 3, block.y + block.h * 0.52);
    ctx.moveTo(block.x + block.w * 0.48, block.y + 3);
    ctx.lineTo(block.x + block.w * 0.48, block.y + block.h - 3);
  } else {
    roundedRectPath(ctx, block.x + 15, block.y + 15, block.w - 30, block.h - 30, 20);
  }
  ctx.stroke();

  if (block.pond) {
    ctx.fillStyle = 'rgba(35, 128, 126, 0.24)';
    ctx.beginPath();
    ctx.ellipse(block.pond.x + 3, block.pond.y + 5, block.pond.rx + 5, block.pond.ry + 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.sea;
    ctx.beginPath();
    ctx.ellipse(block.pond.x, block.pond.y, block.pond.rx, block.pond.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 247, 213, 0.48)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(block.pond.x, block.pond.y, block.pond.rx * 0.7 + Math.sin(time) * 2, block.pond.ry * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawLot(ctx, block) {
  ctx.fillStyle = COLORS.asphaltDark;
  ctx.fillRect(block.x, block.y, block.w, block.h);
  ctx.strokeStyle = 'rgba(242, 233, 207, 0.46)';
  ctx.lineWidth = 2;
  const spacing = 54;
  ctx.beginPath();
  if (block.lotAngle === 0) {
    for (let x = block.x + 24; x < block.x + block.w - 12; x += spacing) {
      ctx.moveTo(x, block.y + 18);
      ctx.lineTo(x, block.y + block.h * 0.5 - 8);
      ctx.moveTo(x, block.y + block.h * 0.5 + 8);
      ctx.lineTo(x, block.y + block.h - 18);
    }
  } else {
    for (let y = block.y + 24; y < block.y + block.h - 12; y += spacing) {
      ctx.moveTo(block.x + 18, y);
      ctx.lineTo(block.x + block.w * 0.5 - 8, y);
      ctx.moveTo(block.x + block.w * 0.5 + 8, y);
      ctx.lineTo(block.x + block.w - 18, y);
    }
  }
  ctx.stroke();
}

function drawRoadSegments(ctx, camera) {
  ctx.lineCap = 'butt';
  ctx.lineWidth = 2.4;

  for (const roadX of ROAD.xs) {
    if (roadX < camera.x - 70 || roadX > camera.x + camera.w + 70) continue;
    const segments = [];
    let top = 0;
    for (const roadY of ROAD.ys) {
      segments.push([top, roadY - H_HALF - 18]);
      top = roadY + H_HALF + 18;
    }
    segments.push([top, WORLD.beachY]);
    for (const [y0, y1] of segments) {
      if (y1 < camera.y - 20 || y0 > camera.y + camera.h + 20) continue;
      ctx.strokeStyle = 'rgba(244, 233, 202, 0.48)';
      ctx.beginPath();
      ctx.moveTo(roadX - V_HALF + 8, y0);
      ctx.lineTo(roadX - V_HALF + 8, y1);
      ctx.moveTo(roadX + V_HALF - 8, y0);
      ctx.lineTo(roadX + V_HALF - 8, y1);
      ctx.stroke();
      ctx.setLineDash([18, 22]);
      ctx.strokeStyle = COLORS.lane;
      ctx.beginPath();
      ctx.moveTo(roadX, y0);
      ctx.lineTo(roadX, y1);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  for (const roadY of ROAD.ys) {
    if (roadY < camera.y - 70 || roadY > camera.y + camera.h + 70) continue;
    const segments = [];
    let left = 0;
    for (const roadX of ROAD.xs) {
      segments.push([left, roadX - V_HALF - 18]);
      left = roadX + V_HALF + 18;
    }
    segments.push([left, WORLD.width]);
    for (const [x0, x1] of segments) {
      if (x1 < camera.x - 20 || x0 > camera.x + camera.w + 20) continue;
      ctx.strokeStyle = 'rgba(244, 233, 202, 0.48)';
      ctx.beginPath();
      ctx.moveTo(x0, roadY - H_HALF + 8);
      ctx.lineTo(x1, roadY - H_HALF + 8);
      ctx.moveTo(x0, roadY + H_HALF - 8);
      ctx.lineTo(x1, roadY + H_HALF - 8);
      ctx.stroke();
      ctx.setLineDash([18, 22]);
      ctx.strokeStyle = COLORS.lane;
      ctx.beginPath();
      ctx.moveTo(x0, roadY);
      ctx.lineTo(x1, roadY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

function drawCrosswalks(ctx, camera, intersections) {
  ctx.fillStyle = 'rgba(246, 238, 215, 0.68)';
  for (const intersection of intersections) {
    const { x, y } = intersection;
    if (!visible(camera, x - V_HALF, y - H_HALF, V_HALF * 2, H_HALF * 2, 20)) continue;
    for (let index = -3; index <= 3; index += 1) {
      const offset = index * 11;
      ctx.fillRect(x + offset - 4, y - H_HALF - 22, 6, 14);
      ctx.fillRect(x + offset - 4, y + H_HALF + 8, 6, 14);
      ctx.fillRect(x - V_HALF - 22, y + offset - 4, 14, 6);
      ctx.fillRect(x + V_HALF + 8, y + offset - 4, 14, 6);
    }
  }
}

export function drawGround(ctx, camera, world = activeWorld, time = 0) {
  const viewX = camera.x - 120;
  const viewY = camera.y - 120;
  const viewW = camera.w + 240;
  const viewH = camera.h + 240;
  ctx.save();
  ctx.beginPath();
  ctx.rect(camera.x, camera.y, camera.w, camera.h);
  ctx.clip();

  ctx.fillStyle = COLORS.promenade;
  ctx.fillRect(viewX, viewY, viewW, viewH);

  for (const block of world.blocks) {
    if (!visible(camera, block.x - ROAD.sidewalk, block.y - ROAD.sidewalk, block.w + ROAD.sidewalk * 2, block.h + ROAD.sidewalk * 2, 18)) continue;
    ctx.fillStyle = COLORS.sidewalk;
    ctx.fillRect(block.x - ROAD.sidewalk, block.y - ROAD.sidewalk, block.w + ROAD.sidewalk * 2, block.h + ROAD.sidewalk * 2);
    ctx.strokeStyle = 'rgba(102, 87, 70, 0.20)';
    ctx.lineWidth = 1;
    ctx.strokeRect(block.x - ROAD.sidewalk + 0.5, block.y - ROAD.sidewalk + 0.5, block.w + ROAD.sidewalk * 2 - 1, block.h + ROAD.sidewalk * 2 - 1);
  }

  for (const roadX of ROAD.xs) {
    if (roadX < camera.x - V_HALF - 30 || roadX > camera.x + camera.w + V_HALF + 30) continue;
    ctx.fillStyle = COLORS.asphalt;
    ctx.fillRect(roadX - V_HALF, 0, ROAD.verticalWidth, WORLD.beachY);
    ctx.fillStyle = 'rgba(255, 232, 191, 0.035)';
    ctx.fillRect(roadX - V_HALF + 8, 0, 8, WORLD.beachY);
  }
  for (const roadY of ROAD.ys) {
    if (roadY < camera.y - H_HALF - 30 || roadY > camera.y + camera.h + H_HALF + 30) continue;
    ctx.fillStyle = COLORS.asphalt;
    ctx.fillRect(0, roadY - H_HALF, WORLD.width, ROAD.horizontalWidth);
    ctx.fillStyle = 'rgba(255, 232, 191, 0.035)';
    ctx.fillRect(0, roadY - H_HALF + 8, WORLD.width, 8);
  }

  for (const stain of world.roadStains) {
    if (!visible(camera, stain.x - stain.rx, stain.y - stain.ry, stain.rx * 2, stain.ry * 2, 10)) continue;
    if (!isRoad(stain.x, stain.y, world)) continue;
    ctx.fillStyle = `rgba(19, 17, 16, ${stain.alpha})`;
    ctx.beginPath();
    ctx.ellipse(stain.x, stain.y, stain.rx, stain.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const block of world.blocks) {
    if (!visible(camera, block.x, block.y, block.w, block.h, 18)) continue;
    if (block.kind === 'park') drawPark(ctx, block, time);
    else if (block.kind === 'lot') drawLot(ctx, block);
    else {
      ctx.fillStyle = '#c7b38f';
      ctx.fillRect(block.x, block.y, block.w, block.h);
      ctx.fillStyle = 'rgba(255, 245, 217, 0.08)';
      ctx.fillRect(block.x + 4, block.y + 4, block.w - 8, block.h - 8);
    }
  }

  drawRoadSegments(ctx, camera);
  drawCrosswalks(ctx, camera, world.intersections);

  const sandTop = WORLD.beachY;
  if (sandTop < viewY + viewH) {
    const gradient = ctx.createLinearGradient(0, sandTop, 0, WORLD.seaY);
    gradient.addColorStop(0, COLORS.sand);
    gradient.addColorStop(0.72, COLORS.sandLight);
    gradient.addColorStop(1, COLORS.sandShadow);
    ctx.fillStyle = gradient;
    ctx.fillRect(viewX, sandTop, viewW, WORLD.seaY - sandTop);
    ctx.fillStyle = 'rgba(255, 250, 230, 0.5)';
    ctx.fillRect(viewX, sandTop, viewW, 5);

    for (const speck of world.sandSpecks) {
      if (!visible(camera, speck.x, speck.y, 2, 2, 5)) continue;
      ctx.fillStyle = `rgba(121, 90, 49, ${speck.alpha})`;
      ctx.beginPath();
      ctx.arc(speck.x, speck.y, speck.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(245, 216, 157, 0.36)';
    ctx.fillRect(viewX, WORLD.seaY - 14, viewW, 14);
  }

  if (WORLD.seaY < viewY + viewH) {
    const seaGradient = ctx.createLinearGradient(0, WORLD.seaY, 0, WORLD.height);
    seaGradient.addColorStop(0, COLORS.sea);
    seaGradient.addColorStop(0.5, COLORS.seaDeep);
    seaGradient.addColorStop(1, '#0d6575');
    ctx.fillStyle = seaGradient;
    ctx.fillRect(viewX, WORLD.seaY, viewW, viewH);
    ctx.strokeStyle = 'rgba(230, 255, 239, 0.62)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(viewX, WORLD.seaY + 4);
    for (let x = viewX; x < viewX + viewW; x += 28) {
      ctx.lineTo(x, WORLD.seaY + 4 + Math.sin(x * 0.025 + time * 1.8) * 4);
    }
    ctx.stroke();
    for (let wave = 0; wave < 9; wave += 1) {
      const y = WORLD.seaY + 55 + wave * 43 + Math.sin(time * 0.7 + wave) * 3;
      if (y > camera.y + camera.h + 20) continue;
      ctx.strokeStyle = `rgba(191, 253, 237, ${0.15 + (wave % 3) * 0.04})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = viewX - 30; x < viewX + viewW; x += 35) {
        const waveY = y + Math.sin(x * 0.018 + wave * 1.2 + time * 1.1) * 5;
        if (x === viewX - 30) ctx.moveTo(x, waveY);
        else ctx.lineTo(x, waveY);
      }
      ctx.stroke();
    }
  }

  if (WORLD.beachY < camera.y + camera.h) {
    ctx.strokeStyle = 'rgba(112, 91, 60, 0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, WORLD.beachY);
    ctx.lineTo(WORLD.width, WORLD.beachY);
    ctx.stroke();
  }
  ctx.restore();
}

export function isWater(x, y) {
  return y >= WORLD.seaY;
}

export function isInsideWorld(x, y) {
  return x >= 0 && y >= 0 && x <= WORLD.width && y <= WORLD.height;
}

export function getBlockAt(world, x, y) {
  for (const block of world.blocks) {
    if (pointInRect(x, y, block)) return block;
  }
  return null;
}

export function buildingAt(world, x, y) {
  for (const building of world.buildings) {
    if (pointInRect(x, y, building)) return building;
  }
  return null;
}

export function rectIntersectsBuilding(world, rect) {
  for (const building of world.buildings) {
    if (rectsOverlap(rect, building, 1)) return true;
  }
  return false;
}
