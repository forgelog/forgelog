import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '../components/ScreenHeader';
import { getRoutineDetail } from '../db/repositories/routines';
import type { RoutineDetail, RoutineSet } from '../db/types';
import {
  effectiveTrackingType,
  formatSet,
  resolveRestSeconds,
  TRACKING_LABELS,
} from '../domain/setFields';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'RoutineDetail'>;

export function RoutineDetailScreen({ route, navigation }: Props) {
  const { routineId } = route.params;
  const c = useTheme();
  const [detail, setDetail] = useState<RoutineDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    getRoutineDetail(routineId)
      .then((routine) => {
        if (!current) return;
        setDetail(routine);
        setLoadError(routine ? null : 'Routine not found.');
      })
      .catch(() => {
        if (!current) return;
        setDetail(null);
        setLoadError('Could not load routine.');
      });
    return () => {
      current = false;
    };
  }, [routineId]);

  if (loadError || !detail) {
    return (
      <View style={[styles.container, { backgroundColor: c.bg }]}>
        <ScreenHeader title="Routine" leading="back" onLeadingPress={() => navigation.goBack()} />
        <Text style={[styles.empty, { color: c.sub }]}>{loadError ?? 'Loading routine...'}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <ScreenHeader title={detail.name} leading="back" onLeadingPress={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.name, { color: c.fg }]}>{detail.name}</Text>
        {detail.notes ? <Text style={[styles.notes, { color: c.sub }]}>{detail.notes}</Text> : null}
        <Text style={[styles.summary, { color: c.sub }]}>
          {detail.exercises.length} exercises
        </Text>

        {detail.exercises.length === 0 ? (
          <Text style={[styles.empty, { color: c.sub }]}>No exercises in this routine.</Text>
        ) : (
          detail.exercises.map((routineExercise) => {
            const trackingType = effectiveTrackingType(
              routineExercise.tracking_type,
              routineExercise.exercise.tracking_type
            );
            return (
              <View
                key={routineExercise.id}
                style={[styles.exercise, { borderTopColor: c.sep }]}
              >
                <View style={styles.exerciseHeader}>
                  <Text
                    style={[styles.exerciseName, { color: c.fg }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {routineExercise.exercise.name}
                  </Text>
                  <Text style={[styles.restText, { color: c.sub }]}>
                    {resolveRestSeconds(routineExercise.rest_seconds)}s rest
                  </Text>
                </View>
                <Text style={[styles.trackingText, { color: c.sub }]}>
                  {TRACKING_LABELS[trackingType]}
                </Text>
                {routineExercise.sets.length === 0 ? (
                  <Text style={[styles.emptySet, { color: c.sub }]}>No target sets</Text>
                ) : (
                  routineExercise.sets.map((set, index) => (
                    <View key={set.id} style={styles.setRow}>
                      <Text style={[styles.setIndex, { color: c.sub }]}>{index + 1}</Text>
                      <Text style={[styles.setText, { color: c.fg }]}>
                        {formatRoutineSet(trackingType, set)}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function formatRoutineSet(trackingType: string | null, set: RoutineSet): string {
  return formatSet(trackingType, {
    weight: set.target_weight,
    reps: set.target_reps,
    duration_seconds: set.target_duration_seconds,
    distance_meters: set.target_distance_meters,
  });
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  name: { fontSize: 24, fontWeight: '700' },
  notes: { marginTop: 8, fontSize: 14, lineHeight: 20 },
  summary: { marginTop: 6, marginBottom: 12, fontSize: 13 },
  empty: { padding: 16, textAlign: 'center', fontSize: 14 },
  exercise: { paddingVertical: 14, borderTopWidth: 1 },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  exerciseName: { flex: 1, minWidth: 0, fontSize: 16, fontWeight: '700' },
  restText: { fontSize: 12 },
  trackingText: { marginTop: 4, fontSize: 12 },
  emptySet: { marginTop: 8, fontSize: 13 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  setIndex: { width: 20, fontSize: 13 },
  setText: { flex: 1, fontSize: 15 },
});
