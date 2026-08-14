import SwiftUI
import WidgetKit

#if canImport(AlarmKit)
import AlarmKit
#endif

/**
 * ════════════════════════════════════════════════════════════
 *  امتداد الودجت — واجهة المنبه في Live Activity والجزيرة الديناميكية
 * ════════════════════════════════════════════════════════════
 *
 *  ⚠️ هذا الملف يعيش في **هدف منفصل** (Widget Extension)،
 *     لا في هدف التطبيق الرئيسي.
 *
 *  متى يظهر:
 *    · شاشة القفل أثناء العدّ التنازلي (الغفوة)
 *    · الجزيرة الديناميكية
 *
 *  ملاحظة: واجهة التنبيه نفسها (لحظة الرنين) يرسمها النظام
 *  من AlarmPresentation — لا تتحكم فيها. هذا الملف للحالات الأخرى.
 *
 *  لو لم تُنشئ هذا الهدف، المنبه يعمل لكن العدّ التنازلي
 *  يظهر بواجهة النظام الافتراضية الباهتة.
 */

#if canImport(AlarmKit)

@available(iOS 26.0, *)
nonisolated struct ClanAlarmMetadata: AlarmMetadata {
    let serverAlarmId: String
    let label: String
}

@available(iOS 26.0, *)
struct ClanAlarmWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AlarmAttributes<ClanAlarmMetadata>.self) { context in
            // ── شاشة القفل ──
            LockScreenAlarmView(context: context)
                .padding()
                .activityBackgroundTint(Color.black.opacity(0.85))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "alarm.waves.left.and.right.fill")
                        .font(.title2)
                        .foregroundStyle(.orange)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    CountdownLabel(context: context)
                        .font(.title2.monospacedDigit())
                        .foregroundStyle(.orange)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.metadata?.label ?? "منبه العشيرة")
                        .font(.headline)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("قُم وحُلّ المسألة")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } compactLeading: {
                Image(systemName: "alarm.fill")
                    .foregroundStyle(.orange)
            } compactTrailing: {
                CountdownLabel(context: context)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.orange)
            } minimal: {
                Image(systemName: "alarm.fill")
                    .foregroundStyle(.orange)
            }
        }
    }
}

@available(iOS 26.0, *)
struct LockScreenAlarmView: View {
    let context: ActivityViewContext<AlarmAttributes<ClanAlarmMetadata>>

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "alarm.waves.left.and.right.fill")
                .font(.system(size: 34))
                .foregroundStyle(.orange)

            VStack(alignment: .leading, spacing: 4) {
                Text(context.attributes.metadata?.label ?? "منبه العشيرة")
                    .font(.headline)
                    .foregroundStyle(.white)

                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.7))
            }

            Spacer()

            CountdownLabel(context: context)
                .font(.system(size: 26, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(.orange)
        }
        .environment(\.layoutDirection, .rightToLeft)
    }

    private var subtitle: String {
        switch context.state.mode {
        case .countdown: return "غفوة — سيرن قريباً"
        case .paused:    return "متوقف مؤقتاً"
        case .alert:     return "قُم وحُلّ المسألة"
        default:         return "منبه مجدول"
        }
    }
}

/**
 * عدّاد تنازلي حي.
 *
 * نستخدم Text(timerInterval:) لا مؤقتاً يدوياً —
 * النظام يحدّثه دون إيقاظ التطبيق، فلا يستهلك بطارية.
 */
@available(iOS 26.0, *)
struct CountdownLabel: View {
    let context: ActivityViewContext<AlarmAttributes<ClanAlarmMetadata>>

    var body: some View {
        switch context.state.mode {
        case .countdown(let countdown):
            Text(timerInterval: Date.now...countdown.fireDate, countsDown: true)
        case .paused(let paused):
            Text(formatted(paused.totalCountdownDuration - paused.previouslyElapsedDuration))
        default:
            Text("--:--")
        }
    }

    private func formatted(_ seconds: TimeInterval) -> String {
        let total = Int(max(0, seconds))
        return String(format: "%02d:%02d", total / 60, total % 60)
    }
}

@main
struct ClanAlarmWidgetBundle: WidgetBundle {
    var body: some Widget {
        if #available(iOS 26.0, *) {
            ClanAlarmWidget()
        }
    }
}

#endif
