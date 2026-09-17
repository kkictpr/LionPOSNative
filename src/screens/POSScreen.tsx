import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import {
  listProducts, listCategories, createSale, CartLine,
  currentShift, openShift, getSetting, getStore, listVariants,
} from '../db/repository';
import { printReceipt, reconnectSavedPrinter, getSavedPrinterMac } from '../utils/printer';

export default function POSScreen() {
  const { employee } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountPct, setDiscountPct] = useState('0');
  const [taxRate, setTaxRate] = useState(0);
  const [shift, setShift] = useState<any | null>(null);
  const [openShiftModal, setOpenShiftModal] = useState(false);
  const [openingCash, setOpeningCash] = useState('');
  const [variantPickFor, setVariantPickFor] = useState<any | null>(null);
  const [variantOptions, setVariantOptions] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!employee) return;
    setProducts(await listProducts(employee.store_id));
    setCategories(await listCategories());
    setTaxRate(parseFloat((await getSetting('tax_rate')) ?? '0'));
    const s = await currentShift(employee.store_id, employee.id);
    setShift(s);
  }, [employee]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = activeCategory
    ? products.filter(p => p.category_id === activeCategory)
    : products;

  const addCartLine = (p: any, variant?: any) => {
    const key = variant ? `${p.id}:${variant.id}` : p.id;
    setCart(prev => {
      const existing = prev.find(i => (i.variant_id ? `${i.product_id}:${i.variant_id}` : i.product_id) === key);
      if (existing) {
        return prev.map(i => i === existing ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        product_id: p.id,
        variant_id: variant?.id,
        name: variant ? `${p.name} (${variant.name})` : p.name,
        quantity: 1,
        unit_price: variant?.price ?? p.price,
      }];
    });
  };

  const addToCart = async (p: any) => {
    if (!shift) { setOpenShiftModal(true); return; }
    const variants = await listVariants(p.id);
    if (variants.length > 0) {
      setVariantOptions(variants);
      setVariantPickFor(p);
      return;
    }
    addCartLine(p);
  };

  const pickVariant = (v: any) => {
    if (variantPickFor) addCartLine(variantPickFor, v);
    setVariantPickFor(null);
    setVariantOptions([]);
  };

  const changeQty = (line: CartLine, delta: number) => {
    setCart(prev => prev
      .map(i => i === line ? { ...i, quantity: i.quantity + delta } : i)
      .filter(i => i.quantity > 0));
  };

  const subtotal = cart.reduce((s, i) => s + i.quantity * i.unit_price - (i.line_discount ?? 0), 0);
  const discountAmt = subtotal * (parseFloat(discountPct || '0') / 100);
  const taxAmt = (subtotal - discountAmt) * (taxRate / 100);
  const total = subtotal - discountAmt + taxAmt;

  const doOpenShift = async () => {
    if (!employee || !openingCash.trim()) return;
    await openShift(employee.store_id, employee.id, parseFloat(openingCash));
    setOpeningCash('');
    setOpenShiftModal(false);
    load();
  };

  const checkout = async () => {
    if (!employee || cart.length === 0) return;
    if (!shift) { setOpenShiftModal(true); return; }
    try {
      const result = await createSale({
        storeId: employee.store_id,
        employeeId: employee.id,
        shiftId: shift.id,
        items: cart,
        discount: discountAmt,
        taxRate,
        paymentMethod: 'cash',
      });

      const printerMac = await getSavedPrinterMac();
      if (printerMac) {
        try {
          await reconnectSavedPrinter();
          const store = await getStore(employee.store_id);
          const footer = (await getSetting('receipt_footer')) ?? '';
          await printReceipt({
            storeName: store?.name ?? 'ร้านค้า',
            storeAddress: store?.address,
            storePhone: store?.phone,
            receiptNo: result.receiptNo,
            employeeName: employee.name,
            createdAt: new Date().toISOString(),
            items: cart.map(i => ({
              name: i.name, quantity: i.quantity, unit_price: i.unit_price,
              line_total: i.quantity * i.unit_price - (i.line_discount ?? 0),
            })),
            subtotal, discount: discountAmt, tax: taxAmt, total: result.total,
            paymentMethod: 'cash', footer,
          });
          Alert.alert('ขายสำเร็จ', `เลขที่ใบเสร็จ ${result.receiptNo}\nพิมพ์ใบเสร็จแล้ว`);
        } catch (printErr) {
          Alert.alert('พิมพ์ใบเสร็จไม่สำเร็จ', 'ขายสำเร็จแล้ว แต่พิมพ์ใบเสร็จไม่ได้ — ตรวจสอบเครื่องพิมพ์ในหน้าตั้งค่า');
        }
      } else {
        Alert.alert('ขายสำเร็จ', `เลขที่ใบเสร็จ ${result.receiptNo}\nยอดรวม ฿${result.total.toFixed(2)}`);
      }
      setCart([]);
      setDiscountPct('0');
      load();
    } catch (e: any) {
      Alert.alert('เกิดข้อผิดพลาด', String(e?.message ?? e));
    }
  };

  return (
    <View style={styles.wrap}>
      {!shift && (
        <TouchableOpacity style={styles.shiftBanner} onPress={() => setOpenShiftModal(true)}>
          <Text style={styles.shiftBannerText}>ยังไม่ได้เปิดกะ — แตะเพื่อเปิดกะและเริ่มขาย</Text>
        </TouchableOpacity>
      )}
      <View style={styles.row}>
        <View style={styles.grid}>
          <FlatList
            horizontal
            style={styles.catRow}
            data={[{ id: null, name: 'ทั้งหมด' }, ...categories]}
            keyExtractor={(item, idx) => item.id ?? `all-${idx}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.catChip, activeCategory === item.id && styles.catChipActive]}
                onPress={() => setActiveCategory(item.id)}>
                <Text style={[styles.catChipText, activeCategory === item.id && styles.catChipTextActive]}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />
          <FlatList
            data={filtered}
            numColumns={3}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.productCard} onPress={() => addToCart(item)}>
                <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
                <Text style={styles.productPrice}>฿{item.price.toFixed(2)}</Text>
                <Text style={styles.productStock}>คงเหลือ {item.quantity ?? 0}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีสินค้า — เพิ่มได้จากเมนูสต็อก</Text>}
          />
        </View>
        <View style={styles.cart}>
          <Text style={styles.cartTitle}>ตะกร้า</Text>
          <FlatList
            data={cart}
            keyExtractor={(i, idx) => i.variant_id ? `${i.product_id}:${i.variant_id}` : `${i.product_id}:${idx}`}
            renderItem={({ item }) => (
              <View style={styles.cartLine}>
                <Text style={styles.cartLineName} numberOfLines={1}>{item.name}</Text>
                <View style={styles.qtyRow}>
                  <TouchableOpacity onPress={() => changeQty(item, -1)}><Text style={styles.qtyBtn}>−</Text></TouchableOpacity>
                  <Text style={styles.qtyText}>{item.quantity}</Text>
                  <TouchableOpacity onPress={() => changeQty(item, 1)}><Text style={styles.qtyBtn}>+</Text></TouchableOpacity>
                </View>
                <Text style={styles.cartLineTotal}>฿{(item.quantity * item.unit_price).toFixed(2)}</Text>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีสินค้าในตะกร้า</Text>}
          />

          <View style={styles.discountRow}>
            <Text style={styles.discountLabel}>ส่วนลด (%)</Text>
            <TextInput
              style={styles.discountInput}
              value={discountPct}
              onChangeText={setDiscountPct}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.summaryLine}><Text style={styles.summaryLabel}>ยอดก่อนหักส่วนลด</Text><Text>฿{subtotal.toFixed(2)}</Text></View>
          <View style={styles.summaryLine}><Text style={styles.summaryLabel}>ส่วนลด</Text><Text>−฿{discountAmt.toFixed(2)}</Text></View>
          <View style={styles.summaryLine}><Text style={styles.summaryLabel}>ภาษี ({taxRate}%)</Text><Text>฿{taxAmt.toFixed(2)}</Text></View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>ยอดรวม</Text>
            <Text style={styles.totalValue}>฿{total.toFixed(2)}</Text>
          </View>
          <TouchableOpacity style={styles.checkoutBtn} onPress={checkout} disabled={cart.length === 0}>
            <Text style={styles.checkoutText}>ชำระเงิน</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={openShiftModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>เปิดกะการขาย</Text>
            <Text style={styles.modalSub}>ระบุเงินสดตั้งต้นในลิ้นชักก่อนเริ่มขาย</Text>
            <TextInput style={styles.input} placeholder="เงินสดตั้งต้น" value={openingCash} onChangeText={setOpeningCash} keyboardType="numeric" />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setOpenShiftModal(false)}><Text style={styles.cancel}>ยกเลิก</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={doOpenShift}><Text style={styles.saveText}>เปิดกะ</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!variantPickFor} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>เลือกตัวเลือก: {variantPickFor?.name}</Text>
            {variantOptions.map(v => (
              <TouchableOpacity key={v.id} style={styles.variantRow} onPress={() => pickVariant(v)}>
                <Text style={styles.variantName}>{v.name}</Text>
                <Text style={styles.variantPrice}>฿{(v.price ?? variantPickFor?.price ?? 0).toFixed(2)}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => { setVariantPickFor(null); setVariantOptions([]); }}>
              <Text style={[styles.cancel, { marginTop: 10 }]}>ยกเลิก</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#F3F4F6' },
  shiftBanner: { backgroundColor: '#DC2626', padding: 10, alignItems: 'center' },
  shiftBannerText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  row: { flex: 1, flexDirection: 'row' },
  grid: { flex: 2 },
  catRow: { paddingHorizontal: 8, paddingTop: 8, maxHeight: 44 },
  catChip: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginRight: 8, backgroundColor: '#fff', height: 32 },
  catChipActive: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  catChipText: { fontSize: 12, color: '#374151' },
  catChipTextActive: { color: '#fff' },
  productCard: { flex: 1, margin: 6, backgroundColor: '#fff', borderRadius: 10, padding: 10, minHeight: 90, justifyContent: 'space-between' },
  productName: { fontWeight: '600', fontSize: 13 },
  productPrice: { color: '#F59E0B', fontWeight: '700', marginTop: 4 },
  productStock: { color: '#9CA3AF', fontSize: 11 },
  empty: { color: '#9CA3AF', padding: 16, textAlign: 'center' },
  cart: { flex: 1, backgroundColor: '#fff', padding: 12, borderLeftWidth: 1, borderLeftColor: '#E5E7EB' },
  cartTitle: { fontWeight: '700', fontSize: 16, marginBottom: 8 },
  cartLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  cartLineName: { flex: 1, fontSize: 13 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 8 },
  qtyBtn: { fontSize: 18, width: 24, textAlign: 'center', color: '#F59E0B', fontWeight: '700' },
  qtyText: { width: 24, textAlign: 'center' },
  cartLineTotal: { width: 70, textAlign: 'right', fontSize: 13 },
  discountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  discountLabel: { fontSize: 12, color: '#6B7280' },
  discountInput: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 6, width: 60, textAlign: 'center', paddingVertical: 4 },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  summaryLabel: { color: '#6B7280', fontSize: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  totalLabel: { fontSize: 16, fontWeight: '600' },
  totalValue: { fontSize: 18, fontWeight: '800', color: '#F59E0B' },
  checkoutBtn: { backgroundColor: '#F59E0B', marginTop: 12, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  checkoutText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '85%' },
  modalTitle: { fontWeight: '700', fontSize: 16, marginBottom: 4 },
  modalSub: { color: '#6B7280', fontSize: 12, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 10, marginBottom: 10 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  cancel: { color: '#6B7280', marginRight: 20, paddingVertical: 10 },
  saveBtn: { backgroundColor: '#F59E0B', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  saveText: { color: '#fff', fontWeight: '700' },
  variantRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  variantName: { fontSize: 14 },
  variantPrice: { fontSize: 14, color: '#F59E0B', fontWeight: '700' },
});
