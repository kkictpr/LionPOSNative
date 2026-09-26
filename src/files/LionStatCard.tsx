import React from 'react';
import { StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import LionCard from './LionCard';
import { colors, StatusTone, toneColor } from './tokens';

type Props = {
  label: string;
  value: string;
  /** ข้อความเล็กใต้ตัวเลข เช่น "+12%" */
  delta?: string;
  /** ระบายสีตัวเลขตามสถานะ */
  tone?: StatusTone;
  style?: StyleProp<ViewStyle>;
};

export default function LionStatCard({ label, value, delta, tone, style }: Props) {
  return (
    <LionCard style={[styles.card, style]}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.value, tone ? { color: toneColor[tone] } : null]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}>
        {value}
      </Text>
      {delta ? <Text style={styles.delta}>{delta}</Text> : null}
    </LionCard>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, paddingVertical: 14, paddingHorizontal: 12 },
  label: { fontSize: 12, color: colors.textMuted, marginBottom: 6 },
  value: { fontSize: 22, fontWeight: '800', color: colors.text },
  delta: { fontSize: 11, fontWeight: '700', color: colors.success, marginTop: 4 },
});
