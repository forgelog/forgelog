import {
  BottomSheet,
  BottomSheetScrollView,
  BottomSheetView,
} from '@expo/ui/community/bottom-sheet';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ROUTINE_TEMPLATES, type RoutineTemplate } from '../domain/routineTemplates';
import { useTheme } from '../theme/ThemeContext';
import { Card } from './Card';
import { Icon } from './Icon';

export type StarterRoutineSheetState = {
  template: RoutineTemplate;
  closing?: boolean;
};

type StarterRoutineGridProps = Readonly<{
  onOpenActions: (template: RoutineTemplate) => void;
}>;

export function StarterRoutineGrid({ onOpenActions }: StarterRoutineGridProps) {
  const c = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const cardSize = Math.floor((width - 44) / 2);
  const cardHeight = Math.max(cardSize, Math.ceil(164 * fontScale));

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: c.fg }]}>Starter Routines</Text>
        <Text style={[styles.sectionSubtitle, { color: c.sub }]}>Customize and save</Text>
      </View>
      <View style={styles.grid}>
        {ROUTINE_TEMPLATES.map((template) => (
          <View
            key={template.id}
            testID={`starter-routine-card-${template.id}`}
            style={{ width: cardSize, height: cardHeight }}
          >
            <Card style={styles.card}>
              <Pressable
                accessibilityLabel={`Starter routine ${template.name}`}
                accessibilityHint={`${template.description} Opens routine actions.`}
                accessibilityRole="button"
                onPress={() => onOpenActions(template)}
                style={styles.cardPressable}
              >
                <View>
                  <Text
                    style={[styles.name, { color: c.fg }]}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    {template.name}
                  </Text>
                  <Text style={[styles.meta, { color: c.accent }]} numberOfLines={1}>
                    {template.exercises.length} exercises
                  </Text>
                </View>
                <View style={styles.exercisePreview}>
                  {template.exercises.slice(0, 2).map((exercise) => (
                    <Text
                      key={exercise.exerciseId}
                      style={[styles.previewExercise, { color: c.sub }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {exercise.exerciseName}
                    </Text>
                  ))}
                  {template.exercises.length > 2 ? (
                    <Text style={[styles.moreExercises, { color: c.sub }]} numberOfLines={1}>
                      +{template.exercises.length - 2} more
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            </Card>
          </View>
        ))}
      </View>
    </View>
  );
}

type StarterRoutineActionsSheetProps = Readonly<{
  state: StarterRoutineSheetState | null;
  onClose: () => void;
  onClosed: () => void;
  onCreate: (template: RoutineTemplate) => void;
}>;

export function StarterRoutineActionsSheet({
  state,
  onClose,
  onClosed,
  onCreate,
}: StarterRoutineActionsSheetProps) {
  const c = useTheme();
  if (!state) return null;

  const { template } = state;

  return (
    <BottomSheet
      index={state.closing ? -1 : 0}
      snapPoints={['55%', '85%']}
      enablePanDownToClose
      onClose={onClosed}
      backgroundStyle={{ backgroundColor: c.card }}
    >
      <BottomSheetView style={styles.sheet}>
        <BottomSheetScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetScrollContent}
          testID="starter-routine-sheet-scroll-view"
        >
          <SafeAreaView edges={['bottom']} style={styles.sheetSafeArea}>
            <View testID="starter-routine-actions-sheet">
              <View style={styles.sheetHeader}>
                <Text style={[styles.sheetTitle, { color: c.fg }]}>{template.name}</Text>
                <Text style={[styles.sheetDescription, { color: c.sub }]}>
                  {template.description}
                </Text>
              </View>
              <View style={[styles.exerciseList, { backgroundColor: c.fill }]}>
                {template.exercises.map((exercise, index) => (
                  <View key={exercise.exerciseId} style={styles.exerciseRow}>
                    <Text style={[styles.exerciseIndex, { color: c.sub }]}>{index + 1}</Text>
                    <Text style={[styles.exerciseName, { color: c.fg }]}>
                      {exercise.exerciseName}
                    </Text>
                    <Text style={[styles.setCount, { color: c.sub }]}>
                      {exercise.sets.length} sets
                    </Text>
                  </View>
                ))}
              </View>
              <Pressable
                style={[styles.createAction, { borderTopColor: c.sep }]}
                onPress={() => onCreate(template)}
                accessibilityLabel={`Create routine from ${template.name}`}
                accessibilityRole="button"
                testID="starter-routine-create"
              >
                <Icon name="plus-circle-outline" size={20} />
                <Text style={[styles.createActionText, { color: c.fg }]}>Create Routine</Text>
              </Pressable>
              <Pressable
                style={[styles.cancel, { backgroundColor: c.fill }]}
                onPress={onClose}
                accessibilityLabel="Cancel starter routine options"
                accessibilityRole="button"
              >
                <Text style={[styles.cancelText, { color: c.fg }]}>Cancel</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </BottomSheetScrollView>
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, paddingTop: 16 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  sectionSubtitle: { fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { flex: 1, padding: 0, overflow: 'hidden' },
  cardPressable: { flex: 1, padding: 14 },
  exercisePreview: { gap: 2, paddingTop: 16 },
  previewExercise: { fontSize: 12, lineHeight: 17 },
  moreExercises: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  name: { fontSize: 17, fontWeight: '700', lineHeight: 21 },
  meta: { paddingTop: 6, fontSize: 13, fontWeight: '700' },
  sheet: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  sheetScroll: { flex: 1 },
  sheetScrollContent: { flexGrow: 1 },
  sheetSafeArea: { gap: 4 },
  sheetHeader: { alignItems: 'center', gap: 6, paddingBottom: 14 },
  sheetTitle: { maxWidth: '100%', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  sheetDescription: { maxWidth: 360, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  exerciseList: {
    gap: 10,
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 14,
    marginBottom: 8,
  },
  exerciseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  exerciseIndex: { width: 16, fontSize: 13, fontVariant: ['tabular-nums'] },
  exerciseName: { flex: 1, fontSize: 14, fontWeight: '600' },
  setCount: { fontSize: 12, fontVariant: ['tabular-nums'] },
  createAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    borderTopWidth: 1,
  },
  createActionText: { fontSize: 16, fontWeight: '600' },
  cancel: {
    minHeight: 48,
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  cancelText: { fontSize: 16, fontWeight: '700' },
});
