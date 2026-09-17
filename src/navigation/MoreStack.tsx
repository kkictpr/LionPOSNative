import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MoreScreen from '../screens/MoreScreen';
import PurchasingScreen from '../screens/PurchasingScreen';
import SalesHistoryScreen from '../screens/SalesHistoryScreen';
import EmployeesScreen from '../screens/EmployeesScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator();

export default function MoreStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      <Stack.Screen name="MoreMenu" component={MoreScreen} options={{ title: 'เพิ่มเติม', headerShown: false }} />
      <Stack.Screen name="Purchasing" component={PurchasingScreen} options={{ title: 'จัดซื้อ / ซัพพลายเออร์' }} />
      <Stack.Screen name="SalesHistory" component={SalesHistoryScreen} options={{ title: 'ประวัติการขาย' }} />
      <Stack.Screen name="Employees" component={EmployeesScreen} options={{ title: 'พนักงาน' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'ตั้งค่า' }} />
    </Stack.Navigator>
  );
}
