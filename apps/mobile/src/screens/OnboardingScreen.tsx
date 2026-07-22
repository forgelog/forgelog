import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { completeOnboarding } from '../application/profile';
import { useTheme } from '../theme/ThemeContext';
import { BODYWEIGHT_MAX_KG, BODYWEIGHT_MIN_KG, validateNumber } from '../validation/numericInput';
import { NAME_MAX_LENGTH, validateText } from '../validation/textInput';

type Props = {
  onComplete: () => void;
};

type FieldErrors = {
  name?: string;
  bodyweight?: string;
  general?: string;
};

export function OnboardingScreen({ onComplete }: Props) {
  const c = useTheme();
  const [name, setName] = useState('');
  const [bodyweight, setBodyweight] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    const nameResult = validateText(name, {
      maxLength: NAME_MAX_LENGTH,
      required: true,
      fieldLabel: 'Name',
    });
    const bodyweightResult = validateBodyweight(bodyweight);
    const nextErrors = {
      name: nameResult.error ?? undefined,
      bodyweight: bodyweightResult.error ?? undefined,
    };
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.bodyweight) return;

    setSaving(true);
    try {
      await completeOnboarding({
        name: nameResult.value,
        bodyweightKg: bodyweightResult.value,
      });
      onComplete();
    } catch (error) {
      setErrors((current) => ({
        ...current,
        general: error instanceof Error ? error.message : 'Could not save your profile.',
      }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Text style={[styles.eyebrow, { color: c.accent }]}>FORGELOG</Text>
          <Text style={[styles.title, { color: c.fg }]}>Let’s set up your profile.</Text>
          <Text style={[styles.subtitle, { color: c.sub }]}>You can add bodyweight now or whenever you start logging bodyweight exercises.</Text>
        </View>

        <View style={[styles.form, { backgroundColor: c.card, borderColor: c.sep }]}>
          {errors.general ? (
            <Text selectable style={[styles.error, { color: c.danger }]}>
              {errors.general}
            </Text>
          ) : null}

          <Text style={[styles.label, { color: c.fg }]}>What should we call you?</Text>
          <TextInput
            autoFocus
            autoCapitalize="words"
            autoCorrect={false}
            editable={!saving}
            maxLength={NAME_MAX_LENGTH}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={c.sub}
            returnKeyType="next"
            style={[styles.input, { borderColor: c.sep, color: c.fg }]}
            value={name}
            accessibilityLabel="Your name"
            testID="onboarding-name-input"
          />
          {errors.name ? (
            <Text selectable style={[styles.error, { color: c.danger }]}>
              {errors.name}
            </Text>
          ) : null}

          <Text style={[styles.label, { color: c.fg }]}>Current bodyweight (kg) · optional</Text>
          <TextInput
            editable={!saving}
            keyboardType="decimal-pad"
            onChangeText={setBodyweight}
            placeholder="For example, 72.5"
            placeholderTextColor={c.sub}
            returnKeyType="done"
            style={[styles.input, { borderColor: c.sep, color: c.fg }]}
            value={bodyweight}
            accessibilityLabel="Current bodyweight in kilograms"
            testID="onboarding-bodyweight-input"
            onSubmitEditing={handleContinue}
          />
          {errors.bodyweight ? (
            <Text selectable style={[styles.error, { color: c.danger }]}>
              {errors.bodyweight}
            </Text>
          ) : null}

          <Pressable
            accessibilityLabel="Continue"
            accessibilityRole="button"
            disabled={saving}
            onPress={handleContinue}
            style={[styles.button, { backgroundColor: c.accent, opacity: saving ? 0.6 : 1 }]}
            testID="onboarding-continue"
          >
            <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Continue'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function validateBodyweight(text: string) {
  const trimmed = text.trim();
  if (trimmed === '') return { value: null, error: null };
  return validateNumber(Number(trimmed), {
    min: BODYWEIGHT_MIN_KG,
    max: BODYWEIGHT_MAX_KG,
    fieldLabel: 'Bodyweight',
  });
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 32 },
  hero: { gap: 10 },
  eyebrow: { fontSize: 13, fontWeight: '800', letterSpacing: 1.4 },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  subtitle: { fontSize: 16, lineHeight: 23 },
  form: { borderWidth: 1, borderRadius: 20, padding: 20, gap: 10 },
  label: { fontSize: 15, fontWeight: '700', marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 },
  error: { fontSize: 13, lineHeight: 18 },
  button: { alignItems: 'center', borderRadius: 12, marginTop: 14, paddingVertical: 14 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
});
