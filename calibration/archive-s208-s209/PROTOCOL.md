# S208–S209 screenshot archive — collection, validation and identity protocol

Drive folder **Archive Coaches** (`1CfEZSCr4QTuUts0HTu7BiCDw7_N5DnRP`), capture dates 18 Apr – 16 May 2026.
Transcriptions go into the `Archive_*` tabs of **Resource Coach Experiment Log — v1**
(`1Sgu5etUVWCmpigbsyA280x33MwnMLW7po9TLU3V4QmI`). The machine-readable contract is
[`archive-schema.json`](archive-schema.json). The checker is
[`tools/drive-data-exchange/archive-validate.mjs`](../../tools/drive-data-exchange/archive-validate.mjs), and the
**Drive Resource Coach Collection** workflow runs it on every collection.

The rule that governs everything below comes from the repository's standing instruction. A number is
**observed** only if the screen displayed it and it was read. The validator **computes** everything else,
and a transcriber never types it. Anything that cannot be read is left **absent**.

---

## 0. What this archive can decide

1. **Club level from the screen itself.** Every coach preview shows `Avg: X (Q)` under each column.
   The bracket follows `Q = offset + mean/4`, where the mean comes from the five displayed stats of that
   column. The offsets already on record are own L15 = 70, association L17 = 80, L31 = 150 and L54 = 265.
   All four satisfy **offset = 5 × (club level − 1)** exactly; friends views read 70, which is the viewer's
   level. Two archive previews read so far give the following:

   | capture | player | offset | level if the law holds |
   |---|---|---|---|
   | 18 Apr 09:28 | Scott Ritchie | 40.05 | **9** |
   | 16 May 12:53 | Michael Benwell | 45.0 | **10** |

   This is a prediction that you can check. If any archive screen shows the club level itself, record it in
   `Archive_Club_State.club_level_displayed`. The validator then scores the law (`clubLevelLawTests`).
2. **Whether the coach dose depends on club level.** The quarantined HIST previews at T0 need 0.46–0.86 of
   the frozen amplitude. Scott Ritchie, at offset 40, needs 0.54–0.60; for comparison, 40/70 = 0.57. The
   hypothesis is untested, because the HIST records carry no level. Every archive preview carries its own
   offset, so the transcription decides it.
3. **Where HIST came from.** HIST record `PRV-0015` is identical, reading for reading, to
   `Screenshot_20260418-092812.png`. Its tier (T2), however, came from a source dated 11 Sep
   (`SRC-USER-20260911-005`). A tier observed five seasons later was attached to an April preview. That is why
   Scott Ritchie fitted only at Δ = 0. Rule P3 below makes that construction impossible.

---

## 1. Pre-audit of the Drive folder (24 Sep 2026)

- The folder held **103 files**: **73 named** `Screenshot_YYYYMMDD-HHMMSS.png` files and **30 `image.jpg`**
  files. The `image.jpg` files are PNGs despite the extension, and each has the same byte size as a named
  screenshot. One pair was hashed: `image.jpg` `1y1zsCTh…` is byte-identical to
  `Screenshot_20260516-125335.png`. The user is deleting the `image.jpg` copies. After deletion there should
  be **73 files, not the 74 quoted**; confirm whether one screenshot is missing.
- `Screenshot_20260508-134609.png` and `-134625.png` have identical sizes but **different contents**. Keep both.
  If they show the same preview, the validator marks the later one `DUPLICATE_EVIDENCE`.
- The captures run to **16 May**, not 12 May. By day: 18 Apr (6), 23 Apr (4), 6 May (11), 7 May (2),
  8 May (20), 9 May (10), 10 May (7), 11 May (1), 15 May (11), 16 May (1).
- **18 Apr is the last day of S208, and 16 May is the last day of S209.** The rollover time and the device
  time zone are unknown, so those seven screens have no season until the validator resolves one from the
  player's age elsewhere (`SEASON_BY_AGE`).
- The 18 Apr captures are 2244×1008; the May captures are 2992×1344. Record `width_px`/`height_px`. Pixel
  calibration from one set does not transfer to the other.
- The `DRILL SESSION` programme pill already existed on 18 Apr. Transcribe it verbatim; do not assume it.
- Full listing: [`drive-inventory-20260924.json`](drive-inventory-20260924.json). The CI run lists the folder
  again with md5 checksums every time.

---

## 2. Who does what

| role | who | may do | may not do |
|---|---|---|---|
| Reader A | assistant, first pass | append rows with `read_id = A` | read B, edit anything computed |
| Reader B | assistant in a **fresh conversation**, or the user | append rows with `read_id = B` without looking at A | copy A |
| Adjudicator | the user, looking at the image | append rows with `read_id = U`, write `Archive_Decisions` | edit A or B to make them agree |
| Validator | CI (`archive-validate.mjs`) | compute seasons, grades, pairing, club level and duplicates; hash the tabs | write to Drive |

