// Game state + rules glue: time, interactions, farming actions, villagers, the night cycle, endings.
// Rendering lives in renderer.js, overlays in ui.js, content in js/data + strings.
import { World, T } from './world.js';
import { RNG } from './rng.js';
import { Player, NPC, DIRS } from './entities.js';
import { Inventory, HOTBAR } from './inventory.js';
import { Farm } from './farming.js';
import { Mystery } from './mystery.js';
import { pickLine, reactionLine, giftReaction } from './dialogue.js';
import { ITEMS, BACKPACK, START_INVENTORY, START_MONEY, START_INV_SIZE } from './data/items.js';
import { CROPS, DEBRIS } from './data/crops.js';
import { RECIPES } from './data/recipes.js';
import { VILLAGERS, FRIENDSHIP } from './data/villagers.js';
import { MINUTES_PER_SECOND, DAY_START, DAY_END, SEASON_DAYS, storeOpen, doorLocked } from './time.js';
import { t, tList, fmt } from './i18n.js';
import { Audio } from './audio.js';
import { Save } from './save.js';
import { Platform } from './platform.js';

const STEP = 1 / 240; // fixed simulation step: identical behaviour at any refresh rate
const MAX_ENERGY = 100;

export class Game {
  constructor({ renderer, ui, input }) {
    this.renderer = renderer;
    this.ui = ui;
    this.input = input;
    this.mode = 'title';
    this.acc = 0;
    this.emotes = [];
    this.showCursor = false;
    this._gossipCache = new Map();
    this._gossipT = 0;
    this._bumpT = 0;
  }

  // ------------------------------------------------------------ setup
  _baseState(seed) {
    this.world = new World();
    this.rng = new RNG(seed);
    this.player = new Player();
    this.farm = new Farm(this.world);
    this.npcs = new Map(VILLAGERS.map((v) => [v.id, new NPC(v)]));
    this.mystery = new Mystery();
    this.bin = [];
    this.emotes = [];
    this.flags = { backpack: false, knownLoves: {}, introDone: false };
    this.stats = { earned: 0, harvested: 0 };
  }

  newGame() {
    const seed = (Math.random() * 4294967296) >>> 0;
    this._baseState(seed);
    this.day = 1;
    this.minutes = DAY_START;
    this.weather = 'sunny';
    this.money = START_MONEY;
    this.maxEnergy = MAX_ENERGY;
    this.energy = MAX_ENERGY;
    this.water = ITEMS.watering_can.capacity;
    this.inv = new Inventory(START_INV_SIZE);
    for (const [id, n] of START_INVENTORY) this.inv.add(id, n);
    this.farm.scatterDebris(this.rng);
    this.mystery.newGame(this.rng, this.world);
    this._wakeUp();
  }

  loadSave(d) {
    this._baseState(1);
    this.rng.s = d.rng >>> 0;
    this.day = d.day;
    this.minutes = DAY_START;
    this.weather = d.weather || 'sunny';
    this.money = d.money;
    this.maxEnergy = d.maxEnergy || MAX_ENERGY;
    this.energy = Math.min(this.maxEnergy, d.energy ?? this.maxEnergy);
    this.water = d.water ?? 0;
    this.inv = Inventory.fromJSON(d.inv);
    this.farm.load(d.farm || {});
    this.bin = (d.bin || []).filter(([id]) => ITEMS[id]).map(([id, qty]) => ({ id, qty }));
    this.flags = { ...this.flags, ...(d.flags || {}) };
    this.stats = { ...this.stats, ...(d.stats || {}) };
    for (const [id, s] of Object.entries(d.npcs || {})) {
      const n = this.npcs.get(id);
      if (!n) continue;
      n.friendship = s.f || 0; n.talkDay = s.td || 0; n.giftDay = s.gd || 0; n.talks = s.t || 0;
    }
    this.mystery = Mystery.fromJSON(d.mystery);
    for (const a of this.mystery.attacks) if (!a.blocked && !this.mystery.solved) this._gnome(a);
    this._wakeUp();
  }

