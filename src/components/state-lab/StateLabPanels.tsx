import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { stateLabVisual as v } from '../../constants/stateLabVisual';
import type {
  StateLabActionStepView,
  StateLabProjectionSummary,
  StateLabReferenceTile,
} from './types';

export function StateLabCard({
  children,
  header,
  headerTone = 'indigo',
}: {
  children: ReactNode;
  header?: ReactNode;
  headerTone?: 'indigo' | 'teal';
}) {
  return (
    <View style={styles.card}>
      {header ? (
        <View style={[
          styles.cardHeader,
          { backgroundColor: headerTone === 'teal' ? v.panel.resultHeader : v.panel.header },
        ]}>
          {header}
        </View>
      ) : null}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

export function SectionTitle({
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {actionLabel ? (
        <Pressable onPress={onAction} disabled={!onAction} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function PathStepRow({
  step,
  onPress,
}: {
  step: StateLabActionStepView;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.pathRow}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{step.order}</Text>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.pathTitle}>{step.title}</Text>
        {step.subtitle ? <Text style={styles.pathSubtitle}>{step.subtitle}</Text> : null}
      </View>

      <View style={[
        styles.reversibilityPill,
        step.gameReversible ? styles.reversiblePill : styles.irreversiblePill,
      ]}>
        <Text style={[
          styles.reversibilityText,
          { color: step.gameReversible ? v.semantic.success : v.semantic.danger },
        ]}>
          {step.gameReversible ? 'REVERSIBLE' : 'IRREVERSIBLE'}
        </Text>
      </View>
    </Pressable>
  );
}

export function ProjectionSummaryPanel({
  summary,
}: {
  summary: StateLabProjectionSummary;
}) {
  const ovrDelta = summary.projectedOvr - summary.currentOvr;
  const whiteDelta = summary.projectedWhiteCount - summary.currentWhiteCount;

  return (
    <View style={styles.projectionGrid}>
      <View style={styles.metricTile}>
        <Text style={styles.metricLabel}>PROJECTED OVR</Text>
        <Text style={styles.metricValue}>{summary.projectedOvr.toFixed(1)}</Text>
        <Text style={styles.metricDelta}>
          {ovrDelta >= 0 ? '+' : ''}{ovrDelta.toFixed(1)}
        </Text>
      </View>

      <View style={styles.metricTile}>
        <Text style={styles.metricLabel}>WHITE STAT COUNT</Text>
        <Text style={styles.metricCompact}>
          {summary.currentWhiteCount} → {summary.projectedWhiteCount}
        </Text>
        <Text style={styles.metricDelta}>
          {whiteDelta >= 0 ? '+' : ''}{whiteDelta} white
        </Text>
      </View>

      <View style={styles.statList}>
        <Text style={styles.metricLabel}>KEY PROJECTED CHANGES</Text>
        {summary.statChanges.slice(0, 6).map(change => (
          <View key={change.stat} style={styles.statRow}>
            <Text style={styles.statName}>{change.stat}</Text>
            <Text style={styles.statNumbers}>
              {change.before.toFixed(0)} → {change.after.toFixed(0)}
            </Text>
            <Text style={styles.statGain}>
              +{(change.after - change.before).toFixed(0)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function ReferenceTile({ item }: { item: StateLabReferenceTile }) {
  const tone = referenceTone(item.tone);
  return (
    <View style={[styles.referenceTile, { backgroundColor: tone.background, borderColor: tone.border }]}>
      <Text style={[styles.referenceTitle, { color: tone.ink }]}>{item.title}</Text>
      <Text style={styles.referenceBody}>{item.body}</Text>
      <Text style={styles.referenceEvidence}>{item.evidence.toUpperCase()}</Text>
    </View>
  );
}

export function StickyPlanBar({
  label = 'SAVE PLAN',
  disabled = false,
  onPress,
}: {
  label?: string;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={[styles.saveBar, disabled ? { opacity: 0.45 } : null]}
    >
      <Text style={styles.saveBarText}>{label}</Text>
    </Pressable>
  );
}

function referenceTone(tone: StateLabReferenceTile['tone']) {
  switch (tone) {
    case 'success':
      return { background: '#DDF7E5', border: '#9AD8AA', ink: '#146A30' };
    case 'info':
      return { background: '#DDEBFF', border: '#9DBEF2', ink: '#2455A4' };
    case 'purple':
      return { background: '#EEE2FF', border: '#C6A3F3', ink: '#6634A6' };
    case 'warning':
      return { background: '#FFF0D6', border: '#F3C981', ink: '#915B00' };
    default:
      return { background: '#EEF2F8', border: '#CBD5E1', ink: v.ink.secondary };
  }
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: v.panel.borderStrong,
    borderRadius: v.radius.md,
    overflow: 'hidden',
    backgroundColor: v.panel.surface,
  },
  cardHeader: {
    paddingHorizontal: v.spacing.md,
    paddingVertical: v.spacing.sm,
  },
  cardBody: {
    padding: v.spacing.md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: v.spacing.sm,
  },
  sectionTitle: {
    color: v.ink.inverse,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  sectionSubtitle: {
    color: '#D8DEFF',
    fontSize: 12,
    marginTop: 2,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#7388E7',
    backgroundColor: '#4155BE',
    borderRadius: v.radius.sm,
    paddingHorizontal: v.spacing.sm,
    paddingVertical: v.spacing.xs,
  },
  secondaryButtonText: {
    color: v.ink.inverse,
    fontSize: 11,
    fontWeight: '800',
  },
  pathRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: v.spacing.sm,
    borderWidth: 1,
    borderColor: v.panel.border,
    backgroundColor: '#FFFFFF',
    borderRadius: v.radius.sm,
    padding: v.spacing.sm,
    marginBottom: v.spacing.xs,
  },
  stepNumber: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: v.semantic.success,
  },
  stepNumberText: {
    color: v.ink.inverse,
    fontWeight: '900',
    fontSize: 16,
  },
  pathTitle: {
    color: v.ink.primary,
    fontSize: 15,
    fontWeight: '800',
  },
  pathSubtitle: {
    color: v.ink.secondary,
    fontSize: 12,
    marginTop: 2,
  },
  reversibilityPill: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  reversiblePill: {
    backgroundColor: v.semantic.successSoft,
  },
  irreversiblePill: {
    backgroundColor: v.semantic.dangerSoft,
  },
  reversibilityText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  projectionGrid: {
    gap: v.spacing.sm,
  },
  metricTile: {
    borderWidth: 1,
    borderColor: v.panel.border,
    borderRadius: v.radius.sm,
    backgroundColor: '#FFFFFF',
    padding: v.spacing.md,
  },
  metricLabel: {
    color: '#33517A',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  metricValue: {
    color: v.semantic.success,
    fontSize: 44,
    lineHeight: 48,
    fontWeight: '900',
    marginTop: 4,
  },
  metricCompact: {
    color: v.ink.primary,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    marginTop: 8,
  },
  metricDelta: {
    color: v.semantic.success,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
  },
  statList: {
    borderWidth: 1,
    borderColor: v.panel.border,
    borderRadius: v.radius.sm,
    backgroundColor: '#E7F8EA',
    padding: v.spacing.sm,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#CDEBD3',
    paddingVertical: 6,
  },
  statName: {
    flex: 1,
    color: v.ink.primary,
    fontSize: 12,
  },
  statNumbers: {
    color: v.ink.secondary,
    fontSize: 12,
  },
  statGain: {
    width: 48,
    textAlign: 'right',
    color: v.semantic.success,
    fontSize: 12,
    fontWeight: '800',
  },
  referenceTile: {
    flex: 1,
    minWidth: 132,
    borderWidth: 1,
    borderRadius: v.radius.sm,
    padding: v.spacing.sm,
  },
  referenceTitle: {
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  referenceBody: {
    color: v.ink.secondary,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 4,
  },
  referenceEvidence: {
    color: v.ink.quiet,
    fontSize: 8,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 7,
    letterSpacing: 0.6,
  },
  saveBar: {
    minHeight: 56,
    borderRadius: v.radius.sm,
    backgroundColor: '#2AC83E',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: v.spacing.lg,
  },
  saveBarText: {
    color: v.ink.inverse,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
});
