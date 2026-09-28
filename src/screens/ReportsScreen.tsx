import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Animated, Pressable, useWindowDimensions, Alert, ActivityIndicator, Modal,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import RNFS from 'react-native-fs';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { salesSummary, topProducts, lowStockProducts } from '../db/repository';
import { getDB } from '../db/database';
import { syncNow } from '../services/syncService';

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

// ── Time filter model (Patch C) ─────────────────────────────────────────────
// today / week / month / year are the quick chips. "custom" is driven by the
// two dropdowns (month + year); selMonth === null means "whole year".
type Mode = 'today' | 'week' | 'month' | 'year' | 'custom';
type Grain = 'hourly' | 'daily' | 'monthly';
type HourBucket = { hour: number; revenue: number };
type DayBucket = { day: string; revenue: number };

const QUICK_MODES: { key: Exclude<Mode, 'custom'>; label: string }[] = [
  { key: 'today', label: 'วันนี้' },
  { key: 'week', label: '7 วัน' },
  { key: 'month', label: 'เดือนนี้' },
  { key: 'year', label: 'ปีนี้' },
];

const MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

type Period = {
  from: Date; to: Date;
  prevFrom: Date; prevTo: Date;
  label: string; prevLabel: string;
  grain: Grain;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

// Local calendar-day key (YYYY-MM-DD) — matches SQLite date(created_at,'localtime').
function localKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// sales.created_at / customers.created_at are written by SQLite as datetime('now'),
// i.e. "YYYY-MM-DD HH:MM:SS" in UTC (space separator, no "T"/"Z"). Every range
// boundary is converted to that exact format, so the string comparison inside
// repository.ts (created_at BETWEEN ? AND ?) and the local queries below line up.
// (An ISO "…T…Z" boundary would wrongly drop rows that fall on the boundary date.)
function sqlTs(d: Date) {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

// Parse a SQLite created_at ("YYYY-MM-DD HH:MM:SS", UTC) into a Date. The space
// separator is not reliably parsed by Hermes, so normalise to ISO first.
function parseDbDate(v: string) {
  const t = String(v ?? '');
  return new Date(t.includes('T') ? t : `${t.replace(' ', 'T')}Z`);
}

// Same day-of-month / clock time as `ref`, but inside the month that starts at
// `monthStart`; clamped to `monthEnd` when that month is shorter.
function sameDayInMonth(ref: Date, monthStart: Date, monthEnd: Date) {
  const c = new Date(
    monthStart.getFullYear(), monthStart.getMonth(), ref.getDate(),
    ref.getHours(), ref.getMinutes(), ref.getSeconds(), ref.getMilliseconds(),
  );
  return c.getTime() > monthEnd.getTime() ? monthEnd : c;
}

function buildPeriod(mode: Mode, selMonth: number | null, selYear: number, now: Date = new Date()): Period {
  if (mode === 'today') {
    const from = startOfDay(now);
    const prevFrom = new Date(from);
    prevFrom.setDate(prevFrom.getDate() - 1);
    const prevTo = new Date(now);
    prevTo.setDate(prevTo.getDate() - 1);
    return { from, to: now, prevFrom, prevTo, label: 'วันนี้', prevLabel: 'เมื่อวาน', grain: 'hourly' };
  }
  if (mode === 'week') {
    const from = startOfDay(now);
    from.setDate(from.getDate() - 6);
    const prevFrom = new Date(from);
    prevFrom.setDate(prevFrom.getDate() - 7);
    const prevTo = new Date(now);
    prevTo.setDate(prevTo.getDate() - 7);
    return { from, to: now, prevFrom, prevTo, label: '7 วันล่าสุด', prevLabel: '7 วันก่อนหน้า', grain: 'daily' };
  }
  if (mode === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return {
      from, to: now, prevFrom, prevTo: sameDayInMonth(now, prevFrom, prevEnd),
      label: 'เดือนนี้', prevLabel: 'เดือนก่อน', grain: 'daily',
    };
  }
  if (mode === 'year') {
    const from = new Date(now.getFullYear(), 0, 1);
    const prevFrom = new Date(now.getFullYear() - 1, 0, 1);
    const prevTo = new Date(
      now.getFullYear() - 1, now.getMonth(), now.getDate(),
      now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds(),
    );
    return { from, to: now, prevFrom, prevTo, label: 'ปีนี้', prevLabel: 'ปีก่อน', grain: 'monthly' };
  }
  // custom — driven by the month / year dropdowns
  if (selMonth === null) {
    const from = new Date(selYear, 0, 1);
    const end = new Date(selYear, 11, 31, 23, 59, 59, 999);
    const isCurrent = selYear === now.getFullYear();
    const prevFrom = new Date(selYear - 1, 0, 1);
    const prevEnd = new Date(selYear - 1, 11, 31, 23, 59, 59, 999);
    const prevTo = isCurrent
      ? new Date(selYear - 1, now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds())
      : prevEnd;
    return {
      from, to: isCurrent ? now : end, prevFrom, prevTo,
      label: `ปี ${selYear + 543}`, prevLabel: `ปี ${selYear + 542}`, grain: 'monthly',
    };
  }
  const from = new Date(selYear, selMonth, 1);
  const end = new Date(selYear, selMonth + 1, 0, 23, 59, 59, 999);
  const isCurrent = selYear === now.getFullYear() && selMonth === now.getMonth();
  const prevFrom = new Date(selYear, selMonth - 1, 1);
  const prevEnd = new Date(selYear, selMonth, 0, 23, 59, 59, 999);
  return {
    from, to: isCurrent ? now : end,
    prevFrom, prevTo: isCurrent ? sameDayInMonth(now, prevFrom, prevEnd) : prevEnd,
    label: `${MONTHS_FULL[selMonth]} ${selYear + 543}`,
    prevLabel: `${MONTHS_FULL[prevFrom.getMonth()]} ${prevFrom.getFullYear() + 543}`,
    grain: 'daily',
  };
}

// Yesterday's full-day range (00:00:00.000–23:59:59.999), used only for the
// "today vs yesterday" hourly comparison chart.
function yesterdayRange() {
  const from = startOfDay(new Date());
  from.setDate(from.getDate() - 1);
  const to = new Date(from);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

// ── Extra report queries ────────────────────────────────────────────────────
// Implemented locally with getDB so the shared db/repository.ts (used by other
// screens) is left untouched. SQLite is the only data source read here.
// Bucketing uses 'localtime' so hours / days / months follow the device's
// timezone (created_at is stored in UTC). Ranges use datetime(created_at) so they
// work for both "YYYY-MM-DD HH:MM:SS" and ISO-formatted rows.
async function hourlyRevenue(storeId: string, from: Date, to: Date): Promise<HourBucket[]> {
  const db = await getDB();
  const [res] = await db.executeSql(
    `SELECT CAST(strftime('%H', created_at, 'localtime') AS INTEGER) as hour, IFNULL(SUM(total),0) as revenue
     FROM sales
     WHERE store_id = ? AND status = 'completed' AND datetime(created_at) BETWEEN ? AND ?
     GROUP BY hour;`,
    [storeId, sqlTs(from), sqlTs(to)],
  );
  const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0 }));
  for (let i = 0; i < res.rows.length; i++) {
    const r = res.rows.item(i);
    if (buckets[r.hour]) buckets[r.hour].revenue = Number(r.revenue) || 0;
  }
  return buckets;
}

