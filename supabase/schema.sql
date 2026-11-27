-- ============================================================
-- РУСПАТЧ: база для оценок и комментариев (Supabase, бесплатный тариф)
-- Как применить: Supabase → SQL Editor → вставить весь файл → Run.
-- Повторный запуск безопасен.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Таблицы ----------
-- Оценка каждого перевода отдельно: игра + ключ перевода
create table if not exists public.ratings (
  game       text not null,
  tkey       text not null,
  voter      text not null,
  value      smallint not null check (value in (-1, 0, 1)),
  ip_hash    text,
  created_at timestamptz not null default now(),
  primary key (game, tkey, voter)
);

create table if not exists public.comments (
  id          bigint generated always as identity primary key,
  game        text not null,
  translation text,             -- о каком переводе (может быть пусто)
  author      text not null default 'Аноним' check (char_length(author) between 1 and 40),
  mod_name    text,             -- заполнено, если писал модератор
  body        text not null check (char_length(body) between 2 and 3000),
  voter       text not null,
  ip_hash     text,
  created_at  timestamptz not null default now()
);
create index if not exists comments_game_idx on public.comments (game, created_at desc);
create index if not exists comments_ip_idx on public.comments (ip_hash, created_at desc);

create table if not exists public.comment_votes (
  comment_id bigint not null references public.comments (id) on delete cascade,
  voter      text not null,
  value      smallint not null check (value in (-1, 1)),
  ip_hash    text,
  primary key (comment_id, voter)
);

-- Модераторы: у каждого своё имя и свой ключ (хранится только хеш)
create table if not exists public.moderators (
  name     text primary key,
  key_hash text not null
);

-- Журнал удалений: кто и что удалил
create table if not exists public.mod_log (
  id         bigint generated always as identity primary key,
  moderator  text not null,
  action     text not null,
  details    jsonb,
  created_at timestamptz not null default now()
);

-- Присланные через сайт переводы (форма «Отправить перевод»)
create table if not exists public.submissions (
  id          bigint generated always as identity primary key,
  game        text not null check (char_length(game) between 2 and 120),
  platform    text,
  translators text not null check (char_length(translators) between 1 and 200),
  link        text not null check (char_length(link) between 8 and 500),
  kind        text,
  contact     text,
  comment     text check (char_length(comment) <= 2000),
  state       text not null default 'new' check (state in ('new', 'accepted', 'rejected')),
  handled_by  text,
  ip_hash     text,
  created_at  timestamptz not null default now()
);

create table if not exists public.settings (
  key   text primary key,
  value text not null
);

-- Прямой доступ к таблицам из браузера закрыт — только через функции ниже.
alter table public.ratings       enable row level security;
alter table public.comments      enable row level security;
alter table public.comment_votes enable row level security;
alter table public.moderators    enable row level security;
alter table public.mod_log       enable row level security;
alter table public.settings      enable row level security;
alter table public.submissions   enable row level security;
revoke all on public.ratings, public.comments, public.comment_votes, public.moderators, public.mod_log, public.settings, public.submissions
  from anon, authenticated;

-- ---------- Вспомогательные ----------
-- Хеш IP посетителя (сам IP не хранится)
create or replace function public._ip_hash() returns text
language sql stable security definer set search_path = public, extensions as $$
  select encode(extensions.digest(
    coalesce(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1), 'unknown')
    || coalesce((select value from public.settings where key = 'salt'), 'ruspatch'), 'sha256'), 'hex');
$$;

create or replace function public._counts(p_game text, p_key text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'up',   count(*) filter (where value = 1),
    'mid',  count(*) filter (where value = 0),
    'down', count(*) filter (where value = -1))
  from public.ratings where game = p_game and tkey = p_key;
$$;

-- Имя модератора по ключу (или null)
create or replace function public._mod_name(p_key text) returns text
language sql stable security definer set search_path = public, extensions as $$
  select name from public.moderators
  where coalesce(p_key, '') <> '' and key_hash = extensions.crypt(p_key, key_hash)
  limit 1;
$$;

-- ---------- API для сайта ----------

-- Всё для страницы игры одним запросом
create or replace function public.get_game(p_game text, p_keys text[], p_voter text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'ratings', coalesce((select json_object_agg(k, public._counts(p_game, k)) from unnest(p_keys) k), '{}'::json),
    'mine', coalesce((select json_object_agg(k, (select value from public.ratings r where r.game = p_game and r.tkey = k and r.voter = p_voter)) from unnest(p_keys) k), '{}'::json),
    'comments', coalesce((
      select json_agg(json_build_object(
        'id', c.id, 'author', c.author, 'mod_name', c.mod_name, 'translation', c.translation,
        'body', c.body, 'created_at', c.created_at,
        'score', coalesce((select sum(v.value) from public.comment_votes v where v.comment_id = c.id), 0),
        'my_vote', coalesce((select v.value from public.comment_votes v where v.comment_id = c.id and v.voter = p_voter), 0)
      ) order by c.created_at desc)
      from public.comments c where c.game = p_game), '[]'::json)
  );
