import { useEffect, useRef } from 'react';
import { Animated, View, Text, Dimensions, StyleSheet } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Defs, RadialGradient, Stop, Mask, G } from 'react-native-svg';

const { width: W, height: H } = Dimensions.get('window');
const CX = W / 2;
const CY = H * 0.42;

const R_OUT  = Math.min(W, H) * 0.40;
const R_MID1 = R_OUT * 0.87;
const R_MID2 = R_OUT * 0.73;
const R_IN   = R_OUT * 0.50;

const RED       = '#cc1111';
const RED_TRACE = 'rgba(200,15,15,0.65)';
const RED_FAINT = 'rgba(200,15,15,0.07)';
const INK       = '#f4f4f5';

// Border-only background art for the splash screen.
// A radial gradient mask makes the art fade toward the centre so it
// doesn't compete with the ring animation.
function SplashBorderArt() {
  const S  = 'rgba(200,15,15,0.28)';   // stroke
  const F  = 'rgba(200,15,15,0.12)';   // bar fill
  const N  = 'rgba(200,15,15,0.50)';   // nodes / trend line

  // Bottom bar chart (ascending, like Results tab)
  const baseY  = H * 0.92;
  const maxH   = H * 0.16;
  const bars   = [0.22, 0.38, 0.30, 0.52, 0.42, 0.68, 0.55, 0.82, 0.65, 1.00];
  const slotW  = (W * 0.88) / bars.length;
  const barW   = slotW * 0.52;
  const startX = W * 0.06;

  const trendPts = bars.map((h, i) => {
    const x = startX + i * slotW + slotW / 2;
    const y = baseY - maxH * h;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  // Top horizontal grid lines
  const topLines = [H * 0.04, H * 0.08, H * 0.12];

  // Side vertical scan lines (left + right margins)
  const sideLines = [W * 0.04, W * 0.08, W - W * 0.04, W - W * 0.08];

  return (
    <Svg width={W} height={H}>
      <Defs>
        {/* Gradient: black at centre → white at edges = art hidden in centre, visible at border */}
        <RadialGradient id="splashMask" cx="50%" cy="42%" r="58%" fx="50%" fy="42%">
          <Stop offset="0%"   stopColor="black" stopOpacity={1} />
          <Stop offset="45%"  stopColor="black" stopOpacity={0.92} />
          <Stop offset="68%"  stopColor="black" stopOpacity={0.45} />
          <Stop offset="88%"  stopColor="white" stopOpacity={0.7} />
          <Stop offset="100%" stopColor="white" stopOpacity={1} />
        </RadialGradient>
        <Mask id="borderFade">
          <Rect x={0} y={0} width={W} height={H} fill="url(#splashMask)" />
        </Mask>
      </Defs>

      <G mask="url(#borderFade)">
        {/* Bottom ascending bars */}
        {bars.map((h, i) => (
          <Rect key={i}
            x={startX + i * slotW + (slotW - barW) / 2}
            y={baseY - maxH * h}
            width={barW} height={maxH * h}
            fill={F}
          />
        ))}
        {/* Bottom trend line */}
        <Path d={trendPts} fill="none" stroke={N} strokeWidth={1.2} />
        {/* Bottom nodes */}
        {bars.map((h, i) => (
          <Circle key={i}
            cx={startX + i * slotW + slotW / 2}
            cy={baseY - maxH * h}
            r={2} fill={N}
          />
        ))}
        {/* Bottom baseline */}
        <Line x1={W * 0.05} y1={baseY} x2={W * 0.95} y2={baseY} stroke={S} strokeWidth={0.8} />

        {/* Top horizontal grid lines */}
        {topLines.map((y, i) => (
          <Line key={i} x1={W * 0.05} y1={y} x2={W * 0.95} y2={y}
            stroke={S} strokeWidth={0.7} strokeDasharray="6 10" />
        ))}
        {/* Top tick nodes */}
        {[0.2, 0.4, 0.6, 0.8].map((f, i) => (
          <Circle key={i} cx={W * f} cy={H * 0.08} r={2} fill={N} opacity={0.6} />
        ))}

        {/* Side vertical scan lines */}
        {sideLines.map((x, i) => (
          <Line key={i} x1={x} y1={H * 0.15} x2={x} y2={H * 0.85}
            stroke={S} strokeWidth={0.7} strokeDasharray="4 12" />
        ))}
      </G>
    </Svg>
  );
}

interface Props { onComplete: () => void }

export function SplashAnimation({ onComplete }: Props) {
  const fadeGrid  = useRef(new Animated.Value(0)).current;
  const scaleRing = useRef(new Animated.Value(0.65)).current;
  const fadeRing  = useRef(new Animated.Value(0)).current;
  const spin1     = useRef(new Animated.Value(0)).current;
  const spin2     = useRef(new Animated.Value(0)).current;
  const fadeInner = useRef(new Animated.Value(0)).current;
  const fadeText  = useRef(new Animated.Value(0)).current;
  const fadeOut   = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spin1, { toValue: 1, duration: 5000, useNativeDriver: true })
    ).start();
    Animated.loop(
      Animated.timing(spin2, { toValue: 1, duration: 8000, useNativeDriver: true })
    ).start();

    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeGrid,  { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(fadeRing,  { toValue: 1, duration: 550, useNativeDriver: true }),
        Animated.timing(scaleRing, { toValue: 1, duration: 550, useNativeDriver: true }),
      ]),
      Animated.timing(fadeInner, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(fadeText,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.delay(1500),
      Animated.timing(fadeOut,   { toValue: 0, duration: 550, useNativeDriver: true }),
    ]).start(() => onComplete());
  }, []);

  const rotate1 = spin1.interpolate({ inputRange: [0, 1], outputRange: ['0deg',   '360deg'] });
  const rotate2 = spin2.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });

  const ang = (deg: number) => (deg * Math.PI) / 180;

  // Cardinal + diagonal tick helpers
  const cardinals = [0, 90, 180, 270];
  const diagonals = [45, 135, 225, 315];

  // Circuit traces extending beyond the ring
  const traces = [
    `M${CX} ${CY - R_OUT} v-28 h22 v-10`,
    `M${CX} ${CY + R_OUT} v28 h-22 v10`,
    `M${CX - R_OUT} ${CY} h-28 v-16`,
    `M${CX + R_OUT} ${CY} h28 v16`,
    `M${CX + R_OUT * 0.707} ${CY - R_OUT * 0.707} h16 v-16`,
    `M${CX - R_OUT * 0.707} ${CY + R_OUT * 0.707} h-16 v16`,
  ];

  const circ1 = 2 * Math.PI * R_MID1;
  const circ2 = 2 * Math.PI * R_MID2;
  const dash1 = `${(circ1 / 5) * 0.55} ${(circ1 / 5) * 0.45}`;
  const dash2 = `${(circ2 / 4) * 0.38} ${(circ2 / 4) * 0.62}`;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: fadeOut }]}>

      {/* Border background art — data-viz bars + grid, masked to fade toward centre */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeGrid }]}>
        <SplashBorderArt />
      </Animated.View>

      {/* Grid + corner brackets */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeGrid }]}>
        <Svg width={W} height={H}>
          {[15, 45, 75, 105, 135, 165].map(a => (
            <Line key={a}
              x1={CX - Math.cos(ang(a)) * W * 1.5} y1={CY - Math.sin(ang(a)) * H}
              x2={CX + Math.cos(ang(a)) * W * 1.5} y2={CY + Math.sin(ang(a)) * H}
              stroke={RED_FAINT} strokeWidth={0.5}
            />
          ))}
          <Line x1={0} y1={CY} x2={W} y2={CY} stroke={RED_FAINT} strokeWidth={0.5} />
          <Line x1={CX} y1={0} x2={CX} y2={H}  stroke={RED_FAINT} strokeWidth={0.5} />
          {/* Screen corner brackets */}
          <Path d={`M18 52 L18 18 L52 18`}                         fill="none" stroke={RED} strokeWidth={1.5} opacity={0.45} />
          <Path d={`M${W-18} 52 L${W-18} 18 L${W-52} 18`}         fill="none" stroke={RED} strokeWidth={1.5} opacity={0.45} />
          <Path d={`M18 ${H-52} L18 ${H-18} L52 ${H-18}`}         fill="none" stroke={RED} strokeWidth={1.5} opacity={0.45} />
          <Path d={`M${W-18} ${H-52} L${W-18} ${H-18} L${W-52} ${H-18}`} fill="none" stroke={RED} strokeWidth={1.5} opacity={0.45} />
        </Svg>
      </Animated.View>

      {/* Static rings + traces */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeRing, transform: [{ scale: scaleRing }] }]}>
        <Svg width={W} height={H}>
          {/* Outer glow */}
          <Circle cx={CX} cy={CY} r={R_OUT + 5} fill="none" stroke={RED} strokeWidth={14} opacity={0.07} />
          {/* Outer ring */}
          <Circle cx={CX} cy={CY} r={R_OUT} fill="none" stroke={RED} strokeWidth={1.5} />
          {/* Cardinal ticks */}
          {cardinals.map(a => (
            <Line key={a}
              x1={CX + Math.cos(ang(a)) * (R_OUT - 10)} y1={CY + Math.sin(ang(a)) * (R_OUT - 10)}
              x2={CX + Math.cos(ang(a)) * (R_OUT + 10)} y2={CY + Math.sin(ang(a)) * (R_OUT + 10)}
              stroke={RED} strokeWidth={2.5}
            />
          ))}
          {/* Cardinal nodes */}
          {cardinals.map(a => (
            <Circle key={a}
              cx={CX + Math.cos(ang(a)) * R_OUT}
              cy={CY + Math.sin(ang(a)) * R_OUT}
              r={3.5} fill={RED}
            />
          ))}
          {/* Diagonal small nodes */}
          {diagonals.map(a => (
            <Circle key={a}
              cx={CX + Math.cos(ang(a)) * R_OUT}
              cy={CY + Math.sin(ang(a)) * R_OUT}
              r={2} fill={RED} opacity={0.5}
            />
          ))}
          {/* Circuit traces */}
          {traces.map((d, i) => (
            <Path key={i} d={d} fill="none" stroke={RED_TRACE} strokeWidth={1} />
          ))}
        </Svg>
      </Animated.View>

      {/* Spinning dashed ring 1 — clockwise */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeRing, transform: [{ rotate: rotate1 }] }]}>
        <Svg width={W} height={H}>
          <Circle cx={CX} cy={CY} r={R_MID1}
            fill="none" stroke={RED} strokeWidth={1.5}
            strokeDasharray={dash1} opacity={0.65}
          />
        </Svg>
      </Animated.View>

      {/* Spinning dashed ring 2 — counter-clockwise */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeRing, transform: [{ rotate: rotate2 }] }]}>
        <Svg width={W} height={H}>
          <Circle cx={CX} cy={CY} r={R_MID2}
            fill="none" stroke={RED} strokeWidth={1}
            strokeDasharray={dash2} opacity={0.4}
          />
        </Svg>
      </Animated.View>

      {/* Inner ring + crosshair + target */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeInner }]}>
        <Svg width={W} height={H}>
          <Circle cx={CX} cy={CY} r={R_IN} fill="none" stroke={RED} strokeWidth={1} opacity={0.5} />
          <Line x1={CX - R_IN * 0.45} y1={CY} x2={CX - 12} y2={CY} stroke={RED} strokeWidth={0.8} opacity={0.5} />
          <Line x1={CX + 12} y1={CY} x2={CX + R_IN * 0.45} y2={CY} stroke={RED} strokeWidth={0.8} opacity={0.5} />
          <Line x1={CX} y1={CY - R_IN * 0.45} x2={CX} y2={CY - 12} stroke={RED} strokeWidth={0.8} opacity={0.5} />
          <Line x1={CX} y1={CY + 12} x2={CX} y2={CY + R_IN * 0.45} stroke={RED} strokeWidth={0.8} opacity={0.5} />
          <Circle cx={CX} cy={CY} r={11} fill="none" stroke={RED} strokeWidth={0.8} opacity={0.35} />
          <Circle cx={CX} cy={CY} r={5}  fill={RED} />
        </Svg>
      </Animated.View>

      {/* Title text */}
      <Animated.View style={{
        position: 'absolute',
        left: 0, right: 0,
        top: CY + R_OUT + 22,
        alignItems: 'center',
        opacity: fadeText,
      }}>
        <Text style={{ fontFamily: 'monospace', fontSize: 21, fontWeight: '700',
          color: INK, letterSpacing: 5, textAlign: 'center', lineHeight: 30 }}>
          {'SQUAD\nOPTIMISER\nENGINE'}
        </Text>
        <View style={{ width: 44, height: 1, backgroundColor: RED, marginTop: 10, opacity: 0.8 }} />
        <Text style={{ fontFamily: 'monospace', fontSize: 8, color: RED,
          letterSpacing: 4, marginTop: 8, opacity: 0.7 }}>
          SESSION SIMULATOR
        </Text>
      </Animated.View>

    </Animated.View>
  );
}
