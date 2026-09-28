import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Image, ImageSourcePropType } from 'react-native';

import InventoryScreen from '../screens/InventoryScreen';
import CustomersScreen from '../screens/CustomersScreen';
import ReportsScreen from '../screens/ReportsScreen';
import SalesStack from './SalesStack';
import MoreStack from './MoreStack';

import saleIcon from '../assets/icons/sale.png';
import reportsIcon from '../assets/icons/reports.png';
import stockIcon from '../assets/icons/stock.png';
import customersIcon from '../assets/icons/customers.png';
import moreIcon from '../assets/icons/more.png';

const Tab = createBottomTabNavigator();

// TODO: เปลี่ยนเป็นไอคอนจริงของ "บิล" เมื่อได้ไฟล์ PNG มา — ยืม reportsIcon เป็น placeholder ชั่วคราว
const TAB_ICONS: Record<string, ImageSourcePropType> = {
  'ขาย': saleIcon,
  'สต็อก': stockIcon,
  'ลูกค้า': customersIcon,  'รายงาน': reportsIcon,
  'เพิ่มเติม': moreIcon,
};

function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="ขาย"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#F59E0B',
        tabBarInactiveTintColor: '#8A94A6',
        tabBarIconStyle: {
          marginTop: 3,
        },
        tabBarStyle: {
          backgroundColor: '#0F172A',
          borderTopColor: '#334155',
          borderTopWidth: 1,
          height: 78,
          paddingBottom: 10,
          paddingTop: 8,
          position: 'relative',
        },
        tabBarIcon: ({ focused }) => (
          <Image
            source={TAB_ICONS[route.name]}
            style={{
              width: 30,
              height: 30,
              opacity: focused ? 1 : 0.72,
            }}
            resizeMode="contain"
          />
        ),
      })}>
      <Tab.Screen
        name="ขาย"
        component={SalesStack}
        options={{ tabBarLabel: 'ขาย' }}
      />
      <Tab.Screen
        name="รายงาน"
        component={ReportsScreen}
        options={{ tabBarLabel: 'รายงาน' }}
      />
      <Tab.Screen
        name="สต็อก"
        component={InventoryScreen}
        options={{ tabBarLabel: 'สต็อก' }}
      />
      <Tab.Screen
        name="ลูกค้า"
        component={CustomersScreen}
        options={{ tabBarLabel: 'ลูกค้า' }}
      />
      <Tab.Screen
        name="เพิ่มเติม"
        component={MoreStack}
        options={{ tabBarLabel: 'เพิ่มเติม' }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <MainTabs />
    </NavigationContainer>
  );
}
