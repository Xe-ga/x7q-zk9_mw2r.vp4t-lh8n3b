import { getCollection, type CollectionEntry } from 'astro:content';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Ссылка с учётом подпапки GitHub Pages: u('/games/x/') → '/repo/games/x/' */
export function u(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return BASE + (path.startsWith('/') ? path : '/' + path);
}

const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
export const fmtDate = (d: Date) => dateFmt.format(d);
export const fmtShort = (d: Date) => shortFmt.format(d);

export type Game = CollectionEntry<'games'>;

export async function getGames(): Promise<Game[]> {
  const all = await getCollection('games', (g) => !g.data.draft);
  return all.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export async function getPosts() {
  const all = await getCollection('blog', (p) => !p.data.draft);
  return all.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export async function getLookups() {
  const translators = Object.fromEntries((await getCollection('translators')).map((t) => [t.id, t.data]));
  const publishers = Object.fromEntries((await getCollection('publishers')).map((p) => [p.id, p.data]));
  const moderators = Object.fromEntries((await getCollection('moderators')).map((m) => [m.id, m.data]));
  return { translators, publishers, moderators };
}

export type Translation = Game['data']['translations'][number];

/**
 * Постоянный ключ перевода — к нему привязаны оценки в базе.
 * Складывается из переводчиков (в алфавитном порядке): «puchevachi», «puchevachi+test-translator».
 * Если у игры два перевода от одних и тех же людей — второй получает «#2» (по порядку в админке).
 * Если поменять переводчиков у опубликованного перевода — его оценки начнутся с нуля.
 */
export function translationKeys(list: Translation[]): string[] {
  const seen = new Map<string, number>();
  return list.map((t) => {
    // id сортируем, чтобы порядок переводчиков в анкете не влиял на ключ
    const ids = (list: { id: string }[]) => list.map((x) => x.id).sort().join('+');
    let k = ids(t.translators) || 'perevod';
    if (t.port) k += '>port' + (t.porters.length ? ':' + ids(t.porters) : '');
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return n > 1 ? `${k}#${n}` : k;
  });
}

/** Читаемое название хоста: https://www.romhacking.net/x → romhacking.net */
export function host(url?: string | null) {
  try {
    return new URL(url!).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Склонение: plural(5, ['перевод','перевода','переводов']) */
export function plural(n: number, forms: [string, string, string]) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
  return forms[2];
}

/** Первый абзац markdown без разметки — для превью. */
export function excerpt(md: string | undefined, max = 180) {
  const first = (md ?? '').trim().split(/\n\s*\n/)[0] ?? '';
  const plain = first.replace(/[*_`#>\[\]]/g, '').replace(/\(([^)]*)\)/g, '').trim();
  return plain.length > max ? plain.slice(0, max).replace(/\s+\S*$/, '') + '…' : plain;
}

import { VERDICTS } from '../data/taxonomy';
/** Рекомендация перевода; не выбрана — «Не проверено». */
export const verdictOf = (t: Translation) => t.verdict ?? 'untested';
/** Место при сортировке: «Не проверено» — между «Играбельно» и «Терпимо». */
export const verdictLevel = (t: Translation) => VERDICTS[verdictOf(t)].rank;

/** Переводы с постоянными ключами, отсортированные от лучшей рекомендации к худшей. */
export function rankedTranslations(list: Translation[]) {
  const keys = translationKeys(list);
  return list
    .map((t, i) => ({ ...t, key: keys[i] }))
    .sort((a, b) => verdictLevel(b) - verdictLevel(a));
}