  serialize() {
    const npcs = {};
    for (const n of this.npcs.values()) npcs[n.id] = { f: n.friendship, td: n.talkDay, gd: n.giftDay, t: n.talks };
    return {
      rng: this.rng.s, day: this.day, weather: this.weather, money: this.money, maxEnergy: this.maxEnergy, energy: this.energy,
      water: this.water, inv: this.inv.toJSON(), farm: this.farm.toJSON(), bin: this.bin.map((b) => [b.id, b.qty]),
      npcs, mystery: this.mystery.toJSON(), flags: this.flags, stats: this.stats,
    };
  }

  save() { return Save.write(this.serialize()); }

  _wakeUp() {
    const fh = this.world.areaById.farmhouse;
    this.player.placeAt(fh.x + 2, fh.y + 3, 'down');
    this.player.moving = false;
    for (const n of this.npcs.values()) { n.paused = false; n.snapToSchedule(this.world, this.minutes, this.weather); }
    this._warned = {};
    this.renderer.snap(this);
  }

  _gnome(attack) {
    const n = this.npcs.get(attack.victim);
    n.gnomed = true;
    this.world.addObject({ kind: 'gnome', x: attack.x, y: attack.y, victim: attack.victim, solid: true, interact: 'statue' });
    this.world.recomputeSolid();
  }

  playerArea() { return this.world.areaAt(this.player.tx, this.player.ty) || this.world.areaById.outdoor; }

  // ------------------------------------------------------------ main loop
  frame(dt) {
    dt = Math.min(dt, 0.25);
    const actions = this.input.consume();
    if (this.mode !== 'play') { this.ui.handleActions(actions, this); return; }
    if (this.ui.blocking) {
      this.ui.setPrompt(null);
      this.ui.handleActions(actions, this);
      this.player.moving = false;
      this.renderer.updateCamera(dt, this);
      return;
    }
    for (const a of actions) this._action(a);
    if (this.ui.blocking || this.mode !== 'play') return; // an action may have opened a menu

    this.acc += dt;
    while (this.acc >= STEP) { this.acc -= STEP; this._tick(STEP); if (this.mode !== 'play' || this.ui.blocking) { this.acc = 0; break; } }
    this.renderer.updateCamera(dt, this);
    const cur = this.inv.current;
    this.showCursor = !!cur && ['tool', 'seed'].includes(ITEMS[cur.id].type);
    this.ui.setPrompt(this.resolveAction().label);
  }

  _action(a) {
    if (a === 'action' || a === 'click') { this.resolveAction().run(); return; }
    if (a.startsWith('hot') && /^hot\d$/.test(a)) { this.inv.selected = Number(a[3]); Audio.play('click'); return; }
    if (a === 'hotNext') { this.inv.selected = (this.inv.selected + 1) % HOTBAR; return; }
    if (a === 'hotPrev') { this.inv.selected = (this.inv.selected + HOTBAR - 1) % HOTBAR; return; }
    if (a === 'notebook') { this.ui.openNotebook(this); return; }
    if (a === 'bag') { this.ui.openBag(this); return; }
    if (a === 'pause') { this.ui.openPause(this); return; }
    if (a === 'mute') this.ui.toggleMute();
  }

  _tick(dt) {
    const before = this.minutes;
    this.minutes += dt * MINUTES_PER_SECOND;
    const p = this.player;
    p.update(dt, this.input.move, (x, y) => this._blockedForPlayer(x, y));
    if (p.bumped) this._onBump(p.bumped);
    this._checkPortal();
    for (const n of this.npcs.values()) n.update(dt, this.world, this.minutes, this.weather);
    for (const e of this.emotes) e.t -= dt;
    if (this.emotes.length) this.emotes = this.emotes.filter((e) => e.t > 0);
    this._bumpT -= dt;
    if (before < 24 * 60 && this.minutes >= 24 * 60) this.ui.toast(t('msg.midnight'));
    if (before < 25 * 60 && this.minutes >= 25 * 60) this.ui.toast(t('msg.lateWarning'), 'warn');
    if (this.minutes >= DAY_END) this.sleep(true);
  }