The service account is read-only, and no automated step writes to Drive.

---

## 3. Step by step

1. **Create the tabs.** Add these eight tabs to the existing spreadsheet, with the header row exactly as
   given. Order and spelling are checked, and any other header fails the run with `HEADER_MISMATCH`.
   ```
   Archive_Sources            source_id,drive_file_id,drive_name,drive_md5,width_px,height_px,capture_local,capture_basis,screen_type,duplicate_of_source_id,notes
   Archive_Previews           preview_id,source_id,read_id,player_name,age,roles_established,roles_learning,ovr_displayed,coach_type,coach_category,multiplier,programme_label,duration_label,reward_badge,eligibility_text,ovr_boost_lo,ovr_boost_hi,tier_card_id,notes
   Archive_Preview_Stats      preview_id,read_id,stat,start_value,gain_lo,gain_hi,display_class
   Archive_Preview_Categories preview_id,read_id,category,avg_displayed,quality,gain_lo,gain_hi
   Archive_Cards              card_id,source_id,read_id,player_name,age,tier_label,roles_established,roles_learning,ovr_displayed,notes
   Archive_Card_Stats         card_id,read_id,stat,value,display_class
   Archive_Club_State         source_id,read_id,view,club_name,club_level_displayed,team_ovr,team_quality,notes
   Archive_Decisions          entity_id,decided_at,decided_by,decision,codes,rationale
   ```
   **Never put archive rows in `Experiments`, `Observed_Stats` or `Partition_History`.** The collector
   rejects any Experiments row whose `partition`, `log_source` or `log_batch_id` starts with `archive`
   (`REJECTED_ARCHIVE_ROW_IN_EXPERIMENTS`), and the rejection blocks promotion.
2. **Sources.** Add one row per file in the folder, duplicates included, with IDs `ARC-0001…` in capture
   order. For each row:
   - Copy `capture_local` from the filename (`2026-04-18T09:28:12`) and set `capture_basis = filename`.
   - A file without a timestamped name needs `in-image-clock` or `user-stated`, or `inherited-duplicate` when
     it is a copy.
   - For a byte-identical copy, set `duplicate_of_source_id` to the kept source's ID.
3. **Screen type.** Use `coach-preview` (a preview with a player selected), `player-card`, `squad-list`,
   `club-overview`, `coach-inventory`, `other` or `unreadable`. Only previews and cards are transcribed
   further. Club overviews go to `Archive_Club_State`.
4. **Read A.** Transcribe every preview and card using the rules in section 4.
5. **Read B.** A fresh conversation re-reads the same images from the images alone.
6. **Validate.** Run **Actions → Drive Resource Coach Collection → Run workflow**. Open the artifact's
   `archive/archive-validation.json` and deal with every code as section 6 describes. Fix a transcription by
   adding a `U` read, never by editing A or B.
7. **Decide.** Use `Archive_Decisions` to `REJECT` or `QUARANTINE` anything that is not evidence, with a
   rationale. `ACKNOWLEDGE` clears only `CLASS_ROLE_CONFLICT` and `CATEGORY_GAIN_MISSING`, after you have
   looked at the image. No decision can clear an arithmetic failure or raise a grade.
8. **Freeze.** When the run reports `status: VALID`, copy the artifact's `archive/snapshot/` folder into
   `calibration/archive-s208-s209/snapshot/` through a pull request. When the transcription is finished, set
   `"sealed": true` in `manifest.json`. From then on, any difference between Drive and the repository fails
   the scheduled run (section 8).

---

## 4. Reading a coach preview: what to write and what never to write

Transcribe **every one of the 15 stat rows**, whether it is highlighted or not.

| field | read it from | rule |
|---|---|---|
| `player_name`, `age` | card panel on the left | as shown |
| `roles_established` | coloured chips (green, yellow, …) | space-separated |
| `roles_learning` | **dark** chips | a dark chip is learning and confers no white stats |
| `ovr_displayed` | grey box, e.g. `100.3` | keep the decimal |
| `ovr_boost_lo/hi` | teal box `+9-12` | `+1` → lo 1, hi 1 |
| `coach_type`, `coach_category`, `multiplier` | title `STANDARD DEFENDING ×40` | `Standard`, `Defending`, `40` |
| `programme_label`, `duration_label` | pill and timer | verbatim; leave blank if absent |
| `reward_badge` | header | `TRUE` if a Reward marking is visible; `FALSE` only if the whole header is visible without one; otherwise `UNREAD` |
| `eligibility_text` | under SELECT PLAYER | e.g. `Max 9 stars, Max 30 years` |
| `start_value` | number before `+` | every row |
| `gain_lo`, `gain_hi` | `+lo-hi` | blank on rows with no range; **an inverted pair is written as shown** (the validator flags it; never swap it) |
| `display_class` | text colour of the row | `WHITE` for dark bold text, `MID_GREY` for dimmed text, **`UNREAD` when a highlight bar hides the colour** |
| categories | `Avg: 123 (70.8)` and the teal `+28-35` beside it | one row per column; `avg_displayed = 123`, `quality = 70.8` |

