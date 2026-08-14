import Foundation
import React
import SwiftUI
import UserNotifications

#if canImport(AlarmKit)
import AlarmKit
import AppIntents
#endif

/**
 * ════════════════════════════════════════════════════════════
 *  جسر المنبه — iOS
 * ════════════════════════════════════════════════════════════
 *
 *  مساران:
 *    iOS 26+   →  AlarmKit          منبه نظام حقيقي
 *    iOS 17-25 →  UserNotifications أفضل ما يمكن
 *
 *  ما يعطيه AlarmKit ولا يعطيه أي شيء آخر:
 *    · صوت مستمر حتى الإيقاف   (الإشعارات: 30 ثانية ثم صمت)
 *    · يخترق الصامت و Focus     (الإشعارات: تُكتم)
 *    · واجهة ملء الشاشة          (الإشعارات: بانر)
 *    · ينجو من إعادة التشغيل    (نفس الشيء)
 *    · بلا حد على العدد          (الإشعارات: 64 كحد أقصى)
 *    · لا يحتاج Critical Alerts entitlement من آبل
 *
 *  ⚠️ مطلوب في Info.plist:  NSAlarmKitUsageDescription
 *     بدونه: schedule() يفشل دائماً بلا سبب واضح.
 */

// ════════════════════════════════════════════════════════════
//  البيانات الوصفية والنوايا (iOS 26+)
// ════════════════════════════════════════════════════════════

#if canImport(AlarmKit)

@available(iOS 26.0, *)
nonisolated struct ClanAlarmMetadata: AlarmMetadata {
    /// معرّف المنبه على الخادم — نستخدمه لربط المسألة الصحيحة
    let serverAlarmId: String
    let label: String

    init(serverAlarmId: String, label: String) {
        self.serverAlarmId = serverAlarmId
        self.label = label
    }
}

/**
 * نية الإيقاف.
 *
 * زر «إيقاف» لا يُسكت المنبه فحسب — بل يفتح التطبيق على شاشة المسألة.
 * هذا جوهر الفكرة: لا خروج بلا استيقاظ حقيقي.
 */
@available(iOS 26.0, *)
struct ClanStopAlarmIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "إيقاف المنبه"
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Alarm ID")
    var alarmID: String

    init() {}
    init(alarmID: String) { self.alarmID = alarmID }

    func perform() async throws -> some IntentResult {
        if let uuid = UUID(uuidString: alarmID) {
            try AlarmManager.shared.stop(id: uuid)
        }
        // نخزّن المعرّف ليقرأه الـ JS فور فتح التطبيق ويعرض المسألة
        UserDefaults.standard.set(alarmID, forKey: "clan.pendingChallengeAlarmId")
        UserDefaults.standard.set(Date().timeIntervalSince1970,
                                  forKey: "clan.pendingChallengeAt")
        return .result()
    }
}

/** نية الغفوة — تعيد تشغيل العدّاد */
@available(iOS 26.0, *)
struct ClanSnoozeAlarmIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "غفوة"

    @Parameter(title: "Alarm ID")
    var alarmID: String

    init() {}
    init(alarmID: String) { self.alarmID = alarmID }

    func perform() async throws -> some IntentResult {
        if let uuid = UUID(uuidString: alarmID) {
            try AlarmManager.shared.countdown(id: uuid)
        }
        return .result()
    }
}

#endif

// ════════════════════════════════════════════════════════════
//  الجسر
// ════════════════════════════════════════════════════════════

@objc(ClanAlarmBridge)
class ClanAlarmBridge: NSObject {

    @objc static func requiresMainQueueSetup() -> Bool { false }

    /// ربط معرّف الخادم ← معرّفات AlarmKit (واحد لكل يوم أسبوع)
    private static let registryKey = "clan.alarmkit.registry"

    private static func loadRegistry() -> [String: [String]] {
        UserDefaults.standard.dictionary(forKey: registryKey) as? [String: [String]] ?? [:]
    }

    private static func saveRegistry(_ reg: [String: [String]]) {
        UserDefaults.standard.set(reg, forKey: registryKey)
    }

