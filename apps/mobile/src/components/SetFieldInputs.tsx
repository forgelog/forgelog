import type { StyleProp, TextStyle } from 'react-native';
import { TextInput } from 'react-native';

import type { ExerciseTypeFieldDescriptor, SetFieldKey } from '../domain/setFields';
import { useTheme } from '../theme/ThemeContext';

type Props = Readonly<{
  fields: readonly ExerciseTypeFieldDescriptor[];
  inputStyle: StyleProp<TextStyle>;
  valueForField: (field: SetFieldKey) => string;
  onChangeField: (field: ExerciseTypeFieldDescriptor, text: string) => void;
  accessibilityLabelForField: (field: ExerciseTypeFieldDescriptor) => string;
  testIDForField: (field: SetFieldKey) => string;
  editable?: boolean;
}>;

export function SetFieldInputs({
  fields,
  inputStyle,
  valueForField,
  onChangeField,
  accessibilityLabelForField,
  testIDForField,
  editable = true,
}: Props) {
  const c = useTheme();

  return (
    <>
      {fields.map((field) => (
        <TextInput
          key={field.key}
          style={[inputStyle, { backgroundColor: c.fill, color: c.fg }]}
          value={valueForField(field.key)}
          onChangeText={(text) => onChangeField(field, text)}
          placeholder={field.placeholder}
          placeholderTextColor={c.sub}
          keyboardType={field.keyboardType}
          editable={editable}
          accessibilityState={editable ? undefined : { disabled: true }}
          accessibilityLabel={accessibilityLabelForField(field)}
          testID={testIDForField(field.key)}
        />
      ))}
    </>
  );
}
