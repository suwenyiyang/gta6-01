// Small deterministic pseudo-random helpers used by city generation and traffic.

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(text) {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class SeededRandom {
  constructor(seed) {
    this.next = mulberry32(seed);
  }

  float(min = 0, max = 1) {
    return min + this.next() * (max - min);
  }

  int(min, max) {
    return Math.floor(this.float(min, max + 1));
  }

  chance(probability) {
    return this.next() < probability;
  }

  pick(items) {
    return items[Math.floor(this.next() * items.length)];
  }

  shuffle(items) {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const other = Math.floor(this.next() * (index + 1));
      [items[index], items[other]] = [items[other], items[index]];
    }
    return items;
  }
}

export function createRandom(seed) {
  const next = mulberry32(seed);
  return {
    next,
    float: (min = 0, max = 1) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    chance: (probability) => next() < probability,
    pick: (items) => items[Math.floor(next() * items.length)],
    shuffle: (items) => {
      for (let index = items.length - 1; index > 0; index -= 1) {
        const other = Math.floor(next() * (index + 1));
        [items[index], items[other]] = [items[other], items[index]];
      }
      return items;
    },
  };
}
