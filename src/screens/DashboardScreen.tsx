import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Alert, ScrollView, Animated, Pressable,
  useWindowDimensions, ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { syncNow } from '../services/syncService';
import { salesSummary, topProducts, lowStockProducts } from '../db/repository';

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

function formatMoney(n: number) {
  return `฿${n.toLocaleString('th-TH', { minimumFractionDigits: 0 })}`;
}

// ── UI-only: badge color tier for the "สินค้าใกล้หมด" card, by remaining qty ──
function stockBadgeColors(qty: number) {
  if (qty <= 5) return { bg: 'rgba(239,68,68,0.18)', fg: COLORS.danger };     // แดง
  if (qty <= 10) return { bg: 'rgba(255,138,0,0.18)', fg: COLORS.primary };   // ส้ม
  if (qty <= 15) return { bg: 'rgba(245,158,11,0.18)', fg: COLORS.warning }; // เหลือง
  return { bg: 'rgba(148,163,184,0.16)', fg: COLORS.textMuted };             // สีเดิมของระบบ
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
    if (data.length > 0) {
      Animated.stagger(50, heights.map((h, i) =>
        Animated.timing(h, { toValue: (data[i]?.amount ?? 0) / max, duration: 450, useNativeDriver: false }),
      )).start();
    }
  }, [data, max, heights]);

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
                  { height: (heights[i] ?? new Animated.Value(0)).interpolate({ inputRange: [0, 1], outputRange: ['4%', '100%'] }) },
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

const INITIAL_WEEKLY = Array.from({ length: 7 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (6 - i));
  return { label: String(d.getDate()), amount: 0 };
});

