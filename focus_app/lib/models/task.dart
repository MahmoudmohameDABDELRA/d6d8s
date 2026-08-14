class AppTask {
  final String id;
  final String title;
  final DateTime scheduledTime;
  final int durationMinutes;
  bool isDone;

  AppTask({
    required this.id,
    required this.title,
    required this.scheduledTime,
    required this.durationMinutes,
    this.isDone = false,
  });

  /// Compact JSON used both for local storage and for the payload sent
  /// to the check-in backend, so the AI has real context about the task.
  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'scheduled_time': scheduledTime.toIso8601String(),
        'duration_minutes': durationMinutes,
        'is_done': isDone,
      };

  factory AppTask.fromJson(Map<String, dynamic> json) => AppTask(
        id: json['id'] as String,
        title: json['title'] as String,
        scheduledTime: DateTime.parse(json['scheduled_time'] as String),
        durationMinutes: json['duration_minutes'] as int,
        isDone: json['is_done'] as bool? ?? false,
      );
}
