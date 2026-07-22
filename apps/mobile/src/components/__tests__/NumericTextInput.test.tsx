import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

import { NumericTextInput, type NumericTextInputProps } from '../NumericTextInput';

type HarnessProps = Readonly<{
  initialValue: number | null;
  kind: NumericTextInputProps['kind'];
  onValueChange?: (value: number | null) => void;
}>;

function NumericTextInputHarness({ initialValue, kind, onValueChange }: HarnessProps) {
  const [value, setValue] = useState(initialValue);

  return (
    <NumericTextInput
      value={value}
      kind={kind}
      onValueChange={(nextValue) => {
        onValueChange?.(nextValue);
        setValue(nextValue);
      }}
      accessibilityLabel="Numeric value"
    />
  );
}

afterEach(cleanup);

test('preserves a decimal separator while publishing only changed numeric values', async () => {
  const onValueChange = jest.fn();
  const screen = await render(
    <NumericTextInputHarness initialValue={3} kind="decimal" onValueChange={onValueChange} />
  );
  const input = screen.getByLabelText('Numeric value');

  await act(async () => fireEvent(input, 'focus'));
  await act(async () => fireEvent.changeText(input, '3.'));
  expect(input.props.value).toBe('3.');
  expect(onValueChange).not.toHaveBeenCalled();

  await act(async () => fireEvent.changeText(input, '3.5'));
  expect(input.props.value).toBe('3.5');
  expect(onValueChange).toHaveBeenCalledWith(3.5);

  await act(async () => fireEvent(input, 'blur'));
  expect(input.props.value).toBe('3.5');
});

test('publishes the numeric value when text with a trailing separator is pasted', async () => {
  const onValueChange = jest.fn();
  const screen = await render(
    <NumericTextInputHarness initialValue={null} kind="decimal" onValueChange={onValueChange} />
  );
  const input = screen.getByLabelText('Numeric value');

  await act(async () => fireEvent(input, 'focus'));
  await act(async () => fireEvent.changeText(input, '7.'));

  expect(input.props.value).toBe('7.');
  expect(onValueChange).toHaveBeenCalledWith(7);

  await act(async () => fireEvent(input, 'blur'));
  expect(input.props.value).toBe('7');
});

test('normalizes a comma decimal while preserving it during editing', async () => {
  const onValueChange = jest.fn();
  const screen = await render(
    <NumericTextInputHarness initialValue={null} kind="decimal" onValueChange={onValueChange} />
  );
  const input = screen.getByLabelText('Numeric value');

  await act(async () => fireEvent(input, 'focus'));
  await act(async () => fireEvent.changeText(input, '3,5'));

  expect(input.props.value).toBe('3,5');
  expect(onValueChange).toHaveBeenCalledWith(3.5);

  await act(async () => fireEvent(input, 'blur'));
  expect(input.props.value).toBe('3.5');
});

test('rejects decimal text for integer fields without displaying it', async () => {
  const onValueChange = jest.fn();
  const screen = await render(
    <NumericTextInputHarness initialValue={4} kind="integer" onValueChange={onValueChange} />
  );
  const input = screen.getByLabelText('Numeric value');

  await act(async () => fireEvent(input, 'focus'));
  await act(async () => fireEvent.changeText(input, '4.'));
  expect(input.props.value).toBe('4');

  await act(async () => fireEvent.changeText(input, '4.5'));
  expect(input.props.value).toBe('4');
  expect(onValueChange).not.toHaveBeenCalled();
});

test('publishes null when the field is cleared', async () => {
  const onValueChange = jest.fn();
  const screen = await render(
    <NumericTextInputHarness initialValue={4} kind="integer" onValueChange={onValueChange} />
  );
  const input = screen.getByLabelText('Numeric value');

  await act(async () => fireEvent(input, 'focus'));
  await act(async () => fireEvent.changeText(input, ''));

  expect(input.props.value).toBe('');
  expect(onValueChange).toHaveBeenCalledWith(null);
});

test('shows an authoritative value change while focused', async () => {
  const onValueChange = jest.fn();
  const screen = await render(
    <NumericTextInput
      value={3}
      kind="decimal"
      onValueChange={onValueChange}
      accessibilityLabel="Numeric value"
    />
  );
  const input = screen.getByLabelText('Numeric value');

  await act(async () => fireEvent(input, 'focus'));
  await act(async () => fireEvent.changeText(input, '3.5'));
  expect(input.props.value).toBe('3.5');

  screen.rerender(
    <NumericTextInput
      value={2}
      kind="decimal"
      onValueChange={onValueChange}
      accessibilityLabel="Numeric value"
    />
  );

  await waitFor(() => expect(input.props.value).toBe('2'));
});
