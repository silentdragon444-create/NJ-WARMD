# Data Contracts — NJ WARMD Pipeline

This document defines every exported function signature, parameter type, return type, and error shape for `normalize.js`, `validate.js`, and `data.js`. Build your UI against these interfaces.

---

## normalize.js

### normalizeRecord(rawRow, deviceType, uploadMeta)

Normalizes a single raw device record into a canonical record object.

| Param | Type | Description |
|-------|------|-------------|
| `rawRow` | `object` | Plain object from Papa Parse (CSV) output. Fields vary by deviceType. |
| `deviceType` | `string` | One of: `'PCR'`, `'BIOSENSOR'`, `'METAGENOMICS'`, `'MICROFLUIDIC'` |
| `uploadMeta` | `object` | `{ submittedBy: string, uploadTimestamp: ISO string }` |

**Returns:** `CanonicalRecord` (see below).

**Throws:** `NormalizationError` if the record cannot be normalized (invalid field, unrecognized target, missing site ID).

**Error shape:**
```js
{
  name: 'NormalizationError',
  message: 'descriptive string',
  field: 'TargetName',       // the field that caused the error
  row: { /* original rawRow */ },
  deviceType: 'PCR'
}
```

---

### normalizeBatch(rawRows, deviceType, uploadMeta)

Batch-processes an array of raw rows. Never throws — collects errors per-row.

| Param | Type | Description |
|-------|------|-------------|
| `rawRows` | `Array<object>` | Array of raw row objects |
| `deviceType` | `string` | One of `'PCR'` | `'BIOSENSOR'` | `'METAGENOMICS'` | `'MICROFLUIDIC'` |
| `uploadMeta` | `object` | `{ submittedBy: string, uploadTimestamp: ISO string }` |

**Returns:**
```js
{
  records: [ /* CanonicalRecord[] — successfully normalized */ ],
  errors: [
    {
      row: { /* original raw row */ },
      rowIndex: 2,
      error: 'error message string',
      field: 'TargetName'   // or null
    }
  ],
  stats: {
    total: 100,
    succeeded: 97,
    failed: 3
  }
}
```

---

### CanonicalRecord Shape

Full 32-field schema that all parsers produce:

```js
{
  // Core identifiers (7)
  record_id: string,           // e.g. "WWTP_09_20250415_NDM_1_1"
  site_id: string,             // e.g. "WWTP_09" (matches siteRegistry key)
  site_type: string,           // "WWTP" | "HOSPITAL" | "SURFACE_WATER" | "AGRICULTURAL"
  county: string,
  municipality: string,
  lat: number,
  lng: number,

  // Sample metadata (4)
  sample_date: string,         // "YYYY-MM-DD"
  device_type: string,         // "PCR" | "BIOSENSOR" | "METAGENOMICS" | "MICROFLUIDIC"
  device_id: string,           // e.g. "Well_A1", "CH1", or ""
  submitted_by: string,        // from uploadMeta

  // Target identification (5)
  target_gene: string,         // canonical gene name from ARO lookup
  aro_number: string,          // e.g. "ARO:3000589"
  canonical_name: string,      // full name
  drug_class: string,          // e.g. "carbapenem;cephalosporin;penicillin beta-lactam"
  mechanism: string,           // e.g. "antibiotic inactivation"

  // Detection results (6)
  detected: boolean,
  detection_status: string,    // "CONFIRMED" | "PROBABLE" | "BORDERLINE" | "NOT_DETECTED"
  ct_value: number | null,     // PCR only, null for other device types
  concentration: number,       // device-dependent units
  concentration_unit: string,  // "COPIES_PER_ML" | "RFU" | "RPM"
  confidence_score: number,    // 0.0 – 1.0

  // Raw data (2)
  raw_target_name: string,     // original unparsed target name from device
  raw_device_fields: string,   // JSON string of original row

  // Provenance (3)
  upload_timestamp: string,    // ISO string
  normalization_timestamp: string, // ISO string
  data_quality_flag: string,   // "PASS" | "WARN"

  // Validation (set by validate.js, null before validation) (5)
  validation_status: string | null,    // "ACCEPTED" | "FLAGGED" | "REJECTED" | null
  validation_flags: string[],          // e.g. ["OUTLIER_HIGH_CONCENTRATION"]

  // Compliance (set by checkBillCompliance) (4)
  compliance_status: string | null,    // "compliant" | "borderline" | "non_compliant" | null
  compliance_note: string | null,
  clearance_achieved: boolean | null,
}
```

---

### Device-Specific Raw Row Formats

#### PCR
```csv
Well,SampleName,TargetName,CT,CTMean,CTSD,Quantity,QuantityMean
A1,WWTP_09-2025-04-15,NDM-1,22.5,23.1,0.5,5400,5200
```

#### BIOSENSOR
```csv
SampleName,TargetName,Fluorescence,BlankFluorescence,ThresholdCycle,ReadTime
WWTP_09-2025-04-15,NDM-1,8500,120,28,30
```

#### METAGENOMICS
```csv
SampleName,GeneName,ReadCount,TotalReads,CoverageDepth,AvgMapQuality
WWTP_09-2025-04-15,NDM-1,450,5000000,35.2,55
```

#### MICROFLUIDIC
```csv
SampleName,TargetName,PositiveDroplets,TotalDroplets,EndpointFluorescence,ChannelID
WWTP_09-2025-04-15,NDM-1,35,20000,5200,CH1
```

