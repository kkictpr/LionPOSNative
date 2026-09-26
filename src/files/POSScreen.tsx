import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Alert, Image, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import {
  listProducts, listCategories, createSale, CartLine,
  getSetting, getStore, listVariants,
} from '../db/repository';
import { printReceipt, reconnectSavedPrinter, getSavedPrinterMac } from '../utils/printer';
import {
  LionButton, LionChip, LionInput, LionModal, LionProductCard,
  colors, radius, useResponsive,
} from '../components/lion';

/**
 * Tablet / iPad: ย้ายตะกร้าเป็น Side Cart ทางขวา (Bible ข้อ 4)
 * มือถือ = layout เดิมทุกอย่าง (ตะกร้าอยู่ด้านล่าง)
 * ถ้า Gatekeeper อยากให้ tablet ใช้ layout เดียวกับมือถือ 100% ให้ตั้งเป็น false
 */
const TABLET_SIDE_CART = true;
const SIDE_CART_WIDTH = 360;

export default function POSScreen() {
  const { employee } = useAuth();
  const { width, isTablet, columnsFor } = useResponsive();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountPct, setDiscountPct] = useState('0');
  const [taxRate, setTaxRate] = useState(0);
  const [variantPickFor, setVariantPickFor] = useState<any | null>(null);
  const [variantOptions, setVariantOptions] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [confirmCheckout, setConfirmCheckout] = useState(false);

  const load = useCallback(async () => {
    if (!employee) return;
    setProducts(await listProducts(employee.store_id));
    setCategories(await listCategories());
    setTaxRate(parseFloat((await getSetting('tax_rate')) ?? '0'));
  }, [employee]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = products.filter(p => (!activeCategory || p.category_id===activeCategory) && p.name.toLowerCase().includes(search.toLowerCase()));

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
    setSelectedProduct(p);
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
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const doCheckout = async () => {
    if (!employee || cart.length === 0) return;
    try {
      const result = await createSale({
        storeId: employee.store_id,
        employeeId: employee.id,
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

  const sideCart = TABLET_SIDE_CART && isTablet;
  const columns = columnsFor(sideCart ? width - SIDE_CART_WIDTH : width);
  const closeVariantPicker = () => { setVariantPickFor(null); setVariantOptions([]); };

  return (
    <View style={styles.wrap}>
      <View style={[styles.row, sideCart && styles.rowSide]}>
        <View style={styles.grid}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.catRow}
            data={[{ id: null, name: 'ทั้งหมด' }, ...categories]}
            keyExtractor={(item, idx) => item.id ?? `all-${idx}`}
            renderItem={({ item }) => (
              <LionChip
                label={item.name}
                active={activeCategory === item.id}
                onPress={() => setActiveCategory(item.id)}
              />
            )}
          />
          <LionInput
            icon="🔍"
            placeholder="ค้นหาสินค้า..."
            value={search}
            onChangeText={setSearch}
            containerStyle={styles.search}
          />
          <FlatList
            key={`pos-cols-${columns}`}
            data={filtered}
            numColumns={columns}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.productList}
            renderItem={({ item }) => (
              <LionProductCard
                style={[styles.productCard, columns > 1 && { flex: 1 / columns }]}
                name={item.name}
                price={item.price}
                quantity={item.quantity}
                imageUri={item.image_uri}
                onPress={() => addToCart(item)}
              />
            )}
            ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีสินค้า — เพิ่มได้จากเมนูสต็อก</Text>}
          />
        </View>

        <View style={[styles.cart, sideCart && styles.cartSide]}>
          <View style={styles.cartHeader}>
            <Text style={styles.cartTitle}>ตะกร้า ({cartItemCount})</Text>
            <LionChip label="ล้างตะกร้า" tone="danger" onPress={() => setCart([])} style={styles.noMargin} />
          </View>

          {sideCart && (
            <FlatList
              style={styles.cartLines}
              data={cart}
              keyExtractor={(i, idx) => i.variant_id ? `${i.product_id}:${i.variant_id}` : `${i.product_id}:${idx}`}
              renderItem={({ item }) => (
                <View style={styles.cartLine}>
                  <View style={styles.flex1}>
                    <Text style={styles.cartLineName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.cartLinePrice}>฿{item.unit_price.toFixed(2)}</Text>
                  </View>
                  <Pressable style={styles.stepBtn} onPress={() => changeQty(item, -1)}>
                    <View style={styles.stepCircle}><Text style={styles.stepText}>−</Text></View>
                  </Pressable>
                  <Text style={styles.qty}>{item.quantity}</Text>
                  <Pressable style={styles.stepBtn} onPress={() => changeQty(item, 1)}>
                    <View style={styles.stepCircle}><Text style={styles.stepText}>+</Text></View>
                  </Pressable>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีสินค้าในตะกร้า</Text>}
            />
          )}

          <View style={styles.summaryLine}><Text style={styles.summaryLabel}>ยอดก่อนหักส่วนลด</Text><Text style={styles.summaryValue}>฿{subtotal.toFixed(2)}</Text></View>
          <View style={styles.summaryLine}><Text style={styles.summaryLabel}>ส่วนลด</Text><Text style={styles.summaryValue}>−฿{discountAmt.toFixed(2)}</Text></View>
          <View style={styles.summaryLine}><Text style={styles.summaryLabel}>ภาษี ({taxRate}%)</Text><Text style={styles.summaryValue}>฿{taxAmt.toFixed(2)}</Text></View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>ยอดรวม</Text>
            <Text style={styles.totalValue}>฿{total.toFixed(2)}</Text>
          </View>
          <LionButton
            title="ชำระเงิน"
            onPress={() => setConfirmCheckout(true)}
            disabled={cart.length === 0}
            style={[styles.checkoutBtn, sideCart && styles.checkoutSide]}
          />
        </View>
      </View>

      <LionModal
        visible={confirmCheckout}
        onRequestClose={() => setConfirmCheckout(false)}
        title="ตรวจสอบรายการ"
        headerRight={
          <Pressable onPress={() => setConfirmCheckout(false)} style={styles.closeBtn} accessibilityLabel="ปิด">
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        }
        cardStyle={styles.confirmCard}>
        <FlatList
          style={styles.confirmList}
          data={cart}
          keyExtractor={(i,idx)=>i.variant_id?`${i.product_id}:${i.variant_id}`:`${i.product_id}:${idx}`}
          renderItem={({item})=>(
            <View style={styles.confirmRow}>
              <View style={styles.popupThumbBox}>
                {products.find(p=>p.id===item.product_id)?.image_uri ? (
                  <Image source={{uri:products.find(p=>p.id===item.product_id)?.image_uri}} style={styles.popupThumb} resizeMode="contain"/>
                ) : (
                  <View style={styles.popupThumbPlaceholder}/>
                )}
              </View>
              <View style={styles.flex1}>
                <Text style={styles.confirmName}>{item.name}</Text>
                <Text style={styles.confirmPrice}>฿{item.unit_price.toFixed(2)}</Text>
              </View>
              <Text style={styles.confirmQty}>{item.quantity}</Text>
              <Text style={styles.confirmLineTotal}>฿{(item.quantity*item.unit_price).toFixed(2)}</Text>
            </View>
          )}
        />
        <View style={styles.confirmSummary}>
          <View style={styles.summaryLine}><Text style={styles.summaryLabel}>ยอดก่อนหักส่วนลด</Text><Text style={styles.summaryValue}>฿{subtotal.toFixed(2)}</Text></View>
          <View style={styles.summaryLine}><Text style={styles.summaryLabel}>ส่วนลด</Text><Text style={styles.summaryValue}>-฿{discountAmt.toFixed(2)}</Text></View>
          <View style={styles.summaryLine}><Text style={styles.summaryLabel}>ภาษี ({taxRate}%)</Text><Text style={styles.summaryValue}>฿{taxAmt.toFixed(2)}</Text></View>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>ยอดรวม</Text>
          <Text style={styles.totalValue}>฿{total.toFixed(2)}</Text>
        </View>
        <View style={styles.confirmActions}>
          <LionButton title="ยกเลิก" variant="secondary" style={styles.flex1} onPress={()=>setConfirmCheckout(false)} />
          <LionButton title="ยืนยันชำระเงิน" style={styles.flex1} onPress={async()=>{setConfirmCheckout(false); await doCheckout();}} />
        </View>
      </LionModal>

      <LionModal
        visible={!!variantPickFor}
        onRequestClose={closeVariantPicker}
        title={`เลือกตัวเลือก: ${variantPickFor?.name ?? ''}`}>
        {variantOptions.map(v => (
          <Pressable
            key={v.id}
            style={styles.variantRow}
            android_ripple={{ color: 'rgba(245,158,11,0.18)' }}
            onPress={() => pickVariant(v)}>
            <Text style={styles.variantName}>{v.name}</Text>
            <Text style={styles.variantPrice}>฿{(v.price ?? variantPickFor?.price ?? 0).toFixed(2)}</Text>
          </Pressable>
        ))}
        <LionButton title="ยกเลิก" variant="ghost" onPress={closeVariantPicker} style={styles.variantCancel} />
      </LionModal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background },
  row: { flex: 1, flexDirection: 'column' },
  rowSide: { flexDirection: 'row' },
  grid: { flex: 1 },
  flex1: { flex: 1 },
  noMargin: { marginRight: 0 },

  catRow: { paddingHorizontal: 8, paddingTop: 8, maxHeight: 56, flexGrow: 0 },
  search: { marginHorizontal: 8, marginTop: 6, marginBottom: 4 },
  productList: { paddingBottom: 8 },
  productCard: { marginHorizontal: 8, marginVertical: 4 },
  empty: { color: colors.textMuted, padding: 16, textAlign: 'center' },

  // Cart (มือถือ = ด้านล่าง เหมือนเดิม; ค่าระยะขอบล่าง 42/22 คงตามของเดิม)
  cart: {
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 42,
    minHeight: 198,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    borderTopWidth: 1,
    borderColor: 'rgba(148,163,184,0.15)',
  },
  cartSide: {
    width: SIDE_CART_WIDTH,
    paddingBottom: 16,
    minHeight: 0,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: 0,
    borderTopWidth: 0,
    borderLeftWidth: 1,
  },
  cartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cartTitle: { fontWeight: '800', fontSize: 16, color: colors.text },
  cartLines: { flex: 1, marginBottom: 8 },
  cartLine: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.12)' },
  cartLineName: { fontWeight: '600', fontSize: 14, color: colors.text },
  cartLinePrice: { fontSize: 12, color: colors.primary, marginTop: 2 },
  stepBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  stepCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.text, fontSize: 18, fontWeight: '700', lineHeight: 22 },
  qty: { minWidth: 20, textAlign: 'center', color: colors.text, fontWeight: '700' },

  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  summaryLabel: { color: colors.textMuted, fontSize: 12 },
  summaryValue: { color: colors.text, fontSize: 13 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(148,163,184,0.18)' },
  totalLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  totalValue: { fontSize: 20, fontWeight: '800', color: colors.primary },
  checkoutBtn: { marginTop: 8, marginBottom: 22 },
  checkoutSide: { marginBottom: 0 },

  // Confirm modal
  confirmCard: { maxHeight: '82%' },
  confirmList: { flexGrow: 0, maxHeight: 390 },
  confirmRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.12)' },
  confirmName: { fontWeight: '600', color: colors.text },
  confirmPrice: { color: colors.primary },
  confirmQty: { color: colors.text, marginHorizontal: 8 },
  confirmLineTotal: { width: 76, textAlign: 'right', color: colors.text },
  confirmSummary: { marginTop: 12 },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  popupThumbBox: { width: 44, height: 44, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.background, marginRight: 10, alignItems: 'center', justifyContent: 'center' },
  popupThumb: { width: '100%', height: '100%' },
  popupThumbPlaceholder: { width: '100%', height: '100%', backgroundColor: colors.card },
  closeBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginRight: -12 },
  closeText: { fontSize: 18, color: colors.textMuted },

  // Variant modal
  variantRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 52, borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.12)' },
  variantName: { fontSize: 14, color: colors.text },
  variantPrice: { fontSize: 14, color: colors.primary, fontWeight: '700' },
  variantCancel: { marginTop: 12 },
});
