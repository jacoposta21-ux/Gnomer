// Headless logic test: plays many full seasons without a browser.
// Run: node tools/sim-test.js
import assert from 'node:assert/strict';

// --- minimal browser stand-ins (storage only; rendering/UI are stubbed below)
const store = new Map();
globalThis.window = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };

const { Game } = await import('../js/game.js');
const { Save } = await import('../js/save.js');
const { CLUES } = await import('../js/mystery.js');
const { VILLAGERS } = await import('../js/data/villagers.js');
const { MYSTERY } = await import('../js/data/killers.js');
const { DAY_END } = await import('../js/time.js');

function makeGame() {
  const ui = {
    blocking: false, endings: [], toasts: [], last: null,
    toast(m) { this.toasts.push(m); }, say(w, text) { this.last = text; }, flash() {}, setPrompt() {}, handleActions() {},
    dialogue(pages, done) { this.last = pages.map((p) => p.text).join(' / '); if (done) done(); },
    confirm(text, y, n, onYes) { onYes(); }, showMorning() {}, showEnding(type) { this.endings.push(type); },
    openBin() {}, openCraft() {}, openBoard() {}, openShop() {}, openAccuse() {}, openNotebook() {}, openBag() {}, openPause() {},
  };
  const renderer = { snap() {}, updateCamera() {} };
  const input = { consume: () => [], move: { x: 0, y: 0 }, clearHeld() {} };
  return { game: new Game({ renderer, ui, input }), ui };
}

const results = { games: 0, wins: 0, firstAttackDays: [], evidenceAtThird: [], minEvidenceBeforeLoss: 99, gnomers: {} };

// Play one season with a reasonably diligent detective. Returns the game.
function playSeason(seed, { protect = true, accuseAt = null } = {}) {
  const { game, ui } = makeGame();
  game.newGame();
  game.rng.s = seed >>> 0;
  const m = game.mystery;
  results.gnomers[m.gnomerId] = (results.gnomers[m.gnomerId] || 0) + 1;
  const W = game.world, field = W.field;

  // clear + till + plant a block of garlic and turnips right away
  let planted = 0;
  for (let y = field.y; y < field.y + 3; y++) for (let x = field.x; x < field.x + 12; x++) {
    game.farm.clearDebris(x, y); game.farm.till(x, y);
    game.farm.plant(x, y, planted % 3 === 0 ? 'turnip' : 'garlic'); planted++;
  }
  for (let day = 1; day <= 40 && !m.outcome; day++) {
    // water everything
    for (const k of game.farm.plots.keys()) game.farm.plots.get(k).w = true;
    // harvest ripe, replant
    for (const [k, p] of game.farm.plots) {
      const x = k % W.w, y = Math.floor(k / W.w);
      if (game.farm.isMature(p)) { game.inv.add(game.farm.harvest(x, y), 1); game.farm.plant(x, y, game.rng.chance(0.5) ? 'turnip' : 'garlic'); }
    }
    // talk to and ask everyone (friendship + dialogue clues)
    for (const n of game.npcs.values()) {
      if (n.gnomed) continue;
      game.talkTo(n);
      game.askAbout(n);
    }
    // inspect every sparkle
    for (const s of [...m.sparkles]) game.inspect(s);
    // snoop every house (owners are out at noon)
    for (const o of Object.values(W.searchables)) m.search(o.key, game.day);
    // charm whoever the Gnomer would pick next, if we can craft one (a good detective's guess)
    if (protect) {
      const r = game.recipes[0];
      if (game.canCraft(r)) {
        game.craft(r);
        const target = m.pickVictim(game);
        game.giveItem(game.npcs.get(target), 'garlic_garland');
      }
    }
    // ship crops for money
    game.inv.slots.forEach((s, i) => { if (s && (s.id === 'turnip') && s.qty > 4) game.shipSlot(i); });
    if (accuseAt && game.day === accuseAt) { game.accuse(accuseAt === 'never' ? null : m.gnomerId); break; }
    if (m.attacks.length >= 3 && accuseAt === null) {
      const ev = m.found.filter((f) => CLUES[f.id].role === 'evidence').length;
      results.evidenceAtThird.push(ev);
    }
    const before = m.attacks.length;
    game.sleep(false);
    if (m.attacks.length > before && before === 0) results.firstAttackDays.push(game.day);
    if (m.outcome) {
      const ev = m.found.filter((f) => CLUES[f.id].role === 'evidence').length;
      results.minEvidenceBeforeLoss = Math.min(results.minEvidenceBeforeLoss, ev);
    }
  }
  return { game, ui };
}

