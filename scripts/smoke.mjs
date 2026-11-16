// End-to-end smoke test of the built app (dist/index.html) opened from file://.
// Usage: npm run build && npm run smoke [-- <screenshot dir>]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import JSZip from 'jszip';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = resolve(import.meta.dirname, '..');
const out = resolve(process.argv[2] ?? join(root, 'smoke-output'));
mkdirSync(out, { recursive: true });

const fail = (msg) => {
  throw new Error('SMOKE FAIL: ' + msg);
};
const expectEq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  console.log(`  ✓ ${what}`);
};

// A ZIP pack with a real PNG, to check blob media works in the display window.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGP4z8AARAwMDAwAAP8E/4vEVbcAAAAASUVORK5CYII=',
  'base64',
);
const zip = new JSZip();
zip.file('pack.json', JSON.stringify({ title: 'ZIP pack', questions: [{ text: 'Що на картинці?', answer: 'Квадрат', media: { type: 'image', src: 'img/sq.png' } }] }));
zip.file('img/sq.png', png);
const zipPath = join(tmpdir(), `schdk-smoke-${process.pid}.zip`);
writeFileSync(zipPath, await zip.generateAsync({ type: 'nodebuffer' }));

const browser = await chromium.launch();
const context = await browser.newContext({ locale: 'uk-UA', viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(pathToFileURL(join(root, 'dist/index.html')).href);
console.log('Setup');
await page.setInputFiles('[data-testid=pack-input]', join(root, 'examples/sample-pack.json'));
await page.getByText('2 тур(и), 6 питань').waitFor();
console.log('  ✓ sample pack loaded');

await page.getByText('Додати списком').click();
await page.locator('textarea').fill('Сови\nЗнавці\nЕрудити\nСови');
await page.getByRole('button', { name: 'Додати всі' }).click();
expectEq(await page.locator('.team-list li').count(), 3, 'teams added, duplicate skipped');

await page.getByLabel('Обговорення, секунд').fill('3');
await page.getByLabel('Запис, секунд').fill('2');
await page.screenshot({ path: join(out, '1-setup.png') });
await page.getByRole('button', { name: /Почати гру/ }).click();

console.log('Game');
const [display] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: /Відкрити екран/ }).click()]);
await display.setViewportSize({ width: 1280, height: 720 });
await display.locator('.display-text').waitFor();
expectEq(await display.locator('.display-number').innerText(), 'Питання 1', 'display shows question 1');

await page.locator('body').click({ position: { x: 5, y: 300 } });
await page.keyboard.press('Space');
await page.waitForTimeout(1200);
expectEq(await page.locator('.phase-label').innerText(), 'Обговорення', 'timer running');
await display.screenshot({ path: join(out, '2-display-timer.png') });
await page.waitForTimeout(2300);
expectEq(await display.locator('.timer-label').innerText(), 'Записуйте відповідь', 'writing phase on display');
await page.waitForTimeout(2200);
expectEq(await display.locator('.timer-big').innerText(), 'Час!', 'time up on display');

await page.keyboard.press('Enter');
expectEq(await display.locator('.answer-text').innerText(), 'Кава', 'answer revealed on display');
await page.keyboard.press('1');
await page.keyboard.press('3');
expectEq(await page.locator('.team-toggle.ok').count(), 2, 'two teams marked by keys 1 and 3');
await page.screenshot({ path: join(out, '3-host-answer.png') });
await display.screenshot({ path: join(out, '4-display-answer.png') });

// Question 2: only team 2 answers. Keys work from the display window too.
await display.keyboard.press('ArrowRight');
await display.keyboard.press('Enter');
await display.keyboard.press('2');
expectEq(await page.locator('.team-toggle.ok').count(), 1, 'keys work from the display window');

console.log('Results');
await page.getByRole('button', { name: 'Результати' }).click();
const rows = await page.locator('.results-table tbody tr').evaluateAll((trs) =>
  trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent)).map((c) => [c[0], c[1], c.at(-2), c.at(-1)]),
);
// q1: Сови+Ерудити (rating 2 each); q2: Знавці (rating 3).
expectEq(rows, [['1', 'Знавці', '1', '3'], ['2–3', 'Сови', '1', '2'], ['2–3', 'Ерудити', '1', '2']], 'standings and tie-break');
await page.getByRole('button', { name: /Показати на екрані/ }).click();
await display.locator('.display-results').waitFor();
await page.screenshot({ path: join(out, '5-results.png') });
await display.screenshot({ path: join(out, '6-display-results.png') });

console.log('Reload');
await page.reload();
await page.locator('.results-table').waitFor();
await page.getByText('Знавці').first().waitFor();
expectEq(await page.locator('.brand-sub').innerText(), 'Приклад пакета', 'pack restored from IndexedDB after reload');
expectEq(await page.locator('.results-table tbody tr').count(), 3, 'results restored after reload');

console.log('English');
await page.getByRole('button', { name: 'English' }).click();
await page.getByRole('button', { name: 'Setup' }).click();
await page.getByText('2 round(s), 6 questions').waitFor();
console.log('  ✓ interface switches to English');

console.log('ZIP pack with media');
await page.setInputFiles('[data-testid=pack-input]', zipPath);
await page.getByText('1 round(s), 1 questions').waitFor();
await page.getByRole('button', { name: /Start game/ }).click();
const [display2] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: /Open display/ }).click()]);
const img = display2.locator('img.display-media');
await img.waitFor();
expectEq(await img.evaluate((el) => el.complete && el.naturalWidth), 4, 'ZIP image renders in the display window');
expectEq(await page.locator('.q-dot').count(), 1, 'new pack replaced the old one');

await browser.close();
if (errors.length) fail('console errors:\n' + errors.join('\n'));
console.log(`\nSMOKE OK — screenshots in ${out}`);
