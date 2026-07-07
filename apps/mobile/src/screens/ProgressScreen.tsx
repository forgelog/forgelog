import { StyleSheet, Text, View } from 'react-native';

export function ProgressScreen() {
  return (
    <View style={styles.container}>
      <Text>Progress</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
