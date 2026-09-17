export const Printer = {
  init: async () => true,
  printBill: async (_text: string) => true,
  printText: async (_text: string) => true,
  printImage: async (_img: string) => true,
  connectPrinter: async (..._args: any[]) => true,
  closeConn: async () => true,
  getDeviceList: async () => [],
};

export default Printer;