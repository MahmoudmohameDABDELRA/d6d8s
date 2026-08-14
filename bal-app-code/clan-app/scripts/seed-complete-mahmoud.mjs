import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import prisma from '../src/config/prisma.js';
import env from '../src/config/env.js';

async function main() {
  console.log('🌱 بدء زرع وتجهيز بيئة المستخدم محمود بالكامل...');

  const hashedPassword = await argon2.hash('P@ssword2026!');

  // 1. User
  const mahmoud = await prisma.user.upsert({
    where: { email: 'mahmoud@clan.app' },
    update: {
      username: 'mahmoud',
      domain: 'TECH',
      specialty: 'SOFTWARE_DEV',
      onboarded: true,
      sparksBalance: 1250,
      totalSparksEarned: 2480,
      currentStreak: 14,
      longestStreak: 21,
      totalFocusMin: 1840,
      shieldsRemaining: 2,
      isVerified: true,
      timezone: 'Africa/Cairo',
      role: 'ADMIN',
      bio: 'مهندس برمجيات شغوف بالأنظمة الموزعة والتصميم الفاخر',
      customStatus: 'يبني معمارية Clan App ⚡',
      statusEmoji: '💻',
    },
    create: {
      id: 'demo-mahmoud-id',
      username: 'mahmoud',
      email: 'mahmoud@clan.app',
      password: hashedPassword,
      authProvider: 'GOOGLE',
      domain: 'TECH',
      specialty: 'SOFTWARE_DEV',
      onboarded: true,
      sparksBalance: 1250,
      totalSparksEarned: 2480,
      currentStreak: 14,
      longestStreak: 21,
      totalFocusMin: 1840,
      shieldsRemaining: 2,
      isVerified: true,
      timezone: 'Africa/Cairo',
      role: 'ADMIN',
      bio: 'مهندس برمجيات شغوف بالأنظمة الموزعة والتصميم الفاخر',
      customStatus: 'يبني معمارية Clan App ⚡',
      statusEmoji: '💻',
    },
  });

  // 2. Battle Alarms
  await prisma.battleAlarm.deleteMany({ where: { userId: mahmoud.id } });
  
  const alarm1 = await prisma.battleAlarm.create({
    data: {
      userId: mahmoud.id,
      time: '05:30',
      days: [0, 1, 2, 3, 4, 5, 6],
      isActive: true,
      requireProof: true,
      wakeStreak: 14,
      longestWakeStreak: 21,
    },
  });

  const alarm2 = await prisma.battleAlarm.create({
    data: {
      userId: mahmoud.id,
      time: '09:00',
      days: [0, 1, 2, 3, 4, 5, 6],
      isActive: true,
      requireProof: true,
      wakeStreak: 8,
      longestWakeStreak: 15,
    },
  });

  // 3. Wake Logs
  await prisma.wakeLog.deleteMany({ where: { userId: mahmoud.id } });
  
  await prisma.wakeLog.createMany({
    data: [
      {
        userId: mahmoud.id,
        alarmId: alarm1.id,
        date: new Date(Date.now() - 86400000 * 2),
        scheduledTime: '05:30',
        wokeAt: new Date(Date.now() - 86400000 * 2),
        responseSec: 12,
        result: 'WOKE',
        solvedTask: true,
      },
      {
        userId: mahmoud.id,
        alarmId: alarm1.id,
        date: new Date(Date.now() - 86400000),
        scheduledTime: '05:30',
        wokeAt: new Date(Date.now() - 86400000),
        responseSec: 8,
        result: 'WOKE',
        solvedTask: true,
      },
      {
        userId: mahmoud.id,
        alarmId: alarm1.id,
        date: new Date(),
        scheduledTime: '05:30',
        wokeAt: new Date(),
        responseSec: 5,
        result: 'WOKE',
        solvedTask: true,
      },
    ],
  });

  // 4. Tasks
  await prisma.task.deleteMany({ where: { userId: mahmoud.id } });
  
  await prisma.task.createMany({
    data: [
      {
        userId: mahmoud.id,
        title: 'بناء معمارية المشروع وربط المقابس 🏛️',
        priority: 'CRITICAL',
        isCompleted: false,
        dueDate: new Date(),
      },
      {
        userId: mahmoud.id,
        title: 'مراجعة مسائل الفيزياء وقوانين نيوتن ⚛️',
        priority: 'GROWTH',
        isCompleted: false,
        dueDate: new Date(),
      },
      {
        userId: mahmoud.id,
        title: 'الرد على إيميلات الموردين والعملاء ⚡',
        priority: 'QUICK',
        isCompleted: true,
        dueDate: new Date(),
      },
    ],
  });

  // 5. Focus Sessions
  await prisma.focusSession.deleteMany({ where: { userId: mahmoud.id } });
  
  await prisma.focusSession.createMany({
    data: [
      {
        userId: mahmoud.id,
        plannedMin: 45,
        clientReportedMin: 45,
        serverVerifiedMin: 45,
        earnedSparks: 25,
        status: 'COMPLETED',
        startedAt: new Date(Date.now() - 7200000),
        endedAt: new Date(Date.now() - 4500000),
      },
      {
        userId: mahmoud.id,
        plannedMin: 30,
        clientReportedMin: 30,
        serverVerifiedMin: 30,
        earnedSparks: 15,
        status: 'COMPLETED',
        startedAt: new Date(Date.now() - 14400000),
        endedAt: new Date(Date.now() - 12600000),
      },
    ],
  });

  // 6. Active Goal & Weekly Journal
  await prisma.goalWeek.deleteMany({ where: { goal: { userId: mahmoud.id } } });
  await prisma.goal.deleteMany({ where: { userId: mahmoud.id } });

  const activeGoal = await prisma.goal.create({
    data: {
      userId: mahmoud.id,
      title: 'إتقان معمارية الأنظمة الموزعة وإطلاق النسخة الأولى',
      vision: 'بناء تطبيق إنتاجية عالمي عالي التوسع',
      pledge: 'بلتزم ٨ أسابيع مهما حصل لإتقان معمارية الأنظمة 🏛️',
      currentWeek: 2,
      isActive: true,
      isPrimary: true,
      weeks: {
        create: [
          {
            weekNumber: 1,
            title: 'تصميم هيكل قاعدة البيانات وتدقيق المقابس',
            status: 'DOCUMENTED',
            reflection: 'أنجزت هيكل قاعدة البيانات وتدقيق الـ Indexes',
            learnings: 'التعامل مع الـ Transactions الذرية في PostgreSQL',
            mistakes: 'سهرت زيادة يوم الثلاثاء وعوضت الأربعاء',
            futureNote: 'يا محمود بعد شهر افتكر تعبك في البداية!',
            documentedAt: new Date(Date.now() - 86400000 * 7),
            lockedAt: new Date(Date.now() - 86400000 * 7 + 300000),
          },
          {
            weekNumber: 2,
            title: 'بناء واجهات النخبة وتدقيق الأداء والتكامل',
            status: 'OPEN',
          },
          {
            weekNumber: 3,
            title: 'إطلاق النسخة التجريبية الأولى للكتيبة',
            status: 'OPEN',
          },
          {
            weekNumber: 4,
            title: 'تدقيق الأداء والأمان ومكافحة التشتيت',
            status: 'OPEN',
          },
        ],
      },
    },
  });

  // 7. Token Generation (Valid for 30 days)
  const token = jwt.sign({ userId: mahmoud.id }, env.jwt.accessSecret, { expiresIn: '30d' });
  console.log('TOKEN_VALUE_START=' + token + '=TOKEN_VALUE_END');
  console.log('✅ اكتمل تجهيز وزرع قاعدة البيانات للمستخدم محمود بما فيه الهدف الأسبوعي والتوثيق!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
