import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { salesSummary, topProducts, salesByEmployee } from '../db/repository';

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
    <ScrollView style={styles.container}>
      <Text style={styles.title}>รายงานยอดขาย</Text>
      <View style={styles.rangeRow}>
        {(['today', 'week', 'month'] as RangeKey[]).map(r => (
          <TouchableOpacity key={r} style={[styles.rangeChip, range === r && styles.rangeChipActive]} onPress={() => setRange(r)}>
            <Text style={[styles.rangeChipText, range === r && styles.rangeChipTextActive]}>
              {{ today: 'วันนี้', week: '7 วัน', month: '30 วัน' }[r]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{summary?.order_count ?? 0}</Text>
          <Text style={styles.summaryLabel}>ออเดอร์</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>฿{(summary?.revenue ?? 0).toFixed(0)}</Text>
          <Text style={styles.summaryLabel}>ยอดขาย</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>฿{(summary?.discounts ?? 0).toFixed(0)}</Text>
          <Text style={styles.summaryLabel}>ส่วนลด</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>สินค้าขายดี</Text>
      {top.length === 0 && <Text style={styles.empty}>ยังไม่มีข้อมูล</Text>}
      {top.map((p, idx) => (
        <View key={idx} style={styles.listRow}>
          <Text style={styles.listName}>{p.name}</Text>
          <Text style={styles.listMeta}>{p.qty} ชิ้น · ฿{p.revenue.toFixed(0)}</Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>ยอดขายตามพนักงาน</Text>
      {byEmployee.length === 0 && <Text style={styles.empty}>ยังไม่มีข้อมูล</Text>}
      {byEmployee.map((e, idx) => (
        <View key={idx} style={styles.listRow}>
          <Text style={styles.listName}>{e.name}</Text>
          <Text style={styles.listMeta}>{e.order_count} ออเดอร์ · ฿{e.revenue.toFixed(0)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6', padding: 12 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  rangeRow: { flexDirection: 'row', marginBottom: 12 },
  rangeChip: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginRight: 8, backgroundColor: '#fff' },
  rangeChipActive: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  rangeChipText: { fontSize: 12, color: '#374151' },
  rangeChipTextActive: { color: '#fff' },
  summaryRow: { flexDirection: 'row', marginBottom: 16 },
  summaryCard: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 14, marginRight: 8, alignItems: 'center' },
  summaryValue: { fontSize: 18, fontWeight: '800', color: '#111827' },
  summaryLabel: { fontSize: 11, color: '#6B7280', marginTop: 4 },
  sectionTitle: { fontWeight: '700', fontSize: 14, marginTop: 8, marginBottom: 8 },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', padding: 10, borderRadius: 8, marginBottom: 6 },
  listName: { fontWeight: '600', fontSize: 13 },
  listMeta: { fontSize: 12, color: '#6B7280' },
  empty: { color: '#9CA3AF', fontSize: 12, marginBottom: 8 },
});
