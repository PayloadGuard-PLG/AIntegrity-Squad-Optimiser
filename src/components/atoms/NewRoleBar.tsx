import { View, Text } from 'react-native';
import { theme } from '../../constants/theme';

// New-role training progress. Opens at 50 points; starts at 0.
// One role unlocks at a time, earned through training drills one by one.
const UNLOCK = 50;
const N_SEGS = 5; // 5 segments × 10 pts each

// Gradient: dim steel → steelLight → pos green
const SEG_COLORS = ['#3d4a66', '#5b6b8a', '#7a90af', '#9eb0d4', '#7eb89a'];

type Props = {
  roleName: string;
  points: number; // 0–50
  /**
   * Ability template ids read from the card. `undefined` means the strip was
   * never read (nothing is shown); `[]` means it was read and is genuinely
   * empty (shown as a dash). The two are not the same state.
   */
  specialAbilities?: string[];
};

export function NewRoleBar({ roleName, points, specialAbilities }: Props) {
  const clamped = Math.min(Math.max(points, 0), UNLOCK);
  const ptsPerSeg = UNLOCK / N_SEGS;

  return (
    // Container occupies top half of a shared slot — bottom half reserved for future ability
    <View style={{ height: 16, justifyContent: 'flex-start' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 8 }}>
        <Text style={{ fontFamily: theme.mono, fontSize: 7, letterSpacing: 0.8, color: theme.inkMuted, lineHeight: 8 }}>
          NR
        </Text>
        <Text style={{ fontFamily: theme.mono, fontSize: 7, letterSpacing: 0.5, color: theme.steelLight, lineHeight: 8 }}>
          {roleName}
        </Text>
        <View style={{ flex: 1, flexDirection: 'row', gap: 1, height: 3, alignItems: 'center' }}>
          {Array.from({ length: N_SEGS }, (_, i) => {
            const segStart = i * ptsPerSeg;
            const fill = Math.min(Math.max(clamped - segStart, 0), ptsPerSeg) / ptsPerSeg;
            return (
              <View key={i} style={{ flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.06)' }}>
                {fill > 0 && (
                  <View style={{
                    position: 'absolute', top: 0, left: 0, bottom: 0,
                    width: `${fill * 100}%` as unknown as number,
                    backgroundColor: SEG_COLORS[i],
                  }} />
                )}
              </View>
            );
          })}
        </View>
      </View>
      {/* bottom half of the slot: special abilities read from the card */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 8 }}>
        {specialAbilities !== undefined && (
          <>
            <Text style={{ fontFamily: theme.mono, fontSize: 7, letterSpacing: 0.8, color: theme.inkMuted, lineHeight: 8 }}>
              SA
            </Text>
            <Text style={{ fontFamily: theme.mono, fontSize: 7, letterSpacing: 0.5, color: theme.steelLight, lineHeight: 8 }}>
              {specialAbilities.length > 0 ? specialAbilities.join(' ') : '—'}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}
