import { BottomSheet, BottomSheetView } from '@expo/ui/community/bottom-sheet';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { WorkoutFinishAction, WorkoutFinishPlan } from '../application/activeWorkout';
import { useTheme } from '../theme/ThemeContext';
import { NAME_MAX_LENGTH } from '../validation/textInput';
import { PillButton } from './PillButton';

export type FinishWorkoutSheetState = {
  plan: WorkoutFinishPlan;
  routineName: string;
  saving?: boolean;
  closing?: boolean;
  error?: string;
};

type Props = Readonly<{
  state: FinishWorkoutSheetState | null;
  onClose: () => void;
  onClosed: () => void;
  onNameChange: (name: string) => void;
  onFinish: (action: WorkoutFinishAction) => void;
}>;

export function FinishWorkoutSheet({ state, onClose, onClosed, onNameChange, onFinish }: Props) {
  const c = useTheme();
  if (!state) return null;

  const { plan, routineName, saving, error } = state;

  return (
    <BottomSheet
      index={state.closing ? -1 : 0}
      enableDynamicSizing
      enablePanDownToClose={!saving}
      onClose={onClosed}
      backgroundStyle={{ backgroundColor: c.card }}
    >
      <BottomSheetView style={styles.sheet}>
        <SafeAreaView edges={['bottom']} style={styles.safeArea}>
          <View testID="finish-workout-sheet">
            <Text style={[styles.title, { color: c.fg }]}>Finish workout?</Text>
            <FinishPlanContent
              plan={plan}
              routineName={routineName}
              saving={saving}
              onNameChange={onNameChange}
              onFinish={onFinish}
            />
            {error ? <Text style={[styles.error, { color: c.danger }]}>{error}</Text> : null}
            <Pressable
              style={styles.cancel}
              onPress={onClose}
              disabled={saving}
              accessibilityLabel="Cancel finishing workout"
              accessibilityRole="button"
            >
              <Text style={[styles.cancelText, { color: c.sub }]}>Cancel</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </BottomSheetView>
    </BottomSheet>
  );
}

type FinishPlanContentProps = Readonly<{
  plan: WorkoutFinishPlan;
  routineName: string;
  saving?: boolean;
  onNameChange: (name: string) => void;
  onFinish: (action: WorkoutFinishAction) => void;
}>;

function FinishPlanContent(props: FinishPlanContentProps) {
  switch (props.plan.kind) {
    case 'freestyle':
      return <FreestyleFinishContent {...props} />;
    case 'routine-changed':
      return <ChangedRoutineFinishContent {...props} />;
    case 'routine-unchanged':
    case 'routine-update-unavailable':
      return <RoutineFinishContent {...props} />;
  }
}

function FreestyleFinishContent({
  routineName,
  saving,
  onNameChange,
  onFinish,
}: FinishPlanContentProps) {
  const c = useTheme();
  const canSaveRoutine = routineName.trim().length > 0;

  return (
    <>
      <Text style={[styles.message, { color: c.sub }]}>
        Save this workout structure as a reusable routine. Logged values won’t become targets.
      </Text>
      <TextInput
        style={[styles.nameInput, { color: c.fg, backgroundColor: c.fill, borderColor: c.chipbd }]}
        value={routineName}
        onChangeText={onNameChange}
        placeholder="Routine name"
        placeholderTextColor={c.sub}
        maxLength={NAME_MAX_LENGTH}
        editable={!saving}
        accessibilityLabel="New routine name"
        testID="finish-routine-name"
      />
      <PillButton
        label={saving ? 'Saving...' : 'Save as routine & finish'}
        onPress={() => onFinish({ kind: 'create-routine', name: routineName })}
        disabled={saving || !canSaveRoutine}
        testID="finish-save-routine"
        style={styles.primaryAction}
      />
      <PillButton
        label="Finish without saving"
        onPress={() => onFinish({ kind: 'finish-only' })}
        variant="outlined"
        disabled={saving}
        testID="finish-without-routine"
        style={styles.secondaryAction}
      />
    </>
  );
}

function ChangedRoutineFinishContent({ plan, saving, onFinish }: FinishPlanContentProps) {
  const c = useTheme();
  if (plan.kind !== 'routine-changed') return null;

  return (
    <>
      <Text style={[styles.message, { color: c.sub }]}>
        Update {plan.routineName} with these structural changes? Targets and notes will stay
        unchanged.
      </Text>
      <View style={[styles.changeList, { backgroundColor: c.fill }]}>
        {plan.changes.map((change) => (
          <View key={change.kind} style={styles.changeRow}>
            <View style={[styles.changeDot, { backgroundColor: c.accent }]} />
            <Text style={[styles.changeText, { color: c.fg }]}>{change.label}</Text>
          </View>
        ))}
      </View>
      <PillButton
        label={saving ? 'Updating...' : 'Update routine & finish'}
        onPress={() => onFinish({ kind: 'update-routine' })}
        disabled={saving}
        testID="finish-update-routine"
        style={styles.primaryAction}
      />
      <PillButton
        label="Keep routine unchanged"
        onPress={() => onFinish({ kind: 'finish-only' })}
        variant="outlined"
        disabled={saving}
        testID="finish-without-routine"
        style={styles.secondaryAction}
      />
    </>
  );
}

function RoutineFinishContent({ plan, saving, onFinish }: FinishPlanContentProps) {
  const c = useTheme();
  if (plan.kind !== 'routine-unchanged' && plan.kind !== 'routine-update-unavailable') return null;
  const message =
    plan.kind === 'routine-update-unavailable'
      ? `${plan.routineName} can’t be updated from this older workout. Finishing won’t change the routine.`
      : `No structural changes were made to ${plan.routineName}.`;

  return (
    <>
      <Text style={[styles.message, { color: c.sub }]}>{message}</Text>
      <PillButton
        label={saving ? 'Finishing...' : 'Finish workout'}
        onPress={() => onFinish({ kind: 'finish-only' })}
        disabled={saving}
        testID="finish-without-routine"
        style={styles.primaryAction}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 20, paddingTop: 12 },
  safeArea: { paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  nameInput: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    fontSize: 16,
    marginTop: 16,
  },
  changeList: {
    gap: 10,
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 14,
    marginTop: 16,
  },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  changeDot: { width: 7, height: 7, borderRadius: 4 },
  changeText: { flex: 1, fontSize: 14, lineHeight: 19 },
  primaryAction: { marginTop: 16 },
  secondaryAction: { marginTop: 10 },
  error: { fontSize: 13, lineHeight: 18, textAlign: 'center', paddingTop: 10 },
  cancel: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  cancelText: { fontSize: 15, fontWeight: '600' },
});
