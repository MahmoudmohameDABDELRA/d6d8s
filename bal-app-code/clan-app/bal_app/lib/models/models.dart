/// 🗃️ نماذج البيانات — مطابقة لاستجابات الباك إند الحقيقية
library;

/// المستخدم
class BalUser {
  final String id;
  final String username;
  final String? email;
  final String? companionName;
  final String? domain;
  final int sparksBalance;
  final int currentStreak;

  const BalUser({
    required this.id,
    required this.username,
    this.email,
    this.companionName,
    this.domain,
    this.sparksBalance = 0,
    this.currentStreak = 0,
  });

  factory BalUser.fromJson(Map<String, dynamic> j) => BalUser(
        id: (j['id'] ?? '').toString(),
        username: (j['username'] ?? '').toString(),
        email: j['email']?.toString(),
        companionName: j['companionName']?.toString(),
        domain: j['domain']?.toString(),
        sparksBalance: (j['sparksBalance'] as num?)?.toInt() ?? 0,
        currentStreak: (j['currentStreak'] as num?)?.toInt() ?? 0,
      );
}

/// هدف (جبل) — من GET /goals
class Goal {
  final String id;
  final String title;
  final bool isActive;
  final bool isPrimary;
  final String? completedAt;
  final List<GoalStep> steps;
  final Map<String, dynamic>? stats;

  const Goal({
    required this.id,
    required this.title,
    this.isActive = true,
    this.isPrimary = false,
    this.completedAt,
    this.steps = const [],
    this.stats,
  });

