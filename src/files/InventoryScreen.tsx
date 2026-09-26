import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Alert, Image, Pressable,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import {
  listProducts, upsertProduct, adjustStock, listCategories, upsertCategory,
  listVariants, upsertVariant, deleteVariant, deactivateProduct,
} from '../db/repository';
import ImagePicker from 'react-native-image-crop-picker';
import {launchImageLibrary} from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import {
  LionButton, LionChip, LionInput, LionModal, LionProductCard,
  colors, useResponsive,
} from '../components/lion';

export default function InventoryScreen() {
  const { employee } = useAuth();
  const { width, columnsFor } = useResponsive();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [restockTarget, setRestockTarget] = useState<any | null>(null);
  const [restockQty, setRestockQty] = useState('');
  const [restockCost, setRestockCost] = useState('');
  const [variantTarget, setVariantTarget] = useState<any | null>(null);
  const [variants, setVariants] = useState<any[]>([]);
  const [newVariantName, setNewVariantName] = useState('');
  const [newVariantPrice, setNewVariantPrice] = useState('');
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [initialStock, setInitialStock] = useState('0');

  const load = useCallback(async () => {
    if (!employee) return;
    setProducts(await listProducts(employee.store_id));
    setCategories(await listCategories());
  }, [employee]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pickCroppedImage = async (mode: 'camera' | 'library') => {
    try {
      const image = mode === 'camera'
        ? await ImagePicker.openCamera({
            cropping: true,
            width: 800,
            height: 800,
            compressImageQuality: 0.9,
            mediaType: 'photo',
          })
        : await (async () => {
            const result = await launchImageLibrary({
              mediaType: 'photo',
              selectionLimit: 1,
            });

            const asset = result.assets?.[0];

            if (!asset?.uri) {
              throw { code: 'E_PICKER_CANCELLED' };
            }

            const tempPath = `${RNFS.CachesDirectoryPath}/lionpos_temp_${Date.now()}.jpg`;

            await RNFS.copyFile(asset.uri, tempPath);

            const cropped = await ImagePicker.openCropper({
              path: tempPath,
              width: 800,
              height: 800,
              compressImageQuality: 0.9,
            });

            return cropped;
          })();

      if (image?.path) setImageUri(image.path);
    } catch (e: any) {
      if (e?.code === 'E_PICKER_CANCELLED') return;
      Alert.alert('ไม่สามารถเลือกรูปได้', e?.message ?? 'เกิดข้อผิดพลาด');
    }
  };


  const saveProduct = async () => {
    if (!name.trim() || !price.trim()) {
      Alert.alert('กรอกข้อมูลให้ครบ', 'ต้องมีชื่อสินค้าและราคา');
      return;
    }
    const product = await upsertProduct({ id: editingProduct?.id, name: name.trim(), price: parseFloat(price), cost: cost.trim() ? parseFloat(cost) : 0, category_id: categoryId ?? undefined, image_uri: imageUri || undefined });
    if (!editingProduct && employee && Number(initialStock) > 0) {
      await adjustStock(product.id, employee.store_id, Number(initialStock), 'restock');
    }
    setName(''); setPrice(''); setCost(''); setInitialStock('0');
    setCategoryId(null); setImageUri(''); setEditingProduct(null); setModalOpen(false);
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


  const editProduct = (item: any) => {
    setEditingProduct(item);
    setName(item.name);
    setPrice(String(item.price));
    setCost(String(item.cost ?? 0));
    setCategoryId(item.category_id ?? null);
    setImageUri(item.image_uri ?? '');
    setInitialStock(String(item.quantity ?? 0));
    setModalOpen(true);
  };

  const removeProduct = (item: any) => {
    Alert.alert('ลบสินค้า', `ลบ "${item.name}" ใช่หรือไม่?`, [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ลบ', style: 'destructive', onPress: async () => { await deactivateProduct(item.id); load(); } }
    ]);
  };

  const openAddProduct = () => {
    setEditingProduct(null);
    setName(''); setPrice(''); setCost('');
    setInitialStock('0');
    setCategoryId(null); setImageUri('');
    setModalOpen(true);
  };

  const cancelProductModal = () => {
    setEditingProduct(null);
    setName(''); setPrice(''); setCost(''); setInitialStock('0');
    setCategoryId(null); setImageUri('');
    setModalOpen(false);
  };

  const columns = columnsFor(width, 340);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>คลังสินค้า</Text>
        <View style={styles.headerActions}>
          <LionButton title="+ หมวดหมู่" variant="secondary" onPress={() => setCatModalOpen(true)} />
          <LionButton title="+ เพิ่มสินค้า" onPress={openAddProduct} />
        </View>
      </View>

      <FlatList
        key={`inv-cols-${columns}`}
        data={products}
        numColumns={columns}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <LionProductCard
            style={[styles.card, columns > 1 && { flex: 1 / columns }]}
            name={item.name}
            price={item.price}
            cost={item.cost}
            showProfit
            quantity={item.quantity}
            imageUri={item.image_uri}
            categoryName={item.category_name}
            imageSide="left"
            imageSize={72}
            footer={
              <View style={styles.actions}>
                <LionButton title="รับสต็อก" variant="secondary" style={styles.flex1} onPress={() => setRestockTarget(item)} />
                <LionButton title="แก้ไข" variant="secondary" style={styles.flex1} textStyle={styles.editText} onPress={() => editProduct(item)} />
                <LionButton title="ลบ" variant="danger" style={styles.flex1} onPress={() => removeProduct(item)} />
              </View>
            }
          />
        )}
        ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีสินค้า กดปุ่ม "+ เพิ่มสินค้า" เพื่อเริ่มต้น</Text>}
      />

      <LionModal
        visible={modalOpen}
        onRequestClose={cancelProductModal}
        scroll
        title={editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}>
        <LionInput label="ชื่อสินค้า" placeholder="ชื่อสินค้า" value={name} onChangeText={setName} />
        <LionInput label="ราคาขาย (บาท)" placeholder="ราคา" value={price} onChangeText={setPrice} keyboardType="numeric" />
        <LionInput label="ต้นทุน (บาท)" placeholder="ต้นทุน" value={cost} onChangeText={setCost} keyboardType="numeric" />

        <Text style={styles.profitLine}>กำไรต่อหน่วย: ฿{((Number(price)||0)-(Number(cost)||0)).toFixed(2)}</Text>

        {editingProduct ? (
          <LionInput label="สต๊อกคงเหลือ" placeholder="จำนวนคงเหลือ" value={initialStock} onChangeText={setInitialStock} keyboardType="numeric" />
        ) : (
          <LionInput label="รับสต๊อกเริ่มต้น" placeholder="0" value={initialStock} onChangeText={setInitialStock} keyboardType="numeric" />
        )}

        <Text style={styles.label}>รูปสินค้า</Text>
        <View style={styles.imageSection}>
          {imageUri ? (
            <Image source={{uri:imageUri}} style={styles.imagePreview}/>
          ) : (
            <View style={[styles.imagePreview, styles.imagePlaceholder]}><Text>🖼️</Text></View>
          )}

          <View style={styles.imageActionRow}>
            <Pressable style={styles.imageActionCard} android_ripple={{ color: 'rgba(245,158,11,0.18)' }} onPress={()=>pickCroppedImage('camera')}>
              <Text style={styles.imageActionIcon}>📷</Text>
              <Text style={styles.imageActionText}>ถ่ายรูป</Text>
            </Pressable>

            <Pressable style={styles.imageActionCard} android_ripple={{ color: 'rgba(245,158,11,0.18)' }} onPress={()=>pickCroppedImage('library')}>
              <Text style={styles.imageActionIcon}>🖼️</Text>
              <Text style={styles.imageActionText}>เลือกจากคลัง</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.label}>หมวดหมู่</Text>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={categories}
          keyExtractor={c => c.id}
          style={styles.catList}
          renderItem={({ item }) => (
            <LionChip
              label={item.name}
              active={categoryId === item.id}
              onPress={() => setCategoryId(categoryId === item.id ? null : item.id)}
            />
          )}
        />
        <View style={styles.modalActions}>
          <LionButton title="ยกเลิก" variant="ghost" onPress={cancelProductModal} />
          <LionButton title={editingProduct ? 'บันทึกการแก้ไข' : 'บันทึก'} onPress={saveProduct} />
        </View>
      </LionModal>

      <LionModal visible={catModalOpen} onRequestClose={() => setCatModalOpen(false)} title="เพิ่มหมวดหมู่">
        <LionInput placeholder="ชื่อหมวดหมู่" value={newCatName} onChangeText={setNewCatName} />
        <View style={styles.modalActions}>
          <LionButton title="ยกเลิก" variant="ghost" onPress={() => setCatModalOpen(false)} />
          <LionButton title="บันทึก" onPress={saveCategory} />
        </View>
      </LionModal>

      <LionModal visible={!!restockTarget} onRequestClose={() => setRestockTarget(null)} title={`รับสต็อก: ${restockTarget?.name ?? ''}`}>
        <LionInput placeholder="จำนวนที่รับเข้า" value={restockQty} onChangeText={setRestockQty} keyboardType="numeric" />
        <View style={styles.modalActions}>
          <LionButton title="ยกเลิก" variant="ghost" onPress={() => setRestockTarget(null)} />
          <LionButton title="บันทึก" onPress={doRestock} />
        </View>
      </LionModal>

      <LionModal visible={!!variantTarget} onRequestClose={() => setVariantTarget(null)} title={`ตัวเลือกสินค้า: ${variantTarget?.name ?? ''}`} cardStyle={styles.variantCard}>
        <FlatList
          data={variants}
          keyExtractor={v => v.id}
          style={styles.variantList}
          renderItem={({ item }) => (
            <View style={styles.variantRow}>
              <Text style={styles.variantName}>{item.name}</Text>
              <Text style={styles.variantPrice}>
                {item.price != null ? `฿${item.price.toFixed(2)}` : 'ราคาเดียวกับสินค้าหลัก'}
              </Text>
              <Pressable style={styles.variantDelete} onPress={() => removeVariant(item.id)}>
                <Text style={styles.variantDeleteText}>ลบ</Text>
              </Pressable>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptySmall}>ยังไม่มีตัวเลือก เช่น ไซส์ S/M/L</Text>}
        />
        <LionInput placeholder="ชื่อตัวเลือก เช่น ไซส์ M" value={newVariantName} onChangeText={setNewVariantName} />
        <LionInput placeholder="ราคา (เว้นว่างถ้าใช้ราคาเดียวกับสินค้าหลัก)" value={newVariantPrice} onChangeText={setNewVariantPrice} keyboardType="numeric" />
        <View style={styles.modalActions}>
          <LionButton title="ปิด" variant="ghost" onPress={() => setVariantTarget(null)} />
          <LionButton title="เพิ่มตัวเลือก" onPress={addVariant} />
        </View>
      </LionModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 12 },
  flex1: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerActions: { flexDirection: 'row', gap: 8 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },

  list: { paddingBottom: 24 },
  card: { margin: 6 },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  editText: { color: colors.primary },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40 },
  emptySmall: { color: colors.textMuted, textAlign: 'center', paddingVertical: 12 },

  // Product editor
  label: { fontSize: 12, color: colors.textMuted, marginBottom: 6 },
  profitLine: { fontSize: 13, fontWeight: '700', color: colors.success, marginBottom: 12 },
  imageSection: { alignItems: 'center', marginBottom: 12 },
  imagePreview: { width: 96, height: 96, borderRadius: 16, marginBottom: 12 },
  imagePlaceholder: { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  imageActionRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', gap: 12 },
  imageActionCard: {
    flex: 1,
    minHeight: 72,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imageActionIcon: { fontSize: 24, marginBottom: 4 },
  imageActionText: { fontSize: 13, fontWeight: '600', color: colors.text },
  catList: { flexGrow: 0, marginBottom: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 8 },

  // Variants
  variantCard: { maxHeight: '80%' },
  variantList: { maxHeight: 160, marginBottom: 10 },
  variantRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.12)' },
  variantName: { flex: 1, fontSize: 13, color: colors.text },
  variantPrice: { fontSize: 13, color: colors.primary, marginRight: 4 },
  variantDelete: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  variantDeleteText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
});
