import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput, Modal, Image,
  Animated, Pressable,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import {
  listProducts, listCategories, createSale, CartLine ,
  getSetting, getStore, listVariants,
} from '../db/repository';
import { printReceipt, reconnectSavedPrinter, getSavedPrinterMac } from '../utils/printer';

type ProductCardProps = {
  item: any;
  badge: { label: string; bg: string; color: string };
  onPress: () => void;
  onAdd: () => void;
};

function ProductCard({ item, badge, onPress, onAdd }: ProductCardProps) {
  const cardScale = useRef(new Animated.Value(1)).current;
  const addScale = useRef(new Animated.Value(1)).current;

  const pressIn = (val: Animated.Value) =>
    Animated.spring(val, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  const pressOut = (val: Animated.Value) =>
    Animated.spring(val, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();

  return (
    <Animated.View style={{ transform: [{ scale: cardScale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => pressIn(cardScale)}
        onPressOut={() => pressOut(cardScale)}
        android_ripple={{ color: 'rgba(255,138,0,0.22)' }}
        style={styles.productCardPressable}>
        <LinearGradient
          colors={['#26314C', '#1E293B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.productCard}>
          <View style={styles.productRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
              <Text style={styles.productPrice}>฿{item.price.toFixed(2)}</Text>
              <View style={[styles.stockBadge, { backgroundColor: badge.bg }]}>
                <Text style={[styles.stockBadgeText, { color: badge.color }]}>{badge.label}</Text>
              </View>
            </View>
            <View style={styles.thumbBox}>
              {item.image_uri ? (
                <Image source={{ uri: item.image_uri }} style={styles.thumb} resizeMode="cover" />
              ) : (
                <View style={styles.thumbPlaceholder}><Text style={{ fontSize: 22 }}>🍦</Text></View>
              )}
            </View>
            <Animated.View style={{ transform: [{ scale: addScale }] }}>
              <Pressable
                onPress={onAdd}
                onPressIn={() => pressIn(addScale)}
                onPressOut={() => pressOut(addScale)}
                android_ripple={{ color: '#fff', borderless: true, radius: 20 }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.addBtn}>
                <Text style={styles.addBtnText}>+</Text>
              </Pressable>
            </Animated.View>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

export default function POSScreen() {
  const { employee } = useAuth();
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

  // UI-only helper: how to badge remaining stock. Does not affect stock data itself.
  const stockBadge = (qty: number) => {
    if (qty <= 0) return { label: 'หมด', bg: 'rgba(239,68,68,0.18)', color: COLORS.danger };
    if (qty <= 5) return { label: `ใกล้หมด ${qty}`, bg: 'rgba(245,158,11,0.18)', color: COLORS.warning };
    return { label: `คงเหลือ ${qty}`, bg: 'rgba(16,185,129,0.18)', color: COLORS.success };
  };

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

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.grid}>
          <FlatList
            horizontal
            style={styles.catRow}
            showsHorizontalScrollIndicator={false}
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
          <View style={styles.searchWrap}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder='ค้นหาสินค้า...'
              placeholderTextColor="#64748B"
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} style={styles.searchClearBtn} hitSlop={{top:8,bottom:8,left:8,right:8}}>
                <Text style={styles.searchClearText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          <FlatList
            data={filtered}
            numColumns={1}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingBottom: 12 }}
            renderItem={({ item }) => (
              <ProductCard
                item={item}
                badge={stockBadge(item.quantity ?? 0)}
                onPress={() => addToCart(item)}
                onAdd={() => addToCart(item)}
              />
            )}
            ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีสินค้า — เพิ่มได้จากเมนูสต็อก</Text>}
          />
        </View>
        <View style={styles.cart}>
          <View style={styles.cartHandleWrap}>
            <View style={styles.cartHandle} />
          </View>
          <View style={styles.cartHeader}>
            <Text style={styles.cartTitle}>ตะกร้า ({cartItemCount})</Text>
            <TouchableOpacity onPress={() => setCart([])} style={styles.clearCartBtn}>
              <Text style={styles.clearCartText}>ล้างตะกร้า</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.summaryLine}><Text style={styles.summaryLabel}>ยอดก่อนหักส่วนลด</Text><Text style={styles.summaryValue}>฿{subtotal.toFixed(2)}</Text></View>
          <View style={styles.summaryLine}><Text style={styles.summaryLabel}>ส่วนลด</Text><Text style={styles.summaryValue}>−฿{discountAmt.toFixed(2)}</Text></View>
          <View style={styles.summaryLine}><Text style={styles.summaryLabel}>ภาษี ({taxRate}%)</Text><Text style={styles.summaryValue}>฿{taxAmt.toFixed(2)}</Text></View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>ยอดรวม</Text>
            <Text style={styles.totalValue}>฿{total.toFixed(2)}</Text>
          </View>
          <TouchableOpacity
            onPress={() => setConfirmCheckout(true)}
            disabled={cart.length === 0}
            activeOpacity={0.85}
            style={cart.length === 0 && styles.checkoutBtnDisabled}>
            <LinearGradient
              colors={['#FFB84D', '#FF8A00', '#E67300']}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 0}}
              style={styles.checkoutBtn}>
              <Text style={styles.checkoutText}>ชำระเงิน</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>


      <Modal visible={confirmCheckout} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={[styles.modalCard,{width:'92%',maxHeight:'86%'}]}>
            <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <Text style={styles.modalTitle}>ตะกร้าสินค้า ({cartItemCount})</Text>
              <TouchableOpacity onPress={()=>setConfirmCheckout(false)}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
            </View>
            <FlatList
              style={{maxHeight:340}}
              data={cart}
              keyExtractor={(i,idx)=>i.variant_id?`${i.product_id}:${i.variant_id}`:`${i.product_id}:${idx}`}
              renderItem={({item})=>(
                <View style={styles.cartLineRow}>
                  <View style={styles.popupThumbBox}>
                    {products.find(p=>p.id===item.product_id)?.image_uri ? (
                      <Image source={{uri:products.find(p=>p.id===item.product_id)?.image_uri}} style={styles.popupThumb} resizeMode="cover"/>
                    ) : (
                      <View style={styles.popupThumbPlaceholder}><Text style={{fontSize:16}}>🍦</Text></View>
                    )}
                  </View>
                  <View style={{flex:1}}>
                    <Text style={styles.cartLineName}>{item.name}</Text>
                    <Text style={styles.cartLinePrice}>฿{item.unit_price.toFixed(2)}</Text>
                  </View>
                  <View style={styles.qtyStepper}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => changeQty(item, -1)}>
                      <Text style={styles.qtyBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.qtyValue}>{item.quantity}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => changeQty(item, 1)}>
                      <Text style={styles.qtyBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.trashBtn} onPress={() => changeQty(item, -item.quantity)}>
                    <Text style={{fontSize:16}}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.empty}>ตะกร้าว่าง</Text>}
            />
            <View style={{marginTop:12}}>
              <View style={styles.summaryLine}><Text style={styles.summaryLabel}>รายการ ({cart.length})</Text><Text style={styles.summaryValue}>฿{subtotal.toFixed(2)}</Text></View>
              <View style={styles.summaryLine}><Text style={styles.summaryLabel}>ส่วนลด</Text><Text style={styles.summaryValue}>-฿{discountAmt.toFixed(2)}</Text></View>
              <View style={styles.summaryLine}><Text style={styles.summaryLabel}>ภาษี ({taxRate}%)</Text><Text style={styles.summaryValue}>฿{taxAmt.toFixed(2)}</Text></View>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>ยอดรวม</Text>
              <Text style={styles.totalValue}>฿{total.toFixed(2)}</Text>
            </View>
            <View style={{flexDirection:'row',gap:10,marginTop:10}}>
              <TouchableOpacity style={[styles.checkoutBtn,{flex:1,backgroundColor:'#334155'}]} onPress={()=>setConfirmCheckout(false)}>
                <Text style={[styles.checkoutText,{color:'#F8FAFC'}]}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[{flex:1}, cart.length === 0 && styles.checkoutBtnDisabled]}
                disabled={cart.length === 0}
                activeOpacity={0.85}
                onPress={async()=>{setConfirmCheckout(false); await doCheckout();}}>
                <LinearGradient
                  colors={['#FFB84D', '#FF8A00', '#E67300']}
                  start={{x: 0, y: 0}}
                  end={{x: 1, y: 0}}
                  style={styles.checkoutBtn}>
                  <Text style={styles.checkoutText}>ยืนยันชำระเงิน</Text>
                </LinearGradient>
              </TouchableOpacity>
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
              <Text style={[styles.cancel, { marginTop: 14 }]}>ยกเลิก</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── LionPOS palette ──────────────────────────────────────────────
const COLORS = {
  primary: '#FF8A00',
  background: '#0F172A',
  surface: '#1E293B',
  card: '#334155',
  textLight: '#F8FAFC',
  textMuted: '#94A3B8',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
};

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.background },
  row: { flex: 1, flexDirection: 'column' },
  grid: { flex: 1 },
  catRow: { paddingHorizontal: 8, paddingTop: 10, maxHeight: 44 },
  catChip: { borderWidth: 1, borderColor: COLORS.card, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginRight: 8, backgroundColor: COLORS.surface, height: 32 },
  catChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catChipText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  catChipTextActive: { color: '#fff' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 8, marginTop: 8, marginBottom: 6, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.card, borderRadius: 10, paddingHorizontal: 12, height: 40 },
  searchIcon: { fontSize: 13, marginRight: 8, opacity: 0.6 },
  searchInput: { flex: 1, color: COLORS.textLight, fontSize: 14, padding: 0 },
  searchClearBtn: { width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  searchClearText: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700' },
  productCardPressable:{marginHorizontal:8,marginVertical:3,borderRadius:12,overflow:'hidden'},
  productCard:{paddingHorizontal:12,paddingVertical:8,minHeight:70,borderWidth:1,borderColor:'#2A3A57'},
  productRow:{flexDirection:'row',alignItems:'center'},
  thumbBox:{width:56,height:56,borderRadius:28,overflow:'hidden',backgroundColor:'rgba(255,138,0,0.15)',alignItems:'center',justifyContent:'center',marginRight:10},
  thumb:{width:'100%',height:'100%'},
  thumbPlaceholder:{width:'100%',height:'100%',alignItems:'center',justifyContent:'center'},
  addBtn:{width:28,height:28,borderRadius:14,backgroundColor:COLORS.primary,alignItems:'center',justifyContent:'center',shadowColor:COLORS.primary,shadowOpacity:0.5,shadowRadius:4,shadowOffset:{width:0,height:2},elevation:3},
  addBtnText:{color:'#fff',fontSize:17,fontWeight:'800',marginTop:-1},
  stockBadge:{alignSelf:'flex-start',borderRadius:8,paddingHorizontal:7,paddingVertical:2,marginTop:3},
  stockBadgeText:{fontSize:10,fontWeight:'700'},
  popupThumbBox:{width:44,height:44,borderRadius:22,overflow:'hidden',backgroundColor:'rgba(255,138,0,0.15)',marginRight:10,alignItems:'center',justifyContent:'center'},
  popupThumb:{width:'100%',height:'100%'},
  popupThumbPlaceholder:{width:'100%',height:'100%',alignItems:'center',justifyContent:'center'},
  productName:{fontWeight:'600',fontSize:14,color:COLORS.textLight},
  productPrice:{color:COLORS.primary,fontWeight:'700',fontSize:13,marginTop:2},
  productStock:{color:COLORS.textMuted,fontSize:10,marginTop:1},
  empty: { color: COLORS.textMuted, padding: 16, textAlign: 'center' },
  cart:{backgroundColor:COLORS.surface,paddingHorizontal:14,paddingTop:10,paddingBottom:30,borderTopLeftRadius:22,borderTopRightRadius:22,borderTopWidth:1,borderTopColor:COLORS.card,height:214,shadowColor:'#000',shadowOpacity:0.35,shadowRadius:10,shadowOffset:{width:0,height:-4},elevation:12},
  cartHandleWrap:{alignItems:'center',marginBottom:8},
  cartHandle:{width:56,height:5,borderRadius:3,backgroundColor:COLORS.primary,opacity:0.55},
  cartTitle: { fontWeight: '700', fontSize: 15, color: COLORS.textLight },
  summaryLine:{flexDirection:'row',justifyContent:'space-between',marginTop:3},
  summaryLabel: { color: COLORS.textMuted, fontSize: 12 },
  summaryValue: { color: COLORS.textLight, fontSize: 12 },
  totalRow:{flexDirection:'row',justifyContent:'space-between',marginTop:6,paddingTop:6,borderTopWidth:1,borderTopColor:COLORS.card},
  totalLabel: { fontSize: 15, fontWeight: '600', color: COLORS.textLight },
  totalValue: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
  checkoutBtn:{backgroundColor:COLORS.primary,marginTop:8,paddingVertical:12,borderRadius:12,alignItems:'center'},
  checkoutBtnDisabled:{opacity:0.4},
  checkoutText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  cartHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:6},
  clearCartBtn:{paddingHorizontal:8,paddingVertical:6,borderRadius:8,backgroundColor:'rgba(239,68,68,0.15)'},
  clearCartText:{color:COLORS.danger,fontSize:11,fontWeight:'700'},
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 20, width: '85%', borderWidth: 1, borderColor: COLORS.card },
  modalTitle: { fontWeight: '700', fontSize: 16, marginBottom: 4, color: COLORS.textLight },
  modalClose: { fontSize: 18, color: COLORS.textMuted },
  modalSub: { color: COLORS.textMuted, fontSize: 12, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: COLORS.card, borderRadius: 8, padding: 10, marginBottom: 4, color: COLORS.textLight },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
  cancel: { color: COLORS.textMuted, marginRight: 20, paddingVertical: 9 },
  saveBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8 },
  saveText: { color: '#fff', fontWeight: '700' },
  variantRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.card },
  variantName: { fontSize: 14, color: COLORS.textLight },
  variantPrice: { fontSize: 14, color: COLORS.primary, fontWeight: '700' },

  cartLineRow:{flexDirection:'row',alignItems:'center',paddingVertical:8,borderBottomWidth:1,borderBottomColor:COLORS.card},
  cartLineName:{fontWeight:'600',fontSize:13,color:COLORS.textLight},
  cartLinePrice:{color:COLORS.primary,fontSize:12,marginTop:2},
  qtyStepper:{flexDirection:'row',alignItems:'center',backgroundColor:COLORS.card,borderRadius:8,marginRight:8},
  qtyBtn:{width:26,height:26,alignItems:'center',justifyContent:'center'},
  qtyBtnText:{color:COLORS.textLight,fontSize:16,fontWeight:'700'},
  qtyValue:{color:COLORS.textLight,fontSize:13,fontWeight:'700',minWidth:18,textAlign:'center'},
  trashBtn:{width:30,height:30,alignItems:'center',justifyContent:'center'},
});
