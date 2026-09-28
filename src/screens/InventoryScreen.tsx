import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert, Image,
  Animated, Pressable, useWindowDimensions, KeyboardAvoidingView, Platform, ScrollView,
  PermissionsAndroid,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import {
  listProducts, upsertProduct, adjustStock, listCategories, upsertCategory,
  deleteProduct,
} from '../db/repository';
import ImageCropPicker from 'react-native-image-crop-picker';

// ── LionPOS palette (Radius 20 standard on cards / modals) ─────────
const COLORS = {
  primary: '#FF8A00',
  primaryDark: '#E67300',
  background: '#0F172A',
  surface: '#1E293B',
  card: '#334155',
  textLight: '#F8FAFC',
  textMuted: '#94A3B8',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
};
const RADIUS = 20;
// Premium content cards (product cards, etc.) use a slightly larger radius
// than modals/chips elsewhere — style-only, matched across all screens.
const CARD_RADIUS = 24;


// UI-only helper — badges the current stock level. Reads item.quantity, writes nothing.
function stockBadge(qty: number) {
  if (qty <= 0) return { label: 'หมด', bg: 'rgba(239,68,68,0.18)', color: COLORS.danger };
  if (qty <= 5) return { label: `ใกล้หมด ${qty}`, bg: 'rgba(245,158,11,0.18)', color: COLORS.warning };
  return { label: `คงเหลือ ${qty}`, bg: 'rgba(16,185,129,0.18)', color: COLORS.success };
}

// ── Animated press wrapper (scale + ripple), shared by cards & pill buttons ──
function Pressy({
  onPress, style, rippleColor, children, disabled,
}: {
  onPress?: () => void; style?: any; rippleColor?: string; children: React.ReactNode; disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={disabled}
        android_ripple={{ color: rippleColor ?? 'rgba(255,138,0,0.2)' }}
        style={style}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ── Themed TextInput: radius 16, border #334155, focus ring in primary orange ──
function AppTextInput(props: React.ComponentProps<typeof TextInput>) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      placeholderTextColor={props.placeholderTextColor ?? COLORS.textMuted}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
      style={[styles.input, focused && styles.inputFocused, props.style]}
    />
  );
}

