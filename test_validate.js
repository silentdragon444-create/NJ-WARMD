import { validateRecord, checkBillCompliance } from './validate.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name}`);
    console.log(`        ${e.message}`);
    failed++;
  }
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

const sampleRecord = {
  record_id: 'WWTP_09_20250415_NDM_1',
  site_id: 'WWTP_09',
  site_type: 'WWTP',
  county: 'Essex',
  municipality: 'Newark',
  lat: 40.7128,
  lng: -74.1345,
  sample_date: '2025-04-15',
  device_type: 'PCR',
  device_id: 'Well_A1',
  target_gene: 'NDM-1',
  aro_number: 'ARO:3000589',
  canonical_name: 'NDM-1',
  drug_class: 'carbapenem',
  mechanism: 'antibiotic inactivation',
  detected: true,
  detection_status: 'CONFIRMED',
  ct_value: 22.5,
  concentration: 12500,
  concentration_unit: 'COPIES_PER_ML',
  confidence_score: 0.99,
  raw_target_name: 'NDM-1',
  raw_device_fields: '{}',
  submitted_by: 'test',
  upload_timestamp: '2025-04-15T12:00:00Z',
  normalization_timestamp: '2025-04-15T12:00:00Z',
  validation_status: null,
  validation_flags: [],
  compliance_status: null,
  compliance_note: null,
  clearance_achieved: null,
  data_quality_flag: 'PASS',
};

console.log('\n=== validateRecord Tests ===\n');

test('ACCETPED: valid record with no history', () => {
  const result = validateRecord(sampleRecord, []);
  assertEqual(result.status, 'ACCEPTED', 'status');
  assertEqual(result.valid, true, 'valid');
  assertEqual(result.flags.length, 0, 'no flags');
});

test('REJECTED: null record', () => {
  const result = validateRecord(null, []);
  assertEqual(result.status, 'REJECTED', 'status');
  assertEqual(result.valid, false, 'valid');
});

test('REJECTED: missing record_id', () => {
  const r = { ...sampleRecord, record_id: '' };
  const result = validateRecord(r, []);
  assertEqual(result.status, 'REJECTED', 'status');
  assertEqual(result.flags.includes('MISSING_RECORD_ID'), true, 'flag present');
});

test('REJECTED: invalid sample date', () => {
  const r = { ...sampleRecord, sample_date: 'not-a-date' };
  const result = validateRecord(r, []);
  assertEqual(result.status, 'REJECTED', 'status');
  assertEqual(result.flags.includes('INVALID_SAMPLE_DATE'), true, 'flag present');
});

test('REJECTED: CT out of range', () => {
  const r = { ...sampleRecord, ct_value: 50 };
  const result = validateRecord(r, []);
  assertEqual(result.status, 'REJECTED', 'status');
  assertEqual(result.flags.includes('CT_OUT_OF_RANGE'), true, 'flag present');
});

test('REJECTED: Malformed site registry data (missing lat)', () => {
  const r = { ...sampleRecord, lat: undefined };
  const result = validateRecord(r, []);
  assertEqual(result.status, 'REJECTED', 'status');
  assertEqual(result.flags.includes('MALFORMED_SITE_REGISTRY_DATA'), true, 'flag present');
});

test('FLAGGED: outlier high concentration', () => {
  const priorRecords = [];
  for (let i = 0; i < 6; i++) {
    priorRecords.push({
      ...sampleRecord,
      record_id: `prior_${i}`,
      concentration: 100 + Math.random() * 50,
    });
  }
  const outlierRecord = { ...sampleRecord, record_id: 'outlier', concentration: 50000 };
  const result = validateRecord(outlierRecord, priorRecords);
  assertEqual(result.status, 'FLAGGED', 'status');
  assertEqual(result.flags.includes('OUTLIER_HIGH_CONCENTRATION'), true, 'outlier flag');
  assertEqual(result.record.validation_status, 'FLAGGED', 'validation_status set');
});

test('ACCEPTED: borderline concentration (no outlier)', () => {
  const priorRecords = [];
  for (let i = 0; i < 6; i++) {
    priorRecords.push({ ...sampleRecord, record_id: `prior_${i}`, concentration: 100 + i * 10 });
  }
  const normalRecord = { ...sampleRecord, record_id: 'normal', concentration: 150 };
  const result = validateRecord(normalRecord, priorRecords);
  assertEqual(result.status, 'ACCEPTED', 'status');
});

console.log('\n=== checkBillCompliance Tests ===\n');

test('compliance: returns object', () => {
  const mockCompliance = {
    getSchedulingTier: () => 'monthly',
    hasAchievedClearance: () => false,
    getComplianceStatus: () => 'compliant',
  };
  const result = checkBillCompliance(sampleRecord, [], {}, mockCompliance);
  assertEqual(typeof result.escalationNeeded, 'boolean', 'escalationNeeded');
  assertEqual(typeof result.clearanceAchieved, 'boolean', 'clearanceAchieved');
  assertEqual(typeof result.complianceNote, 'string', 'complianceNote');
});

test('compliance: handles null complianceFunctions', () => {
  const result = checkBillCompliance(sampleRecord, [], {}, null);
  assertEqual(result.escalationNeeded, false, 'graceful failure');
  assertEqual(result.complianceNote, 'Compliance functions not provided', 'note');
});

console.log('\n=== NaN Edge Case Tests ===\n');

test('REJECTED: NaN ct_value passes through as valid range (BUG FIX)', () => {
  const r = { ...sampleRecord, ct_value: NaN };
  const result = validateRecord(r, []);
  assertEqual(result.status, 'REJECTED', 'status');
  assertEqual(result.flags.includes('CT_OUT_OF_RANGE'), true, 'NaN ct rejected');
});

test('REJECTED: NaN concentration rejected', () => {
  const r = { ...sampleRecord, concentration: NaN };
  const result = validateRecord(r, []);
  assertEqual(result.status, 'REJECTED', 'status');
  assertEqual(result.flags.includes('NEGATIVE_CONCENTRATION'), true, 'NaN concentration rejected');
});

test('REJECTED: NaN confidence_score rejected', () => {
  const r = { ...sampleRecord, confidence_score: NaN };
  const result = validateRecord(r, []);
  assertEqual(result.status, 'REJECTED', 'status');
  assertEqual(result.flags.includes('CONFIDENCE_OUT_OF_RANGE'), true, 'NaN confidence rejected');
});

console.log('\n=== Deterministic Outlier Test ===\n');

test('FLAGGED: outlier with deterministic prior values', () => {
  const priorRecords = [];
  for (let i = 0; i < 6; i++) {
    priorRecords.push({
      ...sampleRecord,
      record_id: `prior_${i}`,
      concentration: 100, // all same value = stddev 0
    });
  }
  // With stddev=0, any concentration > 100 should be flagged
  const outlierRecord = { ...sampleRecord, record_id: 'outlier', concentration: 200 };
  const result = validateRecord(outlierRecord, priorRecords);
  assertEqual(result.status, 'FLAGGED', 'status');
  assertEqual(result.flags.includes('OUTLIER_HIGH_CONCENTRATION'), true, 'outlier flag');
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