  _blockedForPlayer(x, y) {
    if (this.world.isSolid(x, y)) return true;
    const portal = this.world.portalAt(x, y);
    if (portal && portal.kind === 'door' && doorLocked(portal.lock, this.day, this.minutes)) return true;
    const area = this.playerArea();
    const p = this.player;
    for (const n of this.npcs.values()) {
      // idle villagers are solid, unless we already overlap them (never trap the player)
      if (!n.gnomed && !n.moving && n.area === area && n.tx === x && n.ty === y && Math.hypot(n.x - p.x, n.y - p.y) > 12) return true;
    }
    return false;
  }

  _onBump(tile) {
    const portal = this.world.portalAt(tile.x, tile.y);
    if (portal && portal.kind === 'door' && this._bumpT <= 0 && doorLocked(portal.lock, this.day, this.minutes)) {
      this._bumpT = 2.5;
      this.ui.toast(t(`msg.locked_${portal.lock}`));
      Audio.play('error');
    }
  }

  _checkPortal() {
    const p = this.player;
    const portal = this.world.portalAt(p.tx, p.ty);
    if (!portal) return;
    if (portal.kind === 'door' && p.dir === 'up') {
      if (doorLocked(portal.lock, this.day, this.minutes)) return;
      p.placeAt(portal.to.x, portal.to.y, 'up');
    } else if (portal.kind === 'exit' && p.dir === 'down') {
      p.placeAt(portal.to.x, portal.to.y, 'down');
    } else return;
    Audio.play('door');
    this.renderer.snap(this);
    this.ui.flash();
  }

  // ------------------------------------------------------------ interaction resolution
  npcInFront() {
    const p = this.player, area = this.playerArea();
    const [dx, dy] = DIRS[p.dir];
    const fx = p.x + dx * 12, fy = p.y + dy * 12;
    let best = null, bestD = 13;
    for (const n of this.npcs.values()) {
      if (n.gnomed || n.area !== area) continue;
      const d = Math.hypot(n.x - fx, n.y - fy);
      if (d < bestD) { best = n; bestD = d; }
    }
    return best;
  }

  // Single source of truth for "what does E do right now?" -> { label, run }
  resolveAction() {
    const none = { label: null, run: () => this._useItem(this.player.facingTile()) };
    const p = this.player, f = p.facingTile();
    const npc = this.npcInFront();
    if (npc) return { label: t('prompt.talk', { name: t(`npc.${npc.id}.short`) }), run: () => this.talkTo(npc) };
    const obj = this.world.objectAt(f.x, f.y);
    if (obj && !obj.removed) {
      if (obj.kind === 'gnome') return { label: t('prompt.statue'), run: () => this.ui.say(null, fmt(t('statue.look'), { name: t(`npc.${obj.victim}.short`) })) };
      if (obj.search) return { label: t('prompt.search', { thing: t(`things.${obj.kind}`) }), run: () => this.search(obj) };
      if (obj.interact) {
        const label = t(`prompt.${obj.interact}`);
        return { label, run: () => this.useObject(obj) };
      }
    }
    const sp = this.mystery.sparkleAt(f.x, f.y) || this.mystery.sparkleAt(p.tx, p.ty);
    if (sp && this.playerArea().outdoor) return { label: t('prompt.inspect'), run: () => this.inspect(sp) };
    const plot = this.farm.plot(f.x, f.y);
    if (this.farm.isMature(plot)) return { label: t('prompt.harvest', { crop: t(`crop.${plot.c}`) }), run: () => this.harvest(f.x, f.y) };
    const cur = this.inv.current;
    if (!cur) return none;
    const item = ITEMS[cur.id];
    let label = null;
    if (cur.id === 'hoe' && this.farm.canTill(f.x, f.y)) label = t('prompt.till');
    else if (cur.id === 'watering_can') {
      if (this._isWaterSource(f.x, f.y)) label = t('prompt.refill');
      else if (this.farm.canWater(f.x, f.y)) label = t('prompt.water');
    } else if (cur.id === 'scythe' && this.farm.debrisAt(f.x, f.y)) label = t('prompt.clear', { debris: t(`debris.${this.farm.debrisAt(f.x, f.y)}`) });
    else if (item.type === 'seed' && this.farm.canPlant(f.x, f.y)) label = t('prompt.plant', { crop: t(`crop.${item.crop}`) });
    return { label, run: none.run };
  }

