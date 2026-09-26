import React, { useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import LionGradient from './LionGradient';
import { colors, motion, radius, shadow, TOUCH } from './tokens';

export type LionButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: LionButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  /** style ของ wrapper ด้านนอก (flex, margin ฯลฯ) */
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
};

export default function LionButton({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  textStyle,
  testID,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const animateTo = (toValue: number) =>
    Animated.timing(scale, { toValue, duration: motion.fast, useNativeDriver: true }).start();

  const inactive = !!disabled || !!loading;
  const isPrimary = variant === 'primary';

  return (
    <Animated.View
      style={[
        styles.outer,
        isPrimary && styles.outerPrimary,
        isPrimary && !inactive && shadow.glow,
        inactive && styles.inactive,
        { transform: [{ scale }] },
        style,
      ]}>
      <View style={[styles.body, variantStyle[variant]]}>
        {isPrimary && (
          <LionGradient
            colors={[colors.primaryLight, colors.primary, colors.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
        )}
        <Pressable
          testID={testID}
          accessibilityRole="button"
          accessibilityState={{ disabled: inactive }}
          disabled={inactive}
          onPress={onPress}
          onPressIn={() => animateTo(0.97)}
          onPressOut={() => animateTo(1)}
          android_ripple={{ color: 'rgba(255,255,255,0.22)' }}
          style={styles.press}>
          {loading ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text
              numberOfLines={2}
              style={[styles.text, variant === 'ghost' && styles.ghostText, textStyle]}>
              {title}
            </Text>
          )}
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: { borderRadius: radius.button },
  outerPrimary: { backgroundColor: colors.primary },
  inactive: { opacity: 0.45 },
  body: {
    minHeight: TOUCH,
    borderRadius: radius.button,
    overflow: 'hidden',
  },
  press: {
    minHeight: TOUCH,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: colors.onPrimary, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  ghostText: { color: colors.textMuted, fontWeight: '600' },
});

const variantStyle = StyleSheet.create({
  primary: {},
  secondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
  },
  danger: { backgroundColor: colors.danger },
  ghost: { backgroundColor: 'transparent' },
});