// One bucket per calendar day between `from` and `to` (inclusive), zero-filled.
async function dailyRevenueRange(storeId: string, from: Date, to: Date): Promise<DayBucket[]> {
  const db = await getDB();
  const [res] = await db.executeSql(
    `SELECT date(created_at, 'localtime') as day, IFNULL(SUM(total),0) as revenue
     FROM sales
     WHERE store_id = ? AND status = 'completed' AND datetime(created_at) BETWEEN ? AND ?
     GROUP BY day;`,
    [storeId, sqlTs(from), sqlTs(to)],
  );
  const byDay: Record<string, number> = {};
  for (let i = 0; i < res.rows.length; i++) {
    const r = res.rows.item(i);
    byDay[r.day] = Number(r.revenue) || 0;
  }
  const out: DayBucket[] = [];
  const d = startOfDay(from);
  const last = startOfDay(to).getTime();
  while (d.getTime() <= last && out.length < 400) {
    const key = localKey(d);
    out.push({ day: key, revenue: byDay[key] ?? 0 });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// 12 monthly totals for `ctxYear` and for the year before it (for the grouped chart).
async function monthlyRevenue(storeId: string, ctxYear: number) {
  const db = await getDB();
  const from = new Date(ctxYear - 1, 0, 1);
  const to = new Date(ctxYear, 11, 31, 23, 59, 59, 999);
  const [res] = await db.executeSql(
    `SELECT strftime('%Y-%m', created_at, 'localtime') as ym, IFNULL(SUM(total),0) as revenue
     FROM sales
     WHERE store_id = ? AND status = 'completed' AND datetime(created_at) BETWEEN ? AND ?
     GROUP BY ym;`,
    [storeId, sqlTs(from), sqlTs(to)],
  );
  const cur = Array.from({ length: 12 }, () => 0);
  const prev = Array.from({ length: 12 }, () => 0);
  for (let i = 0; i < res.rows.length; i++) {
    const r = res.rows.item(i);
    const [y, m] = String(r.ym).split('-').map(Number);
    const rev = Number(r.revenue) || 0;
    if (y === ctxYear && m >= 1 && m <= 12) cur[m - 1] = rev;
    if (y === ctxYear - 1 && m >= 1 && m <= 12) prev[m - 1] = rev;
  }
  return { cur, prev };
}

// Revenue per year, all time (most recent 6 years that have data).
async function yearlyRevenue(storeId: string) {
  const db = await getDB();
  const [res] = await db.executeSql(
    `SELECT strftime('%Y', created_at, 'localtime') as y, IFNULL(SUM(total),0) as revenue
     FROM sales
     WHERE store_id = ? AND status = 'completed'
     GROUP BY y ORDER BY y;`,
    [storeId],
  );
  const out: { year: number; revenue: number }[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    const r = res.rows.item(i);
    const year = Number(r.y);
    if (year > 0) out.push({ year, revenue: Number(r.revenue) || 0 });
  }
  return out.slice(-6);
}

// Customers created inside [from, to]. Schema (database.ts): customers(id, name, phone,
// email, points, store_credit, created_at) — shared across stores, so no store filter.
async function newCustomersCount(from: Date, to: Date): Promise<number> {
  const db = await getDB();
  const [res] = await db.executeSql(
    `SELECT COUNT(*) as n FROM customers WHERE datetime(created_at) BETWEEN ? AND ?;`,
    [sqlTs(from), sqlTs(to)],
  );
  return Number(res.rows.item(0)?.n) || 0;
}

type TopCustomer = { name: string; orders: number; revenue: number };

// Top customers by completed-sales revenue (all time). Walk-in sales with no
// customer_id are excluded by the JOIN.
async function topCustomersAllTime(storeId: string): Promise<TopCustomer[]> {
  const db = await getDB();
  const [res] = await db.executeSql(
    `SELECT c.name as name, COUNT(s.id) as orders, IFNULL(SUM(s.total),0) as revenue
     FROM sales s JOIN customers c ON c.id = s.customer_id
     WHERE s.store_id = ? AND s.status = 'completed'
     GROUP BY s.customer_id ORDER BY revenue DESC LIMIT 3;`,
    [storeId],
  );
  const out: TopCustomer[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    const r = res.rows.item(i);
    out.push({ name: String(r.name ?? '-'), orders: Number(r.orders) || 0, revenue: Number(r.revenue) || 0 });
  }
  return out;
}

type BestDay = { day: string; revenue: number; orders: number };

async function bestDayAllTime(storeId: string): Promise<BestDay | null> {
  const db = await getDB();
  const [res] = await db.executeSql(
    `SELECT date(created_at, 'localtime') as day, IFNULL(SUM(total),0) as revenue, COUNT(*) as orders
     FROM sales
     WHERE store_id = ? AND status = 'completed'
     GROUP BY day ORDER BY revenue DESC LIMIT 1;`,
    [storeId],
  );
  if (res.rows.length === 0) return null;
  const r = res.rows.item(0);
  const revenue = Number(r.revenue) || 0;
  if (revenue <= 0) return null;
  return { day: String(r.day), revenue, orders: Number(r.orders) || 0 };
}

// Raw line-items for CSV / PDF export — one row per sale line within the range.
async function saleLinesForExport(storeId: string, from: Date, to: Date) {
  const db = await getDB();
  const [res] = await db.executeSql(
    `SELECT s.created_at, s.receipt_no, si.name, si.quantity, si.unit_price, si.line_discount, si.line_total
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.store_id = ? AND s.status = 'completed' AND datetime(s.created_at) BETWEEN ? AND ?
     ORDER BY s.created_at;`,
    [storeId, sqlTs(from), sqlTs(to)],
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
    parseDbDate(l.created_at).toLocaleString('th-TH'),
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

function compactBaht(n: number) {
  if (n >= 1000000) return `฿${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `฿${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return baht(n);
}

// Percentage change vs the previous period → text + colour for badges/notes.
function pctChange(cur: number, prev: number): { text: string; color: string; value: number | null } {
  if (prev <= 0) {
    return cur > 0
      ? { text: 'ใหม่', color: COLORS.success, value: null }
      : { text: '—', color: COLORS.textMuted, value: null };
  }
  const v = ((cur - prev) / prev) * 100;
  const sign = v > 0 ? '▲' : v < 0 ? '▼' : '•';
  return {
    text: `${sign} ${Math.abs(v).toFixed(1)}%`,
    color: v > 0 ? COLORS.success : v < 0 ? COLORS.danger : COLORS.textMuted,
    value: v,
  };
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
function KpiCard({
  icon, label, value, note, noteColor, width, iconBg,
}: { icon: string; label: string; value: string; note: string; noteColor?: string; width: number; iconBg?: string }) {
  return (
    <FadeIn style={{ width }}>
      <Pressy style={styles.kpiTouchable} rippleColor="rgba(255,255,255,0.08)">
        <LinearGradient
          colors={['#1B2740', COLORS.surface]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.kpiCard}>
          <View style={[styles.kpiIconWrap, iconBg ? { backgroundColor: iconBg } : null]}><Text style={styles.kpiIcon}>{icon}</Text></View>
          <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
          <Text style={styles.kpiLabel} numberOfLines={1}>{label}</Text>
          <Text style={[styles.kpiNote, noteColor ? { color: noteColor } : null]} numberOfLines={1}>{note}</Text>
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
  const gradient = achieved ? ['#34D399', COLORS.success] : ['#FFB84D', COLORS.primary];
  const glow = achieved ? 'rgba(16,185,129,0.5)' : 'rgba(255,138,0,0.5)';
  return (
    <View style={styles.goalBarWrap}>
      <View style={styles.goalBarHeadRow}>
        {achieved && <Text style={{ fontSize: 18, marginRight: 6 }}>🏆</Text>}
        <Text style={[styles.goalPct, { color: gradient[1] }]}>{Math.round(clamped)}%</Text>
      </View>
      <View style={styles.goalBarTrack}>
        <Animated.View
          style={[
            styles.goalBarFillWrap,
            { width: widthAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }), shadowColor: glow },
          ]}>
          <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.goalBarFill} />
        </Animated.View>
      </View>
    </View>
  );
}

// ── Grouped "current vs previous" bars — plain View bars, no native SVG needed ──
function CompareBars({
  groups, curLabel, prevLabel, labelSize,
}: {
  groups: { label: string; cur: number; prev: number }[];
  curLabel: string; prevLabel: string; labelSize?: number;
}) {
  const max = Math.max(1, ...groups.map(g => Math.max(g.cur, g.prev)));
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
                <View style={[styles.compareBarFill, { height: `${Math.max(4, (g.prev / max) * 100)}%`, backgroundColor: 'rgba(148,163,184,0.45)' }]} />
              </View>
              <View style={styles.compareBarTrack}>
                <LinearGradient
                  colors={['#FFB84D', COLORS.primary]}
                  start={{ x: 0, y: 1 }} end={{ x: 0, y: 0 }}
                  style={[styles.compareBarFill, { height: `${Math.max(4, (g.cur / max) * 100)}%` }]}
                />
              </View>
            </View>
            <Text style={[styles.chartBarLabel, labelSize ? { fontSize: labelSize } : null]} numberOfLines={1}>{g.label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.lineLegendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.primary }]} />
          <Text style={styles.legendText}>{curLabel}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.textMuted }]} />
          <Text style={styles.legendText}>{prevLabel}</Text>
        </View>
      </View>
    </View>
  );
}

