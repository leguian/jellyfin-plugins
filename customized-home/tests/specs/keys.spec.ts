import { expect, test, type Page } from '@playwright/test';
import { HOME_FIXTURE_URL, injectPlugin, visibleSectionTitles, type Layout, type MockOptions } from './support';

// Sections of other plugins are only known by their title: their layout key is "title:<slug of the title>".

interface PluginWindow {
    CustomizedHome: { sections: () => { key: string; label: string }[] };
}

/** The home fixture plus one third-party section per title (no class, no link: nothing but the title identifies it). */
async function openHomeWithSections(page: Page, titles: string[], options: MockOptions = {}): Promise<void> {
    await page.goto(HOME_FIXTURE_URL);
    await page.evaluate((list) => {
        const container = document.querySelector('#homeTab .sections');
        if (!container) {
            throw new Error('home container missing');
        }
        for (const title of list) {
            const section = document.createElement('div');
            section.className = 'verticalSection';
            const heading = document.createElement('h2');
            heading.className = 'sectionTitle';
            heading.textContent = title;
            const items = document.createElement('div');
            items.className = 'itemsContainer';
            items.append(Object.assign(document.createElement('div'), { className: 'card' }));
            section.append(heading, items);
            container.append(section);
        }
    }, titles);
    await injectPlugin(page, options);
    await page.waitForSelector('#homeTab .sections.ch-container');
}

async function keysByTitle(page: Page): Promise<Record<string, string>> {
    const sections = await page.evaluate(() => (window as unknown as PluginWindow).CustomizedHome.sections());
    return Object.fromEntries(sections.map((section) => [section.label, section.key]));
}

/** The slug of 1.8.3 and earlier, which saved layouts were built with. */
function legacySlug(text: string): string {
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 80);
}

// Titles of the section catalog (Home Screen Sections names, English and French) and of typical French plugins.
// The few titles the fixture recognizes as native Jellyfin sections (My Media, Next Up...) get a "jf:" key instead.
const LATIN_TITLES = [
    'Continue Watching / Next Up', 'Recently Added Movies', 'Recently Added Shows', 'Latest Movies', 'Latest Shows', 'Because You Watched Dune',
    'Watch Again', 'Collections', 'Discover', 'Discover Movies', 'Discover TV Shows', 'Genre', 'My List', 'My Requests', 'Top Ten',
    'Recently Added Albums', 'Recently Added Music Videos', 'Recently Added Audiobooks', 'Latest Books', 'Directed by Denis Villeneuve',
    'Starring Zendaya', 'Upcoming Shows', 'Upcoming Movies', 'Mes médias', 'Continuer à regarder', "Reprendre l'écoute", 'Reprendre la lecture',
    'À suivre', 'TV en direct', 'Enregistrements actifs', 'Continuer à regarder / À suivre', 'Films ajoutés récemment', 'Séries ajoutées récemment',
    'Derniers films', 'Dernières séries', 'Parce que vous avez regardé Amélie', 'Regarder à nouveau', 'Découvrir', 'Découvrir les films',
    'Découvrir les séries', 'Ma liste', 'Mes demandes', 'Top 10', 'Ajouté récemment dans Séries', 'Albums ajoutés récemment',
    'Vidéos musicales ajoutées récemment', 'Livres audio ajoutés récemment', 'Derniers livres audio', 'Réalisé par Agnès Varda', 'Avec Léa Seydoux',
    'Séries à venir', 'Films à venir', 'Musiques à venir', 'L’actualité — à la une…', 'Noël & fêtes : sélection n° 1', '  Ça commence ! ',
    // Longer than the 80 characters kept: the cut falls right after a separator, which stays as it always did.
    `${'a'.repeat(79)} tail of a very long title`
];

// What these keys have always been: a layout saved by 1.8.3 must find its sections.
const PINNED_LATIN_KEYS: Record<string, string> = {
    'Continue Watching / Next Up': 'title:continue-watching-next-up',
    'Discover TV Shows': 'title:discover-tv-shows',
    'Top 10': 'title:top-10',
    "Reprendre l'écoute": 'title:reprendre-l-ecoute',
    'À suivre': 'title:a-suivre',
    'Découvrir les séries': 'title:decouvrir-les-series',
    'Parce que vous avez regardé Amélie': 'title:parce-que-vous-avez-regarde-amelie',
    'L’actualité — à la une…': 'title:l-actualite-a-la-une',
    'Noël & fêtes : sélection n° 1': 'title:noel-fetes-selection-n-1',
    'Ça commence !': 'title:ca-commence'
};

