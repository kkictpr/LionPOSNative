import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { alpha, colors, StatusTone, toneColor } from './tokens';

type Props = {
  label: string;
  active?: boolean;
  /** ถ้าไม่ส่ง onPress จะเป็น badge (แสดงผลอย่างเดียว) */
  onPress?: () => void;
  /** ใช้สีสถานะ: success/warning/danger/promo/info */
  tone?: StatusTone;
  style?: StyleProp<ViewStyle>;
};

export default function LionChip({ label, active, onPress, tone, style }: Props) {
  const tint = tone ? toneColor[tone] : undefined;
  const bg = tint ? alpha(tint, 0.16) : active ? colors.primary : colors.surface;
  const border = tint ? alpha(tint, 0.45) : active ? colors.primary : 'rgba(148,163,184,0.3)';
  const fg = tint ?? (active ? colors.onPrimary : colors.text);

  const text = <Text style={[styles.text, { color: fg }]}>{label}</Text>;

  if (!onPress) {
    return (
      <View style={[styles.base, styles.badge, { backgroundColor: bg, borderColor: border }, style]}>
        {text}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
      style={[styles.base, styles.pill, { backgroundColor: bg, borderColor: border }, style]}>
      {text}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  /** visual 40 + hitSlop 4+4 = พื้นที่แตะ 48dp */
  pill: { height: 40, paddingHorizontal: 16, marginRight: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 3 },
  text: { fontSize: 12, fontWeight: '700' },
});
