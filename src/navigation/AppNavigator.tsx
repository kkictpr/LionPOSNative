import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import InventoryScreen from '../screens/InventoryScreen';
import CustomersScreen from '../screens/CustomersScreen';
import ReportsScreen from '../screens/ReportsScreen';
import SalesStack from './SalesStack';
import MoreStack from './MoreStack';

const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false, tabBarActiveTintColor: '#F59E0B' }}
      initialRouteName="ขาย">
      <Tab.Screen name="ขาย" component={SalesStack} />
      <Tab.Screen name="สต็อก" component={InventoryScreen} />
      <Tab.Screen name="ลูกค้า" component={CustomersScreen} />
      <Tab.Screen name="รายงาน" component={ReportsScreen} />
      <Tab.Screen name="เพิ่มเติม" component={MoreStack} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { employee } = useAuth();
  return (
    <NavigationContainer>
      {employee ? <MainTabs /> : <LoginScreen />}
    </NavigationContainer>
  );
}
