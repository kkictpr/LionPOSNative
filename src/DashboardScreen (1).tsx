import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Alert, ScrollView, Animated, Pressable,
  useWindowDimensions, ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { supabase } from '../services/supabase';

// ── LionPOS theme — identical palette/radius to the rest of the app ────────
const COLORS = {
  primary: '#FF8A00',
  primaryDark: '#E67300',
  background: '#0F172A',
  surface: '#1E293B',
  card: '#334155',
  textLight: '#F8FAFC',
  textMuted: '#94A3B8',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
};
const RADIUS = 20;
// Premium content cards (KPI / section cards) use a slightly larger radius
// than modals/chips elsewhere in the app — style-only, matched across all screens.
const CARD_RADIUS = 24;

// ── Mock data ────────────────────────────────────────────────────────────
// Placeholder numbers only, standing in until real report/inventory queries
// are wired up. `testSupabase` / `lastSync` below are the only real data path
// in this file and are left completely untouched.
const MOCK_WEEKLY_SALES = [
  { label: '19', amount: 8200 },
  { label: '20', amount: 9000 },
  { label: '21', amount: 7600 },
  { label: '22', amount: 10400 },
  { label: '23', amount: 9800 },
  { label: '24', amount: 11200 },
  { label: '25', amount: 12540 },
];

const MOCK_TOP_SELLERS = [
  { name: 'ไอศกรีมวานิลา', qty: 48, amount: 1680 },
  { name: 'สตรอเบอร์รี่', qty: 36, amount: 1440 },
  { name: 'มะม่วง', qty: 22, amount: 880 },
];

const MOCK_LOW_STOCK = [
  { name: 'สตรอเบอร์รี่', qty: 5 },
  { name: 'มะม่วง', qty: 8 },
  { name: 'คุกกี้แอนด์ครีม', qty: 12 },
];

const MOCK_KPI = {
  todaySales: 12540,
  salesTrend: '+12%',
  billCount: 48,
  billTrend: '+8%',
  lowStockCount: MOCK_LOW_STOCK.length,
  newCustomers: 5,
  newCustomersTrend: '+2',
};

function formatMoney(n: number) {
  return `฿${n.toLocaleString('th-TH', { minimumFractionDigits: 0 })}`;
}

function greetingForHour(h: number) {
  if (h < 11) return 'สวัสดีตอนเช้า';
  if (h < 17) return 'สวัสดีตอนบ่าย';
  return 'สวัสดีตอนเย็น';
}

