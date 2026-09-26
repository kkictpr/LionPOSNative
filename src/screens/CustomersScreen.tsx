import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert,
  Animated, Pressable, useWindowDimensions, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { listCustomers, upsertCustomer } from '../db/repository';

// ── LionPOS palette — identical to POS / Inventory (Radius 20 on cards/modals) ──
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

// UI-only helper — derives a membership badge from the points value that's
// already on the customer record. Reads item.points, writes nothing.
function membershipTier(points: number) {
  if (points >= 300) return { label: 'VIP', bg: 'rgba(255,138,0,0.18)', color: COLORS.primary };
  if (points >= 100) return { label: 'GOLD', bg: 'rgba(245,158,11,0.18)', color: COLORS.warning };
  return { label: 'SILVER', bg: 'rgba(148,163,184,0.18)', color: COLORS.textMuted };
}

function initials(name?: string) {
  const n = (name ?? '').trim();
  return n ? n[0].toUpperCase() : '?';
}

// Deterministic, purely cosmetic avatar color picked from the name string.
const AVATAR_PALETTE = [COLORS.primary, COLORS.success, '#60A5FA', '#F472B6', COLORS.warning];
function avatarColor(name?: string) {
  const n = name ?? '';
  let hash = 0;
  for (let i = 0; i < n.length; i++) hash = (hash + n.charCodeAt(i)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[hash];
}

// ── Animated press wrapper (scale + ripple), shared by cards & buttons ──
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

// ── Light fade + rise-in wrapper for a subtle entrance animation ────────
function FadeIn({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: any }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 320, delay, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

// ── Themed TextInput: radius 16, border #334155, focus ring in primary orange ──
function AppTextInput(props: React.ComponentProps<typeof TextInput>) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      placeholderTextColor={props.placeholderTextColor ?? COLORS.textMuted}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
      style={[styles.input, focused && styles.inputFocused, props.style]}
    />
  );
}

// ── Customer card ────────────────────────────────────────────────
function CustomerCard({
  item, index, onEdit, onHistory, colWidth,
}: { item: any; index: number; onEdit: (c: any) => void; onHistory: (c: any) => void; colWidth?: number }) {
  const tier = membershipTier(item.points ?? 0);
  const hasTotalSpent = item.total_spent != null;

  return (
    <FadeIn delay={Math.min(index, 8) * 40} style={[styles.cardWrap, colWidth ? { width: colWidth } : { flex: 1 }]}>
      <View style={styles.card}>
        <View style={styles.cardTopRow}>
          <View style={[styles.avatar, { backgroundColor: avatarColor(item.name) }]}>
            <Text style={styles.avatarText}>{initials(item.name)}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={styles.nameRow}>
              <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
              <View style={[styles.tierBadge, { backgroundColor: tier.bg }]}>
                <Text style={[styles.tierBadgeText, { color: tier.color }]}>{tier.label}</Text>
              </View>
            </View>
            <Text style={styles.cardPhone} numberOfLines={1}>{item.phone ?? 'ไม่มีเบอร์โทร'}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{item.points ?? 0}</Text>
            <Text style={styles.statLabel}>คะแนนสะสม</Text>
          </View>
          {hasTotalSpent && (
            <View style={[styles.statBox, styles.statBoxAlt]}>
              <Text style={[styles.statValue, { color: COLORS.success }]}>
                ฿{Number(item.total_spent).toLocaleString('th-TH')}
              </Text>
              <Text style={styles.statLabel}>ยอดซื้อรวม</Text>
            </View>
          )}
        </View>

        <View style={styles.cardActions}>
          <Pressy onPress={() => onEdit(item)} style={styles.actionBtn} rippleColor="rgba(255,255,255,0.15)">
            <Text style={styles.actionBtnText}>✏️ แก้ไข</Text>
          </Pressy>
          <Pressy onPress={() => onHistory(item)} style={[styles.actionBtn, styles.actionBtnAlt]} rippleColor="rgba(255,138,0,0.25)">
            <Text style={[styles.actionBtnText, styles.actionBtnTextAlt]}>🧾 ประวัติ</Text>
          </Pressy>
        </View>
      </View>
    </FadeIn>
  );
}

