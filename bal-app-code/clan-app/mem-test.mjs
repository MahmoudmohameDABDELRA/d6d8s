/**
 * قياس استهلاك الرام تحت حمل متزايد.
 *
 * السؤال: كم رام يحتاج كل مستخدم متزامن فعلاً؟
 * الجواب يحدّد ما إذا كانت الرام هي السقف — أم المعالج.
 */
import 'dotenv/config';
import { io } from 'socket.io-client';
import { execSync } from 'node:child_process';

const BASE = 'http://127.0.0.1:3000';
const U = JSON.parse(process.env.LIVE_TOKENS);
const fmt = (n, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d });

/** رام عملية السيرفر بالميجابايت */
const serverMem = () => {
  try {
    const out = execSync(
      "ps -eo rss,args --no-headers | grep 'node src/server.js' | grep -v grep | head -1 | awk '{print $1}'",
      { encoding: 'utf8' },
    ).trim();
    return Number(out) / 1024;
  } catch { return 0; }
};

const sysMem = () => {
  const out = execSync("free -m | awk 'NR==2{print $3}'", { encoding: 'utf8' }).trim();
  return Number(out);
};

const cpuPct = () => {
  try {
    const out = execSync(
      "ps -eo pcpu,args --no-headers | grep 'node src/server.js' | grep -v grep | head -1 | awk '{print $1}'",
      { encoding: 'utf8' },
    ).trim();
    return Number(out);
  } catch { return 0; }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║        قياس الرام والمعالج تحت حمل متزايد                  ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

const baseline = serverMem();
console.log(`  خط الأساس: السيرفر ${fmt(baseline)}MB · النظام ${fmt(sysMem())}MB مستخدم\n`);

// ════════════════════════════════════════════════
//  ١ · اتصالات HTTP متزامنة
// ════════════════════════════════════════════════

console.log('━━━ ١ · طلبات HTTP متزامنة ━━━\n');
console.log('  تزامن    رام السيرفر   الزيادة    CPU     req/s');
console.log('  ' + '─'.repeat(52));

const httpRows = [];

for (const c of [10, 50, 100, 200, 400]) {
  let done = 0;
  const total = c * 10;
  const t0 = Date.now();

  const worker = async () => {
    while (done < total) {
      done += 1;
      try {
        const r = await fetch(`${BASE}/api/goals`, {
          headers: { Authorization: `Bearer ${U.ahmed.token}` },
        });
        await r.arrayBuffer();
      } catch { /* ignore */ }
    }
  };

  const runners = Promise.all(Array.from({ length: c }, worker));
  await sleep(700);
  const memDuring = serverMem();
  const cpu = cpuPct();
  await runners;

  const rps = total / ((Date.now() - t0) / 1000);
  httpRows.push({ c, mem: memDuring, delta: memDuring - baseline, cpu, rps });

  console.log(
    `  ${String(c).padStart(5)}   ${fmt(memDuring).padStart(8)}MB  ` +
    `${(memDuring - baseline >= 0 ? '+' : '') + fmt(memDuring - baseline)}MB`.padStart(10) +
    `  ${fmt(cpu).padStart(5)}%  ${fmt(rps).padStart(7)}`,
  );
  await sleep(600);
}

// ════════════════════════════════════════════════
//  ٢ · اتصالات WebSocket — الأثقل على الرام
// ════════════════════════════════════════════════

console.log('\n━━━ ٢ · اتصالات WebSocket مفتوحة ━━━\n');
console.log('  سوكت     رام السيرفر   الزيادة    KB/اتصال');
console.log('  ' + '─'.repeat(50));

const sockets = [];
const wsBase = serverMem();
const wsRows = [];

const connect = (token) =>
  new Promise((resolve) => {
    const s = io(`ws://127.0.0.1:3000/chat`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      timeout: 10000,
    });
    const t = setTimeout(() => resolve(null), 11000);
    s.on('connect', () => { clearTimeout(t); resolve(s); });
    s.on('connect_error', () => { clearTimeout(t); resolve(null); });
  });

for (const target of [25, 50, 100, 200]) {
  const need = target - sockets.length;
  const batch = await Promise.all(
    Array.from({ length: need }, () => connect(U.ahmed.token)),
  );
  batch.filter(Boolean).forEach((s) => sockets.push(s));

  await sleep(1200);
  const m = serverMem();
  const live = sockets.filter((s) => s.connected).length;
  const perConn = live > 0 ? ((m - wsBase) * 1024) / live : 0;

  wsRows.push({ target, live, mem: m, perConn });
  console.log(
    `  ${String(live).padStart(5)}   ${fmt(m).padStart(8)}MB  ` +
    `${'+' + fmt(m - wsBase)}MB`.padStart(10) +
    `   ${fmt(perConn).padStart(6)} KB`,
  );
}

const avgPerConn = wsRows.at(-1).perConn;
sockets.forEach((s) => s.close());
await sleep(1500);
const afterClose = serverMem();

console.log(`\n  بعد الإغلاق: ${fmt(afterClose)}MB ` +
            `(${afterClose - wsBase < 20 ? '✅ الذاكرة تُحرَّر' : '⚠️ تسرّب محتمل'})`);

// ════════════════════════════════════════════════
//  ٣ · الخلاصة والاستقراء
// ════════════════════════════════════════════════

const peakMem = Math.max(...httpRows.map((r) => r.mem));
const peakCpu = Math.max(...httpRows.map((r) => r.cpu));
const bestRps = Math.max(...httpRows.map((r) => r.rps));

console.log('\n' + '═'.repeat(60));
console.log('  القياس');
console.log('═'.repeat(60));
console.log(`  رام السيرفر خاملاً:      ${fmt(baseline)}MB`);
console.log(`  ذروة الرام تحت الحمل:    ${fmt(peakMem)}MB`);
console.log(`  ذروة المعالج:            ${fmt(peakCpu)}%`);
console.log(`  أقصى إنتاجية:            ${fmt(bestRps)} req/s`);
console.log(`  رام لكل سوكت مفتوح:      ${fmt(avgPerConn)} KB`);
console.log('═'.repeat(60));

console.log('__JSON__' + JSON.stringify({
  baseline, peakMem, peakCpu, bestRps, perConnKB: avgPerConn,
  cores: 2,
}));

process.exit(0);
