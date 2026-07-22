import { BottomSheet, BottomSheetView } from '@expo/ui/community/bottom-sheet';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ComponentProps, ReactNode } from 'react';

import { useTheme } from '../theme/ThemeContext';
import { Icon } from './Icon';

type OptionsSheetProps = Readonly<{
  title: string;
  testID: string;
  children: ReactNode;
  closing?: boolean;
  enablePanDownToClose?: boolean;
  onClosed: () => void;
}>;

export function OptionsSheet({
  title,
  testID,
  children,
  closing,
  enablePanDownToClose = true,
  onClosed,
}: OptionsSheetProps) {
  const c = useTheme();

  return (
    <BottomSheet
      index={closing ? -1 : 0}
      enableDynamicSizing
      enablePanDownToClose={enablePanDownToClose}
      onClose={onClosed}
      backgroundStyle={{ backgroundColor: c.card }}
    >
      <BottomSheetView style={styles.sheet}>
        <SafeAreaView edges={['bottom']} style={styles.safeArea}>
          <View testID={testID}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: c.fg }]} numberOfLines={1}>
                {title}
              </Text>
            </View>
            {children}
          </View>
        </SafeAreaView>
      </BottomSheetView>
    </BottomSheet>
  );
}

type OptionsSheetActionProps = Readonly<{
  label: string;
  icon: ComponentProps<typeof Icon>['name'];
  onPress: () => void;
  destructive?: boolean;
  testID: string;
  accessibilityLabel?: string;
}>;

export function OptionsSheetAction({
  label,
  icon,
  onPress,
  destructive,
  testID,
  accessibilityLabel = label,
}: OptionsSheetActionProps) {
  const c = useTheme();
  const color = destructive ? c.danger : c.fg;

  return (
    <Pressable
      style={[styles.action, { borderTopColor: c.sep }]}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      testID={testID}
    >
      <Icon name={icon} color={color} size={20} />
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

type OptionsSheetCancelProps = Readonly<{
  onPress: () => void;
  accessibilityLabel: string;
  label?: string;
  style?: StyleProp<ViewStyle>;
}>;

export function OptionsSheetCancel({
  onPress,
  accessibilityLabel,
  label = 'Cancel',
  style,
}: OptionsSheetCancelProps) {
  const c = useTheme();

  return (
    <Pressable
      style={[styles.cancel, { backgroundColor: c.fill }, style]}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      <Text style={[styles.cancelText, { color: c.fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 16, paddingTop: 8 },
  safeArea: { gap: 4 },
  header: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 8,
  },
  title: { maxWidth: '100%', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    borderTopWidth: 1,
  },
  actionText: { fontSize: 16, fontWeight: '600' },
  cancel: {
    minHeight: 48,
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  cancelText: { fontSize: 16, fontWeight: '700' },
});
