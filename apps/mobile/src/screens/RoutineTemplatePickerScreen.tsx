import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { ROUTINE_TEMPLATES, type RoutineTemplate } from '../domain/routineTemplates';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'RoutineTemplatePicker'>;

export function RoutineTemplatePickerScreen({ navigation }: Props) {
  const c = useTheme();

  const renderTemplate = useCallback(
    ({ item }: { item: RoutineTemplate }) => (
      <Card>
        <Pressable
          accessibilityLabel={`Create routine from ${item.name}`}
          accessibilityHint={`${item.description} ${item.exercises.length} exercises. Opens an editable routine draft.`}
          accessibilityRole="button"
          onPress={() => navigation.replace('RoutineEditor', { templateId: item.id })}
          style={styles.template}
        >
          <View style={styles.templateText}>
            <Text style={[styles.templateName, { color: c.fg }]}>{item.name}</Text>
            <Text style={[styles.templateDescription, { color: c.sub }]}>{item.description}</Text>
            <Text style={[styles.templateMeta, { color: c.accent }]}>
              {item.exercises.length} exercises
            </Text>
          </View>
          <Icon name="chevron-right" variant="sub" size={22} />
        </Pressable>
      </Card>
    ),
    [c.accent, c.fg, c.sub, navigation]
  );

  return (
    <SafeAreaView edges={['bottom']} style={[styles.container, { backgroundColor: c.bg }]}>
      <ScreenHeader
        title="Routine Templates"
        leading="back"
        onLeadingPress={() => navigation.goBack()}
      />
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        data={ROUTINE_TEMPLATES}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <Text style={[styles.intro, { color: c.sub }]}>
            Choose a starting point, then customize every exercise and set before saving.
          </Text>
        }
        renderItem={renderTemplate}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12 },
  intro: { fontSize: 15, lineHeight: 21, paddingBottom: 4 },
  template: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  templateText: { flex: 1, gap: 6 },
  templateName: { fontSize: 17, fontWeight: '700' },
  templateDescription: { fontSize: 14, lineHeight: 20 },
  templateMeta: { fontSize: 13, fontWeight: '700' },
});
