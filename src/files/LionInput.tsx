import React, { useState } from 'react';
import {
  NativeSyntheticEvent,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputFocusEventData,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, TOUCH } from './tokens';

type Props = TextInputProps & {
  label?: string;
  /** emoji/ข้อความสั้น ๆ ด้านซ้าย เช่น 🔍 */
  icon?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export default function LionInput({ label, icon, containerStyle, style, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);

  const handleFocus = (e: NativeSyntheticEvent<TextInputFocusEventData>) => {
    setFocused(true);
    onFocus?.(e);
  };
  const handleBlur = (e: NativeSyntheticEvent<TextInputFocusEventData>) => {
    setFocused(false);
    onBlur?.(e);
  };

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.field, focused && styles.fieldFocused]}>
        {icon ? <Text style={styles.icon}>{icon}</Text> : null}
        <TextInput
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          {...rest}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={[styles.input, style]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  label: { fontSize: 12, color: colors.textMuted, marginBottom: 6 },
  field: {
    minHeight: TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
  },
  fieldFocused: { borderColor: colors.primary },
  icon: { fontSize: 14, marginRight: 8 },
  input: {
    flex: 1,
    minHeight: TOUCH - 2,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
});
