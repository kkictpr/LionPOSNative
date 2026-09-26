import React, { useEffect, useRef } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors, motion, radius, shadow } from './tokens';

type Props = {
  visible: boolean;
  onRequestClose?: () => void;
  title?: string;
  /** ตัวอย่าง: ปุ่ม ✕ ด้านขวาของหัวข้อ */
  headerRight?: React.ReactNode;
  /** true = เนื้อหาเลื่อนได้ (อย่าใช้ถ้าข้างในมี FlatList แนวตั้ง) */
  scroll?: boolean;
  cardStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export default function LionModal({
  visible,
  onRequestClose,
  title,
  headerRight,
  scroll,
  cardStyle,
  children,
}: Props) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: motion.base, useNativeDriver: true }).start();
    }
  }, [visible, anim]);

  const cardAnim = {
    opacity: anim,
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onRequestClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[styles.card, cardAnim, cardStyle]}>
          {title || headerRight ? (
            <View style={styles.header}>
              <Text style={styles.title} numberOfLines={2}>
                {title}
              </Text>
              {headerRight}
            </View>
          ) : null}
          {scroll ? (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '92%',
    maxWidth: 520,
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderRadius: radius.modal,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.15)',
    padding: 20,
    ...shadow.soft,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: colors.text },
});
