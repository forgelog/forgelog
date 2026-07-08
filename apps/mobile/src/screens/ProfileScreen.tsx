import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { ExerciseRecordRow, listAllRecords } from '../db/repositories/personalRecords';
import { getProfileStats, ProfileStats } from '../db/repositories/workouts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme/ThemeContext';

const RECORD_LABELS: Record<string, string> = {
  max_weight: 'Max weight',
  max_reps: 'Max reps',
  max_volume: 'Max volume',
  est_1rm: 'Est. 1RM',
};

type ExerciseGroup = { exerciseId: string; name: string; records: ExerciseRecordRow[] };

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ProfileScreen() {
  const c = useTheme();
  const navigation = useNavigation<Nav>();
  const [groups, setGroups] = useState<ExerciseGroup[]>([]);
  const [stats, setStats] = useState<ProfileStats>({ workoutCount: 0, totalVolume: 0, streakDays: 0 });

  useFocusEffect(
    useCallback(() => {
      listAllRecords().then((rows) => setGroups(groupByExercise(rows)));
      getProfileStats().then(setStats);
    }, [])
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.bg }]}>
      <ScrollView>
        <View style={styles.header}>
          <View style={[styles.avatar, { backgroundColor: c.asoft }]}>
            <Text style={[styles.avatarText, { color: c.accent }]}>AR</Text>
          </View>
          <View style={styles.identity}>
            <Text style={[styles.name, { color: c.fg }]}>Alex Rivera</Text>
            <Text style={[styles.since, { color: c.sub }]}>Member since 2026</Text>
          </View>
          <Icon name="pencil" variant="sub" size={20} />
        </View>

        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={[styles.statValue, { color: c.fg }]}>{stats.workoutCount}</Text>
            <Text style={[styles.statLabel, { color: c.sub }]}>Workouts</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={[styles.statValue, { color: c.fg }]}>{round(stats.totalVolume)}</Text>
            <Text style={[styles.statLabel, { color: c.sub }]}>Volume kg</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={[styles.statValue, { color: c.accent }]}>{stats.streakDays}</Text>
            <Text style={[styles.statLabel, { color: c.sub }]}>Streak days</Text>
          </Card>
        </View>

        <Text style={[styles.sectionTitle, { color: c.fg }]}>Personal Records</Text>
        {groups.length === 0 ? (
          <Text style={[styles.empty, { color: c.sub }]}>No records yet. Complete a set to set a PR.</Text>
        ) : (
          groups.map((group) => (
            <Card key={group.exerciseId} style={styles.recordCard}>
              <Text style={[styles.recordName, { color: c.fg }]}>{group.name}</Text>
              {group.records.map((r) => (
                <View key={r.id} style={styles.recordRow}>
                  <Text style={[styles.recordLabel, { color: c.sub }]}>
                    {RECORD_LABELS[r.record_type] ?? r.record_type}
                  </Text>
                  <Text style={[styles.recordValue, { color: c.fg }]}>{round(r.value)}</Text>
                </View>
              ))}
            </Card>
          ))
        )}

        <Pressable
          style={[styles.libraryRow, { borderTopColor: c.sep }]}
          onPress={() => navigation.navigate('ExerciseLibrary', { mode: 'browse' })}
        >
          <Icon name="dumbbell" variant="sub" size={20} />
          <Text style={[styles.libraryText, { color: c.fg }]}>Exercise Library</Text>
          <Icon name="chevron-right" variant="sub" size={20} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function groupByExercise(rows: ExerciseRecordRow[]): ExerciseGroup[] {
  const map = new Map<string, ExerciseGroup>();
  for (const row of rows) {
    let group = map.get(row.exercise_id);
    if (!group) {
      group = { exerciseId: row.exercise_id, name: row.exercise_name, records: [] };
      map.set(row.exercise_id, group);
    }
    group.records.push(row);
  }
  return [...map.values()];
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700' },
  identity: { flex: 1 },
  name: { fontSize: 18, fontWeight: '700' },
  since: { fontSize: 13, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16 },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 12, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', margin: 16, marginBottom: 8 },
  empty: { textAlign: 'center', marginTop: 24, paddingHorizontal: 16 },
  recordCard: { marginHorizontal: 16, marginBottom: 10 },
  recordName: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  recordRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  recordLabel: { fontSize: 13 },
  recordValue: { fontSize: 13, fontWeight: '700' },
  libraryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    marginTop: 16,
    marginBottom: 32,
    borderTopWidth: 1,
  },
  libraryText: { flex: 1, fontSize: 15, fontWeight: '600' },
});
