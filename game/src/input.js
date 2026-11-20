// Keyboard and pointer state. `endFrame` is the only place per-frame edges are cleared.

import { KEY_BINDINGS } from './config.js';

export class Input {
  constructor(canvas, onFirstGesture = null) {
    this.canvas = canvas;
    this.onFirstGesture = onFirstGesture;
    this.gestured = false;
    this.down = new Set();
    this.pressedSet = new Set();
    this.mouse = { x: 0, y: 0, down: false, clicked: false, button: 0 };
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (event) => {
      const code = event.code;
      if (this._shouldPrevent(code)) event.preventDefault();
      if (!this.down.has(code)) this.pressedSet.add(code);
      this.down.add(code);
      this._gesture();
    }, { passive: false });

    window.addEventListener('keyup', (event) => {
      this.down.delete(event.code);
    });

    window.addEventListener('blur', () => {
      this.down.clear();
      this.pressedSet.clear();
      this.mouse.down = false;
    });

    const updatePointer = (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = event.clientX - rect.left;
      this.mouse.y = event.clientY - rect.top;
    };

    this.canvas.addEventListener('pointermove', updatePointer);
    this.canvas.addEventListener('pointerdown', (event) => {
      updatePointer(event);
      if (event.button === 0) {
        this.mouse.down = true;
        this.mouse.clicked = true;
        this.mouse.button = event.button;
      }
      try { this.canvas.setPointerCapture(event.pointerId); } catch { /* harmless */ }
      this._gesture();
    });
    window.addEventListener('pointerup', (event) => {
      if (event.button === 0) this.mouse.down = false;
    });
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  _gesture() {
    if (this.gestured) return;
    this.gestured = true;
    if (this.onFirstGesture) this.onFirstGesture();
  }

  _shouldPrevent(code) {
    return code.startsWith('Arrow') || code === 'Space' || code === 'KeyE' || code === 'KeyF';
  }

  isDown(action) {
    const codes = KEY_BINDINGS[action];
    if (!codes) return false;
    for (const code of codes) if (this.down.has(code)) return true;
    return false;
  }

  wasPressed(action) {
    const codes = KEY_BINDINGS[action];
    if (!codes) return false;
    for (const code of codes) if (this.pressedSet.has(code)) return true;
    return false;
  }

  wasPressedCode(code) {
    return this.pressedSet.has(code);
  }

  get horizontal() {
    return (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
  }

  get vertical() {
    return (this.isDown('backward') ? 1 : 0) - (this.isDown('forward') ? 1 : 0);
  }

  consumeClick() {
    if (!this.mouse.clicked) return false;
    this.mouse.clicked = false;
    return true;
  }

  endFrame() {
    this.pressedSet.clear();
    this.mouse.clicked = false;
    this.mouse.button = 0;
  }
}
