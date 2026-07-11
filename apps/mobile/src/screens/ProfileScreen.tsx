import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { Icon } from '../components/Icon';
import { ExerciseRecordRow, listAllRecords } from '../db/repositories/personalRecords';
import { getProfile, Profile, setProfileName } from '../db/repositories/profile';
import { getProfileStats, ProfileStats } from '../db/repositories/workouts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme, type ThemeMode } from '../theme/ThemeContext';
import { NAME_MAX_LENGTH, sanitizeText } from '../validation/textInput';

const THEME_OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'system', label: 'System' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
];

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
  const [stats, setStats] = useState<ProfileStats>({ workoutCount: 0, totalVolume: 0, streakDays: 0 });
  const [name, setName] = useState('');
  const [body, setBody] = useState<Profile | null>(null);
  const nameInputRef = useRef<TextInput>(null);

  useFocusEffect(
    useCallback(() => {
      listAllRecords().then((rows) => setGroups(groupByExercise(rows)));
      getProfileStats().then(setStats);
      getProfile().then((profile) => {
        setName(profile.name);
        setBody(profile);
      });
    }, [])
  );

  function saveName() {
    const sanitized = sanitizeText(name);
    setName(sanitized);
    setProfileName(sanitized);
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
              ref={nameInputRef}
              style={[styles.name, { color: c.fg }]}
              value={name}
              onChangeText={setName}
              onBlur={saveName}
              placeholder="Your name"
              placeholderTextColor={c.sub}
              maxLength={NAME_MAX_LENGTH}
              accessibilityLabel="Profile display name"
            />
            <Text style={[styles.since, { color: c.sub }]}>Member since 2026</Text>
          </View>
          <Pressable
            onPress={() => nameInputRef.current?.focus()}
            hitSlop={8}
            accessibilityLabel="Edit profile display name"
            accessibilityRole="button"
          >
            <Icon name="pencil" variant="sub" size={20} />
          </Pressable>
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

        <View style={styles.bodySectionHeader}>
          <Text style={[styles.sectionTitle, { color: c.fg, margin: 0 }]}>Body</Text>
          <Pressable
            onPress={() => navigation.navigate('EditProfile')}
            hitSlop={8}
            accessibilityLabel="Edit profile"
            accessibilityRole="button"
          >
            <Icon name="pencil" variant="sub" size={20} />
          </Pressable>
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

        <Text style={[styles.sectionTitle, { color: c.fg }]}>Appearance</Text>
        <View style={styles.themeRow}>
          {THEME_OPTIONS.map((option) => (
            <Chip
              key={option.mode}
              label={option.label}
              selected={c.themeMode === option.mode}
              onPress={() => c.setThemeMode(option.mode)}
              accessibilityLabel={`Use ${option.label} theme`}
            />
          ))}
        </View>

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

export function computeAge(birthDateIso: string): number {
  const [year, month, day] = birthDateIso.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - year;
  const hasHadBirthdayThisYear =
    today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
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
  themeRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16 },
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
