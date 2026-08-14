import prisma from '../src/config/prisma.js';

async function seedClanChat() {
  console.log('🏛️ Seeding Clan Hub & Chat data...');

  // 1. Mahmoud
  const mahmoud = await prisma.user.findUnique({ where: { email: 'mahmoud@clan.app' } });
  if (!mahmoud) throw new Error('Mahmoud user not found');

  // 2. Create users Youssef, Ahmed, Fatima if not exist
  const youssef = await prisma.user.upsert({
    where: { email: 'youssef@clan.app' },
    update: {},
    create: {
      id: 'demo-youssef-id',
      username: 'youssef',
      email: 'youssef@clan.app',
      domain: 'TECH',
      specialty: 'SOFTWARE_DEV',
      onboarded: true,
      sparksBalance: 980,
      currentStreak: 12,
    },
  });

  const ahmed = await prisma.user.upsert({
    where: { email: 'ahmed@clan.app' },
    update: {},
    create: {
      id: 'demo-ahmed-id',
      username: 'ahmed',
      email: 'ahmed@clan.app',
      domain: 'TECH',
      specialty: 'SOFTWARE_DEV',
      onboarded: true,
      sparksBalance: 1100,
      currentStreak: 12,
    },
  });

  const fatima = await prisma.user.upsert({
    where: { email: 'fatima@clan.app' },
    update: {},
    create: {
      id: 'demo-fatima-id',
      username: 'fatima',
      email: 'fatima@clan.app',
      domain: 'TECH',
      specialty: 'UI_UX',
      onboarded: true,
      sparksBalance: 750,
      currentStreak: 7,
    },
  });

  // 3. Create Private Clan: كتيبة النخبة البرمجية
  const privateClan = await prisma.clan.upsert({
    where: { id: 'clan-elite-private-id' },
    update: {
      name: 'كتيبة النخبة البرمجية',
      description: 'فريق هندسة النظم وتحديات البناء البرمجي المكثف',
      type: 'PRIVATE',
      category: 'TECH',
      leaderId: mahmoud.id,
      inviteCode: 'ELITE-2026',
    },
    create: {
      id: 'clan-elite-private-id',
      name: 'كتيبة النخبة البرمجية',
      description: 'فريق هندسة النظم وتحديات البناء البرمجي المكثف',
      type: 'PRIVATE',
      category: 'TECH',
      leaderId: mahmoud.id,
      inviteCode: 'ELITE-2026',
    },
  });

  // Memberships
  for (const u of [mahmoud, youssef, ahmed, fatima]) {
    const ex = await prisma.clanMember.findFirst({
      where: { userId: u.id, clanId: privateClan.id },
    });
    if (!ex) {
      await prisma.clanMember.create({
        data: {
          userId: u.id,
          clanId: privateClan.id,
          role: u.id === mahmoud.id ? 'LEADER' : 'MEMBER',
        },
      });
    }
  }

  // 4. Create Global Clan Conversation
  const globalClan = await prisma.clan.findFirst({ where: { type: 'GLOBAL', category: 'TECH' } });
  let globalConv = await prisma.conversation.findFirst({
    where: { clanId: globalClan.id },
  });

  if (!globalConv) {
    globalConv = await prisma.conversation.create({
      data: {
        type: 'CLAN',
        clanId: globalClan.id,
        participants: {
          create: [
            { userId: mahmoud.id },
            { userId: youssef.id },
            { userId: ahmed.id },
            { userId: fatima.id },
          ],
        },
      },
    });
  }

  console.log('✅ Clan and Chat seed completed successfully!');
}

seedClanChat()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
