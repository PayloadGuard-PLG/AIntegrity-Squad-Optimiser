import { View, Text, ScrollView } from 'react-native';
import { AppHeader } from '../../src/components/AppHeader';
import { MonoLabel } from '../../src/components/atoms/MonoLabel';
import { theme } from '../../src/constants/theme';
import { PLAYSTYLE_CATALOG, PLAYSTYLE_LEVEL_EFFECT } from '../../src/data/playstyles';
import { MENTOR_CATALOG } from '../../src/data/mentors';

export default function ReferenceScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60 }}>
        <View style={{ padding: 12, borderWidth: 1, borderColor: theme.hairline2, marginBottom: 14 }}>
          <MonoLabel size={8} color={theme.steelLight}>OBSERVED DATA ONLY</MonoLabel>
          <Text style={{ fontFamily: theme.display, fontSize: 20, color: theme.ink, marginTop: 4, fontWeight: '600' }}>
            Reference catalogue
          </Text>
          <MonoLabel size={8} color={theme.inkMuted} style={{ marginTop: 6 }}>
            THIS PAGE IS INTENTIONALLY INCOMPLETE. UNKNOWN PLAYSTYLES / MENTORS ARE NOT FILLED BY GUESSWORK.
          </MonoLabel>
        </View>

        <View style={{ borderWidth: 1, borderColor: theme.hairline2, marginBottom: 14 }}>
          <View style={{ padding: 10, backgroundColor: theme.surface2, borderBottomWidth: 1, borderBottomColor: theme.hairline2 }}>
            <MonoLabel size={9} color={theme.steelLight}>PLAYSTYLES · PARTIAL</MonoLabel>
          </View>
          {PLAYSTYLE_CATALOG.map((style, i) => (
            <View key={style.id} style={{
              padding: 12,
              borderTopWidth: i > 0 ? 1 : 0,
              borderTopColor: theme.hairline,
            }}>
              <Text style={{ fontFamily: theme.display, fontSize: 16, color: theme.ink, fontWeight: '600' }}>{style.name}</Text>
              <MonoLabel size={8} color={theme.inkSec} style={{ marginTop: 4 }}>
                {style.family.toUpperCase()} · ROLES {style.compatibleRoles.join(' / ')}
              </MonoLabel>
              <MonoLabel size={7} color={theme.inkGhost} style={{ marginTop: 4 }}>
                OBSERVED ON · {style.observedOn.join(', ')}
              </MonoLabel>
            </View>
          ))}
          <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: theme.hairline2 }}>
            <MonoLabel size={8} color={theme.inkMuted}>
              LEVEL EFFECT · STANDARD ×{PLAYSTYLE_LEVEL_EFFECT.Standard} · INTERMEDIATE ×{PLAYSTYLE_LEVEL_EFFECT.Intermediate} · ADVANCED ×{PLAYSTYLE_LEVEL_EFFECT.Advanced} · MASTER ×{PLAYSTYLE_LEVEL_EFFECT.Master}
            </MonoLabel>
          </View>
        </View>

        <View style={{ borderWidth: 1, borderColor: theme.hairline2, marginBottom: 14 }}>
          <View style={{ padding: 10, backgroundColor: theme.surface2, borderBottomWidth: 1, borderBottomColor: theme.hairline2 }}>
            <MonoLabel size={9} color={theme.steelLight}>MENTORS · PARTIAL</MonoLabel>
          </View>
          {MENTOR_CATALOG.map((mentor, i) => (
            <View key={mentor.id} style={{
              padding: 12,
              borderTopWidth: i > 0 ? 1 : 0,
              borderTopColor: theme.hairline,
            }}>
              <Text style={{ fontFamily: theme.display, fontSize: 16, color: theme.ink, fontWeight: '600' }}>{mentor.name}</Text>
              <MonoLabel size={8} color={theme.inkSec} style={{ marginTop: 3 }}>
                {mentor.archetype.toUpperCase()} · OBSERVED LV {mentor.observedLevel}
              </MonoLabel>
              <MonoLabel size={8} color={theme.pos} style={{ marginTop: 7 }}>
                ATTRIBUTE · +{mentor.attributeBoost.amount} {mentor.attributeBoost.stats.join(' + ')}
                {mentor.attributeBoost.nextAmount ? ` · NEXT +${mentor.attributeBoost.nextAmount}` : ''}
              </MonoLabel>
              <MonoLabel size={8} color={theme.hot} style={{ marginTop: 5 }}>
                TACTIC · {mentor.tacticBoost.tactic} +{mentor.tacticBoost.effectivenessPct}%
              </MonoLabel>
              <MonoLabel size={8} color={theme.inkMuted} style={{ marginTop: 5 }}>
                SIGNATURE LV {mentor.signatureMove.unlockLevel} · {mentor.signatureMove.trigger} · {mentor.signatureMove.effect}
              </MonoLabel>
            </View>
          ))}
        </View>

        <View style={{ padding: 12, borderWidth: 1, borderColor: theme.hairline2 }}>
          <MonoLabel size={9} color={theme.steelLight}>MODEL BOUNDARIES</MonoLabel>
          {[
            'Flat mentor attribute boosts are deterministic inputs.',
            'Mentor tactic/signature percentages are labels until their conversion is empirically identified.',
            'Opponent mentor is hidden before the match and remains an unobserved variable.',
            'Lineup Balance is not yet reverse-engineered; observed game values should be stored rather than invented.',
            'Resource Coach remains under active calibration and is intentionally separate from this catalogue.',
          ].map((line, i) => (
            <MonoLabel key={i} size={8} color={theme.inkMuted} style={{ marginTop: 7 }}>· {line}</MonoLabel>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
