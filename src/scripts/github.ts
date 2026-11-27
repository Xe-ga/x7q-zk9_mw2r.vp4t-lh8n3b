// Сохранение карточек прямо в репозиторий GitHub (как это делает админка).
// Каждое сохранение — коммит; GitHub Actions после него сам пересобирает сайт.
import { REPO } from '../config';

export const hasRepo = !!REPO.name;

const TOKEN_KEY = 'rp_gh_token';
export const ghToken = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);
    } catch {}
  },
};

export class GhError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = ghToken.get();
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new GhError(res.status, j.message || res.statusText);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

/** Проверка токена: кто вошёл и может ли он записывать в репозиторий. */
export async function whoAmI(): Promise<{ login: string; canWrite: boolean }> {
  const [user, repo] = await Promise.all([
    api<{ login: string }>('/user'),
    api<{ permissions?: { push?: boolean } }>(`/repos/${REPO.name}`),
  ]);
  return { login: user.login, canWrite: !!repo.permissions?.push };
}

// base64 для текста с кириллицей
function enc(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const dec = (b: string) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

export async function readFile(path: string): Promise<{ text: string; sha: string } | null> {
  try {
    const f = await api<{ content: string; sha: string }>(`/repos/${REPO.name}/contents/${encodeURI(path)}?ref=${REPO.branch}`);
    return { text: dec(f.content), sha: f.sha };
  } catch (e) {
    if (e instanceof GhError && e.status === 404) return null;
    throw e;
  }
}

export async function fileSha(path: string): Promise<string | null> {
  try {
    const f = await api<{ sha: string }>(`/repos/${REPO.name}/contents/${encodeURI(path)}?ref=${REPO.branch}`);
    return f.sha;
  } catch (e) {
    if (e instanceof GhError && e.status === 404) return null;
    throw e;
  }
}

/** Записать файл. content — текст или уже готовый base64 (для картинок). */
export async function writeFile(path: string, content: string, message: string, opts: { base64?: boolean; sha?: string | null } = {}) {
  const sha = opts.sha === undefined ? await fileSha(path) : opts.sha;
  return api(`/repos/${REPO.name}/contents/${encodeURI(path)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: opts.base64 ? content : enc(content),
      branch: REPO.branch,
      ...(sha ? { sha } : {}),
    }),
  });
}

/** Список файлов в папке репозитория (пусто, если папки нет). */
export async function listDir(path: string): Promise<{ name: string; path: string; sha: string; type: string }[]> {
  try {
    return await api(`/repos/${REPO.name}/contents/${encodeURI(path)}?ref=${REPO.branch}`);
  } catch (e) {
    if (e instanceof GhError && e.status === 404) return [];
    throw e;
  }
}

/** Удалить файл из репозитория. */
export async function deleteFile(path: string, sha: string, message: string) {
  return api(`/repos/${REPO.name}/contents/${encodeURI(path)}`, {
    method: 'DELETE',
    body: JSON.stringify({ message, sha, branch: REPO.branch }),
  });
}
