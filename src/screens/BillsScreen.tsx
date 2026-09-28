import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { listSales } from '../db/repository';

// ── Lion Design System — same palette/radius as Reports / Dashboard ──
const COLORS = {
  primary: '#FF8A00',
  background: '#0F172A',
  surface: '#1E293B',
  card: '#334155',
  textLight: '#F8FAFC',
  textMuted: '#94A3B8',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
};
const CARD_RADIUS = 24;

type Bill = {
  id: string;
  receipt_no: string;
  created_at: string;
  total: number;
  status: string;
  employee_name?: string;
};

function baht(n: number) {
  return `฿${Math.round(n).toLocaleString('th-TH')}`;
}

// sales.created_at is SQLite datetime('now') → "YYYY-MM-DD HH:MM:SS" in UTC.
function parseDbDate(v: string) {
  const t = String(v ?? '');
  return new Date(t.includes('T') ? t : `${t.replace(' ', 'T')}Z`);
}

// Real status values from database.ts: completed | refunded | void
function statusMeta(status: string) {
  if (status === 'completed') return { label: 'สำเร็จ', color: COLORS.success, bg: 'rgba(16,185,129,0.16)' };
  if (status === 'refunded') return { label: 'คืนเงิน', color: COLORS.warning, bg: 'rgba(245,158,11,0.16)' };
  if (status === 'void') return { label: 'ยกเลิก', color: COLORS.danger, bg: 'rgba(239,68,68,0.16)' };
  return { label: status || '-', color: COLORS.textMuted, bg: 'rgba(148,163,184,0.16)' };
}

export default function BillsScreen() {
  const { employee } = useAuth();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!employee?.store_id) return;
    setLoading(true);
    try {
      // repository.ts owns all SQLite access (newest first, joined with employee name)
      setBills((await listSales(employee.store_id, 50)) as Bill[]);
    } catch (err) {
      console.error('Bills load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [employee]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>บิล</Text>
        <Text style={styles.count}>{bills.length} รายการล่าสุด</Text>
      </View>

      {loading && bills.length === 0 ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={bills}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ padding: 16, paddingTop: 4 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🧾</Text>
              <Text style={styles.emptyText}>ยังไม่มีบิล</Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = statusMeta(item.status);
            const dt = parseDbDate(item.created_at);
            return (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.receipt}>#{item.receipt_no}</Text>
                    <View style={[styles.pill, { backgroundColor: meta.bg }]}>
                      <Text style={[styles.pillText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.date}>
                    {dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}
                    {dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                    {item.employee_name ? ` · ${item.employee_name}` : ''}
                  </Text>
                </View>
                <Text style={[styles.total, { color: meta.color }]}>{baht(item.total)}</Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
  },
  title: { color: COLORS.textLight, fontSize: 20, fontWeight: '800' },
  count: { color: COLORS.textMuted, fontSize: 12 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(30,41,59,0.72)', borderRadius: CARD_RADIUS,
    borderWidth: 1, borderColor: 'rgba(148,163,184,0.14)', padding: 14, marginBottom: 10,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  receipt: { color: COLORS.textLight, fontSize: 14, fontWeight: '700' },
  date: { color: COLORS.textMuted, fontSize: 11, marginTop: 4 },
  total: { fontSize: 15, fontWeight: '800', marginLeft: 10 },
  pill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 10, fontWeight: '800' },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 30, marginBottom: 8 },
  emptyText: { color: COLORS.textMuted, fontSize: 12 },
});
