-- Starting Five: profile stats, rivalries, the ranked ladder, daily auctions and open games.
-- Paste this whole file into the Supabase SQL editor (Project > SQL editor > New query) and press Run. It is safe to run twice.
-- It adds to the existing "profiles" table (id, username) and creates the rest.

-- ---------- profile extras ----------
alter table public.profiles add column if not exists region text;        -- 'US', 'US-MA', 'GB' ... picked by the player, never from a GPS
alter table public.profiles add column if not exists fav_era text;       -- null means "the era I play most"
alter table public.profiles add column if not exists best_lineup jsonb;  -- { names:[...], score, era, at }
alter table public.profiles add column if not exists best_score numeric;
alter table public.profiles add column if not exists avatar text;       -- a team abbreviation: the logo shown as the profile picture

-- ---------- series: both players report the result, it only counts when the two reports agree ----------
create table if not exists public.series_reports (
  id bigserial primary key,
  key text not null,                       -- room code + draft seed: one series per draft
  reporter uuid not null,
  opp uuid not null,
  my_wins int not null, opp_wins int not null,
  era text not null, style text not null default 'wheel', ranked boolean not null default false, best_of int not null default 5,
  lineup jsonb, score numeric,
  created_at timestamptz not null default now(),
  unique (key, reporter)
);
create table if not exists public.series (
  id bigserial primary key,
  key text not null unique,
  p1 uuid not null, p2 uuid not null,
  w1 int not null, w2 int not null,
  era text not null, style text not null, ranked boolean not null, best_of int not null,
  created_at timestamptz not null default now()
);
alter table public.series add column if not exists d1 int;   -- rating change of p1 and p2 in this series (ranked only)
alter table public.series add column if not exists d2 int;
create table if not exists public.rivalries (
  a uuid not null, b uuid not null,        -- a < b
  a_wins int not null default 0, b_wins int not null default 0,
  last_at timestamptz not null default now(),
  primary key (a, b), check (a < b)
);
create table if not exists public.ratings (
  user_id uuid not null, era text not null,
  rating int not null default 1200, peak int not null default 1200, games int not null default 0, wins int not null default 0, losses int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, era)
);
alter table public.ratings add column if not exists peak int not null default 1200;   -- the highest rating reached: it decides which rank icons are unlocked
update public.ratings set peak = greatest(peak, rating);
create table if not exists public.daily_scores (
  day date not null, era text not null, user_id uuid not null,
  score numeric not null, lineup jsonb, created_at timestamptz not null default now(),
  primary key (day, era, user_id)
);
alter table public.daily_scores add column if not exists pct numeric;   -- the score as a percentage of a perfect five that day (shown on profiles)
create table if not exists public.lobbies (
  code text primary key, host uuid not null, host_name text not null,
  era text not null, style text not null, ranked boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.lobbies add column if not exists created_at timestamptz not null default now();

create table if not exists public.ranked_starts (
  key text not null, uid uuid not null, opp uuid not null,
  era text not null, style text not null default 'auction', ranked boolean not null default true, best_of int not null default 7,
  created_at timestamptz not null default now(),
  primary key (key, uid)
);
alter table public.ranked_starts enable row level security;
alter table public.series_reports enable row level security;
alter table public.series enable row level security;
alter table public.rivalries enable row level security;
alter table public.ratings enable row level security;
alter table public.daily_scores enable row level security;
alter table public.lobbies enable row level security;

drop policy if exists "series mine" on public.series;
create policy "series mine" on public.series for select using (auth.uid() = p1 or auth.uid() = p2);
drop policy if exists "rivalries mine" on public.rivalries;
create policy "rivalries mine" on public.rivalries for select using (auth.uid() = a or auth.uid() = b);
drop policy if exists "ratings read" on public.ratings;
create policy "ratings read" on public.ratings for select using (true);
drop policy if exists "reports mine" on public.series_reports;
create policy "reports mine" on public.series_reports for select using (auth.uid() = reporter);
-- no insert/update policies: everything is written by the functions below
grant select on public.series, public.rivalries, public.ratings, public.series_reports to authenticated;
grant select on public.ratings to anon;

-- ---------- when two reports agree: the series, the rivalry, the ratings, the best lineup ----------
create or replace function public.finalize_series(p_key text) returns void
language plpgsql security definer set search_path = public as $$
declare r1 public.series_reports; r2 public.series_reports; n int; ua uuid; ub uuid; aw int; bw int;
        ra int; rb int; na int; nb int; ea numeric; sa numeric; k int := 32;
begin
  select * into r1 from public.series_reports where key = p_key order by id limit 1;
  select * into r2 from public.series_reports where key = p_key and reporter <> r1.reporter order by id limit 1;
  if r1.id is null or r2.id is null then return; end if;
  if r1.opp <> r2.reporter or r2.opp <> r1.reporter or r1.my_wins <> r2.opp_wins or r1.opp_wins <> r2.my_wins or r1.era <> r2.era then return; end if;
  if r1.my_wins = r1.opp_wins then return; end if;
  insert into public.series (key, p1, p2, w1, w2, era, style, ranked, best_of)
    values (p_key, r1.reporter, r2.reporter, r1.my_wins, r1.opp_wins, r1.era, r1.style, (r1.ranked and r2.ranked), r1.best_of)
    on conflict (key) do nothing;
  get diagnostics n = row_count;
  if n = 0 then return; end if;
  -- the rivalry: one row a pair, a < b
  ua := least(r1.reporter, r2.reporter); ub := greatest(r1.reporter, r2.reporter);
  aw := case when r1.reporter = ua then (case when r1.my_wins > r1.opp_wins then 1 else 0 end) else (case when r1.my_wins < r1.opp_wins then 1 else 0 end) end;
  bw := 1 - aw;
  insert into public.rivalries (a, b, a_wins, b_wins) values (ua, ub, aw, bw)
    on conflict (a, b) do update set a_wins = public.rivalries.a_wins + aw, b_wins = public.rivalries.b_wins + bw, last_at = now();
  -- the ladder, only when both asked for a ranked series
  if r1.ranked and r2.ranked then
    insert into public.ratings (user_id, era) values (r1.reporter, r1.era), (r2.reporter, r1.era) on conflict do nothing;
    select rating into ra from public.ratings where user_id = r1.reporter and era = r1.era;
    select rating into rb from public.ratings where user_id = r2.reporter and era = r1.era;
    ea := 1 / (1 + power(10, (rb - ra) / 400.0));
    sa := case when r1.my_wins > r1.opp_wins then 1 else 0 end;
    na := round(ra + k * (sa - ea)); nb := round(rb + k * ((1 - sa) - (1 - ea)));
    update public.ratings set rating = na, peak = greatest(peak, na), games = games + 1, wins = wins + sa::int, losses = losses + (1 - sa)::int, updated_at = now() where user_id = r1.reporter and era = r1.era;
    update public.ratings set rating = nb, peak = greatest(peak, nb), games = games + 1, wins = wins + (1 - sa)::int, losses = losses + sa::int, updated_at = now() where user_id = r2.reporter and era = r1.era;
    update public.series set d1 = na - ra, d2 = nb - rb where key = p_key;
  end if;
  -- each player's best lineup so far
  update public.profiles p set best_score = r1.score, best_lineup = r1.lineup where p.id = r1.reporter and r1.score is not null and (p.best_score is null or r1.score > p.best_score);
  update public.profiles p set best_score = r2.score, best_lineup = r2.lineup where p.id = r2.reporter and r2.score is not null and (p.best_score is null or r2.score > p.best_score);
end $$;

create or replace function public.report_series(p_key text, p_opp text, p_my_wins int, p_opp_wins int, p_era text, p_style text, p_ranked boolean, p_best_of int, p_lineup jsonb, p_score numeric)
returns boolean language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); oid uuid;
begin
  if me is null then return false; end if;
  perform public.settle_abandoned();
  select id into oid from public.profiles where lower(username) = lower(p_opp);
  if oid is null or oid = me then return false; end if;
  if p_my_wins < 0 or p_opp_wins < 0 or p_my_wins > 4 or p_opp_wins > 4 then return false; end if;
  insert into public.series_reports (key, reporter, opp, my_wins, opp_wins, era, style, ranked, best_of, lineup, score)
    values (p_key, me, oid, p_my_wins, p_opp_wins, p_era, coalesce(p_style, 'wheel'), coalesce(p_ranked, false), coalesce(p_best_of, 5), p_lineup, p_score)
    on conflict (key, reporter) do nothing;
  perform public.finalize_series(p_key);
  return true;
