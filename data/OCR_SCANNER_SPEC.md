# OCR Scanner Spec — Coach Preview Auto-Fill
## AIntegrity Squad Optimiser

**Purpose:** Automatically extract data from in-game coaching preview screenshots
and append rows to `data/COACH_CALIBRATION.csv` without manual entry.

**Status:** Spec only — not yet implemented.

---

## 1. What the Screen Shows

A coaching preview screen has four zones:

```
┌────────────────────────────────────────────┐
│  STANDARD DEFENDING ×20          [ZONE A]  │  ← header: coach type + multiplier
├────────────────────────────────────────────┤
│  RICKY GRANT  Age 20  OVR 175  +10–12      │  ← [ZONE B] player card
│  Normal  DL / ML / AML                     │
├─────────────┬────────────┬─────────────────┤
│  DEFENSE    │  ATTACK    │  PHYSICAL       │  ← [ZONE C] three columns
│  TACKLING   │  PASSING   │  FITNESS        │
│  120 +66–77 │  130       │  260            │  ←  highlighted = has gain range
│  MARKING    │  DRIBBLING │  STRENGTH       │     plain number = not covered
│  137 +54–63 │  223       │  64             │
│  HEADING    │  CROSSING  │  AGGRESSION     │
│  154 +13–18 │  154       │  201            │
│  BRAVERY    │  SHOOTING  │  SPEED          │
│  214 +15–22 │  150       │  160            │
│             │  FINISHING │  CREATIVITY     │
│             │  164       │  256            │
└─────────────┴────────────┴─────────────────┘
```

A highlighted stat row: `TACKLING   120 +66–77`
A non-highlighted stat row: `PASSING   130`

Only highlighted stats (those with a gain range) go into the CSV.

---

## 2. Target Output — CSV Columns

One row per highlighted stat. All rows from one preview share the same `session_id`.

| Column | Source | Notes |
|---|---|---|
| `session_id` | Auto-increment from last S-number in CSV | e.g. S5 |
| `date` | System date at scan time | YYYY-MM-DD |
| `player_name` | Zone B — first line | e.g. "Ricky Grant" |
| `player_age` | Zone B — "Age N" | integer |
| `talent_tier` | Zone B — line 2, first token | FT1 / FT2 / FT3 / Normal / Slow |
| `two_x_ad` | User prompt / metadata | yes / no — cannot be read from screenshot |
| `coach_type` | Zone A — first word | Standard / Focused / Extensive |
| `coach_category` | Zone A — second word | Attacking / Defending / Physical / Safeguard |
| `multiplier` | Zone A — "×N" | integer |
| `n_stats_covered` | Count of highlighted rows found | integer |
| `stat_name` | Zone C — stat label from highlighted row | ALL CAPS, exactly as in app |
| `stat_before` | Zone C — first number in highlighted row | integer |
| `gain_lo` | Zone C — lo from "+lo–hi" | integer |
| `gain_hi` | Zone C — hi from "+lo–hi" | integer |
| `ovr_before` | Zone B — "OVR N" | integer |
| `ovr_boost_lo` | Zone B — "+lo–hi" on player card | integer |
| `ovr_boost_hi` | Zone B — "+lo–hi" on player card | integer |
| `notes` | Empty by default | string |

---

## 3. Canonical Stat Names

The OCR output must be normalised to these exact strings (ALL CAPS) before writing to CSV.

### Outfield (15 stats)
```
SHOOTING    PASSING     CROSSING    DRIBBLING   FINISHING
HEADING     TACKLING    MARKING     POSITIONING  BRAVERY
AGGRESSION  STRENGTH    SPEED       FITNESS     CREATIVITY
```

### GK (15 stats)
```
REFLEXES    AGILITY     ANTICIPATION   RUSHING OUT   COMMUNICATION
THROWING    KICKING     PUNCHING       AERIAL REACH  CONCENTRATION
FITNESS     STRENGTH    AGGRESSION     SPEED         CREATIVITY
```

Multi-word stats (`RUSHING OUT`, `AERIAL REACH`) occupy two OCR text blocks on the
same Y-baseline. Join them before matching. The canonical list is the ground truth —
reject any OCR token that does not match after normalisation.

---

## 4. Parsing Rules

### Zone A — Header
Pattern: `(Standard|Focused|Extensive)\s+(Attacking|Defending|Physical|Safeguard)\s+×(\d+)`
- Match case-insensitively. The `×` character may OCR as `x` or `X` — treat all as multiplier marker.

### Zone B — Player Card
- Player name: largest text block in the card area, likely multi-token (e.g. "RICKY GRANT")
- Age: token matching `Age\s+(\d+)` or standalone integer adjacent to "Age" label
- OVR: token matching `OVR\s+(\d+)` or integer adjacent to "OVR" label
- OVR boost: token matching `\+(\d+)[–-](\d+)` on the card (the dash may OCR as en-dash `–`, hyphen `-`, or em-dash `—`)
- Talent tier: one of `FT1|FT2|FT3|Normal|Slow` in the card area
- Role: one or more of the 12 known role tokens on the card — not needed for CSV but useful for validation

