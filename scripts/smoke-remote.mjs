// End-to-end test of the tablet → smartboard link, using the real Java screen server from the
// Android app. The "tablet" page is opened over loopback (as the app's WebView does) and the
// "board" page over the machine's network address (as a smartboard on the Wi-Fi would).
// Usage: npm run build && npm run smoke:remote [-- <screenshot dir>]
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import JSZip from 'jszip';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = resolve(import.meta.dirname, '..');
const out = resolve(process.argv[2] ?? join(root, 'smoke-output'));
mkdirSync(out, { recursive: true });
const PORT = 8790;

const fail = (msg) => {
  throw new Error('SMOKE FAIL: ' + msg);
};
const expectEq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  console.log(`  ✓ ${what}`);
};

// Build and start the server exactly as the app ships it.
const classes = mkdtempSync(join(tmpdir(), 'schdk-server-'));
execFileSync('javac', ['-d', classes, join(root, 'android/app/src/main/java/app/schdk/host/ScreenServer.java')], { stdio: 'inherit' });
const server = spawn('java', ['-cp', classes, 'app.schdk.host.ScreenServer', join(root, 'dist/index.html'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
const urls = await new Promise((res, rej) => {
  let buf = '';
  server.stdout.on('data', (d) => {
    buf += d;
    if (/listening on \d+\n(\s+http\S+\n)+/.test(buf) || /listening on \d+\n/.test(buf)) setTimeout(() => res(buf), 300);
  });
  server.on('exit', (c) => rej(new Error('server exited ' + c)));
});
const lanUrl = urls.match(/http:\/\/(?!127\.)[\d.]+:\d+\/display/)?.[0];
if (!lanUrl) fail('server printed no LAN address:\n' + urls);
console.log('Server up; board URL', lanUrl);

// A pack with a ZIP image, to check media goes through the server.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGP4z8AARAwMDAwAAP8E/4vEVbcAAAAASUVORK5CYII=', 'base64');
const zip = new JSZip();
zip.file(
  'pack.json',
  JSON.stringify({
    title: 'Remote test',
    questions: [
      { text: 'Який напій відкрив пастух Калді? [Ка́лді]', answer: 'Кава', hostNote: 'Ведучим: читати повільно', answerMedia: { type: 'image', src: 'sq.png' } },
      { text: 'Що на картинці?', answer: 'Квадрат', media: { type: 'image', src: 'sq.png' } },
    ],
  }),
);
zip.file('sq.png', png);
const zipPath = join(tmpdir(), `schdk-remote-${process.pid}.zip`);
writeFileSync(zipPath, await zip.generateAsync({ type: 'nodebuffer' }));

const browser = await chromium.launch();
const errors = [];
try {
  // ---- tablet
  const tablet = await (await browser.newContext({ locale: 'uk-UA', viewport: { width: 1280, height: 800 }, hasTouch: true })).newPage();
  tablet.on('pageerror', (e) => errors.push('tablet: ' + e));
  await tablet.goto(`http://127.0.0.1:${PORT}/`);
  await tablet.setInputFiles('[data-testid=pack-input]', zipPath);
  await tablet.getByText('1 тур(и), 2 питань').waitFor();
  await tablet.getByPlaceholder('Назва команди').fill('Сови');
  await tablet.keyboard.press('Enter');
  await tablet.getByPlaceholder('Назва команди').fill('Знавці');
  await tablet.keyboard.press('Enter');
  await tablet.getByLabel('Обговорення, секунд').fill('3');
  await tablet.getByLabel('Додатковий час на запис відповіді').uncheck();
  await tablet.getByRole('button', { name: /Почати гру/ }).click();

  console.log('Tablet');
  await tablet.getByTestId('remote-button').click();
  const shown = await tablet.getByTestId('remote-url').allInnerTexts();
  expectEq(shown.includes(lanUrl), true, 'tablet shows the board link and QR code');
  expectEq(await tablet.locator('.qr svg').count() > 0, true, 'QR code rendered');

  // ---- board
  console.log('Board');
  const board = await (await browser.newContext({ locale: 'en-US', viewport: { width: 1920, height: 1080 }, hasTouch: true })).newPage();
  board.on('pageerror', (e) => errors.push('board: ' + e));
  await board.goto(lanUrl);
  await board.getByRole('button', { name: /Торкніться/ }).tap();
  await board.locator('.display-text').waitFor();
  expectEq(await board.locator('.display-text').innerText(), 'Який напій відкрив пастух Калді?', 'board shows question 1 (in the tablet’s language)');
  await tablet.getByTestId('remote-count').getByText('Дошка підключена (1)').waitFor({ timeout: 6000 });
  console.log('  ✓ tablet sees the board connected');
  await tablet.screenshot({ path: join(out, 'remote-1-tablet-link.png') });
  await tablet.getByRole('button', { name: 'Закрити' }).click();

  expectEq(await board.evaluate(async () => (await fetch('/api/info')).status), 403, 'board cannot get the control token');
  expectEq(
    await board.evaluate(async () => (await fetch('/api/model', { method: 'POST', body: '{}' })).status),
    403,
    'board cannot send commands',
  );
  if ((await board.locator('body').innerText()).includes('Кава')) fail('answer on the board before reveal');
  if (await board.locator('img').count()) fail('answer image on the board before reveal');
  if ((await board.locator('body').innerText()).includes('Ведучим')) fail('host note on the board');
  console.log('  ✓ no answer, answer image or host note on the board before reveal');

  console.log('Timer and answer');
  await tablet.locator('body').click({ position: { x: 5, y: 400 } });
  await tablet.keyboard.press('Space');
  await board.locator('.timer-big').waitFor();
  await board.waitForTimeout(800);
  const t = Number(await board.locator('.timer-big').innerText());
  expectEq(t >= 1 && t <= 3, true, `board counts down (${t})`);
  await board.screenshot({ path: join(out, 'remote-2-board-timer.png') });
  await board.getByText('Час!').waitFor({ timeout: 6000 });
  console.log('  ✓ time up on the board');
  await tablet.keyboard.press('Enter');
  await board.locator('.answer-text').waitFor();
  expectEq(await board.locator('.answer-text').innerText(), 'Кава', 'answer shown on the board after reveal');
  await board.waitForFunction(() => {
    const i = document.querySelector('.display-answer img');
    return i && i.complete && i.naturalWidth === 4;
  });
  console.log('  ✓ answer image shown on the board after reveal');
  await tablet.keyboard.press('1');

  console.log('Media');
  await tablet.keyboard.press('ArrowRight');
  const img = board.locator('img.display-media');
  await img.waitFor();
  await board.waitForFunction(() => {
    const i = document.querySelector('img.display-media');
    return i && i.complete && i.naturalWidth === 4;
  });
  expectEq(await img.getAttribute('src').then((s) => s.startsWith('/api/media')), true, 'question image served to the board by the tablet');
  if ((await board.locator('body').innerText()).includes('Квадрат')) fail('next answer on the board before reveal');

  console.log('Results');
  await tablet.keyboard.press('t');
  await board.locator('.display-results').waitFor();
  expectEq(await board.locator('.display-results tbody tr').first().innerText().then((s) => s.split('\t')[1]), 'Сови', 'results table on the board');
  await board.screenshot({ path: join(out, 'remote-3-board-results.png') });

  console.log('Reconnect');
  await board.reload();
  await board.locator('.display-results').waitFor();
  console.log('  ✓ board catches up after reloading');
} finally {
  await browser.close();
  server.kill();
}
if (errors.length) fail('page errors:\n' + errors.join('\n'));
console.log(`\nREMOTE SMOKE OK — screenshots in ${out}`);
