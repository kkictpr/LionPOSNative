import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { colors } from './tokens';

export type LionChartPoint = { label: string; value: number };

type Props = { data: LionChartPoint[]; height?: number };

const PAD = { l: 12, r: 12, t: 14, b: 26 };

export default function LionLineChart({ data, height = 170 }: Props) {
  const [w, setW] = useState(0);

  const innerW = Math.max(0, w - PAD.l - PAD.r);
  const innerH = height - PAD.t - PAD.b;
  const max = Math.max(1, ...data.map(d => d.value));

  const pts = data.map((d, i) => ({
    x: PAD.l + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW),
    y: PAD.t + innerH - (d.value / max) * innerH,
  }));

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const baseY = PAD.t + innerH;
  const area = pts.length
    ? `${line} L${pts[pts.length - 1].x.toFixed(1)} ${baseY} L${pts[0].x.toFixed(1)} ${baseY} Z`
    : '';

  return (
    <View style={{ height }} onLayout={e => setW(e.nativeEvent.layout.width)}>
      {w > 0 && data.length > 0 ? (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id="lionArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.35} />
              <Stop offset="100%" stopColor={colors.primary} stopOpacity={0} />
            </LinearGradient>
          </Defs>

          {[0, 0.5, 1].map(f => (
            <Line
              key={f}
              x1={PAD.l}
              x2={PAD.l + innerW}
              y1={PAD.t + innerH * (1 - f)}
              y2={PAD.t + innerH * (1 - f)}
              stroke="rgba(148,163,184,0.15)"
              strokeWidth={1}
            />
          ))}

          <Path d={area} fill="url(#lionArea)" />
          <Path
            d={line}
            stroke={colors.primary}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {pts.map((p, i) => (
            <Circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 5 : 3} fill={colors.primary} />
          ))}
          {data.map((d, i) => (
            <SvgText
              key={`l${i}`}
              x={pts[i].x}
              y={height - 8}
              fontSize={11}
              fill={colors.textMuted}
              textAnchor="middle">
              {d.label}
            </SvgText>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}