end $$;

-- ---------- leaderboards ----------
create or replace function public.lb_ratings(p_era text, p_region text default null, p_limit int default 50)
returns table (username text, region text, rating int, games int, wins int, losses int)
language plpgsql security definer set search_path = public as $$
begin
  perform public.settle_abandoned();
  return query
  select p.username, p.region, r.rating, r.games, r.wins, r.losses
  from public.ratings r join public.profiles p on p.id = r.user_id
  where r.era = p_era and r.games > 0 and (p_region is null or p_region = '' or p.region = p_region or p.region like p_region || '-%')
  order by r.rating desc, r.games desc limit least(greatest(p_limit, 1), 100);
end $$;

create or replace function public.lb_daily(p_day date, p_era text, p_region text default null, p_limit int default 50)
returns table (username text, region text, score numeric, lineup jsonb)
language sql security definer set search_path = public as $$
  select p.username, p.region, d.score, d.lineup
  from public.daily_scores d join public.profiles p on p.id = d.user_id
  where d.day = p_day and d.era = p_era and (p_region is null or p_region = '' or p.region = p_region or p.region like p_region || '-%')
  order by d.score desc, d.created_at asc limit least(greatest(p_limit, 1), 100)
$$;

-- one daily score a player, era and day; the day has to be today (UTC) give or take one
drop function if exists public.submit_daily(date, text, numeric, jsonb);
create or replace function public.submit_daily(p_day date, p_era text, p_score numeric, p_lineup jsonb, p_pct numeric default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n int;
begin
  if me is null or p_score is null or p_score < 0 or p_score > 130 then return false; end if;
  if p_pct is not null and (p_pct < 0 or p_pct > 100) then p_pct := null; end if;
  if abs(p_day - (now() at time zone 'America/Los_Angeles')::date) > 1 then return false; end if;
  insert into public.daily_scores (day, era, user_id, score, lineup, pct) values (p_day, p_era, me, p_score, p_lineup, p_pct) on conflict do nothing;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- ---------- open games: a host listed for a couple of minutes while the room waits ----------
create or replace function public.lobby_up(p_code text, p_era text, p_style text, p_ranked boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); nm text;
begin
  if me is null then return; end if;
  select username into nm from public.profiles where id = me;
  if nm is null then return; end if;
  delete from public.lobbies where host = me and code <> p_code;
  insert into public.lobbies (code, host, host_name, era, style, ranked, updated_at) values (upper(p_code), me, nm, p_era, p_style, coalesce(p_ranked, false), now())
    on conflict (code) do update set updated_at = now(), era = excluded.era, style = excluded.style, ranked = excluded.ranked where public.lobbies.host = me;
end $$;
create or replace function public.lobby_down(p_code text) returns void
language sql security definer set search_path = public as $$ delete from public.lobbies where code = upper(p_code) and host = auth.uid() $$;
drop function if exists public.lobby_list();
create or replace function public.lobby_list() returns table (code text, host_name text, era text, style text, ranked boolean, rating int, age int)
language sql security definer set search_path = public as $$
  select l.code, l.host_name, l.era, l.style, l.ranked, coalesce(r.rating, 1200), extract(epoch from now() - l.created_at)::int
  from public.lobbies l left join public.ratings r on r.user_id = l.host and r.era = l.era
  where l.updated_at > now() - interval '90 seconds' order by l.updated_at desc limit 30
$$;

grant execute on function public.report_series(text, text, int, int, text, text, boolean, int, jsonb, numeric) to authenticated;
grant execute on function public.submit_daily(date, text, numeric, jsonb, numeric) to authenticated;
grant execute on function public.lobby_up(text, text, text, boolean) to authenticated;
grant execute on function public.lobby_down(text) to authenticated;
grant execute on function public.lobby_list() to authenticated, anon;
grant execute on function public.lb_ratings(text, text, int) to authenticated, anon;
grant execute on function public.lb_daily(date, text, text, int) to authenticated, anon;
revoke execute on function public.finalize_series(text) from public, anon, authenticated;

-- ---------- a ranked series that one player walks away from ----------
-- Both phones log the start when the draft is done. If one player then reports the result and the other never does (left, closed the app),
-- the result counts after 15 minutes: leaving does not save you from a loss. Runs whenever the ladder or a profile is read, or a result is reported.
create or replace function public.start_series(p_key text, p_opp text, p_era text, p_style text, p_ranked boolean, p_best_of int) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); oid uuid;
begin
  if me is null then return false; end if;
  select id into oid from public.profiles where lower(username) = lower(p_opp);
  if oid is null or oid = me then return false; end if;
  insert into public.ranked_starts (key, uid, opp, era, style, ranked, best_of)
    values (p_key, me, oid, p_era, coalesce(p_style, 'auction'), coalesce(p_ranked, false), coalesce(p_best_of, 7)) on conflict do nothing;
  return true;
