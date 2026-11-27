// Индекс для поиска: собирается при сборке сайта, браузер скачивает его один раз.
import type { APIRoute } from 'astro';
import { getImage } from 'astro:assets';
import { getGames, getLookups, rankedTranslations, verdictOf } from '../lib/util';
import { isNearSquare } from '../lib/cover';

export const GET: APIRoute = async () => {
  const games = await getGames();
  const { translators, publishers } = await getLookups();

  const items = await Promise.all(
    games.map(async (g) => {
      const d = g.data;
      const ranked = rankedTranslations(d.translations);
      const cover = d.cover ? (await getImage({ src: d.cover, width: 360, format: 'webp' })).src : null;
      return {
        id: g.id,
        t: d.title,
        a: d.altTitles,
        p: d.platform,
        ty: [...new Set(ranked.map((t) => t.type))], // первый — у лучшего перевода
        v: ranked.map((t) => verdictOf(t)),
        vl: ranked[0].verdictLabel ?? null,
        st: [...new Set([...ranked.map((t) => t.status), ...(ranked.some((t) => t.updating) ? ['updating'] : []), ...(ranked.some((t) => t.port) ? ['port'] : [])])],
        up: ranked[0].updating,
        pt: ranked[0].port,
        sn: ranked[0].statusNote ?? null,
        tr: [...new Set(d.translations.flatMap((t) => [...t.translators, ...t.porters].map((x) => x.id)))],
        n: d.translations.length,
        pu: d.publisher?.id ?? null,
        dev: d.developer ?? null,
        g: d.genres,
        y: d.year ?? null,
        d: d.date.toISOString().slice(0, 10),
        c: cover,
        cf: d.cover ? isNearSquare(d.cover.width, d.cover.height) : false,
      };
    }),
  );

  const names = {
    translators: Object.fromEntries(Object.entries(translators).map(([id, t]) => [id, t.name])),
    publishers: Object.fromEntries(Object.entries(publishers).map(([id, p]) => [id, p.name])),
  };

  return new Response(JSON.stringify({ items, names }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
