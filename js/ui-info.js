/* About, Contact, FAQ, Privacy, Terms and Disclaimer pages. They need no league, so they open from the
   home footer and the INFO group in the menu. Routes: #/about #/contact #/faq #/privacy #/terms #/disclaimer.
   CONTACT_FORM posts to FormSubmit, which emails the owner (the first message needs a one time activation click in that inbox). */
(function () {
  'use strict';
  const UI = window.UI;
  if (!UI) return;
  const P = UI.pages = UI.pages || {};
  const CONTACT_FORM = 'https://formsubmit.co/jmoy2077@gmail.com';
  const REPO = 'https://github.com/joshuam0y/starting-five';
  const UPDATED = 'November 12, 2026';

  const PAGES = {
    about: ['ABOUT', `
      <p><b>Starting Five</b> is a free basketball sim made by <b>Joshua Moy</b>. It started as a love letter to NBA 2K13 and grew into six ways to play:</p>
      <ul><li><b>Season Mode.</b> Draft five players from any season, or from all of NBA history, and sim a full season.</li>
      <li><b>Head to Head.</b> Draft against a friend, online or on one phone, and play a series.</li>
      <li><b>Daily.</b> A new theme every day, like the 2014-15 Hawks or the best centers ever. A solo auction against the house, no account needed.</li>
      <li><b>Ranked.</b> Find a match against another player online: an auction draft and a best of 7 series that moves a ladder from Bronze up to Legend.</li>
      <li><b>Tournament.</b> Four or eight friends draft on one device, or each on their own phone, and play a bracket.</li>
      <li><b>The Association.</b> A full franchise sim with trades, free agency, drafts and real history.</li></ul>
      <p>Ratings are estimates built from real stats and tuned to feel like the games. Nothing here is official.</p>
      <p>It is a hobby project. It has no ads and no cost. You can play without an account; an account is only needed for ranked play, friends and your profile.</p>`],
    contact: ['CONTACT', `
      <p>Found a bug, have an idea, or want something fixed? Tell me.</p>
      __FORM__
      <p><a class="btn btn-gold" href="${REPO}/issues/new" target="_blank" rel="noopener">REPORT AN ISSUE ON GITHUB</a></p>
      <p class="muted">Include the page you were on and what phone or browser you use. Please do not post personal information in a public issue.</p>`],
    faq: ['FAQ', `
      <h3>Is it free?</h3><p>Yes. There are no ads and no payments. An account is optional.</p>
      <h3>Do I need an account?</h3><p>Only for ranked play, getting your daily score on the board, friends and your profile. The daily, practice and everything else work as a guest.</p>
      <h3>Where is my progress saved?</h3><p>Leagues, Season Mode runs and settings are saved on your own device, in your browser. Clearing site data or switching browsers or phones starts you fresh. Your Association leagues live under LOAD. If you have an account, your ranked results, rating, friends and profile are saved online with it.</p>
      <h3>How does online Head to Head work?</h3><p>One player makes a room and shares the code or link. The other opens it on their phone. Both phones stay in sync while you draft and watch.</p>
      <h3>How does ranked work?</h3><p>Tap Ranked, then Find a match. You are paired with the closest rating searching, so higher ranks face tougher players. Bid on ten hidden players ($20 each, 24 seconds a bid), then play a best of 7. A win raises your rating, a loss lowers it.</p>
      <h3>What are the ranks?</h3><p>Everyone starts at 1200, the bottom of Silver. Bronze, Silver, Gold, Platinum, Diamond (III lowest, I highest), then Master, Grandmaster, Legend. You can drop too.</p>
      <h3>What if I disconnect or leave a ranked game?</h3><p>The game pauses and you have 90 seconds to rejoin. Miss it and you forfeit. Leaving on purpose gives your opponent 15 seconds. The lobby is free to leave.</p>
      <h3>Why can I not play the same person again?</h3><p>Each matchup counts once, so ratings cannot be farmed. A rematch is allowed if nobody new is searching, or you both ask.</p>
      <h3>Where do the ratings come from?</h3><p>They are built from real stats and fitted to the 2K13 scale. Old seasons are adjusted for the pace, rules and talent level of their era, so they are estimates.</p>
      <h3>Why does a player look different or have no photo?</h3><p>Photos come from public sources. If none is found, the site draws a face for that player.</p>
      <h3>Is it affiliated with the NBA or 2K?</h3><p>No. See the Disclaimer.</p>`],
    privacy: ['PRIVACY POLICY', `
      <p class="muted">Last updated ${UPDATED}.</p>
      <h3>The short version</h3><p>There are no ads and no tracking tools. You can play without an account and I collect nothing. If you make an account, I store the details listed below so ranked play, friends and profiles work. I never read your location.</p>
      <h3>What stays on your device</h3><p>Saved leagues, settings, your Head to Head rivalry record and your sound preference are stored in your browser on your own device. I never receive them. Clearing your browser data deletes them.</p>
      <h3>Accounts</h3><p>An account is optional. If you make one I keep: your <b>email</b> and a <b>password</b> (handled by the sign-in service, which stores the password only in scrambled form; I never see it), and your <b>username</b>. Your email is used only to sign in and reset your password, and is never shown to other players. You can also choose a <b>region</b> and a <b>team logo as a profile picture</b>.</p>
      <h3>What an account stores</h3><p>Your friends list, your ranked and Head to Head series (the opponent, the score, the date, and the five players you drafted), your ratings and rank, your rivalries, your daily auction scores, and a short timestamp that is refreshed while you are in a ranked game, which is only used to tell whether a player disconnected. Rooms that are waiting for a second player are listed for a couple of minutes and then removed.</p>
      <h3>What other players can see</h3><p>Your username, profile picture, region, ratings and rank, win and loss record, number of friends, the friends you share with them, your most used player, your record against them, and your scores on the daily board. Nothing else.</p>
      <h3>Guests</h3><p>A guest name is kept on your device and shown to the other player in a room. Guest rivalries only last for the browser session. If you play the daily as a guest, your score is sent without a name, tied to a random code stored in your browser, only so it counts in the day's average. It never appears on a board.</p>
      <h3>Your data</h3><p>The account data is kept with Supabase, a hosted database service. To have your account and its data deleted, ask on the Contact page from the email you signed up with.</p>
      <h3>Online Head to Head, tournaments and ranked rooms</h3><p>Online rooms pass messages between the phones through public relay servers. The messages are encrypted with a key made from your room code, so the relay cannot read your picks. Anyone who has your room code can join, so share it only with your opponent. The relay servers can see your network address, as any website does.</p>
      <h3>Other services the site loads</h3><p>The site is hosted on GitHub Pages. Accounts and ranked results use Supabase. Player photos and team logos load from public servers such as the NBA's image server and Basketball-Reference, and a small library loads from a public code host. Those services can see your network address and the files you ask for, under their own policies.</p>
      <h3>Children</h3><p>The site is a general audience sports game and does not ask for personal information from anyone.</p>
      <h3>Changes and questions</h3><p>If this changes, the date above changes. Questions go through the Contact page.</p>`],
    terms: ['TERMS OF USE', `
      <p class="muted">Last updated ${UPDATED}.</p>
      <p>By using this site you agree to these terms.</p>
      <h3>Use</h3><p>The site is free to play for personal, non commercial fun. Do not try to break it, overload it or use it to harass other people, and do not resell it.</p>
      <h3>As is</h3><p>It is provided as is, with no promise that it will always work, stay online or keep your saves. Back up anything you care about. Online play depends on public relay servers that may be down.</p>
      <h3>Accounts and fair play</h3><p>Use one account per person and a username that is not offensive or pretending to be someone else. Do not cheat: no win trading, no extra accounts to farm rating, and no exploiting bugs. Ranked results come from both players' phones, and I may remove results, reset ratings or close accounts that break these rules. In ranked, leaving or staying disconnected past the grace time is a forfeit and counts as a loss.</p>
      <h3>Not real</h3><p>Everything is a simulation. Ratings, results and stats are estimates for fun and are not real predictions or advice. Do not use it for betting.</p>
      <h3>Ownership</h3><p>The code and design are by Joshua Moy. Team names, logos, player names and photos belong to their owners (see the Disclaimer).</p>
      <h3>Changes</h3><p>I may change or remove features, and I may update these terms. Using the site after a change means you accept it.</p>`],
    disclaimer: ['DISCLAIMER', `
      <p>This is an independent fan project. It is <b>not affiliated with, endorsed by or connected to</b> the NBA, any NBA team, the players, the NBPA, 2K, Take-Two Interactive or Basketball-Reference.</p>
      <p>NBA, team names, logos and player names and likenesses are trademarks or property of their owners and are used here only to identify real teams and players in a free, non commercial game. Player photos are loaded from public sources and belong to their owners.</p>
      <p>NBA 2K is a trademark of Take-Two Interactive. Ratings in this game are my own estimates and are not official 2K ratings.</p>
      <p>Everything that happens in the game is simulated. If you are a rights holder and want something changed or removed, use the Contact page and I will respond.</p>`]
  };

  const LINKS = [['about', 'About'], ['faq', 'FAQ'], ['contact', 'Contact'], ['privacy', 'Privacy'], ['terms', 'Terms'], ['disclaimer', 'Disclaimer']];
  UI.infoLinks = () => LINKS.map(([r, l]) => `<a href="#/${r}">${l}</a>`).join('');

  function form() {
    if (!CONTACT_FORM) return '';
    return `<form class="inf-form" action="${CONTACT_FORM}" method="POST">
      <label>Your name<input name="name" required maxlength="80" autocomplete="name"></label>
      <label>Your email (so I can reply)<input name="email" type="email" required maxlength="120" autocomplete="email"></label>
      <label>Message<textarea name="message" required rows="5" maxlength="2000"></textarea></label>
      <input type="hidden" name="_subject" value="Message from the site contact form"><input type="hidden" name="_template" value="table"><input type="hidden" name="_next" value="https://joshuam0y.github.io/starting-five/#/contact"><input type="text" name="_honey" tabindex="-1" autocomplete="off" style="display:none">
      <button class="btn btn-gold" type="submit">SEND</button></form>`;
  }

  Object.keys(PAGES).forEach(key => {
    const fn = function (app) {
      const t = PAGES[key];
      app.innerHTML = UI.header(t[0]) + `<section class="inf">${t[1].replace('__FORM__', form())}
        <nav class="inf-nav">${UI.infoLinks()}</nav></section>`;
    };
    fn.navLabel = PAGES[key][0].replace(/^./, c => c).toLowerCase().replace(/^./, c => c.toUpperCase());
    P[key] = fn;
  });
  UI.INFO_ROUTES = Object.keys(PAGES);
})();
