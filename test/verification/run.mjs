// Optional local verification tooling; no browser or GSAP dependency is installed.
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir, cpus, release, platform } from 'node:os';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const reference = resolve(process.env.GSAP_EDITOR_PATH ?? join(root, '../gsap-animation-editor'));
const executable = process.env.BROWSER_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const isReference = pathname.startsWith('/reference/');
    const directory = isReference ? reference : root;
    const relative = isReference ? pathname.slice('/reference/'.length) : pathname.slice(1);
    // Serve only this verification's source files and the read-only reference modules.
    if (!(isReference ? /^(src\/utility|node_modules\/gsap)\// : /^(src|test)\//).test(relative)) throw new Error('Not served');
    let filename = resolve(directory, relative);
    if (!filename.startsWith(directory.replace(/[\\/]$/, '') + sep)) throw new Error('Outside root');
    if (!extname(filename)) filename += '.js';
    response.setHeader('Content-Type', extname(filename) === '.html' ? 'text/html' : 'text/javascript');
    response.setHeader('Cache-Control', 'no-store');
    response.end(await readFile(filename));
  } catch {
    response.writeHead(404).end('Not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'motion-engine-t08-'));
let browser;
let socket;
try {
  browser = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let launchError;
  browser.on('error', (error) => { launchError = error; });
  let port;
  for (let index = 0; index < 100; index += 1) {
    if (launchError) throw launchError;
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!port) throw new Error('Browser debugging endpoint did not start');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (request) {
      clearTimeout(request.timer);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 60000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Page.enable');
  const output = { host: { platform: platform(), release: release(), cpu: cpus()[0].model, logicalProcessors: cpus().length, node: process.version },
    browser: await send('Browser.getVersion'), profiles: [] };
  for (const mobile of [false, true]) {
    const label = mobile ? 'mobile-emulated' : 'desktop';
    console.log(`Running ${label} checks`);
    await send('Emulation.setDeviceMetricsOverride', { width: mobile ? 390 : 1280, height: mobile ? 844 : 800, deviceScaleFactor: mobile ? 3 : 1, mobile });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
    await send('Emulation.setCPUThrottlingRate', { rate: mobile ? 4 : 1 });
    const profileResult = { label, cpuThrottle: mobile ? 4 : 1, fixtures: [] };
    for (const page of ['targetAdapters.browser.html', 'exportAnimation.browser.html', 'verification.browser.html']) {
      await send('Page.navigate', { url: `${origin}/test/${page}` });
      let result;
      for (let attempt = 0; attempt < 150; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        result = await evaluate(`location.pathname === '/test/${page}' ? ${page === 'verification.browser.html' ? 'window.verification' : "document.querySelector('#report')?.textContent"} : null`);
        if (result && result !== 'RUNNING') break;
      }
      if (!result || result === 'RUNNING') throw new Error(`Timed out: ${page}`);
      profileResult.fixtures.push({ page, result });
      console.log(`${label}: ${page} ${typeof result === 'string' ? result : result.error ?? 'complete'}`);
    }
    output.profiles.push(profileResult);
  }
  const destination = process.argv[2];
  if (destination) await writeFile(resolve(destination), JSON.stringify(output, null, 2) + '\n');
  else console.log(JSON.stringify(output, null, 2));
  const failures = output.profiles.flatMap((entry) => entry.fixtures).filter(({ result }) =>
    typeof result === 'string' ? !result.startsWith('PASS') : result.error || result.comparisons.results.some((item) => item.pass === false && !item.observation));
  if (failures.length) process.exitCode = 1;
  await send('Browser.close');
} finally {
  socket?.close();
  browser?.kill();
  server.close();
  // Only remove the unique temporary profile created by this process.
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