end $$;

create or replace function public.settle_abandoned() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select rp.key, rp.reporter, rp.opp, rp.my_wins, rp.opp_wins, rp.era, rp.style, rp.ranked, rp.best_of
    from public.series_reports rp
    where not exists (select 1 from public.series s where s.key = rp.key)
      and not exists (select 1 from public.series_reports o where o.key = rp.key and o.reporter = rp.opp)
      and exists (select 1 from public.ranked_starts a where a.key = rp.key and a.uid = rp.reporter and a.opp = rp.opp and a.created_at < now() - interval '15 minutes')
      and exists (select 1 from public.ranked_starts b where b.key = rp.key and b.uid = rp.opp and b.opp = rp.reporter)
  loop
    insert into public.series_reports (key, reporter, opp, my_wins, opp_wins, era, style, ranked, best_of)
      values (r.key, r.opp, r.reporter, r.opp_wins, r.my_wins, r.era, r.style, r.ranked, r.best_of) on conflict do nothing;
    perform public.finalize_series(r.key);
  end loop;
end $$;
grant execute on function public.start_series(text, text, text, text, boolean, int) to authenticated;
revoke execute on function public.settle_abandoned() from public, anon, authenticated;

-- ---------- viewing another player's profile: only totals, never their private rows ----------
create or replace function public.public_profile(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare prof public.profiles; me uuid := auth.uid(); w int; t int; auto text; rat jsonb; most jsonb; vs jsonb; fr text; ua uuid; ub uuid; nf int; nm int := 0; mut jsonb := '[]'::jsonb; dp jsonb; bs int; cs int;
begin
  perform public.settle_abandoned();
  select * into prof from public.profiles where lower(username) = lower(p_name);
  if prof.id is null then return null; end if;
  select count(*) filter (where (p1 = prof.id and w1 > w2) or (p2 = prof.id and w2 > w1)), count(*) into w, t from public.series where p1 = prof.id or p2 = prof.id;
  select era into auto from public.series where p1 = prof.id or p2 = prof.id group by era order by count(*) desc, era limit 1;
  -- ratings with their place on each era's ladder
  select coalesce(jsonb_agg(jsonb_build_object('era', r.era, 'rating', r.rating, 'games', r.games, 'wins', r.wins, 'losses', r.losses,
      'rank', (select count(*) + 1 from public.ratings r2 where r2.era = r.era and r2.games > 0 and r2.rating > r.rating),
      'of', (select count(*) from public.ratings r3 where r3.era = r.era and r3.games > 0)) order by r.rating desc), '[]'::jsonb) into rat
    from public.ratings r where r.user_id = prof.id and r.games > 0;
  select coalesce(jsonb_agg(jsonb_build_object('name', nm2, 'season', se, 'count', c) order by c desc, nm2), '[]'::jsonb) into most from (
    select n.value as nm2, coalesce(nullif(s.value, 'null')::int, 0) as se, count(*) as c
    from public.series_reports r
    cross join lateral jsonb_array_elements_text(coalesce(r.lineup -> 'names', '[]'::jsonb)) with ordinality as n(value, ord)
    left join lateral jsonb_array_elements_text(coalesce(r.lineup -> 'seasons', '[]'::jsonb)) with ordinality as s(value, ord) on s.ord = n.ord
    where r.reporter = prof.id group by 1, 2 order by c desc, nm2 limit 5) x;
  -- friends: how many they have, and the ones you share
  select count(*) into nf from public.friendships where status = 'accepted' and (requester = prof.id or addressee = prof.id);
  if me is not null and me <> prof.id then
    ua := least(me, prof.id); ub := greatest(me, prof.id);
    select jsonb_build_object('me', case when me = ua then a_wins else b_wins end, 'them', case when me = ua then b_wins else a_wins end) into vs from public.rivalries where a = ua and b = ub;
    select case when f.status = 'accepted' then 'friends' when f.requester = me then 'sent' else 'incoming' end into fr from public.friendships f where (f.requester = me and f.addressee = prof.id) or (f.requester = prof.id and f.addressee = me) limit 1;
    select count(*), coalesce(jsonb_agg(u.username order by u.username), '[]'::jsonb) into nm, mut from public.profiles u where u.id in (
      select case when requester = prof.id then addressee else requester end from public.friendships where status = 'accepted' and (requester = prof.id or addressee = prof.id)
      intersect
      select case when requester = me then addressee else requester end from public.friendships where status = 'accepted' and (requester = me or addressee = me));
  end if;
  -- the daily auction: how many, the percentages, and the streaks (days in a row)
  select jsonb_build_object('played', count(*), 'avg_pct', round(avg(pct), 1), 'best_pct', round(max(pct), 1), 'avg_score', round(avg(score), 1), 'best_score', max(score)) into dp from public.daily_scores where user_id = prof.id;
  with d as (select distinct day from public.daily_scores where user_id = prof.id), g as (select day, day - (row_number() over (order by day))::int as grp from d)
    select coalesce(max(c), 0) into bs from (select count(*) c from g group by grp) x;
  with d as (select distinct day from public.daily_scores where user_id = prof.id), g as (select day, day - (row_number() over (order by day))::int as grp from d)
    select coalesce(count(*), 0) into cs from g where grp = (select grp from g where day >= (now() at time zone 'America/Los_Angeles')::date - 1 order by day desc limit 1);
  return jsonb_build_object('daily', dp || jsonb_build_object('best_streak', bs, 'streak', cs), 'username', prof.username, 'avatar', prof.avatar, 'region', prof.region, 'fav_era', prof.fav_era, 'auto_era', auto, 'best_score', prof.best_score, 'best_lineup', prof.best_lineup,
    'wins', w, 'losses', t - w, 'ratings', rat, 'most', most, 'vs', vs, 'friend', fr, 'self', me = prof.id, 'friends', nf, 'mutual', mut, 'mutual_count', nm);
end $$;
grant execute on function public.public_profile(text) to authenticated, anon;

-- ---------- a player who stays gone past the grace time forfeits ----------
-- Both phones ping every ten seconds while a ranked game is on. A forfeit win only works when the other player's pings stopped over a minute
-- ago and yours are still coming, so nobody can claim a win against a player who is still there.
create table if not exists public.ranked_presence (key text not null, uid uuid not null, seen_at timestamptz not null default now(), primary key (key, uid));
alter table public.ranked_presence enable row level security;
create or replace function public.ranked_ping(p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if not exists (select 1 from public.ranked_starts where key = p_key and uid = auth.uid()) then return; end if;
  insert into public.ranked_presence (key, uid, seen_at) values (p_key, auth.uid(), now())
    on conflict (key, uid) do update set seen_at = now();
end $$;
grant execute on function public.ranked_ping(text) to authenticated;

create or replace function public.forfeit_series(p_key text) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); a public.ranked_starts; need int; mine timestamptz; theirs timestamptz;
begin
  if me is null then return false; end if;
  select * into a from public.ranked_starts where key = p_key and uid = me;
  if a.key is null or not a.ranked then return false; end if;
  if not exists (select 1 from public.ranked_starts b where b.key = p_key and b.uid = a.opp and b.opp = me) then return false; end if;
  if exists (select 1 from public.series s where s.key = p_key) then return false; end if;
  if exists (select 1 from public.series_reports r where r.key = p_key) then return false; end if;
  select seen_at into mine from public.ranked_presence where key = p_key and uid = me;
  select seen_at into theirs from public.ranked_presence where key = p_key and uid = a.opp;
  if mine is null or mine < now() - interval '40 seconds' then return false; end if;
  if coalesce(theirs, a.created_at) > now() - interval '60 seconds' then return false; end if;
  need := (a.best_of + 1) / 2;
  insert into public.series_reports (key, reporter, opp, my_wins, opp_wins, era, style, ranked, best_of)
    values (p_key, me, a.opp, need, 0, a.era, a.style, true, a.best_of),
           (p_key, a.opp, me, 0, need, a.era, a.style, true, a.best_of) on conflict do nothing;
  perform public.finalize_series(p_key);
  return true;
end $$;
grant execute on function public.forfeit_series(text) to authenticated;

-- ---------- giving up a ranked series: a loss for you, a win for the other player ----------
create or replace function public.concede_series(p_key text) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); a public.ranked_starts; need int;
begin
  if me is null then return false; end if;
  select * into a from public.ranked_starts where key = p_key and uid = me;
  if a.key is null or not a.ranked then return false; end if;
  if not exists (select 1 from public.ranked_starts b where b.key = p_key and b.uid = a.opp and b.opp = me) then return false; end if;
  if exists (select 1 from public.series s where s.key = p_key) then return false; end if;
  if exists (select 1 from public.series_reports r where r.key = p_key) then return false; end if;
  need := (a.best_of + 1) / 2;
  insert into public.series_reports (key, reporter, opp, my_wins, opp_wins, era, style, ranked, best_of)
    values (p_key, me, a.opp, 0, need, a.era, a.style, true, a.best_of),
           (p_key, a.opp, me, need, 0, a.era, a.style, true, a.best_of) on conflict do nothing;
  perform public.finalize_series(p_key);
  return true;
