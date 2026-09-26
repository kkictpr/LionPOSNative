// AppNavigator_v22_Fix.tsx
// Base: AppNavigator.tsx
// Output: AppNavigator_v22_Fix.tsx
//
// ใช้ไฟล์นี้เป็นแนวแก้ใน AppNavigator.tsx
// จุดสำคัญคือให้เหลือ Tab.Screen ของ 'สต็อก' เพียง component ตัวเดียว

import InventoryScreen from '../screens/InventoryScreen';

// ภายใน <Tab.Navigator> ให้ใช้บล็อกนี้แทนของเดิม
/*
<Tab.Screen
  name="สต็อก"
  component={InventoryScreen}
/>
*/

// ห้ามมีพร้อมกัน
// getComponent={() => require('../screens/InventoryScreen').default}
