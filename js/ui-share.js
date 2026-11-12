// Share Season (#/share): a picture of your season to send to friends. A 1080 x 1350 card drawn on a
// canvas: the team, record and conference rank, how the playoffs went, the best player's line and the
// awards your players won. Shared through the phone's share sheet when it can take files, else downloaded.
(function () {
  'use strict';
  // a soft white outline around a mostly black logo (the Nets, the Spurs) so it shows on the dark card
  // the credit, like the title card of a Spike Lee joint
  function joint(ctx, x, y) { ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(243,207,94,.85)'; ctx.font = 'italic 600 24px Oswald, Arial, sans-serif'; ctx.fillText('A JOSHUA MOY JOINT', x, y); ctx.restore(); }
  function glow(ctx, on) { if (on) { ctx.save(); ctx.shadowColor = 'rgba(255,255,255,.9)'; ctx.shadowBlur = 12; } return on; }
  const P = UI.pages, esc = UI.esc;
  const ROUND = ['THE FIRST ROUND', 'THE CONFERENCE SEMIFINALS', 'THE CONFERENCE FINALS', 'THE NBA FINALS'];
  const ORD = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] || 'TH');

  // what the card says, from the save
  function facts() {
    const g = UI.state.game, s = g && g.season, u = g && g.userTeam;
    if (!s || !u || !s.standings || !s.standings[u]) return null;
    const t = UI.team(u), st = s.standings[u], conf = t.conf || 'East';
    const confTeams = Object.keys(s.standings).filter(a => (UI.team(a).conf || 'East') === conf);
    const pct = a => { const x = s.standings[a]; return x.w + x.l ? x.w / (x.w + x.l) : 0; };
    confTeams.sort((a, b) => pct(b) - pct(a) || (s.standings[b].pf - s.standings[b].pa) - (s.standings[a].pf - s.standings[a].pa));
    const rank = confTeams.indexOf(u) + 1;
    let result = '', champ = false;
    const b = s.playoffs;
    if (b && b.rounds && b.rounds.length) {
      if (b.champion === u) { result = 'NBA CHAMPIONS'; champ = true; }
      else {
        let lost = null, alive = false;
        const off = 4 - (b.R || 4);   // the early leagues played fewer rounds
        b.rounds.forEach((round, r) => (round || []).forEach(x => {
          if (x.hi !== u && x.lo !== u) return;
          if (x.winner && x.winner !== u) lost = { r, opp: x.winner, w: x.hi === u ? x.hw : x.lw, l: x.hi === u ? x.lw : x.hw };
          else if (!x.winner) alive = { r };
        }));
        if (lost) result = 'LOST IN ' + ROUND[Math.min(3, lost.r + off)] + ' TO THE ' + UI.team(lost.opp).name.toUpperCase() + ' ' + lost.w + '-' + lost.l;
        else if (alive) result = 'ALIVE IN ' + ROUND[Math.min(3, alive.r + off)];
        else if (b.champion) result = 'MISSED THE PLAYOFFS';
        else result = 'PLAYOFFS UNDER WAY';
      }
    } else if (s.phase === 'regular') {
      const left = UI.games().filter(x => !x.playoff && !x.played && (x.home === u || x.away === u)).length;
      result = left ? left + ' GAMES TO GO' : 'REGULAR SEASON DONE';
    }
    // best player: most points per game with 10 or more games (or anyone, early on)
    const ps = s.playerStats || {};
    const mine = Object.keys(ps).filter(id => { const p = g.players[id]; return p && p.team === u && ps[id].g > 0; });
    const pts = id => ps[id].pts / ps[id].g;
    const pool = mine.filter(id => ps[id].g >= 10).length ? mine.filter(id => ps[id].g >= 10) : mine;
    pool.sort((a, c) => pts(c) - pts(a));
    const top = pool[0] ? g.players[pool[0]] : null, tl = top && ps[top.id];
    const line = tl ? [(tl.pts / tl.g).toFixed(1) + ' PTS', ((tl.oreb + tl.dreb) / tl.g).toFixed(1) + ' REB', (tl.ast / tl.g).toFixed(1) + ' AST'] : null;
    // awards this season (once handed out), for the user's players
    const H = g.history && g.history.seasons || [], last = H[H.length - 1];
    const awards = [];
    const AW = { mvp: 'MVP', dpoy: 'DEFENSIVE PLAYER OF THE YEAR', roy: 'ROOKIE OF THE YEAR', smoy: 'SIXTH MAN', mip: 'MOST IMPROVED' };
    if (last && last.year === g.year) {
      if (last.finalsMvp) { const id = typeof last.finalsMvp === 'string' ? last.finalsMvp : last.finalsMvp.id; const p = g.players[id]; if (p && p.team === u) awards.push('FINALS MVP: ' + p.name); }
      if (last.awards) Object.keys(AW).forEach(k => { const id = last.awards[k], p = typeof id === 'string' && g.players[id]; if (p && p.team === u) awards.push(AW[k] + ': ' + p.name); });
    }
    return { g, t, u, st, rank, conf, result, champ, top, line, awards: awards.slice(0, 3), label: UI.seasonLabel(g.year) };
  }

  function loadImg(src) {
    return new Promise(res => {
      if (!src) return res(null);
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => res(im); im.onerror = () => res(null);
      im.src = src;
      setTimeout(() => res(null), 4000);
    });
  }
  const fit = (ctx, text, max, size, weight) => {
    let s = size;
    do { ctx.font = `${weight || 700} ${s}px Oswald, 'Arial Narrow', Arial, sans-serif`; s -= 2; } while (ctx.measureText(text).width > max && s > 18);
  };

  async function draw(f) {
    const W = 1080, H = 1350, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'), c1 = (f.t.colors && f.t.colors[0]) || '#333', c2 = (f.t.colors && f.t.colors[1]) || '#999';
    if (document.fonts && document.fonts.load) { try { await Promise.all([document.fonts.load('700 40px Oswald'), document.fonts.load('500 40px Oswald')]); } catch (e) { /* system font */ } }
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, c1); bg.addColorStop(0.55, '#0a0a0a'); bg.addColorStop(1, '#000');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = c2; ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.arc(W - 120, 160, 420, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5c542'; ctx.font = "700 40px Oswald, Arial, sans-serif"; ctx.fillText('STARTING FIVE', W / 2, 90);
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = "500 34px Oswald, Arial, sans-serif"; ctx.fillText('THE ' + f.label + ' SEASON', W / 2, 140);
    const logo = await loadImg(f.t.logo);
    if (logo) { const s = 260, r = Math.min(s / logo.width, s / logo.height), g = glow(ctx, UI.darkLogo && UI.darkLogo(f.t)); ctx.drawImage(logo, W / 2 - logo.width * r / 2, 180 + (s - logo.height * r) / 2, logo.width * r, logo.height * r); if (g) ctx.restore(); }
    ctx.fillStyle = '#fff'; fit(ctx, (f.t.city + ' ' + f.t.name).toUpperCase(), W - 120, 76); ctx.fillText((f.t.city + ' ' + f.t.name).toUpperCase(), W / 2, 530);
    ctx.font = "700 190px Oswald, Arial, sans-serif"; ctx.fillStyle = '#fff'; ctx.fillText(f.st.w + '-' + f.st.l, W / 2, 720);
    ctx.font = "500 40px Oswald, Arial, sans-serif"; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText(ORD(f.rank) + ' IN THE ' + f.conf.toUpperCase(), W / 2, 780);
    if (f.result) {
      ctx.fillStyle = f.champ ? '#f5c542' : 'rgba(255,255,255,.1)'; ctx.fillRect(80, 820, W - 160, 96);
      ctx.fillStyle = f.champ ? '#111' : '#fff'; fit(ctx, f.result, W - 220, 50); ctx.fillText(f.result, W / 2, 885);
    }
    if (f.top) {
      const y0 = 960;
      ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(80, y0, W - 160, 210);
      const hs = (f.top.nbaId ? await loadImg('https://cdn.nba.com/headshots/nba/latest/260x190/' + f.top.nbaId + '.png') : null) || (UI.faceFor ? await loadImg(UI.faceFor(f.top, (f.t && f.t.colors && f.t.colors[0]) || '#444')) : null);   // a drawn face keeps the card shareable
      if (hs) ctx.drawImage(hs, 100, y0 + 20, 234, 171);
      ctx.textAlign = 'left'; const x = hs ? 360 : 120;
      ctx.fillStyle = '#f5c542'; ctx.font = "500 30px Oswald, Arial, sans-serif"; ctx.fillText('BEST PLAYER', x, y0 + 60);
      ctx.fillStyle = '#fff'; fit(ctx, f.top.name.toUpperCase(), W - x - 110, 64); ctx.fillText(f.top.name.toUpperCase(), x, y0 + 128);
      if (f.line) { ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = "500 36px Oswald, Arial, sans-serif"; ctx.fillText(f.line.join('   '), x, y0 + 180); }
      ctx.textAlign = 'center';
    }
    if (f.awards.length) {
      ctx.fillStyle = '#f5c542'; ctx.font = "500 32px Oswald, Arial, sans-serif";
      f.awards.forEach((a, i) => ctx.fillText(a.toUpperCase(), W / 2, 1220 + i * 40));
    }
    ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.font = "500 26px Oswald, Arial, sans-serif";
    ctx.fillText(location.host ? location.host.toUpperCase() + location.pathname.replace(/index\.html$/, '').toUpperCase() : 'STARTING FIVE', W / 2, H - 30);
    joint(ctx, W / 2, H - 68);
    return cv;
  }

  // A result card for any mode (Draft Challenge, versus): { kicker, title, big, banner, gold, lines: [[label, text]],
  // colors, logo }. Resolves to a PNG blob (null when the canvas cannot be read).
  UI.resultCard = async function (spec) {
    const W = 1080, H = 1350, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'), c1 = (spec.colors && spec.colors[0]) || '#333', c2 = (spec.colors && spec.colors[1]) || '#999';
    if (document.fonts && document.fonts.load) { try { await Promise.all([document.fonts.load('700 40px Oswald'), document.fonts.load('500 40px Oswald')]); } catch (e) { /* system font */ } }
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, c1); bg.addColorStop(0.55, '#0a0a0a'); bg.addColorStop(1, '#000');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = c2; ctx.globalAlpha = 0.16; ctx.beginPath(); ctx.arc(W - 120, 170, 420, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5c542'; ctx.font = '700 40px Oswald, Arial, sans-serif'; ctx.fillText('STARTING FIVE', W / 2, 90);
    ctx.fillStyle = 'rgba(255,255,255,.8)'; fit(ctx, spec.kicker || '', W - 120, 34, 500); ctx.fillText(spec.kicker || '', W / 2, 140);
    let y = 180;
    const lg = await loadImg(spec.logo);
    if (lg) { const sz = 220, r = Math.min(sz / lg.width, sz / lg.height), g = glow(ctx, UI.darkLogo && UI.darkLogo({ logo: spec.logo })); ctx.drawImage(lg, W / 2 - lg.width * r / 2, y + (sz - lg.height * r) / 2, lg.width * r, lg.height * r); if (g) ctx.restore(); }
    y = 470;
    ctx.fillStyle = '#fff'; fit(ctx, spec.title || '', W - 120, 72); ctx.fillText(spec.title || '', W / 2, y);
    if (spec.big) { ctx.font = '700 170px Oswald, Arial, sans-serif'; ctx.fillText(spec.big, W / 2, y + 175); }
    y += spec.big ? 215 : 40;
    if (spec.banner) {
      ctx.fillStyle = spec.gold ? '#f5c542' : 'rgba(255,255,255,.1)'; ctx.fillRect(80, y, W - 160, 92);
      ctx.fillStyle = spec.gold ? '#111' : '#fff'; fit(ctx, spec.banner, W - 220, 46); ctx.fillText(spec.banner, W / 2, y + 62);
      y += 130;
    }
    ctx.textAlign = 'left';
    (spec.lines || []).slice(0, 7).forEach((l, i) => {
      const ly = y + i * 62;
      ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(80, ly, W - 160, 52);
      ctx.fillStyle = '#f5c542'; ctx.font = '500 26px Oswald, Arial, sans-serif'; ctx.fillText(String(l[0] || ''), 100, ly + 36);
      ctx.fillStyle = '#fff'; fit(ctx, String(l[1] || ''), W - 360, 30, 500); ctx.fillText(String(l[1] || ''), 250, ly + 36);
    });
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.font = '500 26px Oswald, Arial, sans-serif';
    ctx.fillText((location.host + location.pathname.replace(/index\.html$/, '')).toUpperCase(), W / 2, H - 30);
    joint(ctx, W / 2, H - 68);
    return new Promise(res => { try { cv.toBlob(b => res(b), 'image/png'); } catch (e) { res(null); } });
  };
  // Shares a result the way phones do best: the picture plus the text and link in the share sheet (Messages,
  // Instagram, WhatsApp...), else the text and link, else copied to the clipboard.
  UI.shareResult = async function (spec, text, url, name) {
    const all = text + '\n' + url;
    try { navigator.clipboard.writeText(all).then(() => UI.toast('Copied. Paste it anywhere.'), () => {}); } catch (e) { /* no clipboard */ }   // copied first, inside the tap
    let blob = null;
    try { blob = await UI.resultCard(spec); } catch (e) { blob = null; }
    const file = blob ? new File([blob], (name || 'result') + '.png', { type: 'image/png' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: all }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    if (navigator.share) { try { await navigator.share({ title: 'Starting Five', text: all }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    if (blob && !(navigator.canShare)) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (name || 'result') + '.png'; document.body.appendChild(a); a.click(); a.remove(); }
  };
  UI.shareIcon = '<svg class="share-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  P.share = function (app) {
    const f = facts();
    if (!f) { app.innerHTML = UI.header('SHARE SEASON') + UI.empty('NO SEASON YET', 'Start or load an Association to make a season card.', '<div class="row-btns"><a class="btn" href="#/new">NEW LEAGUE</a></div>'); return; }
    app.innerHTML = UI.header('SHARE SEASON', 'A picture of your season to send to friends.') +
      `<div class="share-wrap"><div class="share-prev" id="shPrev"><div class="ch-spin-ring"></div></div>
      <div class="row-btns center"><button type="button" class="btn btn-gold" id="shGo">SHARE</button><button type="button" class="btn" id="shDl">DOWNLOAD</button></div></div>`;
    let blob = null, url = null;
    draw(f).then(cv => new Promise(res => {
      try { cv.toBlob(b => res({ cv, b }), 'image/png'); } catch (e) { res({ cv, b: null }); }   // a logo without CORS taints the canvas
    })).then(({ cv, b }) => {
      blob = b;
      const prev = UI.$('#shPrev', app);
      if (!prev) return;
      prev.innerHTML = '';
      if (b) { url = URL.createObjectURL(b); const im = document.createElement('img'); im.src = url; im.alt = 'Season card'; prev.appendChild(im); }
      else { cv.style.width = '100%'; prev.appendChild(cv); }
    });
    const name = () => (f.t.name + '-' + f.label + '.png').replace(/\s+/g, '-').toLowerCase();
    const download = () => { if (!url) return; const a = document.createElement('a'); a.href = url; a.download = name(); document.body.appendChild(a); a.click(); a.remove(); };
    UI.$('#shDl', app).addEventListener('click', download);
    UI.$('#shGo', app).addEventListener('click', async () => {
      if (!blob) { UI.toast('The card is still drawing.'); return; }
      const file = new File([blob], name(), { type: 'image/png' });
      const text = 'My ' + f.label + ' ' + f.t.name + ' on Starting Five: ' + f.st.w + '-' + f.st.l + (f.result ? ', ' + f.result.toLowerCase() : '') + '.';
      if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], text }); } catch (e) { /* closed */ } }
      else download();
    });
  };
  P.share.navLabel = 'Share Season';
})();
