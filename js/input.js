// Keyboard, mouse wheel and touch (virtual joystick + action button).
// Discrete presses are queued as named actions and consumed once per frame.
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyE: 'action', Space: 'action', Enter: 'action', NumpadEnter: 'action',
  Tab: 'notebook', KeyN: 'notebook', Escape: 'pause', KeyP: 'pause', KeyI: 'bag', KeyB: 'bag', KeyM: 'mute',
  Digit1: 'hot0', Digit2: 'hot1', Digit3: 'hot2', Digit4: 'hot3', Digit5: 'hot4',
  Numpad1: 'hot0', Numpad2: 'hot1', Numpad3: 'hot2', Numpad4: 'hot3', Numpad5: 'hot4',
};
const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Enter']);

export class Input {
  constructor() {
    this.held = new Set();
    this.queue = [];
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.touchMode = false;
    this.onFirstGesture = null;
    this._wheelT = 0;

    window.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (PREVENT.has(e.code)) e.preventDefault();
      this._gesture();
      if (!a) return;
      if (['up', 'down', 'left', 'right'].includes(a)) this.held.add(a);
      if (!e.repeat) this.queue.push(a);
    });
    window.addEventListener('keyup', (e) => { const a = KEYMAP[e.code]; if (a) this.held.delete(a); });
    window.addEventListener('blur', () => { this.held.clear(); this._joyEnd(); });
    window.addEventListener('pointerdown', () => this._gesture(), { capture: true });
  }

  _gesture() { if (this.onFirstGesture) { const f = this.onFirstGesture; this.onFirstGesture = null; f(); } }

  // Hook up the canvas + touch widgets (created in index.html).
  attach(canvas, els) {
    this.els = els;
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const now = performance.now();
      if (now - this._wheelT < 90) return;
      this._wheelT = now;
      this.queue.push(e.deltaY > 0 ? 'hotNext' : 'hotPrev');
    }, { passive: false });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0 && !this.touchMode) this.queue.push('click'); });

    const zone = els.zone;
    zone.addEventListener('touchstart', (e) => {
      this.setTouchMode(true);
      for (const t of e.changedTouches) {
        if (this.joy.id === null) {
          this.joy.id = t.identifier; this.joy.ox = t.clientX; this.joy.oy = t.clientY; this.joy.x = 0; this.joy.y = 0;
          this._joyShow(true);
        }
      }
      e.preventDefault();
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.joy.id) continue;
        let dx = t.clientX - this.joy.ox, dy = t.clientY - this.joy.oy;
        const max = 42, len = Math.hypot(dx, dy);
        if (len > max) { this.joy.ox += (dx / len) * (len - max); this.joy.oy += (dy / len) * (len - max); dx = (dx / len) * max; dy = (dy / len) * max; }
        this.joy.x = dx / max; this.joy.y = dy / max;
        this._joyShow(true);
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => { for (const t of e.changedTouches) if (t.identifier === this.joy.id) this._joyEnd(); };
    zone.addEventListener('touchend', end);
    zone.addEventListener('touchcancel', end);

    els.action.addEventListener('touchstart', (e) => { e.preventDefault(); this.setTouchMode(true); this._gesture(); this.queue.push('action'); }, { passive: false });
    els.action.addEventListener('mousedown', (e) => { e.preventDefault(); this.queue.push('action'); });
    window.addEventListener('touchstart', () => this.setTouchMode(true), { passive: true, capture: true });
  }

  setTouchMode(on) {
    if (this.touchMode === on) return;
    this.touchMode = on;
    document.body.classList.toggle('touch', on);
  }

  _joyShow(on) {
    const { base, knob } = this.els;
    base.style.display = knob.style.display = on ? 'block' : 'none';
    if (!on) return;
    base.style.left = `${this.joy.ox}px`; base.style.top = `${this.joy.oy}px`;
    knob.style.left = `${this.joy.ox + this.joy.x * 42}px`; knob.style.top = `${this.joy.oy + this.joy.y * 42}px`;
  }

  _joyEnd() { this.joy.id = null; this.joy.x = this.joy.y = 0; if (this.els) this._joyShow(false); }

  get move() {
    let x = 0, y = 0;
    if (this.held.has('left')) x -= 1;
    if (this.held.has('right')) x += 1;
    if (this.held.has('up')) y -= 1;
    if (this.held.has('down')) y += 1;
    if (this.joy.id !== null) { x += this.joy.x; y += this.joy.y; }
    return { x, y };
  }

  consume() { const q = this.queue; this.queue = []; return q; }
  clearHeld() { this.held.clear(); this._joyEnd(); }
}
