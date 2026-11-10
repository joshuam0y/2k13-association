// Sound effects, made in the browser with Web Audio (no files, nothing to download, no ads): the swish, the
// rim, the whistle, the buzzer, the crowd, the wheel's clicks and the pick chime. window.SFX.
//   SFX.play(name)   swish | three | rim | whistle | buzzer | crowd | tick | chime | land
//   SFX.on / SFX.set(bool)   the switch, kept in this browser (on unless turned off)
(function () {
  'use strict';
  const KEY = 'a13-sfx';
  let on = true, ctx = null, noiseBuf = null;
  try { on = localStorage.getItem(KEY) !== '0'; } catch (e) { /* private mode */ }
  function ac() {
    if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ctx = new A(); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  // phones only let a page make sound after a tap
  document.addEventListener('pointerdown', () => { if (on) ac(); }, { once: true, capture: true });
  function noise(c) {
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = c.createBufferSource(); s.buffer = noiseBuf; return s;
  }
  // a gain that rises to peak in a seconds and falls away over d seconds
  function env(c, t, a, peak, d) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    g.connect(c.destination); return g;
  }
  function tone(c, t, type, f, a, peak, d, f2) {
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    o.connect(env(c, t, a, peak, d)); o.start(t); o.stop(t + a + d + 0.05);
  }
  function hiss(c, t, type, f, q, a, peak, d) {
    const s = noise(c), fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    s.connect(fl); fl.connect(env(c, t, a, peak, d)); s.start(t, Math.random()); s.stop(t + a + d + 0.05);
  }
  const SOUNDS = {
    swish: (c, t) => { hiss(c, t, 'bandpass', 4200, 0.7, 0.02, 0.22, 0.22); hiss(c, t + 0.05, 'highpass', 6000, 0.5, 0.01, 0.06, 0.12); },
    three: (c, t) => { SOUNDS.swish(c, t); hiss(c, t + 0.15, 'bandpass', 900, 0.4, 0.25, 0.12, 1.1); },
    rim: (c, t) => { tone(c, t, 'triangle', 520, 0.003, 0.12, 0.25); tone(c, t, 'sine', 1310, 0.003, 0.05, 0.16); },
    whistle: (c, t) => {
      const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain();
      o.type = 'sine'; o.frequency.value = 2900; lfo.frequency.value = 38; lg.gain.value = 140;
      lfo.connect(lg); lg.connect(o.frequency); o.connect(env(c, t, 0.02, 0.07, 0.34));
      o.start(t); lfo.start(t); o.stop(t + 0.42); lfo.stop(t + 0.42);
    },
    buzzer: (c, t) => {
      const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1600; fl.connect(env(c, t, 0.02, 0.09, 0.75));
      [196, 199].forEach(f => { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(fl); o.start(t); o.stop(t + 0.82); });
    },
    crowd: (c, t) => { hiss(c, t, 'bandpass', 850, 0.35, 0.35, 0.2, 1.8); hiss(c, t + 0.1, 'bandpass', 2200, 0.6, 0.3, 0.06, 1.4); },
    tick: (c, t) => tone(c, t, 'square', 1900, 0.001, 0.035, 0.025),
    chime: (c, t) => { tone(c, t, 'sine', 880, 0.005, 0.12, 0.25); tone(c, t + 0.09, 'sine', 1320, 0.005, 0.1, 0.35); },
    land: (c, t) => { [660, 880, 1320].forEach((f, i) => tone(c, t + i * 0.08, 'triangle', f, 0.005, 0.11, 0.4)); }
  };
  const last = {};
  function play(name) {
    if (!on || !SOUNDS[name]) return;
    const now = Date.now();
    if (last[name] && now - last[name] < 55) return;   // 4X speed would pile them up
    last[name] = now;
    const c = ac();
    if (!c) return;
    try { SOUNDS[name](c, c.currentTime + 0.01); } catch (e) { /* no sound is fine */ }
  }
  window.SFX = {
    play,
    get on() { return on; },
    set(v) { on = !!v; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* private mode */ } if (on) { ac(); play('chime'); } }
  };
})();