### Zone C — Stat Rows
For each text block that matches a canonical stat name:
1. Collect all numeric tokens sharing the same Y-baseline (within ±`Y_TOLERANCE = 15px`)
2. Check if any token matches `\+(\d+)[–-](\d+)` — that stat is highlighted
3. If highlighted:
   - `stat_before` = first standalone integer on the row
   - `gain_lo`, `gain_hi` = the two integers from the gain pattern
4. If not highlighted: skip row (not covered by this coach)

**Multi-word stats:** if two adjacent text blocks are both on the same Y-baseline and their
concatenation matches a canonical stat name, treat them as one stat token.

---

## 5. Gain Pattern — Edge Cases

The gain display format in-game: `120 +66–77`

| Variation | Handling |
|---|---|
| En-dash `–` | Normalise to `-` for parseInt |
| Hyphen `-` | Already standard |
| Em-dash `—` | Normalise to `-` |
| Space before `+` | Strip whitespace |
| `+lo-hi` with no space | Regex handles: `\+(\d+)[–\-—](\d+)` |
| OVR boost on card `+10–12` | Same regex, applied to card zone only |

---

## 6. Ambiguous Cases

| Case | Resolution |
|---|---|
| Talent tier not visible | Write `Unknown` — user must correct |
| Player name OCR error | Write best match, flag for review |
| stat_before reads 0 | Stat may be at 0; log as-is |
| Two stats at same Y within tolerance | Expand Y_TOLERANCE to 8px or use X-separation |
| Multiplier char OCRs as `×` or `x` or `X` | Accept all, parse trailing `(\d+)` |
| Column separator line misread as stat | Reject — canonical stat name match fails |

---

## 7. Implementation Approach (React Native + ML Kit)

Use `@react-native-ml-kit/text-recognition` (Google ML Kit v2, on-device, no network call).

```typescript
import TextRecognition from '@react-native-ml-kit/text-recognition';

// All canonical stat names (source of truth from roleWeights.ts)
import { OUTFIELD_STATS, GK_STATS } from '../src/utils/roleWeights';
const ALL_STAT_NAMES = new Set([...OUTFIELD_STATS, ...GK_STATS]);

const Y_TOLERANCE = 15; // px — tune per device density if needed
const GAIN_RE = /\+(\d+)[–\-—](\d+)/;
const MULTIPLIER_RE = /(?:Standard|Focused|Extensive)\s+(\w+)\s+[×xX](\d+)/i;
const OVR_RE = /OVR\s*(\d+)/i;
const OVR_BOOST_RE = /\+(\d+)[–\-—](\d+)/;
const AGE_RE = /Age\s*(\d+)/i;
const TALENT_RE = /\b(FT1|FT2|FT3|Normal|Slow)\b/i;

async function scanCoachPreview(imagePath: string): Promise<CoachPreviewData | null> {
  const result = await TextRecognition.recognize(imagePath);
  const blocks = result.blocks.flatMap(b => b.lines).flatMap(l => l.elements);
  // blocks: Array<{ text: string, frame: { x, y, width, height } }>

  // 1. Zone A — header
  const fullText = blocks.map(b => b.text).join(' ');
  const headerMatch = MULTIPLIER_RE.exec(fullText);
  if (!headerMatch) return null;
  const coachCategory = headerMatch[1]; // Attacking | Defending | Physical | Safeguard
  const multiplier = parseInt(headerMatch[2]);

  // coach_type inferred from how the regex matched — improve with explicit prefix scan
  const coachType = /Standard/i.test(fullText) ? 'Standard'
    : /Focused/i.test(fullText) ? 'Focused' : 'Extensive';

  // 2. Zone B — player card (top ~25% of image)
  // Filter blocks by Y position (image-height-relative estimate)
  const ovrMatch = OVR_RE.exec(fullText);
  const ovrBefore = ovrMatch ? parseInt(ovrMatch[1]) : 0;

  const ovrBoostMatch = OVR_BOOST_RE.exec(fullText.replace(/OVR\s*\d+/, '')); // avoid matching OVR itself
  const ovrBoostLo = ovrBoostMatch ? parseInt(ovrBoostMatch[1]) : 0;
  const ovrBoostHi = ovrBoostMatch ? parseInt(ovrBoostMatch[2]) : 0;

  const ageMatch = AGE_RE.exec(fullText);
  const playerAge = ageMatch ? parseInt(ageMatch[1]) : 0;

  const talentMatch = TALENT_RE.exec(fullText);
  const talentTier = talentMatch ? talentMatch[1] : 'Unknown';

  // 3. Zone C — stat rows
  // Group blocks by Y-baseline
  const highlighted: HighlightedStat[] = [];
  const processed = new Set<number>();

  for (let i = 0; i < blocks.length; i++) {
    if (processed.has(i)) continue;
    const block = blocks[i];
    const normText = block.text.toUpperCase().trim();

    // Attempt two-word stat (RUSHING OUT, AERIAL REACH)
    let statName = '';
    let consumedIndices = [i];
    if (ALL_STAT_NAMES.has(normText)) {
      statName = normText;
    } else if (i + 1 < blocks.length) {
      const next = blocks[i + 1];
      const twoWord = (normText + ' ' + next.text.toUpperCase().trim());
      if (ALL_STAT_NAMES.has(twoWord) && Math.abs(next.frame.y - block.frame.y) < Y_TOLERANCE) {
        statName = twoWord;
        consumedIndices = [i, i + 1];
      }
    }
    if (!statName) continue;

    // Collect all blocks on same Y-baseline
    const rowBlocks = blocks.filter((b, idx) =>
      !consumedIndices.includes(idx) &&
      Math.abs(b.frame.y - block.frame.y) < Y_TOLERANCE
    );

    // Look for gain pattern in row
    const rowText = rowBlocks.map(b => b.text).join(' ');
    const gainMatch = GAIN_RE.exec(rowText);
    if (!gainMatch) {
      consumedIndices.forEach(idx => processed.add(idx));
      continue; // stat present but not highlighted by this coach
    }

    // stat_before = first standalone integer in row
    const numericTokens = rowBlocks.map(b => parseInt(b.text)).filter(n => !isNaN(n));
    const statBefore = numericTokens[0] ?? 0;
    highlighted.push({
      stat_name: statName,
      stat_before: statBefore,
      gain_lo: parseInt(gainMatch[1]),
      gain_hi: parseInt(gainMatch[2]),
    });
    consumedIndices.forEach(idx => processed.add(idx));
  }

  return {
    coachType,
    coachCategory,
    multiplier,
    playerAge,
    talentTier,
    ovrBefore,
    ovrBoostLo,
    ovrBoostHi,
    nStatsCovered: highlighted.length,
    stats: highlighted,
  };
}
```

