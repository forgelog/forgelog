import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';

import {
  fieldsForExerciseType,
  parseSetFieldValue,
  type ExerciseTypeFieldDescriptor,
  type SetFieldKey,
} from '../../domain/setFields';
import { SetFieldInputs } from '../SetFieldInputs';

const fields: readonly ExerciseTypeFieldDescriptor[] = [
  fieldsForExerciseType('weight_reps')[0],
  fieldsForExerciseType('weight_reps')[1],
  fieldsForExerciseType('duration')[0],
  fieldsForExerciseType('weight_distance')[1],
];

type Values = Record<SetFieldKey, number | null>;

function SetFieldInputsHarness() {
  const [values, setValues] = useState<Values>({
    weight: null,
    reps: null,
    duration: null,
    distance: null,
  });

  function update(field: ExerciseTypeFieldDescriptor, raw: string) {
    const value = parseSetFieldValue(field, raw);
    if (value === undefined) return;
    setValues((current) => ({ ...current, [field.key]: value }));
  }

  return (
    <SetFieldInputs
      fields={fields}
      inputStyle={{}}
      valueForField={(field) => values[field]}
      onChangeField={update}
      accessibilityLabelForField={(field) => field.inputLabel}
      testIDForField={(field) => `set-${field}`}
    />
  );
}

afterEach(cleanup);

async function enterKeySequence(
  screen: Awaited<ReturnType<typeof render>>,
  testID: string,
  values: string[]
) {
  await act(async () => fireEvent(screen.getByTestId(testID), 'focus'));
  for (const value of values) {
    await act(async () => fireEvent.changeText(screen.getByTestId(testID), value));
    expect(screen.getByTestId(testID).props.value).toBe(value);
  }
}

test.each([
  ['weight', '3.5'],
  ['distance', '7.5'],
] as const)('preserves decimal editing for %s', async (field, expected) => {
  const screen = await render(<SetFieldInputsHarness />);
  const testID = `set-${field}`;

  await enterKeySequence(screen, testID, [expected[0], `${expected[0]}.`, expected]);

  expect(screen.getByTestId(testID).props.value).toBe(expected);
  await act(async () => fireEvent(screen.getByTestId(testID), 'blur'));
  expect(screen.getByTestId(testID).props.value).toBe(expected);
});

test.each([
  ['reps', '4'],
  ['duration', '5'],
] as const)('rejects decimal text immediately for %s', async (field, integer) => {
  const screen = await render(<SetFieldInputsHarness />);
  const testID = `set-${field}`;

  await enterKeySequence(screen, testID, [integer]);
  await act(async () => fireEvent.changeText(screen.getByTestId(testID), `${integer}.`));
  expect(screen.getByTestId(testID).props.value).toBe(integer);

  await act(async () => fireEvent.changeText(screen.getByTestId(testID), `${integer}.5`));
  expect(screen.getByTestId(testID).props.value).toBe(integer);
});
