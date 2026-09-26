import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Stop } from 'react-native-svg';

type Props = {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * มาสคอต LionPOS เป็นหมาโกลเด้นรีทรีฟเวอร์ (vector — คมทุกขนาดหน้าจอ)
 * ใช้ได้ทุกที่: Login, Loading, Dashboard, โปรไฟล์ ฯลฯ
 * ปลอกคอสีส้มคือสีแบรนด์ LionPOS
 */
export default function LionMascot({ size = 96, style }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200" style={style}>
      <Defs>
        <LinearGradient id="lionFur" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F7BE5B" />
          <Stop offset="1" stopColor="#E39A2D" />
        </LinearGradient>
      </Defs>

      {/* คอ/อก */}
      <Ellipse cx="100" cy="168" rx="46" ry="24" fill="#E39A2D" />

      {/* หูตก */}
      <Ellipse cx="46" cy="104" rx="26" ry="54" transform="rotate(14 46 104)" fill="#B36B1B" />
      <Ellipse cx="154" cy="104" rx="26" ry="54" transform="rotate(-14 154 104)" fill="#B36B1B" />

      {/* หัว + ปากสีครีม */}
      <Ellipse cx="100" cy="96" rx="58" ry="62" fill="url(#lionFur)" />
      <Ellipse cx="100" cy="128" rx="34" ry="27" fill="#FCE7BD" />

      {/* ตา + คิ้ว */}
      <Circle cx="77" cy="90" r="7" fill="#2B1A0E" />
      <Circle cx="123" cy="90" r="7" fill="#2B1A0E" />
      <Circle cx="79.5" cy="87.5" r="2.4" fill="#FFFFFF" />
      <Circle cx="125.5" cy="87.5" r="2.4" fill="#FFFFFF" />
      <Path d="M66 74 Q77 68 88 74" stroke="#B36B1B" strokeWidth="3" fill="none" strokeLinecap="round" />
      <Path d="M112 74 Q123 68 134 74" stroke="#B36B1B" strokeWidth="3" fill="none" strokeLinecap="round" />

      {/* จมูก */}
      <Path d="M87 113 Q100 106 113 113 Q113 124 100 129 Q87 124 87 113 Z" fill="#2B1A0E" />
      <Ellipse cx="95" cy="113" rx="4" ry="2" fill="#6B4A32" />

      {/* ลิ้น + ปาก */}
      <Path d="M92 143 Q100 164 108 143 Z" fill="#F0707F" />
      <Path
        d="M100 129 L100 137 M100 137 Q91 147 82 139 M100 137 Q109 147 118 139"
        stroke="#2B1A0E"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M100 145 L100 154" stroke="#D9566A" strokeWidth="2" fill="none" strokeLinecap="round" />

      {/* ปลอกคอส้ม LionPOS + ป้ายห้อย */}
      <Path d="M54 160 Q100 184 146 160 L150 174 Q100 202 50 174 Z" fill="#F59E0B" />
      <Circle cx="100" cy="189" r="8" fill="#FBBF24" />
    </Svg>
  );
}
