import prisma from '../src/config/prisma.js';
import argon2 from 'argon2';

async function seedDemo() {
  console.log('🌟 Seeding Mahmoud demo profile and Clan environment...');

  // 1. Create or upsert Mahmoud
  const hashedPassword = await argon2.hash('P@ssword2026!');
  
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
      bio: 'مهندس برمجيات شغوف بالأنظمة الموزعة والتصميم الفاخر',
      customStatus: 'يبني معمارية Clan App ⚡',
      statusEmoji: '💻',
    },
  });

  // 2. Create Global Tech Clan "مسار التقنية"
  const techClan = await prisma.clan.upsert({
    where: {
      type_category: {
        type: 'GLOBAL',
        category: 'TECH',
      },
    },
    update: {
      name: 'مسار التقنية',
      description: 'كتيبة صناع وهندسة البرمجيات والذكاء الاصطناعي',
      category: 'TECH',
      type: 'GLOBAL',
    },
    create: {
      id: 'clan-tech-global-id',
      name: 'مسار التقنية',
      description: 'كتيبة صناع وهندسة البرمجيات والذكاء الاصطناعي',
      category: 'TECH',
      type: 'GLOBAL',
    },
  });

  // Membership
  const existingMember = await prisma.clanMember.findFirst({
    where: { userId: mahmoud.id, clanId: techClan.id },
  });
  if (!existingMember) {
    await prisma.clanMember.create({
      data: {
        userId: mahmoud.id,
        clanId: techClan.id,
        role: 'MEMBER',
      },
    });
  }

  // 3. Create Critical Task "بناء معمارية المشروع"
  const existingTask = await prisma.task.findFirst({
    where: { userId: mahmoud.id, title: 'بناء معمارية المشروع' },
  });

  if (!existingTask) {
    await prisma.task.create({
      data: {
        userId: mahmoud.id,
        title: 'بناء معمارية المشروع',
        priority: 'CRITICAL',
        dueDate: new Date(),
        isCompleted: false,
        steps: {
          create: [
            { title: 'تصميم هيكل قاعدة البيانات وتدقيق الـ Indexes', isCompleted: true, orderIndex: 1 },
            { title: 'بناء محرك الـ REST APIs وحماية الـ Rate Limiting', isCompleted: true, orderIndex: 2 },
            { title: 'تنفيذ واجهات الشاشة الرئيسية ومساحة التركيز HUD', isCompleted: false, orderIndex: 3 },
            { title: 'ربط WebSockets للـ Squad Presence و ردهة التركيز', isCompleted: false, orderIndex: 4 },
            { title: 'إجراء الاختبارات الحية وضمان سلاسة الـ 0ms', isCompleted: false, orderIndex: 5 },
          ],
        },
      },
    });
  }

  // 4. Create Official Audio Tracks in Catalog
  const tracks = [
    {
      title: 'Lo-Fi Focus',
      description: 'إيقاعات لو-فاي دافئة ومحفزة للتركيز الذهني المستمر',
      category: 'LOFI',
      sparksCost: 0,
      sourceUrl: 'procedural-synth-lofi',
      previewUrl: 'procedural-synth-lofi',
      durationSec: 1800,
      isActive: true,
    },
    {
      title: 'أصوات مطر وغابة هادئة',
      description: 'قطرات مطر طبيعية مع حفيف أوراق الشجر للهدوء التام',
      category: 'NATURE',
      sparksCost: 0,
      sourceUrl: 'procedural-synth-rain',
      previewUrl: 'procedural-synth-rain',
      durationSec: 3600,
      isActive: true,
    },
    {
      title: 'موجات بيتا 40Hz الحادة',
      description: 'ترددات ثنائية ترفع مستوى التركيز واليقظة الذهنية الفائقة',
      category: 'BINAURAL',
      sparksCost: 30,
      sourceUrl: 'procedural-synth-beta',
      previewUrl: 'procedural-synth-beta',
      durationSec: 1800,
      isActive: true,
    },
    {
      title: 'أجواء زن وأجراس تيبتية',
      description: 'رنين نقي متناغم لتصفية الذهن قبل وأثناء فترات البناء',
      category: 'AMBIENT',
      sparksCost: 30,
      sourceUrl: 'procedural-synth-zen',
      previewUrl: 'procedural-synth-zen',
      durationSec: 1800,
      isActive: true,
    },
  ];

  for (const tr of tracks) {
    const ex = await prisma.audioTrack.findFirst({ where: { title: tr.title } });
    if (!ex) {
      await prisma.audioTrack.create({ data: tr });
    }
  }

  console.log('✅ Demo seed completed successfully for user Mahmoud!');
}

seedDemo()
  .catch((e) => {
    console.error('❌ Demo seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
