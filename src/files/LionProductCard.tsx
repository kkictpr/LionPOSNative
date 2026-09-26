import React, { useRef } from 'react';
import { Animated, Image, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import LionChip from './LionChip';
import { colors, motion, radius, shadow, stockStatus } from './tokens';
import { formatBaht } from './useResponsive';

type Props = {
  name: string;
  price: number;
  quantity?: number | null;
  imageUri?: string | null;
  /** ส่งมาเมื่อต้องการแสดง ต้นทุน/กำไร (หน้าคลังสินค้า) */
  cost?: number | null;
  showProfit?: boolean;
  categoryName?: string | null;
  /** POS เดิมรูปอยู่ขวา (ค่าเริ่มต้น) — คลังสินค้าวางซ้ายตามบอร์ดดีไซน์ */
  imageSide?: 'left' | 'right';
  imageSize?: number;
  onPress?: () => void;
  /** พื้นที่ด้านล่างการ์ด เช่น แถวปุ่ม รับสต็อก/แก้ไข/ลบ */
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function LionProductCard({
  name,
  price,
  quantity,
  imageUri,
  cost,
  showProfit,
  categoryName,
  imageSide = 'right',
  imageSize = 52,
  onPress,
  footer,
  style,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const animateTo = (toValue: number) =>
    Animated.timing(scale, { toValue, duration: motion.fast, useNativeDriver: true }).start();

  const status = stockStatus(quantity);
  const profit = price - (cost ?? 0);

  return (
    <Animated.View style={[styles.card, { transform: [{ scale }] }, style]}>
      <Pressable
        disabled={!onPress}
        onPress={onPress}
        onPressIn={() => animateTo(0.98)}
        onPressOut={() => animateTo(1)}
        android_ripple={{ color: 'rgba(245,158,11,0.18)' }}
        style={[styles.row, imageSide === 'left' && styles.rowReverse]}>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          <Text style={styles.price}>{formatBaht(price, 2)}</Text>
          {showProfit ? (
            <Text style={styles.meta}>
              ต้นทุน {formatBaht(cost ?? 0, 2)} · <Text style={styles.profit}>กำไร {formatBaht(profit, 2)}</Text>
            </Text>
          ) : null}
          <View style={styles.stockRow}>
            <LionChip label={status.label} tone={status.tone} />
            <Text style={styles.stock}>คงเหลือ {quantity ?? 0}</Text>
            {categoryName ? <Text style={styles.stock}> · {categoryName}</Text> : null}
          </View>
        </View>

        <View style={[styles.imageBox, { width: imageSize, height: imageSize }]}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
          ) : (
            <Text style={styles.placeholder}>🖼️</Text>
          )}
        </View>
      </Pressable>
      {footer}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
    overflow: 'hidden',
    ...shadow.soft,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 64 },
  rowReverse: { flexDirection: 'row-reverse' },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  price: { fontSize: 15, fontWeight: '800', color: colors.primary, marginTop: 2 },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  profit: { color: colors.success, fontWeight: '700' },
  stockRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 6, gap: 8 },
  stock: { fontSize: 12, color: colors.textMuted },
  imageBox: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  placeholder: { fontSize: 18 },
});
