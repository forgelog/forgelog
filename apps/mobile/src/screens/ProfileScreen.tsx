import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import {
  mobileStore,
  type ExerciseRecordRow,
  type Profile,
} from '../db/mobileStore';
import { computeAge, initials } from '../domain/profile';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme/ThemeContext';
import { NAME_MAX_LENGTH, sanitizeText } from '../validation/textInput';

const RECORD_LABELS: Record<string, string> = {
  max_weight: 'Max weight',
  max_reps: 'Max reps',
  max_volume: 'Max volume',
  est_1rm: 'Est. 1RM',
};

const SEX_LABELS: Record<NonNullable<Profile['sex']>, string> = {
  male: 'Male',
  female: 'Female',
  prefer_not_to_say: 'Prefer not to say',
};

const NOT_SET = 'Not set';

type ExerciseGroup = { exerciseId: string; name: string; records: ExerciseRecordRow[] };

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ProfileScreen() {
  const c = useTheme();
  const navigation = useNavigation<Nav>();
  const [groups, setGroups] = useState<ExerciseGroup[]>([]);
  const [name, setName] = useState('');
  const [body, setBody] = useState<Profile | null>(null);

  useFocusEffect(
    useCallback(() => {
      mobileStore.records.listAll().then((rows) => setGroups(groupByExercise(rows)));
      mobileStore.profile.get().then((profile) => {
        setName(profile.name);
        setBody(profile);
      });
    }, [])
  );

  function saveName() {
    const sanitized = sanitizeText(name);
    setName(sanitized);
    mobileStore.profile.setName(sanitized);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.bg }]}>
      <ScrollView>
        <View style={styles.header}>
          <View style={[styles.avatar, { backgroundColor: c.asoft }]}>
            {name.trim() ? (
              <Text style={[styles.avatarText, { color: c.accent }]}>{initials(name)}</Text>
            ) : (
              <Icon name="account" variant="accent" size={28} />
            )}
          </View>
          <View style={styles.identity}>
            <TextInput
              style={[styles.name, { color: c.fg }]}
              value={name}
              onChangeText={setName}
              onBlur={saveName}
              placeholder="Your name"
              placeholderTextColor={c.sub}
              maxLength={NAME_MAX_LENGTH}
              accessibilityLabel="Profile display name"
            />
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.headerIconButton}
              onPress={() => navigation.navigate('EditProfile')}
              hitSlop={8}
              accessibilityLabel="Edit profile"
              accessibilityRole="button"
            >
              <Icon name="pencil" variant="sub" size={20} />
            </Pressable>
            <Pressable
              style={styles.headerIconButton}
              onPress={() => navigation.navigate('Settings')}
              hitSlop={8}
              accessibilityLabel="Open settings"
              accessibilityRole="button"
            >
              <Icon name="cog" variant="sub" size={22} />
            </Pressable>
          </View>
        </View>

        <View style={styles.bodySectionHeader}>
          <Text style={[styles.sectionTitle, { color: c.fg, margin: 0 }]}>Body</Text>
        </View>
        <Card style={styles.bodyCard}>
          <View style={styles.bodyRow}>
            <Text style={[styles.bodyLabel, { color: c.sub }]}>Sex</Text>
            <Text style={[styles.bodyValue, { color: c.fg }]}>
              {body?.sex ? SEX_LABELS[body.sex] : NOT_SET}
            </Text>
          </View>
          <View style={styles.bodyRow}>
            <Text style={[styles.bodyLabel, { color: c.sub }]}>Age</Text>
            <Text style={[styles.bodyValue, { color: c.fg }]}>
              {body?.birthDate ? computeAge(body.birthDate) : NOT_SET}
            </Text>
          </View>
          <View style={styles.bodyRow}>
            <Text style={[styles.bodyLabel, { color: c.sub }]}>Height</Text>
            <Text style={[styles.bodyValue, { color: c.fg }]}>
              {body?.heightCm ? `${body.heightCm} cm` : NOT_SET}
            </Text>
          </View>
          <View style={styles.bodyRow}>
            <Text style={[styles.bodyLabel, { color: c.sub }]}>Weight</Text>
            <Text style={[styles.bodyValue, { color: c.fg }]}>
              {body?.bodyweightKg ? `${body.bodyweightKg} kg` : NOT_SET}
            </Text>
          </View>
        </Card>

        <Text style={[styles.sectionTitle, { color: c.fg }]}>Personal Records</Text>
        {groups.length === 0 ? (
          <Text style={[styles.empty, { color: c.sub }]}>
            No records yet. Complete a set to set a PR.
          </Text>
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
          style={[styles.optionRow, { borderTopColor: c.sep }]}
          onPress={() => navigation.navigate('ExerciseLibrary', { mode: 'browse' })}
          accessibilityLabel="Open exercise library"
          accessibilityRole="button"
        >
          <Icon name="dumbbell" variant="sub" size={20} />
          <Text style={[styles.optionText, { color: c.fg }]}>Exercise Library</Text>
          <Icon name="chevron-right" variant="sub" size={20} />
        </Pressable>
        <Pressable
          style={[styles.optionRow, styles.lastOptionRow, { borderTopColor: c.sep }]}
          onPress={() => navigation.navigate('Measurements')}
          accessibilityLabel="Open measurements"
          accessibilityRole="button"
        >
          <Icon name="tape-measure" variant="sub" size={20} />
          <Text style={[styles.optionText, { color: c.fg }]}>Measurements</Text>
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
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700' },
  identity: { flex: 1 },
  name: { fontSize: 18, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerIconButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', margin: 16, marginBottom: 8 },
  empty: { textAlign: 'center', marginTop: 24, paddingHorizontal: 16 },
  recordCard: { marginHorizontal: 16, marginBottom: 10 },
  recordName: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  recordRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  recordLabel: { fontSize: 13 },
  recordValue: { fontSize: 13, fontWeight: '700' },
  bodySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  bodyCard: { marginHorizontal: 16, marginBottom: 10, gap: 10 },
  bodyRow: { flexDirection: 'row', justifyContent: 'space-between' },
  bodyLabel: { fontSize: 13 },
  bodyValue: { fontSize: 13, fontWeight: '700' },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    marginTop: 16,
    borderTopWidth: 1,
  },
  lastOptionRow: { marginTop: 0, marginBottom: 32 },
  optionText: { flex: 1, fontSize: 15, fontWeight: '600' },
});