$$;

-- Оценка перевода: 1 / 0 / -1, null — отменить голос
create or replace function public.rate_translation(p_game text, p_key text, p_voter text, p_value smallint) returns json
language plpgsql security definer set search_path = public as $$
declare h text := public._ip_hash();
begin
  if char_length(p_game) > 120 or char_length(p_key) > 200 or char_length(p_voter) > 64 then raise exception 'RATE'; end if;
  if p_value is null then
    delete from public.ratings where game = p_game and tkey = p_key and voter = p_voter;
  else
    if p_value not in (-1, 0, 1) then raise exception 'RATE'; end if;
    -- не больше 3 разных «браузеров» с одного IP на один перевод
    if not exists (select 1 from public.ratings where game = p_game and tkey = p_key and voter = p_voter)
       and (select count(*) from public.ratings where game = p_game and tkey = p_key and ip_hash = h) >= 3 then
      raise exception 'RATE';
    end if;
    insert into public.ratings (game, tkey, voter, value, ip_hash) values (p_game, p_key, p_voter, p_value, h)
    on conflict (game, tkey, voter) do update set value = excluded.value;
  end if;
  return json_build_object(
    'ratings', public._counts(p_game, p_key),
    'my_rating', (select value from public.ratings where game = p_game and tkey = p_key and voter = p_voter));
end $$;