// ── Shared animated press wrapper (light scale-down feedback) ─────────────
function Pressy({
  onPress, style, rippleColor, children, disabled,
}: {
  onPress?: () => void; style?: any; rippleColor?: string; children: React.ReactNode; disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={disabled}
        android_ripple={{ color: rippleColor ?? 'rgba(255,138,0,0.2)' }}
        style={style}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ── Light fade + rise-in wrapper used to stagger sections on mount ────────
function FadeIn({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: any }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 380, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 380, delay, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY, delay]);
  return <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

// ── KPI card ───────────────────────────────────────────────────────────
function KpiCard({
  icon, label, value, trend, trendUp = true, width,
}: { icon: string; label: string; value: string; trend?: string; trendUp?: boolean; width: number }) {
  return (
    <FadeIn style={{ width }}>
      <Pressy style={styles.kpiTouchable} rippleColor="rgba(255,255,255,0.08)">
        <LinearGradient
          colors={['#1B2740', COLORS.surface]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.kpiCard}>
          <View style={styles.kpiIconWrap}><Text style={styles.kpiIcon}>{icon}</Text></View>
          <Text style={styles.kpiValue} numberOfLines={1}>{value}</Text>
          <Text style={styles.kpiLabel} numberOfLines={1}>{label}</Text>
          {trend ? (
            <Text style={[styles.kpiTrend, { color: trendUp ? COLORS.success : COLORS.danger }]}>
              {trendUp ? '▲' : '▼'} {trend}
            </Text>
          ) : (
            <View style={styles.kpiTrendSpacer} />
          )}
        </LinearGradient>
      </Pressy>
    </FadeIn>
  );
}

// ── Lightweight 7-day bar chart — pure Views, no chart dependency ─────────
function WeeklyBarChart({ data }: { data: { label: string; amount: number }[] }) {
  const max = Math.max(...data.map(d => d.amount), 1);
  const heights = useRef(data.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.stagger(60, heights.map((h, i) =>
      Animated.timing(h, { toValue: data[i].amount / max, duration: 500, useNativeDriver: false }),
    )).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.chartRow}>
      <View style={styles.chartGridOverlay} pointerEvents="none">
        <View style={styles.chartGridLine} />
        <View style={styles.chartGridLine} />
        <View style={styles.chartGridLine} />
      </View>
      {data.map((d, i) => {
        const isLast = i === data.length - 1;
        return (
          <View key={d.label} style={styles.chartBarCol}>
            <View style={styles.chartBarTrack}>
              <Animated.View
                style={[
                  styles.chartBarFill,
                  isLast && styles.chartBarFillActive,
                  { height: heights[i].interpolate({ inputRange: [0, 1], outputRange: ['4%', '100%'] }) },
                ]}
              />
            </View>
            <Text style={[styles.chartBarLabel, isLast && styles.chartBarLabelActive]}>{d.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function DashboardScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 700; // Android tablets & iPad Gen7
  const pageWidth = isTablet ? Math.min(width, 960) : width;
  const contentPad = 20;
  const gap = 10;
  const kpiCols = isTablet ? 4 : 2;
  const kpiWidth = (pageWidth - contentPad * 2 - gap * (kpiCols - 1)) / kpiCols;

  // ── Original data logic — left exactly as-is ───────────────────────────
  const [lastSync, setLastSync] = useState('ยังไม่เคย Sync');

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
  // ── End original logic ─────────────────────────────────────────────────

  // UI-only wrapper: shows a spinner while the (unchanged) sync call runs.
  const [syncing, setSyncing] = useState(false);
  const handleSyncPress = async () => {
    if (syncing) return;
    setSyncing(true);
    await testSupabase();
    setSyncing(false);
  };

  const today = useMemo(() => {
    const d = new Date();
    const dateStr = d.toLocaleDateString('th-TH-u-ca-buddhist', { day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    return { dateStr, timeStr, greeting: greetingForHour(d.getHours()) };
  }, []);

  return (
    <ScrollView
  style={styles.screen}
  contentContainerStyle={{
    padding: 12,
    paddingBottom: 4,
  }}
  showsVerticalScrollIndicator={false}
>
      <View style={[styles.pageInner, isTablet && { maxWidth: 960, width: '100%', alignSelf: 'center' }]}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <FadeIn style={styles.header}>
          <View style={styles.headerLeft}>
            <LinearGradient
              colors={['#FFB84D', COLORS.primary, COLORS.primaryDark]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.logoBadge}>
              <Text style={styles.logoEmoji}>🦁</Text>
            </LinearGradient>
            <View>
              <Text style={styles.brand}>LionPOS</Text>
              <Text style={styles.brandSub}>Saku Data Center</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerDate}>{today.dateStr}</Text>
            <Text style={styles.headerTime}>{today.timeStr}</Text>
          </View>
        </FadeIn>

        <FadeIn delay={40}>
          <Text style={styles.greeting}>{today.greeting}ครับ 👋</Text>
        </FadeIn>

        {/* ── Sync status bar (real logic, only re-styled) ──────────── */}
        <FadeIn delay={80}>
          <Pressy onPress={handleSyncPress} style={styles.syncBar} rippleColor="rgba(255,138,0,0.15)" disabled={syncing}>
            <View style={styles.syncBarLeft}>
              <Text style={styles.syncIcon}>☁️</Text>
              <View>
                <Text style={styles.syncTitle}>Cloud Sync</Text>
                <Text style={styles.syncSub}>Last Sync: {lastSync}</Text>
              </View>
            </View>
            {syncing ? (
              <ActivityIndicator color={COLORS.primary} />
            ) : (
              <View style={styles.syncBtn}><Text style={styles.syncBtnText}>ซิงค์เดี๋ยวนี้</Text></View>
            )}
          </Pressy>
        </FadeIn>

        {/* ── KPI cards ──────────────────────────────────────────── */}
        <View style={[styles.kpiGrid, { gap }]}>
          <KpiCard icon="💰" label="ยอดขายวันนี้" value={formatMoney(MOCK_KPI.todaySales)} trend={MOCK_KPI.salesTrend} width={kpiWidth} />
          <KpiCard icon="🧾" label="จำนวนบิล" value={String(MOCK_KPI.billCount)} trend={MOCK_KPI.billTrend} width={kpiWidth} />
          <KpiCard icon="⚠️" label="สินค้าใกล้หมด" value={String(MOCK_KPI.lowStockCount)} trendUp={false} width={kpiWidth} />
          <KpiCard icon="🙋" label="ลูกค้าใหม่" value={String(MOCK_KPI.newCustomers)} trend={MOCK_KPI.newCustomersTrend} width={kpiWidth} />
        </View>

        {/* ── Weekly sales chart ─────────────────────────────────── */}


        {/* ── Top sellers / low stock ───────────────────────────── */}
        <View style={[styles.twoColRow, isTablet && styles.twoColRowTablet]}>
          <FadeIn delay={200} style={[styles.sectionCard, isTablet && styles.halfCard]}>
            <Text style={styles.sectionTitle}>🏆 สินค้าขายดี</Text>
            {MOCK_TOP_SELLERS.map((p, i) => (
              <View key={p.name} style={styles.listRow}>
                <View style={styles.rankBadge}><Text style={styles.rankBadgeText}>{i + 1}</Text></View>
                <Text style={styles.listName} numberOfLines={1}>{p.name}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.listQty}>{p.qty} ชิ้น</Text>
                  <Text style={styles.listAmount}>{formatMoney(p.amount)}</Text>
                </View>
              </View>
            ))}
          </FadeIn>

          <FadeIn delay={240} style={[styles.sectionCard, isTablet && styles.halfCard]}>
            <Text style={styles.sectionTitle}>⚠️ สินค้าใกล้หมด</Text>
            {MOCK_LOW_STOCK.map(p => (
              <View key={p.name} style={styles.listRow}>
                <View style={[styles.rankBadge, styles.warnBadge]}><Text style={styles.rankBadgeText}>!</Text></View>
                <Text style={styles.listName} numberOfLines={1}>{p.name}</Text>
                <View style={[styles.stockPill, p.qty <= 5 ? styles.stockPillDanger : styles.stockPillWarn]}>
                  <Text style={[styles.stockPillText, { color: p.qty <= 5 ? COLORS.danger : COLORS.warning }]}>
                    คงเหลือ {p.qty}
                  </Text>
                </View>
              </View>
            ))}
          </FadeIn>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  pageInner: { paddingBottom: 0 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBadge: {
    width: 44, height: 44, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.primary, shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  logoEmoji: { fontSize: 24 },
  brand: { color: COLORS.textLight, fontSize: 18, fontWeight: '800' },
  brandSub: { color: COLORS.textMuted, fontSize: 11, marginTop: 1 },
  headerRight: { alignItems: 'flex-end' },
  headerDate: { color: COLORS.textLight, fontSize: 13, fontWeight: '600' },
  headerTime: { color: COLORS.textMuted, fontSize: 11, marginTop: 1 },

  greeting: { color: COLORS.textLight, fontSize: 18, fontWeight: '700' },
  greetingSub: { color: COLORS.textMuted, fontSize: 13, marginTop: 2, marginBottom: 8 },

  syncBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: RADIUS, borderWidth: 1, borderColor: COLORS.card,
    paddingVertical: 6, paddingHorizontal: 12, marginBottom: 8,
  },
  syncBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  syncIcon: { fontSize: 18 },
  syncTitle: { color: COLORS.textLight, fontSize: 13, fontWeight: '700' },
  syncSub: { color: COLORS.success, fontSize: 11, marginTop: 2 },
  syncBtn: { backgroundColor: 'rgba(255,138,0,0.15)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  syncBtnText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  kpiTouchable: { borderRadius: CARD_RADIUS, overflow: 'hidden' },
  kpiCard: {
    padding: 10, minHeight: 96, borderWidth: 1, borderColor: '#2A3A57',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6,
  },
  kpiIconWrap: {
    width: 26, height: 26, borderRadius: 8, backgroundColor: 'rgba(255,138,0,0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  kpiIcon: { fontSize: 14 },
  kpiValue: { color: COLORS.textLight, fontSize: 18, fontWeight: '800' },
  kpiLabel: { color: COLORS.textMuted, fontSize: 11, marginTop: 0 },
  kpiTrend: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  kpiTrendSpacer: { height: 15, marginTop: 4 },

  sectionCard: {
    backgroundColor: COLORS.surface, borderRadius: CARD_RADIUS, borderWidth: 1, borderColor: COLORS.card,
    padding: 10, marginBottom: 8,
  },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { color: COLORS.textLight, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  sectionHighlight: { color: COLORS.primary, fontSize: 16, fontWeight: '800' },

  chartRow: { flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 8 },
  chartGridOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 18, justifyContent: 'space-between' },
  chartGridLine: { height: 1, backgroundColor: 'rgba(248,250,252,0.06)' },
  chartBarCol: { flex: 1, alignItems: 'center' },
  chartBarTrack: {
    width: '100%', flex: 1, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'flex-end', overflow: 'hidden',
  },
  chartBarFill: { width: '100%', borderRadius: 8, backgroundColor: COLORS.card },
  chartBarFillActive: { backgroundColor: COLORS.primary },
  chartBarLabel: { color: COLORS.textMuted, fontSize: 10, marginTop: 6 },
  chartBarLabelActive: { color: COLORS.primary, fontWeight: '700' },

  groupLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 10, letterSpacing: 0.5 },
  quickRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  quickItem: { flex: 1, alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.card, paddingVertical: 14 },
  quickIconWrap: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  quickIconWrapPlain: { backgroundColor: 'rgba(255,255,255,0.06)' },
  quickIcon: { fontSize: 18 },
  quickLabel: { color: COLORS.textLight, fontSize: 11, fontWeight: '600' },

  twoColRow: { flexDirection: 'column' },
  twoColRowTablet: { flexDirection: 'row', gap: 10 },
  halfCard: { flex: 1, marginBottom: 0 },

  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.background, gap: 10 },
  rankBadge: { width: 26, height: 26, borderRadius: 9, backgroundColor: 'rgba(255,138,0,0.18)', alignItems: 'center', justifyContent: 'center' },
  rankBadgeText: { color: COLORS.primary, fontSize: 11, fontWeight: '800' },
  warnBadge: { backgroundColor: 'rgba(239,68,68,0.18)' },
  listName: { flex: 1, color: COLORS.textLight, fontSize: 13, fontWeight: '600' },
  listQty: { color: COLORS.textMuted, fontSize: 11 },
  listAmount: { color: COLORS.success, fontSize: 12, fontWeight: '700', marginTop: 1 },

  stockPill: { borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6, minHeight: 26, justifyContent: 'center' },
  stockPillDanger: { backgroundColor: 'rgba(239,68,68,0.15)' },
  stockPillWarn: { backgroundColor: 'rgba(245,158,11,0.15)' },
  stockPillText: { fontSize: 10, fontWeight: '800' },
});
