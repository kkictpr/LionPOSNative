import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listCustomers, upsertCustomer } from '../db/repository';

export default function CustomersScreen() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const load = useCallback(async () => setCustomers(await listCustomers()), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!name.trim()) return;
    await upsertCustomer({ name: name.trim(), phone: phone.trim() || undefined });
    setName(''); setPhone(''); setModalOpen(false);
    load();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ลูกค้า / สะสมแต้ม</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalOpen(true)}>
          <Text style={styles.addBtnText}>+ เพิ่มลูกค้า</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={customers}
        keyExtractor={i => i.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowMeta}>{item.phone ?? '-'}</Text>
            </View>
            <Text style={styles.points}>{item.points} แต้ม</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีลูกค้า</Text>}
      />
      <Modal visible={modalOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>เพิ่มลูกค้าใหม่</Text>
            <TextInput style={styles.input} placeholder="ชื่อลูกค้า" value={name} onChangeText={setName} />
            <TextInput style={styles.input} placeholder="เบอร์โทร (ไม่บังคับ)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setModalOpen(false)}><Text style={styles.cancel}>ยกเลิก</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={save}><Text style={styles.saveText}>บันทึก</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6', padding: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  addBtn: { backgroundColor: '#F59E0B', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: '#fff', fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 8 },
  rowName: { fontWeight: '600' },
  rowMeta: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  points: { color: '#F59E0B', fontWeight: '700' },
  empty: { color: '#9CA3AF', textAlign: 'center', marginTop: 40 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '85%' },
  modalTitle: { fontWeight: '700', fontSize: 16, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 10, marginBottom: 10 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  cancel: { color: '#6B7280', marginRight: 20, paddingVertical: 10 },
  saveBtn: { backgroundColor: '#F59E0B', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  saveText: { color: '#fff', fontWeight: '700' },
});