  factory Goal.fromJson(Map<String, dynamic> j) => Goal(
        id: (j['id'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        isActive: j['isActive'] == true,
        isPrimary: j['isPrimary'] == true,
        completedAt: j['completedAt']?.toString(),
        stats: j['stats'] as Map<String, dynamic>?,
        steps: (j['steps'] as List? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(GoalStep.fromJson)
            .toList(),
      );
}

/// مرحلة/هدف فرعي في الجبل
class GoalStep {
  final String id;
  final String title;
  final String? description;
  final int order;
  final bool isCompleted;
  final String? completedAt;

  const GoalStep({
    required this.id,
    required this.title,
    this.description,
    required this.order,
    this.isCompleted = false,
    this.completedAt,
  });

  factory GoalStep.fromJson(Map<String, dynamic> j) => GoalStep(
        id: (j['id'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        description: j['description']?.toString(),
        order: (j['order'] as num?)?.toInt() ?? 0,
        isCompleted: j['isCompleted'] == true,
        completedAt: j['completedAt']?.toString(),
      );
}

/// رحلة هدف (Journey) — من GET /steps/:id/journey
class Journey {
  final String id;
  final String title;
  final String status;
  final int durationDays;
  final int currentDay;
  final List<JourneyDay> days;
  final Map<String, dynamic>? progress;
  final int lateDays;

  const Journey({
    required this.id,
    required this.title,
    this.status = 'DRAFT',
    this.durationDays = 1,
    this.currentDay = 1,
    this.days = const [],
    this.progress,
    this.lateDays = 0,
  });

  factory Journey.fromJson(Map<String, dynamic> j) => Journey(
        id: (j['id'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        status: (j['status'] ?? 'DRAFT').toString(),
        durationDays: (j['durationDays'] as num?)?.toInt() ?? 1,
        currentDay: (j['currentDay'] as num?)?.toInt() ?? 1,
        lateDays: (j['lateDays'] as num?)?.toInt() ?? 0,
        progress: j['progress'] as Map<String, dynamic>?,
        days: (j['days'] as List? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(JourneyDay.fromJson)
            .toList(),
      );

  int get completedDays =>
      days.where((d) => d.status == 'COMPLETED').length;
  int get percent =>
      days.isEmpty ? 0 : (completedDays * 100 / days.length).round();
}

class JourneyDay {
  final String id;
  final int dayNumber;
  final String title;
  final String? description;
  final String status;
  final String? scheduledDate;

  const JourneyDay({
    required this.id,
    required this.dayNumber,
    required this.title,
    this.description,
    this.status = 'PENDING',
    this.scheduledDate,
  });

  factory JourneyDay.fromJson(Map<String, dynamic> j) => JourneyDay(
        id: (j['id'] ?? '').toString(),
        dayNumber: (j['dayNumber'] as num?)?.toInt() ?? 1,
        title: (j['title'] ?? '').toString(),
        description: j['description']?.toString(),
        status: (j['status'] ?? 'PENDING').toString(),
        scheduledDate: j['scheduledDate']?.toString(),
      );
}

/// مهمة — من GET /tasks
class BalTask {
  final String id;
  final String title;
  final String? description;
  final String? source;
  final bool isCompleted;
  final String? dueDate;
  final String? journeyDayId;
  final String? goalStepId;
  final String? startTime;
  final String? endTime;
  final String? routineType;

  const BalTask({
    required this.id,
    required this.title,
    this.description,
    this.source,
    this.isCompleted = false,
    this.dueDate,
    this.journeyDayId,
    this.goalStepId,
    this.startTime,
    this.endTime,
    this.routineType,
  });

  factory BalTask.fromJson(Map<String, dynamic> j) => BalTask(
        id: (j['id'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        description: j['description']?.toString(),
        source: j['source']?.toString(),
        isCompleted: j['isCompleted'] == true,
        dueDate: j['dueDate']?.toString(),
        journeyDayId: j['journeyDayId']?.toString(),
        goalStepId: j['goalStepId']?.toString(),
        startTime: j['startTime']?.toString(),
        endTime: j['endTime']?.toString(),
        routineType: j['routineType']?.toString(),
      );

  bool get fromMountain => source == 'JOURNEY';

  /// نسخة معدّلة — للتحديث المتفائل قبل ما رد السيرفر يوصل
  ///
  /// ️ من غيرها الشاشة لازم تستنى الشبكة عشان ترسم العلامة،
  ///    والضغطة بتحس إنها ضاعت فالمستخدم بيضغط تاني.
  BalTask copyWith({bool? isCompleted, String? title}) => BalTask(
        id: id,
        title: title ?? this.title,
        description: description,
        source: source,
        isCompleted: isCompleted ?? this.isCompleted,
        dueDate: dueDate,
        journeyDayId: journeyDayId,
        goalStepId: goalStepId,
        startTime: startTime,
        endTime: endTime,
        routineType: routineType,
      );
}

/// 🛡️ العشيرة — مجموعة بتجمع ناس ليهم نفس الاهتمام
class Clan {
  final String id;
  final String name;
  final String? description;
  final String? icon;

  /// GLOBAL = عامة بلا مالك · PRIVATE = خاصة بكود دعوة
  final String type;
  final String? category;
  final String? inviteCode;
  final int membersCount;
  final int? maxMembers;

  /// LEADER أو MEMBER — دوري أنا في العشيرة دي
  final String myRole;

  const Clan({
    required this.id,
    required this.name,
    this.description,
    this.icon,
    this.type = 'GLOBAL',
    this.category,
    this.inviteCode,
    this.membersCount = 0,
    this.maxMembers,
    this.myRole = 'MEMBER',
  });

  factory Clan.fromJson(Map<String, dynamic> j) => Clan(
        id: (j['id'] ?? '').toString(),
        name: (j['name'] ?? '').toString(),
        description: j['description']?.toString(),
        icon: j['icon']?.toString(),
        type: (j['type'] ?? 'GLOBAL').toString(),
        category: j['category']?.toString(),
        inviteCode: j['inviteCode']?.toString(),
        membersCount: (j['membersCount'] as num?)?.toInt() ?? 0,
        maxMembers: (j['maxMembers'] as num?)?.toInt(),
        myRole: (j['myRole'] ?? 'MEMBER').toString(),
      );

  bool get isPrivate => type == 'PRIVATE';
  bool get isLeader => myRole == 'LEADER';

  /// العشائر العامة بلا حد أعضاء (maxMembers = null)
  bool get isFull => maxMembers != null && membersCount >= maxMembers!;
}

/// عضو في عشيرة
class ClanMember {
  final String id;
  final String username;
  final String? profileImage;
  final String? specialty;
  final String role;
  final DateTime? lastSeen;

  const ClanMember({
    required this.id,
    required this.username,
    this.profileImage,
    this.specialty,
    this.role = 'MEMBER',
    this.lastSeen,
  });

  factory ClanMember.fromJson(Map<String, dynamic> j) {
    final u = (j['user'] is Map) ? j['user'] as Map : const {};
    return ClanMember(
      id: (u['id'] ?? j['id'] ?? '').toString(),
      username: (u['username'] ?? 'عضو').toString(),
      profileImage: u['profileImage']?.toString(),
      specialty: u['specialty']?.toString(),
      role: (j['role'] ?? 'MEMBER').toString(),
      lastSeen: DateTime.tryParse((u['lastSeen'] ?? '').toString()),
    );
  }

  bool get isLeader => role == 'LEADER';

  /// ️ نشط دلوقتي = آخر ظهور خلال 5 دقايق
  bool get isOnline {
    if (lastSeen == null) return false;
    return DateTime.now().difference(lastSeen!).inMinutes < 5;
  }
}

/// 💬 محادثة في قائمة الرسائل
class Conversation {
  final String id;
  final String? otherUserId;
  final String title;
  final String? avatar;
  final String? lastMessage;
  final DateTime? lastMessageAt;
  final int unread;
  final bool isOnline;

  const Conversation({
    required this.id,
    this.otherUserId,
    this.title = 'محادثة',
    this.avatar,
    this.lastMessage,
    this.lastMessageAt,
    this.unread = 0,
    this.isOnline = false,
  });

  /// ️ السيرفر بيرجّع `user` مش `title` — النسخة القديمة كانت بتقرا
  ///    `conv['title']` اللي مش موجود، فكل المحادثات كانت بتظهر
  ///    باسم «محادثة» وصورة فاضية.
  factory Conversation.fromJson(Map<String, dynamic> j) {
    final u = (j['user'] is Map) ? j['user'] as Map : const {};
    return Conversation(
      id: (j['id'] ?? '').toString(),
      otherUserId: u['id']?.toString(),
      title: (u['username'] ?? j['title'] ?? 'محادثة').toString(),
      avatar: u['profileImage']?.toString(),
      lastMessage: j['lastMessage']?.toString(),
      lastMessageAt: DateTime.tryParse((j['lastMessageAt'] ?? '').toString()),
      unread: (j['unread'] as num?)?.toInt() ?? 0,
      isOnline: u['isOnline'] == true,
    );
  }
}

/// رسالة داخل محادثة
class ChatMessage {
  final String id;
  final String text;
  final String senderId;
  final String? senderName;
  final DateTime? createdAt;
  final bool isDeleted;
  final bool isEdited;

  /// ️ الرد على رسالة: السيرفر بيخزّنها **لقطة** مش مرجع
  ///    (`replyToText` و`replyToSender` أعمدة مستقلة). كده الرد
  ///    يفضل مقروء حتى لو الأصل اتمسح — وده قرار صح، فبنقراه
  ///    زي ما هو مش بندوّر على الرسالة الأصلية في القائمة.
  final String? replyToId;
  final String? replyToText;
  final String? replyToSender;

  /// `[{ userId, emoji }]` — تفاعل واحد لكل مستخدم (قاعدة السيرفر)
  final List<MessageReaction> reactions;

  const ChatMessage({
    required this.id,
    required this.text,
    required this.senderId,
    this.senderName,
    this.createdAt,
    this.isDeleted = false,
    this.isEdited = false,
    this.replyToId,
    this.replyToText,
    this.replyToSender,
    this.reactions = const [],
  });

  factory ChatMessage.fromJson(Map<String, dynamic> j) {
    final s = (j['sender'] is Map) ? j['sender'] as Map : const {};

    final raw = j['reactions'];
    final reactions = raw is List
        ? raw
            .whereType<Map>()
            .map((r) => MessageReaction(
                  userId: (r['userId'] ?? '').toString(),
                  emoji: (r['emoji'] ?? '').toString(),
                ))
            .where((r) => r.emoji.isNotEmpty)
            .toList()
        : <MessageReaction>[];

    return ChatMessage(
      id: (j['id'] ?? '').toString(),
      text: (j['text'] ?? j['content'] ?? '').toString(),
      senderId: (j['senderId'] ?? s['id'] ?? '').toString(),
      senderName: (j['senderName'] ?? s['username'])?.toString(),
      createdAt: DateTime.tryParse((j['createdAt'] ?? '').toString()),
      isDeleted: j['isDeleted'] == true,
      isEdited: j['isEdited'] == true,
      replyToId: j['replyToId']?.toString(),
      replyToText: j['replyToText']?.toString(),
      replyToSender: j['replyToSender']?.toString(),
      reactions: reactions,
    );
  }

  /// نسخة معدّلة — للتحديث المتفائل قبل ما رد السيرفر يوصل
  ChatMessage copyWith({
    String? text,
    bool? isDeleted,
    bool? isEdited,
    List<MessageReaction>? reactions,
  }) =>
      ChatMessage(
        id: id,
        text: text ?? this.text,
        senderId: senderId,
        senderName: senderName,
        createdAt: createdAt,
        isDeleted: isDeleted ?? this.isDeleted,
        isEdited: isEdited ?? this.isEdited,
        replyToId: replyToId,
        replyToText: replyToText,
        replyToSender: replyToSender,
        reactions: reactions ?? this.reactions,
      );

  /// التفاعلات مجمّعة: إيموجي → عدد
  Map<String, int> get reactionCounts {
    final out = <String, int>{};
    for (final r in reactions) {
      out[r.emoji] = (out[r.emoji] ?? 0) + 1;
    }
    return out;
  }

  /// هل أنا متفاعل بالإيموجي ده؟
  bool reactedBy(String userId, String emoji) =>
      reactions.any((r) => r.userId == userId && r.emoji == emoji);
}

/// تفاعل واحد على رسالة
class MessageReaction {
  final String userId;
  final String emoji;

  const MessageReaction({required this.userId, required this.emoji});
}

/// ⏰ منبه — بيصحّيك بمهمة لازم تحلها عشان يقفل
class BalAlarm {
  final String id;

  /// "06:00" بتوقيتك
  final String time;

  /// أيام الأسبوع — الأحد = 0 والسبت = 6
  final List<int> days;

  final bool isActive;

  /// لازم تحل مسألة عشان المنبه يقفل — مش مجرد ضغطة
  final bool requireProof;

  final int wakeStreak;
  final int longestWakeStreak;

  const BalAlarm({
    required this.id,
    required this.time,
    this.days = const [],
    this.isActive = true,
    this.requireProof = true,
    this.wakeStreak = 0,
    this.longestWakeStreak = 0,
  });

  factory BalAlarm.fromJson(Map<String, dynamic> j) => BalAlarm(
        id: (j['id'] ?? '').toString(),
        time: (j['time'] ?? '00:00').toString(),
        days: (j['days'] as List? ?? const [])
            .map((d) => (d as num).toInt())
            .toList(),
        isActive: j['isActive'] != false,
        requireProof: j['requireProof'] != false,
        wakeStreak: (j['wakeStreak'] as num?)?.toInt() ?? 0,
        longestWakeStreak: (j['longestWakeStreak'] as num?)?.toInt() ?? 0,
      );

  static const dayNames = ['أحد', 'اتنين', 'تلات', 'أربع', 'خميس', 'جمعة', 'سبت'];

  /// وصف الأيام بالعربي — «كل يوم» / «أيام الشغل» / «أحد · تلات»
  String get daysLabel {
    if (days.isEmpty) return 'مرة واحدة';
    if (days.length == 7) return 'كل يوم';

    final sorted = [...days]..sort();
    if (sorted.length == 5 && !sorted.contains(5) && !sorted.contains(6)) {
      return 'أيام الشغل';
    }
    if (sorted.length == 2 && sorted.contains(5) && sorted.contains(6)) {
      return 'الويكند';
    }
    return sorted.map((d) => dayNames[d % 7]).join(' · ');
  }
}

/// 🎯 تحدي تركيز جماعي — تذاكر مع ناس من عشيرتك في نفس الوقت
class FocusChallenge {
  final String id;
  final String title;
  final String? hostId;
  final String? hostName;
  final int focusMin;
  final int restMin;
  final int cycles;

  /// WAITING = مستني الناس · ACTIVE = شغّال · FINISHED · CANCELLED
  final String status;

  /// قبلوا ومستنيين البداية
  final List<ClanMember> waiting;

  /// داخلين الجلسة فعلاً
  final List<ClanMember> active;

  const FocusChallenge({
    required this.id,
    required this.title,
    this.hostId,
    this.hostName,
    this.focusMin = 25,
    this.restMin = 5,
    this.cycles = 1,
    this.status = 'WAITING',
    this.waiting = const [],
    this.active = const [],
  });

  factory FocusChallenge.fromJson(Map<String, dynamic> j) {
    final host = (j['host'] is Map) ? j['host'] as Map : const {};

    List<ClanMember> people(String key) =>
        (j[key] as List? ?? const [])
            .whereType<Map<String, dynamic>>()
            /// ️ السيرفر بيرجّع المستخدم مباشرةً هنا (مش ملفوف في
            ///    `user` زي أعضاء العشيرة) — فبنلفّه عشان نعيد
            ///    استخدام نفس النموذج.
            .map((u) => ClanMember.fromJson({'user': u}))
            .toList();

    return FocusChallenge(
      id: (j['id'] ?? '').toString(),
      title: (j['title'] ?? 'تحدي تركيز').toString(),
      hostId: host['id']?.toString(),
      hostName: host['username']?.toString(),
      focusMin: (j['focusMin'] as num?)?.toInt() ?? 25,
      restMin: (j['restMin'] as num?)?.toInt() ?? 5,
      cycles: (j['cycles'] as num?)?.toInt() ?? 1,
      status: (j['status'] ?? 'WAITING').toString(),
      waiting: people('waiting'),
      active: people('active'),
    );
  }

  /// إجمالي الوقت — آخر دورة بلا راحة بعدها
  int get totalMin => focusMin * cycles + restMin * (cycles - 1);

  bool get isWaiting => status == 'WAITING';
  bool get isActive => status == 'ACTIVE';
  bool get isOver => status == 'FINISHED' || status == 'CANCELLED';

  int get peopleCount => waiting.length + active.length;
}
