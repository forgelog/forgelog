import type { StyleProp, TextStyle } from 'react-native';
import { TextInput } from 'react-native';

import { FIELD_PLACEHOLDER } from '../domain/setFields';
import type { SetFieldKey } from '../domain/setFields';
import { useTheme } from '../theme/ThemeContext';

type Props = Readonly<{
  fields: SetFieldKey[];
  inputStyle: StyleProp<TextStyle>;
  valueForField: (field: SetFieldKey) => string;
  onChangeField: (field: SetFieldKey, text: string) => void;
  accessibilityLabelForField: (field: SetFieldKey) => string;
  testIDForField: (field: SetFieldKey) => string;
}>;

export function SetFieldInputs({
  fields,
  inputStyle,
  valueForField,
  onChangeField,
  accessibilityLabelForField,
  testIDForField,
}: Props) {
  const c = useTheme();

  return (
    <>
      {fields.map((field) => (
        <TextInput
          key={field}
          style={[inputStyle, { backgroundColor: c.fill, color: c.fg }]}
          value={valueForField(field)}
          onChangeText={(text) => onChangeField(field, text)}
          placeholder={FIELD_PLACEHOLDER[field]}
          placeholderTextColor={c.sub}
          keyboardType="numeric"
          accessibilityLabel={accessibilityLabelForField(field)}
          testID={testIDForField(field)}
        />
      ))}
    </>
  );
}
