// Draws the world onto a low-res canvas that CSS scales up by an integer factor (crisp pixels).
import { Art, PAL } from './art.js';
import { TILE, T } from './world.js';
import { darkness } from './time.js';

const TARGET_H = 216; // aim for ~13.5 tiles of world height on screen

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.light = document.createElement('canvas');
    this.lctx = this.light.getContext('2d');
    this.cam = { x: 0, y: 0 };
    this.time = 0;
    this.areaId = null;
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth, H = window.innerHeight;
    const scale = Math.max(1, Math.round((H * dpr) / TARGET_H));
    this.scale = scale;
    this.vw = Math.ceil((W * dpr) / scale);
    this.vh = Math.ceil((H * dpr) / scale);
    this.canvas.width = this.vw; this.canvas.height = this.vh;
    this.canvas.style.width = `${(this.vw * scale) / dpr}px`;
    this.canvas.style.height = `${(this.vh * scale) / dpr}px`;
    this.light.width = this.vw; this.light.height = this.vh;
    this.ctx.imageSmoothingEnabled = false;
  }

  // Screen (CSS px) -> world px, for mouse/touch picking.
  screenToWorld(sx, sy) {
    const dpr = window.devicePixelRatio || 1;
    return { x: (sx * dpr) / this.scale + Math.round(this.cam.x), y: (sy * dpr) / this.scale + Math.round(this.cam.y) };
  }

  _camTarget(game) {
    const a = game.playerArea();
    const p = game.player;
    let x = p.x - this.vw / 2, y = p.y - 8 - this.vh / 2;
    const ax = a.x * TILE, ay = a.y * TILE, aw = a.w * TILE, ah = a.h * TILE;
    x = aw <= this.vw ? ax + (aw - this.vw) / 2 : Math.max(ax, Math.min(ax + aw - this.vw, x));
    y = ah <= this.vh ? ay + (ah - this.vh) / 2 : Math.max(ay, Math.min(ay + ah - this.vh, y));
    return { x, y, area: a.id };
  }

  snap(game) { const t = this._camTarget(game); this.cam.x = t.x; this.cam.y = t.y; this.areaId = t.area; }

  updateCamera(dt, game) {
    const t = this._camTarget(game);
    if (t.area !== this.areaId) { this.snap(game); return; }
    const k = 1 - Math.exp(-dt * 9);
    this.cam.x += (t.x - this.cam.x) * k;
    this.cam.y += (t.y - this.cam.y) * k;
  }

  render(game, dt) {
    this.time += dt;
    const g = this.ctx, world = game.world;
    const area = game.playerArea();
    const cx = Math.round(this.cam.x), cy = Math.round(this.cam.y);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#140f12';
    g.fillRect(0, 0, this.vw, this.vh);
    g.setTransform(1, 0, 0, 1, -cx, -cy);

    const x0 = Math.max(area.x, Math.floor(cx / TILE) - 1), y0 = Math.max(area.y, Math.floor(cy / TILE) - 1);
    const x1 = Math.min(area.x + area.w - 1, Math.floor((cx + this.vw) / TILE) + 1);
    const y1 = Math.min(area.y + area.h - 1, Math.floor((cy + this.vh) / TILE) + 2);

    // ---- ground
    const waterFrame = Math.floor(this.time / 0.6) % 2;
    const tiles = Art.tiles;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = world.tile(x, y), px = x * TILE, py = y * TILE;
      const v = world.variant(x, y, 6);
      switch (t) {
        case T.GRASS: g.drawImage(tiles.grass[v], px, py); break;
        case T.PATH: g.drawImage(tiles.path[v % 3], px, py); break;
        case T.STONE: g.drawImage(tiles.stone[v % 2], px, py); break;
        case T.WATER: g.drawImage(tiles.water[(waterFrame + (x + y)) % 2], px, py); break;
        case T.BRIDGE: g.drawImage(tiles.bridge, px, py); break;
        case T.SAND: g.drawImage(tiles.sand[v % 2], px, py); break;
        case T.FIELD: g.drawImage(tiles.field[v % 3], px, py); break;
        case T.FLOWERS: g.drawImage(tiles.flowers[v % 3], px, py); break;
        case T.FENCE: {
          g.drawImage(tiles.grass[v], px, py);
          const horiz = world.tile(x - 1, y) === T.FENCE || world.tile(x + 1, y) === T.FENCE || world.tile(x - 1, y) === T.PATH || world.tile(x + 1, y) === T.PATH;
          g.drawImage(horiz ? tiles.fence.h : tiles.fence.v, px, py);
          break;
        }
        case T.FLOOR: g.drawImage((tiles.floor[area.floor] || tiles.floor.wood)[(x + y) % (area.floor === 'stone' ? 1 : 2)], px, py); break;
        case T.MAT: g.drawImage(tiles.mat, px, py); break;
        case T.WALL: this._wall(g, area, x, y, px, py, game); break;
        default: break;
      }
      // banks get a darker lip next to water
      if (t === T.SAND && (world.tile(x - 1, y) === T.WATER || world.tile(x + 1, y) === T.WATER)) {
        g.fillStyle = 'rgba(60,45,30,0.35)';
        g.fillRect(world.tile(x - 1, y) === T.WATER ? px : px + 15, py, 1, 16);
      }
      if (t === T.FIELD) {
        const plot = game.farm.plot(x, y);
        if (plot) {
          g.drawImage(plot.w ? tiles.soil.wet : tiles.soil.dry, px, py);
          if (plot.c) g.drawImage(Art.crops[plot.c][game.farm.stage(plot)], px, py - 2);
        }
        const d = game.farm.debrisAt(x, y);
        if (d) g.drawImage(Art.debris[d], px, py);
      }
    }

    // ---- flat props (rugs, benches) and foiled-attack dents
    for (const o of world.objects) {
      if (!o.flat || o.removed || !this._inView(o, x0, y0, x1, y1)) continue;
      const spr = Art.objects[o.kind];
      if (spr) g.drawImage(spr, o.x * TILE + ((o.w * TILE - spr.width) >> 1), (o.y + o.h) * TILE - spr.height);
    }
    if (area.outdoor) {
      for (const a of game.mystery.attacks) if (a.blocked && game.day - a.night <= 2) g.drawImage(Art.dent, a.x * TILE, a.y * TILE);
    }

    // ---- facing-tile cursor
    if (game.showCursor) {
      const f = game.player.facingTile();
      g.strokeStyle = 'rgba(255,240,200,0.55)';
      g.lineWidth = 1;
      g.strokeRect(f.x * TILE + 0.5, f.y * TILE + 0.5, 15, 15);
    }

    // ---- sorted sprites
    const list = [];
    for (const o of world.objects) {
      if (o.flat || o.removed || !this._inView(o, x0 - 1, y0, x1 + 1, y1 + 2)) continue;
      if (world.areaAt(o.x, o.y) !== area) continue;
      list.push({ y: (o.y + o.h) * TILE, o });
    }
    for (const n of game.npcs.values()) {
      if (n.gnomed || n.area !== area) continue;
      list.push({ y: n.y, ch: n });
    }
    if (game.mode !== 'title') list.push({ y: game.player.y, ch: game.player, player: true });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) {
      if (it.o) this._object(g, it.o, game);
      else this._char(g, it.ch, it.player ? 'player' : it.ch.id, game);
    }

    // ---- exit arrow over the doormat of the room we're in
    if (!area.outdoor && area.mat) {
      const bob = Math.round(Math.sin(this.time * 4) * 1.5);
      const ax = area.mat.x * TILE + 4, ay = area.mat.y * TILE - 6 + bob;
      g.fillStyle = 'rgba(20,12,16,0.5)';
      g.fillRect(ax - 1, ay - 1, 10, 8);
      g.fillStyle = PAL.litL;
      g.fillRect(ax + 3, ay, 2, 3); g.fillRect(ax + 1, ay + 3, 6, 1); g.fillRect(ax + 2, ay + 4, 4, 1); g.fillRect(ax + 3, ay + 5, 2, 1);
    }

    // ---- sparkles
    if (area.outdoor) {
      const f = Math.floor(this.time * 6) % 4;
      for (const s of game.mystery.sparkles) {
        g.drawImage(Art.sparkle[(f + s.x) % 4], s.x * TILE + 3, s.y * TILE + 2 + Math.round(Math.sin(this.time * 3 + s.y) * 1.5));
      }
    }

    // ---- emotes
    for (const e of game.emotes) {
      const a = Math.min(1, e.t * 2);
      g.globalAlpha = a;
      this._emote(g, e.kind, Math.round(e.x - 4), Math.round(e.y - 34 - (1.2 - e.t) * 8));
      g.globalAlpha = 1;
    }

    // ---- weather
    if (area.outdoor && game.weather === 'rain') this._rain(g, cx, cy);

    // ---- night
    g.setTransform(1, 0, 0, 1, 0, 0);
    this._lighting(game, area, cx, cy);
  }

  _inView(o, x0, y0, x1, y1) { return o.x + o.w - 1 >= x0 && o.x <= x1 && o.y + o.h - 1 >= y0 && o.y <= y1 + 3; }

  _wall(g, area, x, y, px, py, game) {
    const set = Art.tiles.walls[area.wall] || Art.tiles.walls.farm;
    const rx = x - area.x, ry = y - area.y;
    if (rx > 0 && rx < area.w - 1 && ry === 0) {
      const dark = darkness(game.minutes) > 0.5;
      const win = (rx === 2 || rx === area.w - 3) && area.w > 6;
      g.drawImage(win ? (dark ? set.winNight : set.win) : set.top, px, py);
    } else if (rx > 0 && rx < area.w - 1 && ry === 1) g.drawImage(set.low, px, py);
    else g.drawImage(set.edge, px, py);
  }

  _object(g, o, game) {
    const px = o.x * TILE, bottom = (o.y + o.h) * TILE;
    if (o.kind === 'building') {
      const b = Art.buildings[o.id];
      g.drawImage(b.canvas, px, o.y * TILE - b.top);
      return;
    }
    if (o.kind === 'tree') { g.drawImage(Art.objects.tree[o.variant], px - 8, bottom - 44); return; }
    if (o.kind === 'gnome') { g.drawImage(Art.gnomes[o.victim], px, bottom - 26); return; }
    let spr = Art.objects[o.kind];
    if (o.kind === 'fountain') spr = spr[Math.floor(this.time / 0.4) % 2];
    if (o.kind === 'lamp' && darkness(game.minutes) > 0.3) spr = Art.objects.lampLit;
    if (!spr) return;
    g.drawImage(spr, px + ((o.w * TILE - spr.width) >> 1), bottom - spr.height);
  }

  _char(g, ch, sheetId, game) {
    const sheet = Art.chars[sheetId];
    if (!sheet) return;
    const x = Math.round(ch.x), y = Math.round(ch.y);
    g.fillStyle = 'rgba(20,12,16,0.28)';
    g.fillRect(x - 5, y + 1, 10, 2); g.fillRect(x - 4, y, 8, 4);
    g.drawImage(sheet[ch.dir][ch.frame()], x - 8, y - 29);
    if (sheetId !== 'player' && game.gossipHint(ch)) this._emote(g, 'talk', x - 4, y - 38 + Math.round(Math.sin(this.time * 4) * 1));
    if (sheetId !== 'player' && game.mystery.protect[ch.id] > 0) { // charm glint
      if (Math.floor(this.time * 2 + ch.x) % 4 === 0) { g.fillStyle = PAL.litL; g.fillRect(x + 4, y - 14, 1, 1); }
    }
  }

  _emote(g, kind, x, y) {
    if (kind === 'heart') {
      g.fillStyle = '#e0505a';
      g.fillRect(x + 1, y, 2, 1); g.fillRect(x + 5, y, 2, 1); g.fillRect(x, y + 1, 8, 2); g.fillRect(x + 1, y + 3, 6, 1); g.fillRect(x + 2, y + 4, 4, 1); g.fillRect(x + 3, y + 5, 2, 1);
    } else if (kind === 'talk') {
      g.fillStyle = PAL.white; g.fillRect(x, y, 9, 6); g.fillRect(x + 2, y + 6, 2, 1);
      g.fillStyle = PAL.ink; g.fillRect(x + 2, y + 3, 1, 1); g.fillRect(x + 4, y + 3, 1, 1); g.fillRect(x + 6, y + 3, 1, 1);
    } else if (kind === 'bang') {
      g.fillStyle = PAL.yellow; g.fillRect(x + 3, y, 2, 5); g.fillRect(x + 3, y + 6, 2, 2);
    } else if (kind === 'sad') {
      g.fillStyle = '#6f8fbf'; g.fillRect(x + 3, y + 1, 2, 4); g.fillRect(x + 2, y + 3, 4, 2);
    }
  }

  _rain(g, cx, cy) {
    g.fillStyle = 'rgba(30,40,70,0.18)';
    g.fillRect(cx, cy, this.vw, this.vh);
    g.fillStyle = 'rgba(190,210,235,0.45)';
    const t = this.time;
    for (let i = 0; i < 90; i++) {
      const sx = ((i * 97.3 + t * 40) % (this.vw + 20)) - 10;
      const sy = ((i * 53.7 + t * 260) % (this.vh + 20)) - 10;
      g.fillRect(cx + Math.round(sx), cy + Math.round(sy), 1, 4);
    }
  }

  _lighting(game, area, cx, cy) {
    let dark = darkness(game.minutes);
    if (!area.outdoor) dark *= 0.55;
    const g = this.ctx;
    // dusk warmth
    if (area.outdoor && game.minutes > 16 * 60 && game.minutes < 20 * 60) {
      const k = 1 - Math.abs(game.minutes - 18 * 60) / 120;
      g.fillStyle = `rgba(214,120,60,${(0.13 * k).toFixed(3)})`;
      g.fillRect(0, 0, this.vw, this.vh);
    }
    if (dark <= 0.01) return;
    const l = this.lctx;
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, this.vw, this.vh);
    l.fillStyle = `rgba(14,16,40,${(dark * 0.82).toFixed(3)})`;
    l.fillRect(0, 0, this.vw, this.vh);
    l.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, a = 1) => {
      const grd = l.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(0,0,0,${a})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
      l.fillStyle = grd; l.fillRect(x - r, y - r, r * 2, r * 2);
    };
    hole(game.player.x - cx, game.player.y - 10 - cy, 40, 0.55);
    for (const L of game.world.lights) {
      if (L.indoor ? L.area !== area.id : !area.outdoor) continue;
      hole(L.x - cx, L.y - cy, L.r, L.indoor ? 0.6 : 0.9);
    }
    const windows = this._litWindows(game, area);
    for (const w of windows) hole(w.x - cx, w.y - cy, 30, 0.75);
    l.globalCompositeOperation = 'source-over';
    g.drawImage(this.light, 0, 0);
    // glowing window panes on top of the darkness
    if (dark > 0.3) {
      g.fillStyle = PAL.lit;
      for (const w of windows) { g.globalAlpha = Math.min(1, dark * 1.3); g.fillRect(w.rx - cx, w.ry - cy, w.w, w.h); }
      g.globalAlpha = 1;
    }
  }

  _litWindows(game, area) {
    if (!area.outdoor || darkness(game.minutes) < 0.3) return [];
    const out = [];
    for (const b of game.world.buildings) {
      const def = b.def;
      if (def.owner && game.npcs.get(def.owner).gnomed) continue; // a gnomed villager's house stays dark
      if (b.x * TILE > this.cam.x + this.vw + 32 || (b.x + b.w) * TILE < this.cam.x - 32) continue;
      const art = Art.buildings[b.id];
      for (const [wx, wy, ww, wh] of art.windows) {
        const rx = b.x * TILE + wx, ry = b.y * TILE - art.top + wy;
        out.push({ x: rx + ww / 2, y: ry + wh / 2, rx: rx + 1, ry: ry + 1, w: ww - 2, h: wh - 2 });
      }
    }
    return out;
  }
}
