import { View } from 'react-native';

// 10 bars, max OVR = 180 (training cap), each bar = 18 OVR.
// Note: starOvrThreshold (20 OVR per training star) is a separate mechanic.
// These bars divide the training cap evenly — 10 × 18 = 180.
const MAX_OVR = 180;
const N_BARS  = 10;
const COLORS  = [
  '#2d3a52', '#3d4a66', '#4d5c7a', '#5b6b8a',
  '#7a90af', '#9eb0d4', '#b8a070', '#c4a060', '#e8b466', '#7eb89a',
];
const EMPTY = 'rgba(255,255,255,0.06)';

type Props = { ovr: number; size?: 'md' | 'sm' };

export function QualityMeter({ ovr, size = 'md' }: Props) {
  const w  = size === 'sm' ? 5 : 8;
  const bh = size === 'sm' ? 2 : 3;

  const filled  = (Math.min(ovr, MAX_OVR) / MAX_OVR) * N_BARS;
  const full    = Math.floor(filled);
  const partial = filled - full;

  return (
    <View style={{ width: w, gap: 1, flexDirection: 'column-reverse' }}>
      {Array.from({ length: N_BARS }, (_, i) => {
        const fillPct = i < full ? 1 : i === full ? partial : 0;
        return (
          <View key={i} style={{ width: w, height: bh, backgroundColor: EMPTY }}>
            {fillPct > 0 && (
              <View style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: COLORS[i],
                opacity: fillPct,
              }} />
            )}
          </View>
        );
      })}
    </View>
  );
}
