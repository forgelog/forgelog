import { useEffect, useRef, useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

const INTEGER_DRAFT_PATTERN = /^\d*$/;
const DECIMAL_DRAFT_PATTERN = /^\d*(?:[.,]\d*)?$/;

export type NumericTextInputProps = Omit<
  TextInputProps,
  'defaultValue' | 'inputMode' | 'keyboardType' | 'onChangeText' | 'value'
> &
  Readonly<{
    value: number | null;
    kind: 'integer' | 'decimal';
    onValueChange: (value: number | null) => void;
  }>;

/**
 * A numeric TextInput that preserves transient editing text such as "3."
 * while exposing only parsed numeric values to its parent.
 */
export function NumericTextInput({
  value,
  kind,
  onValueChange,
  onFocus,
  onBlur,
  ...textInputProps
}: NumericTextInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const previousValue = useRef(value);

  useEffect(() => {
    if (Object.is(previousValue.current, value)) return;
    previousValue.current = value;

    setDraft((current) => {
      if (current === null || draftRepresentsValue(current, value)) return current;
      return formatNumericValue(value);
    });
  }, [value]);

  function handleChangeText(text: string) {
    if (!isPotentialNumericValue(text, kind)) return;

    setDraft(text);
    const nextValue = parseNumericDraft(text);
    if (!Object.is(nextValue, value)) onValueChange(nextValue);
  }

  return (
    <TextInput
      {...textInputProps}
      value={draft ?? formatNumericValue(value)}
      onChangeText={handleChangeText}
      inputMode={kind === 'integer' ? 'numeric' : 'decimal'}
      keyboardType={kind === 'integer' ? 'number-pad' : 'decimal-pad'}
      onFocus={(event) => {
        setDraft(formatNumericValue(value));
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setDraft(null);
        onBlur?.(event);
      }}
    />
  );
}

function isPotentialNumericValue(value: string, kind: NumericTextInputProps['kind']): boolean {
  return (kind === 'integer' ? INTEGER_DRAFT_PATTERN : DECIMAL_DRAFT_PATTERN).test(value);
}

function parseNumericDraft(value: string): number | null {
  if (value === '' || value === '.' || value === ',') return null;
  return Number(value.replace(',', '.'));
}

function draftRepresentsValue(draft: string, value: number | null): boolean {
  return Object.is(parseNumericDraft(draft), value);
}

function formatNumericValue(value: number | null): string {
  return value?.toString() ?? '';
}
