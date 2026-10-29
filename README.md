# Grim Acres

A cozy top-down pixel-art farming sim with a comedic murder mystery. You inherit your great-aunt's
run-down farm in **Mildew Hollow**, an adorable village with one small problem: every few nights a
villager is turned into a **garden gnome**. Someone in town is secretly *the Gnomer*. Grow crops,
make friends, gather clues and accuse the culprit before the season ends.

PEGI 12 friendly: nobody is hurt, they're just very glossy for a while.

**This is Milestone 1.** It's plain HTML5 Canvas with vanilla ES modules: no build step and no
dependencies except the CrazyGames SDK. All art and sound are generated in code at startup.

---

## Run locally

ES modules need a web server (opening `index.html` as a file won't work):

```bash
npx serve .
```

or, without Node:

```bash
python3 -m http.server 8000
```

Then open the printed URL (e.g. http://localhost:3000 or http://localhost:8000).

Off the CrazyGames domain the SDK can't initialise. The game notices, falls back to `localStorage`
and turns SDK events into no-ops. When you're offline the browser logs a failed request for
`crazygames-sdk-v3.js`; that's expected and harmless.

### Tests

```bash
node tools/sim-test.js
```

This plays 300 simulated seasons headlessly and checks:

- the first gnoming happens by day 4;
- every suspect can be the Gnomer;
- a diligent player always has enough true clues;
- crop timings, the shop and shipping bin, both accusation outcomes and passing out work;
- save → load reproduces the exact same state;
- villagers reach every scheduled spot.

Add `?debug` to the URL to expose `window.__grim` (game, ui, renderer) for poking at things in the
console.

---

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | WASD or arrow keys | Drag on the left half of the screen (virtual joystick) |
| Use tool / interact / talk | E or Space (or left-click the world) | Round **E** button |
| Select hotbar slot | 1-5 or mouse wheel | Tap a hotbar slot |
| Notebook | Tab or N | Notebook button (top right) |
| Bag / rearrange items | I or B | Bag button |
| Pause | Esc or P | Pause button |
| Mute | M | Speaker button |

In dialogue, E/Space/click advances. Pick answers with the arrow keys + E, the number keys or a click.
Every menu also works from the keyboard: arrows/WASD move the highlight, E/Space choose, Esc closes.

**Gamepad** (standard mapping): left stick or d-pad to move and to navigate menus, A use/interact,
B back/pause, X bag, Y notebook, LB/RB hotbar, Start pause.

## How to play (short)

- **Start:** you begin with the hoe, the watering can and the scythe. During the tutorial Marigold
  gives you your first turnip and garlic seeds for free at the store (only then).
- **Farm:** use the scythe to clear debris, the hoe to till, then plant seeds and water every day.
  Refill the can at the river, the well or the fountain. Turnips take 3 days, garlic 4, pumpkins 7.
  Rain waters for you.
- **Earn:** put produce in the shipping bin (sold overnight) or sell it at Pepperpot's General Store
  (8:00-17:00, closed Sundays). Buy seeds, gifts and a bigger backpack there.
- **Days:** a day runs from 6:00 to 2:00 (about 9 real minutes). Sleeping saves the game. If you're
  still up at 2:00 you pass out and lose some gold.
- **Friends:** chat with each villager once a day and give gifts ("Give a gift…" in the chat menu)
  to earn hearts. Some villagers only share what they know once you're friends.
- **Mystery:** after each gnoming, look for sparkles near the statue, ask villagers about the
  gnomings, and search wardrobes, bookshelves and chests while the owner is out. Getting caught
  costs you friendship. Watch out for red herrings and alibis.
- **Charms:** at the workbench, craft a Garlic Garland (2 garlic + 1 turnip) or a Pumpkin Ward
  (1 pumpkin + 1 garlic, which blocks two attempts). Give one to whoever you think is next. A foiled
  attack leaves an extra clue. The Gnomer won't go after the same charmed villager twice in a row.
- **Night prowls:** on attack nights (you get a warning, except on Hard) the Gnomer sneaks out
  between 22:30 and 1:30, as a hooded silhouette, to where tonight's victim was last seen. Reach
  them and they flee: nobody is gnomed that night and you get a "night sighting" clue.
- **Requests:** villagers post requests (notice board / Notebook). Deliver in time for gold, hearts
  and sometimes a secret clue.
- **Cranberries** keep fruiting every 2 days after the first harvest.
- **Fishing:** buy a rod and bait (packs of 5, one per cast) at the store, face the river and press
  E; react to the bite, then stop the marker in the green. Roughly half the catches are mudminnows,
  a third perch, and some are junk (cans, boots, soggy newspapers) worth 0 that you can sell or ship
  to get rid of. Rarer: silver eel (night only) and golden carp (likelier in rain). Give a fish to a
  village cat and it follows you until you go to bed, and can be petted three times a day.
- **Resting:** sit on a bench (there's one in front of the farmhouse) to let five hours pass and
  restore all your energy. Sleeping and resting close your eyes with a short fade. On quiet nights
  the clock runs twice as fast after 20:00.
- A nameplate appears above doors as you approach them.
- **Difficulty** (title screen): Easy, Normal or Hard, chosen per new game.
- **Achievements & statistics** carry over between games (title screen or pause menu).
- **Accuse** the Gnomer at the lectern in the town hall (8:00-20:00). Get it right and everyone is
  un-gnomed. Get it wrong and *you* become a gnome. You also lose if four villagers are gnomed or the
  28-day season ends first.

---

## Uploading to CrazyGames

1. Build the zip (it puts `index.html` at the root of the archive):

   ```bash
   sh tools/zip.sh
   ```

   This creates `grim-acres.zip`: about 85 KB and 32 files, well under the 50 MB and 1,500-file
   limits.

   On Windows (PowerShell), run this from the project folder instead:

   ```powershell
   Compress-Archive -Path index.html, js, strings, assets -DestinationPath grim-acres.zip -Force
   ```

2. On the CrazyGames developer portal, create a new HTML5 game and upload `grim-acres.zip`.

3. Test it in the portal's QA preview. The SDK adapter (`js/platform.js`) handles:
   - `loadingStart` / `loadingStop` around asset generation;
   - `gameplayStart` / `gameplayStop` around play versus menus, dialogue, pause and the title screen;
   - `happytime` only when you catch the Gnomer;
   - saving through `SDK.data`;
   - reading the locale from `SDK.user.systemInfo`.

There are no ads, external links, logins or custom fullscreen button.

### Submission blurb

**Short description**
> Inherit a creaky farm in the cozy village of Mildew Hollow, where someone keeps turning the
> neighbours into garden gnomes. Grow turnips, garlic and pumpkins, make friends, craft garlic charms
> to protect the villagers, collect clues, and accuse the Gnomer before the season ends. Every new
> game picks a different culprit!

**Controls**
> WASD / Arrow keys: move · E / Space: use tool, talk, interact · 1-5 / Mouse wheel: select hotbar
> slot · Tab / N: notebook · I: bag · Esc: pause · M: mute. On touch devices: drag the left side of
> the screen to move, tap the E button to interact, tap hotbar slots to select.

---

## Project structure

```
index.html            entry point (loads the CrazyGames SDK + js/main.js)
assets/style.css      all HTML/CSS overlay styling
strings/en.js         EVERY player-facing string (dialogue, clues, UI, items...)
strings/it|es|pt|fr|de.js  translations
js/main.js            boot sequence + game loop
js/game.js            game state & rules glue: time, interactions, night cycle, endings
js/platform.js        CrazyGames SDK v3 adapter with graceful fallbacks
js/i18n.js            string lookup, {placeholder} formatting, locale loading
js/input.js           keyboard, wheel, touch joystick + action button
js/renderer.js        pixel canvas renderer: camera, depth sorting, lighting, weather
js/art.js             procedural pixel art (tiles, buildings, characters, crops, icons, portraits)
js/world.js           tile map builder (outdoors + interiors in one grid), collision, doors
js/pathfinding.js     A* with door portals
js/entities.js        player + villager movement and schedules
js/farming.js         tilled plots, crops, debris
js/inventory.js       slot inventory + hotbar
js/dialogue.js        line selection, reactions, gift reactions
js/mystery.js         the Gnomer: victim choice, attacks, clue placement, gossip, endings
js/ui.js              HUD, dialogue, menus, notebook, shop, bin, crafting, title, endings
js/audio.js           generated WebAudio sound effects + generative music + mute
js/progress.js        lifetime achievements and statistics
js/save.js            versioned save/load through the platform adapter
js/time.js            clock, store hours, door locks, day/night curve
js/data/*.js          content: map, items, crops, recipes, villagers, killer profiles
tools/zip.sh          packaging for upload
tools/sim-test.js     headless season simulation tests
```

### Adding content

- **Items / crops / recipes:** add an entry in `js/data/items.js`, `crops.js` or `recipes.js` and
  its name/description in `strings/en.js` (`item.<id>`). Crop and item icons are drawn in
  `js/art.js` (`cropSprites`, `itemIcon`).
- **Villagers:** add to `js/data/villagers.js` (look, stats, gift tastes, schedule, dialogue line
  conditions), give them a house in `js/data/map.js` and add their text under `npc.<id>` in the
  strings file.
- **Gnomer profiles and clues:** add to `js/data/killers.js` (victim rule, interval, clues, red
  herrings, alibi) with texts under `killer.<id>` and `clue.<clueId>`. New victim rules go in
  `Mystery.pickVictim`.
- **Localization:** English, Italian, Spanish, Portuguese (Brazil), French and German are included
  (`strings/<lang>.js`); players switch language from the title-screen dropdown. To add another language, copy `strings/en.js` to
  `strings/<lang>.js`, translate the values (keep the keys and `{placeholders}`), and add the code to
  `SUPPORTED` in `js/i18n.js`. The default comes from the SDK locale, then the browser language.
  `node tools/sim-test.js` fails if a translation is missing a key or a placeholder.
- **Save format:** saves carry a version number (`SAVE_VERSION` in `js/save.js`). When the format
  changes, bump it and add a `MIGRATIONS[n]` function that upgrades a version-n save.

---

## Planned for Milestone 2

- **Seasons:** winter/spring/summer cycles with seasonal crops, palettes, weather (snow) and
  festivals. A new Gnomer each season, with year-long friendships.
- **Fishing:** a timing minigame at the river and the old dock, with fish as gifts and charm
  ingredients.
- **Mining:** a cave north of the village with ore and gems, and tool upgrades that cost less
  energy and work on a 3-tile area.
- **Romance:** heart events at 3/5 hearts, dating two eligible villagers, and a wedding (the
  Gnomer may get jealous).
- **More killers and mysteries:** new victim rules (e.g. "whoever got the last gift"), an
  accomplice twist and more red-herring types.
- **Quality of life:** a storage chest, a sprinkler craftable, a gamepad button-prompt mode, and a
  cloud-save conflict prompt.