// 1) Many seasons without accusing: attacks start by day 4, evidence becomes available.
for (let i = 0; i < 300; i++) {
  playSeason(1000 + i * 7919, { protect: i % 2 === 0 });
  results.games++;
}
assert.ok(results.firstAttackDays.every((d) => d <= 4), 'first gnome appears by the morning of day 4');
for (const id of VILLAGERS.filter((v) => v.candidate).map((v) => v.id)) assert.ok(results.gnomers[id] > 20, `${id} gets picked as the Gnomer sometimes`);
const avgEv = results.evidenceAtThird.reduce((a, b) => a + b, 0) / Math.max(1, results.evidenceAtThird.length);
console.log('first attack morning days:', [...new Set(results.firstAttackDays)].sort());
console.log('gnomer distribution:', results.gnomers);
console.log('avg true evidence by 3rd attack:', avgEv.toFixed(2), ' min evidence when the game was lost:', results.minEvidenceBeforeLoss);
assert.ok(results.minEvidenceBeforeLoss >= 4, 'a diligent player always has at least 4 true clues before losing');

// 2) Crop timing: turnip 3 days, garlic 4, pumpkin 7 when watered daily; unwatered does not grow.
{
  const { game } = makeGame(); game.newGame();
  const f = game.world.field, farm = game.farm;
  const spots = [['turnip', 3], ['garlic', 4], ['pumpkin', 7]];
  spots.forEach(([c], i) => { farm.clearDebris(f.x + i, f.y); farm.till(f.x + i, f.y); farm.plant(f.x + i, f.y, c); });
  farm.clearDebris(f.x + 5, f.y); farm.till(f.x + 5, f.y); farm.plant(f.x + 5, f.y, 'turnip'); // never watered
  for (let d = 1; d <= 7; d++) {
    spots.forEach(([c, days], i) => {
      assert.equal(farm.isMature(farm.plot(f.x + i, f.y)), d - 1 >= days, `${c} maturity on day ${d}`);
      farm.water(f.x + i, f.y);
    });
    farm.nightly();
  }
  assert.equal(farm.plot(f.x + 5, f.y).g, 0, 'unwatered crop did not grow');
  // empty tilled soil reverts after 3 dry nights
  farm.clearDebris(f.x + 8, f.y); farm.till(f.x + 8, f.y);
  farm.nightly(); farm.nightly(); assert.ok(farm.plot(f.x + 8, f.y)); farm.nightly(); assert.equal(farm.plot(f.x + 8, f.y), null);
  console.log('crop growth: ok');
}

// 3) Shop + bin economy
{
  const { game } = makeGame(); game.newGame();
  const m0 = game.money;
  assert.ok(game.buy('seed_pumpkin')); assert.equal(game.money, m0 - 60); assert.equal(game.inv.count('seed_pumpkin'), 1);
  game.inv.add('pumpkin', 2);
  const i = game.inv.slots.findIndex((s) => s && s.id === 'pumpkin');
  game.shipSlot(i); assert.equal(game.binValue(), 520);
  const before = game.money; game.sleep(false); assert.equal(game.money, before + 520);
  game.money = 1000; assert.ok(game.buy('backpack')); assert.equal(game.inv.size, 25); assert.ok(!game.buy('backpack'));
  console.log('shop/bin: ok');
}

