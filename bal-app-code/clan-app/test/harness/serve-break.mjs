/**
 * السيرفر بساعة مزاحة لوقت الراحة — لفحص الألعاب.
 * الإزاحة بتتحسب عشان نقع في BREAK_1 (دقيقة 35-45 من الدورة).
 */
const now = new Date();
const cycleStart = new Date(now);
cycleStart.setUTCMinutes(0, 0, 0);
cycleStart.setUTCHours(Math.floor(cycleStart.getUTCHours() / 2) * 2);

const intoCycle = Math.floor((now - cycleStart) / 60_000);
//  نستهدف دقيقة 38 (نص BREAK_1) — بعيد عن الحواف
const offset = 38 - intoCycle;

process.env.FAKE_CLOCK_OFFSET_MIN = String(offset);
console.log(`FAKE_CLOCK +${offset}min → دقيقة 38 (BREAK_1)`);

await import('./fake-clock.mjs');
await import('./serve.mjs');
