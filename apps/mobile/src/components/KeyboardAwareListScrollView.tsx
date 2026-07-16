import type { ScrollViewProps } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

const KEYBOARD_INPUT_BOTTOM_OFFSET = 16;

export function KeyboardAwareListScrollView(props: ScrollViewProps) {
  return <KeyboardAwareScrollView {...props} bottomOffset={KEYBOARD_INPUT_BOTTOM_OFFSET} />;
}
