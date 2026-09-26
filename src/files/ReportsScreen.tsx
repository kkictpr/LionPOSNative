import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { salesSummary, topProducts, salesByEmployee } from '../db/repository';
import {
  LionCard, LionChip, LionStatCard,
  colors, layout, formatBaht, useResponsive,
} from '../components/lion';

type RangeKey = 'today' | 'week' | 'month';

function rangeToISO(key: RangeKey) {
  const now = new Date();
  const to = now.toISOString();
  const from = new Date(now);
  if (key === 'today') from.setHours(0, 0, 0, 0);
  if (key === 'week') from.setDate(from.getDate() - 7);
  if (key === 'month') from.setMonth(from.getMonth() - 1);
  return { from: from.toISOString(), to };
}

export default function ReportsScreen() {
  const { employee } = useAuth();
  const { isTablet } = useResponsive();
  const [range, setRange] = useState<RangeKey>('today');
  const [summary, setSummary] = useState<any>(null);
  const [top, setTop] = useState<any[]>([]);
  const [byEmployee, setByEmployee] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!employee) return;
    const { from, to } = rangeToISO(range);
    setSummary(await salesSummary(employee.store_id, from, to));
    setTop(await topProducts(employee.store_id, from, to));
    setByEmployee(await salesByEmployee(employee.store_id, from, to));
  }, [employee, range]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.inner}>
        <Text style={styles.title}>รายงานยอดขาย</Text>
        <View style={styles.rangeRow}>
          {(['today', 'week', 'month'] as RangeKey[]).map(r => (
            <LionChip
              key={r}
              label={{ today: 'วันนี้', week: '7 วัน', month: '30 วัน' }[r]}
              active={range === r}
              onPress={() => setRange(r)}
            />
          ))}
        </View>

        <View style={styles.summaryRow}>
          <LionStatCard label="ออเดอร์" value={String(summary?.order_count ?? 0)} />
          <LionStatCard label="ยอดขาย" value={formatBaht(summary?.revenue ?? 0)} />
          <LionStatCard label="ส่วนลด" value={formatBaht(summary?.discounts ?? 0)} />
        </View>

        <View style={[styles.lists, isTablet && styles.listsTablet]}>
          <View style={isTablet ? styles.listColTablet : undefined}>
            <Text style={styles.sectionTitle}>สินค้าขายดี</Text>
            {top.length === 0 && <Text style={styles.empty}>ยังไม่มีข้อมูล</Text>}
            {top.map((p, idx) => (
              <LionCard key={idx} style={styles.listRow}>
                <Text style={styles.rank}>{idx + 1}</Text>
                <Text style={styles.listName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.listMeta}>{p.qty} ชิ้น · ฿{p.revenue.toFixed(0)}</Text>
              </LionCard>
            ))}
          </View>

          <View style={isTablet ? styles.listColTablet : undefined}>
            <Text style={styles.sectionTitle}>ยอดขายตามพนักงาน</Text>
            {byEmployee.length === 0 && <Text style={styles.empty}>ยังไม่มีข้อมูล</Text>}
            {byEmployee.map((e, idx) => (
              <LionCard key={idx} style={styles.listRow}>
                <Text style={styles.rank}>{idx + 1}</Text>
                <Text style={styles.listName} numberOfLines={1}>{e.name}</Text>
                <Text style={styles.listMeta}>{e.order_count} ออเดอร์ · ฿{e.revenue.toFixed(0)}</Text>
              </LionCard>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 12, paddingBottom: 32 },
  inner: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 12 },
  rangeRow: { flexDirection: 'row', marginBottom: 12 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },

  lists: { gap: 4 },
  listsTablet: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  listColTablet: { flex: 1 },
  sectionTitle: { fontWeight: '800', fontSize: 15, color: colors.text, marginTop: 8, marginBottom: 8 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  rank: { width: 24, fontSize: 13, fontWeight: '800', color: colors.primary },
  listName: { flex: 1, fontWeight: '600', fontSize: 14, color: colors.text },
  listMeta: { fontSize: 12, color: colors.textMuted, marginLeft: 8 },
  empty: { color: colors.textMuted, fontSize: 12, marginBottom: 8 },
});