  _isWaterSource(x, y) {
    if (this.world.tile(x, y) === T.WATER) return true;
    const o = this.world.objectAt(x, y);
    return !!(o && o.interact === 'well');
  }

  _spend(cost) {
    if (this.energy < cost) { this.ui.toast(t('msg.tooTired'), 'warn'); Audio.play('error'); return false; }
    this.energy -= cost;
    return true;
  }

  _useItem(f) {
    const cur = this.inv.current;
    if (!cur) return;
    const id = cur.id, item = ITEMS[id];
    const farm = this.farm;
    if (id === 'hoe') {
      if (farm.canTill(f.x, f.y)) { if (this._spend(item.energy)) { farm.till(f.x, f.y); Audio.play('till'); } }
      else if (farm.debrisAt(f.x, f.y)) this.ui.toast(t('msg.clearFirst'));
      else if (!farm.isField(f.x, f.y)) this.ui.toast(t('msg.noTillHere'));
      return;
    }
    if (id === 'watering_can') {
      if (this._isWaterSource(f.x, f.y)) return this.refill();
      const plot = farm.plot(f.x, f.y);
      if (!plot) return;
      if (plot.w) { this.ui.toast(t('msg.alreadyWatered')); return; }
      if (this.water <= 0) { this.ui.toast(t('msg.canEmpty'), 'warn'); Audio.play('error'); return; }
      if (this._spend(item.energy)) { farm.water(f.x, f.y); this.water--; Audio.play('water'); }
      return;
    }
    if (id === 'scythe') {
      const d = farm.debrisAt(f.x, f.y);
      if (d) { if (this._spend(DEBRIS[d].energy)) { farm.clearDebris(f.x, f.y); Audio.play('swish'); } }
      else Audio.play('swish');
      return;
    }
    if (item.type === 'seed') {
      if (farm.canPlant(f.x, f.y)) { farm.plant(f.x, f.y, item.crop); this.inv.remove(id, 1); Audio.play('plant'); }
      else if (!farm.plot(f.x, f.y) && farm.isField(f.x, f.y)) this.ui.toast(t('msg.needTilled'));
    }
  }

  refill() {
    const cap = ITEMS.watering_can.capacity;
    if (!this.inv.count('watering_can')) return;
    if (this.water >= cap) { this.ui.toast(t('msg.canFull')); return; }
    this.water = cap;
    Audio.play('water');
    this.ui.toast(t('msg.refilled'));
  }

  harvest(x, y) {
    const plot = this.farm.plot(x, y);
    const produce = CROPS[plot.c].produce;
    if (!this.inv.canFit(produce)) { this.ui.toast(t('msg.invFull'), 'warn'); Audio.play('error'); return; }
    this.farm.harvest(x, y);
    this.inv.add(produce, 1);
    this.stats.harvested++;
    Audio.play('pickup');
    this.ui.toast(t('msg.harvested', { item: t(`item.${produce}.name`) }));
  }

  useObject(obj) {
    switch (obj.interact) {
      case 'bed':
        this.ui.confirm(t('sleep.question'), t('sleep.yes'), t('sleep.no'), () => this.sleep(false));
        break;
      case 'bin': this.ui.openBin(this); break;
      case 'craft': this.ui.openCraft(this); break;
      case 'well': this.refill(); break;
      case 'board': this.ui.openBoard(this); break;
      case 'shop':
        if (!storeOpen(this.day, this.minutes)) { this.ui.toast(t('msg.shopClosed')); Audio.play('error'); }
        else this.ui.openShop(this);
        break;
      case 'accuse':
        if (this.mystery.solved) this.ui.say(null, t('accuse.solved'));
        else this.ui.openAccuse(this);
        break;
      case 'sign': this.ui.toast(t('msg.sign')); break;
      default: break;
    }
  }

