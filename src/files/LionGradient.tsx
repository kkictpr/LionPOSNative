import React, { useRef } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

type Point = { x: number; y: number };

type Props = {
  colors: string[];
  start?: Point;
  end?: Point;
  style?: StyleProp<ViewStyle>;
};

/** วางเป็นเลเยอร์ล่างสุดของ view ที่มี overflow:'hidden' + borderRadius */
export default function LionGradient({
  colors,
  start = { x: 0, y: 0 },
  end = { x: 1, y: 1 },
  style,
}: Props) {
  const id = useRef(`lg_${Math.random().toString(36).slice(2, 9)}`).current;
  const last = Math.max(1, colors.length - 1);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1={start.x} y1={start.y} x2={end.x} y2={end.y}>
            {colors.map((c, i) => (
              <Stop key={i} offset={`${(i / last) * 100}%`} stopColor={c} stopOpacity={1} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
