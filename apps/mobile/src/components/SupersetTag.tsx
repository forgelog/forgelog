import { StyleSheet, Text } from 'react-native';

import { useTheme } from '../theme/ThemeContext';

export function SupersetTag() {
  const c = useTheme();
  return <Text style={[styles.text, { color: c.accent }]}>⛓ Superset</Text>;
}

const styles = StyleSheet.create({
  text: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
});
