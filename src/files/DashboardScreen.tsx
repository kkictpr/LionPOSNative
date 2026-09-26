import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { salesSummary, listProducts } from '../db/repository';
import {
  LionCard, LionChip, LionLineChart, LionMascot, LionStatCard,
  LOW_STOCK_THRESHOLD, colors, formatBaht, layout, radius, shadow, useResponsive,
} from '../components/lion';

type MenuButtonProps = {
  title: string;
  onPress?: () => void;
  wide: boolean;
};

const MenuButton = ({ title, onPress, wide }: MenuButtonProps) => (
  <Pressable
    style={[styles.card, { flexBasis: wide ? '45%' : '100%' }]}
    android_ripple={{ color: 'rgba(245,158,11,0.18)' }}
    onPress={onPress}>
    <Text style={styles.cardText}>{title}</Text>
  </Pressable>
);

export default function DashboardScreen() {
  const { employee } = useAuth();
  const { isTablet } = useResponsive();
  const [lastSync, setLastSync] = useState('ยังไม่เคย Sync');
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [todayOrders, setTodayOrders] = useState(0);
  const [lowStock, setLowStock] = useState(0);
  const [series, setSeries] = useState<{ label: string; value: number }[]>([]);

  // KPI + กราฟ: อ่านผ่าน repository เดิม (salesSummary / listProducts) ไม่แตะ DB โดยตรง
  const loadStats = useCallback(async () => {
    if (!employee) return;
    try {
      const points: { label: string; value: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - i);
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
        const s = await salesSummary(employee.store_id, start.toISOString(), end.toISOString());
        points.push({ label: String(start.getDate()), value: s?.revenue ?? 0 });
        if (i === 0) {
          setTodayRevenue(s?.revenue ?? 0);
          setTodayOrders(s?.order_count ?? 0);
        }
      }
      setSeries(points);
      const products = await listProducts(employee.store_id);
      setLowStock(products.filter((p: any) => (p.quantity ?? 0) <= LOW_STOCK_THRESHOLD).length);
    } catch {
      // ให้เมนูหลักใช้งานได้ต่อ แม้โหลดสถิติไม่สำเร็จ
    }
  }, [employee]);

  useFocusEffect(useCallback(() => { loadStats(); }, [loadStats]));

  const testSupabase = async () => {
    try {
      const { data, error } = await supabase
        .from('hashrate_history')
        .select('*')
        .limit(1);

      if (error) throw error;

      const now = new Date().toLocaleTimeString('th-TH');

      setLastSync(now);

      Alert.alert(
        '☁️ Sync สำเร็จ',
        `อ่านข้อมูลได้ ${data?.length ?? 0} รายการ`
      );
    } catch (e: any) {
      Alert.alert('☁️ Sync Failed', e.message);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.inner}>
        <View style={styles.headerRow}>
          <LionMascot size={60} />
          <View style={styles.flex1}>
            <Text style={styles.title}>Saku Data Center</Text>
            <Text style={styles.subtitle}>ศูนย์กลางระบบ LionPOS</Text>
          </View>
        </View>

        <View style={styles.syncRow}>
          <LionChip tone="success" label={`Last Sync: ${lastSync}`} />
        </View>

        <View style={styles.statRow}>
          <LionStatCard label="ยอดขายวันนี้" value={formatBaht(todayRevenue)} />
          <LionStatCard label="จำนวนบิล" value={String(todayOrders)} />
          <LionStatCard label="สินค้าใกล้หมด" value={String(lowStock)} tone={lowStock > 0 ? 'warning' : undefined} />
        </View>

        <LionCard style={styles.chartCard}>
          <Text style={styles.sectionTitle}>ยอดขาย 7 วันล่าสุด</Text>
          <LionLineChart data={series} />
        </LionCard>

        <View style={styles.grid}>
          <MenuButton wide={isTablet} title="🛒 LionPOS" />
          <MenuButton wide={isTablet} title="☁️ Sync Cloud" onPress={testSupabase} />
          <MenuButton wide={isTablet} title="📊 รายงาน" />
          <MenuButton wide={isTablet} title="☀️ Solar" />
          <MenuButton wide={isTablet} title="⛏️ Mining" />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  inner: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center' },
  flex1: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800' },
  subtitle: { color: colors.textMuted, marginTop: 2 },
  syncRow: { flexDirection: 'row', marginTop: 12, marginBottom: 16 },
  statRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  chartCard: { marginBottom: 20 },
  sectionTitle: { color: colors.text, fontWeight: '800', fontSize: 15, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: {
    flexGrow: 1,
    minHeight: 64,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.15)',
    overflow: 'hidden',
    ...shadow.soft,
  },
  cardText: { color: colors.text, fontSize: 18, fontWeight: '700' },
});
