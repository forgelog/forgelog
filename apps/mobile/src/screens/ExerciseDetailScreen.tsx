import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '../components/ScreenHeader';
import { getExercise } from '../db/repositories/exercises';
import { ExerciseSession, getSessionsForExercise } from '../db/repositories/workouts';
import type { Exercise } from '../db/types';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme/ThemeContext';
import { formatSet } from '../domain/setFields';

type Props = NativeStackScreenProps<RootStackParamList, 'ExerciseDetail'>;

type Tab = 'about' | 'history';

export function ExerciseDetailScreen({ route, navigation }: Props) {
  const { exerciseId } = route.params;
  const c = useTheme();
  const [tab, setTab] = useState<Tab>('about');
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [sessions, setSessions] = useState<ExerciseSession[]>([]);
  const [sessionsExerciseId, setSessionsExerciseId] = useState<string | null>(null);
  const [loadedExerciseId, setLoadedExerciseId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [historyLoadFailed, setHistoryLoadFailed] = useState(false);

  useEffect(() => {
    let current = true;
    getExercise(exerciseId)
      .then((exerciseRow) => {
        if (!current) return;
        setExercise(exerciseRow);
        setLoadError(exerciseRow ? null : 'Exercise not found.');
        setLoadedExerciseId(exerciseId);
      })
      .catch(() => {
        if (!current) return;
        setExercise(null);
        setLoadError('Could not load exercise.');
        setLoadedExerciseId(exerciseId);
      });
    getSessionsForExercise(exerciseId)
      .then((sessionRows) => {
        if (!current) return;
        setSessions(sessionRows);
        setSessionsExerciseId(exerciseId);
        setHistoryLoadFailed(false);
      })
      .catch(() => {
        if (!current) return;
        setSessions([]);
        setSessionsExerciseId(exerciseId);
        setHistoryLoadFailed(true);
      });
    return () => {
      current = false;
    };
  }, [exerciseId]);

  if (loadedExerciseId !== exerciseId) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: c.bg }]}>
        <Text style={[styles.empty, { color: c.sub }]}>Loading exercise...</Text>
      </View>
    );
  }

  if (loadError || !exercise) {
    return (
      <View style={[styles.container, { backgroundColor: c.bg }]}>
        <ScreenHeader title="Exercise" leading="back" onLeadingPress={() => navigation.goBack()} />
        <Text style={[styles.empty, { color: c.sub }]}>{loadError ?? 'Exercise not found.'}</Text>
      </View>
    );
  }

  const visibleSessions = sessionsExerciseId === exerciseId ? sessions : [];
  const visibleHistoryLoadFailed = sessionsExerciseId === exerciseId && historyLoadFailed;

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <ScreenHeader title={exercise.name} leading="back" onLeadingPress={() => navigation.goBack()} />
      <View style={[styles.tabs, { borderBottomColor: c.sep }]}>
        <TabButton label="About" active={tab === 'about'} onPress={() => setTab('about')} />
        <TabButton label="History" active={tab === 'history'} onPress={() => setTab('history')} />
      </View>
      {tab === 'about' ? (
        <AboutTab exercise={exercise} />
      ) : (
        <HistoryTab sessions={visibleSessions} loadFailed={visibleHistoryLoadFailed} />
      )}
    </View>
  );
}

type TabButtonProps = Readonly<{
  label: string;
  active: boolean;
  onPress: () => void;
}>;

function TabButton({
  label,
  active,
  onPress,
}: TabButtonProps) {
  const c = useTheme();
  return (
    <Pressable
      style={styles.tab}
      onPress={onPress}
      accessibilityLabel={`${label} tab`}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.tabLabel, { color: active ? c.accent : c.sub }]}>{label}</Text>
      {active ? <View style={[styles.tabUnderline, { backgroundColor: c.accent }]} /> : null}
    </Pressable>
  );
}

type AboutTabProps = Readonly<{
  exercise: Exercise;
}>;