-- Новый комментарий (если передан верный ключ модератора — подписывается его именем)
create or replace function public.add_comment(
  p_game text, p_voter text, p_author text, p_body text,
  p_hp text default '', p_translation text default null, p_mod_key text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  h text := public._ip_hash();
  m text := public._mod_name(p_mod_key);
  a text := left(coalesce(nullif(btrim(p_author), ''), 'Аноним'), 40);
  b text := btrim(coalesce(p_body, ''));
  c public.comments;
begin
  if m is not null then a := left(m, 40); end if;
  if char_length(b) < 2 then raise exception 'EMPTY'; end if;
  if char_length(b) > 3000 then raise exception 'LONG'; end if;
  if m is null and (a || ' ' || b) ~* '(https?://|www\.|t\.me/|[a-z0-9-]+\.(ru|com|net|org|io|me|su|xyz|top|info|gg|ly|cc|рф|shop|site|online)([^a-z]|$))' then
    raise exception 'LINKS';
  end if;
  -- не чаще 2 комментариев в минуту и 30 в час с одного IP (модераторов не ограничиваем)
  if m is null and (
       (select count(*) from public.comments where ip_hash = h and created_at > now() - interval '1 minute') >= 2
    or (select count(*) from public.comments where ip_hash = h and created_at > now() - interval '1 hour') >= 30) then
    raise exception 'RATE';
  end if;
  -- ловушка для ботов: делаем вид, что всё хорошо, но ничего не сохраняем
  if coalesce(p_hp, '') <> '' then
    return json_build_object('id', 0, 'author', a, 'mod_name', null, 'translation', p_translation,
      'body', b, 'created_at', now(), 'score', 0, 'my_vote', 0);
  end if;
  insert into public.comments (game, translation, author, mod_name, body, voter, ip_hash)
  values (p_game, left(p_translation, 200), a, m, b, left(p_voter, 64), h)
  returning * into c;
  return json_build_object('id', c.id, 'author', c.author, 'mod_name', c.mod_name, 'translation', c.translation,
    'body', c.body, 'created_at', c.created_at, 'score', 0, 'my_vote', 0);
end $$;

-- Плюс/минус комментарию: 1 / -1, 0 — убрать
create or replace function public.vote_comment(p_comment bigint, p_voter text, p_value smallint) returns json
language plpgsql security definer set search_path = public as $$
declare h text := public._ip_hash();
begin
  if p_value = 0 then
    delete from public.comment_votes where comment_id = p_comment and voter = p_voter;
  elsif p_value in (-1, 1) then
    if not exists (select 1 from public.comment_votes where comment_id = p_comment and voter = p_voter)
       and (select count(*) from public.comment_votes where comment_id = p_comment and ip_hash = h) >= 3 then
      raise exception 'RATE';
    end if;
    insert into public.comment_votes (comment_id, voter, value, ip_hash) values (p_comment, left(p_voter, 64), p_value, h)
    on conflict (comment_id, voter) do update set value = excluded.value;
  else
    raise exception 'RATE';
  end if;
  return json_build_object(
    'score', coalesce((select sum(value) from public.comment_votes where comment_id = p_comment), 0),
    'my_vote', coalesce((select value from public.comment_votes where comment_id = p_comment and voter = p_voter), 0));
end $$;

-- Модерация
create or replace function public.mod_check(p_key text) returns text
language sql stable security definer set search_path = public as $$
  select public._mod_name(p_key);
$$;

create or replace function public.mod_delete_comment(p_comment bigint, p_key text) returns void
language plpgsql security definer set search_path = public as $$
declare m text := public._mod_name(p_key); c public.comments;
begin
  if m is null then raise exception 'DENIED'; end if;
  delete from public.comments where id = p_comment returning * into c;
  if c.id is not null then
    insert into public.mod_log (moderator, action, details)
    values (m, 'delete_comment', json_build_object('game', c.game, 'author', c.author, 'body', c.body, 'created_at', c.created_at)::jsonb);
  end if;
end $$;

-- Заявка «Отправить перевод»: не больше 5 в час с одного IP
create or replace function public.submit_translation(
  p_game text, p_platform text, p_translators text, p_link text,
  p_kind text default null, p_contact text default null, p_comment text default null, p_hp text default '')
returns void language plpgsql security definer set search_path = public as $$
declare h text := public._ip_hash();
begin
  if char_length(btrim(coalesce(p_game, ''))) < 2 or char_length(btrim(coalesce(p_translators, ''))) < 1 then raise exception 'EMPTY'; end if;
  if coalesce(p_link, '') !~* '^https?://' then raise exception 'LINK'; end if;
  if (select count(*) from public.submissions where ip_hash = h and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'RATE';
  end if;
  if coalesce(p_hp, '') <> '' then return; end if; -- бот
  insert into public.submissions (game, platform, translators, link, kind, contact, comment, ip_hash)
  values (left(btrim(p_game), 120), left(p_platform, 40), left(btrim(p_translators), 200), left(btrim(p_link), 500),
          left(p_kind, 20), left(p_contact, 120), left(p_comment, 2000), h);
end $$;

create or replace function public.mod_list_submissions(p_key text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if public._mod_name(p_key) is null then raise exception 'DENIED'; end if;
  return coalesce((select json_agg(json_build_object(
      'id', id, 'game', game, 'platform', platform, 'translators', translators, 'link', link, 'kind', kind,
      'contact', contact, 'comment', comment, 'state', state, 'handled_by', handled_by, 'created_at', created_at
    ) order by created_at desc) from public.submissions), '[]'::json);
end $$;

create or replace function public.mod_set_submission(p_id bigint, p_state text, p_key text) returns void
language plpgsql security definer set search_path = public as $$
declare m text := public._mod_name(p_key);
begin
  if m is null then raise exception 'DENIED'; end if;
  if p_state not in ('new', 'accepted', 'rejected') then raise exception 'RATE'; end if;
  update public.submissions set state = p_state, handled_by = case when p_state = 'new' then null else m end where id = p_id;
  insert into public.mod_log (moderator, action, details) values (m, 'submission_' || p_state, json_build_object('id', p_id)::jsonb);
end $$;

-- Сайту разрешено вызывать только эти функции
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.get_game(text, text[], text)                               to anon;
grant execute on function public.rate_translation(text, text, text, smallint)               to anon;
grant execute on function public.add_comment(text, text, text, text, text, text, text)      to anon;
grant execute on function public.vote_comment(bigint, text, smallint)                       to anon;
grant execute on function public.mod_check(text)                                            to anon;
grant execute on function public.mod_delete_comment(bigint, text)                           to anon;
grant execute on function public.submit_translation(text, text, text, text, text, text, text, text) to anon;
grant execute on function public.mod_list_submissions(text)                                 to anon;
grant execute on function public.mod_set_submission(bigint, text, text)                     to anon;

-- ============================================================
-- ПОСЛЕ ЗАПУСКА
--
-- 1) Один раз — «соль» для хеширования IP:
-- insert into public.settings values ('salt', encode(extensions.gen_random_bytes(16), 'hex'))
--   on conflict (key) do nothing;
--
-- 2) Добавить модератора (по строке на каждого; имя — как будет видно на сайте):
-- insert into public.moderators values ('Имя', extensions.crypt('ЕГО-ЛИЧНЫЙ-КЛЮЧ', extensions.gen_salt('bf')))
--   on conflict (name) do update set key_hash = excluded.key_hash;
--
-- Сменить ключ — та же строка с новым ключом. Убрать модератора:
-- delete from public.moderators where name = 'Имя';
--
-- Посмотреть, кто что удалял:
-- select * from public.mod_log order by created_at desc;
-- ============================================================
