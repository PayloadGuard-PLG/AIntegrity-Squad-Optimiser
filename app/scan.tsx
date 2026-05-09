import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSquad } from '../src/hooks/useSquad';
import { theme } from '../src/constants/theme';
import { MonoLabel } from '../src/components/atoms/MonoLabel';
import { Chip } from '../src/components/atoms/Chip';
import { isWhiteStat } from '../src/utils/roleWeights';
import {
  COACH_TYPES, COACH_CATS, TALENT_OPTIONS,
  CoachType, CoachCategory, TalentOption,
  CoachSessionCapture, StatCapture,
  buildCsvRows, todayIso, statListForRoles,
} from '../src/logic/coachScanner';

const EXISTING_CSV_SESSIONS = 4; // last S-number already in COACH_CALIBRATION.csv

function nextId(): string {
  return `S${EXISTING_CSV_SESSIONS + 1}`;
}

function today(): string {
  return todayIso();
}

interface StatRow {
  statName: string;
  active: boolean;
  statBefore: string;
  gainLo: string;
  gainHi: string;
}

export default function ScanScreen() {
  const router = useRouter();
  const { squad } = useSquad();

  // ─── header ────────────────────────────────────────────────────────────────
  const [coachType, setCoachType]     = useState<CoachType>('Standard');
  const [coachCat, setCoachCat]       = useState<CoachCategory>('Defending');
  const [multiplier, setMultiplier]   = useState('20');

  // ─── player card ───────────────────────────────────────────────────────────
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [playerName, setPlayerName]   = useState('');
  const [playerAge, setPlayerAge]     = useState('');
  const [talent, setTalent]           = useState<TalentOption>('Normal');
  const [twoXAd, setTwoXAd]           = useState(false);
  const [ovrBefore, setOvrBefore]     = useState('');
  const [ovrBoostLo, setOvrBoostLo]   = useState('');
  const [ovrBoostHi, setOvrBoostHi]   = useState('');

  // auto-fill from squad when player selected
  const player = squad.find(p => p.id === selectedId) ?? null;
  const statList = player
    ? statListForRoles(player.role)
    : statListForRoles([]);

  // ─── stats ─────────────────────────────────────────────────────────────────
  const [statRows, setStatRows] = useState<StatRow[]>(() =>
    statListForRoles([]).map(s => ({ statName: s, active: false, statBefore: '', gainLo: '', gainHi: '' }))
  );

  // rebuild stat rows whenever the selected player (and thus their stat list) changes
  useEffect(() => {
    const list = statListForRoles(player?.role ?? []);
    setStatRows(list.map(s => ({ statName: s, active: false, statBefore: '', gainLo: '', gainHi: '' })));
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickPlayer(id: string) {
    const p = squad.find(q => q.id === id);
    setSelectedId(id);
    if (p) {
      setPlayerName(p.name);
      setPlayerAge(String(p.age));
      setTalent((p.talent as TalentOption) ?? 'Normal');
      setOvrBefore(String(Math.round(p.overall)));
    }
  }

  function updateRow(idx: number, patch: Partial<StatRow>) {
    setStatRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }

  function toggleActive(idx: number) {
    setStatRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, active: !r.active, statBefore: r.statBefore || (player?.stats[r.statName] != null ? String(Math.round(player.stats[r.statName])) : ''), gainLo: r.gainLo, gainHi: r.gainHi } : r
    ));
  }

  // ─── output ────────────────────────────────────────────────────────────────
  const captured: StatCapture[] = statRows
    .filter(r => r.active && r.statBefore !== '' && r.gainLo !== '' && r.gainHi !== '')
    .map(r => ({
      statName: r.statName,
      statBefore: parseInt(r.statBefore, 10) || 0,
      gainLo: parseInt(r.gainLo, 10) || 0,
      gainHi: parseInt(r.gainHi, 10) || 0,
    }));

  const session: CoachSessionCapture = {
    sessionId: nextId(),
    date: today(),
    playerName: playerName || 'Unknown',
    playerAge: parseInt(playerAge, 10) || 0,
    talentTier: talent,
    twoXAd,
    coachType,
    coachCategory: coachCat,
    multiplier: parseInt(multiplier, 10) || 0,
    ovrBefore: parseInt(ovrBefore, 10) || 0,
    ovrBoostLo: parseInt(ovrBoostLo, 10) || 0,
    ovrBoostHi: parseInt(ovrBoostHi, 10) || 0,
    stats: captured,
  };

  const csvRows = captured.length > 0 ? buildCsvRows(session) : [];
  const csvText = csvRows.join('\n');

  const isReady = playerName.length > 0 && captured.length > 0 && ovrBefore.length > 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      keyboardShouldPersistTaps="handled"
    >
      <MonoLabel color={theme.steelLight} style={{ marginBottom: 18, fontSize: 12 }}>
        COACH SESSION CAPTURE
      </MonoLabel>

      {/* ── 1. COACH HEADER ── */}
      <SectionHeader>1 · COACH TYPE</SectionHeader>

      <MonoLabel size={8} color={theme.inkGhost} style={{ marginBottom: 5 }}>TYPE</MonoLabel>
      <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
        {COACH_TYPES.map(t => (
          <Chip key={t} active={coachType === t} onPress={() => setCoachType(t)} size="sm">{t}</Chip>
        ))}
      </View>

      <MonoLabel size={8} color={theme.inkGhost} style={{ marginBottom: 5 }}>CATEGORY</MonoLabel>
      <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
        {COACH_CATS.map(c => (
          <Chip key={c} active={coachCat === c} onPress={() => setCoachCat(c)} size="sm">{c}</Chip>
        ))}
      </View>

      <MonoLabel size={8} color={theme.inkGhost} style={{ marginBottom: 5 }}>MULTIPLIER ×N</MonoLabel>
      <NumberInput value={multiplier} onChange={setMultiplier} placeholder="20" />

      <Divider />

      {/* ── 2. PLAYER CARD ── */}
      <SectionHeader>2 · PLAYER CARD</SectionHeader>

      {squad.length > 0 && (
        <>
          <MonoLabel size={8} color={theme.inkGhost} style={{ marginBottom: 5 }}>AUTO-FILL FROM SQUAD</MonoLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: 'row', gap: 5, paddingBottom: 12 }}>
            {squad.map(p => (
              <Chip key={p.id} active={p.id === selectedId} onPress={() => pickPlayer(p.id)} size="sm">{p.name}</Chip>
            ))}
          </ScrollView>
        </>
      )}

      <MonoLabel size={8} color={theme.inkGhost} style={{ marginBottom: 5 }}>PLAYER NAME</MonoLabel>
      <TextInput
        value={playerName}
        onChangeText={setPlayerName}
        placeholder="Ricky Grant"
        placeholderTextColor={theme.inkGhost}
        style={inputStyle}
      />

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <View style={{ flex: 1 }}>
          <MonoLabel size={8} color={theme.inkGhost} style={{ marginBottom: 5 }}>AGE</MonoLabel>
          <NumberInput value={playerAge} onChange={setPlayerAge} placeholder="20" />
        </View>
        <View style={{ flex: 1 }}>
          <MonoLabel size={8} color={theme.inkGhost} style={{ marginBottom: 5 }}>OVR BEFORE</MonoLabel>
          <NumberInput value={ovrBefore} onChange={setOvrBefore} placeholder="175" />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <View style={{ flex: 1 }}>
          <MonoLabel size={8} color={theme.inkGhost} style={{ marginBottom: 5 }}>OVR BOOST LO</MonoLabel>
          <NumberInput value={ovrBoostLo} onChange={setOvrBoostLo} placeholder="10" />
        </View>
        <View style={{ flex: 1 }}>
          <MonoLabel size={8} color={theme.inkGhost} style={{ marginBottom: 5 }}>OVR BOOST HI</MonoLabel>
          <NumberInput value={ovrBoostHi} onChange={setOvrBoostHi} placeholder="12" />
        </View>
      </View>

      <MonoLabel size={8} color={theme.inkGhost} style={{ marginTop: 12, marginBottom: 5 }}>TALENT TIER</MonoLabel>
      <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
        {TALENT_OPTIONS.map(t => (
          <Chip key={t} active={talent === t} onPress={() => setTalent(t)} size="sm">{t}</Chip>
        ))}
      </View>

      <Pressable onPress={() => setTwoXAd(v => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, marginBottom: 4 }}>
        <View style={{
          width: 20, height: 20, borderWidth: 1,
          borderColor: twoXAd ? theme.hot : theme.hairline3,
          backgroundColor: twoXAd ? theme.hot + '33' : 'transparent',
          alignItems: 'center', justifyContent: 'center',
        }}>
          {twoXAd && <Text style={{ color: theme.hot, fontSize: 12, fontWeight: '700' }}>✓</Text>}
        </View>
        <MonoLabel size={9} color={twoXAd ? theme.hot : theme.inkMuted}>2× AD ACTIVE</MonoLabel>
      </Pressable>

      <Divider />

      {/* ── 3. STATS ── */}
      <SectionHeader>3 · HIGHLIGHTED STATS</SectionHeader>
      <MonoLabel size={8} color={theme.inkGhost} style={{ marginBottom: 12 }}>
        TAP EACH STAT SHOWN WITH A GAIN RANGE (+lo–hi) ON THE PREVIEW SCREEN
      </MonoLabel>

      {/* white stats */}
      <MonoLabel size={8} color={theme.inkGhost} style={{ marginBottom: 6 }}>WHITE — ESSENTIAL</MonoLabel>
      {statRows
        .filter(r => isWhiteStat(player?.role ?? [], r.statName))
        .map((row, _) => {
          const globalIdx = statRows.findIndex(r => r.statName === row.statName);
          return (
            <StatEntryRow
              key={row.statName}
              row={row}
              isWhite
              onToggle={() => toggleActive(globalIdx)}
              onChangeBefore={v => updateRow(globalIdx, { statBefore: v })}
              onChangeLo={v => updateRow(globalIdx, { gainLo: v })}
              onChangeHi={v => updateRow(globalIdx, { gainHi: v })}
            />
          );
        })}

      {/* grey stats */}
      <MonoLabel size={8} color={theme.inkGhost} style={{ marginTop: 14, marginBottom: 6 }}>GREY — SECONDARY / NON-ROLE</MonoLabel>
      {statRows
        .filter(r => !isWhiteStat(player?.role ?? [], r.statName))
        .map((row) => {
          const globalIdx = statRows.findIndex(r => r.statName === row.statName);
          return (
            <StatEntryRow
              key={row.statName}
              row={row}
              isWhite={false}
              onToggle={() => toggleActive(globalIdx)}
              onChangeBefore={v => updateRow(globalIdx, { statBefore: v })}
              onChangeLo={v => updateRow(globalIdx, { gainLo: v })}
              onChangeHi={v => updateRow(globalIdx, { gainHi: v })}
            />
          );
        })}

      <Divider />

      {/* ── 4. CSV OUTPUT ── */}
      <SectionHeader>4 · CSV OUTPUT</SectionHeader>

      {!isReady ? (
        <View style={{ padding: 14, borderWidth: 1, borderColor: theme.hairline, alignItems: 'center' }}>
          <MonoLabel color={theme.inkGhost}>COMPLETE SECTIONS 1–3 TO GENERATE</MonoLabel>
        </View>
      ) : (
        <>
          {/* summary table */}
          <View style={{ borderWidth: 1, borderColor: theme.hairline2, padding: 12, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', marginBottom: 6 }}>
              <MonoLabel size={8} color={theme.inkGhost} style={{ width: 90 }}>SESSION</MonoLabel>
              <MonoLabel size={8}>{session.sessionId}</MonoLabel>
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 6 }}>
              <MonoLabel size={8} color={theme.inkGhost} style={{ width: 90 }}>COACH</MonoLabel>
              <MonoLabel size={8}>{coachType} {coachCat} ×{multiplier}</MonoLabel>
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 6 }}>
              <MonoLabel size={8} color={theme.inkGhost} style={{ width: 90 }}>PLAYER</MonoLabel>
              <MonoLabel size={8}>{playerName}  Age {playerAge}  {talent}{twoXAd ? '  2×AD' : ''}</MonoLabel>
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 6 }}>
              <MonoLabel size={8} color={theme.inkGhost} style={{ width: 90 }}>OVR</MonoLabel>
              <MonoLabel size={8}>{ovrBefore} → +{ovrBoostLo}–{ovrBoostHi}</MonoLabel>
            </View>
            <View style={{ height: 1, backgroundColor: theme.hairline, marginVertical: 8 }} />
            {captured.map(s => (
              <View key={s.statName} style={{ flexDirection: 'row', paddingVertical: 3 }}>
                <MonoLabel size={8} style={{ width: 120 }}>{s.statName}</MonoLabel>
                <MonoLabel size={8} color={theme.inkGhost} style={{ width: 50 }}>{s.statBefore}</MonoLabel>
                <MonoLabel size={8} color={theme.pos}>+{s.gainLo}–{s.gainHi}</MonoLabel>
              </View>
            ))}
            <MonoLabel size={8} color={theme.inkGhost} style={{ marginTop: 8 }}>{captured.length} STATS CAPTURED</MonoLabel>
          </View>

          {/* selectable CSV text */}
          <MonoLabel size={8} color={theme.inkGhost} style={{ marginBottom: 6 }}>
            LONG-PRESS TO SELECT ALL · COPY · PASTE INTO COACH_CALIBRATION.CSV
          </MonoLabel>
          <View style={{ borderWidth: 1, borderColor: theme.hairline3, padding: 12, backgroundColor: theme.surface2 }}>
            <Text
              selectable
              style={{ fontFamily: theme.mono, fontSize: 9, color: theme.steelLight, lineHeight: 16 }}
            >
              {csvText}
            </Text>
          </View>

          <View style={{ marginTop: 8, padding: 10, borderWidth: 1, borderColor: theme.hairline }}>
            <MonoLabel size={8} color={theme.inkGhost}>
              PASTE AFTER LINE S{EXISTING_CSV_SESSIONS} IN data/COACH_CALIBRATION.CSV
            </MonoLabel>
          </View>
        </>
      )}

      <Pressable onPress={() => router.back()}
        style={{ marginTop: 24, padding: 14, borderWidth: 1, borderColor: theme.hairline2, alignItems: 'center' }}>
        <MonoLabel color={theme.inkMuted}>← BACK</MonoLabel>
      </Pressable>
    </ScrollView>
  );
}

