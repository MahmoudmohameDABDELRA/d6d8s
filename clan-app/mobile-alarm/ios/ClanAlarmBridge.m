#import <React/RCTBridgeModule.h>

/**
 * ════════════════════════════════════════════════════════════
 *  تعريف الوحدة لـ React Native
 * ════════════════════════════════════════════════════════════
 *
 *  ⚠️ الأسماء والتوقيعات هنا يجب أن تطابق @objc في
 *     ClanAlarmBridge.swift حرفاً بحرف — بما فيها أسماء الوسائط.
 *
 *  خطأ حرف واحد = "ClanAlarmBridge.setAlarm got 6 arguments, expected 5"
 *  أو أسوأ: الدالة غير موجودة أصلاً وقت التشغيل.
 */
@interface RCT_EXTERN_MODULE(ClanAlarmBridge, NSObject)

RCT_EXTERN_METHOD(getCapabilities
                  : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(requestAuthorization
                  : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getAuthorizationStatus
                  : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setAlarm
                  : (NSString *)alarmId
                  hour : (nonnull NSNumber *)hour
                  minute : (nonnull NSNumber *)minute
                  weekdays : (NSArray *)weekdays
                  label : (NSString *)label
                  snoozeMinutes : (nonnull NSNumber *)snoozeMinutes
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(removeAlarm
                  : (NSString *)alarmId
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(removeAllAlarms
                  : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(consumePendingChallenge
                  : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getScheduledAlarms
                  : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(testFireIn
                  : (nonnull NSNumber *)seconds
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)

@end
