// Список платформ. Чтобы добавить новую:
// 1) положите иконку в public/icons/platforms/<slug>.svg
// 2) добавьте строку сюда
// 3) добавьте такую же строку в public/admin/config.yml (поле «Платформа»)

export interface Platform {
  slug: string;
  name: string; // полное название
  short: string; // короткое — для плашек на карточках
  maker: string;
  year: number; // год выхода платформы
}

// Порядок здесь = порядок на главной и на странице платформ:
// сначала по компаниям, внутри компании — портативки, потом домашние консоли.
export const PLATFORMS: Platform[] = [
  { slug: 'gb', name: 'Game Boy', short: 'GB', maker: 'Nintendo', year: 1989 },
  { slug: 'gba', name: 'Game Boy Advance', short: 'GBA', maker: 'Nintendo', year: 2001 },
  { slug: 'nds', name: 'Nintendo DS', short: 'NDS', maker: 'Nintendo', year: 2004 },
  { slug: '3ds', name: 'Nintendo 3DS', short: '3DS', maker: 'Nintendo', year: 2011 },
  { slug: 'nes', name: 'NES / Famicom', short: 'NES', maker: 'Nintendo', year: 1983 },
  { slug: 'snes', name: 'Super Nintendo / Super Famicom', short: 'SNES', maker: 'Nintendo', year: 1990 },
  { slug: 'n64', name: 'Nintendo 64', short: 'N64', maker: 'Nintendo', year: 1996 },
  { slug: 'psp', name: 'PlayStation Portable', short: 'PSP', maker: 'Sony', year: 2004 },
  { slug: 'vita', name: 'PlayStation Vita', short: 'Vita', maker: 'Sony', year: 2011 },
  { slug: 'ps1', name: 'PlayStation', short: 'PS1', maker: 'Sony', year: 1994 },
  { slug: 'megadrive', name: 'Sega Mega Drive / Genesis', short: 'MD', maker: 'Sega', year: 1988 },
  { slug: 'segacd', name: 'Sega CD / Mega-CD', short: 'SCD', maker: 'Sega', year: 1991 },
  { slug: 'dreamcast', name: 'Sega Dreamcast', short: 'DC', maker: 'Sega', year: 1998 },
  { slug: 'pce', name: 'PC Engine / TurboGrafx-16', short: 'PCE', maker: 'NEC', year: 1987 },
  { slug: 'pc98', name: 'NEC PC-98', short: 'PC-98', maker: 'NEC', year: 1982 },
  { slug: 'win95', name: 'Windows 95', short: 'Win95', maker: 'Microsoft', year: 1995 },
];

export const PLATFORM_BY_SLUG = Object.fromEntries(PLATFORMS.map((p) => [p.slug, p]));
export const PLATFORM_SLUGS = PLATFORMS.map((p) => p.slug) as [string, ...string[]];
