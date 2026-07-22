import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { View } from 'react-native';

import type { ExerciseTypeFieldDescriptor, SetFieldKey } from '../domain/setFields';
import { useTheme } from '../theme/ThemeContext';
import { NumericTextInput } from './NumericTextInput';

type Props = Readonly<{
  fields: readonly ExerciseTypeFieldDescriptor[];
  inputStyle: StyleProp<TextStyle>;
  valueForField: (field: SetFieldKey) => number | null;
  onChangeField: (field: ExerciseTypeFieldDescriptor, text: string) => void;
  accessibilityLabelForField: (field: ExerciseTypeFieldDescriptor) => string;
  testIDForField: (field: SetFieldKey) => string;
  editable?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}>;

export function SetFieldInputs({
  fields,
  inputStyle,
  valueForField,
  onChangeField,
  accessibilityLabelForField,
  testIDForField,
  editable = true,
  containerStyle,
}: Props) {
  const c = useTheme();

  const inputs = (
    <>
      {fields.map((field) => (
        <NumericTextInput
          key={field.key}
          style={[inputStyle, { backgroundColor: c.fill, color: c.fg }]}
          value={valueForField(field.key)}
          kind={field.parser === 'integer' ? 'integer' : 'decimal'}
          onValueChange={(value) => onChangeField(field, value?.toString() ?? '')}
          placeholder={field.placeholder}
          placeholderTextColor={c.sub}
          editable={editable}
          accessibilityState={editable ? undefined : { disabled: true }}
          accessibilityLabel={accessibilityLabelForField(field)}
          testID={testIDForField(field.key)}
        />
      ))}
    </>
  );

  return containerStyle ? <View style={containerStyle}>{inputs}</View> : inputs;
}
