import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { listEmployees, upsertEmployee } from '../db/repository';

const ROLES = ['owner', 'manager', 'cashier'];

export default function EmployeesScreen() {
  const { employee } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState('cashier');

  const load = useCallback(async () => setEmployees(await listEmployees()), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!name.trim() || pin.length < 4 || !employee) return;
    await upsertEmployee({ name: name.trim(), pin, role, store_id: employee.store_id });
    setName(''); setPin(''); setRole('cashier'); setModalOpen(false);
    load();
  };

  const canManage = employee?.role === 'owner' || employee?.role === 'manager';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>พนักงาน</Text>
        {canManage && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setModalOpen(true)}>
            <Text style={styles.addBtnText}>+ เพิ่มพนักงาน</Text>
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={employees}
        keyExtractor={i => i.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowMeta}>{roleLabel(item.role)}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีพนักงาน</Text>}
      />
      <Modal visible={modalOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>เพิ่มพนักงานใหม่</Text>
            <TextInput style={styles.input} placeholder="ชื่อพนักงาน" value={name} onChangeText={setName} />
            <TextInput style={styles.input} placeholder="PIN (4-6 หลัก)" value={pin} onChangeText={setPin} keyboardType="numeric" secureTextEntry />
            <View style={styles.roleRow}>
              {ROLES.map(r => (
                <TouchableOpacity key={r} style={[styles.roleChip, role === r && styles.roleChipActive]} onPress={() => setRole(r)}>
                  <Text style={[styles.roleChipText, role === r && styles.roleChipTextActive]}>{roleLabel(r)}</Text>
                </TouchableOpacity>
              ))}
            </View>
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

function roleLabel(r: string) {
  return { owner: 'เจ้าของร้าน', manager: 'ผู้จัดการ', cashier: 'แคชเชียร์' }[r] ?? r;
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
  empty: { color: '#9CA3AF', textAlign: 'center', marginTop: 40 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '85%' },
  modalTitle: { fontWeight: '700', fontSize: 16, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 10, marginBottom: 10 },
  roleRow: { flexDirection: 'row', marginBottom: 10 },
  roleChip: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 },
  roleChipActive: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  roleChipText: { fontSize: 12, color: '#374151' },
  roleChipTextActive: { color: '#fff' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  cancel: { color: '#6B7280', marginRight: 20, paddingVertical: 10 },
  saveBtn: { backgroundColor: '#F59E0B', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  saveText: { color: '#fff', fontWeight: '700' },
});
