/// 🗃️ نماذج البيانات — مطابقة لاستجابات الباك إند الحقيقية

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
}
