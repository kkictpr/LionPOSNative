import { TextStyle, ViewStyle } from 'react-native';

/**
 * LionPOS design tokens — ค่าตาม LionPOS Design & Development Bible.
 * ไฟล์นี้ "ใหม่" และแยกอิสระ ไม่แตะ Theme Core เดิม
 * ถ้าอยากผูกกับ Theme เดิมภายหลัง ให้แก้ที่ไฟล์นี้ไฟล์เดียว
 */

export const colors = {
  primary: '#F59E0B',
  primaryLight: '#FBBF24',
  primaryDark: '#D97706',
  background: '#0F172A',
  surface: '#1F2937',
  card: '#334155',
  text: '#F8FAFC',
  textMuted: '#94A3B8',
  border: '#334155',
  onPrimary: '#FFFFFF',

  // Status colors
  success: '#10B981', // พร้อมขาย
  warning: '#F97316', // ใกล้หมด
  danger: '#EF4444', // หมด
  promo: '#8B5CF6', // โปรโมชัน
  info: '#38BDF8', // ใหม่
} as const;

export const radius = {
  card: 20,
  modal: 24,
  button: 14,
  input: 12,
  chip: 999,
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** ขนาดพื้นที่แตะขั้นต่ำ (dp) */
export const TOUCH = 48;

/** Animation ต้อง 150–250 ms */
export const motion = { fast: 150, base: 200, slow: 250 } as const;

export const breakpoints = { tablet: 600, wide: 1000 } as const;

export const layout = { maxContentWidth: 960 } as const;

const T = (s: TextStyle): TextStyle => s;
export const typography = {
  title: T({ fontSize: 22, fontWeight: '800', color: colors.text }),
  h2: T({ fontSize: 16, fontWeight: '700', color: colors.text }),
  body: T({ fontSize: 14, fontWeight: '500', color: colors.text }),
  caption: T({ fontSize: 12, fontWeight: '500', color: colors.textMuted }),
  number: T({ fontSize: 22, fontWeight: '800', color: colors.text }),
};

/** Soft shadow เท่านั้น — glow ส้มใช้กับปุ่มหลักเท่านั้น */
export const shadow: { soft: ViewStyle; glow: ViewStyle } = {
  soft: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 3,
  },
  glow: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
};

export type StatusTone = 'success' | 'warning' | 'danger' | 'promo' | 'info';

export const toneColor: Record<StatusTone, string> = {
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
  promo: colors.promo,
  info: colors.info,
};

/** '#RRGGBB' + 0..1 -> 'rgba(r,g,b,a)' */
export const alpha = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
};

/** เกณฑ์ "ใกล้หมด" (ปรับได้ที่เดียว) */
export const LOW_STOCK_THRESHOLD = 5;

export function stockStatus(qty: number | null | undefined): { tone: StatusTone; label: string } {
  const q = qty ?? 0;
  if (q <= 0) return { tone: 'danger', label: 'หมด' };
  if (q <= LOW_STOCK_THRESHOLD) return { tone: 'warning', label: 'ใกล้หมด' };
  return { tone: 'success', label: 'พร้อมขาย' };
}
