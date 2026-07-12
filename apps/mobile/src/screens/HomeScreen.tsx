import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomSheet, BottomSheetView } from '@expo/ui/community/bottom-sheet';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { PillButton } from '../components/PillButton';
import { deleteRoutine, listRoutineSummaries, RoutineSummary } from '../db/repositories/routines';
import { getActiveWorkout } from '../db/repositories/workouts';
import { discardWorkout, startOrResumeWorkout } from '../application/activeWorkout';
import type { Workout } from '../db/types';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme/ThemeContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type RoutineSheetState = {
  routine: RoutineSummary;
  mode: 'actions' | 'delete';
  deleting?: boolean;
  error?: string;
  closing?: boolean;
};

export function HomeScreen() {
  const c = useTheme();
  const navigation = useNavigation<Nav>();
  const [active, setActive] = useState<Workout | null>(null);
  const [routines, setRoutines] = useState<RoutineSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [routineSheet, setRoutineSheet] = useState<RoutineSheetState | null>(null);

  const reload = useCallback(() => {
    let current = true;
    setLoading(true);
    setLoadFailed(false);
    Promise.all([getActiveWorkout(), listRoutineSummaries()])
      .then(([activeWorkout, routineRows]) => {
        if (!current) return;
        setActive(activeWorkout);
        setRoutines(routineRows);
      })
      .catch(() => {
        if (!current) return;
        setActive(null);
        setRoutines([]);
        setLoadFailed(true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, []);

  useFocusEffect(reload);

  async function handleStartEmpty() {
    try {
      const { workout } = await startOrResumeWorkout();
      navigation.navigate('ActiveWorkout', { workoutId: workout.id });
    } catch {
      Alert.alert('Error', 'Could not start workout.');
    }
  }

  async function handleStartRoutine(routine: RoutineSummary) {
    let workout: Workout;
    let resumed: boolean;
    try {
      ({ workout, resumed } = await startOrResumeWorkout(routine.id));
    } catch {
      Alert.alert('Error', 'Could not start workout.');
      return;
    }
    if (resumed) {
      Alert.alert(
        'Workout in progress',
        'You have an active workout. Resume it or discard it to start this routine.',
        [
          { text: 'Resume', onPress: () => navigation.navigate('ActiveWorkout', { workoutId: workout.id }) },
          {
            text: 'Discard & start',
            style: 'destructive',
            onPress: async () => {
              try {
                await discardWorkout(workout.id);
                const fresh = await startOrResumeWorkout(routine.id);
                navigation.navigate('ActiveWorkout', { workoutId: fresh.workout.id });
              } catch {
                Alert.alert('Error', 'Could not discard the current workout.');
              }
            },
          },
        ]
      );
      return;
    }
    navigation.navigate('ActiveWorkout', { workoutId: workout.id });
  }

  function handleCreateRoutine() {
    navigation.navigate('RoutineEditor', {});
  }

  function showRoutineActions(routine: RoutineSummary) {
    setRoutineSheet({ routine, mode: 'actions' });
  }

  const closeRoutineSheet = useCallback(() => {
    setRoutineSheet((current) => {
      if (!current || current.deleting || current.closing) return current;
      return { ...current, closing: true };
    });
  }, []);

  const handleRoutineSheetClosed = useCallback(() => {
    setRoutineSheet(null);
  }, []);

  function handleEditRoutine(routine: RoutineSummary) {
    setRoutineSheet(null);
    navigation.navigate('RoutineEditor', { routineId: routine.id });
  }

  function prepareDeleteRoutine(routine: RoutineSummary) {
    setRoutineSheet({ routine, mode: 'delete' });
  }

  async function handleDeleteRoutine(routine: RoutineSummary) {
    setRoutineSheet({ routine, mode: 'delete', deleting: true });
    try {
      await deleteRoutine(routine.id);
      setRoutineSheet((current) => (current ? { ...current, deleting: false, closing: true } : null));
      reload();
    } catch {
      setRoutineSheet({
        routine,
        mode: 'delete',
        error: 'Could not delete this routine.',
      });
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.bg }]}>
      <FlatList
        data={routines}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <Text style={[styles.title, { color: c.fg }]}>Workout</Text>
            <PillButton
              label={active ? 'Resume Workout' : 'Start Empty Workout'}
              onPress={handleStartEmpty}
              variant="filled"
              style={styles.startButton}
            />
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: c.fg }]}>My Routines</Text>
              <Pressable
                style={[styles.addButton, { backgroundColor: c.accent }]}
                onPress={handleCreateRoutine}
                accessibilityLabel="Create routine"
                accessibilityRole="button"
                testID="create-routine"
              >
                <Icon name="plus" color="#fff" size={20} />
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={<HomeEmptyState loading={loading} loadFailed={loadFailed} />}
        renderItem={({ item }) => (
          <Card style={styles.routineCard}>
            <Pressable
              style={styles.routineTouchable}
              onPress={() => navigation.navigate('RoutineDetail', { routineId: item.id })}
              onLongPress={() => showRoutineActions(item)}
              accessibilityLabel={`View routine ${item.name}`}
              accessibilityRole="button"
            >
              <View style={styles.routineText}>
                <Text
                  style={[styles.routineName, { color: c.fg }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {item.name}
                </Text>
                <Text style={[styles.routineMeta, { color: c.sub }]}>
                  {item.exerciseCount} exercises
                  {item.muscles.length ? ` · ${item.muscles.join(', ')}` : ''}
                </Text>
              </View>
              <PillButton
                label="Start"
                onPress={() => handleStartRoutine(item)}
                variant="filled"
                accessibilityLabel={`Start routine ${item.name}`}
              />
              <Pressable
                hitSlop={8}
                onPress={() => showRoutineActions(item)}
                accessibilityLabel={`Routine options ${item.name}`}
                accessibilityRole="button"
              >
                <Icon name="dots-vertical" variant="sub" size={20} />
              </Pressable>
            </Pressable>
          </Card>
        )}
      />
      <RoutineActionsSheet
        state={routineSheet}
        onClose={closeRoutineSheet}
        onEdit={handleEditRoutine}
        onPrepareDelete={prepareDeleteRoutine}
        onDelete={handleDeleteRoutine}
        onClosed={handleRoutineSheetClosed}
      />
    </SafeAreaView>
  );
}

type HomeEmptyStateProps = Readonly<{
  loading: boolean;
  loadFailed: boolean;
}>;

function HomeEmptyState({ loading, loadFailed }: HomeEmptyStateProps) {
  const c = useTheme();
  let message = 'No routines yet. Create one above.';
  if (loading) {
    message = 'Loading routines...';
  } else if (loadFailed) {
    message = 'Could not load routines.';
  }
  return <Text style={[styles.empty, { color: c.sub }]}>{message}</Text>;
}

type RoutineActionsSheetProps = Readonly<{
  state: RoutineSheetState | null;
  onClose: () => void;
  onEdit: (routine: RoutineSummary) => void;
  onPrepareDelete: (routine: RoutineSummary) => void;
  onDelete: (routine: RoutineSummary) => void;
  onClosed: () => void;
}>;

function RoutineActionsSheet({
  state,
  onClose,
  onEdit,
  onPrepareDelete,
  onDelete,
  onClosed,
}: RoutineActionsSheetProps) {
  const c = useTheme();

  if (!state) return null;

  const { routine, mode, deleting, error } = state;

  return (
    <BottomSheet
      index={state.closing ? -1 : 0}
      enableDynamicSizing
      enablePanDownToClose={!deleting}
      onClose={onClosed}
      backgroundStyle={{ backgroundColor: c.card }}
    >
      <BottomSheetView style={styles.sheet}>
        <SafeAreaView edges={['bottom']} style={styles.sheetSafeArea}>
          <View testID="routine-actions-sheet">
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: c.fg }]} numberOfLines={1}>
                {routine.name}
              </Text>
            </View>
            {mode === 'actions' ? (
              <>
                <RoutineSheetAction
                  label="Edit Routine"
                  icon="pencil-outline"
                  onPress={() => onEdit(routine)}
                  testID="routine-action-edit"
                />
                <RoutineSheetAction
                  label="Delete Routine"
                  icon="trash-can-outline"
                  onPress={() => onPrepareDelete(routine)}
                  destructive
                  testID="routine-action-delete"
                />
                <Pressable
                  style={[styles.sheetCancel, { backgroundColor: c.fill }]}
                  onPress={onClose}
                  accessibilityLabel="Cancel routine options"
                  accessibilityRole="button"
                >
                  <Text style={[styles.sheetCancelText, { color: c.fg }]}>Cancel</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[styles.deleteTitle, { color: c.fg }]}>Delete this routine?</Text>
                <Text style={[styles.deleteMessage, { color: c.sub }]}>This cannot be undone.</Text>
                {error ? <Text style={[styles.sheetError, { color: c.danger }]}>{error}</Text> : null}
                <View style={styles.deleteActions}>
                  <Pressable
                    style={[styles.deleteButton, { backgroundColor: c.fill }]}
                    onPress={onClose}
                    disabled={deleting}
                    accessibilityLabel="Cancel delete routine"
                    accessibilityRole="button"
                  >
                    <Text style={[styles.deleteButtonText, { color: c.fg }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.deleteButton,
                      { backgroundColor: c.danger, opacity: deleting ? 0.6 : 1 },
                    ]}
                    onPress={() => onDelete(routine)}
                    disabled={deleting}
                    accessibilityLabel="Confirm delete routine"
                    accessibilityRole="button"
                    testID="routine-delete-confirm"
                  >
                    <Text style={[styles.deleteButtonText, { color: '#fff' }]}>
                      {deleting ? 'Deleting...' : 'Delete'}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </SafeAreaView>
      </BottomSheetView>
    </BottomSheet>
  );
}

