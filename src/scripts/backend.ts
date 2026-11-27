// Связь с базой оценок и комментариев.
// Если в src/config.ts не заполнен Supabase — работает демо-режим в localStorage.
import { BACKEND } from '../config';

export const isDemo = !BACKEND.supabaseUrl || !BACKEND.supabaseAnonKey;

export type Vote = -1 | 0 | 1;
export interface Counts { up: number; mid: number; down: number }
export interface CommentT {
  id: number;
  author: string;
  body: string;
  created_at: string;
  score: number;
  my_vote: -1 | 0 | 1;
  translation: string | null; // ключ перевода, о котором комментарий
  mod_name: string | null; // если написал модератор
}
export interface GameData {
  ratings: Record<string, Counts>; // по ключу перевода
  mine: Record<string, Vote | null>;
  comments: CommentT[];
}

// Ссылки и «рекламные» адреса в комментариях не принимаем
export const LINK_RE =
  /(https?:\/\/|www\.|t\.me\/|\b[a-z0-9-]+\.(ru|com|net|org|io|me|su|xyz|top|info|gg|ly|cc|рф|shop|site|online)\b)/i;

export const ERRORS: Record<string, string> = {
  LINKS: 'Ссылки в комментариях не публикуются — так мы защищаемся от рекламы.',
  RATE: 'Слишком часто. Подождите минуту и попробуйте снова.',
  EMPTY: 'Комментарий слишком короткий.',
  LONG: 'Комментарий слишком длинный — максимум 3000 знаков.',
  DENIED: 'Неверный ключ модератора. Войдите заново на странице /moderator/.',
  LINK: 'Нужна ссылка на перевод, начинающаяся с https://',
  NETWORK: 'Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.',
};
export const errorText = (e: unknown) => ERRORS[(e as Error)?.message] ?? ERRORS.NETWORK;

function store<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch {}
}

/** Анонимный id браузера: один голос с одного браузера. */
export function voterId(): string {
  let id = store<string | null>('rp_voter', null);
  if (!id) {
    id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
    save('rp_voter', id);
  }
  return id;
}

/** Вход модератора: ключ и имя хранятся в этом браузере. */
export const modAuth = {
  get: () => store<{ key: string; name: string } | null>('rp_mod', null),
  set: (v: { key: string; name: string } | null) => save('rp_mod', v),
};

