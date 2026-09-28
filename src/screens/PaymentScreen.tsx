// SecurePay v1.4 - LionPOS
// FILE: src/screens/PaymentScreen.tsx  (replace file)
// ไม่พึ่ง library เพิ่ม: ใช้เฉพาะ react-native (Animated) + @react-navigation/native
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {CommonActions, useNavigation, useRoute} from '@react-navigation/native';

/* ───────────── Design tokens ───────────── */
const C = {
  bg: '#0B1324',
  headerTop: '#14213D',
  headerBottom: '#0B1324',
  card: '#121C33',
  border: '#2A3A57',
  accent: '#FF8A00',
  success: '#22C55E',
  successDark: '#16A34A',
  text: '#FFFFFF',
  sub: '#94A3B8',
  danger: '#F87171',
  grayBtn: '#1E293B',
};
const RADIUS = 24;
const BTN_RADIUS = 18;
const BTN_HEIGHT = 56;
const GAP = 16;
const QUICK_CASH = [20, 50, 100, 200, 500, 1000];

// เตรียม Success Animation ไว้แล้ว (ยังไม่เรียกเสียง) — เปิดใช้โดยเปลี่ยนเป็น true
const ENABLE_SUCCESS_ANIM = false;

// ผลชำระเงินส่งกลับหน้า POS ผ่าน params.paymentResult (serializable ล้วน ไม่ส่ง function ผ่าน route.params)

type Method = 'cash' | 'promptpay';

/* ───────────── Helpers ───────────── */
const num = (v: any, fallback = 0): number => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && isFinite(n) ? n : fallback;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const baht = (n: number): string => {
  const [i, d] = round2(n).toFixed(2).split('.');
  return `฿${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${d}`;
};

const hexToRgb = (hex: string) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.substring(i, i + 2), 16));
};

/** Gradient แบบไม่ต้องใช้ library: แบ่งเป็นแถบสีไล่ระดับ (แนวตั้ง/แนวนอน) */
const GradientBg = ({
  from,
  to,
  steps = 24,
  horizontal = false,
}: {
  from: string;
  to: string;
  steps?: number;
  horizontal?: boolean;
}) => {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return (
    <View
      style={[StyleSheet.absoluteFill, horizontal && {flexDirection: 'row'}]}
      pointerEvents="none">
      {Array.from({length: steps}).map((_, i) => {
        const t = i / (steps - 1);
        const [r, g, bl] = a.map((v, k) => Math.round(v + (b[k] - v) * t));
        return <View key={i} style={{flex: 1, backgroundColor: `rgb(${r},${g},${bl})`}} />;
      })}
    </View>
  );
};

/** Shield icon วาดด้วย View (ไม่ใช้ icon library) */
const ShieldIcon = () => (
  <View style={styles.shieldWrap}>
    <View style={styles.shield}>
      <View style={styles.shieldCheck} />
    </View>
  </View>
);

/** PRNG แบบ deterministic เพื่อให้ QR เดิมทุกครั้งสำหรับบิลเดิม */
const seeded = (seedStr: string) => {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const QR_N = 25;
const buildMatrix = (seed: string): boolean[][] => {
  const rnd = seeded(seed);
  const m: boolean[][] = Array.from({length: QR_N}, () =>
    Array.from({length: QR_N}, () => rnd() > 0.52),
  );
  const finder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= QR_N || cc >= QR_N) continue;
        const edge = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        m[rr][cc] = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (edge || core);
      }
    }
  };
  finder(0, 0);
  finder(0, QR_N - 7);
  finder(QR_N - 7, 0);
  return m;
};

