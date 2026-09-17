import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getSetting } from '../db/repository';
import POSScreen from './POSScreen';
import TablesScreen from './TablesScreen';

export default function SalesEntryScreen() {
  const [restaurantMode, setRestaurantMode] = useState<boolean | null>(null);

  useFocusEffect(useCallback(() => {
    getSetting('restaurant_mode').then(v => setRestaurantMode(v === '1'));
  }, []));

  if (restaurantMode === null) return null;
  return restaurantMode ? <TablesScreen /> : <POSScreen />;
}
