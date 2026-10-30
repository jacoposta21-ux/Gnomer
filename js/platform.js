// Platform adapter: CrazyGames SDK v3, or the Playgama Bridge in the Playgama build
// (tools/zip-playgama.sh). Every call is guarded: if the SDK is missing, blocked or throws
// (local testing, other domains, offline), we fall back to localStorage and no-op events.

let sdk = null;
let bridge = null; // Playgama Bridge (saves stay in localStorage: Bridge storage is async)
let ready = false;
let gameplayOn = false;
let loading = false;

function safe(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

function storage() {
  return safe(() => window.localStorage, null);
}

export const Platform = {
  get active() { return !!sdk || !!bridge; },

  async init() {
    const B = safe(() => window.bridge, null);
    if (B) {
      try {
        await Promise.race([B.initialize(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))]);
        bridge = B;
        return true;
      } catch {
        return false;
      }
    }
    const SDK = safe(() => window.CrazyGames && window.CrazyGames.SDK, null);
    if (!SDK) return false;
    try {
      // Never let a hanging init block the game.
      await Promise.race([SDK.init(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]);
      if (SDK.environment === 'disabled') return false;
      sdk = SDK;
      return true;
    } catch {
      sdk = null;
      return false;
    }
  },

  loadingStart() {
    if (loading) return;
    loading = true;
    if (sdk) safe(() => sdk.game.loadingStart());
  },
  loadingStop() {
    if (!loading) return;
    loading = false;
    if (sdk) safe(() => sdk.game.loadingStop());
    if (bridge && !ready) { ready = true; safe(() => bridge.platform.sendMessage('game_ready')); }
  },

  // Called every frame with "is the player actually playing right now"; only edges reach the SDK.
  setGameplay(on) {
    if (on === gameplayOn) return;
    gameplayOn = on;
    if (bridge) safe(() => bridge.platform.sendMessage(on ? 'gameplay_started' : 'gameplay_stopped'));
    if (!sdk) return;
    if (on) safe(() => sdk.game.gameplayStart());
    else safe(() => sdk.game.gameplayStop());
  },

  happytime() {
    if (sdk) safe(() => sdk.game.happytime());
  },

  locale() {
    const fromSdk = sdk ? safe(() => sdk.user.systemInfo.locale, null) : bridge ? safe(() => bridge.platform.language, null) : null;
    return fromSdk || safe(() => navigator.language, 'en') || 'en';
  },

  getItem(key) {
    if (sdk) {
      const v = safe(() => sdk.data.getItem(key), undefined);
      if (v !== undefined) return v;
    }
    const ls = storage();
    return ls ? safe(() => ls.getItem(key), null) : null;
  },

  setItem(key, value) {
    let ok = false;
    if (sdk) ok = safe(() => { sdk.data.setItem(key, value); return true; }, false);
    if (!ok) {
      const ls = storage();
      if (ls) ok = safe(() => { ls.setItem(key, value); return true; }, false);
    }
    return ok;
  },

  removeItem(key) {
    if (sdk) safe(() => sdk.data.removeItem(key));
    const ls = storage();
    if (ls) safe(() => ls.removeItem(key));
  },
};
