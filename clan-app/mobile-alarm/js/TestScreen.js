import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';

import ClanAlarm from './clanAlarm';

/**
 * ════════════════════════════════════════════════════════════
 *  شاشة اختبار المنبه
 * ════════════════════════════════════════════════════════════
 *
 *  الغرض: تتأكد إن كل حاجة شغالة قبل ما تبني بقية التطبيق.
 *
 *  ضعها كشاشة أولى مؤقتاً في App.js:
 *
 *    import TestScreen from './src/alarm/TestScreen';
 *    export default function App() { return <TestScreen />; }
 *
 *  الأزرار الثلاثة بالترتيب:
 *    1. اطلب الأذونات
 *    2. شوف المشاكل وأصلحها
 *    3. جرّب المنبه — اقفل الشاشة واستنى
 */

export default function TestScreen() {
  const [caps, setCaps] = useState(null);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(null);
  const [log, setLog] = useState([]);

  const addLog = useCallback((msg) => {
    const time = new Date().toLocaleTimeString('ar-EG');
    setLog((prev) => [`${time} — ${msg}`, ...prev].slice(0, 12));
  }, []);

  // ── الفحص ──
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      ClanAlarm.refreshCapabilities();
      const c = await ClanAlarm.getCapabilities();
      const i = await ClanAlarm.getIssues();
      setCaps(c);
      setIssues(i);
      addLog(`فحص: ${i.length} مشكلة`);
    } catch (e) {
      addLog(`خطأ في الفحص: ${e.message}`);
    }
    setLoading(false);
  }, [addLog]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── الاستماع للأحداث (أندرويد) ──
  useEffect(() => {
    const sub = ClanAlarm.addAlarmListener((e) => {
      addLog(`حدث: ${e.event} — ${e.alarmId || ''}`);
      if (e.event === 'ringing') setCountdown(null);
    });
    return () => sub.remove();
  }, [addLog]);

  // ── العد التنازلي ──
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) { setCountdown(null); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // ── الأفعال ──
  const askPermissions = async () => {
    try {
      const r = await ClanAlarm.requestPermissions();
      addLog(`الأذونات: ${r.granted ? 'ممنوحة' : 'مرفوضة'}`);
      await refresh();
    } catch (e) {
      addLog(`خطأ: ${e.message}`);
    }
  };

  const runTest = async () => {
    try {
      await ClanAlarm.testAlarm(15);
      setCountdown(15);
      addLog('منبه تجريبي بعد 15 ثانية');
      Alert.alert(
        'اقفل الشاشة دلوقتي',
        'المنبه هيرن بعد 15 ثانية.\n\nاقفل شاشة الموبايل عشان تشوف الشاشة الكاملة.',
        [{ text: 'تمام' }],
      );
    } catch (e) {
      addLog(`فشل الاختبار: ${e.message}`);
      Alert.alert('فشل', e.message);
    }
  };

  const scheduleReal = async () => {
    try {
      const now = new Date();
      const later = new Date(now.getTime() + 2 * 60_000);

      await ClanAlarm.setAlarm({
        id: 'test-real-1',
        hour: later.getHours(),
        minute: later.getMinutes(),
        weekdays: [later.getDay()],
        label: 'اختبار حقيقي',
        enabled: true,
        snoozeMinutes: 0,
      });

      const hh = String(later.getHours()).padStart(2, '0');
      const mm = String(later.getMinutes()).padStart(2, '0');
      addLog(`منبه حقيقي: ${hh}:${mm}`);

      Alert.alert(
        'اتضبط',
        `المنبه هيرن ${hh}:${mm}\n\n` +
        'دلوقتي:\n' +
        '1. اسحب التطبيق من قائمة المهام\n' +
        '2. اقفل الشاشة\n' +
        '3. استنى\n\n' +
        'ده الاختبار الحاسم.',
      );
    } catch (e) {
      addLog(`فشل: ${e.message}`);
    }
  };

  const clearAll = async () => {
    try {
      await ClanAlarm.syncAlarms([]);
      addLog('اتمسحت كل المنبهات');
    } catch (e) {
      addLog(`خطأ: ${e.message}`);
    }
  };

  // ════════════════════════════════════════════════

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color={ORANGE} />
        <Text style={styles.dim}>بفحص...</Text>
      </View>
    );
  }

  const guaranteed = issues.length === 0;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>

      <Text style={styles.title}>اختبار المنبه</Text>

      {/* الحالة */}
      <View style={[styles.badge, guaranteed ? styles.badgeOk : styles.badgeWarn]}>
        <Text style={styles.badgeText}>
          {guaranteed ? '✓ المنبه مضمون' : `⚠ ${issues.length} مشكلة`}
        </Text>
      </View>

      {/* القدرات */}
      {caps && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>الجهاز</Text>
          <Row label="الاستراتيجية" value={caps.strategy} />
          {caps.manufacturer && <Row label="الشركة" value={caps.manufacturer} />}
          {caps.sdkInt && <Row label="أندرويد API" value={String(caps.sdkInt)} />}
          {caps.systemVersion && <Row label="iOS" value={caps.systemVersion} />}
          <Row label="يخترق الصامت" value={caps.bypassSilent ? 'نعم' : 'لا'} />
          <Row label="شاشة كاملة" value={caps.fullScreen ? 'نعم' : 'لا'} />
          <Row label="صوت بلا حد" value={caps.unlimitedSound ? 'نعم' : 'لا'} />
        </View>
      )}

      {/* المشاكل */}
      {issues.map((issue) => (
        <View
          key={issue.key}
          style={[
            styles.card,
            issue.severity === 'fatal' ? styles.cardFatal : styles.cardWarn,
          ]}
        >
          <Text style={styles.issueTitle}>{issue.title}</Text>
          <Text style={styles.issueBody}>{issue.body}</Text>
          {issue.fix && (
            <TouchableOpacity
              style={styles.fixBtn}
              onPress={async () => {
                await issue.fix();
                setTimeout(refresh, 1500);
              }}
            >
              <Text style={styles.fixText}>افتح الإعدادات</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      {/* العد التنازلي */}
      {countdown !== null && (
        <View style={styles.countdown}>
          <Text style={styles.countdownNum}>{countdown}</Text>
          <Text style={styles.dim}>اقفل الشاشة</Text>
        </View>
      )}

      {/* الأزرار */}
      <TouchableOpacity style={styles.btn} onPress={askPermissions}>
        <Text style={styles.btnText}>1 · اطلب الأذونات</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btn} onPress={refresh}>
        <Text style={styles.btnText}>2 · أعد الفحص</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={runTest}>
        <Text style={[styles.btnText, styles.btnTextPrimary]}>
          3 · جرّب المنبه (15 ثانية)
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={scheduleReal}>
        <Text style={[styles.btnText, styles.btnTextPrimary]}>
          4 · اختبار حقيقي (دقيقتين)
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btnGhost} onPress={clearAll}>
        <Text style={styles.btnGhostText}>امسح كل المنبهات</Text>
      </TouchableOpacity>

      {/* السجل */}
      {log.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>السجل</Text>
          {log.map((l, i) => (
            <Text key={i} style={styles.logLine}>{l}</Text>
          ))}
        </View>
      )}

    </ScrollView>
  );
}

