// Save slots. The league state (several MB) lives in IndexedDB; the slot list keeps only
// small metadata in localStorage under "a13-save-<n>". Export writes a .json file, import reads one.
(function () {
  'use strict';
  const UI = window.UI;
  // Test mode (?stub=1) keeps its saves apart from real ones.
  const PREFIX = window.__A13_STUB ? 'a13-save-stub-' : 'a13-save-';
  const ACTIVE = window.__A13_STUB ? 'a13-active-stub' : 'a13-active';
  const DB_NAME = window.__A13_STUB ? 'a13-stub' : 'a13';
  const STORE = 'saves';
  const SLOTS = 5;
  const APP = '2k13-association';

  const Saves = UI.saves = { SLOTS, PREFIX };

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }

  // ---------- IndexedDB ----------
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('This browser has no IndexedDB, so saves are not available.')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Could not open browser storage.'));
      req.onblocked = () => reject(new Error('Browser storage is blocked by another tab.'));
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }
  async function idb(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error || new Error('Storage error'));
      tx.onabort = () => reject(tx.error || new Error('Storage write was aborted (the disk may be full).'));
    });
  }
  const key = slot => PREFIX + slot;

  // ---------- slot list (metadata only) ----------
  Saves.list = function () {
    const out = [];
    for (let n = 1; n <= SLOTS; n++) {
      const raw = lsGet(key(n));
      let meta = null;
      if (raw) { try { meta = JSON.parse(raw); } catch (e) { meta = { name: 'Unreadable save', broken: true }; } }
      out.push({ slot: n, meta });
    }
    return out;
  };
  Saves.firstEmpty = () => { const s = Saves.list().find(x => !x.meta); return s ? s.slot : null; };
  Saves.activeSlot = () => Number(lsGet(ACTIVE)) || null;
  Saves.latest = function () {
    const list = Saves.list().filter(x => x.meta && !x.meta.broken);
    if (!list.length) return null;
    const a = list.find(x => x.slot === Saves.activeSlot());
    return a || list.sort((x, y) => (y.meta.updated || 0) - (x.meta.updated || 0))[0];
  };

  function metaFor() {
    const g = UI.state.game, s = UI.state.save;
    const L = UI.state.L;
    return {
      app: APP, version: 2, name: s.name, userTeam: g.userTeam,
      created: s.created, updated: Date.now(),
      year: g.year, phase: g.phase, seasonPhase: g.season ? g.season.phase : null,
      day: g.season ? g.season.day || 0 : 0,
      date: L && L.currentDate ? L.currentDate(g) : null,
      record: UI.record(g.userTeam)
    };
  }

  // ---------- write and read ----------
  let writing = Promise.resolve();
  Saves.write = function () {
    const st = UI.state;
    if (!st.game || !st.slot || !st.save) return Promise.resolve(false);
    const slot = st.slot, game = st.game;
    const meta = metaFor();
    st.save.updated = meta.updated;
    // Writes are queued so two quick sims never interleave.
    writing = writing.then(async () => {
      try {
        await idb('readwrite', store => store.put(game, key(slot)));
      } catch (e) {
        // Fall back to a JSON copy if the state holds something structured clone rejects.
        await idb('readwrite', store => store.put(JSON.parse(JSON.stringify(game)), key(slot)));
      }
      lsSet(key(slot), JSON.stringify(meta));
      lsSet(ACTIVE, String(slot));
      return true;
    }).catch(e => {
      console.warn('Save failed', e);
      UI.toast('Could not save: ' + (e && e.message ? e.message : e) + ' Export the league from the Saves page to keep it.', 'error');
      return false;
    });
    return writing;
  };

  Saves.read = async function (slot) {
    const game = await idb('readonly', store => store.get(key(slot)));
    if (!game) return null;
    let meta = null;
    try { meta = JSON.parse(lsGet(key(slot)) || 'null'); } catch (e) { meta = null; }
    return { meta: meta || {}, game };
  };

  // Accepts an export file ({ app, name, state }) or a bare league state.
  Saves.unwrap = function (obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.state && typeof obj.state === 'object') return { name: obj.name, created: obj.created, game: obj.state };
    if (obj.players && obj.teams && obj.season) return { name: null, created: null, game: obj };
    return null;
  };
  Saves.validate = function (game) {
    if (!game || typeof game !== 'object') return 'Not a save file.';
    if (!game.players || !game.teams) return 'This file has no league data (players and teams).';
    if (!game.season || typeof game.season !== 'object') return 'This file has no season data.';
    if (!game.userTeam || !game.teams[game.userTeam]) return 'This file has no valid user team.';
    return null;
  };

  Saves.activate = function (slot, game, info) {
    if (!Array.isArray(game.events)) game.events = [];
    // Bring older saves up to date (local logos, deduped news, new fields)
    if (window.LEAGUE && typeof LEAGUE.migrate === 'function') { try { LEAGUE.migrate(game); } catch (e) { console.warn('migrate failed', e); } }
    UI.state.slot = slot;
    UI.state.game = game;
    UI.state.save = {
      name: (info && info.name) || (UI.team(game.userTeam).name + ' Association'),
      created: (info && info.created) || Date.now(),
      updated: (info && info.updated) || Date.now()
    };
    UI.bump();
  };

  Saves.load = async function (slot) {
    const rec = await Saves.read(slot);
    if (!rec) throw new Error('Slot ' + slot + ' has no league data in this browser.');
    const err = Saves.validate(rec.game);
    if (err) throw new Error(err);
    Saves.activate(slot, rec.game, rec.meta);
    lsSet(ACTIVE, String(slot));
  };

  Saves.remove = async function (slot) {
    lsDel(key(slot));
    if (Saves.activeSlot() === slot) lsDel(ACTIVE);
    if (UI.state.slot === slot) { UI.state.slot = null; UI.state.save = null; UI.state.game = null; UI.bump(); }
    try { await idb('readwrite', store => store.delete(key(slot))); } catch (e) { console.warn('Delete failed', e); }
  };

  Saves.rename = async function (slot, name) {
    name = String(name || '').trim().slice(0, 40) || 'My Association';
    if (UI.state.slot === slot && UI.state.save) {
      UI.state.save.name = name;
      return Saves.write();
    }
    const raw = lsGet(key(slot));
    if (!raw) return false;
    const meta = JSON.parse(raw);
    meta.name = name;
    return lsSet(key(slot), JSON.stringify(meta));
  };

  Saves.exportFile = async function (slot) {
    if (UI.state.slot === slot) await writing;
    const rec = await Saves.read(slot);
    if (!rec) throw new Error('Nothing to export in slot ' + slot + '.');
    const name = rec.meta.name || 'save';
    const file = { app: APP, version: 2, name, created: rec.meta.created || null, exported: Date.now(), state: rec.game };
    const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'save';
    const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '2k13-association-' + slug + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  Saves.importFile = async function (file, slot) {
    let obj;
    try { obj = JSON.parse(await file.text()); } catch (e) { throw new Error('That file is not valid JSON.'); }
    const u = Saves.unwrap(obj);
    if (!u) throw new Error('That file is not a 2K13 Association save.');
    const err = Saves.validate(u.game);
    if (err) throw new Error(err);
    Saves.activate(slot, u.game, { name: u.name, created: u.created });
    const ok = await Saves.write();
    if (!ok) throw new Error('Could not write the save to browser storage.');
  };

  // Start a new league in a slot.
  Saves.create = async function (slot, name, userTeam) {
    const game = UI.state.L.newLeague(userTeam);
    Saves.activate(slot, game, { name, created: Date.now() });
    await Saves.write();
  };
})();