function AboutTab({ exercise }: AboutTabProps) {
  const c = useTheme();
  const instructionItems = exercise.instructions.map((step, index, instructions) => {
    const occurrence = instructions.slice(0, index + 1).filter((candidate) => candidate === step).length;
    return { step, key: `${step}-${occurrence}` };
  });

  return (
    <ScrollView>
      {exercise.images.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow}>
          {exercise.images.map((uri) => (
            <Image key={uri} source={{ uri }} style={[styles.image, { backgroundColor: c.fill }]} />
          ))}
        </ScrollView>
      ) : null}

      <Text style={[styles.name, { color: c.fg }]}>{exercise.name}</Text>

      <Text style={[styles.sectionTitle, { color: c.sub }]}>MUSCLES WORKED</Text>
      <View style={styles.infoRow}>
        <Text style={[styles.infoLabel, { color: c.sub }]}>Primary</Text>
        <Text style={[styles.infoValue, { color: c.fg }]}>{exercise.muscle_group}</Text>
      </View>
      {exercise.secondary_muscles.length > 0 ? (
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: c.sub }]}>Secondary</Text>
          <Text style={[styles.infoValue, { color: c.fg }]}>
            {exercise.secondary_muscles.join(', ')}
          </Text>
        </View>
      ) : null}
      <View style={styles.infoRow}>
        <Text style={[styles.infoLabel, { color: c.sub }]}>Equipment</Text>
        <Text style={[styles.infoValue, { color: c.fg }]}>{exercise.equipment}</Text>
      </View>

      {exercise.instructions.length > 0 ? (
        <>
          <Text style={[styles.sectionTitle, { color: c.sub }]}>INSTRUCTIONS</Text>
          {instructionItems.map(({ step, key }, i) => (
            <View key={key} style={styles.step}>
              <View style={[styles.stepIndex, { backgroundColor: c.asoft }]}>
                <Text style={[styles.stepIndexText, { color: c.accent }]}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: c.fg }]}>{step}</Text>
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

type HistoryTabProps = Readonly<{
  sessions: ExerciseSession[];
  loadFailed: boolean;
}>;

function HistoryTab({
  sessions,
  loadFailed,
}: HistoryTabProps) {
  const c = useTheme();

  if (loadFailed) {
    return <Text style={[styles.empty, { color: c.sub }]}>Could not load exercise history.</Text>;
  }

  if (sessions.length === 0) {
    return <Text style={[styles.empty, { color: c.sub }]}>No sessions logged yet.</Text>;
  }

  return (
    <ScrollView>
      {sessions.map((session, i) => {
        const recordSetIds = new Set(
          session.recordEvents.flatMap((event) => (event.logged_set_id ? [event.logged_set_id] : []))
        );
        return (
          <View
            key={session.workoutId}
            style={[styles.session, i > 0 && { borderTopColor: c.sep, borderTopWidth: 1 }]}
          >
            <Text style={[styles.sessionName, { color: c.fg }]}>{session.workoutName}</Text>
            <Text style={[styles.sessionDate, { color: c.accent }]}>{formatDate(session.startedAt)}</Text>
            {session.sets.map((set, setIndex) => (
              <View key={set.id} style={styles.setRow}>
                <Text style={[styles.setIndex, { color: c.sub }]}>{setIndex + 1}</Text>
                <Text style={[styles.setText, { color: c.fg }]}>
                  {formatSet(session.exerciseType, set)}
                </Text>
                {recordSetIds.has(set.id) ? (
                  <View style={[styles.prBadge, { backgroundColor: c.asoft }]}>
                    <Text style={[styles.prBadgeText, { color: c.accent }]}>PR</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabLabel: { fontSize: 15, fontWeight: '700' },
  tabUnderline: { position: 'absolute', bottom: -1, left: 0, right: 0, height: 2 },
  imageRow: { padding: 16 },
  image: { width: 160, height: 160, borderRadius: 12, marginRight: 12 },
  name: { fontSize: 22, fontWeight: '800', paddingHorizontal: 16, marginTop: 8 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 4 },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, fontWeight: '700', textTransform: 'capitalize' },
  step: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginBottom: 14 },
  stepIndex: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepIndexText: { fontSize: 13, fontWeight: '700' },
  stepText: { flex: 1, fontSize: 15, lineHeight: 21 },
  empty: { textAlign: 'center', marginTop: 24, paddingHorizontal: 16 },
  session: { padding: 16 },
  sessionName: { fontSize: 16, fontWeight: '700' },
  sessionDate: { fontSize: 13, fontWeight: '600', marginTop: 2, marginBottom: 8 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  setIndex: { width: 20, fontSize: 13 },
  setText: { fontSize: 15, flex: 1 },
  prBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  prBadgeText: { fontSize: 12, fontWeight: '700' },
});