// 4) Accusation both ways
{
  const { game, ui } = makeGame(); game.newGame();
  game.accuse(game.mystery.gnomerId);
  assert.equal(game.mystery.outcome, 'win'); assert.deepEqual(ui.endings, ['win']);
  const { game: g2, ui: u2 } = makeGame(); g2.newGame();
  const wrong = VILLAGERS.find((v) => v.id !== g2.mystery.gnomerId).id;
  g2.accuse(wrong);
  assert.equal(g2.mystery.outcome, 'wrong'); assert.deepEqual(u2.endings, ['wrong']);
  console.log('accusation right/wrong: ok');
}

// 5) Save / load round trip restores everything
{
  const { game } = playSeason(424242, { protect: true, accuseAt: 9 });
  // accuseAt ends the loop early; just verify state from a mid-season save
  const { game: g } = makeGame(); g.newGame();
  for (let d = 0; d < 6; d++) { for (const n of g.npcs.values()) if (!n.gnomed) g.talkTo(n); g.sleep(false); }
  g.inv.add('pumpkin', 3); g.money = 777; g.mystery.notes.fennel = 'sus';
  g.save();
  const snapshot = JSON.stringify(g.serialize());
  const { game: g3 } = makeGame();
  g3.loadSave(Save.load());
  assert.equal(JSON.stringify(g3.serialize()), snapshot, 'serialize(load(save)) is identical');
  assert.equal(g3.world.objects.filter((o) => o.kind === 'gnome').length, g.mystery.victims.length, 'gnome statues restored');
  assert.ok(game);
  console.log('save/load: ok (', snapshot.length, 'bytes )');
}

// 6) Villagers actually walk their schedules for a whole simulated day
{
  const { game } = makeGame(); game.newGame();
  const step = 1 / 30;
  while (game.minutes < 23 * 60) {
    game.minutes += step * (1200 / 540);
    for (const n of game.npcs.values()) n.update(step, game.world, game.minutes, game.weather);
  }
  for (const n of game.npcs.values()) {
    const loc = game.world.resolveLocation(n.slot(game.minutes, game.weather), n.def.home);
    assert.ok(n.tx === loc.x && n.ty === loc.y, `${n.id} reached ${n.goal}`);
  }
  console.log('npc schedules: ok');
}

// 7) Passing out at 2:00 costs gold and starts the next day
{
  const { game } = makeGame(); game.newGame();
  game.money = 1000; game.minutes = DAY_END - 0.001;
  game._tick(0.01);
  assert.equal(game.day, 2); assert.equal(game.money, 900);
  console.log('pass out: ok');
}

// 8) Regression: a villager stopping on top of the player must never trap them (bridge bug)
{
  const { game } = makeGame(); game.newGame();
  game.minutes = 17 * 60;
  const f = game.npcs.get('fennel');
  f.snapToSchedule(game.world, game.minutes, game.weather);
  for (const [mx, my] of [[0, 1], [-1, 0], [1, 0]]) {
    game.player.x = f.x - 12; game.player.y = f.y - 5;
    const sx = game.player.x, sy = game.player.y;
    for (let i = 0; i < 60; i++) game.player.update(1 / 60, { x: mx, y: my }, (x, y) => game._blockedForPlayer(x, y));
    assert.ok(Math.hypot(game.player.x - sx, game.player.y - sy) > 20, `player can walk away (${mx},${my})`);
  }
  console.log('never stuck on villagers: ok');
}

// 9) Every searchable piece of furniture can be reached, and every dialogue line has text
{
  const { game } = makeGame(); game.newGame();
  const { findPath } = await import('../js/pathfinding.js');
  const { has } = await import('../js/i18n.js');
  const W = game.world;
  for (const o of Object.values(W.searchables)) {
    const a = W.areaById[o.area];
    const ok = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => {
      const x = o.x + dx, y = o.y + dy;
      return !W.isSolid(x, y) && findPath(W, a.mat.x, a.mat.y - 1, x, y) !== null;
    });
    assert.ok(ok, `${o.key} is reachable`);
  }
  for (const v of VILLAGERS) for (const k of Object.keys(v.lines)) assert.ok(has(`npc.${v.id}.lines.${k}`), `text for ${v.id}.${k}`);
  console.log('furniture reachable + dialogue text: ok');
}