    // ════════════════════════════════════════════════
    //  القدرات
    // ════════════════════════════════════════════════

    @objc
    func getCapabilities(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        var result: [String: Any] = [
            "platform": "ios",
            "systemVersion": UIDevice.current.systemVersion
        ]

        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            result["strategy"] = "ALARMKIT"
            result["bypassSilent"] = true
            result["unlimitedSound"] = true
            result["fullScreen"] = true
            result["survivesRestart"] = true
            result["maxAlarms"] = -1   // بلا حد
            resolve(result)
            return
        }
        #endif

        result["strategy"] = "NOTIFICATIONS"
        result["bypassSilent"] = false
        result["unlimitedSound"] = false
        result["fullScreen"] = false
        result["survivesRestart"] = true
        result["maxAlarms"] = 64       // حد iOS الصارم
        result["note"] = "حدّث إلى iOS 26 للحصول على منبه نظام كامل"
        resolve(result)
    }

    // ════════════════════════════════════════════════
    //  الصلاحيات
    // ════════════════════════════════════════════════

    @objc
    func requestAuthorization(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task {
                do {
                    // ⚠️ authorizationState — لا authorizationStatus
                    let current = AlarmManager.shared.authorizationState
                    if current == .authorized {
                        resolve(["granted": true, "status": "authorized",
                                 "strategy": "ALARMKIT"])
                        return
                    }
                    let state = try await AlarmManager.shared.requestAuthorization()
                    resolve([
                        "granted": state == .authorized,
                        "status": Self.describe(state),
                        "strategy": "ALARMKIT"
                    ])
                } catch {
                    reject("AUTH_FAILED", error.localizedDescription, error)
                }
            }
            return
        }
        #endif

        // المسار القديم
        UNUserNotificationCenter.current().requestAuthorization(
            options: [.alert, .sound, .badge, .criticalAlert]
        ) { granted, error in
            if let error = error {
                reject("AUTH_FAILED", error.localizedDescription, error)
                return
            }
            resolve([
                "granted": granted,
                "status": granted ? "authorized" : "denied",
                "strategy": "NOTIFICATIONS"
            ])
        }
    }

    @objc
    func getAuthorizationStatus(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            let state = AlarmManager.shared.authorizationState
            resolve(["status": Self.describe(state), "strategy": "ALARMKIT"])
            return
        }
        #endif

        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let status: String
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral: status = "authorized"
            case .denied: status = "denied"
            case .notDetermined: status = "notDetermined"
            @unknown default: status = "unknown"
            }
            resolve([
                "status": status,
                "strategy": "NOTIFICATIONS",
                "criticalAlerts": settings.criticalAlertSetting == .enabled
            ])
        }
    }

    // ════════════════════════════════════════════════
    //  الجدولة
    // ════════════════════════════════════════════════

    /**
     * @param alarmId   معرّف الخادم
     * @param hour      0-23
     * @param minute    0-59
     * @param weekdays  اصطلاح JS: الأحد = 0 … السبت = 6
     */
    @objc
    func setAlarm(
        _ alarmId: String,
        hour: NSNumber,
        minute: NSNumber,
        weekdays: NSArray,
        label: String,
        snoozeMinutes: NSNumber,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let jsDays = weekdays.compactMap { ($0 as? NSNumber)?.intValue }

        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task {
                await self.scheduleWithAlarmKit(
                    alarmId: alarmId,
                    hour: hour.intValue,
                    minute: minute.intValue,
                    jsDays: jsDays,
                    label: label,
                    snoozeMinutes: snoozeMinutes.intValue,
                    resolve: resolve,
                    reject: reject
                )
            }
            return
        }
        #endif

        scheduleWithNotifications(
            alarmId: alarmId,
            hour: hour.intValue,
            minute: minute.intValue,
            jsDays: jsDays,
            label: label,
            resolve: resolve,
            reject: reject
        )
    }

    // ── مسار AlarmKit ──────────────────────────────

    #if canImport(AlarmKit)
    @available(iOS 26.0, *)
    private func scheduleWithAlarmKit(
        alarmId: String,
        hour: Int,
        minute: Int,
        jsDays: [Int],
        label: String,
        snoozeMinutes: Int,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) async {
        guard AlarmManager.shared.authorizationState == .authorized else {
            reject("NOT_AUTHORIZED", "لم يُمنح إذن المنبهات بعد", nil)
            return
        }

        // ألغِ أي جدولة سابقة لنفس المعرّف — وإلا تراكمت النسخ
        await cancelAlarmKit(alarmId: alarmId)

        let uuid = UUID()
        let uuidString = uuid.uuidString

        // ── الأزرار ──
        let stopButton = AlarmButton(
            text: "حلّ المسألة",
            textColor: .white,
            systemImageName: "brain.head.profile"
        )

        var alert: AlarmPresentation.Alert
        if snoozeMinutes > 0 {
            let snoozeButton = AlarmButton(
                text: "غفوة \(snoozeMinutes) د",
                textColor: .white,
                systemImageName: "moon.zzz"
            )
            alert = AlarmPresentation.Alert(
                title: LocalizedStringResource(stringLiteral: label),
                stopButton: stopButton,
                secondaryButton: snoozeButton,
                secondaryButtonBehavior: .countdown
            )
        } else {
            alert = AlarmPresentation.Alert(
                title: LocalizedStringResource(stringLiteral: label),
                stopButton: stopButton
            )
        }

        let presentation = AlarmPresentation(alert: alert)

        let attributes = AlarmAttributes<ClanAlarmMetadata>(
            presentation: presentation,
            metadata: ClanAlarmMetadata(serverAlarmId: alarmId, label: label),
            tintColor: .orange
        )

        // ── الجدول ──
        // Locale.Weekday من رقم JS
        let recurrence: Alarm.Schedule.Relative.Recurrence
        if jsDays.isEmpty {
            recurrence = .never
        } else {
            recurrence = .weekly(jsDays.compactMap { Self.weekday(fromJs: $0) })
        }

        let schedule = Alarm.Schedule.relative(
            .init(
                time: .init(hour: hour, minute: minute),
                repeats: recurrence
            )
        )

        // مدة الغفوة: postAlert
        let countdown: Alarm.CountdownDuration? = snoozeMinutes > 0
            ? Alarm.CountdownDuration(preAlert: nil,
                                      postAlert: TimeInterval(snoozeMinutes * 60))
            : nil

        do {
            let config = AlarmManager.AlarmConfiguration<ClanAlarmMetadata>(
                countdownDuration: countdown,
                schedule: schedule,
                attributes: attributes,
                stopIntent: ClanStopAlarmIntent(alarmID: alarmId),
                secondaryIntent: snoozeMinutes > 0
                    ? ClanSnoozeAlarmIntent(alarmID: uuidString)
                    : nil,
                sound: .default
            )

            _ = try await AlarmManager.shared.schedule(id: uuid, configuration: config)

            var reg = Self.loadRegistry()
            reg[alarmId] = [uuidString]
            Self.saveRegistry(reg)

            resolve([
                "success": true,
                "strategy": "ALARMKIT",
                "nativeIds": [uuidString]
            ])
        } catch {
            reject("SCHEDULE_FAILED", error.localizedDescription, error)
        }
    }

    @available(iOS 26.0, *)
    private func cancelAlarmKit(alarmId: String) async {
        var reg = Self.loadRegistry()
        guard let ids = reg[alarmId] else { return }
        for s in ids {
            if let u = UUID(uuidString: s) {
                try? AlarmManager.shared.cancel(id: u)
            }
        }
        reg.removeValue(forKey: alarmId)
        Self.saveRegistry(reg)
    }
    #endif

    // ── مسار الإشعارات (iOS 17-25) ─────────────────

    /**
     * حيلة الالتفاف على حد الـ 30 ثانية.
     *
     * iOS يقطع صوت الإشعار بعد 30 ثانية. الحل: 8 إشعارات متتالية
     * بفاصل 30 ثانية = ~4 دقائق من التنبيه المتقطّع.
     *
     * ⚠️ حد النظام 64 إشعاراً مجدولاً للتطبيق كله.
     *    8 تكرارات × 7 أيام = 56 لمنبه واحد!
     *    لذلك نجدول 3 تكرارات فقط لكل يوم = 21 لكل منبه،
     *    ونحدّ العدد الكلي بثلاثة منبهات نشطة على المسار القديم.
     */
    private func scheduleWithNotifications(
        alarmId: String,
        hour: Int,
        minute: Int,
        jsDays: [Int],
        label: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        let center = UNUserNotificationCenter.current()
        let repeats = 3
        let gapSeconds = 30

        // نظّف القديم
        removeNotificationsFor(alarmId: alarmId)

        let days = jsDays.isEmpty ? Array(0...6) : jsDays
        var identifiers: [String] = []

        for jsDay in days {
            for i in 0..<repeats {
                let totalMinutes = hour * 60 + minute + (i * gapSeconds) / 60
                let extraSeconds = (i * gapSeconds) % 60

                var comps = DateComponents()
                comps.weekday = jsDay + 1           // اصطلاح آبل: الأحد = 1
                comps.hour = (totalMinutes / 60) % 24
                comps.minute = totalMinutes % 60
                comps.second = extraSeconds

                let content = UNMutableNotificationContent()
                content.title = "⏰ \(label)"
                content.body = "قُم وحُلّ المسألة"
                content.categoryIdentifier = "CLAN_ALARM"
                content.userInfo = ["alarmId": alarmId, "retryIndex": i]

                /**
                 * criticalSoundNamed يحتاج entitlement من آبل (يُطلب بنموذج).
                 * بدونه يعود iOS للصوت العادي بصمت — لا استثناء ولا تحذير.
                 * لهذا نضع الاثنين: الحرج لو مُنح، والعادي دائماً كأساس.
                 */
                if #available(iOS 15.0, *) {
                    content.interruptionLevel = .timeSensitive
                    content.relevanceScore = 1.0
                }
                content.sound = UNNotificationSound.defaultCritical

                let identifier = "clan-alarm-\(alarmId)-\(jsDay)-\(i)"
                identifiers.append(identifier)

                let request = UNNotificationRequest(
                    identifier: identifier,
                    content: content,
                    trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: true)
                )
                center.add(request)
            }
        }

        resolve([
            "success": true,
            "strategy": "NOTIFICATIONS",
            "nativeIds": identifiers,
            "warning": "iOS دون 26: الصوت يتوقف بعد 30 ثانية ولا يخترق الصامت"
        ])
    }

    private func removeNotificationsFor(alarmId: String) {
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { requests in
            let ids = requests
                .map { $0.identifier }
                .filter { $0.hasPrefix("clan-alarm-\(alarmId)-") }
            center.removePendingNotificationRequests(withIdentifiers: ids)
        }
    }

    // ════════════════════════════════════════════════
    //  الإلغاء
    // ════════════════════════════════════════════════

    @objc
    func removeAlarm(
        _ alarmId: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task {
                await self.cancelAlarmKit(alarmId: alarmId)
                resolve(true)
            }
            return
        }
        #endif

        removeNotificationsFor(alarmId: alarmId)
        resolve(true)
    }

    @objc
    func removeAllAlarms(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task {
                let reg = Self.loadRegistry()
                for (_, ids) in reg {
                    for s in ids {
                        if let u = UUID(uuidString: s) {
                            try? AlarmManager.shared.cancel(id: u)
                        }
                    }
                }
                Self.saveRegistry([:])
                resolve(true)
            }
            return
        }
        #endif

        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { requests in
            let ids = requests.map { $0.identifier }.filter { $0.hasPrefix("clan-alarm-") }
            center.removePendingNotificationRequests(withIdentifiers: ids)
            resolve(true)
        }
    }

    // ════════════════════════════════════════════════
    //  الحالة
    // ════════════════════════════════════════════════

    /**
     * هل هناك منبه بانتظار حل مسألة؟
     * يُستدعى فور فتح التطبيق — يقرأ ما كتبته ClanStopAlarmIntent.
     */
    @objc
    func consumePendingChallenge(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let defaults = UserDefaults.standard
        guard let alarmId = defaults.string(forKey: "clan.pendingChallengeAlarmId") else {
            resolve(NSNull())
            return
        }

        let at = defaults.double(forKey: "clan.pendingChallengeAt")

        // صلاحية 15 دقيقة — بعدها لا معنى للمسألة
        if Date().timeIntervalSince1970 - at > 900 {
            defaults.removeObject(forKey: "clan.pendingChallengeAlarmId")
            defaults.removeObject(forKey: "clan.pendingChallengeAt")
            resolve(NSNull())
            return
        }

        defaults.removeObject(forKey: "clan.pendingChallengeAlarmId")
        defaults.removeObject(forKey: "clan.pendingChallengeAt")

        resolve(["alarmId": alarmId, "firedAt": at])
    }

    @objc
    func getScheduledAlarms(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            let reg = Self.loadRegistry()
            let list = reg.map { (serverId, nativeIds) -> [String: Any] in
                ["id": serverId, "nativeIds": nativeIds]
            }
            resolve(list)
            return
        }
        #endif

        UNUserNotificationCenter.current().getPendingNotificationRequests { requests in
            let ids = Set(requests.compactMap { req -> String? in
                guard req.identifier.hasPrefix("clan-alarm-") else { return nil }
                return req.content.userInfo["alarmId"] as? String
            })
            resolve(ids.map { ["id": $0] })
        }
    }

    // ════════════════════════════════════════════════
    //  اختبار
    // ════════════════════════════════════════════════

    @objc
    func testFireIn(
        _ seconds: NSNumber,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task {
                do {
                    let alert = AlarmPresentation.Alert(
                        title: "اختبار المنبه",
                        stopButton: AlarmButton(
                            text: "تمام",
                            textColor: .white,
                            systemImageName: "checkmark.circle"
                        )
                    )
                    let attributes = AlarmAttributes<ClanAlarmMetadata>(
                        presentation: AlarmPresentation(alert: alert),
                        metadata: ClanAlarmMetadata(serverAlarmId: "__test__",
                                                    label: "اختبار"),
                        tintColor: .orange
                    )
                    _ = try await AlarmManager.shared.schedule(
                        id: UUID(),
                        configuration: .timer(
                            duration: TimeInterval(seconds.doubleValue),
                            attributes: attributes
                        )
                    )
                    resolve(true)
                } catch {
                    reject("TEST_FAILED", error.localizedDescription, error)
                }
            }
            return
        }
        #endif

        let content = UNMutableNotificationContent()
        content.title = "⏰ اختبار المنبه"
        content.body = "لو سمعت هذا فالإعداد سليم"
        content.sound = UNNotificationSound.defaultCritical
        if #available(iOS 15.0, *) { content.interruptionLevel = .timeSensitive }

        let request = UNNotificationRequest(
            identifier: "clan-alarm-test",
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(
                timeInterval: max(1, seconds.doubleValue),
                repeats: false
            )
        )
        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                reject("TEST_FAILED", error.localizedDescription, error)
            } else {
                resolve(true)
            }
        }
    }

    // ════════════════════════════════════════════════
    //  مساعدات
    // ════════════════════════════════════════════════

    #if canImport(AlarmKit)
    @available(iOS 26.0, *)
    private static func describe(_ state: AlarmManager.AuthorizationState) -> String {
        switch state {
        case .authorized:    return "authorized"
        case .denied:        return "denied"
        case .notDetermined: return "notDetermined"
        @unknown default:    return "unknown"
        }
    }

    /// من اصطلاح JS (الأحد = 0) إلى Locale.Weekday
    @available(iOS 26.0, *)
    private static func weekday(fromJs n: Int) -> Locale.Weekday? {
        switch n {
        case 0: return .sunday
        case 1: return .monday
        case 2: return .tuesday
        case 3: return .wednesday
        case 4: return .thursday
        case 5: return .friday
        case 6: return .saturday
        default: return nil
        }
    }
    #endif
}
