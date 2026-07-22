import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { PillButton } from '../components/PillButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { mobileStore } from '../db/mobileStore';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme/ThemeContext';
import { NAME_MAX_LENGTH, validateText } from '../validation/textInput';

type Props = NativeStackScreenProps<RootStackParamList, 'EditWorkout'>;

export function EditWorkoutScreen({ route, navigation }: Props) {
  const { workoutId } = route.params;
  const c = useTheme();
  const [name, setName] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoaded(false);
      setLoadFailed(false);
      setNameError(null);
      setGeneralError(null);
      void mobileStore.workouts
        .getDetail(workoutId)
        .then((workout) => {
          if (!active) return;
          if (!workout) {
            setLoadFailed(true);
            return;
          }
          setName(workout.name);
        })
        .catch(() => {
          if (active) setLoadFailed(true);
        })
        .finally(() => {
          if (active) setLoaded(true);
        });
      return () => {
        active = false;
      };
    }, [workoutId])
  );

  function updateName(value: string) {
    setName(value);
    setNameError(
      validateText(value, {
        required: true,
        maxLength: NAME_MAX_LENGTH,
        fieldLabel: 'Workout name',
      }).error
    );
  }

  async function handleSave() {
    if (!loaded || saving || loadFailed) return;
    const result = validateText(name, {
      required: true,
      maxLength: NAME_MAX_LENGTH,
      fieldLabel: 'Workout name',
    });
    setNameError(result.error);
    setGeneralError(null);
    if (result.error) return;

    setSaving(true);
    try {
      await mobileStore.workouts.updateName(workoutId, result.value);
      navigation.goBack();
    } catch {
      setGeneralError('Could not save workout.');
      setSaving(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <ScreenHeader
        title="Edit Workout"
        leading="close"
        onLeadingPress={() => navigation.goBack()}
        trailing={
          <PillButton
            label={saving ? 'Saving...' : 'Save'}
            onPress={handleSave}
            variant="filled"
            disabled={!loaded || saving || loadFailed}
            accessibilityLabel="Save workout"
            testID="workout-save-button"
          />
        }
      />
      {loaded ? (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
        >
          {loadFailed ? (
            <Text style={[styles.error, { color: c.danger }]}>Could not load workout.</Text>
          ) : (
            <>
              {generalError ? (
                <Text style={[styles.error, { color: c.danger }]}>{generalError}</Text>
              ) : null}
              <Text style={[styles.label, { color: c.sub }]}>Name</Text>
              <TextInput
                style={[styles.input, { color: c.fg, borderColor: c.sep }]}
                value={name}
                onChangeText={updateName}
                placeholder="Workout name"
                placeholderTextColor={c.sub}
                maxLength={NAME_MAX_LENGTH}
                accessibilityLabel="Workout name"
                testID="workout-name-input"
                autoFocus
              />
              {nameError ? (
                <Text style={[styles.error, { color: c.danger }]}>{nameError}</Text>
              ) : null}
            </>
          )}
        </ScrollView>
      ) : (
        <View style={styles.centered}>
          <ActivityIndicator accessibilityLabel="Loading workout" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  form: { padding: 16, gap: 6 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 14 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    justifyContent: 'center',
  },
  error: { fontSize: 12, marginTop: 2 },
});
