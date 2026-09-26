import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert, ScrollView,
  Switch, Animated, Pressable, useWindowDimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import {
  listStores, upsertStore, currentShift, closeShift, getSetting, setSetting,
} from '../db/repository';
import { scanPrinters, connectPrinter, getSavedPrinterMac, PrinterDevice } from '../utils/printer';
import { syncNow } from '../services/syncService';

// ── LionPOS palette — identical to Dashboard / Inventory / Customers ───────
const COLORS = {
  primary: '#FF8A00',
  primaryDark: '#E67300',
  background: '#0F172A',
  surface: '#1E293B',
  card: '#334155',
  border: '#475569',
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

// ── Animated press wrapper (scale + ripple), shared by cards & buttons ─────
function Pressy({
  onPress, style, rippleColor, children, disabled,
}: { onPress?: () => void; style?: any; rippleColor?: string; children: React.ReactNode; disabled?: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
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

// ── Premium section card — gradient background, icon chip, optional right slot ──
function SectionCard({
  icon, title, subtitle, right, delay = 0, children,
}: {
  icon: string; title: string; subtitle?: string; right?: React.ReactNode; delay?: number; children?: React.ReactNode;
}) {
  return (
    <FadeIn delay={delay} style={styles.cardTouchable}>
      <LinearGradient
        colors={['#26314C', COLORS.surface]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.card}>
        <View style={styles.cardHead}>
          <View style={styles.iconWrap}><Text style={styles.icon}>{icon}</Text></View>
          <View style={styles.cardHeadMain}>
            <Text style={styles.cardTitle}>{title}</Text>
            {!!subtitle && <Text style={styles.cardSub}>{subtitle}</Text>}
          </View>
          {right}
        </View>
        {children}
      </LinearGradient>
    </FadeIn>
  );
}

export default function SettingsScreen() {
  const { employee, logout } = useAuth();
  const [stores, setStores] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  const [shift, setShift] = useState<any | null>(null);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closingCash, setClosingCash] = useState('');

  const [taxRate, setTaxRate] = useState('0');
  const [restaurantMode, setRestaurantMode] = useState(false);

  const [printerDevices, setPrinterDevices] = useState<PrinterDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [savedPrinterMac, setSavedPrinterMac] = useState<string | null>(null);
  const [connectingMac, setConnectingMac] = useState<string | null>(null);

  const { width } = useWindowDimensions();
  const isTablet = width >= 700;

  // ── Original logic — left exactly as-is ─────────────────────────────────
  const load = useCallback(async () => {
    setStores(await listStores());
    if (employee) {
      setShift(await currentShift(employee.store_id, employee.id));
    }
    setTaxRate((await getSetting('tax_rate')) ?? '0');
    setSavedPrinterMac(await getSavedPrinterMac());
    setRestaurantMode((await getSetting('restaurant_mode')) === '1');
  }, [employee]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!name.trim()) return;
    await upsertStore({ name: name.trim(), address: address.trim() || undefined });
    setName(''); setAddress(''); setModalOpen(false);
    load();
  };

  const toggleRestaurantMode = async () => {
    const next = !restaurantMode;
    await setSetting('restaurant_mode', next ? '1' : '0');
    setRestaurantMode(next);
  };

  const doCloseShift = async () => {
    if (!shift || !closingCash.trim()) return;
    const result = await closeShift(shift.id, parseFloat(closingCash));
    const diff = result.difference;
    Alert.alert(
      'ปิดกะสำเร็จ',
      `เงินสดที่ควรมี ฿${result.expected.toFixed(2)}\nส่วนต่าง ${diff >= 0 ? '+' : ''}฿${diff.toFixed(2)}`,
    );
    setClosingCash(''); setCloseModalOpen(false);
    load();
  };

  const saveTaxRate = async () => {
    await setSetting('tax_rate', taxRate || '0');
    Alert.alert('บันทึกแล้ว', `อัตราภาษี ${taxRate}%`);
  };

  const doScanPrinters = async () => {
    setScanning(true);
    try {
      const devices = await scanPrinters();
      setPrinterDevices(devices);
      if (devices.length === 0) {
        Alert.alert('ไม่พบเครื่องพิมพ์', 'ตรวจสอบว่าเปิดบลูทูธและจับคู่ (pair) เครื่องพิมพ์กับมือถือไว้ล่วงหน้าแล้ว');
      }
    } catch (e: any) {
      Alert.alert('สแกนไม่สำเร็จ', String(e?.message ?? e));
    } finally {
      setScanning(false);
    }
  };

  const doConnectPrinter = async (device: PrinterDevice) => {
    setConnectingMac(device.inner_mac_address);
    try {
      await connectPrinter(device.inner_mac_address);
      setSavedPrinterMac(device.inner_mac_address);
      Alert.alert('เชื่อมต่อสำเร็จ', `เชื่อมต่อกับ ${device.device_name} แล้ว — ใบเสร็จจะพิมพ์อัตโนมัติทุกครั้งที่ขาย`);
    } catch (e: any) {
      Alert.alert('เชื่อมต่อไม่สำเร็จ', String(e?.message ?? e));
    } finally {
      setConnectingMac(null);
    }
  };
  // ── End original logic ───────────────────────────────────────────────────

  const doSyncNow = async () => {
    try {
      await syncNow();
      Alert.alert('Sync สำเร็จ', 'ส่งข้อมูลขึ้น Cloud เรียบร้อย');
    } catch (e: any) {
      Alert.alert('Sync ไม่สำเร็จ', String(e?.message ?? e));
    }
  };

  const storeName = stores[0]?.name ?? 'ยังไม่ได้ตั้งชื่อร้าน';
  const storeAddress = stores[0]?.address ?? 'เพิ่มที่อยู่ได้ในหัวข้อข้อมูลร้าน';

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, isTablet && { maxWidth: 960, width: '100%', alignSelf: 'center' }]}
        showsVerticalScrollIndicator={false}>

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
              <Text style={styles.brandSub}>ตั้งค่า</Text>
            </View>
          </View>
          <LinearGradient
            colors={['#FFB84D', COLORS.primary, COLORS.primaryDark]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.badge}>
            <Text style={styles.badgeText}>PREMIUM</Text>
          </LinearGradient>
        </FadeIn>

        {/* ── Store profile card ─────────────────────────────────── */}
        <FadeIn delay={40} style={styles.storeTouchable}>
          <LinearGradient
            colors={['#26314C', COLORS.surface]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.storeCard}>
            <View style={styles.storeLogo}><Text style={styles.storeLogoText}>🦁</Text></View>
            <View style={styles.storeMain}>
              <Text style={styles.storeName} numberOfLines={1}>{storeName}</Text>
              <Text style={styles.storeType} numberOfLines={1}>{storeAddress}</Text>
              <View style={styles.statusRow}>
                <View style={[styles.dot, { backgroundColor: shift ? COLORS.success : COLORS.textMuted }]} />
                <Text style={[styles.statusText, { color: shift ? COLORS.success : COLORS.textMuted }]}>
                  {shift ? `เปิดกะตั้งแต่ ${new Date(shift.opened_at).toLocaleTimeString('th-TH')}` : 'ยังไม่ได้เปิดกะ'}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </FadeIn>

        <View style={isTablet ? styles.grid : undefined}>
          <View style={isTablet ? styles.col : undefined}>
            {/* ── ข้อมูลร้าน / สาขา ───────────────────────────────── */}
            <SectionCard
              icon="🏪" title="ข้อมูลร้าน" subtitle="สาขาทั้งหมดในระบบ" delay={80}
              right={
                <Pressy onPress={() => setModalOpen(true)} rippleColor="rgba(255,255,255,0.2)">
                  <LinearGradient
                    colors={['#FFB84D', COLORS.primary, COLORS.primaryDark]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.addBtn}>
                    <Text style={styles.addBtnText}>+ เพิ่มสาขา</Text>
                  </LinearGradient>
                </Pressy>
              }>
              <FlatList
                scrollEnabled={false}
                data={stores}
                keyExtractor={i => i.id}
                ListEmptyComponent={
                  <View style={styles.emptyInline}>
                    <View style={styles.emptyIconWrap}><Text style={styles.emptyIcon}>🏬</Text></View>
                    <Text style={styles.emptyTitle}>ยังไม่มีสาขา</Text>
                    <Text style={styles.emptySub}>กดปุ่มเพิ่มสาขาด้านบนเพื่อเริ่มต้น</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <View style={styles.row}>
                    <Text style={styles.rowName}>{item.name}</Text>
                    <Text style={styles.rowMeta}>{item.address ?? ''}</Text>
                  </View>
                )}
              />
            </SectionCard>

            {/* ── การชำระเงิน ─────────────────────────────────────── */}
            <SectionCard icon="💳" title="การชำระเงิน" subtitle="อัตราภาษีที่คิดกับลูกค้า" delay={120}>
              <Text style={styles.fieldLabel}>อัตราภาษี (%)</Text>
              <View style={styles.inlineRow}>
                <AppTextInput
                  style={styles.inputInline}
                  value={taxRate}
                  onChangeText={setTaxRate}
                  keyboardType="numeric"
                  placeholder="0"
                />
                <Pressy onPress={saveTaxRate} rippleColor="rgba(255,255,255,0.2)">
                  <LinearGradient
                    colors={['#FFB84D', COLORS.primary, COLORS.primaryDark]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.saveBtn}>
                    <Text style={styles.saveText}>บันทึก</Text>
                  </LinearGradient>
                </Pressy>
              </View>
            </SectionCard>

            {/* ── เครื่องพิมพ์ ─────────────────────────────────────── */}
            <SectionCard icon="🖨️" title="เครื่องพิมพ์" subtitle="ใบเสร็จผ่านบลูทูธ" delay={160}>
              <View style={[styles.statusPill, savedPrinterMac ? styles.pillOn : styles.pillOff]}>
                <Text style={[styles.pillText, { color: savedPrinterMac ? COLORS.success : COLORS.textMuted }]} numberOfLines={1}>
                  {savedPrinterMac ? `เชื่อมต่ออยู่: ${savedPrinterMac}` : 'ยังไม่ได้เชื่อมต่อเครื่องพิมพ์'}
                </Text>
              </View>
              <Text style={styles.hint}>
                จับคู่ (pair) เครื่องพิมพ์กับมือถือในหน้าตั้งค่าบลูทูธของเครื่องก่อน แล้วค่อยกดสแกนที่นี่
              </Text>
              <Pressy onPress={doScanPrinters} disabled={scanning} style={styles.darkBtn} rippleColor="rgba(255,255,255,0.12)">
                <Text style={styles.darkBtnText}>{scanning ? 'กำลังสแกน...' : 'สแกนหาเครื่องพิมพ์'}</Text>
              </Pressy>
              {printerDevices.map(d => (
                <TouchableOpacity
                  key={d.inner_mac_address}
                  style={styles.printerRow}
                  activeOpacity={0.85}
                  onPress={() => doConnectPrinter(d)}
                  disabled={connectingMac === d.inner_mac_address}>
                  <Text style={styles.rowName}>{d.device_name || 'เครื่องพิมพ์ไม่ระบุชื่อ'}</Text>
                  <Text style={styles.rowMeta}>{d.inner_mac_address}</Text>
                  <Text style={styles.printerAction}>
                    {connectingMac === d.inner_mac_address
                      ? 'กำลังเชื่อมต่อ...'
                      : savedPrinterMac === d.inner_mac_address ? '✓ เชื่อมต่ออยู่' : 'แตะเพื่อเชื่อมต่อ'}
                  </Text>
                </TouchableOpacity>
              ))}
            </SectionCard>
          </View>

          <View style={isTablet ? styles.col : undefined}>
            {/* ── พนักงาน ──────────────────────────────────────────── */}
            <SectionCard icon="👤" title="พนักงาน" subtitle="บัญชีที่ใช้งานอยู่" delay={200}>
              <View style={styles.employeeRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{String(employee?.name ?? '?').trim().charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.employeeMain}>
                  <Text style={styles.employeeName} numberOfLines={1}>{employee?.name}</Text>
                  <Text style={styles.employeeRole} numberOfLines={1}>{employee?.role}</Text>
                </View>
              </View>
              {shift ? (
                <Pressy onPress={() => setCloseModalOpen(true)} style={styles.dangerBtn} rippleColor="rgba(239,68,68,0.2)">
                  <Text style={styles.dangerText}>
                    ปิดกะ (เปิดอยู่ตั้งแต่ {new Date(shift.opened_at).toLocaleTimeString('th-TH')})
                  </Text>
                </Pressy>
              ) : (
                <Text style={styles.hint}>ยังไม่ได้เปิดกะ — เปิดได้จากหน้าขาย</Text>
              )}
              <Pressy onPress={logout} rippleColor="rgba(255,255,255,0.2)" style={{ marginTop: 10 }}>
                <LinearGradient
                  colors={['#FFB84D', COLORS.primary, COLORS.primaryDark]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.saveBtnBlock}>
                  <Text style={styles.saveText}>ออกจากระบบ</Text>
                </LinearGradient>
              </Pressy>
            </SectionCard>

            {/* ── สำรองข้อมูล ──────────────────────────────────────── */}
            <SectionCard icon="☁️" title="สำรองข้อมูล" subtitle="ซิงก์ขึ้น Cloud" delay={240}>
              <Text style={styles.hint}>ส่งข้อมูลที่ค้างใน sync_queue ขึ้น Supabase</Text>
              <Pressy onPress={doSyncNow} style={styles.darkBtn} rippleColor="rgba(255,255,255,0.12)">
                <Text style={styles.darkBtnText}>Sync Now</Text>
              </Pressy>
            </SectionCard>

            {/* ── ตั้งค่าระบบ ──────────────────────────────────────── */}
            <SectionCard
              icon="⚙️" title="ตั้งค่าระบบ" subtitle="โหมดร้านอาหาร" delay={280}
              right={
                <Switch
                  value={restaurantMode}
                  onValueChange={toggleRestaurantMode}
                  trackColor={{ false: COLORS.card, true: 'rgba(255,138,0,0.5)' }}
                  thumbColor={restaurantMode ? COLORS.primary : '#CBD5E1'}
                  ios_backgroundColor={COLORS.card}
                />
              }>
              <Text style={styles.hint}>
                เปิดแล้วหน้าขายจะเปลี่ยนเป็นระบบเลือกโต๊ะ เปิดออเดอร์ค้างไว้ แล้วค่อยชำระเงินตอนลูกค้าจะกลับ
              </Text>
              <View style={[styles.statusPill, restaurantMode ? styles.pillPrimary : styles.pillOff]}>
                <Text style={[styles.pillText, { color: restaurantMode ? COLORS.primary : COLORS.textMuted }]}>
                  {restaurantMode ? 'เปิดใช้งานอยู่' : 'ปิดอยู่'}
                </Text>
              </View>
            </SectionCard>

            {/* ── เกี่ยวกับ ─────────────────────────────────────────── */}
            <SectionCard icon="ℹ️" title="เกี่ยวกับ LionPOS" subtitle="ระบบบริหารร้านค้า ครบ จบ ในแอปเดียว" delay={320}>
              <View style={styles.aboutRow}>
                <Text style={styles.aboutLabel}>แพลตฟอร์ม</Text>
                <Text style={styles.aboutValue}>{Platform.OS === 'ios' ? 'iOS / iPad' : 'Android'}</Text>
              </View>
              <View style={styles.aboutRow}>
                <Text style={styles.aboutLabel}>โหมดหน้าจอ</Text>
                <Text style={styles.aboutValue}>{isTablet ? 'Tablet' : 'Phone'}</Text>
              </View>
              <Text style={styles.aboutTag}>SIMPLE · POWERFUL · FOR REAL BUSINESS</Text>
            </SectionCard>
          </View>
        </View>
      </ScrollView>

      {/* ── Modal: เพิ่มสาขา ─────────────────────────────────────── */}
      <Modal visible={modalOpen} transparent animationType="fade">
        <KeyboardAvoidingView style={styles.modalBg} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalCard, isTablet && { width: 460 }]}>
            <Text style={styles.modalTitle}>เพิ่มสาขาใหม่</Text>
            <AppTextInput placeholder="ชื่อสาขา" value={name} onChangeText={setName} />
            <AppTextInput placeholder="ที่อยู่ (ไม่บังคับ)" value={address} onChangeText={setAddress} />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
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

      {/* ── Modal: ปิดกะ ────────────────────────────────────────── */}
      <Modal visible={closeModalOpen} transparent animationType="fade">
        <KeyboardAvoidingView style={styles.modalBg} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalCard, isTablet && { width: 460 }]}>
            <Text style={styles.modalTitle}>ปิดกะ — นับเงินสด</Text>
            <AppTextInput
              placeholder="เงินสดที่นับได้จริง"
              value={closingCash}
              onChangeText={setClosingCash}
              keyboardType="numeric"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setCloseModalOpen(false)}>
                <Text style={styles.cancel}>ยกเลิก</Text>
              </TouchableOpacity>
              <Pressy onPress={doCloseShift} rippleColor="rgba(255,255,255,0.2)">
                <LinearGradient
                  colors={['#FFB84D', COLORS.primary, COLORS.primaryDark]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.saveBtn}>
                  <Text style={styles.saveText}>ปิดกะ</Text>
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
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, paddingBottom: 40 },
  grid: { flexDirection: 'row', marginHorizontal: -7 },
  col: { flex: 1, paddingHorizontal: 7 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBadge: {
    width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.primary, shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  logoEmoji: { fontSize: 28 },
  brand: { color: COLORS.textLight, fontSize: 20, fontWeight: '800' },
  brandSub: { color: COLORS.textMuted, fontSize: 11, marginTop: 1 },
  badge: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
    shadowColor: COLORS.primary, shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },

  storeTouchable: { borderRadius: CARD_RADIUS, overflow: 'hidden', marginBottom: 18 },
  storeCard: {
    flexDirection: 'row', alignItems: 'center', padding: 18, borderWidth: 1, borderColor: '#2A3A57',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  storeLogo: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,138,0,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,138,0,0.35)', alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  storeLogoText: { fontSize: 26 },
  storeMain: { flex: 1 },
  storeName: { color: COLORS.textLight, fontSize: 16, fontWeight: '800' },
  storeType: { color: COLORS.textMuted, fontSize: 12, marginTop: 3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusText: { fontSize: 11, fontWeight: '600' },

  cardTouchable: { borderRadius: CARD_RADIUS, overflow: 'hidden', marginBottom: 16 },
  card: {
    padding: 16, borderWidth: 1, borderColor: '#2A3A57',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardHeadMain: { flex: 1, paddingRight: 8 },
  iconWrap: {
    width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,138,0,0.15)',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  icon: { fontSize: 18 },
  cardTitle: { color: COLORS.textLight, fontSize: 15, fontWeight: '700' },
  cardSub: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },

  fieldLabel: { color: COLORS.textMuted, fontSize: 11, marginBottom: 6 },
  inlineRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    borderWidth: 1, borderColor: COLORS.card, borderRadius: 16, padding: 12, marginBottom: 10,
    color: COLORS.textLight, backgroundColor: 'rgba(255,255,255,0.03)',
  },
  inputFocused: { borderColor: COLORS.primary, borderWidth: 1.5 },
  inputInline: { flex: 1, marginBottom: 0, marginRight: 8 },

  hint: { color: COLORS.textMuted, fontSize: 11, lineHeight: 17, marginBottom: 8 },
  statusPill: {
    alignSelf: 'flex-start', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6,
    marginBottom: 8, borderWidth: 1, minHeight: 26, justifyContent: 'center',
  },
  pillOn: { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.35)' },
  pillOff: { backgroundColor: COLORS.card, borderColor: COLORS.border },
  pillPrimary: { backgroundColor: 'rgba(255,138,0,0.14)', borderColor: 'rgba(255,138,0,0.35)' },
  pillText: { fontSize: 11, fontWeight: '800' },

  saveBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, alignItems: 'center' },
  saveBtnBlock: { paddingVertical: 12, borderRadius: 14, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  darkBtn: {
    backgroundColor: COLORS.card, borderRadius: 14, paddingVertical: 12, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border, marginTop: 4,
  },
  darkBtnText: { color: COLORS.textLight, fontWeight: '700', fontSize: 13 },
  dangerBtn: {
    backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)',
    borderRadius: 14, paddingVertical: 12, alignItems: 'center',
  },
  dangerText: { color: COLORS.danger, fontWeight: '700', fontSize: 12, textAlign: 'center' },
  addBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  employeeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,138,0,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,138,0,0.35)', alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  avatarText: { color: COLORS.primary, fontSize: 16, fontWeight: '800' },
  employeeMain: { flex: 1 },
  employeeName: { color: COLORS.textLight, fontSize: 14, fontWeight: '700' },
  employeeRole: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },

  row: { backgroundColor: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 14, marginBottom: 8 },
  rowName: { color: COLORS.textLight, fontWeight: '600', fontSize: 13 },
  rowMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  printerRow: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.background },
  printerAction: { color: COLORS.primary, fontSize: 11, fontWeight: '700', marginTop: 4 },

  emptyInline: { alignItems: 'center', paddingVertical: 20 },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,138,0,0.12)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  emptyIcon: { fontSize: 28 },
  emptyTitle: { color: COLORS.textLight, fontSize: 13, fontWeight: '700' },
  emptySub: { color: COLORS.textMuted, fontSize: 11, marginTop: 4, textAlign: 'center' },

  aboutRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: COLORS.background,
  },
  aboutLabel: { color: COLORS.textMuted, fontSize: 12 },
  aboutValue: { color: COLORS.textLight, fontSize: 12, fontWeight: '600' },
  aboutTag: { color: COLORS.textMuted, fontSize: 10, letterSpacing: 1, textAlign: 'center', marginTop: 14 },

  modalBg: { flex: 1, backgroundColor: 'rgba(2,6,23,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS, padding: 20, width: '88%',
    borderWidth: 1, borderColor: COLORS.card,
  },
  modalTitle: { fontWeight: '700', fontSize: 16, marginBottom: 12, color: COLORS.textLight },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 8, gap: 20 },
  cancel: { color: COLORS.textMuted, paddingVertical: 10 },
});