// Other scripts: letters and digits are kept, accents of Greek and Cyrillic are dropped like the Latin ones.
const UNICODE_KEYS: Record<string, string> = {
    'Популярное': 'title:популярное',
    'Новинки': 'title:новинки',
    'Top 10 фильмов': 'title:top-10-фильмов',
    'Топ 10 сериалов': 'title:топ-10-сериалов',
    '最新电影': 'title:最新电影',
    '热门剧集': 'title:热门剧集',
    'スター・ウォーズ': 'title:スター-ウォーズ',
    'Ταινίες': 'title:ταινιες',
    'Σειρές': 'title:σειρες',
    'أفلام': 'title:أفلام',
    'مسلسلات': 'title:مسلسلات',
    '영화 추천': 'title:영화-추천',
    'Coup de cœur': 'title:coup-de-cœur'
};

test('ASCII and accented Latin titles keep the key they always had, byte for byte', async ({ page }) => {
    await openHomeWithSections(page, LATIN_TITLES);
    const keys = await keysByTitle(page);
    for (const title of LATIN_TITLES) {
        expect(keys[title.trim()], title).toBe(`title:${legacySlug(title)}`);
    }
    for (const [title, key] of Object.entries(PINNED_LATIN_KEYS)) {
        expect(keys[title], title).toBe(key);
    }
    expect(keys[`${'a'.repeat(79)} tail of a very long title`]).toBe(`title:${'a'.repeat(79)}-`);
});

test('titles in Cyrillic, CJK, Greek, Arabic or Hangul get one key each', async ({ page }) => {
    await openHomeWithSections(page, Object.keys(UNICODE_KEYS));
    const keys = await keysByTitle(page);
    expect(keys).toMatchObject(UNICODE_KEYS);
    expect(new Set(Object.keys(UNICODE_KEYS).map((title) => keys[title])).size).toBe(Object.keys(UNICODE_KEYS).length);
});

test('marks that carry the meaning stay: Hindi vowel signs and kana voicing do not merge two titles', async ({ page }) => {
    const titles = ['काला', 'कली', 'ガラス', 'カラス'];
    await openHomeWithSections(page, titles);
    const keys = await keysByTitle(page);
    expect(new Set(titles.map((title) => keys[title])).size).toBe(titles.length);
    // Composed again after the accents were removed: the key is the same whatever form the title came in.
    expect(keys['ガラス']).toBe('title:ガラス');
});

test('two sections with non Latin titles are ordered and hidden one by one', async ({ page }) => {
    const layout: Layout = {
        Version: 1,
        HideUnlisted: true,
        Items: [
            { Type: 'section', Key: 'title:最新电影', Visible: true },
            { Type: 'section', Key: 'title:новинки', Visible: true },
            { Type: 'section', Key: 'jf:nextup', Visible: true },
            { Type: 'section', Key: 'title:популярное', Visible: false }
        ]
    };
    await openHomeWithSections(page, ['Популярное', 'Новинки', '最新电影', '热门剧集'], { layout });
    expect(await visibleSectionTitles(page)).toEqual(['最新电影', 'Новинки', 'Next Up']);
});

test('a title made of symbols only gets a stable hash key instead of an empty slug', async ({ page }) => {
    await openHomeWithSections(page, ['★ ★ ★', '♥♥', '!!!']);
    const keys = await keysByTitle(page);
    // Pinned (and computed apart from the script): a saved layout holds these values, the hash must never change.
    expect(keys).toMatchObject({ '★ ★ ★': 'title:~6rik9b', '♥♥': 'title:~6qow', '!!!': 'title:~pa9' });
});

test('a layout saved with the former key of a title keeps its section', async ({ page }) => {
    // 1.8.3 turned "œ" into a separator. Same title, same layout position as before the change.
    const layout: Layout = { Version: 1, HideUnlisted: true, Items: [{ Type: 'section', Key: 'title:coup-de-c-ur', Visible: true }, { Type: 'section', Key: 'jf:nextup', Visible: true }] };
    await openHomeWithSections(page, ['Coup de cœur'], { layout });
    expect((await keysByTitle(page))['Coup de cœur']).toBe('title:coup-de-c-ur');
    expect(await visibleSectionTitles(page)).toEqual(['Coup de cœur', 'Next Up']);
});

test.describe('engine without Unicode property escapes', () => {
    test.beforeEach(async ({ page }) => {
        // Chromium before 64 and Safari before 11.1 throw on \p{...}: the script must load and fall back.
        await page.addInitScript(() => {
            const Native = RegExp;
            const Legacy = function (pattern: string | RegExp, flags?: string): RegExp {
                if (typeof pattern === 'string' && pattern.includes('\\p{')) {
                    throw new SyntaxError('Invalid regular expression: invalid property name');
                }
                return new Native(pattern, flags);
            };
            Legacy.prototype = Native.prototype;
            (window as unknown as { RegExp: unknown }).RegExp = Legacy;
        });
    });

    test('the script loads, and common titles get the same keys as on a current engine', async ({ page }) => {
        const titles = [...Object.keys(UNICODE_KEYS), ...Object.keys(PINNED_LATIN_KEYS)];
        await openHomeWithSections(page, titles);
        const keys = await keysByTitle(page);
        expect(keys).toMatchObject({ ...UNICODE_KEYS, ...PINNED_LATIN_KEYS });
    });
});
