import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { createRoutine, deleteRoutine, listRoutines } from '../db/repositories/routines';
import type { Routine } from '../db/types';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'RoutineList'>;

export function RoutineListScreen({ navigation }: Props) {
  const [routines, setRoutines] = useState<Routine[]>([]);

  const reload = useCallback(() => {
    listRoutines().then(setRoutines);
  }, []);

  useFocusEffect(reload);

  async function handleCreate() {
    const routine = await createRoutine('New Routine');
    navigation.navigate('RoutineEditor', { routineId: routine.id });
  }

  function confirmDelete(routine: Routine) {
    Alert.alert('Delete routine', `Delete "${routine.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteRoutine(routine.id);
          reload();
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={routines}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>No routines yet. Create one below.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('RoutineEditor', { routineId: item.id })}
            onLongPress={() => confirmDelete(item)}
          >
            <Text style={styles.name}>{item.name}</Text>
            {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
          </Pressable>
        )}
      />
      <Pressable style={styles.button} onPress={handleCreate}>
        <Text style={styles.buttonText}>New Routine</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  empty: { textAlign: 'center', marginTop: 48, color: '#888' },
  row: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#eee' },
  name: { fontSize: 16, fontWeight: '600' },
  notes: { marginTop: 2, color: '#666', fontSize: 13 },
  button: {
    margin: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
