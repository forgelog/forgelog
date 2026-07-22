import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const c = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <ScreenHeader title="Settings" leading="back" onLeadingPress={() => navigation.goBack()} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: c.fg }]}>Profile</Text>
        <Card style={styles.card}>
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('EditProfile')}
            accessibilityLabel="Edit profile"
            accessibilityRole="button"
          >
            <Icon name="account" variant="sub" size={20} />
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: c.fg }]}>Profile</Text>
              <Text style={[styles.rowSubtitle, { color: c.sub }]}>Name and body details</Text>
            </View>
            <Icon name="chevron-right" variant="sub" size={20} />
          </Pressable>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  card: { paddingVertical: 0 },
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowSubtitle: { fontSize: 13 },
});
