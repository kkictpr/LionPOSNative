import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import {
  listStores, upsertStore, currentShift, closeShift, getSetting, setSetting,
} from '../db/repository';
import { scanPrinters, connectPrinter, getSavedPrinterMac, PrinterDevice } from '../utils/printer';

export default function SettingsScreen() {
  const { employee, logout } = useAuth();
  const [stores, setStores] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  const [shift, setShift] = useState<any | null>(null);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closingCash, setClosingCash] = useState('');

  const [taxRate, setTaxRate] = useState('0');
  const [restaurantMode, setRestaurantMode] = useState(false);

  const [printerDevices, setPrinterDevices] = useState<PrinterDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [savedPrinterMac, setSavedPrinterMac] = useState<string | null>(null);
  const [connectingMac, setConnectingMac] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStores(await listStores());
    if (employee) {
      setShift(await currentShift(employee.store_id, employee.id));
    }
    setTaxRate((await getSetting('tax_rate')) ?? '0');
    setSavedPrinterMac(await getSavedPrinterMac());
    setRestaurantMode((await getSetting('restaurant_mode')) === '1');
  }, [employee]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!name.trim()) return;
    await upsertStore({ name: name.trim(), address: address.trim() || undefined });
    setName(''); setAddress(''); setModalOpen(false);
    load();
  };

  const toggleRestaurantMode = async () => {
    const next = !restaurantMode;
    await setSetting('restaurant_mode', next ? '1' : '0');
    setRestaurantMode(next);
  };

  const doCloseShift = async () => {
    if (!shift || !closingCash.trim()) return;
    const result = await closeShift(shift.id, parseFloat(closingCash));
    const diff = result.difference;
    Alert.alert(
      'ปิดกะสำเร็จ',
      `เงินสดที่ควรมี ฿${result.expected.toFixed(2)}\nส่วนต่าง ${diff >= 0 ? '+' : ''}฿${diff.toFixed(2)}`,
    );
    setClosingCash(''); setCloseModalOpen(false);
    load();
  };

  const saveTaxRate = async () => {
    await setSetting('tax_rate', taxRate || '0');
    Alert.alert('บันทึกแล้ว', `อัตราภาษี ${taxRate}%`);
  };

  const doScanPrinters = async () => {
    setScanning(true);
    try {
      const devices = await scanPrinters();
      setPrinterDevices(devices);
      if (devices.length === 0) {
        Alert.alert('ไม่พบเครื่องพิมพ์', 'ตรวจสอบว่าเปิดบลูทูธและจับคู่ (pair) เครื่องพิมพ์กับมือถือไว้ล่วงหน้าแล้ว');
      }
    } catch (e: any) {
      Alert.alert('สแกนไม่สำเร็จ', String(e?.message ?? e));
    } finally {
      setScanning(false);
    }
  };

  const doConnectPrinter = async (device: PrinterDevice) => {
    setConnectingMac(device.inner_mac_address);
    try {
      await connectPrinter(device.inner_mac_address);
      setSavedPrinterMac(device.inner_mac_address);
      Alert.alert('เชื่อมต่อสำเร็จ', `เชื่อมต่อกับ ${device.device_name} แล้ว — ใบเสร็จจะพิมพ์อัตโนมัติทุกครั้งที่ขาย`);
    } catch (e: any) {
      Alert.alert('เชื่อมต่อไม่สำเร็จ', String(e?.message ?? e));
    } finally {
      setConnectingMac(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ตั้งค่า</Text>

      <View style={styles.profileCard}>
        <Text style={styles.profileName}>{employee?.name}</Text>
        <Text style={styles.profileRole}>{employee?.role}</Text>
        {shift ? (
          <TouchableOpacity style={styles.closeShiftBtn} onPress={() => setCloseModalOpen(true)}>
            <Text style={styles.closeShiftText}>ปิดกะ (เปิดอยู่ตั้งแต่ {new Date(shift.opened_at).toLocaleTimeString('th-TH')})</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.noShift}>ยังไม่ได้เปิดกะ — เปิดได้จากหน้าขาย</Text>
        )}
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>ออกจากระบบ</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.taxCard}>
        <Text style={styles.sectionTitle}>อัตราภาษี (%)</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextInput style={[styles.input, { flex: 1, marginBottom: 0, marginRight: 8 }]} value={taxRate} onChangeText={setTaxRate} keyboardType="numeric" />
          <TouchableOpacity style={styles.saveBtn} onPress={saveTaxRate}><Text style={styles.saveText}>บันทึก</Text></TouchableOpacity>
        </View>
      </View>

      <View style={styles.taxCard}>
        <Text style={styles.sectionTitle}>โหมดร้านอาหาร</Text>
        <Text style={styles.printerHint}>
          เปิดแล้วหน้าขายจะเปลี่ยนเป็นระบบเลือกโต๊ะ เปิดออเดอร์ค้างไว้ แล้วค่อยชำระเงินตอนลูกค้าจะกลับ
        </Text>
        <TouchableOpacity
          style={[styles.scanBtn, restaurantMode && styles.toggleOnBtn]}
          onPress={toggleRestaurantMode}>
          <Text style={styles.saveText}>{restaurantMode ? 'เปิดใช้งานอยู่ — แตะเพื่อปิด' : 'ปิดอยู่ — แตะเพื่อเปิด'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.taxCard}>
        <Text style={styles.sectionTitle}>เครื่องพิมพ์ใบเสร็จ (Bluetooth)</Text>
        <Text style={styles.printerHint}>
          {savedPrinterMac ? `เชื่อมต่ออยู่: ${savedPrinterMac}` : 'ยังไม่ได้เชื่อมต่อเครื่องพิมพ์'}
        </Text>
        <Text style={styles.printerHint}>จับคู่ (pair) เครื่องพิมพ์กับมือถือในหน้าตั้งค่าบลูทูธของเครื่องก่อน แล้วค่อยกดสแกนที่นี่</Text>
        <TouchableOpacity style={styles.scanBtn} onPress={doScanPrinters} disabled={scanning}>
          <Text style={styles.saveText}>{scanning ? 'กำลังสแกน...' : 'สแกนหาเครื่องพิมพ์'}</Text>
        </TouchableOpacity>
        {printerDevices.map(d => (
          <TouchableOpacity
            key={d.inner_mac_address}
            style={styles.printerRow}
            onPress={() => doConnectPrinter(d)}
            disabled={connectingMac === d.inner_mac_address}>
            <Text style={styles.rowName}>{d.device_name || 'เครื่องพิมพ์ไม่ระบุชื่อ'}</Text>
            <Text style={styles.rowMeta}>{d.inner_mac_address}</Text>
            <Text style={styles.printerAction}>
              {connectingMac === d.inner_mac_address
                ? 'กำลังเชื่อมต่อ...'
                : savedPrinterMac === d.inner_mac_address ? '✓ เชื่อมต่ออยู่' : 'แตะเพื่อเชื่อมต่อ'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.header}>
        <Text style={styles.sectionTitle}>สาขา</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalOpen(true)}>
          <Text style={styles.addBtnText}>+ เพิ่มสาขา</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={stores}
        keyExtractor={i => i.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowName}>{item.name}</Text>
            <Text style={styles.rowMeta}>{item.address ?? ''}</Text>
          </View>
        )}
      />

      <Modal visible={modalOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>เพิ่มสาขาใหม่</Text>
            <TextInput style={styles.input} placeholder="ชื่อสาขา" value={name} onChangeText={setName} />
            <TextInput style={styles.input} placeholder="ที่อยู่ (ไม่บังคับ)" value={address} onChangeText={setAddress} />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setModalOpen(false)}><Text style={styles.cancel}>ยกเลิก</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={save}><Text style={styles.saveText}>บันทึก</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={closeModalOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>ปิดกะ — นับเงินสด</Text>
            <TextInput style={styles.input} placeholder="เงินสดที่นับได้จริง" value={closingCash} onChangeText={setClosingCash} keyboardType="numeric" />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setCloseModalOpen(false)}><Text style={styles.cancel}>ยกเลิก</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={doCloseShift}><Text style={styles.saveText}>ปิดกะ</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6', padding: 12 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  profileCard: { backgroundColor: '#111827', borderRadius: 12, padding: 16, marginBottom: 16 },
  profileName: { color: '#fff', fontWeight: '700', fontSize: 16 },
  profileRole: { color: '#9CA3AF', marginTop: 2, marginBottom: 12 },
  closeShiftBtn: { backgroundColor: '#DC2626', paddingVertical: 8, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  closeShiftText: { color: '#fff', fontWeight: '600', fontSize: 12, textAlign: 'center' },
  noShift: { color: '#9CA3AF', fontSize: 12, marginBottom: 10 },
  logoutBtn: { backgroundColor: '#F59E0B', paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  logoutText: { color: '#fff', fontWeight: '700' },
  taxCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 },
  printerHint: { color: '#6B7280', fontSize: 11, marginBottom: 6 },
  scanBtn: { backgroundColor: '#111827', paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginTop: 6, marginBottom: 4 },
  toggleOnBtn: { backgroundColor: '#F59E0B' },
  printerRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  printerAction: { color: '#F59E0B', fontSize: 11, fontWeight: '600', marginTop: 2 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontWeight: '700', fontSize: 14, marginBottom: 8 },
  addBtn: { backgroundColor: '#F59E0B', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: '#fff', fontWeight: '600' },
  row: { backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 8 },
  rowName: { fontWeight: '600' },
  rowMeta: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '85%' },
  modalTitle: { fontWeight: '700', fontSize: 16, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 10, marginBottom: 10 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  cancel: { color: '#6B7280', marginRight: 20, paddingVertical: 10 },
  saveBtn: { backgroundColor: '#F59E0B', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  saveText: { color: '#fff', fontWeight: '700' },
});
