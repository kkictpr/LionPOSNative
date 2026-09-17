import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import {
  listSuppliers, upsertSupplier, listPurchaseOrders, createPurchaseOrder,
  listProducts, POLine,
} from '../db/repository';

export default function PurchasingScreen() {
  const { employee } = useAuth();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');

  const [poModalOpen, setPoModalOpen] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState<string | null>(null);
  const [poLines, setPoLines] = useState<POLine[]>([]);

  const load = useCallback(async () => {
    if (!employee) return;
    setSuppliers(await listSuppliers());
    setOrders(await listPurchaseOrders(employee.store_id));
    setProducts(await listProducts(employee.store_id));
  }, [employee]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const saveSupplier = async () => {
    if (!supplierName.trim()) return;
    await upsertSupplier({ name: supplierName.trim(), phone: supplierPhone.trim() || undefined });
    setSupplierName(''); setSupplierPhone(''); setSupplierModalOpen(false);
    load();
  };

  const addPOLine = (p: any) => {
    setPoLines(prev => {
      const existing = prev.find(l => l.product_id === p.id);
      if (existing) return prev.map(l => l.product_id === p.id ? { ...l, quantity: l.quantity + 1 } : l);
      return [...prev, { product_id: p.id, quantity: 1, unit_cost: p.cost || 0 }];
    });
  };

  const savePO = async () => {
    if (!employee || poLines.length === 0) {
      Alert.alert('เลือกสินค้าก่อน', 'ต้องมีอย่างน้อย 1 รายการในใบสั่งซื้อ');
      return;
    }
    const result = await createPurchaseOrder({
      storeId: employee.store_id,
      supplierId: poSupplierId ?? undefined,
      items: poLines,
    });
    Alert.alert('รับสต็อกสำเร็จ', `เลขที่ใบสั่งซื้อ ${result.poNo}\nมูลค่ารวม ฿${result.totalCost.toFixed(2)}`);
    setPoLines([]); setPoSupplierId(null); setPoModalOpen(false);
    load();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ซัพพลายเออร์ / ใบสั่งซื้อ</Text>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity style={[styles.addBtn, styles.secondaryBtn]} onPress={() => setSupplierModalOpen(true)}>
            <Text style={styles.addBtnText}>+ ซัพพลายเออร์</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => setPoModalOpen(true)}>
            <Text style={styles.addBtnText}>+ ใบสั่งซื้อ</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.sectionTitle}>ใบสั่งซื้อล่าสุด</Text>
      <FlatList
        data={orders}
        keyExtractor={i => i.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowName}>{item.po_no} {item.supplier_name ? `· ${item.supplier_name}` : ''}</Text>
            <Text style={styles.rowMeta}>มูลค่า ฿{item.total_cost.toFixed(2)} · {new Date(item.created_at).toLocaleDateString('th-TH')}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีใบสั่งซื้อ</Text>}
      />

      <Modal visible={supplierModalOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>เพิ่มซัพพลายเออร์</Text>
            <TextInput style={styles.input} placeholder="ชื่อซัพพลายเออร์" value={supplierName} onChangeText={setSupplierName} />
            <TextInput style={styles.input} placeholder="เบอร์โทร (ไม่บังคับ)" value={supplierPhone} onChangeText={setSupplierPhone} keyboardType="phone-pad" />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setSupplierModalOpen(false)}><Text style={styles.cancel}>ยกเลิก</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveSupplier}><Text style={styles.saveText}>บันทึก</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={poModalOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>สร้างใบสั่งซื้อ (รับสต็อก)</Text>
            <Text style={styles.label}>ซัพพลายเออร์</Text>
            <FlatList
              horizontal
              data={suppliers}
              keyExtractor={s => s.id}
              style={{ marginBottom: 10 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.catChip, poSupplierId === item.id && styles.catChipActive]}
                  onPress={() => setPoSupplierId(poSupplierId === item.id ? null : item.id)}>
                  <Text style={[styles.catChipText, poSupplierId === item.id && styles.catChipTextActive]}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
            <Text style={styles.label}>เลือกสินค้า (แตะเพื่อเพิ่ม)</Text>
            <FlatList
              data={products}
              keyExtractor={p => p.id}
              style={{ maxHeight: 140, marginBottom: 10 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.productPick} onPress={() => addPOLine(item)}>
                  <Text style={styles.productPickText}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
            {poLines.map((l, idx) => {
              const p = products.find(pr => pr.id === l.product_id);
              return (
                <View key={idx} style={styles.poLine}>
                  <Text style={{ flex: 1, fontSize: 12 }}>{p?.name}</Text>
                  <TextInput
                    style={styles.poQtyInput}
                    value={String(l.quantity)}
                    keyboardType="numeric"
                    onChangeText={v => setPoLines(prev => prev.map((x, i) => i === idx ? { ...x, quantity: parseFloat(v) || 0 } : x))}
                  />
                  <TextInput
                    style={styles.poQtyInput}
                    value={String(l.unit_cost)}
                    keyboardType="numeric"
                    onChangeText={v => setPoLines(prev => prev.map((x, i) => i === idx ? { ...x, unit_cost: parseFloat(v) || 0 } : x))}
                  />
                </View>
              );
            })}
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => { setPoModalOpen(false); setPoLines([]); }}><Text style={styles.cancel}>ยกเลิก</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={savePO}><Text style={styles.saveText}>รับสต็อก</Text></TouchableOpacity>
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
  title: { fontSize: 18, fontWeight: '700' },
  addBtn: { backgroundColor: '#F59E0B', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginLeft: 8 },
  secondaryBtn: { backgroundColor: '#111827' },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  sectionTitle: { fontWeight: '700', fontSize: 14, marginBottom: 8 },
  row: { backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 8 },
  rowName: { fontWeight: '600' },
  rowMeta: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  empty: { color: '#9CA3AF', textAlign: 'center', marginTop: 20 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '90%' },
  modalTitle: { fontWeight: '700', fontSize: 16, marginBottom: 12 },
  label: { fontSize: 12, color: '#6B7280', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 10, marginBottom: 10 },
  catChip: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 },
  catChipActive: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  catChipText: { fontSize: 12, color: '#374151' },
  catChipTextActive: { color: '#fff' },
  productPick: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  productPickText: { fontSize: 13 },
  poLine: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  poQtyInput: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 6, width: 56, textAlign: 'center', marginLeft: 6, paddingVertical: 4 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  cancel: { color: '#6B7280', marginRight: 20, paddingVertical: 10 },
  saveBtn: { backgroundColor: '#F59E0B', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  saveText: { color: '#fff', fontWeight: '700' },
});
