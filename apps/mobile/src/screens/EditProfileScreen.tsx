import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip } from '../components/Chip';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { mobileStore, type Sex } from '../db/mobileStore';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme/ThemeContext';
import {
  BODYWEIGHT_MAX_KG,
  BODYWEIGHT_MIN_KG,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  parseIsoDate,
  toIsoDate,
  validateBirthDate,
  validateNumber,
} from '../validation/numericInput';
import { NAME_MAX_LENGTH } from '../validation/textInput';

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

type Props = NativeStackScreenProps<RootStackParamList, 'EditProfile'>;

type FieldErrors = {
  general?: string;
  height?: string;
  bodyweight?: string;
  birthDate?: string;
};

export function EditProfileScreen({ navigation }: Props) {
  const c = useTheme();
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [sex, setSex] = useState<Sex | null>(null);
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [heightCm, setHeightCm] = useState('');
  const [bodyweightKg, setBodyweightKg] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  useFocusEffect(
    useCallback(() => {
      setLoaded(false);
      mobileStore.profile.get().then((profile) => {
        setName(profile.name);
        setSex(profile.sex);
        setBirthDate(profile.birthDate ? parseIsoDate(profile.birthDate) : null);
        setHeightCm(profile.heightCm !== null ? String(profile.heightCm) : '');
        setBodyweightKg(profile.bodyweightKg !== null ? String(profile.bodyweightKg) : '');
        setErrors({});
        setLoaded(true);
      });
    }, [])
  );

  function handleDateChange(event: { type: string }, date?: Date) {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type !== 'set' || !date) return;
    const result = validateBirthDate(date);
    setErrors((prev) => ({ ...prev, birthDate: result.error ?? undefined }));
    if (!result.error) setBirthDate(date);
  }

  function validateHeight(text: string) {
    const result = validateNumber(parseOptionalNumber(text), {
      min: HEIGHT_MIN_CM,
      max: HEIGHT_MAX_CM,
      fieldLabel: 'Height',
    });
    setErrors((prev) => ({ ...prev, height: result.error ?? undefined }));
    return result;
  }

  function validateBodyweight(text: string) {
    const result = validateNumber(parseOptionalNumber(text), {
      min: BODYWEIGHT_MIN_KG,
      max: BODYWEIGHT_MAX_KG,
      fieldLabel: 'Bodyweight',
    });
    setErrors((prev) => ({ ...prev, bodyweight: result.error ?? undefined }));
    return result;
  }

  async function handleSave() {
    if (!loaded) return;

    const heightResult = validateHeight(heightCm);
    const bodyweightResult = validateBodyweight(bodyweightKg);
    if (heightResult.error || bodyweightResult.error) return;

    try {
      await mobileStore.profile.update({
        name,
        sex,
        birthDate: birthDate ? toIsoDate(birthDate) : null,
        heightCm: heightResult.value,
        bodyweightKg: bodyweightResult.value,
      });
      navigation.goBack();
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        general: e instanceof Error ? e.message : 'Could not save.',
      }));
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <ScreenHeader
        title="Edit Profile"
        leading="close"
        onLeadingPress={() => navigation.goBack()}
        trailing={
          <Pressable onPress={handleSave} hitSlop={8} accessibilityLabel="Save profile">
            <Icon name="check" variant="accent" size={24} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {errors.general ? <Text style={[styles.error, { color: c.danger }]}>{errors.general}</Text> : null}

        <Text style={[styles.label, { color: c.sub }]}>Name</Text>
        <TextInput
          style={[styles.input, { color: c.fg, borderColor: c.sep }]}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={c.sub}
          maxLength={NAME_MAX_LENGTH}
          accessibilityLabel="Profile name"
          testID="profile-name-input"
        />

        <Text style={[styles.label, { color: c.sub }]}>Sex</Text>
        <View style={styles.chipRow}>
          {SEX_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={sex === option.value}
              onPress={() => setSex(sex === option.value ? null : option.value)}
              accessibilityLabel={`Select ${option.label} sex`}
            />
          ))}
        </View>

        <Text style={[styles.label, { color: c.sub }]}>Birth date</Text>
        <Pressable
          style={[styles.input, { borderColor: c.sep }]}
          onPress={() => setShowDatePicker(true)}
          accessibilityLabel="Birth date"
          accessibilityRole="button"
        >
          <Text style={{ color: birthDate ? c.fg : c.sub }}>
            {birthDate ? birthDate.toLocaleDateString() : 'Not set'}
          </Text>
        </Pressable>
        {errors.birthDate ? <Text style={[styles.error, { color: c.danger }]}>{errors.birthDate}</Text> : null}
        {showDatePicker ? (
          <>
            <DateTimePicker
              value={birthDate ?? new Date()}
              mode="date"
              maximumDate={new Date()}
              onChange={handleDateChange}
            />
            {Platform.OS === 'ios' ? (
              <Pressable onPress={() => setShowDatePicker(false)} style={styles.doneButton}>
                <Text style={{ color: c.accent, fontWeight: '600' }}>Done</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

        <Text style={[styles.label, { color: c.sub }]}>Height (cm)</Text>
        <TextInput
          style={[styles.input, { color: c.fg, borderColor: c.sep }]}
          value={heightCm}
          onChangeText={setHeightCm}
          onBlur={() => validateHeight(heightCm)}
          placeholder="Not set"
          placeholderTextColor={c.sub}
          keyboardType="decimal-pad"
          accessibilityLabel="Height in centimeters"
          testID="profile-height-input"
        />
        {errors.height ? <Text style={[styles.error, { color: c.danger }]}>{errors.height}</Text> : null}

        <Text style={[styles.label, { color: c.sub }]}>Bodyweight (kg)</Text>
        <TextInput
          style={[styles.input, { color: c.fg, borderColor: c.sep }]}
          value={bodyweightKg}
          onChangeText={setBodyweightKg}
          onBlur={() => validateBodyweight(bodyweightKg)}
          placeholder="Not set"
          placeholderTextColor={c.sub}
          keyboardType="decimal-pad"
          accessibilityLabel="Bodyweight in kilograms"
          testID="profile-bodyweight-input"
        />
        {errors.bodyweight ? <Text style={[styles.error, { color: c.danger }]}>{errors.bodyweight}</Text> : null}
      </ScrollView>
    </View>
  );
}

function parseOptionalNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return Number(trimmed);
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  form: { padding: 16, gap: 6 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 14 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    justifyContent: 'center',
  },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  error: { fontSize: 12, marginTop: 2 },
  doneButton: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 4 },
});
