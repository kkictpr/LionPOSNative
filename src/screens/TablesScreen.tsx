import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { listTables, upsertTable, getOpenTicketForTable, openTicket } from '../db/repository';

export default function TablesScreen() {
  const { employee } = useAuth();
  const navigation = useNavigation<any>();
  const [tables, setTables] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    if (!employee) return;
    setTables(await listTables(employee.store_id));
  }, [employee]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addTable = async () => {
    if (!employee || !name.trim()) return;
    await upsertTable({ store_id: employee.store_id, name: name.trim() });
    setName(''); setModalOpen(false);
    load();
  };

  const openTable = async (table: any) => {
    if (!employee) return;
    let ticket = await getOpenTicketForTable(table.id);
    let saleId = ticket?.id;
    if (!saleId) {
      saleId = await openTicket({ storeId: employee.store_id, employeeId: employee.id, tableId: table.id });
    }
    navigation.navigate('TableOrder', { tableId: table.id, tableName: table.name, saleId });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>โต๊ะ</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalOpen(true)}>
          <Text style={styles.addBtnText}>+ เพิ่มโต๊ะ</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={tables}
        numColumns={3}
        keyExtractor={t => t.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.tableCard, item.status === 'occupied' && styles.tableOccupied]}
            onPress={() => openTable(item)}>
            <Text style={[styles.tableName, item.status === 'occupied' && styles.tableNameOccupied]}>{item.name}</Text>
            <Text style={[styles.tableStatus, item.status === 'occupied' && styles.tableNameOccupied]}>
              {item.status === 'occupied' ? 'มีลูกค้า' : 'ว่าง'}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีโต๊ะ กดปุ่ม "+ เพิ่มโต๊ะ" เพื่อเริ่มต้น</Text>}
      />
      <Modal visible={modalOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>เพิ่มโต๊ะใหม่</Text>
            <TextInput style={styles.input} placeholder="ชื่อโต๊ะ เช่น โต๊ะ 1" value={name} onChangeText={setName} />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setModalOpen(false)}><Text style={styles.cancel}>ยกเลิก</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={addTable}><Text style={styles.saveText}>บันทึก</Text></TouchableOpacity>
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
  tableCard: { flex: 1, margin: 6, backgroundColor: '#fff', borderRadius: 10, padding: 16, minHeight: 80, alignItems: 'center', justifyContent: 'center' },
  tableOccupied: { backgroundColor: '#DC2626' },
  tableName: { fontWeight: '700', fontSize: 15 },
  tableNameOccupied: { color: '#fff' },
  tableStatus: { fontSize: 11, color: '#6B7280', marginTop: 4 },
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
