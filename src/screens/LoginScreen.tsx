import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','del'];

export default function LoginScreen() {
  const [pin, setPin] = useState('');
  const { loginWithPin } = useAuth();

  const press = async (key: string) => {
    if (key === '') return;
    if (key === 'del') {
      setPin(p => p.slice(0, -1));
      return;
    }
    const next = (pin + key).slice(0, 6);
    setPin(next);
    if (next.length >= 4) {
      const ok = await loginWithPin(next);
      if (!ok && next.length === 6) {
        Alert.alert('PIN ไม่ถูกต้อง', 'กรุณาลองใหม่');
        setPin('');
      } else if (ok) {
        setPin('');
      }
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🦁 LionPOS</Text>
      <Text style={styles.subtitle}>กรอกรหัส PIN เพื่อเข้าสู่ระบบ</Text>
      <View style={styles.dots}>
        {[0,1,2,3].map(i => (
          <View key={i} style={[styles.dot, pin.length > i && styles.dotFilled]} />
        ))}
      </View>
      <View style={styles.keypad}>
        {KEYS.map((k, idx) => (
          <TouchableOpacity
            key={idx}
            style={styles.key}
            disabled={k === ''}
            onPress={() => press(k)}>
            <Text style={styles.keyText}>{k === 'del' ? '⌫' : k}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.hint}>PIN เริ่มต้นของเจ้าของร้าน: 1234</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  logo: { fontSize: 32, fontWeight: '700', color: '#fff', marginBottom: 4 },
  subtitle: { color: '#9CA3AF', marginBottom: 24 },
  dots: { flexDirection: 'row', marginBottom: 32 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: '#9CA3AF', marginHorizontal: 8 },
  dotFilled: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: 260, justifyContent: 'center' },
  key: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', margin: 6, backgroundColor: '#1F2937' },
  keyText: { color: '#fff', fontSize: 24, fontWeight: '600' },
  hint: { color: '#4B5563', marginTop: 24, fontSize: 12 },
});
