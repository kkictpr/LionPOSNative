import React, { createContext, useContext, useEffect, useState } from 'react';
import { getDB } from '../db/database';

type Employee = { id: string; name: string; role: string; store_id: string };

const C = createContext<any>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [employee, setEmployee] = useState<Employee>({
    id: 'owner',
    name: 'เจ้าของร้าน',
    role: 'owner',
    store_id: '',
  });

  useEffect(() => {
    (async () => {
      const db = await getDB();
      const [res] = await db.executeSql('SELECT id FROM stores ORDER BY created_at LIMIT 1;');
      const storeId = res.rows.length ? res.rows.item(0).id : '';
      setEmployee({ id: 'owner', name: 'เจ้าของร้าน', role: 'owner', store_id: storeId });
    })();
  }, []);

  return (
    <C.Provider value={{ employee, loginWithPin: async () => true, logout: () => {} }}>
      {children}
    </C.Provider>
  );
}

export function useAuth() {
  const c = useContext(C);
  if (!c) throw new Error('useAuth must be used within AuthProvider');
  return c;
}
