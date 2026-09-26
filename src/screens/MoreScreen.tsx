import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Animated, Pressable, Alert, useWindowDimensions } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';

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
};
// Premium content cards use a slightly larger radius than modals/chips —
// style-only, matched across all screens.
const CARD_RADIUS = 24;

type MenuItem = { key: string; label: string; desc: string; icon: string; route?: string };

// ── Original menu — same 4 destinations/keys as before, plus two informational
// entries (Backup / About) that don't yet have a route in the navigator ──────
const MENU: MenuItem[] = [
  { key: 'Purchasing', label: 'จัดการร้าน', desc: 'จัดซื้อ / ซัพพลายเออร์', icon: '📦', route: 'Purchasing' },
  { key: 'SalesHistory', label: 'ประวัติการขาย', desc: 'บิลย้อนหลังและการคืนเงิน', icon: '🧾', route: 'SalesHistory' },
  { key: 'Employees', label: 'พนักงาน', desc: 'สิทธิ์การใช้งานและกะทำงาน', icon: '👤', route: 'Employees' },
  { key: 'Settings', label: 'ตั้งค่าระบบ', desc: 'ภาษี เครื่องพิมพ์ และธีม', icon: '⚙️', route: 'Settings' },
  { key: 'Backup', label: 'สำรองข้อมูล', desc: 'สำรองและกู้คืนฐานข้อมูล', icon: '☁️' },
  { key: 'About', label: 'เกี่ยวกับ LionPOS', desc: 'เวอร์ชันแอปและการสนับสนุน', icon: 'ℹ️' },
];

// ── Animated press wrapper (scale + ripple), shared by cards & buttons ─────
function Pressy({
  onPress, style, rippleColor, children,
}: { onPress?: () => void; style?: any; rippleColor?: string; children: React.ReactNode }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        android_ripple={{ color: rippleColor ?? 'rgba(255,138,0,0.2)' }}
        style={style}>
        {({ pressed }) => (
          <>
            {children}
            {pressed && <View pointerEvents="none" style={styles.pressHighlight} />}
          </>
        )}
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

export default function MoreScreen() {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const isTablet = width >= 700;
  const numColumns = isTablet ? 2 : 1;

  const onPressItem = (item: MenuItem) => {
    if (item.route) {
      navigation.navigate(item.route);
      return;
    }
    Alert.alert(item.label, 'ฟีเจอร์นี้กำลังจะเปิดใช้งานเร็ว ๆ นี้');
  };

  const renderHeader = () => (
    <View>
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
            <Text style={styles.brandSub}>เพิ่มเติม</Text>
          </View>
        </View>
        <LinearGradient
          colors={['#FFB84D', COLORS.primary, COLORS.primaryDark]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.badge}>
          <Text style={styles.badgeText}>PREMIUM</Text>
        </LinearGradient>
      </FadeIn>

      <FadeIn delay={60}>
        <Pressy onPress={() => navigation.navigate('Settings')} style={styles.profileTouchable} rippleColor="rgba(255,255,255,0.08)">
          <LinearGradient
            colors={['#26314C', COLORS.surface]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.profileCard}>
            <View style={styles.avatar}><Text style={styles.avatarText}>🦁</Text></View>
            <View style={styles.profileMain}>
              <Text style={styles.profileName} numberOfLines={1}>ร้านของคุณ</Text>
              <Text style={styles.profileMeta} numberOfLines={1}>ไอศกรีม · คาเฟ่</Text>
              <View style={styles.statusRow}>
                <View style={styles.dot} />
                <Text style={styles.statusText}>เชื่อมต่อฐานข้อมูลแล้ว</Text>
              </View>
            </View>
            <View style={styles.profileChevronWrap}><Text style={styles.profileChevron}>›</Text></View>
          </LinearGradient>
        </Pressy>
      </FadeIn>

      <Text style={styles.groupLabel}>เมนูทั้งหมด</Text>
    </View>
  );

  const renderFooter = () => (
    <FadeIn delay={280}>
      <Text style={styles.version}>SIMPLE · POWERFUL · FOR REAL BUSINESS</Text>
    </FadeIn>
  );

  return (
    <View style={styles.container}>
      <FlatList
        key={`cols-${numColumns}`}
        data={MENU}
        keyExtractor={m => m.key}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
        contentContainerStyle={styles.content}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        renderItem={({ item, index }) => (
          <FadeIn delay={Math.min(index, 6) * 40} style={numColumns > 1 ? styles.colWrap : undefined}>
            <Pressy onPress={() => onPressItem(item)} style={styles.rowTouchable} rippleColor="rgba(255,255,255,0.1)">
              <LinearGradient
                colors={['#26314C', COLORS.surface]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.row}>
                <View style={styles.iconWrap}><Text style={styles.icon}>{item.icon}</Text></View>
                <View style={styles.rowMain}>
                  <Text style={styles.label} numberOfLines={1}>{item.label}</Text>
                  <Text style={styles.desc} numberOfLines={1}>{item.desc}</Text>
                </View>
                {!item.route && (
                  <View style={styles.soon}><Text style={styles.soonText}>เร็ว ๆ นี้</Text></View>
                )}
                <Text style={styles.chevron}>›</Text>
              </LinearGradient>
            </Pressy>
          </FadeIn>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 14, paddingBottom: 28 },
  columnWrapper: { justifyContent: 'space-between' },
  colWrap: { width: '49%' },

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
    shadowColor: COLORS.primary, shadowOpacity: 0.85, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 10,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },

  profileTouchable: { borderRadius: CARD_RADIUS, overflow: 'hidden', marginBottom: 22 },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', padding: 18, borderWidth: 1, borderColor: '#2A3A57',
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 10,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,138,0,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,138,0,0.35)', alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  avatarText: { fontSize: 26 },
  profileMain: { flex: 1, paddingRight: 8 },
  profileName: { color: COLORS.textLight, fontSize: 16, fontWeight: '800' },
  profileMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.success, marginRight: 6 },
  statusText: { color: COLORS.success, fontSize: 11, fontWeight: '600' },
  profileChevronWrap: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  profileChevron: { color: COLORS.primary, fontSize: 20, fontWeight: '800' },

  groupLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 12, letterSpacing: 0.5 },

  rowTouchable: { borderRadius: CARD_RADIUS, overflow: 'hidden', marginBottom: 10 },
  row: {
    flexDirection: 'row', alignItems: 'center', padding: 14, borderWidth: 1, borderColor: '#2A3A57',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,138,0,0.15)',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  icon: { fontSize: 20 },
  rowMain: { flex: 1, paddingRight: 6 },
  label: { color: COLORS.textLight, fontSize: 15, fontWeight: '700' },
  desc: { color: COLORS.textMuted, fontSize: 11, marginTop: 3 },
  soon: { backgroundColor: COLORS.card, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, marginRight: 8, minHeight: 22, justifyContent: 'center' },
  soonText: { color: COLORS.textMuted, fontSize: 9, fontWeight: '800' },
  chevron: { color: COLORS.primary, fontSize: 20, fontWeight: '700' },

  version: { color: 'rgba(148,163,184,0.5)', fontSize: 10, textAlign: 'center', marginTop: 18, letterSpacing: 0.6 },
  pressHighlight: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,138,0,0.10)' },
});