end $$;
grant execute on function public.concede_series(text) to authenticated;

-- ---------- who is online in each mode ----------
create or replace function public.queue_ping() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.ranked_presence (key, uid, seen_at) values ('queue', auth.uid(), now())
    on conflict (key, uid) do update set seen_at = now();
end $$;
grant execute on function public.queue_ping() to authenticated;
create or replace function public.online_counts() returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'searching', (select count(*) from public.ranked_presence where key = 'queue' and seen_at > now() - interval '20 seconds'),
    'ranked', (select count(distinct uid) from public.ranked_presence where key <> 'queue' and seen_at > now() - interval '40 seconds'),
    'casual', (select count(*) from public.lobbies where not ranked and updated_at > now() - interval '90 seconds'))
$$;
grant execute on function public.online_counts() to authenticated, anon;

-- ---------- which of your friends are searching for a ranked match right now ----------
create or replace function public.friends_searching() returns table (username text)
language sql security definer set search_path = public as $$
  select p.username from public.ranked_presence q join public.profiles p on p.id = q.uid
  where q.key = 'queue' and q.seen_at > now() - interval '25 seconds' and q.uid <> auth.uid()
    and exists (select 1 from public.friendships f where f.status = 'accepted'
      and ((f.requester = auth.uid() and f.addressee = q.uid) or (f.addressee = auth.uid() and f.requester = q.uid)))
