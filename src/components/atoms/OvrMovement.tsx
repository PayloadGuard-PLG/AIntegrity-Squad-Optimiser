import { View, Text } from 'react-native';
import Svg, { Circle, Line, Rect, Defs, Pattern, Path } from 'react-native-svg';
import { theme, ovrColor } from '../../constants/theme';
import { MonoLabel } from './MonoLabel';

interface Props {
  from: number;
  to: number;
  gain: number;
  name: string;
  age: number;
  tier: string;
}

export function OvrMovement({ from, to, gain, name, age, tier }: Props) {
  const c = ovrColor(to);
  const gearTicks = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return { x1: 30 + Math.cos(a) * 26, y1: 30 + Math.sin(a) * 26, x2: 30 + Math.cos(a) * 29, y2: 30 + Math.sin(a) * 29 };
  });
  const innerTicks = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return { x1: 30 + Math.cos(a) * 14, y1: 30 + Math.sin(a) * 14, x2: 30 + Math.cos(a) * 20, y2: 30 + Math.sin(a) * 20 };
  });

  return (
    <View style={{
      position: 'relative',
      padding: 18,
      backgroundColor: '#050507',
      borderWidth: 1,
      borderColor: theme.hairline2,
      overflow: 'hidden',
    }}>
      {/* Guilloché grid */}
      <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%">
        <Defs>
          <Pattern id="movGrid" width="14" height="14" patternUnits="userSpaceOnUse">
            <Path d="M14 0H0V14" stroke="rgba(255,255,255,0.045)" strokeWidth="0.5" fill="none" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#movGrid)" />
      </Svg>

      {/* Decorative gear top-right */}
      <Svg width={120} height={120} viewBox="0 0 60 60" style={{ position: 'absolute', top: -22, right: -22, opacity: 0.18 }}>
        <Circle cx="30" cy="30" r="26" stroke={theme.steelLight} strokeWidth="0.4" fill="none" />
        <Circle cx="30" cy="30" r="20" stroke={theme.steelLight} strokeWidth="0.4" fill="none" />
        <Circle cx="30" cy="30" r="14" stroke={theme.steelLight} strokeWidth="0.4" fill="none" />
        <Circle cx="30" cy="30" r="6" stroke={theme.steelLight} strokeWidth="0.4" fill="none" />
        {gearTicks.map((t, i) => (
          <Line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={theme.steelLight} strokeWidth="0.4" />
        ))}
        {innerTicks.map((t, i) => (
          <Line key={'i' + i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={theme.steelLight} strokeWidth="0.4" />
        ))}
        <Circle cx="30" cy="30" r="2" fill={theme.steelLight} />
      </Svg>

      <View style={{ position: 'relative' }}>
        {/* Identity strip */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <MonoLabel size={9} color={theme.steelLight}>SUBJECT · {(tier ?? 'NONE').toUpperCase()} · AGE {age}</MonoLabel>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, color: theme.inkSec, fontFamily: theme.display, fontWeight: '500', marginBottom: 4 }}>{name}</Text>
            <MonoLabel size={9}>FINAL OVR</MonoLabel>
            <Text style={{
              fontSize: 62, fontWeight: '200', color: c, fontFamily: theme.display,
              letterSpacing: -3, lineHeight: 56, marginTop: 4,
            }}>{to.toFixed(1)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <MonoLabel size={9}>FROM</MonoLabel>
            <Text style={{ fontFamily: theme.mono, fontSize: 14, color: theme.inkSec, marginTop: 4 }}>{from.toFixed(1)}</Text>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8,
              paddingHorizontal: 8, paddingVertical: 4,
              backgroundColor: 'rgba(126,184,154,0.12)',
              borderWidth: 1, borderColor: theme.pos + '55',
            }}>
              <Text style={{ fontFamily: theme.mono, fontSize: 13, fontWeight: '600', color: theme.pos }}>+</Text>
              <Text style={{ fontFamily: theme.display, fontSize: 18, fontWeight: '600', color: theme.pos, letterSpacing: -0.5 }}>
                {gain.toFixed(1)}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
