import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SalesEntryScreen from '../screens/SalesEntryScreen';
import TableOrderScreen from '../screens/TableOrderScreen';
import PaymentScreen from '../screens/PaymentScreen';

const Stack = createNativeStackNavigator();

export default function SalesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SalesHome" component={SalesEntryScreen} />
      <Stack.Screen
        name="TableOrder"
        component={TableOrderScreen}
        options={{ headerShown: true, title: 'ออเดอร์โต๊ะ' }}
      />
          <Stack.Screen
        name="Payment"
        component={PaymentScreen}
        options={{ presentation: 'fullScreenModal' }}
      />
    </Stack.Navigator>
  );
}