type RoutineSheetActionProps = Readonly<{
  label: string;
  icon: React.ComponentProps<typeof Icon>['name'];
  onPress: () => void;
  destructive?: boolean;
  testID: string;
}>;

function RoutineSheetAction({
  label,
  icon,
  onPress,
  destructive,
  testID,
}: RoutineSheetActionProps) {
  const c = useTheme();
  const color = destructive ? c.danger : c.fg;
  return (
    <Pressable
      style={[styles.sheetAction, { borderTopColor: c.sep }]}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      testID={testID}
    >
      <Icon name={icon} color={color} size={20} />
      <Text style={[styles.sheetActionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  startButton: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  addButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: 24 },
  routineCard: { marginBottom: 0 },
  routineTouchable: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  routineText: { flex: 1, minWidth: 0 },
  routineName: { fontSize: 16, fontWeight: '700' },
  routineMeta: { marginTop: 4, fontSize: 13 },
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sheetSafeArea: {
    gap: 4,
  },
  sheetHeader: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 8,
  },
  sheetTitle: { maxWidth: '100%', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  sheetAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    borderTopWidth: 1,
  },
  sheetActionText: { fontSize: 16, fontWeight: '600' },
  sheetCancel: {
    minHeight: 48,
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  sheetCancelText: { fontSize: 16, fontWeight: '700' },
  deleteTitle: { fontSize: 18, fontWeight: '700' },
  deleteMessage: { fontSize: 14, lineHeight: 20 },
  sheetError: { fontSize: 13, fontWeight: '600' },
  deleteActions: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 8 },
  deleteButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: { fontSize: 16, fontWeight: '700' },
});
