-- Starting Five: profile stats, rivalries, the ranked ladder, daily auctions and open games.
-- Paste this whole file into the Supabase SQL editor (Project > SQL editor > New query) and press Run. It is safe to run twice.
-- It adds to the existing "profiles" table (id, username) and creates the rest.

-- ---------- profile extras ----------
alter table public.profiles add column if not exists region text;        -- 'US', 'US-MA', 'GB' ... picked by the player, never from a GPS
alter table public.profiles add column if not exists fav_era text;       -- null means "the era I play most"
alter table public.profiles add column if not exists best_lineup jsonb;  -- { names:[...], score, era, at }
alter table public.profiles add column if not exists best_score numeric;

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
create table if not exists public.rivalries (
  a uuid not null, b uuid not null,        -- a < b
  a_wins int not null default 0, b_wins int not null default 0,
  last_at timestamptz not null default now(),
  primary key (a, b), check (a < b)
);
create table if not exists public.ratings (
  user_id uuid not null, era text not null,
  rating int not null default 1200, games int not null default 0, wins int not null default 0, losses int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, era)
);
create table if not exists public.daily_scores (
  day date not null, era text not null, user_id uuid not null,
  score numeric not null, lineup jsonb, created_at timestamptz not null default now(),
  primary key (day, era, user_id)
);
create table if not exists public.lobbies (
  code text primary key, host uuid not null, host_name text not null,
  era text not null, style text not null, ranked boolean not null default false,
  updated_at timestamptz not null default now()
);

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
        ra int; rb int; ea numeric; sa numeric; k int := 32;
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
    update public.ratings set rating = round(ra + k * (sa - ea)), games = games + 1, wins = wins + sa::int, losses = losses + (1 - sa)::int, updated_at = now() where user_id = r1.reporter and era = r1.era;
    update public.ratings set rating = round(rb + k * ((1 - sa) - (1 - ea))), games = games + 1, wins = wins + (1 - sa)::int, losses = losses + sa::int, updated_at = now() where user_id = r2.reporter and era = r1.era;
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
language sql security definer set search_path = public as $$
  select p.username, p.region, r.rating, r.games, r.wins, r.losses
  from public.ratings r join public.profiles p on p.id = r.user_id
  where r.era = p_era and r.games > 0 and (p_region is null or p_region = '' or p.region = p_region or p.region like p_region || '-%')
  order by r.rating desc, r.games desc limit least(greatest(p_limit, 1), 100)
$$;

create or replace function public.lb_daily(p_day date, p_era text, p_region text default null, p_limit int default 50)
returns table (username text, region text, score numeric, lineup jsonb)
language sql security definer set search_path = public as $$
  select p.username, p.region, d.score, d.lineup
  from public.daily_scores d join public.profiles p on p.id = d.user_id
  where d.day = p_day and d.era = p_era and (p_region is null or p_region = '' or p.region = p_region or p.region like p_region || '-%')
  order by d.score desc, d.created_at asc limit least(greatest(p_limit, 1), 100)
$$;

-- one daily score a player, era and day; the day has to be today (UTC) give or take one
create or replace function public.submit_daily(p_day date, p_era text, p_score numeric, p_lineup jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n int;
begin
  if me is null or p_score is null or p_score < 0 or p_score > 130 then return false; end if;
  if abs(p_day - (now() at time zone 'utc')::date) > 1 then return false; end if;
  insert into public.daily_scores (day, era, user_id, score, lineup) values (p_day, p_era, me, p_score, p_lineup) on conflict do nothing;
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
create or replace function public.lobby_list() returns table (code text, host_name text, era text, style text, ranked boolean)
language sql security definer set search_path = public as $$
  select code, host_name, era, style, ranked from public.lobbies where updated_at > now() - interval '90 seconds' order by updated_at desc limit 30
$$;

grant execute on function public.report_series(text, text, int, int, text, text, boolean, int, jsonb, numeric) to authenticated;
grant execute on function public.submit_daily(date, text, numeric, jsonb) to authenticated;
grant execute on function public.lobby_up(text, text, text, boolean) to authenticated;
grant execute on function public.lobby_down(text) to authenticated;
grant execute on function public.lobby_list() to authenticated, anon;
grant execute on function public.lb_ratings(text, text, int) to authenticated, anon;
grant execute on function public.lb_daily(date, text, text, int) to authenticated, anon;
revoke execute on function public.finalize_series(text) from public, anon, authenticated;

-- ---------- viewing another player's profile: only totals, never their private rows ----------
create or replace function public.public_profile(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare prof public.profiles; me uuid := auth.uid(); w int; t int; auto text; rat jsonb; most jsonb; vs jsonb; fr text; ua uuid; ub uuid;
begin
  select * into prof from public.profiles where lower(username) = lower(p_name);
  if prof.id is null then return null; end if;
  select count(*) filter (where (p1 = prof.id and w1 > w2) or (p2 = prof.id and w2 > w1)), count(*) into w, t from public.series where p1 = prof.id or p2 = prof.id;
  select era into auto from public.series where p1 = prof.id or p2 = prof.id group by era order by count(*) desc, era limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('era', era, 'rating', rating, 'games', games, 'wins', wins, 'losses', losses) order by rating desc), '[]'::jsonb) into rat from public.ratings where user_id = prof.id and games > 0;
  select coalesce(jsonb_agg(jsonb_build_object('name', nm, 'season', se, 'count', c) order by c desc, nm), '[]'::jsonb) into most from (
    select n.value as nm, coalesce(nullif(s.value, 'null')::int, 0) as se, count(*) as c
    from public.series_reports r
    cross join lateral jsonb_array_elements_text(coalesce(r.lineup -> 'names', '[]'::jsonb)) with ordinality as n(value, ord)
    left join lateral jsonb_array_elements_text(coalesce(r.lineup -> 'seasons', '[]'::jsonb)) with ordinality as s(value, ord) on s.ord = n.ord
    where r.reporter = prof.id group by 1, 2 order by c desc, nm limit 5) x;
  if me is not null and me <> prof.id then
    ua := least(me, prof.id); ub := greatest(me, prof.id);
    select jsonb_build_object('me', case when me = ua then a_wins else b_wins end, 'them', case when me = ua then b_wins else a_wins end) into vs from public.rivalries where a = ua and b = ub;
    select case when f.status = 'accepted' then 'friends' when f.requester = me then 'sent' else 'incoming' end into fr from public.friendships f where (f.requester = me and f.addressee = prof.id) or (f.requester = prof.id and f.addressee = me) limit 1;
  end if;
  return jsonb_build_object('username', prof.username, 'region', prof.region, 'fav_era', prof.fav_era, 'auto_era', auto, 'best_score', prof.best_score, 'best_lineup', prof.best_lineup,
    'wins', w, 'losses', t - w, 'ratings', rat, 'most', most, 'vs', vs, 'friend', fr, 'self', me = prof.id);
end $$;
grant execute on function public.public_profile(text) to authenticated, anon;