// 10) Night prowl: catching the Gnomer cancels tonight's attack and reveals the sighting clue
{
  const { game, ui } = makeGame(); game.newGame();
  const m = game.mystery;
  game.day = m.nextAttack; game.minutes = 22.5 * 60 - 0.01;
  game._tick(0.01);
  const g = game.npcs.get(m.gnomerId);
  assert.ok(g.prowling && m.tonight, 'gnomer goes out on attack night');
  const plan = m.tonight;
  for (let i = 0; i < 60 * 300 && !(g.tx === plan.x && g.ty === plan.y); i++) g.update(1 / 60, game.world, game.minutes, game.weather);
  assert.ok(g.tx === plan.x && g.ty === plan.y, 'gnomer reaches the attack spot');
  game.player.x = g.x; game.player.y = g.y + 20;
  game._tick(0.001);
  assert.ok(!g.prowling && m.tonight.interrupted, 'gnomer flees');
  assert.ok(g.hooded, 'stays hooded while fleeing');
  for (let i = 0; i < 60 * 300 && g.hooded; i++) g.update(1 / 60, game.world, game.minutes, game.weather);
  assert.ok(!g.hooded && !g.area.outdoor, 'hood comes off only once back indoors');
  assert.ok(m.found.some((f) => f.id.endsWith('_seen')), 'sighting clue found');
  const before = m.attacks.length, night = game.day;
  game.sleep(false);
  assert.equal(m.attacks.length, before, 'no attack after being scared off');
  assert.equal(m.nextAttack, night + 1, 'tries again the next night');
  assert.ok(plan.victim);
  console.log('night prowl: ok');
}

// 11) Cranberries regrow; requests can be delivered; difficulty presets apply
{
  const { game } = makeGame(); game.newGame();
  const f = game.world.field, farm = game.farm, x = f.x, y = f.y;
  farm.clearDebris(x, y); farm.till(x, y); farm.plant(x, y, 'cranberry');
  for (let d = 0; d < 5; d++) { farm.water(x, y); farm.nightly(); }
  assert.equal(farm.harvest(x, y), 'cranberry');
  assert.equal(farm.plot(x, y).c, 'cranberry', 'plant stays after harvest');
  for (let d = 0; d < 2; d++) { farm.water(x, y); farm.nightly(); }
  assert.ok(farm.isMature(farm.plot(x, y)), 'fruits again after 2 days');

  game.quests = [{ npc: 'barnaby', item: 'pumpkin', qty: 1, due: game.day + 3 }];
  game.inv.add('pumpkin', 1);
  const money = game.money, fr = game.npcs.get('barnaby').friendship;
  game.deliverQuest(game.npcs.get('barnaby'));
  assert.ok(game.money > money && game.npcs.get('barnaby').friendship > fr && !game.quests.length, 'request delivered');
  let made = 0;
  for (let i = 0; i < 30; i++) { game.quests = []; game.day = 3; if (game._newQuest()) made++; }
  assert.ok(made > 5, 'requests get generated');

  const { game: easy } = makeGame(); easy.newGame('easy');
  assert.equal(easy.mystery.nextAttack, 3); assert.equal(easy.mystery.maxVictims, 5);
  const { game: hard } = makeGame(); hard.newGame('hard');
  assert.equal(hard.mystery.nextAttack, 2); hard.day = 2; assert.equal(hard.omenTonight, false);
  console.log('regrow, requests, difficulty: ok');
}

console.log(`\nAll checks passed across ${results.games} simulated seasons.`);
