import { useWindowDimensions } from 'react-native';
import { breakpoints } from './tokens';

/**
 * Layout เดียวกันทุกอุปกรณ์ — มือถือเรียงแนวตั้ง 1 คอลัมน์,
 * Tablet / iPad ขยายพื้นที่เป็น 2–4 คอลัมน์
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= breakpoints.tablet;
  const isWide = width >= breakpoints.wide;

  /** จำนวนคอลัมน์ของ grid จากความกว้างที่ใช้ได้จริง (มือถือ = 1 เสมอ) */
  const columnsFor = (available: number, minCard = 230) =>
    isTablet ? Math.max(2, Math.min(4, Math.floor(available / minCard))) : 1;

  return { width, height, isTablet, isWide, columnsFor };
}

/** 12540 -> "12,540" (ไม่พึ่ง Intl เพื่อให้ผลเหมือนกันทุกเครื่อง) */
export function formatBaht(n: number, digits = 0) {
  const fixed = (Number.isFinite(n) ? n : 0).toFixed(digits);
  const [int, dec] = fixed.split('.');
  const withComma = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec ? `฿${withComma}.${dec}` : `฿${withComma}`;
}
