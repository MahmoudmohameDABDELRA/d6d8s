/**
 * قياس حجم حزمة الشبكة — الحالي مقابل المحسّن.
 * شغّله: node scripts/net-bench.mjs
 */
const mkP = (L) => ({
  id: 'p'.repeat(36), nickname: 'player123',
  head: { x: 400.123, y: 300.456 },
  segments: Array.from({ length: L }, () => ({ x: Math.random() * 800, y: Math.random() * 600 })),
  angle: 1.5707963, score: 120, isAlive: true, color: '#FF6B6B', isBoosting: false,
});

console.log('الحالي — كل الأجزاء كل تِك:\n');
for (const L of [20, 200]) {
  const bytes = Buffer.byteLength(JSON.stringify({
    timestamp: Date.now(), players: Array.from({ length: 8 }, () => mkP(L)),
  }));
  const gbps = (bytes * 30 * 8 * 125000 * 8) / 1e9;
  console.log(`  ثعبان ${L} جزء: ${(bytes / 1024).toFixed(1)} KB/تِك → 1M لاعب = ${gbps.toFixed(0)} Gbps`);
}

// المحسّن: رأس + زاوية بأرقام صحيحة — العميل يرسم الأجزاء من التاريخ
const opt = { t: Date.now(), p: Array.from({ length: 8 }, () => ({ i: 3, x: 400, y: 300, a: 157, s: 120 })) };
const ob = Buffer.byteLength(JSON.stringify(opt));
console.log(`\nالمحسّن — رأس فقط:\n  ${ob} بايت/تِك → 1M لاعب = ${((ob * 30 * 8 * 125000 * 8) / 1e9).toFixed(1)} Gbps`);
console.log(`\n  التوفير: ${Math.round(Buffer.byteLength(JSON.stringify({timestamp:Date.now(),players:Array.from({length:8},()=>mkP(200))})) / ob)}×`);