// ── Hourly "today vs yesterday" comparison ──
// Hours are bucketed into 6 four-hour groups so the grouped bars stay legible;
// the raw 24-bucket `hourly` array (unchanged) still drives the peak-time badge.
function HourlyCompareChart({ today, yesterday }: { today: HourBucket[]; yesterday: HourBucket[] }) {
  const groups = useMemo(() => {
    const out: { label: string; cur: number; prev: number }[] = [];
    for (let g = 0; g < 6; g++) {
      const startH = g * 4;
      const endH = startH + 3;
      const sum = (arr: HourBucket[]) =>
        arr.filter(h => h.hour >= startH && h.hour <= endH).reduce((s, h) => s + h.revenue, 0);
      out.push({
        label: `${String(startH).padStart(2, '0')}-${String(endH + 1).padStart(2, '0')}`,
        cur: sum(today),
        prev: sum(yesterday),
      });
    }
    return out;
  }, [today, yesterday]);
  return <CompareBars groups={groups} curLabel="วันนี้" prevLabel="เมื่อวาน" />;
}

// ── Yearly totals bar chart ──
function YearlyBars({ rows, activeYear }: { rows: { year: number; revenue: number }[]; activeYear: number }) {
  const max = Math.max(1, ...rows.map(r => r.revenue));
  return (
    <View style={styles.chartRow}>
      <View style={styles.chartGridOverlay} pointerEvents="none">
        <View style={styles.chartGridLine} />
        <View style={styles.chartGridLine} />
        <View style={styles.chartGridLine} />
      </View>
      {rows.map(r => {
        const active = r.year === activeYear;
        const h = `${Math.max(4, (r.revenue / max) * 100)}%`;
        return (
          <View key={r.year} style={styles.chartBarCol}>
            <Text style={styles.chartBarValue} numberOfLines={1}>{compactBaht(r.revenue)}</Text>
            <View style={styles.chartBarTrack}>
              {active ? (
                <LinearGradient
                  colors={['#FFB84D', COLORS.primary]}
                  start={{ x: 0, y: 1 }} end={{ x: 0, y: 0 }}
                  style={{ width: '100%', height: h, borderRadius: 8 }} />
              ) : (
                <View style={[styles.chartBarFill, { height: h }]} />
              )}
            </View>
            <Text style={[styles.chartBarLabel, active && styles.chartBarLabelActive]} numberOfLines={1}>{r.year + 543}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ── One row of the Comparison Center: current vs previous with a % badge ──
function CompareRow({
  label, cur, prev, format,
}: { label: string; cur: number; prev: number; format: (n: number) => string }) {
  const change = pctChange(cur, prev);
  const max = Math.max(1, cur, prev);
  return (
    <View style={styles.cmpRow}>
      <View style={styles.cmpHead}>
        <Text style={styles.cmpLabel}>{label}</Text>
        <View style={[styles.cmpBadge, { backgroundColor: `${change.color}26` }]}>
          <Text style={[styles.cmpBadgeText, { color: change.color }]}>{change.text}</Text>
        </View>
      </View>
      <View style={styles.cmpBarLine}>
        <View style={styles.cmpBarTrack}>
          <LinearGradient
            colors={['#FFB84D', COLORS.primary]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={[styles.cmpBarFill, { width: `${Math.max(2, (cur / max) * 100)}%` }]} />
        </View>
        <Text style={styles.cmpValue}>{format(cur)}</Text>
      </View>
      <View style={styles.cmpBarLine}>
        <View style={styles.cmpBarTrack}>
          <View style={[styles.cmpBarFill, { width: `${Math.max(2, (prev / max) * 100)}%`, backgroundColor: 'rgba(148,163,184,0.45)' }]} />
        </View>
        <Text style={[styles.cmpValue, { color: COLORS.textMuted }]}>{format(prev)}</Text>
      </View>
    </View>
  );
}

type Insight = { icon: string; title: string; text: string; tone: 'good' | 'warn' | 'info' };

const TONE_COLOR: Record<Insight['tone'], string> = {
  good: COLORS.success,
  warn: COLORS.warning,
  info: COLORS.primary,
};

export default function ReportsScreen() {
  const { employee } = useAuth();

  // ── Time filter state ─────────────────────────────────────────────────────
  const nowRef = new Date();
  const [mode, setMode] = useState<Mode>('today');
  const [selMonth, setSelMonth] = useState<number | null>(nowRef.getMonth());
  const [selYear, setSelYear] = useState<number>(nowRef.getFullYear());
  const [picker, setPicker] = useState<'month' | 'year' | null>(null);
  const period = useMemo(() => buildPeriod(mode, selMonth, selYear), [mode, selMonth, selYear]);
  const ctxYear = mode === 'custom' ? selYear : new Date().getFullYear();

  // ── Data state ────────────────────────────────────────────────────────────
  const [summary, setSummary] = useState<any>(null);
  const [prevSummary, setPrevSummary] = useState<any>(null);
  const [top, setTop] = useState<any[]>([]);
  const [hourly, setHourly] = useState<HourBucket[]>([]);
  const [hourlyYesterday, setHourlyYesterday] = useState<HourBucket[]>([]);
  const [daily, setDaily] = useState<DayBucket[]>([]);
  const [monthly, setMonthly] = useState<{ cur: number[]; prev: number[] }>({ cur: [], prev: [] });
  const [yearly, setYearly] = useState<{ year: number; revenue: number }[]>([]);
  const [newCust, setNewCust] = useState<{ cur: number | null; prev: number | null }>({ cur: null, prev: null });
  const [hall, setHall] = useState<{ products: any[]; customers: TopCustomer[] | null; bestDay: BestDay | null }>({
    products: [], customers: null, bestDay: null,
  });
  const [todayRevenue, setTodayRevenue] = useState(0); // drives the goal bar regardless of the selected period
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  // ── Moved from DashboardScreen (Patch A) — Cloud Sync + Low Stock ─────────
  const [lastSync, setLastSync] = useState('ยังไม่เคย Sync');
  const [syncing, setSyncing] = useState(false);
  const [lowStockItems, setLowStockItems] = useState<{ name: string; quantity: number; low_stock_alert: number }[]>([]);

  const { width } = useWindowDimensions();
  const isTablet = width >= 700;
  const pageWidth = isTablet ? Math.min(width, 960) : width;
  const contentPad = 20;
  const gap = 12;
  const kpiCols = isTablet ? 5 : 2;
  const kpiWidth = (pageWidth - contentPad * 2 - gap * (kpiCols - 1)) / kpiCols;

  // Loads everything the selected period needs. SQLite is the only source; extra
  // widgets are best-effort (a failing/unsupported query never blanks the screen).
  const load = useCallback(async () => {
    if (!employee) return;
    const my = ++reqId.current;
    setLoading(true);
    try {
      const storeId = employee.store_id;
      const now = new Date();
      const p = buildPeriod(mode, selMonth, selYear, now);
      const fromTs = sqlTs(p.from);
      const toTs = sqlTs(p.to);
      const yr = mode === 'custom' ? selYear : now.getFullYear();

      const [sm, prevSm, tp, lowStock, custCur, custPrev, monthlyRes, yearlyRes, hallProducts, hallCustomers, hallBest] =
        await Promise.all([
          salesSummary(storeId, fromTs, toTs),
          salesSummary(storeId, sqlTs(p.prevFrom), sqlTs(p.prevTo)),
          topProducts(storeId, fromTs, toTs, 5),
          lowStockProducts(storeId),
          newCustomersCount(p.from, p.to).catch(() => null),
          newCustomersCount(p.prevFrom, p.prevTo).catch(() => null),
          monthlyRevenue(storeId, yr).catch(() => ({ cur: [] as number[], prev: [] as number[] })),
          yearlyRevenue(storeId).catch(() => [] as { year: number; revenue: number }[]),
          topProducts(storeId, '1970-01-01 00:00:00', sqlTs(now), 3).catch(() => [] as any[]),
          topCustomersAllTime(storeId).catch(() => null),
          bestDayAllTime(storeId).catch(() => null),
        ]);

      let h: HourBucket[] = [];
      let hy: HourBucket[] = [];
      let d: DayBucket[] = [];
      if (p.grain === 'hourly') {
        const y = yesterdayRange();
        [h, hy] = await Promise.all([
          hourlyRevenue(storeId, p.from, p.to),
          hourlyRevenue(storeId, y.from, y.to),
        ]);
      } else if (p.grain === 'daily') {
        d = await dailyRevenueRange(storeId, p.from, p.to);
      }

      let todayRev = Number(sm?.revenue ?? 0);
      if (mode !== 'today') {
        const todaySm = await salesSummary(storeId, sqlTs(startOfDay(now)), sqlTs(now));
        todayRev = Number(todaySm?.revenue ?? 0);
      }

      if (my !== reqId.current) return; // a newer load superseded this one
      setSummary(sm);
      setPrevSummary(prevSm);
      setTop(tp);
      setLowStockItems(lowStock ?? []);
      setNewCust({ cur: custCur, prev: custPrev });
      setMonthly(monthlyRes);
      setYearly(yearlyRes);
      setHall({ products: hallProducts ?? [], customers: hallCustomers, bestDay: hallBest });
      setHourly(h);
      setHourlyYesterday(hy);
      setDaily(d);
      setTodayRevenue(todayRev);
    } catch (err) {
      console.error('Load Reports Error:', err);
    } finally {
      if (my === reqId.current) setLoading(false);
    }
  }, [employee, mode, selMonth, selYear]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const orderCount: number = summary?.order_count ?? 0;
  const revenue: number = summary?.revenue ?? 0;
  const discounts: number = summary?.discounts ?? 0;
  const avgPerOrder = orderCount > 0 ? revenue / orderCount : 0;
  const prevOrders: number = prevSummary?.order_count ?? 0;
  const prevRevenue: number = prevSummary?.revenue ?? 0;
  const prevAvg = prevOrders > 0 ? prevRevenue / prevOrders : 0;

  // Daily bar-chart series (used for the 7-day and month views).
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

  // ── Best-selling time slot — hour-of-day for "today", best day otherwise ──
  const peakInfo = useMemo(() => {
    if (period.grain === 'hourly') {
      if (!hourly.length) return null;
      const best = hourly.reduce((m, h) => (h.revenue > m.revenue ? h : m), hourly[0]);
      if (best.revenue <= 0) return null;
      const startH = String(best.hour).padStart(2, '0');
      const endH = String((best.hour + 1) % 24).padStart(2, '0');
      return { label: `${startH}:00 – ${endH}:00`, revenue: best.revenue };
    }
    if (period.grain === 'daily') {
      if (!daily.length) return null;
      const best = daily.reduce((m, d) => (d.revenue > m.revenue ? d : m), daily[0]);
      if (best.revenue <= 0) return null;
      return {
        label: new Date(`${best.day}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }),
        revenue: best.revenue,
      };
    }
    return null;
  }, [period.grain, hourly, daily]);

  // Best month of the context year (monthly-grain periods).
  const bestMonth = useMemo(() => {
    if (!monthly.cur.length) return null;
    let idx = 0;
    monthly.cur.forEach((v, i) => { if (v > monthly.cur[idx]) idx = i; });
    if (monthly.cur[idx] <= 0) return null;
    return { label: `${MONTHS_FULL[idx]} ${ctxYear + 543}`, revenue: monthly.cur[idx] };
  }, [monthly, ctxYear]);

  const monthlyGroups = useMemo(
    () => MONTHS_SHORT.map((label, i) => ({ label, cur: monthly.cur[i] ?? 0, prev: monthly.prev[i] ?? 0 })),
    [monthly],
  );
  const monthlyHasData = monthlyGroups.some(g => g.cur > 0 || g.prev > 0);

  // ── Moved from DashboardScreen (Patch A) — Cloud Sync handler, same behavior ──
  const handleSyncPress = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await syncNow();
      setLastSync(new Date().toLocaleTimeString('th-TH'));
      Alert.alert('☁️ Sync สำเร็จ', 'ซิงค์ข้อมูลกับระบบ Cloud เรียบร้อยแล้ว');
    } catch (e: any) {
      Alert.alert('☁️ Sync Failed', e?.message ?? 'ไม่สามารถซิงค์ได้');
    } finally {
      setSyncing(false);
    }
  };

  // ── Business Center header: date/time + online status derived from sync state ──
  const today = useMemo(() => {
    const d = new Date();
    return {
      dateStr: d.toLocaleDateString('th-TH-u-ca-buddhist', { day: 'numeric', month: 'short', year: 'numeric' }),
      timeStr: d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
    };
  }, []);
  const onlineLabel = syncing ? 'กำลังซิงค์' : lastSync !== 'ยังไม่เคย Sync' ? 'ออนไลน์' : 'ออฟไลน์';
  const onlineColor = syncing ? COLORS.warning : lastSync !== 'ยังไม่เคย Sync' ? COLORS.success : COLORS.textMuted;

  // ── Daily sales goal — fixed target of ฿2,000/วัน, always reflects "today" ──
  const GOAL = 2000;
  const goalPct = GOAL > 0 ? Math.min(100, (todayRevenue / GOAL) * 100) : 0;
  const goalAchieved = todayRevenue >= GOAL;
  const goalRemaining = Math.max(0, GOAL - todayRevenue);

  // ── Rule-based AI Insight — every sentence is derived from loaded SQLite data ──
  const insights = useMemo<Insight[]>(() => {
    const out: Insight[] = [];

    // 1) sales vs previous period
    if (revenue > 0 && prevRevenue > 0) {
      const v = ((revenue - prevRevenue) / prevRevenue) * 100;
      const up = v >= 0;
      out.push({
        icon: up ? '📈' : '📉',
        title: up ? 'ยอดขายเติบโต' : 'ยอดขายลดลง',
        text: `${period.label}ขายได้ ${baht(revenue)} ${up ? 'เพิ่มขึ้น' : 'ลดลง'} ${Math.abs(v).toFixed(1)}% เมื่อเทียบกับ${period.prevLabel} (${baht(prevRevenue)})`,
        tone: up ? 'good' : 'warn',
      });
    } else if (revenue > 0) {
      out.push({
        icon: '🆕', title: 'เริ่มมียอดขาย',
        text: `${period.label}ขายได้ ${baht(revenue)} ส่วน${period.prevLabel}ยังไม่มียอดขายให้เปรียบเทียบ`,
        tone: 'info',
      });
    } else {
      out.push({
        icon: '🕐', title: 'ยังไม่มียอดขาย',
        text: `ยังไม่มียอดขายในช่วง${period.label}`,
        tone: 'info',
      });
    }

    // 2) best time slot
    if (peakInfo) {
      out.push({
        icon: '🔥',
        title: period.grain === 'hourly' ? 'ช่วงเวลาขายดีที่สุด' : 'วันขายดีที่สุดในช่วงนี้',
        text: `${peakInfo.label} ยอดขาย ${baht(peakInfo.revenue)}`,
        tone: 'info',
      });
    } else if (period.grain === 'monthly' && bestMonth) {
      out.push({
        icon: '🔥', title: 'เดือนขายดีที่สุด',
        text: `${bestMonth.label} ยอดขาย ${baht(bestMonth.revenue)}`,
        tone: 'info',
      });
    }

    // 3) distance to today's goal
    if (goalAchieved) {
      out.push({ icon: '🎯', title: 'ถึงเป้าหมายวันนี้แล้ว', text: `ยอดขายวันนี้ ${baht(todayRevenue)} เกินเป้า ${baht(GOAL)}`, tone: 'good' });
    } else {
      out.push({ icon: '🎯', title: 'เป้าหมายวันนี้', text: `เหลืออีก ${baht(goalRemaining)} จะถึงเป้า ${baht(GOAL)} (ตอนนี้ ${baht(todayRevenue)})`, tone: 'info' });
    }

    // 4) low stock
    if (lowStockItems.length > 0) {
      const names = lowStockItems.slice(0, 2).map(p => p.name).join(', ');
      out.push({
        icon: '⚠️', title: 'สินค้าใกล้หมด',
        text: `มี ${lowStockItems.length} รายการที่ต้องเติมสต็อก เช่น ${names}`,
        tone: 'warn',
      });
    } else {
      out.push({ icon: '📦', title: 'สต็อกปกติ', text: 'ไม่มีสินค้าที่ใกล้หมดในตอนนี้', tone: 'good' });
    }

    // 5) top product share
    if (top.length > 0 && revenue > 0) {
      const t = top[0];
      const share = (Number(t.revenue ?? 0) / revenue) * 100;
      out.push({
        icon: '🏆', title: 'สินค้าขายดี',
        text: `${t.name} ขายได้ ${t.qty} ชิ้น คิดเป็น ${share.toFixed(0)}% ของยอดขาย${period.label}`,
        tone: 'good',
      });
    }

    // 6) average bill change
    if (avgPerOrder > 0 && prevAvg > 0) {
      const v = ((avgPerOrder - prevAvg) / prevAvg) * 100;
      out.push({
        icon: '🧾', title: 'ยอดเฉลี่ยต่อบิล',
        text: `${baht(avgPerOrder)} ต่อบิล ${v >= 0 ? 'สูงขึ้น' : 'ต่ำลง'} ${Math.abs(v).toFixed(1)}% จาก${period.prevLabel}`,
        tone: v >= 0 ? 'good' : 'warn',
      });
    }

    return out.slice(0, 5);
  }, [
    revenue, prevRevenue, period, peakInfo, bestMonth, goalAchieved, goalRemaining,
    todayRevenue, lowStockItems, top, avgPerOrder, prevAvg,
  ]);

  // ── Dropdown options ──────────────────────────────────────────────────────
  const yearOptions = useMemo(() => {
    const cy = new Date().getFullYear();
    const set = new Set<number>([cy, cy - 1, cy - 2, cy - 3, cy - 4]);
    yearly.forEach(y => set.add(y.year));
    return Array.from(set).sort((a, b) => b - a);
  }, [yearly]);

  const pickMonth = (m: number | null) => { setSelMonth(m); setMode('custom'); setPicker(null); };
  const pickYear = (y: number) => { setSelYear(y); setMode('custom'); setPicker(null); };

  // ── Export: HTML report / CSV — both built with react-native-fs (confirmed
  // linked in this project's PackageList.java autolinking output). PDF export and
  // native Share are not available: react-native-html-to-pdf and react-native-share
  // are NOT installed/linked here, so calling them would crash the whole app at
  // bundle time (Metro can't resolve them) — this is the safe fallback.
  const [exportBusy, setExportBusy] = useState<'html' | 'csv' | 'share' | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);

  const generateHtmlReport = useCallback(async () => {
    const html = buildReportHtml({ rangeLabel: period.label, revenue, orderCount, discounts, avgPerOrder, top });
    const path = `${RNFS.DocumentDirectoryPath}/lionpos-report-${mode}-${Date.now()}.html`;
    await RNFS.writeFile(path, html, 'utf8');
    return path;
  }, [period.label, mode, revenue, orderCount, discounts, avgPerOrder, top]);

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
      const p = buildPeriod(mode, selMonth, selYear);
      const lines = await saleLinesForExport(employee.store_id, p.from, p.to);
      const csv = buildCsv(lines);
      const path = `${RNFS.DocumentDirectoryPath}/lionpos-report-${mode}-${Date.now()}.csv`;
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

  // KPI helpers
  const revPct = pctChange(revenue, prevRevenue);
  const billPct = pctChange(orderCount, prevOrders);
  const avgPct = pctChange(avgPerOrder, prevAvg);
  const custPct = newCust.cur !== null && newCust.prev !== null ? pctChange(newCust.cur, newCust.prev) : null;
  const lowCount = lowStockItems.length;

  const monthDropLabel = selMonth === null ? 'ทั้งปี' : MONTHS_FULL[selMonth];

  return (
    <View style={styles.screen}>
      {/* ── Ambient background glow — decorative only, pure View/LinearGradient ── */}
      <View style={styles.glowLayer} pointerEvents="none">
        <LinearGradient
          colors={['rgba(56,132,255,0.28)', 'rgba(56,132,255,0)']}
          style={[styles.glowBlob, styles.glowBlobTop]} />
        <LinearGradient
          colors={['rgba(99,102,241,0.20)', 'rgba(99,102,241,0)']}
          style={[styles.glowBlob, styles.glowBlobBottom]} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: contentPad, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}>
        <View style={[styles.pageInner, isTablet && { maxWidth: 960, width: '100%', alignSelf: 'center' }]}>

        {/* ── Header (Business Center) ──────────────────────────────── */}
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
              <Text style={styles.brandSub}>Business Center</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.headerDate}>{today.dateStr} · {today.timeStr}</Text>
            <View style={styles.onlineRow}>
              <View style={[styles.onlineDot, { backgroundColor: onlineColor }]} />
              <Text style={[styles.onlineText, { color: onlineColor }]}>{onlineLabel}</Text>
            </View>
            <Pressy onPress={load} style={styles.refreshBtn} rippleColor="rgba(255,138,0,0.2)" disabled={loading}>
              <Text style={styles.refreshText}>{loading ? 'กำลังโหลด…' : 'รีเฟรช'}</Text>
            </Pressy>
          </View>
        </FadeIn>

        {/* ── Cloud Sync (moved from DashboardScreen, Patch A) ──────── */}
        <FadeIn delay={60}>
          <Pressy onPress={handleSyncPress} style={styles.syncBar} rippleColor="rgba(255,138,0,0.15)" disabled={syncing}>
            <View style={styles.syncBarLeft}>
              <Text style={styles.syncIcon}>☁️</Text>
              <View>
                <Text style={styles.syncTitle}>Cloud Sync</Text>
                <Text style={styles.syncSub}>Last Sync: {lastSync}</Text>
              </View>
            </View>
            {syncing ? <ActivityIndicator color={COLORS.primary} /> : (
              <View style={styles.syncBtn}><Text style={styles.syncBtnText}>ซิงค์เดี๋ยวนี้</Text></View>
            )}
          </Pressy>
        </FadeIn>

        {/* ── Time filter: quick chips + month / year dropdowns ─────── */}
        <FadeIn delay={40}>
          <View style={styles.rangeRow}>
            {QUICK_MODES.map(m => (
              <Pressy
                key={m.key}
                onPress={() => setMode(m.key)}
                rippleColor="rgba(255,138,0,0.2)"
                style={{ marginRight: 8 }}>
                {mode === m.key ? (
                  <LinearGradient
                    colors={['#FFB84D', COLORS.primary, COLORS.primaryDark]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.rangeChip}>
                    <Text style={styles.rangeChipTextActive}>{m.label}</Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.rangeChip, styles.rangeChipInactive]}>
                    <Text style={styles.rangeChipText}>{m.label}</Text>
                  </View>
                )}
              </Pressy>
            ))}
          </View>
          <View style={styles.dropRow}>
            <Pressy onPress={() => setPicker('month')} rippleColor="rgba(255,138,0,0.2)" style={{ flex: 1 }}>
              <View style={[styles.dropBtn, mode === 'custom' && styles.dropBtnActive]}>
                <Text style={styles.dropLabel}>เดือน</Text>
                <Text style={[styles.dropValue, mode === 'custom' && { color: COLORS.primary }]} numberOfLines={1}>{monthDropLabel} ▾</Text>
              </View>
            </Pressy>
            <Pressy onPress={() => setPicker('year')} rippleColor="rgba(255,138,0,0.2)" style={{ flex: 1 }}>
              <View style={[styles.dropBtn, mode === 'custom' && styles.dropBtnActive]}>
                <Text style={styles.dropLabel}>ปี</Text>
                <Text style={[styles.dropValue, mode === 'custom' && { color: COLORS.primary }]} numberOfLines={1}>{selYear + 543} ▾</Text>
              </View>
            </Pressy>
          </View>
          <Text style={styles.periodHint}>กำลังดู: {period.label}</Text>
        </FadeIn>

        {/* ── KPI cards (5) ──────────────────────────────────────── */}
        <View style={[styles.kpiGrid, { gap }]}>
          <KpiCard icon="💰" label="ยอดขาย" value={baht(revenue)} note={`${revPct.text} เทียบช่วงก่อน`} noteColor={revPct.color} width={kpiWidth} iconBg="rgba(245,158,11,0.18)" />
          <KpiCard icon="🧾" label="จำนวนบิล" value={String(orderCount)} note={`${billPct.text} เทียบช่วงก่อน`} noteColor={billPct.color} width={kpiWidth} iconBg="rgba(148,163,184,0.18)" />
          <KpiCard icon="📈" label="เฉลี่ยต่อบิล" value={baht(avgPerOrder)} note={`${avgPct.text} เทียบช่วงก่อน`} noteColor={avgPct.color} width={kpiWidth} iconBg="rgba(16,185,129,0.18)" />
          <KpiCard
            icon="🙋" label="ลูกค้าใหม่"
            value={newCust.cur === null ? '—' : String(newCust.cur)}
            note={custPct ? `${custPct.text} เทียบช่วงก่อน` : 'โหลดไม่สำเร็จ'}
            noteColor={custPct ? custPct.color : COLORS.textMuted}
            width={kpiWidth} iconBg="rgba(59,130,246,0.18)" />
          <KpiCard
            icon="⚠️" label="สินค้าใกล้หมด" value={String(lowCount)}
            note={lowCount > 0 ? 'ต้องเติมสต็อก' : 'สต็อกปกติ'}
            noteColor={lowCount > 0 ? COLORS.danger : COLORS.success}
            width={isTablet ? kpiWidth : kpiWidth * 2 + gap} iconBg="rgba(239,68,68,0.18)" />
        </View>

        {/* ── Comparison Center ───────────────────────────────────── */}
        <FadeIn delay={80} style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>⚖️ Comparison Center</Text>
            <Text style={styles.sectionHint} numberOfLines={1}>{period.label} เทียบ {period.prevLabel}</Text>
          </View>
          <CompareRow label="ยอดขาย" cur={revenue} prev={prevRevenue} format={baht} />
          <CompareRow label="จำนวนบิล" cur={orderCount} prev={prevOrders} format={(n) => `${Math.round(n)} บิล`} />
          <CompareRow label="เฉลี่ยต่อบิล" cur={avgPerOrder} prev={prevAvg} format={baht} />
          {newCust.cur !== null && newCust.prev !== null && (
            <CompareRow label="ลูกค้าใหม่" cur={newCust.cur} prev={newCust.prev} format={(n) => `${Math.round(n)} คน`} />
          )}
          <View style={styles.legendItemRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: COLORS.primary }]} />
              <Text style={styles.legendText}>{period.label}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: COLORS.textMuted }]} />
              <Text style={styles.legendText}>{period.prevLabel}</Text>
            </View>
          </View>
        </FadeIn>

        {/* ── Daily sales goal ────────────────────────────────────── */}
        <FadeIn delay={90} style={styles.sectionCard}>
          <View style={styles.goalInfo}>
            <Text style={styles.sectionTitle}>🎯 เป้าหมายยอดขายวันนี้</Text>
            <Text style={styles.sectionHint}>เป้าหมาย {baht(GOAL)} / วัน</Text>
            <Text style={[styles.goalNow, goalAchieved && { color: COLORS.success }]}>ยอดปัจจุบัน {baht(todayRevenue)}</Text>
            <Text style={styles.sectionHint}>{goalAchieved ? 'ถึงเป้าหมายแล้ว 🎉' : `เหลืออีก ${baht(goalRemaining)}`}</Text>
          </View>
          <GoalBar percent={goalPct} achieved={goalAchieved} />
        </FadeIn>

        {/* ── Sales chart (hourly / daily — year views use the monthly chart below) ── */}
        {period.grain !== 'monthly' && (
          <FadeIn delay={120} style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>กราฟยอดขาย</Text>
              <Text style={styles.sectionHint}>
                {period.grain === 'hourly' ? 'รายชั่วโมง · วันนี้ vs เมื่อวาน' : `รายวัน · ${period.label}`}
              </Text>
            </View>

            {period.grain === 'hourly' ? (
              hourly.every(h => h.revenue <= 0) && hourlyYesterday.every(h => h.revenue <= 0) ? (
                <EmptyInline icon="📊" text="ยังไม่มีข้อมูลในช่วงเวลานี้" />
              ) : (
                <HourlyCompareChart today={hourly} yesterday={hourlyYesterday} />
              )
            ) : dailyChart.rows.length === 0 || dailyChart.max <= 0 ? (
              <EmptyInline icon="📊" text="ยังไม่มีข้อมูลในช่วงเวลานี้" />
            ) : (
              <ScrollView horizontal={dailyChart.rows.length > 10} showsHorizontalScrollIndicator={false}>
                <View style={[
                  styles.chartRow,
                  dailyChart.rows.length > 10 && { width: dailyChart.rows.length * 40, gap: 0 },
                ]}>
                  <View style={styles.chartGridOverlay} pointerEvents="none">
                    <View style={styles.chartGridLine} />
                    <View style={styles.chartGridLine} />
                    <View style={styles.chartGridLine} />
                  </View>
                  {dailyChart.rows.map((row, i) => {
                    const isActive = i === dailyChart.rows.length - 1;
                    return (
                      <View key={i} style={dailyChart.rows.length > 10 ? styles.chartBarColFixed : styles.chartBarCol}>
                        <Text style={styles.chartBarValue} numberOfLines={1}>{baht(row.value)}</Text>
                        <View style={styles.chartBarTrack}>
                          <Animated.View
                            style={[
                              { width: '100%', borderRadius: 8, overflow: 'hidden' },
                              { height: barHeights[i]?.interpolate({ inputRange: [0, 1], outputRange: ['4%', '100%'] }) ?? '4%' },
                            ]}>
                            {isActive ? (
                              <LinearGradient
                                colors={['#FFB84D', COLORS.primary]}
                                start={{ x: 0, y: 1 }} end={{ x: 0, y: 0 }}
                                style={{ flex: 1 }} />
                            ) : (
                              <View style={[styles.chartBarFill, { height: '100%' }]} />
                            )}
                          </Animated.View>
                        </View>
                        <Text
                          style={[styles.chartBarLabel, isActive && styles.chartBarLabelActive]}
                          numberOfLines={1}>
                          {row.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}

            {/* ── Best-selling time slot ────────────────────────── */}
            {peakInfo && (
              <View style={styles.peakCard}>
                <View style={styles.peakIconWrap}><Text style={styles.peakIcon}>🔥</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.peakLabel}>{period.grain === 'hourly' ? 'ช่วงขายดีที่สุด' : 'วันขายดีที่สุด'}</Text>
                  <Text style={styles.peakText}>{peakInfo.label}</Text>
                </View>
                <View style={styles.peakDivider} />
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.peakLabel}>ยอดขาย</Text>
                  <Text style={styles.peakAmount}>{baht(peakInfo.revenue)}</Text>
                </View>
              </View>
            )}
          </FadeIn>
        )}

        {/* ── Monthly chart (this year vs last year) ─────────────── */}
        <FadeIn delay={140} style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>📆 ยอดขายรายเดือน</Text>
            <Text style={styles.sectionHint}>ปี {ctxYear + 543} vs ปี {ctxYear + 542}</Text>
          </View>
          {monthlyHasData ? (
            <CompareBars groups={monthlyGroups} curLabel={`ปี ${ctxYear + 543}`} prevLabel={`ปี ${ctxYear + 542}`} labelSize={9} />
          ) : (
            <EmptyInline icon="📆" text="ยังไม่มีข้อมูลรายเดือน" />
          )}
          {period.grain === 'monthly' && bestMonth && (
            <View style={styles.peakCard}>
              <View style={styles.peakIconWrap}><Text style={styles.peakIcon}>🔥</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.peakLabel}>เดือนขายดีที่สุด</Text>
                <Text style={styles.peakText}>{bestMonth.label}</Text>
              </View>
              <View style={styles.peakDivider} />
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.peakLabel}>ยอดขาย</Text>
                <Text style={styles.peakAmount}>{baht(bestMonth.revenue)}</Text>
              </View>
            </View>
          )}
        </FadeIn>

        {/* ── Yearly chart ───────────────────────────────────────── */}
        <FadeIn delay={150} style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>📈 ยอดขายรายปี</Text>
            <Text style={styles.sectionHint}>สูงสุด 6 ปีล่าสุด</Text>
          </View>
          {yearly.length === 0 || yearly.every(y => y.revenue <= 0) ? (
            <EmptyInline icon="📈" text="ยังไม่มีข้อมูลรายปี" />
          ) : (
            <YearlyBars rows={yearly} activeYear={ctxYear} />
          )}
        </FadeIn>

        {/* ── Top sellers ──────────────────────────────────────── */}
        <FadeIn delay={160} style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>🏆 สินค้าขายดี</Text>
            <Text style={styles.sectionHint} numberOfLines={1}>Top 5 · {period.label}</Text>
          </View>
          {top.length === 0 ? (
            <EmptyInline icon="🍦" text="ยังไม่มีข้อมูลในช่วงเวลานี้" />
          ) : top.map((p, i) => <ProductRow key={i} rank={i} p={p} />)}
        </FadeIn>

        {/* ── Low Stock (moved from DashboardScreen, Patch A) ───────── */}
        <FadeIn delay={200} style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>⚠️ สินค้าใกล้หมด</Text>
            <Text style={styles.sectionHint}>{lowStockItems.length} รายการ</Text>
          </View>
          {lowStockItems.length === 0 ? (
            <EmptyInline icon="📦" text="สต็อกสินค้าทุกรายการเพียงพอ" />
          ) : lowStockItems.map((p, i) => (
            <View key={`${p.name}-${i}`} style={styles.lowStockRow}>
              <View style={[styles.rankBadge, styles.warnBadge]}>
                <Text style={[styles.rankBadgeText, { color: COLORS.danger }]}>!</Text>
              </View>
              <Text style={styles.listName} numberOfLines={1}>{p.name}</Text>
              <View style={styles.stockPill}>
                <Text style={styles.stockPillText}>{p.quantity}</Text>
              </View>
            </View>
          ))}
        </FadeIn>

        {/* ── AI Insight (rule-based, no AI API) ─────────────────── */}
        <FadeIn delay={220} style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>🤖 AI Insight</Text>
            <Text style={styles.sectionHint}>สรุปอัตโนมัติจากข้อมูลจริง</Text>
          </View>
          {insights.map((ins, i) => (
            <View key={i} style={[styles.insightCard, { borderColor: `${TONE_COLOR[ins.tone]}55` }]}>
              <View style={[styles.insightIconWrap, { backgroundColor: `${TONE_COLOR[ins.tone]}26` }]}>
                <Text style={styles.insightIcon}>{ins.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.insightTitle, { color: TONE_COLOR[ins.tone] }]}>{ins.title}</Text>
                <Text style={styles.insightText}>{ins.text}</Text>
              </View>
            </View>
          ))}
        </FadeIn>

        {/* ── Hall of Fame (all time) ────────────────────────────── */}
        <FadeIn delay={230} style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>👑 Hall of Fame</Text>
            <Text style={styles.sectionHint}>ตลอดกาล</Text>
          </View>

          <Text style={styles.hallSub}>สินค้าขายดีตลอดกาล</Text>
          {hall.products.length === 0 ? (
            <EmptyInline icon="🍦" text="ยังไม่มีข้อมูลสินค้า" />
          ) : hall.products.map((p, i) => <ProductRow key={i} rank={i} p={p} />)}

          <Text style={[styles.hallSub, { marginTop: 14 }]}>ลูกค้าเด่น</Text>
          {hall.customers === null ? (
            <Text style={styles.hallNote}>โหลดข้อมูลลูกค้าไม่สำเร็จ ลองกดรีเฟรชอีกครั้ง</Text>
          ) : hall.customers.length === 0 ? (
            <Text style={styles.hallNote}>ยังไม่มีบิลที่ผูกกับลูกค้า (บิลที่ไม่ได้เลือกลูกค้าไม่ถูกนับ)</Text>
          ) : hall.customers.map((c, i) => (
            <View key={i} style={styles.listRow}>
              <View style={[styles.rankBadge, { backgroundColor: RANK_COLORS[i]?.bg ?? 'rgba(255,138,0,0.12)' }]}>
                <Text style={[styles.rankBadgeText, { color: RANK_COLORS[i]?.fg ?? COLORS.primary }]}>{i + 1}</Text>
              </View>
              <Text style={styles.listName} numberOfLines={1}>{c.name}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.listAmount}>{baht(c.revenue)}</Text>
                <Text style={styles.listQty}>{c.orders} บิล</Text>
              </View>
            </View>
          ))}

          <Text style={[styles.hallSub, { marginTop: 14 }]}>วันขายดีที่สุด</Text>
          {hall.bestDay ? (
            <View style={styles.peakCard}>
              <View style={styles.peakIconWrap}><Text style={styles.peakIcon}>📅</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.peakLabel}>{hall.bestDay.orders} บิล</Text>
                <Text style={styles.peakText}>
                  {new Date(`${hall.bestDay.day}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              </View>
              <View style={styles.peakDivider} />
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.peakLabel}>ยอดขาย</Text>
                <Text style={styles.peakAmount}>{baht(hall.bestDay.revenue)}</Text>
              </View>
            </View>
          ) : (
            <EmptyInline icon="📅" text="ยังไม่มีข้อมูลยอดขาย" />
          )}
        </FadeIn>

        {/* ── Export ──────────────────────────────────────────────── */}
        <FadeIn delay={240} style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>ส่งออกรายงาน</Text>
          <Text style={styles.sectionHint}>{period.label} · เลือกรูปแบบไฟล์ที่ต้องการ</Text>
          <View style={styles.exportRow}>
            <Pressy onPress={onExportPdf} rippleColor="rgba(255,255,255,0.15)" style={styles.exportCol} disabled={!!exportBusy}>
              <View style={styles.exportBtn}>
                <View style={[styles.exportIconWrap, { backgroundColor: 'rgba(59,130,246,0.16)' }]}>
                  <Text style={styles.exportIcon}>📄</Text>
                </View>
                <Text style={styles.exportBtnText} numberOfLines={1}>{exportBusy === 'html' ? 'กำลังสร้าง…' : 'บันทึกรายงาน'}</Text>
                <Text style={styles.exportBtnSub}>HTML</Text>
              </View>
            </Pressy>
            <Pressy onPress={onExportCsv} rippleColor="rgba(255,255,255,0.15)" style={styles.exportCol} disabled={!!exportBusy}>
              <View style={styles.exportBtn}>
                <View style={[styles.exportIconWrap, { backgroundColor: 'rgba(16,185,129,0.16)' }]}>
                  <Text style={styles.exportIcon}>📊</Text>
                </View>
                <Text style={styles.exportBtnText} numberOfLines={1}>{exportBusy === 'csv' ? 'กำลังสร้าง…' : 'บันทึกข้อมูล'}</Text>
                <Text style={styles.exportBtnSub}>CSV</Text>
              </View>
            </Pressy>
            <Pressy onPress={onShare} rippleColor="rgba(255,138,0,0.2)" style={styles.exportCol} disabled={!!exportBusy}>
              <View style={styles.exportBtn}>
                <View style={[styles.exportIconWrap, { backgroundColor: 'rgba(255,138,0,0.16)' }]}>
                  <Text style={styles.exportIcon}>🔗</Text>
                </View>
                <Text style={styles.exportBtnText} numberOfLines={1}>{exportBusy === 'share' ? 'กำลังแชร์…' : 'แชร์รายงาน'}</Text>
                <Text style={styles.exportBtnSub}>Share</Text>
              </View>
            </Pressy>
          </View>
          {exportNote && <Text style={styles.exportNote}>{exportNote}</Text>}
        </FadeIn>
        </View>
      </ScrollView>

      {/* ── Month / Year picker sheet ───────────────────────────────── */}
      <Modal visible={picker !== null} animationType="slide" transparent onRequestClose={() => setPicker(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{picker === 'month' ? 'เลือกเดือน' : 'เลือกปี'}</Text>
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {picker === 'month' && [{ label: 'ทั้งปี', value: null as number | null }, ...MONTHS_FULL.map((label, i) => ({ label, value: i as number | null }))].map(opt => {
                const active = selMonth === opt.value;
                return (
                  <Pressy key={opt.label} onPress={() => pickMonth(opt.value)} style={[styles.optRow, active && styles.optRowActive]}>
                    <Text style={[styles.optText, active && styles.optTextActive]}>{opt.label}</Text>
                    {active && <Text style={styles.optCheck}>✓</Text>}
                  </Pressy>
                );
              })}
              {picker === 'year' && yearOptions.map(y => {
                const active = selYear === y;
                return (
                  <Pressy key={y} onPress={() => pickYear(y)} style={[styles.optRow, active && styles.optRowActive]}>
                    <Text style={[styles.optText, active && styles.optTextActive]}>{y + 543}</Text>
                    {active && <Text style={styles.optCheck}>✓</Text>}
                  </Pressy>
                );
              })}
            </ScrollView>
            <Pressy onPress={() => setPicker(null)} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>ปิด</Text>
            </Pressy>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const RANK_COLORS = [
  { bg: 'rgba(255,215,0,0.18)', fg: '#FFD54F' },   // 1st — gold
  { bg: 'rgba(203,213,225,0.18)', fg: '#CBD5E1' }, // 2nd — silver
  { bg: 'rgba(205,127,50,0.20)', fg: '#D8935A' },  // 3rd — bronze
];

function ProductRow({ rank, p }: { rank: number; p: any }) {
  const c = RANK_COLORS[rank] ?? { bg: 'rgba(255,138,0,0.12)', fg: COLORS.primary };
  return (
    <View style={styles.listRow}>
      <View style={[styles.rankBadge, { backgroundColor: c.bg }]}>
        <Text style={[styles.rankBadgeText, { color: c.fg }]}>{rank + 1}</Text>
      </View>
      <Text style={styles.listName} numberOfLines={1}>{p.name}</Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.listAmount}>{baht(Number(p.revenue ?? 0))}</Text>
        <Text style={styles.listQty}>{p.qty} ชิ้น</Text>
      </View>
    </View>
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

  // ── Header date/status + sync bar (moved from Dashboard, Patch A) ──
  headerDate: { color: COLORS.textLight, fontSize: 12, fontWeight: '600' },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2, marginBottom: 6 },
  onlineDot: { width: 7, height: 7, borderRadius: 4 },
  onlineText: { fontSize: 11, fontWeight: '700' },
  syncBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: RADIUS, borderWidth: 1, borderColor: COLORS.card,
    paddingVertical: 6, paddingHorizontal: 12, marginBottom: 18,
  },
  syncBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  syncIcon: { fontSize: 18 },
  syncTitle: { color: COLORS.textLight, fontSize: 13, fontWeight: '700' },
  syncSub: { color: COLORS.success, fontSize: 11, marginTop: 2 },
  syncBtn: { backgroundColor: 'rgba(255,138,0,0.15)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  syncBtnText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },

  // ── Time filter (Patch C) ──
  rangeRow: { flexDirection: 'row', marginBottom: 10 },
  rangeChip: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 9, minHeight: 36, justifyContent: 'center' },
  rangeChipInactive: { borderWidth: 1, borderColor: COLORS.card, backgroundColor: COLORS.surface },
  rangeChipText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  rangeChipTextActive: { fontSize: 12, color: '#fff', fontWeight: '700' },
  dropRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  dropBtn: {
    borderRadius: 16, borderWidth: 1, borderColor: COLORS.card, backgroundColor: COLORS.surface,
    paddingHorizontal: 14, paddingVertical: 8, minHeight: 46, justifyContent: 'center',
  },
  dropBtnActive: { borderColor: COLORS.primary, backgroundColor: 'rgba(255,138,0,0.10)' },
  dropLabel: { color: COLORS.textMuted, fontSize: 10 },
  dropValue: { color: COLORS.textLight, fontSize: 13, fontWeight: '700', marginTop: 1 },
  periodHint: { color: COLORS.textMuted, fontSize: 11, marginBottom: 14 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 18 },
  kpiTouchable: { borderRadius: CARD_RADIUS, overflow: 'hidden' },
  kpiCard: {
    padding: 16, minHeight: 120, borderWidth: 1, borderColor: 'rgba(148,163,184,0.18)',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6,
  },
  kpiIconWrap: {
    width: 34, height: 34, borderRadius: 11, backgroundColor: 'rgba(255,138,0,0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  kpiIcon: { fontSize: 16 },
  kpiValue: { color: COLORS.textLight, fontSize: 18, fontWeight: '800' },
  kpiLabel: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  kpiNote: { color: COLORS.primary, fontSize: 11, fontWeight: '700', marginTop: 6 },

  sectionCard: {
    backgroundColor: 'rgba(30,41,59,0.72)', borderRadius: CARD_RADIUS, borderWidth: 1, borderColor: 'rgba(148,163,184,0.14)',
    padding: 16, marginBottom: 18,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 5,
  },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, gap: 8 },
  sectionTitle: { color: COLORS.textLight, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  sectionHint: { color: COLORS.textMuted, fontSize: 11, flexShrink: 1 },

  // ── Ambient background glow (decorative, sits behind the ScrollView) ─────
  glowLayer: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  glowBlob: { position: 'absolute', width: 420, height: 420, borderRadius: 210 },
  glowBlobTop: { top: -160, right: -120 },
  glowBlobBottom: { bottom: -180, left: -140 },

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
  chartBarLabel: { color: COLORS.textMuted, fontSize: 10, marginTop: 6 },
  chartBarLabelActive: { color: COLORS.primary, fontWeight: '700' },

  // ── Grouped current-vs-previous bars ───────────────────────────────────
  compareChartRow: { flexDirection: 'row', alignItems: 'flex-end', height: 160, gap: 6, position: 'relative' },
  compareGroupCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  compareBarPair: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, width: '100%', flex: 1 },
  compareBarTrack: {
    flex: 1, height: '100%', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'flex-end', overflow: 'hidden',
  },
  compareBarFill: { width: '100%', borderRadius: 6 },
  lineLegendRow: { flexDirection: 'row', gap: 16, marginTop: 10 },
  legendItemRow: { flexDirection: 'row', gap: 16, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: COLORS.textMuted, fontSize: 11 },

  // ── Comparison Center rows ─────────────────────────────────────────────
  cmpRow: { marginBottom: 14 },
  cmpHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cmpLabel: { color: COLORS.textLight, fontSize: 13, fontWeight: '700' },
  cmpBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  cmpBadgeText: { fontSize: 11, fontWeight: '800' },
  cmpBarLine: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 5 },
  cmpBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  cmpBarFill: { height: '100%', borderRadius: 4 },
  cmpValue: { width: 84, textAlign: 'right', color: COLORS.textLight, fontSize: 12, fontWeight: '700' },

  // ── Best-selling time-slot badge ─────────────────────────────────────────
  peakCard: {
    marginTop: 14, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,138,0,0.10)', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,138,0,0.35)', paddingHorizontal: 14, paddingVertical: 12,
  },
  peakIconWrap: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,138,0,0.2)',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  peakIcon: { fontSize: 17 },
  peakLabel: { color: COLORS.textMuted, fontSize: 10 },
  peakText: { color: COLORS.textLight, fontSize: 13, fontWeight: '800', marginTop: 2 },
  peakAmount: { color: COLORS.primary, fontSize: 15, fontWeight: '800', marginTop: 2 },
  peakDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,138,0,0.25)', marginHorizontal: 14 },

  // ── Daily sales goal bar ──────────────────────────────────────────────────
  goalInfo: { marginBottom: 14 },
  goalBarWrap: {},
  goalBarHeadRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  goalBarTrack: { height: 14, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  goalBarFillWrap: {
    height: '100%', borderRadius: 7, overflow: 'hidden',
    shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 4,
  },
  goalBarFill: { flex: 1, borderRadius: 7 },
  goalPct: { color: COLORS.textLight, fontSize: 16, fontWeight: '800' },
  goalNow: { color: COLORS.textLight, fontSize: 13, fontWeight: '700', marginTop: 4, marginBottom: 2 },

  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.12)', gap: 10 },
  rankBadge: { width: 28, height: 28, borderRadius: 10, backgroundColor: 'rgba(255,138,0,0.18)', alignItems: 'center', justifyContent: 'center' },
  rankBadgeText: { color: COLORS.primary, fontSize: 12, fontWeight: '800' },
  listName: { flex: 1, color: COLORS.textLight, fontSize: 13, fontWeight: '600' },

  // ── Low stock row (moved from Dashboard, Patch A) ──
  lowStockRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.14)',
  },
  warnBadge: { backgroundColor: 'rgba(239,68,68,0.18)' },
  stockPill: {
    width: 46, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.18)',
  },
  stockPillText: { fontSize: 13, fontWeight: '800', textAlign: 'center', color: COLORS.danger },

  listQty: { color: COLORS.textMuted, fontSize: 11, marginTop: 1 },
  listAmount: { color: COLORS.success, fontSize: 12, fontWeight: '700' },

  // ── AI Insight cards ──
  insightCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, borderWidth: 1, padding: 12,
  },
  insightIconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  insightIcon: { fontSize: 18 },
  insightTitle: { fontSize: 12, fontWeight: '800', marginBottom: 2 },
  insightText: { color: COLORS.textLight, fontSize: 12, lineHeight: 18 },

  // ── Hall of Fame ──
  hallSub: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 4, letterSpacing: 0.3 },
  hallNote: { color: COLORS.textMuted, fontSize: 11, paddingVertical: 8, lineHeight: 17 },

  exportRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  exportCol: { flex: 1 },
  exportBtn: {
    paddingVertical: 14, paddingHorizontal: 6, borderRadius: 16, alignItems: 'center', justifyContent: 'center', minHeight: 92,
    backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(148,163,184,0.16)',
  },
  exportIconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  exportIcon: { fontSize: 17 },
  exportBtnText: { color: COLORS.textLight, fontWeight: '700', fontSize: 11, textAlign: 'center' },
  exportBtnSub: { color: COLORS.textMuted, fontSize: 9, marginTop: 2, letterSpacing: 0.5 },
  exportNote: { color: COLORS.textMuted, fontSize: 11, marginTop: 10 },

  emptyInline: { alignItems: 'center', paddingVertical: 28 },
  emptyInlineIcon: { fontSize: 30, marginBottom: 8 },
  emptyInlineText: { color: COLORS.textMuted, fontSize: 12 },

  // ── Month / Year picker sheet ──
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: COLORS.background, borderTopLeftRadius: CARD_RADIUS, borderTopRightRadius: CARD_RADIUS,
    borderWidth: 1, borderColor: 'rgba(148,163,184,0.18)', borderBottomWidth: 0,
    padding: 16, paddingBottom: 28,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.card, alignSelf: 'center', marginBottom: 14 },
  modalTitle: { color: COLORS.textLight, fontSize: 16, fontWeight: '800', marginBottom: 10 },
  optRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 14, borderRadius: 14, marginBottom: 6,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.card,
  },
  optRowActive: { borderColor: COLORS.primary, backgroundColor: 'rgba(255,138,0,0.12)' },
  optText: { color: COLORS.textLight, fontSize: 14, fontWeight: '600' },
  optTextActive: { color: COLORS.primary, fontWeight: '800' },
  optCheck: { color: COLORS.primary, fontSize: 15, fontWeight: '800' },
  closeBtn: {
    marginTop: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.card,
    borderRadius: RADIUS, paddingVertical: 12, alignItems: 'center',
  },
  closeBtnText: { color: COLORS.textLight, fontSize: 13, fontWeight: '700' },
});