const Row = ({ label, value }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

const ORANGE = '#FF8A3D';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0D12' },
  content: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  center: { alignItems: 'center', justifyContent: 'center' },

  title: { fontSize: 26, fontWeight: '700', color: '#FFF', marginBottom: 16, textAlign: 'right' },
  dim: { color: '#6C7488', fontSize: 13, marginTop: 8, textAlign: 'center' },

  badge: { padding: 14, borderRadius: 12, marginBottom: 16, alignItems: 'center' },
  badgeOk: { backgroundColor: '#12301C' },
  badgeWarn: { backgroundColor: '#3A2A12' },
  badgeText: { color: '#FFF', fontSize: 15, fontWeight: '600' },

  card: {
    backgroundColor: '#151922', borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#232838',
  },
  cardFatal: { borderColor: '#E14B4B', backgroundColor: '#1C1418' },
  cardWarn: { borderColor: '#C08A2E', backgroundColor: '#1C1810' },
  cardTitle: { color: '#8B93A7', fontSize: 12, marginBottom: 10, textAlign: 'right' },

  row: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 5 },
  rowLabel: { color: '#8B93A7', fontSize: 13 },
  rowValue: { color: '#FFF', fontSize: 13, fontWeight: '500' },

  issueTitle: { color: '#FFF', fontSize: 15, fontWeight: '600', textAlign: 'right' },
  issueBody: { color: '#8B93A7', fontSize: 13, marginTop: 6, textAlign: 'right', lineHeight: 19 },
  fixBtn: {
    marginTop: 12, backgroundColor: '#232838',
    paddingVertical: 10, borderRadius: 8, alignItems: 'center',
  },
  fixText: { color: ORANGE, fontSize: 14, fontWeight: '600' },

  countdown: {
    alignItems: 'center', paddingVertical: 20, marginBottom: 12,
    backgroundColor: '#151922', borderRadius: 14,
  },
  countdownNum: { fontSize: 52, color: ORANGE, fontWeight: '200' },

  btn: {
    backgroundColor: '#1A1F2B', paddingVertical: 15,
    borderRadius: 12, alignItems: 'center', marginBottom: 10,
  },
  btnPrimary: { backgroundColor: ORANGE },
  btnText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  btnTextPrimary: { color: '#0B0D12', fontWeight: '700' },

  btnGhost: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  btnGhostText: { color: '#5A6274', fontSize: 13, textDecorationLine: 'underline' },

  logLine: {
    color: '#6C7488', fontSize: 11, paddingVertical: 2,
    textAlign: 'right', fontFamily: 'monospace',
  },
});
