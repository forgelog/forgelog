import type { DatabaseExecutor } from '../executor';
import { id } from '../id';
import {
  BODYWEIGHT_MAX_KG,
  BODYWEIGHT_MIN_KG,
  validateNumber,
} from '../../validation/numericInput';

export type MeasurementDimension = 'mass' | 'percentage' | 'length';

export type CurrentMeasurement = {
  id: string;
  name: string;
  dimension: MeasurementDimension;
  canonicalUnit: 'kg' | '%' | 'cm';
  position: number;
  current: {
    id: string;
    canonicalValue: number;
    measuredAt: string;
    notes: string | null;
  } | null;
};

export type RecordMeasurementsInput = {
  measuredAt: string;
  values: {
    measurementTypeId: string;
    canonicalValue: number;
    notes?: string | null;
  }[];
};

type CurrentMeasurementRow = {
  type_id: string;
  type_name: string;
  dimension: MeasurementDimension;
  canonical_unit: 'kg' | '%' | 'cm';
  position: number;
  measurement_id: string | null;
  canonical_value: number | null;
  measured_at: string | null;
  notes: string | null;
};

export async function listCurrentMeasurements(db: DatabaseExecutor): Promise<CurrentMeasurement[]> {
  const rows = await db.getAllAsync<CurrentMeasurementRow>(
    `
      SELECT
        types.id AS type_id,
        types.name AS type_name,
        types.dimension,
        types.canonical_unit,
        types.position,
        latest.id AS measurement_id,
        latest.canonical_value,
        latest.measured_at,
        latest.notes
      FROM measurement_types AS types
      LEFT JOIN measurements AS latest
        ON latest.rowid = (
          SELECT candidate.rowid
          FROM measurements AS candidate
          WHERE candidate.measurement_type_id = types.id
            AND (
              candidate.measurement_type_id != 'bodyweight'
              OR candidate.canonical_value BETWEEN $minBodyweightKg AND $maxBodyweightKg
            )
          ORDER BY candidate.measured_at DESC, candidate.created_at DESC, candidate.rowid DESC
          LIMIT 1
        )
      ORDER BY types.position
    `,
    {
      $minBodyweightKg: BODYWEIGHT_MIN_KG,
      $maxBodyweightKg: BODYWEIGHT_MAX_KG,
    }
  );

  return rows.map((row) => ({
    id: row.type_id,
    name: row.type_name,
    dimension: row.dimension,
    canonicalUnit: row.canonical_unit,
    position: row.position,
    current:
      row.measurement_id === null || row.canonical_value === null || row.measured_at === null
        ? null
        : {
            id: row.measurement_id,
            canonicalValue: row.canonical_value,
            measuredAt: row.measured_at,
            notes: row.notes,
          },
  }));
}

export async function recordMeasurements(
  db: DatabaseExecutor,
  input: RecordMeasurementsInput
): Promise<void> {
  validateMeasuredAt(input.measuredAt);

  const seenTypes = new Set<string>();
  for (const value of input.values) {
    if (!Number.isFinite(value.canonicalValue) || value.canonicalValue < 0) {
      throw new Error('Measurement values must be zero or greater.');
    }
    if (value.measurementTypeId === 'bodyweight') {
      const result = validateNumber(value.canonicalValue, {
        min: BODYWEIGHT_MIN_KG,
        max: BODYWEIGHT_MAX_KG,
        fieldLabel: 'Bodyweight',
      });
      if (result.error) throw new Error(result.error);
    }
    if (seenTypes.has(value.measurementTypeId)) {
      throw new Error('Each measurement type can only be recorded once.');
    }
    seenTypes.add(value.measurementTypeId);

    const type = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM measurement_types WHERE id = $id',
      { $id: value.measurementTypeId }
    );
    if (!type) throw new Error('Measurement type not found.');

    await db.runAsync(
      `INSERT INTO measurements
         (id, measurement_type_id, canonical_value, measured_at, notes)
       VALUES ($id, $typeId, $canonicalValue, $measuredAt, $notes)`,
      {
        $id: id(),
        $typeId: value.measurementTypeId,
        $canonicalValue: value.canonicalValue,
        $measuredAt: input.measuredAt,
        $notes: value.notes?.trim() || null,
      }
    );
  }

  if (seenTypes.has('bodyweight')) {
    await syncProfileBodyweightFromMeasurements(db);
  }
}

async function syncProfileBodyweightFromMeasurements(db: DatabaseExecutor): Promise<void> {
  await db.runAsync(
    `
      UPDATE profile
         SET bodyweight_kg = (
           SELECT canonical_value
             FROM measurements
            WHERE measurement_type_id = 'bodyweight'
              AND canonical_value BETWEEN $minBodyweightKg AND $maxBodyweightKg
            ORDER BY measured_at DESC, created_at DESC, rowid DESC
            LIMIT 1
         )
       WHERE id = 0
    `,
    {
      $minBodyweightKg: BODYWEIGHT_MIN_KG,
      $maxBodyweightKg: BODYWEIGHT_MAX_KG,
    }
  );
}

// todo: can we avoid this by using Date type?
function validateMeasuredAt(measuredAt: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(measuredAt)) {
    throw new Error('Measurement date is invalid.');
  }
  const [year, month, day] = measuredAt.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    throw new Error('Measurement date is invalid.');
  }
  const today = new Date();
  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  if (measuredAt > todayKey) {
    throw new Error('Measurement date cannot be in the future.');
  }
}