  // ------------------------------------------------------------ villagers
  addFriendship(npc, delta) {
    const before = npc.hearts;
    npc.friendship = Math.max(0, Math.min(FRIENDSHIP.max, npc.friendship + delta));
    if (npc.hearts > before) Audio.play('heart');
  }

  emote(target, kind) { this.emotes.push({ x: target.x, y: target.y, kind, t: 1.2 }); }

  talkTo(npc) {
    const p = this.player;
    const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
    npc.paused = true; npc.dir = opposite[p.dir];
    const first = npc.talkDay !== this.day;
    let text = null;
    if (first) {
      npc.talkDay = this.day;
      npc.talks++;
      this.addFriendship(npc, FRIENDSHIP.talk);
      text = reactionLine(npc, this);
      const last = this.mystery.attacks[this.mystery.attacks.length - 1];
      if (last && last.blocked && last.victim === npc.id && !last.thanked && last.night === this.day - 1) {
        last.thanked = true;
        this.addFriendship(npc, FRIENDSHIP.saved);
        this.emote(npc, 'heart');
      }
    }
    this.mystery.lastTalked = npc.id;
    if (!text) text = pickLine(npc, this);
    this._chat(npc, text);
  }

  _chat(npc, text) {
    const choices = [{ label: t('talk.ask'), fn: () => this.askAbout(npc) }];
    if (this.giftables().length) choices.push({ label: t('talk.giveMenu'), fn: () => this._giftMenu(npc) });
    choices.push({ label: t('talk.bye'), fn: null });
    this.ui.dialogue([{ who: npc.id, text, choices }], () => { npc.paused = false; });
  }

  // Distinct items the player could hand over (gifts and charms), selected hotbar item first.
  giftables() {
    const ids = [];
    const cur = this.inv.current;
    const ok = (id) => ITEMS[id].gift || ITEMS[id].type === 'charm';
    if (cur && ok(cur.id)) ids.push(cur.id);
    for (const s of this.inv.slots) if (s && ok(s.id) && !ids.includes(s.id)) ids.push(s.id);
    return ids;
  }

  _giftMenu(npc) {
    const choices = this.giftables().slice(0, 8).map((id) => {
      const name = `${t(`item.${id}.name`)} (${this.inv.count(id)})`;
      return { label: ITEMS[id].type === 'charm' ? t('talk.giveCharm', { item: name }) : t('talk.give', { item: name }), fn: () => this.giveItem(npc, id) };
    });
    choices.push({ label: t('talk.never'), fn: null });
    this.ui.dialogue([{ who: npc.id, text: t('talk.whatGift'), choices }], () => { npc.paused = false; });
  }

  askAbout(npc) {
    const m = this.mystery;
    let text;
    if (!m.attacks.length) text = t('talk.noNews');
    else {
      const g = m.gossipFor(npc.id, this);
      if (g && !g.locked) {
        m.addFound(g.clue.id, this.day);
        text = t(`clue.${g.clue.id}.text`);
        this._clueToast(g.clue.id);
        this._gossipCache.clear();
      } else if (g && g.locked) text = t(`npc.${npc.id}.askLocked`);
      else text = this.rng.pick(tList(`npc.${npc.id}.ask`));
    }
    this.ui.dialogue([{ who: npc.id, text }], () => { npc.paused = false; });
  }

