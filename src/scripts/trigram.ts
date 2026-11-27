// Нечёткий поиск по триграммам (как pg_trgm в PostgreSQL).
// «Mario» → {"  m"," ma","mar","ari","rio","io "} — и сравниваем наборы.
// Прощает опечатки, пропущенные буквы и пробелы, неправильную раскладку
// и русский набор латинских названий («марио» → «mario»).

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^a-zа-я0-9぀-ヿ一-鿿]+/g, ' ')
    .trim();
}

export function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of normalize(s).split(' ')) {
    if (!w) continue;
    const p = `  ${w} `;
    for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  }
  return out;
}

// йцукен ↔ qwerty
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU = 'йцукенгшщзхъфывапролджэячсмитьбюё';
const swapMap: Record<string, string> = {};
for (let i = 0; i < EN.length; i++) {
  swapMap[EN[i]] = RU[i];
  swapMap[RU[i]] = EN[i];
}
export const swapLayout = (s: string) => [...s.toLowerCase()].map((c) => swapMap[c] ?? c).join('');

// Кириллица → латиница (для «марио», «зельда», «рокман»)
const TR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};
export const translit = (s: string) => [...s.toLowerCase()].map((c) => TR[c] ?? c).join('');

/** Похожесть запроса на текст, 0..1. Учитывает подстроку и долю общих триграмм. */
export function similarity(qNorm: string, qTri: Set<string>, text: string, textTri: Set<string>): number {
  if (!qTri.size) return 0;
  const tNorm = normalize(text);
  if (tNorm === qNorm) return 1;
  let shared = 0;
  for (const t of qTri) if (textTri.has(t)) shared++;
  // насколько запрос «содержится» в тексте (word_similarity)
  const contain = shared / qTri.size;
  // насколько тексты вообще похожи (similarity)
  const jaccard = shared / (qTri.size + textTri.size - shared);
  let score = contain * 0.75 + jaccard * 0.25;
  const compactQ = qNorm.replace(/ /g, '');
  const compactT = tNorm.replace(/ /g, '');
  if (tNorm.startsWith(qNorm)) score += 0.35;
  else if (tNorm.includes(qNorm) || (compactQ.length > 2 && compactT.includes(compactQ))) score += 0.25;
  return Math.min(score, 1);
}

export function queryVariants(q: string): string[] {
  const n = normalize(q);
  const out = new Set([n]);
  const sw = normalize(swapLayout(q));
  if (sw && sw !== n) out.add(sw);
  if (/[а-я]/.test(n)) out.add(normalize(translit(n)));
  return [...out].filter(Boolean);
}
