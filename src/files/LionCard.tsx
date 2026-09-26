import React from 'react';
import { StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { colors, radius, shadow } from './tokens';

type Props = ViewProps & {
  /** surface = #1F2937 (ค่าเริ่มต้น), card = #334155 (ชั้นที่สูงกว่า) */
  tone?: 'surface' | 'card';
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function LionCard({ tone = 'surface', padded = true, style, children, ...rest }: Props) {
  return (
    <View
      {...rest}
      style={[
        styles.base,
        { backgroundColor: tone === 'card' ? colors.card : colors.surface },
        padded && styles.padded,
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
    ...shadow.soft,
  },
  padded: { padding: 16 },
});