// ---------- Supabase ----------
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BACKEND.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: BACKEND.supabaseAnonKey,
        Authorization: `Bearer ${BACKEND.supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
  } catch {
    throw new Error('NETWORK');
  }
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(String(j.message || 'NETWORK').replace(/^.*?(LINKS|RATE|EMPTY|LONG|DENIED|LINK).*$/s, '$1'));
  }
  return res.json();
}

// ---------- Демо (только этот браузер) ----------
interface Demo extends GameData { seq: number }
const demoKey = (g: string) => `rp_demo_${g}`;
const zero = (): Counts => ({ up: 0, mid: 0, down: 0 });
function demoGet(g: string, keys: string[] = []): Demo {
  const d = store<Demo>(demoKey(g), { ratings: {}, mine: {}, comments: [], seq: 1 });
  for (const k of keys) {
    d.ratings[k] ??= zero();
    d.mine[k] ??= null;
  }
  return d;
}
const lastPost: number[] = [];

const cache = new Map<string, Promise<GameData>>();

export function loadGame(game: string, keys: string[]): Promise<GameData> {
  if (!cache.has(game)) {
    cache.set(
      game,
      isDemo
        ? Promise.resolve(demoGet(game, keys))
        : rpc<GameData>('get_game', { p_game: game, p_keys: keys, p_voter: voterId() }).then((d) => {
            for (const k of keys) {
              d.ratings[k] ??= zero();
              d.mine[k] ??= null;
            }
            return d;
          }),
    );
  }
  return cache.get(game)!;
}

const slot = (v: Vote): keyof Counts => (v === 1 ? 'up' : v === 0 ? 'mid' : 'down');

export async function rateTranslation(game: string, key: string, value: Vote | null): Promise<{ ratings: Counts; my_rating: Vote | null }> {
  if (!isDemo) return rpc('rate_translation', { p_game: game, p_key: key, p_voter: voterId(), p_value: value });
  const d = demoGet(game, [key]);
  const mine = d.mine[key];
  if (mine !== null && mine !== undefined) d.ratings[key][slot(mine)]--;
  if (value !== null) d.ratings[key][slot(value)]++;
  d.mine[key] = value;
  save(demoKey(game), d);
  return { ratings: d.ratings[key], my_rating: value };
}

export async function addComment(game: string, author: string, body: string, honeypot: string, translation: string | null): Promise<CommentT> {
  body = body.trim();
  author = author.trim().slice(0, 40) || 'Аноним';
  if (body.length < 2) throw new Error('EMPTY');
  if (body.length > 3000) throw new Error('LONG');
  if (LINK_RE.test(body) || LINK_RE.test(author)) throw new Error('LINKS');
  const mod = modAuth.get();
  if (!isDemo)
    return rpc('add_comment', {
      p_game: game, p_voter: voterId(), p_author: author, p_body: body, p_hp: honeypot,
      p_translation: translation, p_mod_key: mod?.key ?? null,
    });
  const now = Date.now();
  while (lastPost.length && now - lastPost[0] > 60_000) lastPost.shift();
  if (lastPost.length >= 3) throw new Error('RATE');
  lastPost.push(now);
  const d = demoGet(game);
  const c: CommentT = {
    id: d.seq++, author: mod ? mod.name : author, body, created_at: new Date().toISOString(),
    score: 0, my_vote: 0, translation, mod_name: mod?.name ?? null,
  };
  d.comments.unshift(c);
  save(demoKey(game), d);
  return c;
}

export async function voteComment(game: string, id: number, value: Vote): Promise<{ score: number; my_vote: Vote }> {
  if (!isDemo) return rpc('vote_comment', { p_comment: id, p_voter: voterId(), p_value: value });
  const d = demoGet(game);
  const c = d.comments.find((x) => x.id === id);
  if (!c) throw new Error('NETWORK');
  c.score += value - c.my_vote;
  c.my_vote = value as -1 | 0 | 1;
  save(demoKey(game), d);
  return { score: c.score, my_vote: c.my_vote };
}

export async function deleteComment(game: string, id: number): Promise<void> {
  if (!isDemo) {
    await rpc('mod_delete_comment', { p_comment: id, p_key: modAuth.get()?.key ?? '' });
    return;
  }
  const d = demoGet(game);
  d.comments = d.comments.filter((x) => x.id !== id);
  save(demoKey(game), d);
}

/** Проверяет ключ, возвращает имя модератора или null. */
export async function checkModKey(key: string): Promise<string | null> {
  if (isDemo) return key ? 'Модератор (демо)' : null;
  return rpc<string | null>('mod_check', { p_key: key });
}

// ---------- Присланные переводы ----------
export interface Submission {
  game: string;
  platform: string;
  translators: string;
  link: string;
  kind: string;
  contact: string;
  comment: string;
}
export interface SubmissionRow extends Submission {
  id: number;
  created_at: string;
  state: 'new' | 'accepted' | 'rejected';
  handled_by: string | null;
}

export async function submitTranslation(s: Submission, honeypot: string): Promise<void> {
  if (s.game.trim().length < 2 || s.translators.trim().length < 1) throw new Error('EMPTY');
  if (!/^https?:\/\//i.test(s.link.trim())) throw new Error('LINK');
  if (!isDemo) {
    await rpc('submit_translation', {
      p_game: s.game, p_platform: s.platform, p_translators: s.translators, p_link: s.link,
      p_kind: s.kind, p_contact: s.contact, p_comment: s.comment, p_hp: honeypot,
    });
    return;
  }
  const list = store<SubmissionRow[]>('rp_demo_submissions', []);
  list.unshift({ ...s, id: Date.now(), created_at: new Date().toISOString(), state: 'new', handled_by: null });
  save('rp_demo_submissions', list);
}

export async function listSubmissions(): Promise<SubmissionRow[]> {
  if (isDemo) return store<SubmissionRow[]>('rp_demo_submissions', []);
  return rpc('mod_list_submissions', { p_key: modAuth.get()?.key ?? '' });
}

export async function setSubmissionState(id: number, state: SubmissionRow['state']): Promise<void> {
  if (!isDemo) {
    await rpc('mod_set_submission', { p_id: id, p_state: state, p_key: modAuth.get()?.key ?? '' });
    return;
  }
  const list = store<SubmissionRow[]>('rp_demo_submissions', []);
  const row = list.find((x) => x.id === id);
  if (row) {
    row.state = state;
    row.handled_by = modAuth.get()?.name ?? null;
  }
  save('rp_demo_submissions', list);
}