/** QR เดิม + Glow + Fade in */
const QrPrototype = ({seed}: {seed: string}) => {
  const matrix = useMemo(() => buildMatrix(seed), [seed]);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [seed, fade]);

  return (
    <Animated.View
      style={{
        opacity: fade,
        transform: [
          {scale: fade.interpolate({inputRange: [0, 1], outputRange: [0.96, 1]})},
        ],
      }}>
      <View style={styles.glowOuter}>
        <View style={styles.glowMid}>
          <View style={styles.qrBox}>
            {matrix.map((row, r) => (
              <View key={r} style={{flexDirection: 'row'}}>
                {row.map((on, c) => (
                  <View
                    key={c}
                    style={{width: 8, height: 8, backgroundColor: on ? '#0B1324' : '#FFFFFF'}}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

/** จุดกะพริบ สำหรับสถานะ "รอการชำระเงิน" */
const PulseDot = ({active = true}: {active?: boolean}) => {
  const v = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    if (!active) {
      v.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, {toValue: 1, duration: 800, useNativeDriver: true}),
        Animated.timing(v, {toValue: 0.35, duration: 800, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, active]);
  return (
    <Animated.View
      style={[styles.dot, !active && {backgroundColor: C.success}, {opacity: v}]}
    />
  );
};

/** ปุ่ม CashPad: Scale 0.97 + Ripple + Shadow เบา (บวกสะสมเหมือนเดิม) */
const CashKey = ({label, onPress}: {label: string; onPress: () => void}) => {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.spring(scale, {toValue: v, speed: 40, bounciness: 0, useNativeDriver: true}).start();
  return (
    <Animated.View style={[styles.quickWrapBtn, {transform: [{scale}]}]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => to(0.97)}
        onPressOut={() => to(1)}
        android_ripple={{color: 'rgba(255,138,0,0.25)'}}
        style={styles.quickBtn}>
        <Text style={styles.quickTxt}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
};

/* ───────────── Screen ───────────── */
export default function PaymentScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const p = route.params ?? {};

  const cart: any[] = Array.isArray(p.cart) ? p.cart : [];

  const lines = useMemo(
    () =>
      cart.map((it, idx) => {
        const qty = num(it.qty ?? it.quantity, 1);
        const price = num(it.price ?? it.unitPrice, 0);
        return {
          key: String(it.id ?? it.sku ?? idx),
          name: String(it.name ?? it.title ?? `สินค้า ${idx + 1}`),
          qty,
          price,
          amount: round2(qty * price),
        };
      }),
    [cart],
  );

  const subtotal = round2(
    p.subtotal != null ? num(p.subtotal) : lines.reduce((s, l) => s + l.amount, 0),
  );
  const discountAmt = round2(num(p.discountAmt, 0));
  // รองรับทั้ง 7 (เปอร์เซ็นต์) และ 0.07 (สัดส่วน)
  const rawRate = num(p.taxRate, 0);
  const rate = rawRate > 1 ? rawRate / 100 : rawRate;
  const taxAmt = round2(Math.max(subtotal - discountAmt, 0) * rate);
  const total = round2(p.total != null ? num(p.total) : Math.max(subtotal - discountAmt, 0) + taxAmt);

  const [method, setMethod] = useState<Method>('cash');
  const [received, setReceived] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [paymentReceived, setPaymentReceived] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const successScale = useRef(new Animated.Value(0.6)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  const billRef = useRef(
    String(
      p.billNo ??
        p.orderId ??
        (() => {
          const d = new Date();
          const pad = (n: number) => String(n).padStart(2, '0');
          const rnd = Math.floor(1000 + Math.random() * 9000);
          return `LP-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${rnd}`;
        })(),
    ),
  );
  const billNo = billRef.current;

  const change = round2(received - total);
  const cashOk = received >= total;
  const canConfirm = total > 0 && (method === 'cash' ? cashOk : paymentReceived);

  /** Success Animation (เตรียมไว้; ยังไม่มีเสียง — ต่อ hook เสียงตรงนี้ภายหลัง) */
  const playSuccess = (done: () => void) => {
    setShowSuccess(true);
    successScale.setValue(0.6);
    successOpacity.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(successOpacity, {toValue: 1, duration: 200, useNativeDriver: true}),
        Animated.spring(successScale, {toValue: 1, friction: 5, useNativeDriver: true}),
      ]),
      Animated.delay(700),
    ]).start(() => {
      setShowSuccess(false);
      done();
    });
  };

  /** หา route ของหน้า POS จาก Navigation State (ไม่ใช้ชื่อคงที่ตั้งเอง)
   *  ค้น navigator ของหน้านี้ก่อน → ไล่ nested state → ไล่ขึ้น parent navigator
   *  คืน {route, stateKey} โดย stateKey คือ key ของ navigator ที่ถือ route นั้นอยู่ */
  const findPOSRoute = (): {route: any; stateKey?: string} | null => {
    const search = (state: any): {route: any; stateKey?: string} | null => {
      if (!state || !Array.isArray(state.routes)) return null;
      for (const r of state.routes) {
        if (r.name === 'SalesHome') return {route: r, stateKey: state.key};
      }
      for (const r of state.routes) {
        const hit = search(r.state); // nested state
        if (hit) return hit;
      }
      return null;
    };
    let nav: any = navigation;
    while (nav) {
      const hit = search(nav.getState?.());
      if (hit) return hit;
      nav = nav.getParent?.();
    }
    return null;
  };

  /** ส่งผลชำระเงินกลับหน้า POS โดยไม่ pop/push หน้าใด (setParams ที่ route ของ POS) */
  const sendResultToPOS = (result: any) => {
    const found = findPOSRoute();
    const posRoute = found?.route;

    console.log('[PAYMENT_RETURN]', {
      target: posRoute?.name,
      key: posRoute?.key,
      billNo: result.billNo,
    });

    if (posRoute) {
      // ระบุ route เป้าหมายด้วย source (+ target = navigator ที่ถือ route นั้น)
      navigation.dispatch({
        ...CommonActions.setParams({paymentResult: result}),
        source: posRoute.key,
        ...(found?.stateKey ? {target: found.stateKey} : {}),
      });
    } else {
      console.warn('[PAYMENT_RETURN]', 'POS route not found');
      navigation.navigate({
        name: route.name,
        params: {paymentResult: result},
        merge: true,
      });
    }
  };

  const onConfirm = () => {
    if (!canConfirm || submitting) return;

    const result = {
      billNo,
      method,
      total,
      received: method === 'cash' ? received : total,
      change: method === 'cash' ? Math.max(change, 0) : 0,
      paidAt: new Date().toISOString(),
    };

    // ล็อกปุ่มทั้งหมดจนกว่าจะ goBack (กันกดซ้ำ/บันทึกซ้ำ)
    setSubmitting(true);
    try {
      sendResultToPOS(result);
    } catch (e: any) {
      setSubmitting(false);
      Alert.alert(
        'ส่งผลการชำระเงินไม่สำเร็จ',
        `กรุณาลองอีกครั้ง${e && e.message ? `\n(${e.message})` : ''}`,
      );
      return;
    }

    const finish = () =>
      Alert.alert(
        'ชำระเงินสำเร็จ',
        method === 'cash'
          ? `เลขที่บิล ${billNo}\nเงินทอน ${baht(result.change)}`
          : `เลขที่บิล ${billNo}\nรับชำระผ่าน PromptPay ${baht(total)}`,
        [{text: 'ตกลง', onPress: () => navigation.goBack()}],
        {cancelable: false},
      );
    if (ENABLE_SUCCESS_ANIM) {
      playSuccess(finish);
    } else {
      finish();
    }
  };

  const onCancel = () => {
    setPaymentReceived(false);
    navigation.goBack();
  };

  const switchMethod = (m: Method) => {
    setMethod(m);
    setPaymentReceived(false); // เปลี่ยนวิธีจ่าย → ต้องรอยืนยันการรับเงินใหม่
  };

  // Hook สำหรับ Sprint ถัดไป: PromptPay API / Webhook / Slip Verification เรียกฟังก์ชันนี้เมื่อยืนยันว่าเงินเข้าแล้ว
  // ตอนนี้ "ห้ามเรียกเอง" — ไม่มีปุ่มให้แคชเชียร์กด
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const onPaymentReceived = () => {
    setPaymentReceived(true);
  };

  // ออกจากหน้า (blur) → reset สถานะรับเงิน
  useEffect(() => {
    const unsub = navigation.addListener('blur', () => setPaymentReceived(false));
    return unsub;
  }, [navigation]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.headerTop} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <GradientBg from={C.headerTop} to={C.headerBottom} />
          <View style={styles.headerTopRow}>
            <ShieldIcon />
            <View style={styles.secureBadge}>
              <Text style={styles.secureBadgeTxt}>Secure Payment</Text>
            </View>
          </View>
          <Text style={styles.headerSub}>ยอดที่ต้องชำระ</Text>
          <Text style={styles.totalBig} adjustsFontSizeToFit numberOfLines={1}>
            {baht(total)}
          </Text>
          <Text style={styles.headerBill}>บิล {billNo}</Text>
        </View>

        <View style={styles.body}>
          {/* Items card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>รายการสินค้า</Text>
            {lines.length === 0 ? (
              <Text style={styles.empty}>ไม่มีรายการสินค้าในตะกร้า</Text>
            ) : (
              lines.map((l, i) => (
                <View key={l.key}>
                  {i > 0 && <View style={styles.thinDivider} />}
                  <View style={styles.itemRow}>
                    <View style={{flex: 1, paddingRight: 12}}>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {l.name}
                      </Text>
                      <Text style={styles.itemQty}>
                        {l.qty} × {baht(l.price)}
                      </Text>
                    </View>
                    <Text style={styles.itemAmt}>{baht(l.amount)}</Text>
                  </View>
                </View>
              ))
            )}

            <View style={styles.divider} />
            <SumRow label="ยอดรวมสินค้า" value={baht(subtotal)} />
            {discountAmt > 0 && (
              <SumRow label="ส่วนลด" value={`-${baht(discountAmt)}`} color={C.success} />
            )}
            {rate > 0 && (
              <SumRow label={`ภาษี (${round2(rate * 100)}%)`} value={baht(taxAmt)} />
            )}
            <View style={styles.divider} />
            <SumRow label="ยอดสุทธิ" value={baht(total)} bold />
          </View>

          {/* Segmented control */}
          <View style={styles.segment}>
            <SegBtn label="เงินสด" active={method === 'cash'} onPress={() => switchMethod('cash')} />
            <SegBtn
              label="PromptPay"
              active={method === 'promptpay'}
              onPress={() => switchMethod('promptpay')}
            />
          </View>

          {/* Cash */}
          {method === 'cash' && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>รับเงินสด</Text>

              <View style={styles.receivedBox}>
                <Text style={styles.itemQty}>รับเงินมา</Text>
                <Text style={styles.receivedVal}>{baht(received)}</Text>
              </View>

              <View style={styles.quickWrap}>
                {QUICK_CASH.map(v => (
                  <CashKey key={v} label={String(v)} onPress={() => setReceived(r => r + v)} />
                ))}
              </View>

              <View style={styles.quickWrap}>
                <Pressable
                  onPress={() => setReceived(total)}
                  android_ripple={{color: 'rgba(148,163,184,0.2)'}}
                  style={({pressed}) => [styles.ghostBtn, pressed && styles.pressed]}>
                  <Text style={styles.ghostTxt}>พอดียอด</Text>
                </Pressable>
                <Pressable
                  onPress={() => setReceived(0)}
                  android_ripple={{color: 'rgba(148,163,184,0.2)'}}
                  style={({pressed}) => [styles.ghostBtn, pressed && styles.pressed]}>
                  <Text style={styles.ghostTxt}>ล้าง</Text>
                </Pressable>
              </View>

              <View
                style={[
                  styles.changeBox,
                  {borderColor: cashOk && received > 0 ? C.success : C.border},
                ]}>
                <Text style={styles.itemQty}>{cashOk || received === 0 ? 'เงินทอน' : 'ยังขาดอีก'}</Text>
                <Text
                  style={[
                    styles.changeVal,
                    {color: received === 0 ? C.sub : cashOk ? C.success : C.danger},
                  ]}>
                  {received === 0 ? baht(0) : cashOk ? baht(change) : baht(Math.abs(change))}
                </Text>
              </View>
            </View>
          )}

          {/* PromptPay */}
          {method === 'promptpay' && (
            <View style={[styles.card, {alignItems: 'center'}]}>
              <View style={styles.qrTitleRow}>
                <Text style={styles.cardTitle}>สแกนเพื่อชำระ</Text>
                <View style={styles.dynBadge}>
                  <Text style={styles.dynBadgeTxt}>Dynamic QR</Text>
                </View>
              </View>

              <QrPrototype seed={`${billNo}|${total.toFixed(2)}`} />

              <Text style={styles.qrAmt}>{baht(total)}</Text>

              <View style={[styles.statusPill, paymentReceived && styles.statusPillOk]}>
                <PulseDot active={!paymentReceived} />
                <Text style={[styles.statusTxt, paymentReceived && {color: C.success}]}>
                  {paymentReceived ? 'ได้รับเงินแล้ว' : 'รอการชำระเงิน'}
                </Text>
              </View>

              {!paymentReceived && (
                <Text style={styles.checking}>กำลังตรวจสอบการรับเงิน...</Text>
              )}

              <View style={styles.refBox}>
                <Text style={styles.itemQty}>เลขอ้างอิงบิล</Text>
                <Text style={styles.refVal} selectable>
                  {billNo}
                </Text>
              </View>
              <Text style={styles.proto}>Dynamic QR (Prototype) — ยังไม่ใช่ QR สำหรับรับเงินจริง</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom action */}
      <View style={styles.bottom}>
        <Pressable
          onPress={onCancel}
          disabled={submitting}
          android_ripple={{color: 'rgba(255,255,255,0.12)'}}
          style={({pressed}) => [styles.cancelBtn, pressed && styles.pressed]}>
          <Text style={styles.cancelTxt}>ยกเลิก</Text>
        </Pressable>
        <Pressable
          disabled={!canConfirm || submitting}
          onPress={onConfirm}
          android_ripple={{color: 'rgba(255,255,255,0.25)'}}
          style={({pressed}) => [
            styles.confirmBtn,
            !canConfirm && styles.confirmDisabled,
            pressed && canConfirm && styles.pressed,
          ]}>
          {canConfirm && <GradientBg from={C.success} to={C.successDark} horizontal steps={20} />}
          <Text style={[styles.confirmTxt, !canConfirm && {color: C.sub}]}>
            {submitting ? 'กำลังบันทึก...' : 'ยืนยันการชำระเงิน'}
          </Text>
        </Pressable>
      </View>

      {/* Success overlay (เตรียมไว้ — แสดงเมื่อ ENABLE_SUCCESS_ANIM = true) */}
      {showSuccess && (
        <Animated.View style={[styles.successOverlay, {opacity: successOpacity}]}>
          <Animated.View style={[styles.successCircle, {transform: [{scale: successScale}]}]}>
            <View style={styles.successCheck} />
          </Animated.View>
          <Text style={styles.successTxt}>ชำระเงินสำเร็จ</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

/* ───────────── Small components ───────────── */
const SumRow = ({
  label,
  value,
  bold,
  color,
}: {
  label: string;
  value: string;
  bold?: boolean;
  color?: string;
}) => (
  <View style={styles.sumRow}>
    <Text style={[styles.sumLabel, bold && styles.sumBold]}>{label}</Text>
    <Text style={[styles.sumVal, bold && styles.sumBold, color ? {color} : null]}>{value}</Text>
  </View>
);

const SegBtn = ({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) => (
  <Pressable onPress={onPress} style={[styles.segBtn, active && styles.segBtnActive]}>
    <Text style={[styles.segTxt, active && styles.segTxtActive]}>{label}</Text>
  </Pressable>
);

/* ───────────── Styles ───────────── */
const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: C.bg},
  scroll: {paddingBottom: 24},

  /* Header */
  header: {
    minHeight: 220,
    overflow: 'hidden',
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 24,
    borderBottomLeftRadius: RADIUS,
    borderBottomRightRadius: RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: C.border,
  },
  headerTopRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  shieldWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(34,197,94,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shield: {
    width: 22,
    height: 26,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: C.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldCheck: {
    width: 6,
    height: 11,
    borderRightWidth: 2.5,
    borderBottomWidth: 2.5,
    borderColor: '#06210F',
    transform: [{rotate: '45deg'}, {translateY: -1}],
  },
  secureBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(34,197,94,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.45)',
  },
  secureBadgeTxt: {color: C.success, fontSize: 13, fontWeight: '700'},
  headerSub: {color: C.sub, fontSize: 14, marginTop: 14},
  totalBig: {color: C.text, fontSize: 56, fontWeight: '800', marginTop: 2, maxWidth: '100%'},
  headerBill: {color: C.sub, fontSize: 13, marginTop: 8},

  body: {padding: GAP, gap: GAP},

  card: {
    backgroundColor: C.card,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    gap: 12,
  },
  cardTitle: {color: C.text, fontSize: 17, fontWeight: '700'},
  empty: {color: C.sub, fontSize: 14},

  /* Items */
  itemRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 4},
  itemName: {color: C.text, fontSize: 17, fontWeight: '700'},
  itemQty: {color: C.sub, fontSize: 13, marginTop: 2},
  itemAmt: {color: C.text, fontSize: 16, fontWeight: '700'},
  thinDivider: {height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: 8},
  divider: {height: 1, backgroundColor: C.border},

  sumRow: {flexDirection: 'row', justifyContent: 'space-between'},
  sumLabel: {color: C.sub, fontSize: 14},
  sumVal: {color: C.text, fontSize: 14, fontWeight: '600'},
  sumBold: {color: C.text, fontSize: 18, fontWeight: '800'},

  segment: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: C.border,
    padding: 4,
  },
  segBtn: {flex: 1, paddingVertical: 14, borderRadius: RADIUS - 4, alignItems: 'center'},
  segBtnActive: {backgroundColor: C.accent},
  segTxt: {color: C.sub, fontSize: 16, fontWeight: '700'},
  segTxtActive: {color: '#0B1324'},

  /* Cash */
  receivedBox: {
    backgroundColor: C.bg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
  },
  receivedVal: {color: C.text, fontSize: 30, fontWeight: '800', marginTop: 2},

  quickWrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  quickWrapBtn: {
    flexBasis: '30%',
    flexGrow: 1,
    borderRadius: 16,
    backgroundColor: C.card,
    shadowColor: C.accent,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
  },
  quickBtn: {
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.accent,
    alignItems: 'center',
    overflow: 'hidden',
  },
  quickTxt: {color: C.accent, fontSize: 17, fontWeight: '800'},
  ghostBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    overflow: 'hidden',
  },
  ghostTxt: {color: C.sub, fontSize: 15, fontWeight: '600'},

  changeBox: {
    backgroundColor: C.bg,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  changeVal: {fontSize: 30, fontWeight: '800', marginTop: 2},

  /* PromptPay */
  qrTitleRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dynBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,138,0,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,138,0,0.5)',
  },
  dynBadgeTxt: {color: C.accent, fontSize: 12, fontWeight: '700'},
  glowOuter: {
    marginTop: 8,
    padding: 12,
    borderRadius: 36,
    backgroundColor: 'rgba(255,138,0,0.06)',
    shadowColor: C.accent,
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: {width: 0, height: 0},
    elevation: 10,
  },
  glowMid: {
    padding: 10,
    borderRadius: 28,
    backgroundColor: 'rgba(255,138,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,138,0,0.35)',
  },
  qrBox: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
  },
  qrAmt: {color: C.text, fontSize: 22, fontWeight: '800', marginTop: 4},
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,138,0,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,138,0,0.4)',
  },
  statusPillOk: {
    backgroundColor: 'rgba(34,197,94,0.14)',
    borderColor: 'rgba(34,197,94,0.5)',
  },
  checking: {color: C.sub, fontSize: 13},
  dot: {width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent},
  statusTxt: {color: C.accent, fontSize: 14, fontWeight: '700'},
  refBox: {
    alignSelf: 'stretch',
    backgroundColor: C.bg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    alignItems: 'center',
  },
  refVal: {color: C.accent, fontSize: 18, fontWeight: '800', marginTop: 2},
  proto: {color: C.sub, fontSize: 12, textAlign: 'center'},

  /* Bottom */
  bottom: {
    flexDirection: 'row',
    gap: 12,
    padding: GAP,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.bg,
  },
  cancelBtn: {
    flex: 1,
    height: BTN_HEIGHT,
    borderRadius: BTN_RADIUS,
    backgroundColor: C.grayBtn,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cancelTxt: {color: C.text, fontSize: 16, fontWeight: '700'},
  confirmBtn: {
    flex: 2,
    height: BTN_HEIGHT,
    borderRadius: BTN_RADIUS,
    backgroundColor: C.success,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  confirmDisabled: {backgroundColor: '#334155', borderWidth: 1, borderColor: C.border},
  confirmTxt: {color: '#06210F', fontSize: 16, fontWeight: '800'},

  pressed: {opacity: 0.85},

  /* Success overlay */
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,19,36,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  successCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: C.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successCheck: {
    width: 26,
    height: 48,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderColor: '#06210F',
    transform: [{rotate: '45deg'}, {translateY: -4}],
  },
  successTxt: {color: C.text, fontSize: 20, fontWeight: '800'},
});
