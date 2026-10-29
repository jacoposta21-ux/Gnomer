// Player and villager entities. Positions are in pixels; (x, y) is the point between the feet.
import { TILE } from './world.js';
import { findPath } from './pathfinding.js';
import { parseTime } from './time.js';

export const DIRS = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
};
const FOOT = 12;          // feet sit this many px below the top of their tile
const HALF_W = 5, BOX_T = 4, BOX_B = 2; // collision box around the feet

export function tileCenter(tx, ty) { return { x: tx * TILE + 8, y: ty * TILE + FOOT }; }

class Actor {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.dir = 'down';
    this.moving = false;
    this.anim = 0; // walk-cycle clock
  }
  get tx() { return Math.floor(this.x / TILE); }
  get ty() { return Math.floor(this.y / TILE); }
  placeAt(tx, ty, dir) { const c = tileCenter(tx, ty); this.x = c.x; this.y = c.y; if (dir) this.dir = dir; }
  facingTile() { const [dx, dy] = DIRS[this.dir]; return { x: this.tx + dx, y: this.ty + dy }; }
  frame() { return this.moving ? 1 + (Math.floor(this.anim * 7) % 4) : 0; } // 0 idle, 1..4 walk cycle
}

export class Player extends Actor {
  constructor() { super(0, 0); this.speed = 72; this.bumpCooldown = 0; }

  // blocked(tx,ty) decides solidity for the player (includes locked doors and idle NPCs).
  update(dt, input, blocked) {
    let { x: mx, y: my } = input;
    const len = Math.hypot(mx, my);
    this.moving = len > 0.15;
    this.bumped = null;
    if (!this.moving) return;
    if (len > 1) { mx /= len; my /= len; }
    if (Math.abs(mx) > Math.abs(my)) this.dir = mx > 0 ? 'right' : 'left';
    else this.dir = my > 0 ? 'down' : 'up';
    this.anim += dt * Math.min(1, len);
    const step = this.speed * dt;
    this._move(mx * step, 0, blocked);
    this._move(0, my * step, blocked);
  }

  _hits(x, y, blocked) {
    const x0 = Math.floor((x - HALF_W) / TILE), x1 = Math.floor((x + HALF_W - 0.01) / TILE);
    const y0 = Math.floor((y - BOX_T) / TILE), y1 = Math.floor((y + BOX_B - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (blocked(tx, ty)) return { x: tx, y: ty };
    return null;
  }

  _move(dx, dy, rawBlocked) {
    if (!dx && !dy) return;
    // Anything we already overlap never blocks us (e.g. a villager who stopped on top of us),
    // so the player can always walk out instead of getting stuck.
    const x0 = Math.floor((this.x - HALF_W) / TILE), x1 = Math.floor((this.x + HALF_W - 0.01) / TILE);
    const y0 = Math.floor((this.y - BOX_T) / TILE), y1 = Math.floor((this.y + BOX_B - 0.01) / TILE);
    const blocked = (tx, ty) => !(tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1) && rawBlocked(tx, ty);
    const hit = this._hits(this.x + dx, this.y + dy, blocked);
    if (!hit) { this.x += dx; this.y += dy; return; }
    this.bumped = hit;
    // Corner assist: if the tile straight ahead of our centre is free, slide toward its centre.
    const cx = this.tx, cy = this.ty;
    if (dy) {
      const ahead = cy + Math.sign(dy);
      if (!blocked(cx, ahead)) {
        const target = cx * TILE + 8, d = target - this.x;
        const s = Math.sign(d) * Math.min(Math.abs(d), Math.abs(dy));
        if (s && !this._hits(this.x + s, this.y, blocked)) this.x += s;
      }
    } else {
      const ahead = cx + Math.sign(dx);
      if (!blocked(ahead, cy)) {
        const target = cy * TILE + FOOT, d = target - this.y;
        const s = Math.sign(d) * Math.min(Math.abs(d), Math.abs(dx));
        if (s && !this._hits(this.x, this.y + s, blocked)) this.y += s;
      }
    }
  }
}

export class NPC extends Actor {
  constructor(def) {
    super(0, 0);
    this.def = def;
    this.id = def.id;
    this.speed = 44;
    this.goal = null;   // location id currently heading to
    this.path = null;
    this.face = 'down'; // facing to use once arrived
    this.gnomed = false;
    this.friendship = 0;
    this.talkDay = 0;   // last day we chatted (friendship gain once per day)
    this.giftDay = 0;
    this.talks = 0;     // lifetime chats, for "seen with the farmer" stats
    this.lastLine = null;
    this.paused = false; // held still while in dialogue
  }

  get hearts() { return Math.floor(this.friendship / 100); }
  get area() { return this._area; }

  schedule(weather) { return (weather === 'rain' && this.def.rain) || this.def.schedule; }

  // Location id the schedule wants right now.
  slot(minutes, weather) {
    const sched = this.schedule(weather);
    let cur = sched[0][1];
    for (const [t, loc] of sched) if (minutes >= parseTime(t)) cur = loc;
    return cur;
  }

  // Last outdoor spot on today's schedule: where the villager was "last seen" before bed.
  lastSeenLocation(weather) {
    const sched = this.schedule(weather);
    for (let i = sched.length - 1; i >= 0; i--) {
      const l = sched[i][1];
      if (l !== 'home' && !l.includes('.')) return l;
    }
    return null;
  }

  snapToSchedule(world, minutes, weather) {
    const locId = this.slot(minutes, weather);
    const loc = world.resolveLocation(locId, this.def.home);
    if (loc) this.placeAt(loc.x, loc.y, loc.face);
    this.goal = locId; this.path = null; this.face = loc ? loc.face : 'down';
    this.moving = false;
    this._area = world.areaAt(this.tx, this.ty);
  }

  update(dt, world, minutes, weather) {
    if (this.gnomed || this.paused) { this.moving = false; return; }
    const want = this.slot(minutes, weather);
    if (want !== this.goal) {
      this.goal = want;
      const loc = world.resolveLocation(want, this.def.home);
      if (loc) {
        this.face = loc.face;
        this.path = findPath(world, this.tx, this.ty, loc.x, loc.y);
        if (!this.path) { this.placeAt(loc.x, loc.y, loc.face); this.path = []; } // unreachable: just appear there
      }
    }
    if (!this.path || this.path.length === 0) {
      this.moving = false;
      if (this.path) { this.dir = this.face; this.path = null; }
      this._area = world.areaAt(this.tx, this.ty);
      return;
    }
    const next = this.path[0];
    const adjacent = Math.abs(next.x - this.tx) + Math.abs(next.y - this.ty) <= 1;
    if (!adjacent) { // portal (door) hop
      this.placeAt(next.x, next.y);
      this.path.shift();
      this._area = world.areaAt(this.tx, this.ty);
      return;
    }
    const target = tileCenter(next.x, next.y);
    const dx = target.x - this.x, dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;
    this.moving = true;
    this.anim += dt;
    if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 'right' : 'left';
    else if (dy !== 0) this.dir = dy > 0 ? 'down' : 'up';
    if (dist <= step) { this.x = target.x; this.y = target.y; this.path.shift(); }
    else { this.x += (dx / dist) * step; this.y += (dy / dist) * step; }
    this._area = world.areaAt(this.tx, this.ty);
  }
}
