import { StyleSheet } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { Dimensions } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');

// All tabs share the same visual treatment: same color, same opacity level, same stroke weight.
// Only the geometric arrangement differs — just enough to orient the user without
// competing with any content.

const S = 'rgba(200,17,17,0.18)';    // base stroke
const D = 'rgba(200,17,17,0.32)';    // nodes / key lines

export type TabKey = 'squad' | 'plan' | 'drills' | 'coaches' | 'results';

interface Props { tab: TabKey }

export function TabBackground({ tab }: Props) {
  switch (tab) {
    case 'squad':   return <SquadBg />;
    case 'plan':    return <PlanBg />;
    case 'drills':  return <DrillsBg />;
    case 'coaches': return <CoachesBg />;
    case 'results': return <ResultsBg />;
  }
}

const abs = StyleSheet.absoluteFill;

// SQUAD — formation grid: horizontal rows + column dividers suggesting a player table
function SquadBg() {
  const rows = [0.18, 0.32, 0.50, 0.68, 0.82].map(f => f * H);
  const cols = [0.25, 0.5, 0.75].map(f => f * W);
  return (
    <Svg style={abs} width={W} height={H} pointerEvents="none">
      {rows.map((y, i) => (
        <Line key={i} x1={16} y1={y} x2={W - 16} y2={y} stroke={S} strokeWidth={1} />
      ))}
      {cols.map((x, i) => (
        <Line key={i} x1={x} y1={56} x2={x} y2={H - 56} stroke={S} strokeWidth={1} />
      ))}
      {rows.map((y, ri) =>
        cols.map((x, ci) => (
          <Circle key={`${ri}-${ci}`} cx={x} cy={y} r={2} fill={D} />
        ))
      )}
      <Path d={`M0 ${H*0.22} L0 0 L${W*0.22} 0`}      fill="none" stroke={S} strokeWidth={1} />
      <Path d={`M${W} ${H*0.78} L${W} ${H} L${W*0.78} ${H}`} fill="none" stroke={S} strokeWidth={1} />
    </Svg>
  );
}

// PLAN — circuit traces: two bus routes with junction nodes suggesting a flow
function PlanBg() {
  const CX = W / 2;
  const paths = [
    `M0 ${H*0.22} h${W*0.28} v${H*0.10} h${W*0.44} v-${H*0.10} h${W*0.28}`,
    `M0 ${H*0.58} h${W*0.20} v${H*0.12} h${W*0.60} v-${H*0.12} h${W*0.20}`,
    `M${CX} 0 v${H*0.14} h${W*0.16} v${H*0.10}`,
    `M${CX} ${H} v-${H*0.14} h-${W*0.16} v-${H*0.10}`,
  ];
  const nodes: [number, number][] = [
    [W*0.28, H*0.22], [W*0.72, H*0.22],
    [W*0.20, H*0.58], [W*0.80, H*0.58],
    [CX, H*0.14],     [CX, H*0.86],
  ];
  return (
    <Svg style={abs} width={W} height={H} pointerEvents="none">
      {paths.map((d, i) => (
        <Path key={i} d={d} fill="none" stroke={S} strokeWidth={1} />
      ))}
      {nodes.map(([cx, cy], i) => (
        <Circle key={i} cx={cx} cy={cy} r={3} fill={D} />
      ))}
    </Svg>
  );
}

// DRILLS — motion lines converging to a focal point near the bottom-centre
function DrillsBg() {
  const focal = { x: W / 2, y: H * 0.80 };
  const origins: [number, number][] = [
    [0, H*0.06], [W*0.15, 0], [W*0.38, 0],
    [W*0.62, 0], [W*0.85, 0], [W, H*0.06],
    [0, H*0.35], [W, H*0.35],
  ];
  return (
    <Svg style={abs} width={W} height={H} pointerEvents="none">
      {origins.map(([x, y], i) => (
        <Line key={i} x1={x} y1={y} x2={focal.x} y2={focal.y} stroke={S} strokeWidth={1} />
      ))}
      {[0.38, 0.50, 0.62].map((f, i) => (
        <Line key={`h${i}`}
          x1={W*0.06} y1={H*f} x2={W*0.94} y2={H*f}
          stroke={S} strokeWidth={0.8} strokeDasharray="6 10"
        />
      ))}
    </Svg>
  );
}

// COACHES — targeting reticle + scan lines suggesting analysis mode
function CoachesBg() {
  const CX = W / 2;
  const CY = H * 0.36;
  const R1 = W * 0.30;
  const R2 = W * 0.48;
  const ang = (deg: number) => (deg * Math.PI) / 180;
  return (
    <Svg style={abs} width={W} height={H} pointerEvents="none">
      <Circle cx={CX} cy={CY} r={R2} fill="none" stroke={S} strokeWidth={1} />
      <Circle cx={CX} cy={CY} r={R1} fill="none" stroke={S} strokeWidth={1} />
      <Line x1={CX - R2} y1={CY} x2={CX + R2} y2={CY} stroke={S} strokeWidth={0.8} />
      <Line x1={CX} y1={CY - R2} x2={CX} y2={CY + R2} stroke={S} strokeWidth={0.8} />
      {[0, 90, 180, 270].map(a => (
        <Line key={a}
          x1={CX + Math.cos(ang(a)) * (R1 - 7)} y1={CY + Math.sin(ang(a)) * (R1 - 7)}
          x2={CX + Math.cos(ang(a)) * (R1 + 7)} y2={CY + Math.sin(ang(a)) * (R1 + 7)}
          stroke={D} strokeWidth={1}
        />
      ))}
      {[0.65, 0.73, 0.81, 0.89].map((f, i) => (
        <Line key={i} x1={W*0.08} y1={H*f} x2={W*0.92} y2={H*f} stroke={S} strokeWidth={0.8} />
      ))}
    </Svg>
  );
}

// RESULTS — ascending bar pattern + trend line suggesting performance data
function ResultsBg() {
  const heights = [0.10, 0.17, 0.13, 0.22, 0.17, 0.28, 0.20, 0.35, 0.26, 0.42];
  const slotW   = (W * 0.88) / heights.length;
  const barW    = slotW * 0.55;
  const baseY   = H * 0.72;
  const pts = heights.map((h, i) => {
    const x = W * 0.06 + i * slotW + slotW / 2;
    const y = baseY - H * h;
    return `${i === 0 ? 'M' : 'L'}${x} ${y}`;
  });
  return (
    <Svg style={abs} width={W} height={H} pointerEvents="none">
      {heights.map((h, i) => {
        const x = W * 0.06 + i * slotW + (slotW - barW) / 2;
        return (
          <Rect key={i} x={x} y={baseY - H * h} width={barW} height={H * h} fill={S} />
        );
      })}
      <Path d={pts.join(' ')} fill="none" stroke={D} strokeWidth={1} />
      <Line x1={W*0.05} y1={baseY} x2={W*0.95} y2={baseY} stroke={S} strokeWidth={0.8} />
      {[0.28, 0.46, 0.60].map((f, i) => (
        <Line key={i} x1={W*0.05} y1={H*f} x2={W*0.95} y2={H*f} stroke={S} strokeWidth={0.8} />
      ))}
    </Svg>
  );
}
