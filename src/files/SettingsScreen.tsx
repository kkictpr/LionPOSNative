import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import {
  listStores, upsertStore, currentShift, closeShift, getSetting, setSetting,
} from '../db/repository';
import { scanPrinters, connectPrinter, getSavedPrinterMac, PrinterDevice } from '../utils/printer';
import { syncNow } from '../services/syncService';
import {
  LionButton, LionCard, LionInput, LionMascot, LionModal,
  colors, layout, useResponsive,
} from '../components/lion';

export default function SettingsScreen() {
  const { employee, logout } = useAuth();
  const { isTablet } = useResponsive();
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

  // tablet: การ์ดตั้งค่าเรียง 2 คอลัมน์ / มือถือ: 1 คอลัมน์
  const cardBasis = { flexBasis: isTablet ? '46%' : '100%' } as const;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
      <View style={styles.inner}>
        <Text style={styles.title}>ตั้งค่า</Text>

        <LionCard tone="card" style={styles.profileCard}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}><LionMascot size={52} /></View>
            <View style={styles.flex1}>
              <Text style={styles.profileName}>{employee?.name}</Text>
              <Text style={styles.profileRole}>{employee?.role}</Text>
            </View>
          </View>
          {shift ? (
            <LionButton
              variant="danger"
              title={`ปิดกะ (เปิดอยู่ตั้งแต่ ${new Date(shift.opened_at).toLocaleTimeString('th-TH')})`}
              onPress={() => setCloseModalOpen(true)}
              style={styles.gap}
            />
          ) : (
            <Text style={styles.noShift}>ยังไม่ได้เปิดกะ — เปิดได้จากหน้าขาย</Text>
          )}
          <LionButton title="ออกจากระบบ" onPress={logout} />
        </LionCard>

        <View style={styles.cards}>
          <LionCard style={[styles.settingCard, cardBasis]}>
            <Text style={styles.sectionTitle}>อัตราภาษี (%)</Text>
            <View style={styles.inlineRow}>
              <LionInput
                value={taxRate}
                onChangeText={setTaxRate}
                keyboardType="numeric"
                containerStyle={styles.inlineInput}
              />
              <LionButton title="บันทึก" onPress={saveTaxRate} style={styles.inlineBtn} />
            </View>
          </LionCard>

          <LionCard style={[styles.settingCard, cardBasis]}>
            <Text style={styles.sectionTitle}>โหมดร้านอาหาร</Text>
            <Text style={styles.hint}>
              เปิดแล้วหน้าขายจะเปลี่ยนเป็นระบบเลือกโต๊ะ เปิดออเดอร์ค้างไว้ แล้วค่อยชำระเงินตอนลูกค้าจะกลับ
            </Text>
            <LionButton
              variant={restaurantMode ? 'primary' : 'secondary'}
              title={restaurantMode ? 'เปิดใช้งานอยู่ — แตะเพื่อปิด' : 'ปิดอยู่ — แตะเพื่อเปิด'}
              onPress={toggleRestaurantMode}
              style={styles.gap}
            />
          </LionCard>

          <LionCard style={[styles.settingCard, cardBasis]}>
            <Text style={styles.sectionTitle}>เครื่องพิมพ์ใบเสร็จ (Bluetooth)</Text>
            <Text style={styles.hint}>
              {savedPrinterMac ? `เชื่อมต่ออยู่: ${savedPrinterMac}` : 'ยังไม่ได้เชื่อมต่อเครื่องพิมพ์'}
            </Text>
            <Text style={styles.hint}>จับคู่ (pair) เครื่องพิมพ์กับมือถือในหน้าตั้งค่าบลูทูธของเครื่องก่อน แล้วค่อยกดสแกนที่นี่</Text>
            <LionButton
              variant="secondary"
              title={scanning ? 'กำลังสแกน...' : 'สแกนหาเครื่องพิมพ์'}
              onPress={doScanPrinters}
              disabled={scanning}
              style={styles.gap}
            />
            {printerDevices.map(d => (
              <Pressable
                key={d.inner_mac_address}
                style={styles.printerRow}
                android_ripple={{ color: 'rgba(245,158,11,0.18)' }}
                onPress={() => doConnectPrinter(d)}
                disabled={connectingMac === d.inner_mac_address}>
                <Text style={styles.rowName}>{d.device_name || 'เครื่องพิมพ์ไม่ระบุชื่อ'}</Text>
                <Text style={styles.rowMeta}>{d.inner_mac_address}</Text>
                <Text style={styles.printerAction}>
                  {connectingMac === d.inner_mac_address
                    ? 'กำลังเชื่อมต่อ...'
                    : savedPrinterMac === d.inner_mac_address ? '✓ เชื่อมต่ออยู่' : 'แตะเพื่อเชื่อมต่อ'}
                </Text>
              </Pressable>
            ))}
          </LionCard>

          <LionCard style={[styles.settingCard, cardBasis]}>
            <Text style={styles.sectionTitle}>Sync Cloud</Text>
            <Text style={styles.hint}>ส่งข้อมูลที่ค้างใน sync_queue ขึ้น Supabase</Text>
            <LionButton
              variant="secondary"
              title="Sync Now"
              style={styles.gap}
              onPress={async () => {
                try {
                  await syncNow();
                  Alert.alert('Sync สำเร็จ', 'ส่งข้อมูลขึ้น Cloud เรียบร้อย');
                } catch (e: any) {
                  Alert.alert('Sync ไม่สำเร็จ', String(e?.message ?? e));
                }
              }}
            />
          </LionCard>
        </View>

        <View style={styles.header}>
          <Text style={[styles.sectionTitle, styles.noMb]}>สาขา</Text>
          <LionButton title="+ เพิ่มสาขา" onPress={() => setModalOpen(true)} />
        </View>
        <FlatList
          scrollEnabled={false}
          data={stores}
          keyExtractor={i => i.id}
          renderItem={({ item }) => (
            <LionCard style={styles.row}>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowMeta}>{item.address ?? ''}</Text>
            </LionCard>
          )}
        />
      </View>

      <LionModal visible={modalOpen} onRequestClose={() => setModalOpen(false)} title="เพิ่มสาขาใหม่">
        <LionInput placeholder="ชื่อสาขา" value={name} onChangeText={setName} />
        <LionInput placeholder="ที่อยู่ (ไม่บังคับ)" value={address} onChangeText={setAddress} />
        <View style={styles.modalActions}>
          <LionButton title="ยกเลิก" variant="ghost" onPress={() => setModalOpen(false)} />
          <LionButton title="บันทึก" onPress={save} />
        </View>
      </LionModal>

      <LionModal visible={closeModalOpen} onRequestClose={() => setCloseModalOpen(false)} title="ปิดกะ — นับเงินสด">
        <LionInput placeholder="เงินสดที่นับได้จริง" value={closingCash} onChangeText={setClosingCash} keyboardType="numeric" />
        <View style={styles.modalActions}>
          <LionButton title="ยกเลิก" variant="ghost" onPress={() => setCloseModalOpen(false)} />
          <LionButton title="ปิดกะ" onPress={doCloseShift} />
        </View>
      </LionModal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  contentContainer: { padding: 12, paddingBottom: 40 },
  inner: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center' },
  flex1: { flex: 1 },
  gap: { marginTop: 6, marginBottom: 10 },
  noMb: { marginBottom: 0 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 12 },

  profileCard: { marginBottom: 16 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  profileName: { color: colors.text, fontWeight: '800', fontSize: 16 },
  profileRole: { color: colors.textMuted, marginTop: 2 },
  noShift: { color: colors.textMuted, fontSize: 12, marginBottom: 10 },

  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 16 },
  settingCard: { flexGrow: 1 },
  sectionTitle: { fontWeight: '800', fontSize: 15, color: colors.text, marginBottom: 8 },
  hint: { color: colors.textMuted, fontSize: 12, marginBottom: 6 },
  inlineRow: { flexDirection: 'row', alignItems: 'flex-start' },
  inlineInput: { flex: 1, marginBottom: 0, marginRight: 8 },
  inlineBtn: { minWidth: 88 },

  printerRow: { minHeight: 56, justifyContent: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(148,163,184,0.15)' },
  printerAction: { color: colors.primary, fontSize: 11, fontWeight: '700', marginTop: 2 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  row: { padding: 12, borderRadius: 16, marginBottom: 8 },
  rowName: { fontWeight: '700', color: colors.text },
  rowMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 8 },
});
