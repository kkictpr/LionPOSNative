import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { listSales, refundSale, voidSale, saleWithItems, getStore, getSetting } from '../db/repository';
import { printReceipt, reconnectSavedPrinter, getSavedPrinterMac } from '../utils/printer';

const STATUS_LABEL: Record<string, string> = {
  completed: 'สำเร็จ',
  refunded: 'คืนเงินแล้ว',
  void: 'ยกเลิกแล้ว',
};

export default function SalesHistoryScreen() {
  const { employee } = useAuth();
  const [sales, setSales] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!employee) return;
    setSales(await listSales(employee.store_id));
  }, [employee]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const confirmRefund = (sale: any) => {
    Alert.alert(
      'คืนเงิน/คืนสินค้า',
      `ยืนยันคืนเงินใบเสร็จ ${sale.receipt_no} จำนวน ฿${sale.total.toFixed(2)}?\nสินค้าจะถูกคืนเข้าสต็อกอัตโนมัติ`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ยืนยันคืนเงิน', style: 'destructive', onPress: async () => { await refundSale(sale.id); load(); } },
      ],
    );
  };

  const confirmVoid = (sale: any) => {
    Alert.alert(
      'ยกเลิกบิล',
      `ยืนยันยกเลิกใบเสร็จ ${sale.receipt_no}? (ไม่คืนสต็อก — ใช้สำหรับบิลที่กดผิด)`,
      [
        { text: 'ปิด', style: 'cancel' },
        { text: 'ยืนยันยกเลิก', style: 'destructive', onPress: async () => { await voidSale(sale.id); load(); } },
      ],
    );
  };

  const reprint = async (sale: any) => {
    const mac = await getSavedPrinterMac();
    if (!mac) {
      Alert.alert('ยังไม่ได้เชื่อมต่อเครื่องพิมพ์', 'ไปที่หน้าตั้งค่าเพื่อเชื่อมต่อเครื่องพิมพ์ก่อน');
      return;
    }
    try {
      await reconnectSavedPrinter();
      const { items } = await saleWithItems(sale.id);
      const store = await getStore(sale.store_id);
      const footer = (await getSetting('receipt_footer')) ?? '';
      await printReceipt({
        storeName: store?.name ?? 'ร้านค้า',
        storeAddress: store?.address,
        storePhone: store?.phone,
        receiptNo: sale.receipt_no,
        employeeName: sale.employee_name,
        createdAt: sale.created_at,
        items: items.map((i: any) => ({
          name: i.name, quantity: i.quantity, unit_price: i.unit_price, line_total: i.line_total,
        })),
        subtotal: sale.subtotal, discount: sale.discount, tax: sale.tax, total: sale.total,
        paymentMethod: sale.payment_method, footer,
      });
    } catch (e: any) {
      Alert.alert('พิมพ์ไม่สำเร็จ', String(e?.message ?? e));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ประวัติการขาย</Text>
      <FlatList
        data={sales}
        keyExtractor={i => i.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{item.receipt_no} · {STATUS_LABEL[item.status] ?? item.status}</Text>
              <Text style={styles.rowMeta}>{item.employee_name} · {new Date(item.created_at).toLocaleString('th-TH')}</Text>
              <Text style={styles.rowTotal}>฿{item.total.toFixed(2)}</Text>
            </View>
            <View>
              <TouchableOpacity style={styles.printBtn} onPress={() => reprint(item)}>
                <Text style={styles.printText}>พิมพ์ใบเสร็จ</Text>
              </TouchableOpacity>
              {item.status === 'completed' && (
                <>
                  <TouchableOpacity style={styles.refundBtn} onPress={() => confirmRefund(item)}>
                    <Text style={styles.refundText}>คืนเงิน</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.voidBtn} onPress={() => confirmVoid(item)}>
                    <Text style={styles.voidText}>ยกเลิกบิล</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีประวัติการขาย</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6', padding: 12 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 8 },
  rowName: { fontWeight: '600' },
  rowMeta: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  rowTotal: { fontWeight: '700', color: '#F59E0B', marginTop: 4 },
  refundBtn: { backgroundColor: '#DC2626', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginBottom: 6 },
  refundText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  voidBtn: { backgroundColor: '#6B7280', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  voidText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  printBtn: { backgroundColor: '#111827', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginBottom: 6 },
  printText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  empty: { color: '#9CA3AF', textAlign: 'center', marginTop: 40 },
});