**Never:**
- take a tier from memory, from a later card or from the HIST workbook;
- fill a class from the role table;
- average or midpoint anything;
- correct a number because it looks wrong. The arithmetic checks exist to catch it, and a "corrected"
  number defeats them.

The tier is not on the preview. It comes only from a player card with the identical state in the same
season (`tier_card_id`, rule P3).

**Player cards.** Transcribe all 15 stats, the tier word as the game shows it (None, Rare, Elite, Stellar,
Master, Epic, Legendary), the chips with any `X/50` counter, and the OVR as shown.

---

## 5. Computed by the validator (never typed)

The validator computes these quantities:
- the season and any season resolution;
- `p` (the number of rows with a range);
- the transfer class from the badge;
- the quality offset and the club-level reading;
- pairing verdicts and the tier;
- the class used by the model (the card's class, else the preview's);
- duplicate status;
- the grade.

It also emits `archive-evidence-candidates.json`: VERIFIED ordinary previews, labelled with the partition
`archive-s208` or `archive-s209`. They are **candidates, not calibration evidence**. Nothing enters the run
log or the calibration partition automatically. They join the HIST stratum only as a held-out,
level-annotated comparison set, until a pre-registered test says otherwise.

---

## 6. Checks

**Hard codes (quarantine; fix by re-reading).**

| code | check |
|---|---|
| `READ_DISAGREE` | reads A and B differ; the report lists every differing cell |
| `STAT_SET` | not exactly the 15 outfield (or 15 goalkeeper) stats |
| `OVR_DISPLAY` | preview: `Σstart/15 ≤ OVR < (Σstart+15)/15`. The box shows internal sum/15, and each displayed stat truncates a fractional part below 1. Card: `15·OVR−15 < Σ < 15·OVR+15` |
| `OVR_BOOST_ENVELOPE` | `floor(Σlo/15) ≤ boost_lo ≤ boost_hi ≤ ceil(Σhi/15)`; all 22 historical previews satisfy it |
| `CATEGORY_SUM` | column gain = `round(Σ affected lo / 5)` and `round(Σ affected hi / 5)`; exact on every preview checked |
| `AVG_DISPLAY` | `|Avg − column mean| > 1` |
| `OFFSET_INCONSISTENT` | the three columns' `Q − mean/4` differ by more than 0.3 |
| `INTERVAL_HALF`, `INTERVAL_INVERTED`, `INTERVAL_NEGATIVE` | failed interval read |
| `NO_AFFECTED_STATS`, `ROLES_EMPTY` | nothing observed |
| `SEASON_UNRESOLVED` | boundary-day screen with no age anchor for the player |
| `AGE_SEASON` | season − age is not constant for a player |
| `TIER_REGRESS` | a later card shows a lower tier |
| `TIER_CARD_SEASON`, `TIER_CARD_STATE`, `TIER_CARD_PLAYER`, `TIER_CARD_UNKNOWN` | the claimed tier card is from another season, shows different stats, shows another player or does not exist |
| `CLASS_CARD_CONFLICT` | the preview and card colours disagree |
| `SOURCE_TYPE`, `SOURCE_UNKNOWN` | screen type or source mismatch |

**Provisional codes (usable for context, not evidence).**

| code | meaning |
|---|---|
| `SINGLE_READ` | no second read |
| `TIER_UNOBSERVED` | no tier card |
| `TIER_CARD_NOT_VERIFIED` | the tier card is below VERIFIED |
| `TIER_UNREAD` | tier word not read |
| `CLASS_UNREAD` | an affected stat's colour was read neither on the preview nor on the card |
| `CLASS_ROLE_CONFLICT` | colour disagrees with the role table; could be a misread or a pre-update role table; look, then `ACKNOWLEDGE` or re-read |
| `REWARD_UNREAD` | the Reward badge could not be read |
| `CATEGORY_GAIN_MISSING` | an affected column's category gain was not transcribed |

**Run-level errors (the whole archive is INVALID until fixed).**

