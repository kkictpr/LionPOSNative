import AsyncStorage from '@react-native-async-storage/async-storage';

const PRINTER_KEY = 'lionpos_printer_mac';

export async function scanPrinters() {
  return [];
}

export async function connectPrinter(device: any) {
  const mac = typeof device === 'string' ? device : device?.address ?? device?.mac ?? '';
  if (mac) await AsyncStorage.setItem(PRINTER_KEY, mac);
  return true;
}

export async function getSavedPrinterMac() {
  return AsyncStorage.getItem(PRINTER_KEY);
}

export const Printer = {
  init: async () => true,
  printBill: async (_text: string) => true,
  printText: async (_text: string) => true,
  printImage: async (_img: string) => true,
  connectPrinter,
  closeConn: async () => true,
  getDeviceList: scanPrinters,
};

export default Printer;