  giveItem(npc, id) {
    if (!id || !this.inv.count(id)) { npc.paused = false; return; }
    const item = ITEMS[id];
    let text;
    if (item.type === 'charm') {
      const had = this.mystery.protect[npc.id] || 0;
      this.inv.remove(id, 1);
      this.mystery.protect[npc.id] = had + item.charges;
      this.addFriendship(npc, FRIENDSHIP.charm);
      Audio.play('charm');
      this.emote(npc, 'heart');
      text = t(had ? 'talk.charmMore' : 'talk.charmThanks');
    } else {
      if (npc.giftDay === this.day) { this.ui.dialogue([{ who: npc.id, text: t('talk.giftTooMany') }], () => { npc.paused = false; }); return; }
      npc.giftDay = this.day;
      this.inv.remove(id, 1);
      const r = giftReaction(npc, id);
      this.addFriendship(npc, FRIENDSHIP[r]);
      if (r === 'loved') {
        const known = this.flags.knownLoves[npc.id] || (this.flags.knownLoves[npc.id] = []);
        if (!known.includes(id)) known.push(id);
      }
      this.emote(npc, r === 'disliked' ? 'sad' : 'heart');
      Audio.play(r === 'disliked' ? 'error' : 'heart');
      text = t(`npc.${npc.id}.gift.${r}`);
    }
    this.mystery.lastTalked = npc.id;
    this.ui.dialogue([{ who: npc.id, text }], () => { npc.paused = false; });
  }

  // Cached "this villager has something new to tell you" (drives the speech-bubble hint).
  gossipHint(npc) {
    const now = performance.now();
    if (now - this._gossipT > 500) { this._gossipCache.clear(); this._gossipT = now; }
    if (!this._gossipCache.has(npc.id)) {
      const g = this.mystery.attacks.length ? this.mystery.gossipFor(npc.id, this) : null;
      this._gossipCache.set(npc.id, !!(g && !g.locked));
    }
    return this._gossipCache.get(npc.id);
  }

  // ------------------------------------------------------------ mystery actions
  _clueToast(id) {
    Audio.play('clue');
    this.ui.toast(t('msg.clueFound', { title: t(`clue.${id}.title`) }), 'clue');
  }

  inspect(sparkle) {
    const clue = this.mystery.inspect(sparkle, this.day);
    this._clueToast(clue.id);
    this.ui.say(null, `${t(`clue.${clue.id}.title`)}\n${t(`clue.${clue.id}.text`)}`);
  }

  search(obj) {
    const area = this.world.areaById[obj.area];
    const owner = area.owner && this.npcs.get(area.owner);
    if (owner && !owner.gnomed && owner.area === area) {
      this.addFriendship(owner, FRIENDSHIP.caught);
      owner.dir = 'down';
      this.emote(owner, 'bang');
      Audio.play('caught');
      this.ui.dialogue([{ who: owner.id, text: t(`npc.${owner.id}.caught`) }, { who: null, text: t('search.caught', { name: t(`npc.${owner.id}.short`) }) }]);
      return;
    }
    const clue = this.mystery.search(obj.key, this.day);
    if (clue) {
      this._clueToast(clue.id);
      this.ui.say(null, `${t('search.found')}\n\n${t(`clue.${clue.id}.title`)}: ${t(`clue.${clue.id}.text`)}`);
      return;
    }
    if (!this.mystery.attacks.length) { this.ui.say(null, t('search.tooEarly')); return; }
    this.ui.say(null, this.rng.pick(tList(`search.nothing.${obj.kind}`)));
  }

  accuse(id) {
    const right = this.mystery.accuse(id);
    if (right) {
      for (const n of this.npcs.values()) n.gnomed = false;
      for (const o of this.world.objects) if (o.kind === 'gnome') this.world.removeObject(o);
      this.mystery.sparkles = [];
      for (const n of this.npcs.values()) n.snapToSchedule(this.world, this.minutes, this.weather);
      Platform.happytime();
      Audio.play('win');
      this.save();
      this.ui.showEnding('win', this);
    } else {
      Audio.play('lose');
      Save.clear();
      this.ui.showEnding('wrong', this, id);
    }
  }