// ─── sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <MonoLabel size={11} color={theme.ink} style={{ marginBottom: 12 }}>
      {children}
    </MonoLabel>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: theme.hairline, marginVertical: 20 }} />;
}

const inputStyle = {
  fontFamily: theme.mono,
  fontSize: 13,
  color: theme.ink,
  borderWidth: 1,
  borderColor: theme.hairline2,
  padding: 10,
  backgroundColor: theme.surface2,
} as const;

function NumberInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <TextInput
      keyboardType="numeric"
      value={value}
      onChangeText={v => onChange(v.replace(/[^0-9]/g, ''))}
      placeholder={placeholder}
      placeholderTextColor={theme.inkGhost}
      style={{ ...inputStyle, textAlign: 'center', fontSize: 16, fontWeight: '700' }}
    />
  );
}

interface StatEntryRowProps {
  row: { statName: string; active: boolean; statBefore: string; gainLo: string; gainHi: string };
  isWhite: boolean;
  onToggle: () => void;
  onChangeBefore: (v: string) => void;
  onChangeLo: (v: string) => void;
  onChangeHi: (v: string) => void;
}

function StatEntryRow({ row, isWhite, onToggle, onChangeBefore, onChangeLo, onChangeHi }: StatEntryRowProps) {
  const accentColor = isWhite ? theme.steelLight : theme.inkMuted;
  return (
    <View style={{ marginBottom: row.active ? 8 : 2 }}>
      <Pressable onPress={onToggle}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 7,
          paddingHorizontal: 10,
          borderWidth: 1,
          borderColor: row.active ? accentColor : theme.hairline,
          backgroundColor: row.active ? accentColor + '12' : 'transparent',
        }}>
        <View style={{
          width: 5, height: 5,
          backgroundColor: row.active ? accentColor : theme.hairline3,
        }} />
        <Text style={{
          fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.8,
          color: row.active ? accentColor : theme.inkGhost,
          flex: 1,
        }}>
          {row.statName}
        </Text>
        {!row.active && (
          <Text style={{ fontFamily: theme.mono, fontSize: 9, color: theme.inkGhost }}>TAP</Text>
        )}
      </Pressable>

      {row.active && (
        <View style={{
          flexDirection: 'row', gap: 6, paddingHorizontal: 10,
          paddingVertical: 8, borderWidth: 1, borderTopWidth: 0,
          borderColor: accentColor,
          backgroundColor: theme.surface,
        }}>
          <View style={{ flex: 2 }}>
            <MonoLabel size={7} color={theme.inkGhost} style={{ marginBottom: 3 }}>CURRENT VAL</MonoLabel>
            <TextInput
              keyboardType="numeric"
              value={row.statBefore}
              onChangeText={v => onChangeBefore(v.replace(/[^0-9]/g, ''))}
              placeholder="120"
              placeholderTextColor={theme.inkGhost}
              style={{ ...inputStyle, fontSize: 13, textAlign: 'center', padding: 6 }}
            />
          </View>
          <View style={{ flex: 2 }}>
            <MonoLabel size={7} color={theme.pos} style={{ marginBottom: 3 }}>+GAIN LO</MonoLabel>
            <TextInput
              keyboardType="numeric"
              value={row.gainLo}
              onChangeText={v => onChangeLo(v.replace(/[^0-9]/g, ''))}
              placeholder="66"
              placeholderTextColor={theme.inkGhost}
              style={{ ...inputStyle, fontSize: 13, textAlign: 'center', padding: 6 }}
            />
          </View>
          <View style={{ flex: 2 }}>
            <MonoLabel size={7} color={theme.pos} style={{ marginBottom: 3 }}>+GAIN HI</MonoLabel>
            <TextInput
              keyboardType="numeric"
              value={row.gainHi}
              onChangeText={v => onChangeHi(v.replace(/[^0-9]/g, ''))}
              placeholder="77"
              placeholderTextColor={theme.inkGhost}
              style={{ ...inputStyle, fontSize: 13, textAlign: 'center', padding: 6 }}
            />
          </View>
        </View>
      )}
    </View>
  );
}