**SampleName format:** `{SITE_ID}-{YYYY-MM-DD}` or `{SITE_ID}_{extra}-{YYYY-MM-DD}` where `SITE_ID` matches a key in `siteRegistry` (e.g., `WWTP_09`, `HOSPITAL_01`, `SURFACE_WATER_03`).

---

## validate.js

### validateRecord(record, siteHistory)

Validates a single canonical record against structural, range, and outlier checks.

| Param | Type | Description |
|-------|------|-------------|
| `record` | `CanonicalRecord` | A record from normalize.js |
| `siteHistory` | `Array<CanonicalRecord>` | All previous records for the same `site_id` |

**Returns:**
```js
{
  valid: boolean,          // false if REJECTED, true if ACCEPTED or FLAGGED
  status: string,          // "ACCEPTED" | "FLAGGED" | "REJECTED"
  flags: string[],         // e.g. ["OUTLIER_HIGH_CONCENTRATION", "MISSING_SITE_ID"]
  record: CanonicalRecord  // updated with validation_status and validation_flags
}
```

**Flag strings:**
| Flag | Severity | Meaning |
|------|----------|---------|
| `MISSING_RECORD_ID` | REJECTED | record_id is empty |
| `MISSING_SITE_ID` | REJECTED | site_id is empty |
| `INVALID_SAMPLE_DATE` | REJECTED | sample_date is not parseable |
| `INVALID_DEVICE_TYPE` | REJECTED | device_type not in valid set |
| `INVALID_DETECTION_STATUS` | REJECTED | detection_status not in valid set |
| `CT_OUT_OF_RANGE` | REJECTED | ct_value < 0 or > 45 |
| `NEGATIVE_CONCENTRATION` | REJECTED | concentration < 0 |
| `CONFIDENCE_OUT_OF_RANGE` | REJECTED | confidence_score outside [0,1] |
| `OUTLIER_HIGH_CONCENTRATION` | FLAGGED | concentration > 3σ above site history mean |
| `NULL_RECORD` | REJECTED | record is null or undefined |

---

### checkBillCompliance(record, siteHistory, siteRegistry, complianceFunctions)

Checks bill compliance requirements for a site after adding a new record.

| Param | Type | Description |
|-------|------|-------------|
| `record` | `CanonicalRecord` | The new record |
| `siteHistory` | `Array<CanonicalRecord>` | Previous records for same site |
| `siteRegistry` | `object` | The siteRegistry from site_registry.js |
| `complianceFunctions` | `object` | `{ getSchedulingTier, hasAchievedClearance, getComplianceStatus }` from compliance.js |

**Returns:**
```js
{
  escalationNeeded: boolean,   // true if tier changed monthly -> weekly
  clearanceAchieved: boolean,  // true if 90 consecutive days zero detections
  performanceCompliant: boolean | null, // false if detection rate > 10%
  complianceNote: string       // human-readable explanation
}
```

---

## data.js

### syntheticRecords

```js
import { syntheticRecords } from './data.js';
```

A large array (`~30,000` records) of `CanonicalRecord` objects covering 2 years of synthetic monitoring data across all 51 sites. Generated by `synthetic_data.py`.

**Coverage:**
- 20 WWTPs
- 15 Hospitals
- 10 Surface water sites
- 6 Agricultural sites

**Data characteristics:**
- WWTP detection rate: ~42% (base prob 0.5)
- Hospital detection rate: ~12% (base prob 0.15)
- Surface water detection rate: ~21% (base prob 0.25)
- Agricultural detection rate: ~29% (base prob 0.35)
- Summer (Jun-Aug) peak: 1.4× base probability
- Improvement trend: 30% reduction over 2 years
- Concentration: log-normal distribution by site type

**Demo events included:**
1. Carbapenem outbreak (KPC-2, KPC-3, NDM-1, OXA-48) at WWTP_09 (Passaic Valley), April 2025
2. HOSPITAL_01 achieves 90-day clearance, November 2025
3. SURFACE_WATER_01 (Passaic River) spikes with multiple ESBL detections, August 2025
4. mcr-1 (colistin resistance) at AGRICULTURAL_01 (Salem County), June 2025
5. Multi-drug resistant cluster (NDM-1 + mecA + vanA + mcr-1 + CTX-M-15) at WWTP_01 (Bergen), September 2025
6. vanA at AGRICULTURAL_03 (Hunterdon), July 2025
7. Aminoglycoside resistance spike at WWTP_13 (Hackettstown), February 2026

All demo events are guaranteed to be detected=true with confidence 0.98-0.99 and detection_status='CONFIRMED'.

---

## alerts.js

### getAlertForDrugClass(drugClass)

Resolves a drug class string (e.g. `"aminoglycoside antibiotic"`) to the correct alert object by checking if the class contains any of the known alert keys.

| Param | Type | Description |
|-------|------|-------------|
| `drugClass` | `string` | The `drug_class` field from a CanonicalRecord |

**Returns:**
An alert object (with `headline`, `explanation`, `whatToDo`, `severity`) or `null` if no match is found.

---

## Import Paths (for Kunj)

```js
import { aroLookup, aliasIndex } from './lookup.js';
import { siteRegistry } from './site_registry.js';
import { normalizeRecord, normalizeBatch, NormalizationError } from './normalize.js';
import { validateRecord, checkBillCompliance } from './validate.js';
import { syntheticRecords } from './data.js';
import { getSchedulingTier, isOverdue, hasAchievedClearance, getComplianceStatus, getPilotDayStats } from './compliance.js';
import { drugClassAlerts, getAlertForDrugClass } from './alerts.js';
import neuroData from './neuro_data.js';
```
