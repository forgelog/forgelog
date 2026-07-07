import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <Pressable style={styles.button} onPress={() => navigation.navigate('ExerciseLibrary')}>
        <Text style={styles.buttonText}>Exercise Library</Text>
      </Pressable>
      <Pressable style={styles.button} onPress={() => navigation.navigate('RoutineList')}>
        <Text style={styles.buttonText}>Routines</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
