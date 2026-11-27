import { defineCollection, reference } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
import { PLATFORM_SLUGS } from './data/platforms';
import { TRANSLATION_TYPE_KEYS, VERDICT_KEYS, STATUS_KEYS, GAP_KEYS, GENRES } from './data/taxonomy';

const optUrl = z.url().optional().nullable().or(z.literal(''));
const optText = z.string().optional().nullable();

// Один перевод игры. У игры их может быть несколько; на сайте они идут от лучшей рекомендации к худшей.
const translation = z
  .object({
    type: z.enum(TRANSLATION_TYPE_KEYS),
    status: z.enum(STATUS_KEYS).default('full'), // полный / частичный / в процессе
    updating: z.boolean().default(false), // автор продолжает выпускать правки (можно вместе с «Полный»)
    gaps: z.array(z.enum(GAP_KEYS)).default([]), // что не переведено
    gapsCustom: z.array(z.string()).default([]), // свои отметки: «часть интерфейса», «надписи на картах»
    statusNote: optText, // сноска: «не переведены главы 5–7»
    verdict: z.enum(VERDICT_KEYS).optional().nullable(), // рекомендация модератора; пусто = «Не проверено»
    verdictLabel: optText, // своё название метки: «Терпимо», «На любителя»
    verdictNote: optText, // почему такая рекомендация — заменяет стандартное пояснение
    translators: z.array(reference('translators')).default([]), // авторы перевода (у порта — оригинала)
    port: z.boolean().default(false), // это порт чужого перевода на другую платформу/версию
    porters: z.array(reference('translators')).default([]), // кто портировал
    portFrom: optText, // откуда: «с версии для SNES», «с английского фан-патча 1.1»
    originalUrl: optUrl, // ссылка на оригинальный перевод
    sourceUrl: optUrl, // страница переводчика (сайт, форум, его канал)
    download: optUrl, // пост в нашем Telegram-канале
    moderator: reference('moderators').optional().nullable(),
    moderatorNote: optText,
    translatorNote: optText,
    date: z.coerce.date().optional().nullable(),
  })
  .refine((t) => t.sourceUrl || t.download, {
    message: 'У перевода должна быть хотя бы одна ссылка: на ресурс переводчика или на Telegram',
  });

// Каждая игра — папка src/content/games/<slug>/ с index.md и обложкой рядом.
const games = defineCollection({
  loader: glob({ pattern: '*/index.md', base: './src/content/games', generateId: ({ entry }) => entry.split('/')[0] }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      altTitles: z.array(z.string()).default([]),
      platform: z.enum(PLATFORM_SLUGS),
      publisher: reference('publishers').optional().nullable(),
      developer: optText,
      year: z.number().int().min(1970).max(2100).optional().nullable(),
      genres: z.array(z.enum(GENRES)).default([]),
      cover: image().optional().nullable(),
      translations: z.array(translation).min(1),
      date: z.coerce.date(),
      draft: z.boolean().default(false),
    }),
});

const blog = defineCollection({
  loader: glob({ pattern: '*/index.md', base: './src/content/blog', generateId: ({ entry }) => entry.split('/')[0] }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      cover: image().optional().nullable(),
      excerpt: optText,
      draft: z.boolean().default(false),
    }),
});

const translators = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/translators' }),
  schema: ({ image }) => z.object({ name: z.string(), url: optUrl, avatar: image().optional().nullable() }),
});

const publishers = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/publishers' }),
  schema: z.object({ name: z.string() }),
});

// Модератор — markdown-файл: в шапке имя и аватар, ниже — рассказ о себе и о том, как проверяет переводы.
const moderators = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/moderators' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      url: optUrl,
      avatar: image().optional().nullable(),
      tagline: optText, // одна строка под именем: «Проверяю JRPG и всё на PC-98»
    }),
});

export const collections = { games, blog, translators, publishers, moderators };
