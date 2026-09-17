import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import {
  listProducts, upsertProduct, adjustStock, listCategories, upsertCategory,
  listVariants, upsertVariant, deleteVariant,
} from '../db/repository';

export default function InventoryScreen() {
  const { employee } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [restockTarget, setRestockTarget] = useState<any | null>(null);
  const [restockQty, setRestockQty] = useState('');
  const [restockCost, setRestockCost] = useState('');
  const [variantTarget, setVariantTarget] = useState<any | null>(null);
  const [variants, setVariants] = useState<any[]>([]);
  const [newVariantName, setNewVariantName] = useState('');
  const [newVariantPrice, setNewVariantPrice] = useState('');

  const load = useCallback(async () => {
    if (!employee) return;
    setProducts(await listProducts(employee.store_id));
    setCategories(await listCategories());
  }, [employee]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const saveProduct = async () => {
    if (!name.trim() || !price.trim()) {
      Alert.alert('กรอกข้อมูลให้ครบ', 'ต้องมีชื่อสินค้าและราคา');
      return;
    }
    await upsertProduct({ name: name.trim(), price: parseFloat(price), category_id: categoryId ?? undefined });
    setName(''); setPrice(''); setCategoryId(null); setModalOpen(false);
    load();
  };

  const saveCategory = async () => {
    if (!newCatName.trim()) return;
    await upsertCategory({ name: newCatName.trim() });
    setNewCatName(''); setCatModalOpen(false);
    load();
  };

  const doRestock = async () => {
    if (!employee || !restockTarget || !restockQty.trim()) return;
    await adjustStock(restockTarget.id, employee.store_id, parseFloat(restockQty), 'restock');
    setRestockTarget(null); setRestockQty(''); setRestockCost('');
    load();
  };

  const openVariants = async (product: any) => {
    setVariantTarget(product);
    setVariants(await listVariants(product.id));
  };

  const addVariant = async () => {
    if (!variantTarget || !newVariantName.trim()) return;
    await upsertVariant({
      product_id: variantTarget.id,
      name: newVariantName.trim(),
      price: newVariantPrice.trim() ? parseFloat(newVariantPrice) : undefined,
    });
    setNewVariantName(''); setNewVariantPrice('');
    setVariants(await listVariants(variantTarget.id));
  };

  const removeVariant = async (id: string) => {
    if (!variantTarget) return;
    await deleteVariant(id);
    setVariants(await listVariants(variantTarget.id));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>คลังสินค้า</Text>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity style={[styles.addBtn, styles.secondaryBtn]} onPress={() => setCatModalOpen(true)}>
            <Text style={styles.addBtnText}>+ หมวดหมู่</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => setModalOpen(true)}>
            <Text style={styles.addBtnText}>+ เพิ่มสินค้า</Text>
          </TouchableOpacity>
        </View>
      </View>
      <FlatList
        data={products}
        keyExtractor={i => i.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowMeta}>
                ฿{item.price.toFixed(2)} · คงเหลือ {item.quantity ?? 0}
                {item.category_name ? ` · ${item.category_name}` : ''}
              </Text>
            </View>
            <TouchableOpacity style={styles.restockBtn} onPress={() => setRestockTarget(item)}>
              <Text style={styles.restockText}>รับสต็อก</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.restockBtn, styles.variantBtn]} onPress={() => openVariants(item)}>
              <Text style={styles.restockText}>ตัวเลือก</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีสินค้า กดปุ่ม "+ เพิ่มสินค้า" เพื่อเริ่มต้น</Text>}
      />

      <Modal visible={modalOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>เพิ่มสินค้าใหม่</Text>
            <TextInput style={styles.input} placeholder="ชื่อสินค้า" value={name} onChangeText={setName} />
            <TextInput style={styles.input} placeholder="ราคา" value={price} onChangeText={setPrice} keyboardType="numeric" />
            <Text style={styles.label}>หมวดหมู่</Text>
            <FlatList
              horizontal
              data={categories}
              keyExtractor={c => c.id}
              style={{ marginBottom: 12 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.catChip, categoryId === item.id && styles.catChipActive]}
                  onPress={() => setCategoryId(categoryId === item.id ? null : item.id)}>
                  <Text style={[styles.catChipText, categoryId === item.id && styles.catChipTextActive]}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setModalOpen(false)}><Text style={styles.cancel}>ยกเลิก</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveProduct}><Text style={styles.saveText}>บันทึก</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={catModalOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>เพิ่มหมวดหมู่</Text>
            <TextInput style={styles.input} placeholder="ชื่อหมวดหมู่" value={newCatName} onChangeText={setNewCatName} />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setCatModalOpen(false)}><Text style={styles.cancel}>ยกเลิก</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveCategory}><Text style={styles.saveText}>บันทึก</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!restockTarget} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>รับสต็อก: {restockTarget?.name}</Text>
            <TextInput style={styles.input} placeholder="จำนวนที่รับเข้า" value={restockQty} onChangeText={setRestockQty} keyboardType="numeric" />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setRestockTarget(null)}><Text style={styles.cancel}>ยกเลิก</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={doRestock}><Text style={styles.saveText}>บันทึก</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!variantTarget} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>ตัวเลือกสินค้า: {variantTarget?.name}</Text>
            <FlatList
              data={variants}
              keyExtractor={v => v.id}
              style={{ maxHeight: 160, marginBottom: 10 }}
              renderItem={({ item }) => (
                <View style={styles.variantRow}>
                  <Text style={{ flex: 1, fontSize: 13 }}>{item.name}</Text>
                  <Text style={{ fontSize: 13, color: '#F59E0B', marginRight: 10 }}>
                    {item.price != null ? `฿${item.price.toFixed(2)}` : 'ราคาเดียวกับสินค้าหลัก'}
                  </Text>
                  <TouchableOpacity onPress={() => removeVariant(item.id)}>
                    <Text style={{ color: '#DC2626', fontSize: 12 }}>ลบ</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีตัวเลือก เช่น ไซส์ S/M/L</Text>}
            />
            <TextInput style={styles.input} placeholder="ชื่อตัวเลือก เช่น ไซส์ M" value={newVariantName} onChangeText={setNewVariantName} />
            <TextInput style={styles.input} placeholder="ราคา (เว้นว่างถ้าใช้ราคาเดียวกับสินค้าหลัก)" value={newVariantPrice} onChangeText={setNewVariantPrice} keyboardType="numeric" />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setVariantTarget(null)}><Text style={styles.cancel}>ปิด</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={addVariant}><Text style={styles.saveText}>เพิ่มตัวเลือก</Text></TouchableOpacity>
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
  addBtn: { backgroundColor: '#F59E0B', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginLeft: 8 },
  secondaryBtn: { backgroundColor: '#111827' },
  addBtnText: { color: '#fff', fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 8 },
  rowName: { fontWeight: '600' },
  rowMeta: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  restockBtn: { backgroundColor: '#111827', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  variantBtn: { backgroundColor: '#374151', marginLeft: 6 },
  restockText: { color: '#fff', fontSize: 12 },
  empty: { color: '#9CA3AF', textAlign: 'center', marginTop: 40 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '85%' },
  modalTitle: { fontWeight: '700', fontSize: 16, marginBottom: 12 },
  label: { fontSize: 12, color: '#6B7280', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 10, marginBottom: 10 },
  catChip: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 },
  catChipActive: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  catChipText: { fontSize: 12, color: '#374151' },
  catChipTextActive: { color: '#fff' },
  variantRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  cancel: { color: '#6B7280', marginRight: 20, paddingVertical: 10 },
  saveBtn: { backgroundColor: '#F59E0B', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  saveText: { color: '#fff', fontWeight: '700' },
});