| code | meaning |
|---|---|
| `HEADER_MISMATCH` | a tab's header row does not match the schema |
| `CELL_TYPE`, `CELL_ENUM`, `CELL_REQUIRED` | a cell has the wrong type, a value outside its enum, or is missing |
| `KEY_DUPLICATE` | two rows share a key |
| `ORPHAN_ROW` | a stat or category row with no matching header read |
| `SOURCE_ROW_MISSING` | a Drive file has no source row |
| `SOURCE_FILE_MISSING` | a source row names a file not in the folder |
| `ARCHIVE_FOLDER_NOT_VISIBLE` | the service account cannot see the folder |
| `CAPTURE_MISMATCH` | typed time differs from the filename |
| `CAPTURE_BASIS` | `filename` basis on a file without a timestamped name |
| `DUPLICATE_UNDECLARED`, `DUPLICATE_NOT_IDENTICAL` | identical md5s not declared, or a declared copy that is not identical |
| `DECISION_UNKNOWN_ENTITY` | a decision about an ID that does not exist |

**Flags (recorded, no downgrade).**

| code | meaning |
|---|---|
| `DEGENERATE_INTERVAL` | a zero-width range; retained |
| `SEASON_BY_AGE` | a boundary-day season was resolved from the player's age elsewhere |
| `ADJUDICATED` | a `U` read was used |
| `DUPLICATE_EVIDENCE` | a later capture of an identical preview; zero weight |
| `OUT_OF_ARCHIVE_WINDOW` | capture outside S208–S209 |

---

## 7. Grades

| grade | meaning | use |
|---|---|---|
| **VERIFIED** | double-read or adjudicated, every check passes, season known, tier from a VERIFIED same-state card | archive evidence candidate |
| **PROVISIONAL** | nothing contradicted, something missing | context and timeline only |
| **QUARANTINED** | a check failed or a person quarantined it | nothing until re-read |
| **REJECTED** | a person rejected it with a rationale | nothing, kept for audit |
| **DUPLICATE** | its source is a byte copy | nothing |

A Reward or unread-badge preview can be VERIFIED as a record, but it is never an ordinary evidence candidate.

---

## 8. Repo ↔ Drive identity

- Each tab is canonicalised: schema column order; rows sorted by key; integers and decimals written in a
  canonical form; blank cells empty. The canonical form is then hashed with SHA-256. The manifest carries
  the per-tab hashes and a combined hash.
- Every collection run rebuilds the snapshot from the Drive export and compares it with
  `calibration/archive-s208-s209/snapshot/manifest.json`. The result is `IDENTICAL`, `DRIFT` (with row keys
  only in Drive, only in the repo, or changed) or `NO_REPO_SNAPSHOT`.
- Until the manifest says `"sealed": true`, drift is reported and the run continues. After sealing, drift
  **fails** the scheduled run. Correct it by committing the new snapshot through a PR, or by reverting the
  Drive edit.
- The PR check job runs `archive-validate.mjs --check-snapshot`. The committed CSVs must hash to their
  manifest, be canonical and pass validation, so a hand edit in the repository fails CI.
- Local check:
  `node tools/drive-data-exchange/archive-validate.mjs --xlsx export.xlsx --out-dir /tmp/arc`, or
  `--csv-dir` for a folder of CSVs.

---

## 9. Hand-off text for the transcribing assistant

> You are transcribing screenshots from the Drive folder "Archive Coaches" into the Archive_* tabs of the
> spreadsheet "Resource Coach Experiment Log — v1". Follow calibration/archive-s208-s209/PROTOCOL.md in the
> repository exactly.
>
> 1. Create the eight Archive_* tabs with the exact header rows in section 3.
> 2. Add one Archive_Sources row per file; take capture_local from the filename.
> 3. For each coach preview and player card, transcribe every field in section 4 as read A. Write only what
>    the screen displays. Where a highlight bar hides a text colour, write UNREAD. Leave a range blank when
>    the row has none. Never swap an inverted range, never compute a midpoint, never fill a tier or a class
>    from anything other than the screen.
> 4. Do not write in Experiments, Observed_Stats or Partition_History. Do not create any column that is not
>    in the header.
> 5. Do not assign grades, seasons or club levels; the repository validator computes them.
>
> For read B: in a new conversation, without opening read A, transcribe the same images as read B.

---

## 10. Still needed from the user

- Confirm the file count once the copies are deleted (73 against the 74 quoted).
- Any screen that shows the club level as a number, entered in `Archive_Club_State`. This is the direct test
  of `offset = 5 × (level − 1)`.
- Adjudication of every `READ_DISAGREE` from the image.
