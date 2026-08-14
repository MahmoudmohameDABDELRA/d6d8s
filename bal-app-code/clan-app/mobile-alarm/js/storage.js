import AsyncStorage from '@react-native-async-storage/async-storage';

import ClanAlarm from './clanAlarm';

/**
 * ════════════════════════════════════════════════════════════
 *  تخزين المنبهات — الجانب JS
 * ════════════════════════════════════════════════════════════
 *
 *  ⚠️ نقطة تصميم مهمة:
 *
 *  البيانات تعيش في **مكانين**:
 *    1. AsyncStorage  — لعرضها في الواجهة
 *    2. الطبقة الأصلية — لإعادة الجدولة بعد الإقلاع
 *
 *  لماذا التكرار؟ لأن BootReceiver يعمل قبل تشغيل JavaScript.
 *  لو كانت البيانات في AsyncStorage فقط، لن يجد أحد ما يجدوله
 *  بعد إعادة تشغيل الهاتف.
 *
 *  القاعدة: كل كتابة هنا تُتبع بمزامنة للطبقة الأصلية.
 */

const KEY = '@clan_alarms_v2';

export const loadAlarms = async () => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

/** يحفظ ويزامن الطبقة الأصلية — استخدمها دائماً بدل الحفظ المباشر */
export const saveAlarms = async (alarms) => {
  const list = Array.isArray(alarms) ? alarms : [];
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
  await ClanAlarm.syncAlarms(list);
  return list;
};

export const upsertAlarm = async (alarm) => {
  const list = await loadAlarms();
  const i = list.findIndex((a) => a.id === alarm.id);
  if (i >= 0) list[i] = { ...list[i], ...alarm };
  else list.push(alarm);
  return saveAlarms(list);
};

export const deleteAlarm = async (alarmId) => {
  const list = (await loadAlarms()).filter((a) => a.id !== alarmId);
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
  await ClanAlarm.removeAlarm(alarmId);
  return list;
};

export const toggleAlarm = async (alarmId, enabled) => {
  const list = await loadAlarms();
  const alarm = list.find((a) => a.id === alarmId);
  if (!alarm) return list;
  alarm.enabled = enabled;
  return saveAlarms(list);
};

/**
 * مزامنة مع الخادم.
 *
 * الخادم هو مصدر الحقيقة (المنبهات تُشارَك في تحديات العشيرة).
 * لكن الجهاز يعمل بلا إنترنت — فنحتفظ بنسخة محلية دائماً.
 */
export const syncWithServer = async (serverAlarms) => {
  if (!Array.isArray(serverAlarms)) return loadAlarms();

  const mapped = serverAlarms.map((a) => ({
    id: String(a.id),
    hour: a.hour,
    minute: a.minute,
    weekdays: a.weekdays || a.days || [],
    label: a.label || 'منبه العشيرة',
    enabled: a.isActive !== false && a.enabled !== false,
    snoozeMinutes: a.snoozeMinutes || 0,
    requireChallenge: a.requireChallenge !== false,
  }));

  return saveAlarms(mapped);
};
