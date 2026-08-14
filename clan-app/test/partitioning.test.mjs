import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPartitionBounds, partitionConfig } from '../scripts/partition-manager.mjs';

test('حساب نطاق البارتشن الشهري يطابق حدود التاريخ', () => {
  const d = new Date(Date.UTC(2026, 7, 15)); // August 2026
  const bounds = getPartitionBounds('Message_Partitioned', d);

  assert.equal(bounds.partitionName, 'message_2026_08');
  assert.equal(bounds.startStr, '2026-08-01 00:00:00');
  assert.equal(bounds.endStr, '2026-09-01 00:00:00');
});

test('نطاق نهاية العام يعبر إلى يناير من العام التالي', () => {
  const d = new Date(Date.UTC(2026, 11, 20)); // December 2026
  const bounds = getPartitionBounds('SparkTransaction_Partitioned', d);

  assert.equal(bounds.partitionName, 'sparktransaction_2026_12');
  assert.equal(bounds.startStr, '2026-12-01 00:00:00');
  assert.equal(bounds.endStr, '2027-01-01 00:00:00');
});

test('جميع جداول الحمل العالي مشمولة في خطة التقسيم', () => {
  assert.ok(partitionConfig.tables.includes('Message_Partitioned'));
  assert.ok(partitionConfig.tables.includes('SparkTransaction_Partitioned'));
  assert.ok(partitionConfig.monthsAhead >= 3, 'يجب حجز 3 أشهر للأمام على الأقل');
});
