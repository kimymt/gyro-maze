// Prepare the comparison build before running:
// mkdir -p /private/tmp/gyro-tilt-baseline
// git archive 98a96d7ae51f4e238e70eb51521970e5425d459a | tar -x -C /private/tmp/gyro-tilt-baseline
// ln -s /absolute/path/to/gyro-maze/node_modules /private/tmp/gyro-tilt-baseline/node_modules
// Build and preview baseline on 4175, current checkout on 4174, then run this script.
import {createRequire} from 'node:module';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, dirname, join, relative} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import os from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselineRoot = process.env.GYRO_BASELINE_ROOT || '/private/tmp/gyro-tilt-baseline';
const output = process.env.GYRO_STARTUP_OUTPUT || join(root, 'research/tilt-startup-20260914.json');
const require = createRequire(join(root, 'package.json'));
const {chromium} = require('@playwright/test');
const variants = {
  before: {url: process.env.GYRO_BEFORE_URL || 'http://127.0.0.1:4175', root: baselineRoot},
  after: {url: process.env.GYRO_AFTER_URL || 'http://127.0.0.1:4174', root},
};
async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name);
    files.push(...entry.isDirectory() ? await walk(path) : [path]);
  }
  return files.sort();
}
async function fingerprint(directory) {
  const dist = join(directory, 'dist');
  const files = [];
  for (const path of await walk(dist)) {
    const bytes = await readFile(path);
    files.push({path: relative(dist, path), bytes: bytes.length, gzipBytes: gzipSync(bytes).length, sha256: createHash('sha256').update(bytes).digest('hex')});
  }
  const sources = {};
  for (const path of await walk(join(directory, 'src'))) sources[relative(directory, path)] = createHash('sha256').update(await readFile(path)).digest('hex');
  const main = files.find(file => /^assets\/index-.*\.js$/.test(file.path));
  const tilt = files.find(file => /^assets\/tilt-.*\.js$/.test(file.path)) || null;
  const cachedFiles = files.filter(file => !['sw.js', '_headers'].includes(file.path));
  return {files, sources, main, tilt, code: {bytes: main.bytes + (tilt?.bytes || 0), gzipBytes: main.gzipBytes + (tilt?.gzipBytes || 0)},
    cache: {count: cachedFiles.length, bytes: cachedFiles.reduce((sum, file) => sum + file.bytes, 0), separatelyGzippedBytes: cachedFiles.reduce((sum, file) => sum + file.gzipBytes, 0)}};
}
const builds = Object.fromEntries(await Promise.all(Object.entries(variants).map(async ([name, variant]) => [name, await fingerprint(variant.root)])));
const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const contexts = new Map();
const runs = [], primers = [];
async function createSession(variant, condition) {
  const context = await browser.newContext({serviceWorkers: condition === 'cold' ? 'block' : 'allow', viewport: {width: 393, height: 852}, colorScheme: 'light'});
  const page = await context.newPage();
  await context.addInitScript(() => {
    const metrics = window.__startup = {ready: null, swReady: null, lcp: null, orientationListeners: 0, motionListeners: 0, permissionCalls: 0};
    const add = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, ...args) {
      if (this === window && type === 'deviceorientation') metrics.orientationListeners++;
      if (this === window && type === 'devicemotion') metrics.motionListeners++;
      return add.call(this, type, ...args);
    };
    for (const sensor of [window.DeviceOrientationEvent, window.DeviceMotionEvent]) {
      if (sensor?.requestPermission) {
        const request = sensor.requestPermission;
        sensor.requestPermission = function(...args) { metrics.permissionCalls++; return request.apply(this, args); };
      }
    }
    const inspect = () => {
      const start = document.querySelector('.start');
      if (start && !start.disabled && metrics.ready === null) metrics.ready = performance.now();
      if (document.querySelector('#offline-text')?.textContent === 'オフラインで遊べます' && metrics.swReady === null) metrics.swReady = performance.now();
    };
    new MutationObserver(inspect).observe(document, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['disabled']});
    try { new PerformanceObserver(list => { metrics.lcp = list.getEntries().at(-1)?.startTime ?? null; }).observe({type: 'largest-contentful-paint', buffered: true}); } catch {}
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', {cacheDisabled: condition === 'cold'});
  return {context, page, variant, condition};
}
async function measure(session, round, prime = false) {
  if (session.page.isClosed()) session.page = await session.context.newPage();
  const {page, variant, condition} = session;
  const row = {variant, condition, round, prime, error: null};
  try {
    await page.goto(variants[variant].url, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.__startup.ready !== null, undefined, {timeout: 30000});
    if (condition === 'warm') await page.waitForFunction(() => navigator.serviceWorker.controller && window.__startup.swReady !== null, undefined, {timeout: 20000});
    await page.waitForTimeout(350);
    Object.assign(row, await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource');
      const rapier = resources.find(entry => /\/rapier-/.test(entry.name));
      return {...window.__startup, fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
        rapierRequest: rapier?.startTime ?? null, rapierEnd: rapier?.responseEnd ?? null,
        offlineText: document.querySelector('#offline-text')?.textContent ?? null,
        control: document.querySelector('[data-control][aria-pressed="true"]')?.textContent ?? '指で操作 (旧版)',
        controlledByServiceWorker: !!navigator.serviceWorker.controller,
        tiltPageResourceRequests: resources.filter(entry => /\/tilt-/.test(entry.name)).length,
        navigationTransferSize: performance.getEntriesByType('navigation')[0]?.transferSize ?? null,
        resourceTransferSize: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0)};
    }));
  } catch (error) { row.error = error.message; }
  for (const name of ['ready', 'fcp', 'swReady', 'lcp', 'rapierRequest', 'rapierEnd']) if (!Number.isFinite(row[name])) row[name] = null;
  (prime ? primers : runs).push(row);
  console.log(JSON.stringify(row));
  return row;
}
try {
  for (let round = 0; round < 5; round++) for (const variant of round % 2 ? ['after', 'before'] : ['before', 'after']) {
    const session = await createSession(variant, 'cold');
    try { await measure(session, round); } finally { await session.context.close(); }
  }
  for (const variant of ['before', 'after']) {
    const session = await createSession(variant, 'warm'); contexts.set(variant, session);
    await measure(session, null, true);
    await session.page.close();
  }
  for (let round = 0; round < 5; round++) for (const variant of round % 2 ? ['after', 'before'] : ['before', 'after']) {
    const session = contexts.get(variant);
    await measure(session, round);
    await session.page.close();
  }
} finally {
  for (const session of contexts.values()) await session.context.close();
  await browser.close();
}
function median(values) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return null;
  const middle = Math.floor(finite.length / 2);
  return finite.length % 2 ? finite[middle] : (finite[middle - 1] + finite[middle]) / 2;
}
const medians = Object.fromEntries(['cold', 'warm'].map(condition => [condition, Object.fromEntries(['before', 'after'].map(variant => {
  const samples = runs.filter(row => row.condition === condition && row.variant === variant);
  return [variant, Object.fromEntries(['ready', 'fcp', 'swReady', 'lcp'].map(key => [key, {milliseconds: median(samples.map(row => row[key])), validSamples: samples.filter(row => Number.isFinite(row[key])).length}]))];
}))]));
const afterFingerprints = Object.fromEntries(await Promise.all(Object.entries(variants).map(async ([name, variant]) => [name, await fingerprint(variant.root)])));
const buildsUnchanged = JSON.stringify(builds) === JSON.stringify(afterFingerprints);
const report = {
  baselineCommit: '98a96d7ae51f4e238e70eb51521970e5425d459a', timestamp: new Date().toISOString(),
  environment: {node: process.version, chromium: browser.version(), platform: process.platform, osRelease: os.release(), cpu: os.cpus()[0]?.model, viewport: {width: 393, height: 852}},
  conditions: {
    general: 'Desktop headless Chromium with SwiftShader; localhost HTTP; no CPU/network throttling; same installed dependencies; default touch mode; no input performed; five alternating runs per variant per condition. Not iPhone Safari or a real-device acceptance test.',
    cold: 'Fresh browser context for every run; HTTP cache disabled via CDP; service workers blocked. Browser process and OS file cache are shared, so this is not a cold OS or GPU process.',
    warm: 'One persistent context per variant; service worker/cache primed once and ready verified; five alternating revisits in a fresh page within the same context, retaining HTTP and service-worker caches. Pages close between runs so only one game renders at a time. Warm-up navigations are stored separately and excluded from medians.',
    metrics: 'Navigation-relative milliseconds. ready is the first enabled start-button mutation, FCP comes from Paint Timing, SWready is the first app offline-ready text, LCP is the latest value after 350ms post-ready settling. Missing measurements remain null. Browser instrumentation adds small equal observer overhead.',
    limitations: 'Localhost removes real download latency; GPU/software rendering and desktop sensor absence do not predict iPhone startup, battery, heat, or sensor operation. Runs share the machine with other development work; an apparent small difference is not proof of acceleration or regression.'
  },
  buildsUnchanged, builds, runs, primers, medians,
  deltas: {mainGzipBytes: builds.after.main.gzipBytes - builds.before.main.gzipBytes, mainAndTiltGzipBytes: builds.after.code.gzipBytes - builds.before.code.gzipBytes, totalCacheBytes: builds.after.cache.bytes - builds.before.cache.bytes}
};
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({output, buildsUnchanged, medians, deltas: report.deltas}));
if (!buildsUnchanged || runs.some(row => row.error)) process.exitCode = 1;
