import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput, Modal, Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import {
  listProducts, listCategories, createSale, CartLine ,
  getSetting, getStore, listVariants,
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

  return (
    <View style={styles.wrap}>
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
          <TextInput
            style={styles.searchInput}
            placeholder='ค้นหาสินค้า...'
            value={search}
            onChangeText={setSearch}
          />
          <FlatList
            data={filtered}
            numColumns={1}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.productCard} onPress={() => addToCart(item)}>
                <View style={styles.productRow}>
                  <View style={{flex:1}}>
                    <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.productPrice}>฿{item.price.toFixed(2)}</Text>
                    <Text style={styles.productStock}>คงเหลือ {item.quantity ?? 0}</Text>
                  </View>
                  {item.image_uri ? <Image source={{uri:item.image_uri}} style={styles.thumb}/> : <View style={styles.thumbPlaceholder}><Text>🖼️</Text></View>}
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีสินค้า — เพิ่มได้จากเมนูสต็อก</Text>}
          />
        </View>
        <View style={styles.cart}>
          
          <View style={styles.cartHeader}>
            <Text style={styles.cartTitle}>ตะกร้า ({cartItemCount})</Text>
            <TouchableOpacity onPress={() => setCart([])} style={styles.clearCartBtn}>
              <Text style={styles.clearCartText}>ล้างตะกร้า</Text>
            </TouchableOpacity>
          </View>



          <View style={styles.summaryLine}><Text style={styles.summaryLabel}>ยอดก่อนหักส่วนลด</Text><Text>฿{subtotal.toFixed(2)}</Text></View>
          <View style={styles.summaryLine}><Text style={styles.summaryLabel}>ส่วนลด</Text><Text>−฿{discountAmt.toFixed(2)}</Text></View>
          <View style={styles.summaryLine}><Text style={styles.summaryLabel}>ภาษี ({taxRate}%)</Text><Text>฿{taxAmt.toFixed(2)}</Text></View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>ยอดรวม</Text>
            <Text style={styles.totalValue}>฿{total.toFixed(2)}</Text>
          </View>
          <TouchableOpacity style={styles.checkoutBtn} onPress={() => setConfirmCheckout(true)} disabled={cart.length === 0}>
            <Text style={styles.checkoutText}>ชำระเงิน</Text>
          </TouchableOpacity>
        </View>
      </View>


      <Modal visible={confirmCheckout} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={[styles.modalCard,{width:'92%',maxHeight:'82%'}]}>
            <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <Text style={styles.modalTitle}>ตรวจสอบรายการ</Text>
              <TouchableOpacity onPress={()=>setConfirmCheckout(false)}><Text style={{fontSize:18}}>✕</Text></TouchableOpacity>
            </View>
            <FlatList
              style={{height:390}}
              data={cart}
              keyExtractor={(i,idx)=>i.variant_id?`${i.product_id}:${i.variant_id}`:`${i.product_id}:${idx}`}
              renderItem={({item})=>(
                <View style={{flexDirection:'row',alignItems:'center',paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#F3F4F6'}}>
                  {products.find(p=>p.id===item.product_id)?.image_uri ? <Image source={{uri:products.find(p=>p.id===item.product_id)?.image_uri}} style={{width:44,height:44,borderRadius:8,marginRight:10}}/> : <View style={{width:44,height:44,borderRadius:8,backgroundColor:'#EEE',marginRight:10}}/>}
                  <View style={{flex:1}}>
                    <Text style={{fontWeight:'600'}}>{item.name}</Text>
                    <Text style={{color:'#F59E0B'}}>฿{item.unit_price.toFixed(2)}</Text>
                  </View>
                  <Text>{item.quantity}</Text>
                  <Text style={{width:70,textAlign:'right'}}>฿{(item.quantity*item.unit_price).toFixed(2)}</Text>
                </View>
              )}
            />
            <View style={{marginTop:12}}>
              <View style={styles.summaryLine}><Text>ยอดก่อนหักส่วนลด</Text><Text>฿{subtotal.toFixed(2)}</Text></View>
              <View style={styles.summaryLine}><Text>ส่วนลด</Text><Text>-฿{discountAmt.toFixed(2)}</Text></View>
              <View style={styles.summaryLine}><Text>ภาษี ({taxRate}%)</Text><Text>฿{taxAmt.toFixed(2)}</Text></View>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>ยอดรวม</Text>
              <Text style={styles.totalValue}>฿{total.toFixed(2)}</Text>
            </View>
            <View style={{flexDirection:'row',gap:10,marginTop:10}}>
              <TouchableOpacity style={[styles.checkoutBtn,{flex:1,backgroundColor:'#E5E7EB'}]} onPress={()=>setConfirmCheckout(false)}>
                <Text style={[styles.checkoutText,{color:'#374151'}]}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.checkoutBtn,{flex:1}]} onPress={async()=>{setConfirmCheckout(false); await doCheckout();}}>
                <Text style={styles.checkoutText}>ยืนยันชำระเงิน</Text>
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

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#F3F4F6' },
  row: { flex: 1, flexDirection: 'column' },
  grid: { flex: 1 },
  catRow: { paddingHorizontal: 8, paddingTop: 8, maxHeight: 44 },
  catChip: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginRight: 8, backgroundColor: '#fff', height: 32 },
  catChipActive: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  catChipText: { fontSize: 12, color: '#374151' },
  catChipTextActive: { color: '#fff' },
  searchInput:{marginHorizontal:8,marginTop:6,marginBottom:4,backgroundColor:'#fff',borderWidth:1,borderColor:'#E5E7EB',borderRadius:10,paddingHorizontal:12,paddingVertical:7,height:38},
  productCard:{marginHorizontal:8,marginVertical:2,backgroundColor:'#fff',borderRadius:10,paddingHorizontal:10,paddingVertical:4,minHeight:54},
  productRow:{flexDirection:'row',alignItems:'center'},
  thumb:{width:40,height:40,borderRadius:6},
  thumbPlaceholder:{width:40,height:40,borderRadius:6,backgroundColor:'#EEE',alignItems:'center',justifyContent:'center'},
  productName:{fontWeight:'600',fontSize:13},
  productPrice:{color:'#F59E0B',fontWeight:'700',fontSize:13,marginTop:1},
  productStock:{color:'#9CA3AF',fontSize:9},
  empty: { color: '#9CA3AF', padding: 16, textAlign: 'center' },
  cart:{backgroundColor:'#fff',paddingHorizontal:12,paddingTop:8,paddingBottom:42,borderTopWidth:1,borderTopColor:'#E5E7EB',height:198},
  previewBox:{height:150,borderRadius:12,backgroundColor:'#F3F4F6',marginBottom:10,overflow:'hidden'},
  previewImg:{width:'100%',height:'100%'},
  previewPlaceholder:{flex:1,alignItems:'center',justifyContent:'center'},
  cartTitle: { fontWeight: '700', fontSize: 16, marginBottom: 4 },
  summaryLine:{flexDirection:'row',justifyContent:'space-between',marginTop:3},
  summaryLabel: { color: '#6B7280', fontSize: 12 },
  totalRow:{flexDirection:'row',justifyContent:'space-between',marginTop:4,paddingTop:4,borderTopWidth:1,borderTopColor:'#E5E7EB'},
  totalLabel: { fontSize: 16, fontWeight: '600' },
  totalValue: { fontSize: 18, fontWeight: '800', color: '#F59E0B' },
  checkoutBtn:{backgroundColor:'#F59E0B',marginTop:6,marginBottom:22,paddingVertical:9,borderRadius:10,alignItems:'center'},
  checkoutText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  cartHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8},
  clearCartBtn:{paddingHorizontal:8,paddingVertical:6,borderRadius:8,backgroundColor:'#FDECEC'},
  clearCartText:{color:'#DC2626',fontSize:12,fontWeight:'700'},
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '85%' },
  modalTitle: { fontWeight: '700', fontSize: 16, marginBottom: 4 },
  modalSub: { color: '#6B7280', fontSize: 12, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 10, marginBottom: 4 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
  cancel: { color: '#6B7280', marginRight: 20, paddingVertical: 9 },
  saveBtn: { backgroundColor: '#F59E0B', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8 },
  saveText: { color: '#fff', fontWeight: '700' },
  variantRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  variantName: { fontSize: 14 },
  variantPrice: { fontSize: 14, color: '#F59E0B', fontWeight: '700' },
});