  // ------------------------------------------------------------ shop / bin / crafting
  buy(id) {
    const price = id === 'backpack' ? BACKPACK.price : ITEMS[id].price;
    if (this.money < price) { this.ui.toast(t('msg.cantAfford'), 'warn'); Audio.play('error'); return false; }
    if (id === 'backpack') {
      if (this.flags.backpack) return false;
      this.flags.backpack = true;
      this.inv.resize(BACKPACK.size);
    } else if (!this.inv.canFit(id)) { this.ui.toast(t('msg.invFull'), 'warn'); return false; }
    else this.inv.add(id, 1);
    this.money -= price;
    Audio.play('coin');
    return true;
  }

  sellValue(id) { return ITEMS[id].sell || 0; }

  sellSlot(i, all) {
    const s = this.inv.slots[i];
    if (!s || !this.sellValue(s.id)) return;
    const taken = this.inv.removeAt(i, all ? s.qty : 1);
    const gold = this.sellValue(taken.id) * taken.qty;
    this.money += gold; this.stats.earned += gold;
    Audio.play('coin');
    this.ui.toast(t('msg.sold', { n: gold }));
  }

  shipSlot(i) {
    const s = this.inv.slots[i];
    if (!s || !this.sellValue(s.id)) return;
    const taken = this.inv.removeAt(i, s.qty);
    const existing = this.bin.find((b) => b.id === taken.id);
    if (existing) existing.qty += taken.qty; else this.bin.push({ ...taken });
    Audio.play('pickup');
  }

  unship(idx) {
    const b = this.bin[idx];
    if (!b) return;
    const left = this.inv.add(b.id, b.qty);
    if (left) { b.qty = left; this.ui.toast(t('msg.invFull'), 'warn'); } else this.bin.splice(idx, 1);
  }

  binValue() { return this.bin.reduce((n, b) => n + this.sellValue(b.id) * b.qty, 0); }

  canCraft(r) { return Object.entries(r.need).every(([id, n]) => this.inv.count(id) >= n); }
  craft(r) {
    if (!this.canCraft(r)) return false;
    for (const [id, n] of Object.entries(r.need)) this.inv.remove(id, n);
    const left = this.inv.add(r.out, r.qty);
    if (left) { for (const [id, n] of Object.entries(r.need)) this.inv.add(id, n); this.ui.toast(t('msg.invFull'), 'warn'); return false; }
    Audio.play('charm');
    this.ui.toast(t('msg.crafted', { item: t(`item.${r.out}.name`) }));
    return true;
  }

  // ------------------------------------------------------------ night
  sleep(passedOut) {
    const report = { day: this.day, shipped: this.bin.map((b) => ({ ...b, value: this.sellValue(b.id) * b.qty })), passedOut, penalty: 0 };
    const income = this.binValue();
    this.money += income; this.stats.earned += income;
    this.bin = [];
    report.income = income;
    if (passedOut) { report.penalty = Math.min(150, Math.floor(this.money * 0.1)); this.money -= report.penalty; }

    const attack = this.mystery.night(this);
    if (attack && !attack.blocked) this._gnome(attack);
    report.attack = attack;

    this.farm.nightly();
    this.day++;
    this.minutes = DAY_START;
    const r = this.rng.next();
    this.weather = r < 0.2 ? 'rain' : r < 0.45 ? 'cloudy' : 'sunny';
    if (this.weather === 'rain') this.farm.rain();
    this.energy = passedOut ? Math.round(this.maxEnergy * 0.6) : this.maxEnergy;
    report.weather = this.weather;
    this._wakeUp();
    this.input.clearHeld();

    const outcome = this.mystery.checkLoss(this.day);
    if (outcome) {
      Save.clear();
      Audio.play('lose');
      this.ui.showEnding(outcome, this);
      return;
    }
    if (this.day > SEASON_DAYS && this.mystery.solved && !this.flags.seasonNote) { this.flags.seasonNote = true; report.seasonOver = true; }
    this.save();
    Audio.play(attack && !attack.blocked ? 'gnome' : 'sleep');
    this.ui.showMorning(report, this);
  }

  // Facts the HUD and notebook need.
  get victimCount() { return this.mystery.victims.length; }
  get daysLeft() { return Math.max(0, SEASON_DAYS - this.day); }
  get recipes() { return RECIPES; }
}

