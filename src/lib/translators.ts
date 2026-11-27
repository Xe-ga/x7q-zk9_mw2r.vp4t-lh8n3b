import { getCollection } from 'astro:content';
import { getGames, type Game, type Translation } from './util';
import type { TranslationType } from '../data/taxonomy';

export interface TranslatorWork {
  game: Game;
  t: Translation;
  role: 'translator' | 'porter';
}

/** Все переводчики с их работами (по одной записи на каждый их перевод). */
export async function getTranslatorsWithWorks() {
  const games = await getGames();
  const list = await getCollection('translators');
  return list
    .map((tr) => {
      const works: TranslatorWork[] = [];
      for (const game of games)
        for (const t of game.data.translations) {
          if (t.translators.some((x) => x.id === tr.id)) works.push({ game, t, role: 'translator' });
          else if (t.porters.some((x) => x.id === tr.id)) works.push({ game, t, role: 'porter' });
        }
      // Свой перевод считаем по типу, а порт чужого — просто «Портом»
      const types: Partial<Record<TranslationType | 'port', number>> = {};
      for (const w of works) {
        const k = w.role === 'porter' ? 'port' : w.t.type;
        types[k] = (types[k] ?? 0) + 1;
      }
      return { id: tr.id, ...tr.data, works, types };
    })
    .sort((a, b) => b.works.length - a.works.length || a.name.localeCompare(b.name, 'ru'));
}