// ── Product card ─────────────────────────────────────────────────
function ProductCard({
  item, onRestock, onEdit, onDelete, colWidth,
}: {
  item: any; onRestock: () => void; onEdit: () => void; onDelete: () => void; colWidth?: number;
}) {
  const badge = stockBadge(item.quantity ?? 0);

  return (
    <Pressy style={[styles.cardPressable, colWidth ? { width: colWidth } : { flex: 1 }]}>
      <LinearGradient
        colors={['#26314C', '#1E293B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}>
        <View style={styles.cardTopRow}>
          {/* Left: name, price, stock/sale status */}
          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              ฿{item.price.toFixed(2)}{item.category_name ? ` · ${item.category_name}` : ''}
            </Text>
            <View style={styles.badgeRow}>
              <View style={[styles.stockBadge, { backgroundColor: badge.bg }]}>
                <Text style={[styles.stockBadgeText, { color: badge.color }]}>{badge.label}</Text>
              </View>
              {(item.quantity ?? 0) > 0 ? (
                <View style={styles.readyPill}>
                  <Text style={styles.readyPillText}>พร้อมขาย</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Middle: thumbnail */}
          <View style={styles.thumbBox}>
            {item.image_uri ? (
              <Image source={{ uri: item.image_uri }} style={styles.thumb} resizeMode="cover" />
            ) : (
              <View style={styles.thumbPlaceholder}><Text style={{ fontSize: 20 }}>🖼️</Text></View>
            )}
          </View>

          {/* Right: action buttons stacked vertically, equal width, right-aligned */}
          <View style={styles.cardActions}>
            <Pressy onPress={onRestock} style={styles.actionBtn} rippleColor="rgba(255,255,255,0.15)">
              <Text style={styles.actionBtnText} numberOfLines={1}>📦 ปรับสต็อก</Text>
            </Pressy>
            <Pressy onPress={onEdit} style={[styles.actionBtn, styles.actionBtnAlt]} rippleColor="rgba(255,138,0,0.25)">
              <Text style={[styles.actionBtnText, styles.actionBtnTextAlt]} numberOfLines={1}>✏️ แก้ไข</Text>
            </Pressy>
            <Pressy onPress={onDelete} style={[styles.actionBtn, styles.actionBtnDanger]} rippleColor="rgba(239,68,68,0.25)">
              <Text style={[styles.actionBtnText, styles.actionBtnTextDanger]} numberOfLines={1}>🗑️ ลบ</Text>
            </Pressy>
          </View>
        </View>
      </LinearGradient>
    </Pressy>
  );
}

export default function InventoryScreen() {
  const { employee } = useAuth();
  const { width } = useWindowDimensions();
  // Responsive grid: phone & small tablet = 1 col, tablet/iPad portrait = 2 cols, landscape = 3 cols.
  // Breakpoints keep each card ≥ ~360dp wide so the right-side action buttons don't squeeze the name.
  const numColumns = width >= 1140 ? 3 : width >= 768 ? 2 : 1;

  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState('');
  const [cost, setCost] = useState('');
  const [initialStock, setInitialStock] = useState('0');
  const [editStock, setEditStock] = useState('0');
  const [originalStock, setOriginalStock] = useState(0);
  const [newCatName, setNewCatName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [restockTarget, setRestockTarget] = useState<any | null>(null);
  const [restockQty, setRestockQty] = useState('');
  const [restockCost, setRestockCost] = useState('');

  const load = useCallback(async () => {
    if (!employee) return;
    setProducts(await listProducts(employee.store_id));
    setCategories(await listCategories());
  }, [employee]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const resetProductForm = () => {
    setName('');
    setPrice('');
    setCost('');
    setInitialStock('0');
    setEditStock('0');
    setOriginalStock(0);
    setCategoryId(null);
    setImageUri('');
    setEditingId(null);
  };

  const openAddModal = () => {
    resetProductForm();
    setModalOpen(true);
  };

  const openEditModal = (item: any) => {
    setEditingId(item.id);
    setName(item.name ?? '');
    setPrice(item.price != null ? String(item.price) : '');
    setCost(item.cost != null ? String(item.cost) : '');
    setInitialStock('0');
    setEditStock(String(item.quantity ?? 0));
    setOriginalStock(item.quantity ?? 0);
    setCategoryId(item.category_id ?? null);
    setImageUri(item.image_uri ?? '');
    setModalOpen(true);
  };

  const confirmDelete = (item: any) => {
    Alert.alert(
      'ลบสินค้า',
      `ต้องการลบ "${item.name}" ใช่หรือไม่?`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ลบ',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteProduct(item.id);
              await load();
            } catch (err: any) {
              console.error('Delete Product Error:', err);
              Alert.alert('ลบสินค้าไม่สำเร็จ', err?.message ?? String(err));
            }
          },
        },
      ],
    );
  };

  const saveProduct = async () => {
  try {
    if (!name.trim() || !price.trim()) {
      Alert.alert('กรอกข้อมูลให้ครบ', 'ต้องมีชื่อสินค้าและราคา');
      return;
    }

    if (!employee) {
      Alert.alert('ไม่พบข้อมูลร้านค้า', 'กรุณาเข้าสู่ระบบใหม่');
      return;
    }

    const product = await upsertProduct({
      id: editingId ?? undefined,
      name: name.trim(),
      price: parseFloat(price),
      category_id: categoryId ?? undefined,
      image_uri: imageUri || undefined,
      cost: cost.trim() ? parseFloat(cost) : 0,
    });

    // Initial stock only applies when creating a brand-new product.
    if (!editingId && Number(initialStock) > 0) {
      await adjustStock(product.id, employee.store_id, Number(initialStock), 'restock');
    }

    // Editing: if the stock number shown was changed, push the difference as a
    // manual adjustment (positive or negative) so it lines up with the new figure.
    if (editingId) {
      const newQty = Number(editStock || 0);
      const delta = newQty - originalStock;
      if (delta !== 0) {
        await adjustStock(product.id, employee.store_id, delta, 'adjustment');
      }
    }

    resetProductForm();
    setModalOpen(false);

    await load();
  } catch (err: any) {
    console.error('Save Product Error:', err);
    Alert.alert('บันทึกสินค้าไม่สำเร็จ', err?.message ?? String(err));
  }
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

  // ── Image pickers ──────────────────────────────────────────────
  // Two-step, on purpose: react-native-image-picker only PICKS (materializes a real
  // local file — camera capture or a copy of the chosen gallery photo). ALL of the
  // actual cropping is then done by react-native-image-crop-picker's openCropper() on
  // that already-local path. Feeding openCamera()/openPicker() a `cropping: true`
  // directly can fail to read Android's newer Photo Picker content:// URIs ("Cannot
  // find image data") before crop even starts; handing openCropper() a definite local
  // file avoids that read entirely. Only image.path from openCropper() is ever written
  // into `imageUri` (same field the preview, saveProduct, and edit-load all read).

  const requestCameraPermission = async () => {
    if (Platform.OS !== 'android') return true;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: 'ขอสิทธิ์เข้าถึงกล้อง',
          message: 'แอปต้องใช้กล้องเพื่อถ่ายรูปสินค้า',
          buttonPositive: 'อนุญาต',
          buttonNegative: 'ปฏิเสธ',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.error('Camera Permission Error:', err);
      return false;
    }
  };

  const requestMediaPermission = async () => {
    if (Platform.OS !== 'android') return true;
    try {
      const sdkInt = Platform.Version as number;
      const permission = sdkInt >= 33
        ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
        : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
      const granted = await PermissionsAndroid.request(permission, {
        title: 'ขอสิทธิ์เข้าถึงคลังรูปภาพ',
        message: 'แอปต้องเข้าถึงคลังรูปเพื่อเลือกรูปสินค้า',
        buttonPositive: 'อนุญาต',
        buttonNegative: 'ปฏิเสธ',
      });
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.error('Media Permission Error:', err);
      return false;
    }
  };

  // Full-screen 1:1 crop step (drag + zoom, visible ✓/✕ toolbar) run on a definite
  // local file path. Writes the resulting cropped file's path into `imageUri`.
  // Cancelling the crop screen is silent — imageUri is simply left unchanged.
  
  const pickFromGallery = async () => {
    const hasPermission = await requestMediaPermission();
    if (!hasPermission) return;

    try {
      const cropped = await ImageCropPicker.openPicker({
        mediaType: 'photo',
        cropping: true,
        width: 800,
        height: 800,
        compressImageQuality: 0.9,
        forceJpg: true,
        writeTempFile: true,
        freeStyleCropEnabled: true,
        cropperCircleOverlay: false,
        cropperToolbarTitle: 'ครอบตัดรูปภาพ (1:1)',
        cropperChooseText: 'เสร็จสิ้น',
        cropperCancelText: 'ยกเลิก',
        cropperToolbarColor: '#111827',
        cropperStatusBarColor: '#111827',
        cropperToolbarWidgetColor: '#FFFFFF',
        cropperActiveWidgetColor: '#F59E0B',
      });

      if (cropped?.path) setImageUri(cropped.path);
    } catch (e:any) {
      if (e?.code === 'E_PICKER_CANCELLED') return;
      Alert.alert('เลือกรูปไม่สำเร็จ', e?.message ?? 'เกิดข้อผิดพลาด');
    }
  };

  const pickFromCamera = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;
    try {
      const image = await ImageCropPicker.openCamera({mediaType:'photo',cropping:true,width:800,height:800,compressImageQuality:0.9,forceJpg:true,freeStyleCropEnabled:true,cropperCircleOverlay:false,cropperToolbarColor:COLORS.surface,cropperStatusBarColor:COLORS.background,cropperToolbarWidgetColor:COLORS.primary,cropperActiveWidgetColor:COLORS.primary,cropperToolbarTitle:'ครอบตัดรูปภาพ (1:1)',cropperChooseText:'เสร็จสิ้น',cropperCancelText:'ยกเลิก'});
      if(image?.path){console.log('Cropped image:',image.width,image.height);setImageUri(image.path);}
    } catch(e:any){if(e?.code==='E_PICKER_CANCELLED') return; Alert.alert('ถ่ายรูปไม่สำเร็จ',e?.message??'เกิดข้อผิดพลาด');}
  };

  const profit = Math.max(0, Number(price || 0) - Number(cost || 0));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <LinearGradient
            colors={['#FFB84D', COLORS.primary, COLORS.primaryDark]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.logoBadge}>
            <Text style={styles.logoEmoji}>🦁</Text>
          </LinearGradient>
          <View>
            <Text style={styles.title}>คลังสินค้า</Text>
            <Text style={styles.titleSub}>LionPOS</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row' }}>
          <Pressy onPress={() => setCatModalOpen(true)} style={styles.secondaryBtn} rippleColor="rgba(255,138,0,0.2)">
            <Text style={styles.secondaryBtnText}>+ หมวดหมู่</Text>
          </Pressy>
          <Pressy onPress={openAddModal} style={{ marginLeft: 8 }} rippleColor="rgba(255,255,255,0.2)">
            <LinearGradient
              colors={['#FFB84D', COLORS.primary, COLORS.primaryDark]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.addBtn}>
              <Text style={styles.addBtnText}>+ เพิ่มสินค้า</Text>
            </LinearGradient>
          </Pressy>
        </View>
      </View>

      <FlatList
        key={`cols-${numColumns}`}
        data={products}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
        keyExtractor={i => i.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => (
          <ProductCard
            item={item}
            onRestock={() => setRestockTarget(item)}
            onEdit={() => openEditModal(item)}
            onDelete={() => confirmDelete(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}><Text style={styles.emptyIcon}>📦</Text></View>
            <Text style={styles.emptyTitle}>ยังไม่มีสินค้า</Text>
            <Text style={styles.emptySub}>เพิ่มสินค้าชิ้นแรกเพื่อเริ่มขายและติดตามสต็อกได้ทันที</Text>
            <Pressy onPress={openAddModal} rippleColor="rgba(255,255,255,0.2)" style={{ marginTop: 16 }}>
              <LinearGradient
                colors={['#FFB84D', COLORS.primary, COLORS.primaryDark]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.emptyBtn}>
                <Text style={styles.emptyBtnText}>+ เพิ่มสินค้าชิ้นแรก</Text>
              </LinearGradient>
            </Pressy>
          </View>
        }
      />

      {/* ── Add product modal ───────────────────────────────────── */}
      <Modal visible={modalOpen} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalBg}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalCard, styles.modalCardLg]}>
            <Text style={styles.modalTitle}>{editingId ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</Text>
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled">

              <View style={styles.imagePickWrap}>
                <View style={styles.imagePreviewBox}>
                  {imageUri ? (
                    <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
                  ) : (
                    <View style={styles.imagePreviewPlaceholder}>
                      <Text style={{ fontSize: 30 }}>🖼️</Text>
                    </View>
                  )}
                </View>
                <View style={styles.imagePickBtnRow}>
                  <Pressy onPress={pickFromCamera} style={styles.imagePickBtn} rippleColor="rgba(255,255,255,0.15)">
                    <View style={styles.imagePickBtnInner}>
                      <Text style={styles.imagePickIcon}>📷</Text>
                      <Text style={styles.imagePickBtnText}>กล้อง</Text>
                    </View>
                  </Pressy>
                  <Pressy onPress={pickFromGallery} style={[styles.imagePickBtn, styles.imagePickBtnAlt]} rippleColor="rgba(255,138,0,0.2)">
                    <View style={styles.imagePickBtnInner}>
                      <Text style={styles.imagePickIcon}>🗂️</Text>
                      <Text style={[styles.imagePickBtnText, styles.imagePickBtnTextAlt]}>คลังรูป</Text>
                    </View>
                  </Pressy>
                </View>
              </View>

              <Text style={styles.label}>ชื่อสินค้า *</Text>
              <AppTextInput placeholder="เช่น ไอศกรีมวานิลา" value={name} onChangeText={setName} />

              <View style={styles.fieldRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.label}>ราคาขาย (บาท) *</Text>
                  <AppTextInput placeholder="0.00" value={price} onChangeText={setPrice} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>ต้นทุน (บาท)</Text>
                  <AppTextInput placeholder="0.00" value={cost} onChangeText={setCost} keyboardType="numeric" />
                </View>
              </View>

              <View style={styles.profitCard}>
                <View>
                  <Text style={styles.profitLabel}>กำไรต่อชิ้น (คำนวณสด)</Text>
                  <Text style={styles.profitSub}>ราคาขาย − ต้นทุน</Text>
                </View>
                <Text style={styles.profitValue}>฿{profit.toFixed(2)}</Text>
              </View>

              <Text style={styles.label}>{editingId ? 'จำนวนคงเหลือ (สต็อก)' : 'สต็อกเริ่มต้น'}</Text>
              {editingId ? (
                <AppTextInput placeholder="0" value={editStock} onChangeText={setEditStock} keyboardType="numeric" />
              ) : (
                <AppTextInput placeholder="0" value={initialStock} onChangeText={setInitialStock} keyboardType="numeric" />
              )}
              {!!editingId && (
                <Text style={styles.stockHint}>
                  แก้ไขตัวเลขนี้เพื่อปรับสต็อกให้ตรงกับความเป็นจริง (บันทึกเป็นรายการ "ปรับปรุงสต็อก")
                </Text>
              )}

              <Text style={styles.label}>หมวดหมู่</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={categories}
                keyExtractor={c => c.id}
                style={{ marginBottom: 6 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => setCategoryId(categoryId === item.id ? null : item.id)}
                    activeOpacity={0.8}>
                    {categoryId === item.id ? (
                      <LinearGradient
                        colors={['#FFB84D', COLORS.primary]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={styles.catChip}>
                        <Text style={styles.catChipTextActive}>{item.name}</Text>
                      </LinearGradient>
                    ) : (
                      <View style={[styles.catChip, styles.catChipInactive]}>
                        <Text style={styles.catChipText}>{item.name}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}
              />
            </ScrollView>

            <View style={[styles.modalActions, styles.modalFooterSticky]}>
              <TouchableOpacity onPress={() => { resetProductForm(); setModalOpen(false); }}>
                <Text style={styles.cancel}>ยกเลิก</Text>
              </TouchableOpacity>
              <Pressy onPress={saveProduct} rippleColor="rgba(255,255,255,0.2)">
                <LinearGradient
                  colors={['#FFB84D', COLORS.primary, COLORS.primaryDark]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.saveBtn}>
                  <Text style={styles.saveText}>{editingId ? 'บันทึกการแก้ไข' : 'บันทึกสินค้า'}</Text>
                </LinearGradient>
              </Pressy>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Add category modal ──────────────────────────────────── */}
      <Modal visible={catModalOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>เพิ่มหมวดหมู่</Text>
            <AppTextInput placeholder="ชื่อหมวดหมู่" value={newCatName} onChangeText={setNewCatName} />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setCatModalOpen(false)}><Text style={styles.cancel}>ยกเลิก</Text></TouchableOpacity>
              <Pressy onPress={saveCategory} rippleColor="rgba(255,255,255,0.2)">
                <LinearGradient
                  colors={['#FFB84D', COLORS.primary, COLORS.primaryDark]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.saveBtn}>
                  <Text style={styles.saveText}>บันทึก</Text>
                </LinearGradient>
              </Pressy>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Restock modal ───────────────────────────────────────── */}
      <Modal visible={!!restockTarget} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>รับสต็อก: {restockTarget?.name}</Text>
            <Text style={styles.modalSub}>คงเหลือปัจจุบัน {restockTarget?.quantity ?? 0}</Text>
            <AppTextInput
              placeholder="จำนวนที่รับเข้า"
              value={restockQty}
              onChangeText={setRestockQty}
              keyboardType="numeric"
            />
            <View style={styles.quickQtyRow}>
              {[1, 5, 10, 20].map(n => (
                <TouchableOpacity key={n} style={styles.quickQtyChip} onPress={() => setRestockQty(String(n))}>
                  <Text style={styles.quickQtyText}>+{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setRestockTarget(null)}><Text style={styles.cancel}>ยกเลิก</Text></TouchableOpacity>
              <Pressy onPress={doRestock} rippleColor="rgba(255,255,255,0.2)">
                <LinearGradient
                  colors={['#FFB84D', COLORS.primary, COLORS.primaryDark]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.saveBtn}>
                  <Text style={styles.saveText}>บันทึก</Text>
                </LinearGradient>
              </Pressy>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBadge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: COLORS.primary, shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  logoEmoji: { fontSize: 28 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.textLight },
  titleSub: { fontSize: 10, fontWeight: '700', color: COLORS.primary, letterSpacing: 1 },

  secondaryBtn: { borderWidth: 1, borderColor: COLORS.card, backgroundColor: COLORS.surface, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14 },
  secondaryBtnText: { color: COLORS.textLight, fontWeight: '600', fontSize: 12 },
  addBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 14 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  columnWrapper: { justifyContent: 'space-between', paddingHorizontal: 2, gap: 16 },

  cardPressable: { borderRadius: CARD_RADIUS, overflow: 'hidden', marginBottom: 16 },
  card: { padding: 14, borderWidth: 1, borderColor: '#2A3A57', shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center' },
  cardInfo: { flex: 1, minWidth: 0 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 6, marginTop: 6 },
  thumbBox: { width: 72, height: 72, borderRadius: 18, marginLeft: 10, overflow: 'hidden', backgroundColor: 'rgba(255,138,0,0.15)', alignItems: 'center', justifyContent: 'center' },
  thumb: { width: '100%', height: '100%' },
  thumbPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  cardName: { fontWeight: '700', fontSize: 14, color: COLORS.textLight },
  cardMeta: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  stockBadge: {
    alignSelf: 'flex-start', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6,
    minHeight: 28, justifyContent: 'center',
  },
  stockBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
  readyPill: {
    backgroundColor: 'rgba(16,185,129,0.18)', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6,
    minHeight: 28, justifyContent: 'center',
    shadowColor: COLORS.success, shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  readyPillText: { color: COLORS.success, fontSize: 10, fontWeight: '800' },

  cardActions: { width: 92, marginLeft: 10, gap: 6 },
  actionBtn: { height: 36, backgroundColor: COLORS.card, borderRadius: 14, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  actionBtnAlt: { backgroundColor: 'rgba(255,138,0,0.15)' },
  actionBtnDanger: { backgroundColor: 'rgba(239,68,68,0.15)' },
  actionBtnText: { color: COLORS.textLight, fontSize: 13, fontWeight: '600' },
  actionBtnTextAlt: { color: COLORS.primary },
  actionBtnTextDanger: { color: COLORS.danger },

  empty: { color: COLORS.textMuted, textAlign: 'center', marginTop: 40 },
  emptyWrap: { alignItems: 'center', marginTop: 56, paddingHorizontal: 24 },
  emptyIconWrap: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(255,138,0,0.12)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyIcon: { fontSize: 42 },
  emptyTitle: { color: COLORS.textLight, fontSize: 16, fontWeight: '700' },
  emptySub: { color: COLORS.textMuted, fontSize: 12, textAlign: 'center', marginTop: 6, lineHeight: 18, maxWidth: 280 },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 13, borderRadius: 14, minWidth: 220, alignItems: 'center' },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS, padding: 14, width: '88%', maxHeight: '90%', borderWidth: 1, borderColor: COLORS.card },
  modalCardLg: { width: '92%', maxWidth: 520, maxHeight: '94%' },
  modalScroll: { flexShrink: 1, minHeight: 0 },
  modalScrollContent: { paddingBottom: 4 },
  modalFooterSticky: { borderTopWidth: 1, borderTopColor: COLORS.card, paddingTop: 8, marginTop: 2 },
  modalTitle: { fontWeight: '700', fontSize: 15, marginBottom: 6, color: COLORS.textLight },
  modalSub: { color: COLORS.textMuted, fontSize: 12, marginBottom: 10 },

  label: { fontSize: 11, color: COLORS.textMuted, marginBottom: 3, marginTop: 1 },
  stockHint: { fontSize: 10, color: COLORS.textMuted, marginTop: -3, marginBottom: 4, lineHeight: 13 },
  input: { borderWidth: 1, borderColor: COLORS.card, borderRadius: 14, padding: 8, marginBottom: 5, color: COLORS.textLight, backgroundColor: 'rgba(255,255,255,0.03)' },
  inputFocused: { borderColor: COLORS.primary, borderWidth: 1.5 },
  fieldRow: { flexDirection: 'row' },

  imagePickWrap: { alignItems: 'center', marginBottom: 8 },
  imagePreviewBox: { width: 140, height: 140, borderRadius: RADIUS, overflow: 'hidden', backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.card },
  imagePreview: { width: '100%', height: '100%' },
  imagePreviewPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  imagePickBtnRow: { flexDirection: 'row', marginTop: 8, gap: 8 },
  imagePickBtn: { height: 34, minWidth: 108, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.card, paddingHorizontal: 14, borderRadius: 12 },
  imagePickBtnAlt: { backgroundColor: 'rgba(255,138,0,0.15)' },
  imagePickBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  imagePickIcon: { fontSize: 16 },
  imagePickBtnText: { color: COLORS.textLight, fontSize: 11, fontWeight: '600' },
  imagePickBtnTextAlt: { color: COLORS.primary },

  profitCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(16,185,129,0.14)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 5 },
  profitLabel: { color: COLORS.success, fontSize: 11, fontWeight: '700' },
  profitSub: { color: COLORS.textMuted, fontSize: 9, marginTop: 1 },
  profitValue: { color: COLORS.success, fontSize: 16, fontWeight: '800' },

  catChip: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5, marginRight: 8 },
  catChipInactive: { borderWidth: 1, borderColor: COLORS.card, backgroundColor: 'transparent' },
  catChipText: { fontSize: 12, color: COLORS.textMuted },
  catChipTextActive: { fontSize: 12, color: '#fff', fontWeight: '700' },

  quickQtyRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  quickQtyChip: { backgroundColor: COLORS.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  quickQtyText: { color: COLORS.textLight, fontSize: 12, fontWeight: '600' },

  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 12, gap: 20 },
  cancel: { color: COLORS.textMuted, paddingVertical: 10 },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 14 },
  saveText: { color: '#fff', fontWeight: '700' },
});
