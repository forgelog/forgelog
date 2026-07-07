import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { ExerciseRecordRow, listAllRecords } from '../db/repositories/personalRecords';

const RECORD_LABELS: Record<string, string> = {
  max_weight: 'Max weight',
  max_reps: 'Max reps',
  max_volume: 'Max volume',
  est_1rm: 'Est. 1RM',
};

type ExerciseGroup = { exerciseId: string; name: string; records: ExerciseRecordRow[] };

export function ProgressScreen() {
  const [groups, setGroups] = useState<ExerciseGroup[]>([]);

  useFocusEffect(
    useCallback(() => {
      listAllRecords().then((rows) => setGroups(groupByExercise(rows)));
    }, [])
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={groups}
        keyExtractor={(item) => item.exerciseId}
        ListEmptyComponent={
          <Text style={styles.empty}>No records yet. Complete a set to set a PR.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.group}>
            <Text style={styles.name}>{item.name}</Text>
            {item.records.map((r) => (
              <View key={r.id} style={styles.recordRow}>
                <Text style={styles.recordLabel}>{RECORD_LABELS[r.record_type] ?? r.record_type}</Text>
                <Text style={styles.recordValue}>{round(r.value)}</Text>
              </View>
            ))}
          </View>
        )}
      />
    </View>
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
  container: { flex: 1, backgroundColor: '#fff' },
  empty: { textAlign: 'center', marginTop: 48, color: '#888' },
  group: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  name: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  recordRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  recordLabel: { color: '#666', fontSize: 14 },
  recordValue: { fontSize: 14, fontWeight: '600' },
});