export default function CustomersScreen() {
  const { width } = useWindowDimensions();
  // Responsive grid: phone = 1 col, small/large tablet & iPad = 2-3 cols
  const numColumns = width >= 900 ? 3 : width >= 600 ? 2 : 1;
  const containerPad = 12;
  const gap = 10;
  const colWidth = numColumns > 1 ? (width - containerPad * 2 - gap * (numColumns - 1)) / numColumns : undefined;

  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  // UI-only fields — there's no `birthday` / `note` column in upsertCustomer/DB
  // yet, so these stay local and simply reset on save, matching the mockup's
  // form without touching the customer save contract below.
  const [dob, setDob] = useState('');
  const [note, setNote] = useState('');

  // ── Original logic — untouched ─────────────────────────────────
  const load = useCallback(async () => setCustomers(await listCustomers()), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!name.trim()) return;
    await upsertCustomer({ name: name.trim(), phone: phone.trim() || undefined });
    setName(''); setPhone(''); setModalOpen(false);
    load();
  };
  // ── End original logic ──────────────────────────────────────────

  const openAdd = () => {
    setEditTarget(null); setName(''); setPhone(''); setDob(''); setNote('');
    setModalOpen(true);
  };
  const openEdit = (item: any) => {
    setEditTarget(item); setName(item.name ?? ''); setPhone(item.phone ?? ''); setDob(''); setNote('');
    setModalOpen(true);
  };
  const closeModal = () => { setEditTarget(null); setModalOpen(false); };
  const openHistory = () => {
    Alert.alert('ประวัติการซื้อ', 'ฟีเจอร์ดูประวัติการซื้อจะเปิดให้ใช้งานเร็ว ๆ นี้');
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c: any) =>
      String(c.name ?? '').toLowerCase().includes(q) || String(c.phone ?? '').toLowerCase().includes(q)
    );
  }, [customers, search]);

  return (
    <View style={styles.container}>
      <FadeIn style={styles.header}>
        <View style={styles.headerLeft}>
          <LinearGradient
            colors={['#FFB84D', COLORS.primary, COLORS.primaryDark]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.logoBadge}>
            <Text style={styles.logoEmoji}>🦁</Text>
          </LinearGradient>
          <View>
            <Text style={styles.title}>ลูกค้า / สะสมแต้ม</Text>
            <Text style={styles.titleSub}>LionPOS</Text>
          </View>
        </View>
        <Pressy onPress={openAdd} rippleColor="rgba(255,255,255,0.2)">
          <LinearGradient
            colors={['#FFB84D', COLORS.primary, COLORS.primaryDark]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.addBtn}>
            <Text style={styles.addBtnText}>+ เพิ่มลูกค้า</Text>
          </LinearGradient>
        </Pressy>
      </FadeIn>

      <FadeIn delay={40} style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="ค้นหาชื่อ/เบอร์โทร..."
          placeholderTextColor={COLORS.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </FadeIn>

      <FlatList
        key={`cols-${numColumns}`}
        data={filtered}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
        keyExtractor={i => i.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item, index }) => (
          <CustomerCard item={item} index={index} onEdit={openEdit} onHistory={openHistory} colWidth={colWidth} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}><Text style={styles.emptyIcon}>👤</Text></View>
            <Text style={styles.emptyTitle}>ยังไม่มีลูกค้า</Text>
            <Text style={styles.emptySub}>เริ่มเก็บข้อมูลลูกค้าเพื่อสะสมแต้มและติดตามยอดซื้อ</Text>
            <Pressy onPress={openAdd} rippleColor="rgba(255,255,255,0.2)" style={{ marginTop: 16 }}>
              <LinearGradient
                colors={['#FFB84D', COLORS.primary, COLORS.primaryDark]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.emptyBtn}>
                <Text style={styles.emptyBtnText}>+ เพิ่มลูกค้าคนแรก</Text>
              </LinearGradient>
            </Pressy>
          </View>
        }
      />

      {/* ── Add / edit customer modal ─────────────────────────────── */}
      <Modal visible={modalOpen} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalBg}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editTarget ? 'แก้ไขข้อมูลลูกค้า' : 'เพิ่มลูกค้าใหม่'}</Text>
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled">

              <Text style={styles.label}>ชื่อลูกค้า *</Text>
              <AppTextInput placeholder="เช่น คุณสมชาย ใจดี" value={name} onChangeText={setName} />

              <Text style={styles.label}>เบอร์โทร</Text>
              <AppTextInput
                placeholder="081-234-5678"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />

              <Text style={styles.label}>วันเกิด</Text>
              <AppTextInput placeholder="วว/ดด/ปปปป" value={dob} onChangeText={setDob} />

              <Text style={styles.label}>หมายเหตุ</Text>
              <AppTextInput
                style={{ height: 74, textAlignVertical: 'top' }}
                multiline
                placeholder="เช่น ลูกค้าประจำ, แพ้นม"
                value={note}
                onChangeText={setNote}
              />
            </ScrollView>

            <View style={[styles.modalActions, styles.modalFooterSticky]}>
              <TouchableOpacity onPress={closeModal}>
                <Text style={styles.cancel}>ยกเลิก</Text>
              </TouchableOpacity>
              <Pressy onPress={save} rippleColor="rgba(255,255,255,0.2)">
                <LinearGradient
                  colors={['#FFB84D', COLORS.primary, COLORS.primaryDark]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.saveBtn}>
                  <Text style={styles.saveText}>บันทึก</Text>
                </LinearGradient>
              </Pressy>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 12 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBadge: {
    width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.primary, shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  logoEmoji: { fontSize: 28 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.textLight },
  titleSub: { fontSize: 10, fontWeight: '700', color: COLORS.primary, letterSpacing: 1 },

  addBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 14 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.card, paddingHorizontal: 12, marginBottom: 14, height: 44,
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, color: COLORS.textLight, fontSize: 13, height: '100%' },

  columnWrapper: { justifyContent: 'space-between', paddingHorizontal: 2 },

  cardWrap: { marginBottom: 10 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: CARD_RADIUS, padding: 14,
    borderWidth: 1, borderColor: '#2A3A57',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#0F172A', fontSize: 18, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { fontWeight: '700', fontSize: 14, color: COLORS.textLight, flexShrink: 1 },
  cardPhone: { color: COLORS.textMuted, fontSize: 12, marginTop: 3 },

  tierBadge: { borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5, minHeight: 22, justifyContent: 'center' },
  tierBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  statsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  statBox: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, paddingVertical: 8, alignItems: 'center',
  },
  statBoxAlt: { backgroundColor: 'rgba(16,185,129,0.08)' },
  statValue: { color: COLORS.textLight, fontSize: 14, fontWeight: '800' },
  statLabel: { color: COLORS.textMuted, fontSize: 10, marginTop: 2 },

  cardActions: { flexDirection: 'row', marginTop: 12, gap: 8 },
  actionBtn: { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, paddingVertical: 9, alignItems: 'center' },
  actionBtnAlt: { backgroundColor: 'rgba(255,138,0,0.15)' },
  actionBtnText: { color: COLORS.textLight, fontSize: 12, fontWeight: '600' },
  actionBtnTextAlt: { color: COLORS.primary },

  emptyWrap: { alignItems: 'center', marginTop: 56, paddingHorizontal: 24 },
  emptyIconWrap: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(255,138,0,0.12)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyIcon: { fontSize: 42 },
  emptyTitle: { color: COLORS.textLight, fontSize: 16, fontWeight: '700' },
  emptySub: { color: COLORS.textMuted, fontSize: 12, textAlign: 'center', marginTop: 6, lineHeight: 18, maxWidth: 280 },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 13, borderRadius: 14, minWidth: 220, alignItems: 'center' },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS, padding: 20, width: '88%', maxWidth: 480,
    maxHeight: '90%', borderWidth: 1, borderColor: COLORS.card,
  },
  modalScroll: { flexShrink: 1, minHeight: 0 },
  modalScrollContent: { paddingBottom: 4 },
  modalTitle: { fontWeight: '700', fontSize: 17, marginBottom: 12, color: COLORS.textLight },

  label: { fontSize: 12, color: COLORS.textMuted, marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: COLORS.card, borderRadius: 16, padding: 12, marginBottom: 10,
    color: COLORS.textLight, backgroundColor: 'rgba(255,255,255,0.03)',
  },
  inputFocused: { borderColor: COLORS.primary, borderWidth: 1.5 },

  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 12, gap: 20 },
  modalFooterSticky: { borderTopWidth: 1, borderTopColor: COLORS.card, paddingTop: 14, marginTop: 6 },
  cancel: { color: COLORS.textMuted, paddingVertical: 10 },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 14 },
  saveText: { color: '#fff', fontWeight: '700' },
});