---

## 8. Output — CSV Row Builder

```typescript
function buildCsvRows(scan: CoachPreviewData, sessionId: string, playerName: string, twoXAd: boolean, date: string): string[] {
  return scan.stats.map(s =>
    [
      sessionId, date, playerName, scan.playerAge,
      scan.talentTier, twoXAd ? 'yes' : 'no',
      scan.coachType, scan.coachCategory, scan.multiplier,
      scan.nStatsCovered,
      s.stat_name, s.stat_before, s.gain_lo, s.gain_hi,
      scan.ovrBefore, scan.ovrBoostLo, scan.ovrBoostHi,
      '',
    ].join(',')
  );
}
```

Note: `player_name` and `two_x_ad` cannot be reliably extracted from the screenshot.
The calling UI should prompt the user to confirm both before writing to the CSV.

---

## 9. Integration Points

| File | Change needed |
|---|---|
| `data/COACH_CALIBRATION.csv` | Rows appended by scanner output |
| `src/utils/roleWeights.ts` | `OUTFIELD_STATS`, `GK_STATS` already exported — use as canonical stat list |
| New file: `src/logic/coachScanner.ts` | `scanCoachPreview()` + `buildCsvRows()` |
| New screen: `app/scan.tsx` | Camera/image picker → scan → preview → confirm → append to CSV |
| `app/(tabs)/coaches.tsx` | Optional: "Import from scan" button to pre-fill stat selection |

---

## 10. Validation After Scan

Before appending to CSV, show the user a confirmation table:

```
Coach: Standard Defending ×20
Player: [confirm name] | Age: 20 | Talent: Normal | 2× ad: [yes/no]
OVR: 175 → +10–12

TACKLING   120   +66–77   ✓
MARKING    137   +54–63   ✓
HEADING    154   +13–18   ✓
BRAVERY    214   +15–22   ✓

4 stats found — append to COACH_CALIBRATION.csv?  [YES / DISCARD]
```

User can correct the player name and 2× ad flag before confirming.

---

## 11. What This Does NOT Replace

- Manual review of ambiguous OCR output (always show confirmation before write)
- The calibration script (`node /tmp/calibrate.mjs`) — OCR feeds data in; calibration analyses it
- `COACH_CALIBRATION_README.md` — still the definitive column guide

---

## 12. Known Limitations

| Limitation | Mitigation |
|---|---|
| Player name OCR errors (mixed fonts) | Prompt user to confirm/correct |
| `two_x_ad` not visible in screenshot | Always ask user before write |
| Highlighted vs. non-highlighted colour — may not survive JPEG compression | Use PNG screenshots if possible |
| Varying screen resolution / DPI | Percentage-based Y_TOLERANCE; test on target device |
| GK screens look different (different stat labels) | Canonical stat list includes GK names; works automatically |
