// Типы перевода и жанры. Если меняете — продублируйте в public/admin/config.yml.

export const TRANSLATION_TYPES = {
  manual: { label: 'Ручной', hint: 'Переведено человеком от начала до конца' },
  'ai-edited': { label: 'Нейросеть + правки', hint: 'Машинный перевод, вычитанный и исправленный вручную' },
  ai: { label: 'Нейросетевой', hint: 'Машинный перевод без серьёзной вычитки' },
  wasted: { label: 'Потрачено', hint: 'Перевод плохой: играть тяжело или почти невозможно' },
} as const;

export type TranslationType = keyof typeof TRANSLATION_TYPES;
export const TRANSLATION_TYPE_KEYS = Object.keys(TRANSLATION_TYPES) as [TranslationType, ...TranslationType[]];

export const GENRES = [
  'RPG',
  'JRPG',
  'Экшен',
  'Платформер',
  'Приключения',
  'Квест',
  'Визуальная новелла',
  'Стратегия',
  'Тактика',
  'Головоломка',
  'Файтинг',
  'Шутер',
  'Гонки',
  'Спорт',
  'Симулятор',
  'Хоррор',
  'Ритм',
] as const;

// Рекомендация модератора: насколько советуем играть с этим переводом.
// level — сколько из 4 квадратиков закрашено на метке; rank — место при сортировке.
// Если рекомендация не выбрана, перевод считается «Не проверено».
export const VERDICTS = {
  great: { label: 'Отлично', level: 4, rank: 4, hint: 'Рекомендуем: перевод на уровне официального или лучше' },
  good: { label: 'Хорошо', level: 3, rank: 3, hint: 'Хороший перевод, мелкие огрехи играть не мешают' },
  ok: { label: 'Играбельно', level: 2, rank: 2, hint: 'Звёзд с неба не хватает: косяки есть, но в целом не плохо' },
  no: { label: 'Терпимо', level: 1, rank: 1, hint: 'Перевод работает и игру не ломает, но читать тяжело — пройти можно, только стиснув зубы' },
  untested: { label: 'Не проверено', level: 0, rank: 1.5, hint: 'Модератор ещё не проверял этот перевод' },
} as const;

export type Verdict = keyof typeof VERDICTS;
export const VERDICT_KEYS = Object.keys(VERDICTS) as [Verdict, ...Verdict[]];

// Состояние перевода: насколько игра переведена.
export const STATUSES = {
  full: { label: 'Полный', icon: 'check-circle', hint: 'Переведена вся игра' },
  partial: { label: 'Частичный', icon: 'exclamation-triangle', hint: 'Переведена не вся игра — подробности в сноске' },
  wip: { label: 'В процессе', icon: 'clock', hint: 'Перевод ещё делается, выложена промежуточная версия' },
} as const;
export type Status = keyof typeof STATUSES;
export const STATUS_KEYS = Object.keys(STATUSES) as [Status, ...Status[]];

// Отметка «Обновляется»: перевод готов (или частичный), но автор продолжает выпускать правки.
export const UPDATING = { label: 'Обновляется', icon: 'refresh', hint: 'Автор продолжает выпускать исправления и обновления' } as const;

// Отдельные отметки «что не переведено» — их можно ставить сразу несколько.
export const GAPS = {
  graphics: 'Без перевода графики',
  dlc: 'DLC не переведены',
  video: 'Ролики без перевода',
  audio: 'Без перевода озвучки',
} as const;
export type Gap = keyof typeof GAPS;
export const GAP_KEYS = Object.keys(GAPS) as [Gap, ...Gap[]];
