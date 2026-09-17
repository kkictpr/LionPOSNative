import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput,
} from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import {
  listProducts, ticketItems, addItemToTicket, removeTicketItem,
  finalizeTicket, cancelTicket, currentShift, getSetting, CartLine,
} from '../db/repository';

export default function TableOrderScreen() {
  const { employee } = useAuth();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { tableId, tableName, saleId } = route.params;

  const [products, setProducts] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [discountPct, setDiscountPct] = useState('0');
  const [taxRate, setTaxRate] = useState(0);

  const load = useCallback(async () => {
    if (!employee) return;
    setProducts(await listProducts(employee.store_id));
    setItems(await ticketItems(saleId));
    setTaxRate(parseFloat((await getSetting('tax_rate')) ?? '0'));
  }, [employee, saleId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addItem = async (p: any) => {
    await addItemToTicket(saleId, { product_id: p.id, name: p.name, quantity: 1, unit_price: p.price } as CartLine);
    load();
  };

  const removeItem = async (itemId: string) => {
    await removeTicketItem(itemId);
    load();
  };

  const subtotal = items.reduce((s, i) => s + i.line_total, 0);
  const discountAmt = subtotal * (parseFloat(discountPct || '0') / 100);
  const taxAmt = (subtotal - discountAmt) * (taxRate / 100);
  const total = subtotal - discountAmt + taxAmt;

  const pay = async () => {
    if (!employee || items.length === 0) return;
    const shift = await currentShift(employee.store_id, employee.id);
    if (!shift) {
      Alert.alert('ยังไม่ได้เปิดกะ', 'กรุณาเปิดกะในหน้าขายก่อนรับชำระเงิน');
      return;
    }
    const result = await finalizeTicket({
      saleId, tableId, storeId: employee.store_id, shiftId: shift.id,
      discount: discountAmt, taxRate, paymentMethod: 'cash',
    });
    Alert.alert('ชำระเงินสำเร็จ', `เลขที่ใบเสร็จ ${result.receiptNo}\nยอดรวม ฿${result.total.toFixed(2)}`);
    navigation.goBack();
  };

  const cancel = () => {
    Alert.alert('ยกเลิกออเดอร์', `ยืนยันยกเลิกออเดอร์โต๊ะ ${tableName} ทั้งหมด?`, [
      { text: 'ปิด', style: 'cancel' },
      { text: 'ยืนยันยกเลิก', style: 'destructive', onPress: async () => { await cancelTicket(saleId, tableId); navigation.goBack(); } },
    ]);
  };

  return (
    <View style={styles.row}>
      <FlatList
        style={styles.grid}
        data={products}
        numColumns={3}
        keyExtractor={p => p.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.productCard} onPress={() => addItem(item)}>
            <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
            <Text style={styles.productPrice}>฿{item.price.toFixed(2)}</Text>
          </TouchableOpacity>
        )}
      />
      <View style={styles.cart}>
        <Text style={styles.cartTitle}>โต๊ะ {tableName}</Text>
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          renderItem={({ item }) => (
            <View style={styles.cartLine}>
              <Text style={styles.cartLineName} numberOfLines={1}>{item.name} x{item.quantity}</Text>
              <Text style={styles.cartLineTotal}>฿{item.line_total.toFixed(2)}</Text>
              <TouchableOpacity onPress={() => removeItem(item.id)}><Text style={styles.removeBtn}>✕</Text></TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีรายการ — แตะสินค้าเพื่อเพิ่ม</Text>}
        />
        <View style={styles.discountRow}>
          <Text style={styles.discountLabel}>ส่วนลด (%)</Text>
          <TextInput style={styles.discountInput} value={discountPct} onChangeText={setDiscountPct} keyboardType="numeric" />
        </View>
        <View style={styles.summaryLine}><Text style={styles.summaryLabel}>ยอดก่อนหักส่วนลด</Text><Text>฿{subtotal.toFixed(2)}</Text></View>
        <View style={styles.summaryLine}><Text style={styles.summaryLabel}>ภาษี ({taxRate}%)</Text><Text>฿{taxAmt.toFixed(2)}</Text></View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>ยอดรวม</Text>
          <Text style={styles.totalValue}>฿{total.toFixed(2)}</Text>
        </View>
        <TouchableOpacity style={styles.checkoutBtn} onPress={pay} disabled={items.length === 0}>
          <Text style={styles.checkoutText}>ชำระเงิน & ปิดโต๊ะ</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelOrderBtn} onPress={cancel}>
          <Text style={styles.cancelOrderText}>ยกเลิกออเดอร์นี้</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', backgroundColor: '#F3F4F6' },
  grid: { flex: 2, padding: 8 },
  productCard: { flex: 1, margin: 6, backgroundColor: '#fff', borderRadius: 10, padding: 10, minHeight: 80, justifyContent: 'space-between' },
  productName: { fontWeight: '600', fontSize: 13 },
  productPrice: { color: '#F59E0B', fontWeight: '700', marginTop: 4 },
  cart: { flex: 1, backgroundColor: '#fff', padding: 12, borderLeftWidth: 1, borderLeftColor: '#E5E7EB' },
  cartTitle: { fontWeight: '700', fontSize: 16, marginBottom: 8 },
  cartLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  cartLineName: { flex: 1, fontSize: 13 },
  cartLineTotal: { fontSize: 13, marginRight: 8 },
  removeBtn: { color: '#DC2626', fontWeight: '700' },
  empty: { color: '#9CA3AF', padding: 16, textAlign: 'center' },
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
  cancelOrderBtn: { marginTop: 8, paddingVertical: 10, alignItems: 'center' },
  cancelOrderText: { color: '#DC2626', fontSize: 12, fontWeight: '600' },
});
