import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import DashboardScreen from '../screens/DashboardScreen';
import InventoryScreen from '../screens/InventoryScreen';
import CustomersScreen from '../screens/CustomersScreen';
import ReportsScreen from '../screens/ReportsScreen';
import SalesStack from './SalesStack';
import MoreStack from './MoreStack';

const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#F59E0B',
        tabBarInactiveTintColor: '#8A94A6',
        tabBarStyle: {
          backgroundColor: '#0F172A',
          borderTopColor: '#334155',
          borderTopWidth: 1,
          height: 78,
          paddingBottom: 10,
          paddingTop: 8,
          position: 'relative',
        },
      }}>
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-dashboard" size={size || 24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ขาย"
        component={SalesStack}
        options={{
          tabBarLabel: 'ขาย',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="point-of-sale" size={size || 24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="สต็อก"
        component={InventoryScreen}
        options={{
          tabBarLabel: 'สต็อก',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="package-variant-closed" size={size || 24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ลูกค้า"
        component={CustomersScreen}
        options={{
          tabBarLabel: 'ลูกค้า',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-group" size={size || 24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="รายงาน"
        component={ReportsScreen}
        options={{
          tabBarLabel: 'รายงาน',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="chart-bar" size={size || 24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="เพิ่มเติม"
        component={MoreStack}
        options={{
          tabBarLabel: 'เพิ่มเติม',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="dots-horizontal" size={size || 24} color={color} />
          ),
        }}
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
