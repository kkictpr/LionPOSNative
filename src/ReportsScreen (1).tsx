import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Animated, Pressable, useWindowDimensions, Alert,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import RNFS from 'react-native-fs';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { salesSummary, topProducts } from '../db/repository';
import { getDB } from '../db/database';

// ── LionPOS palette — identical to Dashboard / Inventory / Customers ───────
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
// Premium content cards use a slightly larger radius than modals/chips —
// style-only, matched across all screens.
const CARD_RADIUS = 24;

type RangeKey = 'today' | 'week' | 'month';

const RANGE_LABEL: Record<RangeKey, string> = { today: 'วันนี้', week: '7 วัน', month: '30 วัน' };

// ── Original logic — left exactly as-is ────────────────────────────────────
function rangeToISO(key: RangeKey) {
  const now = new Date();
  const to = now.toISOString();
  const from = new Date(now);
  if (key === 'today') from.setHours(0, 0, 0, 0);
  if (key === 'week') from.setDate(from.getDate() - 7);
  if (key === 'month') from.setMonth(from.getMonth() - 1);
  return { from: from.toISOString(), to };
}
// ── End original logic ──────────────────────────────────────────────────────

// Yesterday's full-day range (00:00:00.000–23:59:59.999), used only for the
// "today vs yesterday" hourly comparison line — added alongside rangeToISO
// without touching its original logic.
function yesterdayISORange() {
  const start = new Date();
  start.setDate(start.getDate() - 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

// ── Extra report queries ────────────────────────────────────────────────────
// Implemented locally with getDB so the shared db/repository.ts (used by other
// screens) is left untouched, per the "don't edit other files" rule.
async function hourlyRevenue(storeId: string, fromISO: string, toISO: string) {
  const db = await getDB();
  const [res] = await db.executeSql(
    `SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour, IFNULL(SUM(total),0) as revenue
     FROM sales
     WHERE store_id = ? AND status = 'completed' AND created_at BETWEEN ? AND ?
     GROUP BY hour;`,
    [storeId, fromISO, toISO],
  );
  const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0 }));
  for (let i = 0; i < res.rows.length; i++) {
    const r = res.rows.item(i);
    if (buckets[r.hour]) buckets[r.hour].revenue = Number(r.revenue) || 0;
  }
  return buckets;
}

async function dailyRevenue(storeId: string, fromISO: string, toISO: string, days: number) {
  const db = await getDB();
  const [res] = await db.executeSql(
    `SELECT date(created_at) as day, IFNULL(SUM(total),0) as revenue
     FROM sales
     WHERE store_id = ? AND status = 'completed' AND created_at BETWEEN ? AND ?
     GROUP BY day;`,
    [storeId, fromISO, toISO],
  );
  const byDay: Record<string, number> = {};
  for (let i = 0; i < res.rows.length; i++) {
    const r = res.rows.item(i);
    byDay[r.day] = Number(r.revenue) || 0;
  }
  const out: { day: string; revenue: number }[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, revenue: byDay[key] ?? 0 });
  }
  return out;
}

// Raw line-items for CSV / PDF export — one row per sale line within the range.
async function saleLinesForExport(storeId: string, fromISO: string, toISO: string) {
  const db = await getDB();
  const [res] = await db.executeSql(
    `SELECT s.created_at, s.receipt_no, si.name, si.quantity, si.unit_price, si.line_discount, si.line_total
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.store_id = ? AND s.status = 'completed' AND s.created_at BETWEEN ? AND ?
     ORDER BY s.created_at;`,
    [storeId, fromISO, toISO],
  );
  const out: any[] = [];
  for (let i = 0; i < res.rows.length; i++) out.push(res.rows.item(i));
  return out;
}

function escapeHtml(s: any) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

function escapeCsv(v: any) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

function buildCsv(lines: any[]) {
  const header = 'วันที่,เลขบิล,สินค้า,จำนวน,ราคา,ส่วนลด,รวมเงิน';
  const body = lines.map((l) => [
    new Date(l.created_at).toLocaleString('th-TH'),
    l.receipt_no,
    l.name,
    l.quantity,
    l.unit_price,
    l.line_discount ?? 0,
    l.line_total,
  ].map(escapeCsv).join(',')).join('\n');
  // Leading BOM so Thai text opens correctly in Excel.
  return `\uFEFF${header}\n${body}\n`;
}

