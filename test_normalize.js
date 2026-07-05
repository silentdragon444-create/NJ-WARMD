import { normalizeRecord, normalizeBatch, NormalizationError } from './normalize.js';

const uploadMeta = { submittedBy: 'test_user', uploadTimestamp: '2025-06-15T10:00:00Z' };

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

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertApprox(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ~${expected}, got ${actual}`);
  }
}

function assertTruthy(val, label) {
  if (!val) throw new Error(`${label}: expected truthy, got ${val}`);
}

function assertFalsy(val, label) {
  if (val) throw new Error(`${label}: expected falsy, got ${val}`);
}

console.log('\n=== normalizeRecord Tests ===\n');

// Test 1: PCR with low CT (confirmed detection)
test('PCR: confirmed detection (CT < 30)', () => {
  const row = {
    Well: 'A1',
    SampleName: 'WWTP_09_ESSEX_NJ-2025-04-15',
    TargetName: 'NDM-1',
    CT: '22.5',
    CTMean: '23.1',
    CTSD: '0.5',
    Quantity: '5400',
    QuantityMean: '5200',
  };
  const result = normalizeRecord(row, 'PCR', uploadMeta);
  assertEqual(result.detected, true, 'detected');
  assertEqual(result.detection_status, 'CONFIRMED', 'detection_status');
  assertEqual(result.target_gene, 'NDM-1', 'target_gene');
  assertEqual(result.site_id, 'WWTP_09', 'site_id');
  assertEqual(result.concentration_unit, 'COPIES_PER_ML', 'concentration_unit');
  assertApprox(result.confidence_score, 0.9, 0.01, 'confidence_score');
  assertEqual(result.device_type, 'PCR', 'device_type');
});

// Test 2: PCR with high CT (not detected)
test('PCR: not detected (CT > 40)', () => {
  const row = {
    Well: 'B2',
    SampleName: 'WWTP_01_BERGEN_NJ-2025-06-01',
    TargetName: 'mecA',
    CT: '41.2',
    CTMean: '42.0',
    CTSD: '1.2',
    Quantity: '0',
    QuantityMean: '0',
  };
  const result = normalizeRecord(row, 'PCR', uploadMeta);
  assertEqual(result.detected, false, 'detected');
  assertEqual(result.detection_status, 'NOT_DETECTED', 'detection_status');
  assertEqual(result.target_gene, 'mecA', 'target_gene');
});

// Test 3: PCR with CT 30-35 (probable)
test('PCR: probable detection (CT 30-35)', () => {
  const row = {
    Well: 'C3',
    SampleName: 'HOSPITAL_01_BERGEN_NJ-2025-03-10',
    TargetName: 'CTX-M-15',
    CT: '32.8',
    CTMean: '33.1',
    CTSD: '2.0',
    Quantity: '120',
    QuantityMean: '115',
  };
  const result = normalizeRecord(row, 'PCR', uploadMeta);
  assertEqual(result.detected, true, 'detected');
  assertEqual(result.detection_status, 'PROBABLE', 'detection_status');
});

// Test 4: PCR — error: missing CT
test('PCR: error on missing CT', () => {
  const row = {
    Well: 'D4',
    SampleName: 'WWTP_01_BERGEN_NJ-2025-06-01',
    TargetName: 'KPC-2',
  };
  let threw = false;
  try {
    normalizeRecord(row, 'PCR', uploadMeta);
  } catch (e) {
    threw = true;
    assertEqual(e.name, 'NormalizationError', 'error type');
  }
  assertEqual(threw, true, 'should throw');
});

// Test 5: PCR — error: bad site ID pattern
test('PCR: error on malformed site ID', () => {
  const row = {
    Well: 'E5',
    SampleName: 'bad-sample-name',
    TargetName: 'KPC-2',
    CT: '25.0',
    CTMean: '25.5',
    CTSD: '0.3',
    Quantity: '1000',
    QuantityMean: '950',
  };
  let threw = false;
  try {
    normalizeRecord(row, 'PCR', uploadMeta);
  } catch (e) {
    threw = true;
    assertEqual(e.name, 'NormalizationError', 'error type');
  }
  assertEqual(threw, true, 'should throw');
});

// Test 6: PCR — error: unrecognized target
test('PCR: error on unrecognized target', () => {
  const row = {
    Well: 'F6',
    SampleName: 'WWTP_01_BERGEN_NJ-2025-06-01',
    TargetName: 'NONEXISTENT_GENE_XYZ',
    CT: '25.0',
    CTMean: '25.5',
    CTSD: '0.3',
    Quantity: '1000',
    QuantityMean: '950',
  };
  let threw = false;
  try {
    normalizeRecord(row, 'PCR', uploadMeta);
  } catch (e) {
    threw = true;
    assertEqual(e.name, 'NormalizationError', 'error type');
  }
  assertEqual(threw, true, 'should throw');
});

// Test 7: Biosensor detection
test('BIOSENSOR: detection confirmed', () => {
  const row = {
    SampleName: 'WWTP_09_ESSEX_NJ-2025-04-15',
    TargetName: 'NDM-1',
    Fluorescence: '8500',
    BlankFluorescence: '120',
    ThresholdCycle: '28',
    ReadTime: '30',
  };
  const result = normalizeRecord(row, 'BIOSENSOR', uploadMeta);
  assertEqual(result.detected, true, 'detected');
  assertEqual(result.detection_status, 'CONFIRMED', 'detection_status');
  assertEqual(result.concentration_unit, 'RFU', 'concentration_unit');
});

// Test 8: Metagenomics detection
test('METAGENOMICS: detection confirmed', () => {
  const row = {
    SampleName: 'WWTP_01_BERGEN_NJ-2025-06-01',
    GeneName: 'KPC-3',
    ReadCount: '450',
    TotalReads: '5000000',
    CoverageDepth: '35.2',
    AvgMapQuality: '55',
  };
  const result = normalizeRecord(row, 'METAGENOMICS', uploadMeta);
  assertEqual(result.detected, true, 'detected');
  assertEqual(result.concentration_unit, 'RPM', 'concentration_unit');
  assertApprox(result.concentration, 90, 1, 'rpm concentration');
});

// Test 9: Microfluidic detection
test('MICROFLUIDIC: detection confirmed', () => {
  const row = {
    SampleName: 'WWTP_01_BERGEN_NJ-2025-06-01',
    TargetName: 'vanA',
    PositiveDroplets: '35',
    TotalDroplets: '20000',
    EndpointFluorescence: '5200',
    ChannelID: 'CH1',
  };
  const result = normalizeRecord(row, 'MICROFLUIDIC', uploadMeta);
  assertEqual(result.detected, true, 'detected');
  assertEqual(result.concentration_unit, 'COPIES_PER_ML', 'concentration_unit');
  assertEqual(result.device_id, 'CH1', 'device_id');
});

// Test 10: Error on invalid deviceType
test('Error on invalid deviceType', () => {
  const row = { SampleName: 'test', TargetName: 'KPC-2', CT: '25' };
  let threw = false;
  try {
    normalizeRecord(row, 'INVALID_TYPE', uploadMeta);
  } catch (e) {
    threw = true;
    assertEqual(e.name, 'NormalizationError', 'error type');
  }
  assertEqual(threw, true, 'should throw');
});

console.log('\n=== normalizeBatch Tests ===\n');

// Test 11: Batch processes mixed success/failure
test('normalizeBatch: mixed results', () => {
  const rows = [
    { Well: 'A1', SampleName: 'WWTP_01_BERGEN_NJ-2025-06-01', TargetName: 'KPC-2', CT: '22.0', CTMean: '22.5', CTSD: '0.4', Quantity: '5000', QuantityMean: '4800' },
    { Well: 'B1', SampleName: 'WWTP_01_BERGEN_NJ-2025-06-01', TargetName: 'NONEXISTENT', CT: '25.0', CTMean: '25.5', CTSD: '0.3', Quantity: '1000', QuantityMean: '950' },
    { Well: 'C1', SampleName: 'bad-site', TargetName: 'KPC-2', CT: '23.0', CTMean: '23.5', CTSD: '0.5', Quantity: '3000', QuantityMean: '2900' },
  ];
  const result = normalizeBatch(rows, 'PCR', uploadMeta);
  assertEqual(result.stats.total, 3, 'total');
  assertEqual(result.stats.succeeded, 1, 'succeeded');
  assertEqual(result.stats.failed, 2, 'failed');
  assertEqual(result.records.length, 1, 'records length');
  assertEqual(result.errors.length, 2, 'errors length');
});

// Test 12: Batch empty input
test('normalizeBatch: empty input', () => {
  const result = normalizeBatch([], 'PCR', uploadMeta);
  assertEqual(result.stats.total, 0, 'total');
  assertEqual(result.stats.succeeded, 0, 'succeeded');
  assertEqual(result.stats.failed, 0, 'failed');
});

// Test 13: Batch with null uploadMeta
test('normalizeBatch: null uploadMeta', () => {
  const rows = [{ Well: 'A1', SampleName: 'WWTP_01_BERGEN_NJ-2025-06-01', TargetName: 'KPC-2', CT: '22.0', CTMean: '22.5', CTSD: '0.4', Quantity: '5000', QuantityMean: '4800' }];
  const result = normalizeBatch(rows, 'PCR', null);
  assertEqual(result.stats.failed, 1, 'should fail');
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

// === Additional Tests ===

console.log('\n=== SURFACE_WATER Tests ===\n');

// Test 14: SURFACE_WATER site ID extraction (verifies regex fix)
test('SURFACE_WATER: correct site ID extraction', () => {
  const row = {
    Well: 'A1',
    SampleName: 'SURFACE_WATER_01_PASSAIC_NJ-2025-04-15',
    TargetName: 'KPC-2',
    CT: '25.0',
    CTMean: '25.5',
    CTSD: '0.3',
    Quantity: '3000',
    QuantityMean: '2900',
  };
  const result = normalizeRecord(row, 'PCR', uploadMeta);
  assertEqual(result.site_id, 'SURFACE_WATER_01', 'site_id');
  assertEqual(result.sample_date, '2025-04-15', 'sample_date');
  assertEqual(result.detected, true, 'detected');
});

test('SURFACE_WATER_08: correct site ID extraction', () => {
  const row = {
    Well: 'B2',
    SampleName: 'SURFACE_WATER_08_MERCER_NJ-2025-06-01',
    TargetName: 'NDM-1',
    CT: '28.5',
    CTMean: '29.0',
    CTSD: '0.5',
    Quantity: '800',
    QuantityMean: '750',
  };
  const result = normalizeRecord(row, 'PCR', uploadMeta);
  assertEqual(result.site_id, 'SURFACE_WATER_08', 'site_id');
  assertEqual(result.sample_date, '2025-06-01', 'sample_date');
});

console.log('\n=== Detected Flag Fix Tests ===\n');

// Test 15: BORDERLINE detection (CT 35-40 should be detected=true)
test('PCR: borderline detection (CT 35-39) should be detected=true', () => {
  const row = {
    Well: 'C3',
    SampleName: 'WWTP_09_ESSEX_NJ-2025-04-15',
    TargetName: 'CTX-M-15',
    CT: '38.5',
    CTMean: '39.0',
    CTSD: '1.0',
    Quantity: '15',
    QuantityMean: '14',
  };
  const result = normalizeRecord(row, 'PCR', uploadMeta);
  assertEqual(result.detected, true, 'detected should be true for CT 38.5');
  assertEqual(result.detection_status, 'BORDERLINE', 'detection_status');
});

test('PCR: CT exactly 40 should be NOT_DETECTED', () => {
  const row = {
    Well: 'D4',
    SampleName: 'WWTP_09_ESSEX_NJ-2025-04-15',
    TargetName: 'CTX-M-15',
    CT: '40.0',
    CTMean: '40.5',
    CTSD: '1.0',
    Quantity: '0',
    QuantityMean: '0',
  };
  const result = normalizeRecord(row, 'PCR', uploadMeta);
  assertEqual(result.detected, false, 'detected should be false for CT 40');
  assertEqual(result.detection_status, 'NOT_DETECTED', 'detection_status');
});

console.log('\n=== Fuzzy Match Tests ===\n');

// Test 16: Fuzzy match - close variant of a known target
test('PCR: fuzzy match tolerates minor typos', () => {
  const row = {
    Well: 'E5',
    SampleName: 'WWTP_01_BERGEN_NJ-2025-06-01',
    TargetName: 'KPC2',
    CT: '25.0',
    CTMean: '25.5',
    CTSD: '0.3',
    Quantity: '1000',
    QuantityMean: '950',
  };
  const result = normalizeRecord(row, 'PCR', uploadMeta);
  assertEqual(result.detected, true, 'detected');
  assertEqual(result.target_gene, 'KPC-2', 'fuzzy matched to KPC-2');
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