export default function DashboardScreen() {
  const { employee } = useAuth();
  const { width } = useWindowDimensions();
  const isTablet = width >= 700; // Android tablets & iPad Gen7
  const pageWidth = isTablet ? Math.min(width, 960) : width;
  const contentPad = 12;
  const gap = 10;
  const kpiCols = isTablet ? 4 : 2;
  const kpiWidth = (pageWidth - contentPad * 2 - gap * (kpiCols - 1)) / kpiCols;

  const [lastSync, setLastSync] = useState('ยังไม่เคย Sync');
  const [syncing, setSyncing] = useState(false);

  const [kpi, setKpi] = useState({
    todaySales: 0,
    salesTrend: '0%',
    salesTrendUp: true,
    billCount: 0,
    billTrend: '0%',
    billTrendUp: true,
    lowStockCount: 0,
    newCustomers: 0,
    newCustomersTrend: '0%',
  });

  const [topSellers, setTopSellers] = useState<{ name: string; qty: number; revenue: number }[]>([]);
  const [lowStockItems, setLowStockItems] = useState<{ name: string; quantity: number; low_stock_alert: number }[]>([]);
  const [weeklySales, setWeeklySales] = useState<{ label: string; amount: number }[]>(INITIAL_WEEKLY);

  const loadDashboardData = useCallback(async () => {
    if (!employee?.store_id) return;
    try {
      const storeId = employee.store_id;
      const now = new Date();

      // 1. ดึงยอดขายและจำนวนบิลวันนี้ และย้อนหลัง 7 วัน
      const days: { label: string; amount: number }[] = [];
      let todayRev = 0;
      let todayBills = 0;
      let yesterdayRev = 0;
      let yesterdayBills = 0;

      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString();
        const dEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();
        const s = await salesSummary(storeId, dStart, dEnd);
        const rev = s?.revenue ?? 0;
        const count = s?.order_count ?? 0;
        days.push({ label: String(d.getDate()), amount: rev });

        if (i === 0) {
          todayRev = rev;
          todayBills = count;
        } else if (i === 1) {
          yesterdayRev = rev;
          yesterdayBills = count;
        }
      }
      setWeeklySales(days);

      // คำนวณ Trend เทียบกับเมื่อวาน (รักษา UI เดิม)
      let sTrend = '0%';
      let sTrendUp = true;
      if (yesterdayRev > 0) {
        const diff = Math.round(((todayRev - yesterdayRev) / yesterdayRev) * 100);
        sTrend = diff >= 0 ? `+${diff}%` : `${diff}%`;
        sTrendUp = diff >= 0;
      } else if (todayRev > 0) {
        sTrend = '+100%';
        sTrendUp = true;
      }

      let bTrend = '0%';
      let bTrendUp = true;
      if (yesterdayBills > 0) {
        const diffB = Math.round(((todayBills - yesterdayBills) / yesterdayBills) * 100);
        bTrend = diffB >= 0 ? `+${diffB}%` : `${diffB}%`;
        bTrendUp = diffB >= 0;
      } else if (todayBills > 0) {
        bTrend = '+100%';
        bTrendUp = true;
      }

      // 2. ดึงสินค้าใกล้หมด
      const lowStock = await lowStockProducts(storeId);
      setLowStockItems(lowStock ?? []);

      // 3. ดึงสินค้าขายดี 3 อันดับแรกของวันนี้
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
      const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
      const top = await topProducts(storeId, startToday, endToday, 3);
      setTopSellers(top ?? []);

      setKpi({
        todaySales: todayRev,
        salesTrend: sTrend,
        salesTrendUp: sTrendUp,
        billCount: todayBills,
        billTrend: bTrend,
        billTrendUp: bTrendUp,
        lowStockCount: lowStock?.length ?? 0,
        newCustomers: 0,
        newCustomersTrend: '0%',
      });
    } catch (err) {
      console.warn('Dashboard load error:', err);
    }
  }, [employee]);

  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [loadDashboardData])
  );

  const handleSyncPress = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await syncNow();
      setLastSync(new Date().toLocaleTimeString('th-TH'));
      await loadDashboardData();
      Alert.alert('☁️ Sync สำเร็จ', 'ซิงค์ข้อมูลกับระบบ Cloud เรียบร้อยแล้ว');
    } catch (e: any) {
      Alert.alert('☁️ Sync Failed', e?.message ?? 'ไม่สามารถซิงค์ได้');
    } finally {
      setSyncing(false);
    }
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
      showsVerticalScrollIndicator={false}>
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
          <KpiCard icon="💰" label="ยอดขายวันนี้" value={formatMoney(kpi.todaySales)} trend={kpi.salesTrend} trendUp={kpi.salesTrendUp} width={kpiWidth} />
          <KpiCard icon="🧾" label="จำนวนบิล" value={String(kpi.billCount)} trend={kpi.billTrend} trendUp={kpi.billTrendUp} width={kpiWidth} />
          <KpiCard icon="⚠️" label="สินค้าใกล้หมด" value={String(kpi.lowStockCount)} trendUp={false} width={kpiWidth} />
          <KpiCard icon="🙋" label="ลูกค้าใหม่" value={String(kpi.newCustomers)} trend={kpi.newCustomersTrend} trendUp={true} width={kpiWidth} />
        </View>

        {/* ── Weekly sales chart ─────────────────────────────────── */}
        <FadeIn delay={160} style={[styles.sectionCard, { marginBottom: 8 }]}>
          <Text style={styles.sectionTitle}>📊 ยอดขาย 7 วันล่าสุด</Text>
          <WeeklyBarChart data={weeklySales} />
        </FadeIn>

        {/* ── Top sellers / low stock ───────────────────────────── */}
        <View style={[styles.twoColRow, isTablet && styles.twoColRowTablet]}>
          <FadeIn delay={200} style={[styles.sectionCard, isTablet && styles.halfCard]}>
            <Text style={styles.sectionTitle}>🏆 สินค้าขายดี</Text>
            {topSellers.length === 0 ? (
              <Text style={styles.emptyText}>ยังไม่มีรายการขายวันนี้</Text>
            ) : (
              topSellers.map((p, i) => (
                <View key={p.name} style={styles.listRow}>
                  <View style={styles.rankBadge}><Text style={styles.rankBadgeText}>{i + 1}</Text></View>
                  <Text style={styles.listName} numberOfLines={1}>{p.name}</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.listQty}>{p.qty} ชิ้น</Text>
                    <Text style={styles.listAmount}>{formatMoney(p.revenue)}</Text>
                  </View>
                </View>
              ))
            )}
          </FadeIn>

          <FadeIn delay={240} style={[styles.sectionCard, isTablet && styles.halfCard]}>
            <Text style={styles.sectionTitle}>⚠️ สินค้าใกล้หมด ({lowStockItems.length})</Text>
            {lowStockItems.length === 0 ? (
              <Text style={styles.emptyText}>สต็อกสินค้าทุกรายการเพียงพอ</Text>
            ) : (
              lowStockItems.map(p => {
                const badge = stockBadgeColors(p.quantity);
                return (
                  <View key={p.name} style={styles.lowStockRow}>
                    <View style={[styles.rankBadge, styles.warnBadge]}><Text style={styles.rankBadgeText}>!</Text></View>
                    <Text style={styles.listName} numberOfLines={1}>{p.name}</Text>
                    <View style={[styles.stockPill, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.stockPillText, { color: badge.fg }]}>{p.quantity}</Text>
                    </View>
                  </View>
                );
              })
            )}
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
  lowStockRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.14)',
  },
  rankBadge: { width: 26, height: 26, borderRadius: 9, backgroundColor: 'rgba(255,138,0,0.18)', alignItems: 'center', justifyContent: 'center' },
  rankBadgeText: { color: COLORS.primary, fontSize: 11, fontWeight: '800' },
  warnBadge: { backgroundColor: 'rgba(239,68,68,0.18)' },
  listName: { flex: 1, color: COLORS.textLight, fontSize: 13, fontWeight: '600' },
  listQty: { color: COLORS.textMuted, fontSize: 11 },
  listAmount: { color: COLORS.success, fontSize: 12, fontWeight: '700', marginTop: 1 },

  stockPill: {
    width: 46, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  stockPillText: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: COLORS.textMuted, fontSize: 12, paddingVertical: 14, textAlign: 'center' },
});