$$;
grant execute on function public.friends_searching() to authenticated;

-- ---------- ending a season (run by hand when you decide to; nothing calls it) ----------
-- select public.reset_season(0.5);  pulls every rating halfway back to 1200 and clears the win and loss counts.
create or replace function public.reset_season(p_keep numeric default 0.5) returns void
language sql security definer set search_path = public as $$
  update public.ratings set rating = round(1200 + (rating - 1200) * p_keep), games = 0, wins = 0, losses = 0, updated_at = now()
$$;
revoke execute on function public.reset_season(numeric) from public, anon, authenticated;

-- ---------- reporting a player (read the reports in the Supabase table editor: user_reports) ----------
create table if not exists public.user_reports (
  id bigserial primary key, reporter uuid not null, target uuid not null, reason text not null, created_at timestamptz not null default now()
);
alter table public.user_reports enable row level security;
create or replace function public.report_user(p_name text, p_reason text) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t uuid;
begin
  if me is null then return false; end if;
  select id into t from public.profiles where lower(username) = lower(p_name);
  if t is null or t = me then return false; end if;
  if exists (select 1 from public.user_reports where reporter = me and target = t and created_at > now() - interval '1 day') then return false; end if;
  insert into public.user_reports (reporter, target, reason) values (me, t, left(coalesce(p_reason, 'OTHER'), 60));
  return true;
end $$;
grant execute on function public.report_user(text, text) to authenticated;