function buildReportHtml(params: {
  rangeLabel: string; revenue: number; orderCount: number; discounts: number; avgPerOrder: number; top: any[];
}) {
  const { rangeLabel, revenue, orderCount, discounts, avgPerOrder, top } = params;
  const rowsHtml = top.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(p.name)}</td>
      <td style="text-align:right">${p.qty}</td>
      <td style="text-align:right">${baht(Number(p.revenue ?? 0))}</td>
    </tr>`).join('');
  return `
  <html><head><meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, Roboto, sans-serif; padding: 24px; color:#0F172A; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .sub { color:#64748B; font-size:12px; margin-bottom:20px; }
    table { width:100%; border-collapse: collapse; margin-top: 12px; }
    th, td { padding: 8px; border-bottom: 1px solid #E2E8F0; font-size: 13px; }
    th { text-align:left; color:#64748B; }
    .kpi-row { display:flex; gap:12px; margin-top:12px; }
    .kpi { flex:1; border:1px solid #E2E8F0; border-radius:12px; padding:12px; }
    .kpi .label { color:#64748B; font-size:11px; }
    .kpi .value { font-size:16px; font-weight:700; margin-top:4px; }
  </style>
  </head><body>
    <h1>รายงานยอดขาย · LionPOS</h1>
    <div class="sub">ช่วงเวลา: ${escapeHtml(rangeLabel)}</div>
    <div class="kpi-row">
      <div class="kpi"><div class="label">ยอดขายรวม</div><div class="value">${baht(revenue)}</div></div>
      <div class="kpi"><div class="label">จำนวนบิล</div><div class="value">${orderCount}</div></div>
      <div class="kpi"><div class="label">ส่วนลดรวม</div><div class="value">${baht(discounts)}</div></div>
      <div class="kpi"><div class="label">ค่าเฉลี่ยต่อบิล</div><div class="value">${baht(avgPerOrder)}</div></div>
    </div>
    <h3>สินค้าขายดี Top 5</h3>
    <table>
      <thead><tr><th>อันดับ</th><th>สินค้า</th><th style="text-align:right">จำนวนขาย</th><th style="text-align:right">ยอดขาย</th></tr></thead>
      <tbody>${rowsHtml || '<tr><td colspan="4">ยังไม่มีข้อมูล</td></tr>'}</tbody>
    </table>
  </body></html>`;
}

function baht(n: number) {
  return `฿${Math.round(n).toLocaleString('th-TH')}`;
}

// ── Animated press wrapper (scale + ripple), shared by cards & buttons ─────
function Pressy({
  onPress, style, rippleColor, children, disabled,
}: { onPress?: () => void; style?: any; rippleColor?: string; children: React.ReactNode; disabled?: boolean }) {
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

// ── Light fade + rise-in wrapper for a subtle entrance animation ──────────
function FadeIn({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: any }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 340, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 340, delay, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

// ── KPI card — same gradient treatment as Dashboard ────────────────────────
function KpiCard({ icon, label, value, note, width }: { icon: string; label: string; value: string; note: string; width: number }) {
  return (
    <FadeIn style={{ width }}>
      <Pressy style={styles.kpiTouchable} rippleColor="rgba(255,255,255,0.08)">
        <LinearGradient
          colors={['#1B2740', COLORS.surface]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.kpiCard}>
          <View style={styles.kpiIconWrap}><Text style={styles.kpiIcon}>{icon}</Text></View>
          <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
          <Text style={styles.kpiLabel} numberOfLines={1}>{label}</Text>
          <Text style={styles.kpiNote} numberOfLines={1}>{note}</Text>
        </LinearGradient>
      </Pressy>
    </FadeIn>
  );
}

// ── Goal progress bar — plain View/Animated width fill, no native SVG needed ──
// (react-native-svg is not installed/linked in this project — see PackageList.java
// autolinking output — so the goal indicator uses only built-in RN primitives.)
function GoalBar({ percent, achieved }: { percent: number; achieved: boolean }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const widthAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(widthAnim, { toValue: clamped, duration: 500, useNativeDriver: false }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped]);
  const color = achieved ? COLORS.success : COLORS.primary;
  return (
    <View style={styles.goalBarWrap}>
      <View style={styles.goalBarHeadRow}>
        {achieved && <Text style={{ fontSize: 18, marginRight: 6 }}>🏆</Text>}
        <Text style={[styles.goalPct, { color }]}>{Math.round(clamped)}%</Text>
      </View>
      <View style={styles.goalBarTrack}>
        <Animated.View
          style={[
            styles.goalBarFill,
            { backgroundColor: color, width: widthAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) },
          ]}
        />
      </View>
    </View>
  );
}

// ── Hourly "today vs yesterday" comparison — plain View bars, no native SVG needed ──
// Hours are bucketed into 6 four-hour groups so the grouped bars stay legible;
// the raw 24-bucket `hourly` array (unchanged) still drives the peak-time badge.
function HourlyCompareChart({
  today, yesterday,
}: { today: { hour: number; revenue: number }[]; yesterday: { hour: number; revenue: number }[] }) {
  const groups = useMemo(() => {
    const out: { label: string; today: number; yesterday: number }[] = [];
    for (let g = 0; g < 6; g++) {
      const startH = g * 4;
      const endH = startH + 3;
      const sum = (arr: { hour: number; revenue: number }[]) =>
        arr.filter(h => h.hour >= startH && h.hour <= endH).reduce((s, h) => s + h.revenue, 0);
      out.push({
        label: `${String(startH).padStart(2, '0')}-${String(endH + 1).padStart(2, '0')}`,
        today: sum(today),
        yesterday: sum(yesterday),
      });
    }
    return out;
  }, [today, yesterday]);
  const max = Math.max(1, ...groups.map(g => Math.max(g.today, g.yesterday)));

  return (
    <View>
      <View style={styles.compareChartRow}>
        <View style={styles.chartGridOverlay} pointerEvents="none">
          <View style={styles.chartGridLine} />
          <View style={styles.chartGridLine} />
          <View style={styles.chartGridLine} />
        </View>
        {groups.map((g, i) => (
          <View key={i} style={styles.compareGroupCol}>
            <View style={styles.compareBarPair}>
              <View style={styles.compareBarTrack}>
                <View style={[styles.compareBarFill, { height: `${Math.max(4, (g.yesterday / max) * 100)}%`, backgroundColor: COLORS.textMuted }]} />
              </View>
              <View style={styles.compareBarTrack}>
                <View style={[styles.compareBarFill, { height: `${Math.max(4, (g.today / max) * 100)}%`, backgroundColor: COLORS.primary }]} />
              </View>
            </View>
            <Text style={styles.chartBarLabel} numberOfLines={1}>{g.label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.lineLegendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.primary }]} />
          <Text style={styles.legendText}>วันนี้</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.textMuted }]} />
          <Text style={styles.legendText}>เมื่อวาน</Text>
        </View>
      </View>
    </View>
  );
}

export default function ReportsScreen() {
  const { employee } = useAuth();
  const [range, setRange] = useState<RangeKey>('today');
  const [summary, setSummary] = useState<any>(null);
  const [top, setTop] = useState<any[]>([]);
  const [hourly, setHourly] = useState<{ hour: number; revenue: number }[]>([]);
  const [hourlyYesterday, setHourlyYesterday] = useState<{ hour: number; revenue: number }[]>([]);
  const [daily, setDaily] = useState<{ day: string; revenue: number }[]>([]);
  const [todayRevenue, setTodayRevenue] = useState(0); // drives the goal ring regardless of the selected range
  const [loading, setLoading] = useState(false);

  const { width } = useWindowDimensions();
  const isTablet = width >= 700;
  const pageWidth = isTablet ? Math.min(width, 960) : width;
  const contentPad = 20;
  const gap = 12;
  const kpiCols = isTablet ? 4 : 2;
  const kpiWidth = (pageWidth - contentPad * 2 - gap * (kpiCols - 1)) / kpiCols;

  // Loads only the queries each range actually needs: hourly (+ yesterday for the
  // comparison line) for "today", or a daily series for "7 วัน" / "30 วัน".
  // Re-runs whenever `range` changes (via useFocusEffect's dependency on `load`
  // below) and whenever the user taps "รีเฟรช".
  const load = useCallback(async () => {
    if (!employee) return;
    setLoading(true);
    try {
      const storeId = employee.store_id;
      const { from, to } = rangeToISO(range);

      const [sm, tp] = await Promise.all([
        salesSummary(storeId, from, to),
        topProducts(storeId, from, to, 5),
      ]);
      setSummary(sm);
      setTop(tp);

      if (range === 'today') {
        const { from: yFrom, to: yTo } = yesterdayISORange();
        const [h, hy] = await Promise.all([
          hourlyRevenue(storeId, from, to),
          hourlyRevenue(storeId, yFrom, yTo),
        ]);
        setHourly(h);
        setHourlyYesterday(hy);
        setDaily([]);
        setTodayRevenue(Number(sm?.revenue ?? 0));
      } else {
        const days = range === 'week' ? 7 : 30;
        const d = await dailyRevenue(storeId, from, to, days);
        setDaily(d);
        setHourly([]);
        setHourlyYesterday([]);
        const todayIso = rangeToISO('today');
        const todaySm = await salesSummary(storeId, todayIso.from, todayIso.to);
        setTodayRevenue(Number(todaySm?.revenue ?? 0));
      }
    } catch (err) {
      console.error('Load Reports Error:', err);
    } finally {
      setLoading(false);
    }
  }, [employee, range]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const orderCount: number = summary?.order_count ?? 0;
  const revenue: number = summary?.revenue ?? 0;
  const discounts: number = summary?.discounts ?? 0;
  const avgPerOrder = orderCount > 0 ? revenue / orderCount : 0;

  // Daily bar-chart series (used for the "7 วัน" / "30 วัน" views).
  const dailyChart = useMemo(() => {
    const rows = daily.map(d => ({
      label: new Date(`${d.day}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
      value: d.revenue,
    }));
    const max = rows.reduce((m, r) => (r.value > m ? r.value : m), 0);
    return { rows, max };
  }, [daily]);

  const barHeights = useRef<Animated.Value[]>([]).current;
  useEffect(() => {
    barHeights.length = 0;
    dailyChart.rows.forEach(() => barHeights.push(new Animated.Value(0)));
    Animated.stagger(30, dailyChart.rows.map((r, i) =>
      Animated.timing(barHeights[i], {
        toValue: dailyChart.max > 0 ? r.value / dailyChart.max : 0, duration: 400, useNativeDriver: false,
      }),
    )).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyChart]);

  // ── B: best-selling time slot — hour-of-day for "today", best day for 7/30 วัน ──
  const peakInfo = useMemo(() => {
    if (range === 'today') {
      if (!hourly.length) return null;
      const best = hourly.reduce((m, h) => (h.revenue > m.revenue ? h : m), hourly[0]);
      if (best.revenue <= 0) return null;
      const startH = String(best.hour).padStart(2, '0');
      const endH = String((best.hour + 1) % 24).padStart(2, '0');
      return `${startH}:00–${endH}:00`;
    }
    if (!daily.length) return null;
    const best = daily.reduce((m, d) => (d.revenue > m.revenue ? d : m), daily[0]);
    if (best.revenue <= 0) return null;
    return new Date(`${best.day}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  }, [range, hourly, daily]);

  // ── C: daily sales goal ring — fixed target of ฿2,000/วัน, always reflects "today" ──
  const GOAL = 2000;
  const goalPct = GOAL > 0 ? Math.min(100, (todayRevenue / GOAL) * 100) : 0;
  const goalAchieved = todayRevenue >= GOAL;
  const goalRemaining = Math.max(0, GOAL - todayRevenue);

  // ── Export: HTML report / CSV — both built with react-native-fs (confirmed
  // linked in this project's PackageList.java autolinking output). PDF export and
  // native Share are not available: react-native-html-to-pdf and react-native-share
  // are NOT installed/linked here, so calling them would crash the whole app at
  // bundle time (Metro can't resolve them) — see chat summary for what's needed
  // to enable real PDF/Share instead of this safe fallback.
  const [exportBusy, setExportBusy] = useState<'html' | 'csv' | 'share' | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);

  const generateHtmlReport = useCallback(async () => {
    const html = buildReportHtml({ rangeLabel: RANGE_LABEL[range], revenue, orderCount, discounts, avgPerOrder, top });
    const path = `${RNFS.DocumentDirectoryPath}/lionpos-report-${range}-${Date.now()}.html`;
    await RNFS.writeFile(path, html, 'utf8');
    return path;
  }, [range, revenue, orderCount, discounts, avgPerOrder, top]);

  const onExportPdf = async () => {
    if (!employee || exportBusy) return;
    setExportBusy('html');
    setExportNote(null);
    try {
      const path = await generateHtmlReport();
      setExportNote(`บันทึกรายงาน (HTML) แล้ว: ${path}\nเปิดไฟล์นี้แล้วสั่งพิมพ์เป็น PDF ได้จากเบราว์เซอร์ในเครื่อง`);
    } catch (err: any) {
      console.error('Export HTML Report Error:', err);
      Alert.alert('ส่งออกรายงานไม่สำเร็จ', err?.message ?? String(err));
    } finally {
      setExportBusy(null);
    }
  };

  const onExportCsv = async () => {
    if (!employee || exportBusy) return;
    setExportBusy('csv');
    setExportNote(null);
    try {
      const { from, to } = rangeToISO(range);
      const lines = await saleLinesForExport(employee.store_id, from, to);
      const csv = buildCsv(lines);
      const path = `${RNFS.DocumentDirectoryPath}/lionpos-report-${range}-${Date.now()}.csv`;
      await RNFS.writeFile(path, csv, 'utf8');
      setExportNote(`บันทึก CSV แล้ว: ${path}`);
    } catch (err: any) {
      console.error('Export CSV Error:', err);
      Alert.alert('ส่งออก CSV ไม่สำเร็จ', err?.message ?? String(err));
    } finally {
      setExportBusy(null);
    }
  };

  const onShare = async () => {
    if (!employee || exportBusy) return;
    setExportBusy('share');
    setExportNote(null);
    try {
      const path = await generateHtmlReport();
      Alert.alert(
        'ยังแชร์โดยตรงไม่ได้',
        `ต้องติดตั้ง react-native-share ก่อนจึงจะเปิดหน้าต่างแชร์ได้ ตอนนี้บันทึกไฟล์รายงานไว้ให้แล้วที่:\n${path}`,
      );
    } catch (err: any) {
      console.error('Export For Share Error:', err);
      Alert.alert('เตรียมไฟล์สำหรับแชร์ไม่สำเร็จ', err?.message ?? String(err));
    } finally {
      setExportBusy(null);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: contentPad, paddingBottom: 32 }}
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
              <Text style={styles.brandSub}>รายงานยอดขาย</Text>
            </View>
          </View>
          <Pressy onPress={load} style={styles.refreshBtn} rippleColor="rgba(255,138,0,0.2)" disabled={loading}>
            <Text style={styles.refreshText}>{loading ? 'กำลังโหลด…' : 'รีเฟรช'}</Text>
          </Pressy>
        </FadeIn>

        {/* ── Range filter ───────────────────────────────────────── */}
        <FadeIn delay={40} style={styles.rangeRow}>
          {(['today', 'week', 'month'] as RangeKey[]).map(r => (
            <Pressy
              key={r}
              onPress={() => setRange(r)}
              rippleColor="rgba(255,138,0,0.2)"
              style={{ marginRight: 8 }}>
              {range === r ? (
                <LinearGradient
                  colors={['#FFB84D', COLORS.primary, COLORS.primaryDark]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.rangeChip}>
                  <Text style={styles.rangeChipTextActive}>{RANGE_LABEL[r]}</Text>
                </LinearGradient>
              ) : (
                <View style={[styles.rangeChip, styles.rangeChipInactive]}>
                  <Text style={styles.rangeChipText}>{RANGE_LABEL[r]}</Text>
                </View>
              )}
            </Pressy>
          ))}
        </FadeIn>

        {/* ── KPI cards ──────────────────────────────────────────── */}
        <View style={[styles.kpiGrid, { gap }]}>
          <KpiCard icon="💰" label="ยอดขายรวม" value={baht(revenue)} note={RANGE_LABEL[range]} width={kpiWidth} />
          <KpiCard icon="🧾" label="จำนวนบิล" value={String(orderCount)} note="ออเดอร์" width={kpiWidth} />
          <KpiCard icon="🏷️" label="ส่วนลด" value={baht(discounts)} note="รวมทั้งหมด" width={kpiWidth} />
          <KpiCard icon="📈" label="เฉลี่ยต่อบิล" value={baht(avgPerOrder)} note="ต่อออเดอร์" width={kpiWidth} />
        </View>

        {/* ── C: daily sales goal ─────────────────────────────────── */}
        <FadeIn delay={90} style={styles.sectionCard}>
          <View style={styles.goalInfo}>
            <Text style={styles.sectionTitle}>🎯 เป้าหมายยอดขายวันนี้</Text>
            <Text style={styles.sectionHint}>เป้าหมาย {baht(GOAL)} / วัน</Text>
            <Text style={[styles.goalNow, goalAchieved && { color: COLORS.success }]}>ยอดปัจจุบัน {baht(todayRevenue)}</Text>
            <Text style={styles.sectionHint}>{goalAchieved ? 'ถึงเป้าหมายแล้ว 🎉' : `เหลืออีก ${baht(goalRemaining)}`}</Text>
          </View>
          <GoalBar percent={goalPct} achieved={goalAchieved} />
        </FadeIn>

        {/* ── Sales chart ────────────────────────────────────────── */}
        <FadeIn delay={120} style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>กราฟยอดขาย</Text>
            <Text style={styles.sectionHint}>
              {range === 'today' ? 'รายชั่วโมง · วันนี้ vs เมื่อวาน' : `รายวัน · ${RANGE_LABEL[range]}`}
            </Text>
          </View>

          {range === 'today' ? (
            hourly.every(h => h.revenue <= 0) && hourlyYesterday.every(h => h.revenue <= 0) ? (
              <EmptyInline icon="📊" text="ยังไม่มีข้อมูลในช่วงเวลานี้" />
            ) : (
              <HourlyCompareChart today={hourly} yesterday={hourlyYesterday} />
            )
          ) : dailyChart.rows.length === 0 || dailyChart.max <= 0 ? (
            <EmptyInline icon="📊" text="ยังไม่มีข้อมูลในช่วงเวลานี้" />
          ) : (
            <ScrollView horizontal={range === 'month'} showsHorizontalScrollIndicator={false}>
              <View style={[
                styles.chartRow,
                range === 'month' && { width: dailyChart.rows.length * 40, gap: 0 },
              ]}>
                <View style={styles.chartGridOverlay} pointerEvents="none">
                  <View style={styles.chartGridLine} />
                  <View style={styles.chartGridLine} />
                  <View style={styles.chartGridLine} />
                </View>
                {dailyChart.rows.map((row, i) => (
                  <View key={i} style={range === 'month' ? styles.chartBarColFixed : styles.chartBarCol}>
                    <Text style={styles.chartBarValue} numberOfLines={1}>{baht(row.value)}</Text>
                    <View style={styles.chartBarTrack}>
                      <Animated.View
                        style={[
                          styles.chartBarFill,
                          i === dailyChart.rows.length - 1 && styles.chartBarFillActive,
                          { height: barHeights[i]?.interpolate({ inputRange: [0, 1], outputRange: ['4%', '100%'] }) ?? '4%' },
                        ]}
                      />
                    </View>
                    <Text
                      style={[styles.chartBarLabel, i === dailyChart.rows.length - 1 && styles.chartBarLabelActive]}
                      numberOfLines={1}>
                      {row.label}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}

          {/* ── B: best-selling time slot ────────────────────────── */}
          {peakInfo && (
            <View style={styles.peakCard}>
              <Text style={styles.peakText}>
                🔥 {range === 'today' ? 'ช่วงขายดีที่สุด' : 'วันขายดีที่สุด'} {peakInfo}
              </Text>
            </View>
          )}
        </FadeIn>

        {/* ── Top sellers ──────────────────────────────────────── */}
        <FadeIn delay={160} style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>🏆 สินค้าขายดี</Text>
          {top.length === 0 ? (
            <EmptyInline icon="🍦" text="ยังไม่มีข้อมูลในช่วงเวลานี้" />
          ) : top.map((p, i) => (
            <View key={i} style={styles.listRow}>
              <View style={styles.rankBadge}><Text style={styles.rankBadgeText}>{i + 1}</Text></View>
              <Text style={styles.listName} numberOfLines={1}>{p.name}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.listAmount}>{baht(Number(p.revenue ?? 0))}</Text>
                <Text style={styles.listQty}>{p.qty} ชิ้น</Text>
              </View>
            </View>
          ))}
        </FadeIn>

        {/* ── Export ──────────────────────────────────────────────── */}
        <FadeIn delay={240} style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>ส่งออกรายงาน</Text>
          <Text style={styles.sectionHint}>{RANGE_LABEL[range]} · เลือกรูปแบบไฟล์ที่ต้องการ</Text>
          <View style={styles.exportRow}>
            <Pressy onPress={onExportPdf} rippleColor="rgba(255,255,255,0.2)" style={styles.exportCol} disabled={!!exportBusy}>
              <LinearGradient
                colors={['#FFB84D', COLORS.primary, COLORS.primaryDark]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.exportBtn}>
                <Text style={styles.exportBtnText}>{exportBusy === 'html' ? 'กำลังสร้าง…' : 'บันทึกรายงาน (HTML)'}</Text>
              </LinearGradient>
            </Pressy>
            <Pressy onPress={onExportCsv} rippleColor="rgba(255,255,255,0.2)" style={styles.exportCol} disabled={!!exportBusy}>
              <LinearGradient
                colors={['#FFB84D', COLORS.primary, COLORS.primaryDark]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.exportBtn}>
                <Text style={styles.exportBtnText}>{exportBusy === 'csv' ? 'กำลังสร้าง…' : 'บันทึกเป็น CSV'}</Text>
              </LinearGradient>
            </Pressy>
            <Pressy onPress={onShare} rippleColor="rgba(255,138,0,0.2)" style={styles.exportCol} disabled={!!exportBusy}>
              <View style={[styles.exportBtn, styles.exportBtnGhost]}>
                <Text style={styles.exportBtnTextGhost}>{exportBusy === 'share' ? 'กำลังแชร์…' : 'แชร์'}</Text>
              </View>
            </Pressy>
          </View>
          {exportNote && <Text style={styles.exportNote}>{exportNote}</Text>}
        </FadeIn>
      </View>
    </ScrollView>
  );
}

function EmptyInline({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.emptyInline}>
      <Text style={styles.emptyInlineIcon}>{icon}</Text>
      <Text style={styles.emptyInlineText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  pageInner: {},

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBadge: {
    width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.primary, shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  logoEmoji: { fontSize: 28 },
  brand: { color: COLORS.textLight, fontSize: 20, fontWeight: '800' },
  brandSub: { color: COLORS.textMuted, fontSize: 11, marginTop: 1 },
  refreshBtn: {
    borderWidth: 1, borderColor: COLORS.card, backgroundColor: COLORS.surface,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14,
  },
  refreshText: { color: COLORS.textLight, fontWeight: '600', fontSize: 12 },

  rangeRow: { flexDirection: 'row', marginBottom: 18 },
  rangeChip: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 9, minHeight: 36, justifyContent: 'center' },
  rangeChipInactive: { borderWidth: 1, borderColor: COLORS.card, backgroundColor: COLORS.surface },
  rangeChipText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  rangeChipTextActive: { fontSize: 12, color: '#fff', fontWeight: '700' },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 18 },
  kpiTouchable: { borderRadius: CARD_RADIUS, overflow: 'hidden' },
  kpiCard: {
    padding: 16, minHeight: 120, borderWidth: 1, borderColor: '#2A3A57',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6,
  },
  kpiIconWrap: {
    width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,138,0,0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  kpiIcon: { fontSize: 16 },
  kpiValue: { color: COLORS.textLight, fontSize: 18, fontWeight: '800' },
  kpiLabel: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  kpiNote: { color: COLORS.primary, fontSize: 11, fontWeight: '700', marginTop: 6 },

  sectionCard: {
    backgroundColor: COLORS.surface, borderRadius: CARD_RADIUS, borderWidth: 1, borderColor: COLORS.card,
    padding: 16, marginBottom: 18,
  },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 },
  sectionTitle: { color: COLORS.textLight, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  sectionHint: { color: COLORS.textMuted, fontSize: 11 },

  chartRow: { flexDirection: 'row', alignItems: 'flex-end', height: 160, gap: 8 },
  chartGridOverlay: { position: 'absolute', left: 0, right: 0, top: 20, bottom: 18, justifyContent: 'space-between' },
  chartGridLine: { height: 1, backgroundColor: 'rgba(248,250,252,0.06)' },
  chartBarCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  chartBarColFixed: { width: 32, marginRight: 8, alignItems: 'center', justifyContent: 'flex-end' },
  chartBarValue: { color: COLORS.textMuted, fontSize: 9, marginBottom: 4 },
  chartBarTrack: {
    width: '100%', flex: 1, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'flex-end', overflow: 'hidden',
  },
  chartBarFill: { width: '100%', borderRadius: 8, backgroundColor: COLORS.card },
  chartBarFillActive: { backgroundColor: COLORS.primary },
  chartBarLabel: { color: COLORS.textMuted, fontSize: 10, marginTop: 6 },
  chartBarLabelActive: { color: COLORS.primary, fontWeight: '700' },

  // ── A: hourly "today vs yesterday" grouped-bar comparison ───────────────
  compareChartRow: { flexDirection: 'row', alignItems: 'flex-end', height: 160, gap: 6, position: 'relative' },
  compareGroupCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  compareBarPair: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, width: '100%', flex: 1 },
  compareBarTrack: {
    flex: 1, height: '100%', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'flex-end', overflow: 'hidden',
  },
  compareBarFill: { width: '100%', borderRadius: 6 },
  lineLegendRow: { flexDirection: 'row', gap: 16, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: COLORS.textMuted, fontSize: 11 },

  // ── B: best-selling time-slot badge ──────────────────────────────────────
  peakCard: {
    marginTop: 14, backgroundColor: 'rgba(255,138,0,0.12)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,138,0,0.3)', paddingHorizontal: 12, paddingVertical: 10,
  },
  peakText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },

  // ── C: daily sales goal bar ───────────────────────────────────────────────
  goalInfo: { marginBottom: 14 },
  goalBarWrap: {},
  goalBarHeadRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  goalBarTrack: { height: 14, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  goalBarFill: { height: '100%', borderRadius: 7 },
  goalPct: { color: COLORS.textLight, fontSize: 16, fontWeight: '800' },
  goalNow: { color: COLORS.textLight, fontSize: 13, fontWeight: '700', marginTop: 4, marginBottom: 2 },

  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: COLORS.background, gap: 10 },
  rankBadge: { width: 26, height: 26, borderRadius: 9, backgroundColor: 'rgba(255,138,0,0.18)', alignItems: 'center', justifyContent: 'center' },
  rankBadgeText: { color: COLORS.primary, fontSize: 11, fontWeight: '800' },
  listName: { flex: 1, color: COLORS.textLight, fontSize: 13, fontWeight: '600' },
  listQty: { color: COLORS.textMuted, fontSize: 11, marginTop: 1 },
  listAmount: { color: COLORS.success, fontSize: 12, fontWeight: '700' },

  exportRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  exportCol: { flex: 1 },
  exportBtn: { paddingVertical: 13, borderRadius: 14, alignItems: 'center', justifyContent: 'center', minHeight: 46 },
  exportBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  exportBtnGhost: { backgroundColor: 'rgba(255,138,0,0.12)', borderWidth: 1, borderColor: 'rgba(255,138,0,0.4)' },
  exportBtnTextGhost: { color: COLORS.primary, fontWeight: '700', fontSize: 12 },
  exportNote: { color: COLORS.textMuted, fontSize: 11, marginTop: 10 },

  emptyInline: { alignItems: 'center', paddingVertical: 28 },
  emptyInlineIcon: { fontSize: 30, marginBottom: 8 },
  emptyInlineText: { color: COLORS.textMuted, fontSize: 12 },
});
