import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';

const MENU = [
  { key: 'Purchasing', label: 'จัดซื้อ / ซัพพลายเออร์', icon: '📦' },
  { key: 'SalesHistory', label: 'ประวัติการขาย', icon: '🧾' },
  { key: 'Employees', label: 'พนักงาน', icon: '👤' },
  { key: 'Settings', label: 'ตั้งค่า', icon: '⚙️' },
];

export default function MoreScreen() {
  const navigation = useNavigation<any>();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>เพิ่มเติม</Text>
      <FlatList
        data={MENU}
        keyExtractor={m => m.key}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate(item.key)}>
            <Text style={styles.icon}>{item.icon}</Text>
            <Text style={styles.label}>{item.label}</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6', padding: 12 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 10, marginBottom: 8 },
  icon: { fontSize: 18, marginRight: 12 },
  label: { flex: 1, fontSize: 15, fontWeight: '500' },
  chevron: { color: '#9CA3AF', fontSize: 18 },
});
