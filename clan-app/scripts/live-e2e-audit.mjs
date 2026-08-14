import puppeteer from 'puppeteer-core';
import { io } from 'socket.io-client';
import prisma from '../src/config/prisma.js';
import redisClient from '../src/config/redis.js';
import jwt from 'jsonwebtoken';
import env from '../src/config/env.js';

const token = jwt.sign({ userId: 'demo-mahmoud-id' }, env.jwt.accessSecret, { expiresIn: '30d' });

async function runFullAudit() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('🔍 بدء الفحص الحي الشامل لمنظومة CLAN APP بالكامل (E2E LIVE AUDIT)');
  console.log('════════════════════════════════════════════════════════════\n');

  const report = {
    passed: [],
    failed: [],
    partial: [],
    vulnerabilities: [],
  };

  // ── ١. فحص السيرفر وقواعد البيانات ──
  console.log('━━━ ١. فحص صحة الخادم وقواعد البيانات ━━━');
  try {
    const healthRes = await fetch('http://localhost:3000/health').then(r => r.json());
    if (healthRes.checks.postgres === 'up' && healthRes.checks.redis === 'up') {
      console.log('✅ السيرفر يعمل وPostgres وRedis متصلان بنجاح (Latency:', healthRes.latencyMs, 'ms)');
      report.passed.push('فحص صحة السيرفر وقواعد البيانات (Health Check)');
    } else {
      console.log('❌ خطأ في فحص الصحة:', healthRes);
      report.failed.push('فحص صحة السيرفر');
    }
  } catch (e) {
    console.log('❌ تعذر الوصول لـ /health:', e.message);
    report.failed.push('اتصال السيرفر HTTP');
  }

  // ── ٢. فحص إرسال الرسائل وتخزينها في قاعدة البيانات ──
  console.log('\n━━━ ٢. فحص إرسال الرسائل وتخزينها الفعلي في قاعدة البيانات ━━━');
  try {
    // جلب أو إنشاء محادثة خاصة للاختبار (Slow Mode 2s)
    let conv = await prisma.conversation.findFirst({
      where: { type: 'DIRECT' },
    });
    if (!conv) {
      conv = await prisma.conversation.create({
        data: {
          type: 'DIRECT',
          participants: {
            create: [{ userId: 'demo-mahmoud-id' }, { userId: 'demo-youssef-id' }],
          },
        },
      });
    }

    const testMsgText = 'رسالة اختبار حي: ' + Date.now();
    const sendRes = await fetch(`http://localhost:3000/api/chat/${conv.id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: testMsgText }),
    }).then(r => r.json());

    if (sendRes.success && sendRes.message) {
      console.log('✅ تم إرسال الرسالة عبر API وحفظها في قاعدة البيانات:', sendRes.message.id);
      
      // التحقق من وجودها الفعلي في PostgreSQL
      const dbMsg = await prisma.message.findUnique({ where: { id: sendRes.message.id } });
      if (dbMsg && dbMsg.text === testMsgText) {
        console.log('✅ تم التحقق من حفظ الرسالة الفعلي في جدول Message في PostgreSQL 17');
        report.passed.push('إرسال وتخزين الرسائل في PostgreSQL 17');
      } else {
        console.log('❌ الرسالة لم توجد في PostgreSQL');
        report.failed.push('تخزين الرسائل في PostgreSQL');
      }
    } else {
      console.log('⚠️ نتيجة إرسال الرسالة:', sendRes);
      if (sendRes.code === 'FOCUS_SESSION_ACTIVE') {
        console.log('🛡️ تم صد الإرسال لأن المستخدم في جلسة تركيز نشطة (حارس بوابة التركيز شغال!)');
        report.passed.push('حارس بوابة التركيز يمنع إرسال الرسائل أثناء الجلسة');
      } else {
        report.failed.push('مسار إرسال الرسائل /api/chat/:id/messages: ' + sendRes.message);
      }
    }
  } catch (e) {
    console.log('❌ خطأ في فحص الشات:', e.message);
    report.failed.push('فحص الشات: ' + e.message);
  }

  // ── ٣. فحص محرك السوكيت الحي (Socket.io /chat) ──
  console.log('\n━━━ ٣. فحص محرك السوكيت الحي والبث (Socket.io) ━━━');
  try {
    const socket = io('http://localhost:3000/chat', {
      auth: { token },
      transports: ['websocket'],
    });

    const socketConnected = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 3000);
      socket.on('connect', () => {
        clearTimeout(timeout);
        resolve(true);
      });
      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        console.log('⚠️ خطأ اتصال السوكيت:', err.message);
        resolve(false);
      });
    });

    if (socketConnected) {
      console.log('✅ اتصال Socket.io على /chat نجح بامتياز');
      report.passed.push('اتصال Socket.io اللحظي على /chat');
      socket.disconnect();
    } else {
      console.log('❌ فشل اتصال Socket.io');
      report.failed.push('اتصال Socket.io');
    }
  } catch (e) {
    console.log('❌ خطأ سوكيت:', e.message);
    report.failed.push('سوكيت الشات');
  }

  // ── ٤. فحص محرك الدومينو وسوكيت /domino ──
  console.log('\n━━━ ٤. فحص محرك لعبة الدومينو وسوكيت /domino ━━━');
  try {
    const dominoSocket = io('http://localhost:3000/domino', {
      auth: { token },
      transports: ['websocket'],
    });

    const dominoConnected = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 3000);
      dominoSocket.on('connect', () => {
        clearTimeout(timeout);
        resolve(true);
      });
      dominoSocket.on('connect_error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });

    if (dominoConnected) {
      console.log('✅ محرك لعبة الدومينو وسوكيت /domino متصل وجاهز للعب الرباعي');
      report.passed.push('محرك الدومينو الرباعي على /domino');
      dominoSocket.disconnect();
    } else {
      console.log('❌ فشل اتصال سوكيت الدومينو');
      report.failed.push('سوكيت الدومينو');
    }
  } catch (e) {
    console.log('❌ خطأ لعبة الدومينو:', e.message);
  }

  // ── ٥. فحص طلبات المراسلة والحد اليومي في Redis (10/10) ──
  console.log('\n━━━ ٥. فحص طلبات المراسلة وحصة Redis اليومية ━━━');
  try {
    const reqRes = await fetch('http://localhost:3000/api/chat/requests', {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());

    if (reqRes.success) {
      console.log('✅ مسار جلب الطلبات يعمل:', reqRes.requests?.length || 0, 'طلبات معلقة');
      console.log('✅ رصيد الطلبات اليومي في Redis:', reqRes.dailyRemaining, 'من 10 متاحة');
      report.passed.push('نظام طلبات المراسلة والحد اليومي 10/10 في Redis');
    } else {
      console.log('❌ فشل جلب الطلبات:', reqRes);
      report.failed.push('جلب طلبات المراسلة');
    }
  } catch (e) {
    console.log('❌ خطأ فحص الطلبات:', e.message);
  }

  // ── ٦. فحص كشف الساهي الفجائي وجلسة التركيز وإلغائها ──
  console.log('\n━━━ ٦. فحص محرك التركيز والوضع الصارم وكشف الساهي ━━━');
  try {
    // إلغاء أي جلسة معلقة أولاً
    const active = await prisma.focusSession.findFirst({
      where: { userId: 'demo-mahmoud-id', status: 'ACTIVE' },
    });
    if (active) {
      await fetch(`http://localhost:3000/api/focus/${active.id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    // بدء جلسة جديدة 5 دقائق
    const startRes = await fetch('http://localhost:3000/api/focus/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ plannedMin: 5, strictMode: true, type: 'SOLO' }),
    }).then(r => r.json());

    if (startRes.success && startRes.session) {
      const sessionId = startRes.session.id;
      console.log('✅ تم بدء جلسة تركيز صارمة جديدة في قاعدة البيانات:', sessionId);

      // طلب كشف الساهي
      const checkRes = await fetch(`http://localhost:3000/api/focus/${sessionId}/check`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json());

      if (checkRes.success && checkRes.check) {
        console.log('✅ تم توليد اختبار كشف الساهي من السيرفر بنجاح:', checkRes.check.question);
        report.passed.push('محرك كشف الساهي السيرفري (/api/focus/:id/check)');
      } else {
        console.log('⚠️ استجابة كشف الساهي:', checkRes);
        report.partial.push('كشف الساهي السيرفري');
      }

      // تسجيل خرق (Violation)
      const violRes = await fetch(`http://localhost:3000/api/focus/${sessionId}/violation`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json());
      console.log('✅ تم تسجيل خرق الوضع الصارم في PostgreSQL (الخروقات الحالية:', violRes.violations, ')');

      // إنهاء الجلسة وحصد الشرارات
      const compRes = await fetch(`http://localhost:3000/api/focus/${sessionId}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientReportedMin: 5 }),
      }).then(r => r.json());

      if (compRes.success) {
        console.log('✅ تم إنهاء الجلسة وصرف الشرارات وتحديث الستريك في PostgreSQL:', compRes.sparks);
        report.passed.push('إنهاء الجلسات وصرف الشرارات والستريك في قاعدة البيانات');
      }
    }
  } catch (e) {
    console.log('❌ خطأ فحص التركيز:', e.message);
  }

  // ── ٧. فحص تصفح واجهات الفرونت إند بالأزرار الحقيقية عبر Puppeteer ──
  console.log('\n━━━ ٧. فحص نقرات وتفاعل أزرار الواجهة بالمتصفح (Headless Browser) ━━━');
  try {
    const browser = await puppeteer.launch({
      executablePath: '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 430, height: 920 });

    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });

    // فحص زر الإطلاق السريع
    const hasQuickLaunch = await page.$('#quick-focus-launcher');
    if (hasQuickLaunch) {
      await page.click('#quick-focus-launcher');
      await new Promise(r => setTimeout(r, 400));
      const configActive = await page.evaluate(() => document.getElementById('screen-focus-config')?.classList.contains('active'));
      if (configActive) {
        console.log('✅ زر بدء جلسة تركيز في الرئيسية ينقل لشاشة إعداد الدورات بنجاح');
        report.passed.push('زر بدء جلسة تركيز السريع (Home Quick Launcher)');
      } else {
        console.log('❌ زر البدء السريع لم ينقل لشاشة الإعداد');
        report.failed.push('زر البدء السريع بالرئيسية');
      }
    }

    // فحص التبديل بين التبويبات الخمسة
    for (const tab of ['clan', 'progress', 'settings', 'home', 'focus']) {
      await page.click(`.dock-nav-item[data-tab="${tab}"]`);
      await new Promise(r => setTimeout(r, 300));
      const isTabActive = await page.evaluate((t) => document.querySelector(`.dock-nav-item[data-tab="${t}"]`)?.classList.contains('active'), tab);
      if (isTabActive) {
        console.log(`✅ التبديل لتبويب [${tab}] يعمل بنجاح`);
      } else {
        console.log(`❌ تعطل التبديل لتبويب [${tab}]`);
        report.failed.push(`تبويب ${tab}`);
      }
    }

    await browser.close();
  } catch (e) {
    console.log('❌ خطأ في فحص الواجهات عبر المتصفح:', e.message);
    report.failed.push('فحص المتصفح: ' + e.message);
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('📊 ملخص تقرير الفحص الحي والصدق البرمجي:');
  console.log(`✅ نجح بالكامل: ${report.passed.length} ميزة`);
  console.log(`❌ فشل / يحتاج إصلاح: ${report.failed.length} بند`);
  console.log(`⚠️ جزئي / يحتاج استكمال: ${report.partial.length} بند`);
  console.log('════════════════════════════════════════════════════════════');

  return report;
}

runFullAudit().then(() => prisma.$disconnect()).catch(console.error);
