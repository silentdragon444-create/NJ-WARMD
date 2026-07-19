const DEVICE_TYPES = ['PCR', 'BIOSENSOR', 'METAGENOMICS', 'MICROFLUIDIC'];

const VALID_DETECTION_STATUSES = ['CONFIRMED', 'PROBABLE', 'BORDERLINE', 'NOT_DETECTED'];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stddev(arr, m) {
  if (arr.length < 2) return 0;
  const sqDiffs = arr.map(v => (v - m) ** 2);
  return Math.sqrt(sqDiffs.reduce((s, v) => s + v, 0) / (arr.length - 1));
}

export function validateRecord(record, siteHistory) {
  const flags = [];
  const issues = [];

  if (record === null || record === undefined || typeof record !== 'object') {
    return { valid: false, status: 'REJECTED', flags: ['NULL_RECORD'], record };
  }

  if (!record.record_id) {
    issues.push('MISSING_RECORD_ID');
  }

  if (!record.site_id) {
    issues.push('MISSING_SITE_ID');
  }

  if (!record.site_type || !record.county || !record.municipality || typeof record.lat !== 'number' || typeof record.lng !== 'number') {
    issues.push('MALFORMED_SITE_REGISTRY_DATA');
  }

  if (!record.sample_date || isNaN(Date.parse(record.sample_date))) {
    issues.push('INVALID_SAMPLE_DATE');
  }

  if (!DEVICE_TYPES.includes(record.device_type)) {
    issues.push('INVALID_DEVICE_TYPE');
  }

  if (!VALID_DETECTION_STATUSES.includes(record.detection_status)) {
    issues.push('INVALID_DETECTION_STATUS');
  }

  if (issues.length > 0) {
    return { valid: false, status: 'REJECTED', flags: issues, record };
  }

  if (record.ct_value !== null && record.ct_value !== undefined) {
    if (typeof record.ct_value !== 'number' || isNaN(record.ct_value) || record.ct_value < 0 || record.ct_value > 45) {
      issues.push('CT_OUT_OF_RANGE');
    }
  }

  if (record.concentration !== null && record.concentration !== undefined) {
    if (typeof record.concentration !== 'number' || isNaN(record.concentration) || record.concentration < 0) {
      issues.push('NEGATIVE_CONCENTRATION');
    }
  }

  if (record.confidence_score === null || record.confidence_score === undefined || typeof record.confidence_score !== 'number' || isNaN(record.confidence_score) || record.confidence_score < 0 || record.confidence_score > 1) {
    issues.push('CONFIDENCE_OUT_OF_RANGE');
  }

  if (issues.length > 0) {
    return { valid: false, status: 'REJECTED', flags: issues, record };
  }

  // outlier detection flags but does not reject, keeping the record in for human review
  if (record.detected === true && record.concentration > 0) {
    const priorDetections = (siteHistory || []).filter(r => r.detected === true && r.concentration > 0);
    if (priorDetections.length >= 5) {
      const values = priorDetections.map(r => r.concentration);
      const m = mean(values);
      const sd = stddev(values, m);
      const threshold = m + 3 * sd;
      if (record.concentration > threshold) {
        flags.push('OUTLIER_HIGH_CONCENTRATION');
      }
    }
  }

  const status = flags.length > 0 ? 'FLAGGED' : 'ACCEPTED';

  const updatedRecord = { ...record, validation_flags: flags, validation_status: status };

  return { valid: true, status, flags, record: updatedRecord };
}

export function checkBillCompliance(record, siteHistory, siteRegistryObj, complianceFunctions) {
  if (!complianceFunctions) {
    return { escalationNeeded: false, clearanceAchieved: false, performanceCompliant: null, complianceNote: 'Compliance functions not provided' };
  }

  const { getSchedulingTier, hasAchievedClearance, getComplianceStatus } = complianceFunctions;
  const siteId = record.site_id;
  const allRecords = [...(siteHistory || []), record];

  let escalationNeeded = false;
  try {
    const currentTier = getSchedulingTier(siteId, siteHistory || []);
    const newTier = getSchedulingTier(siteId, allRecords);
    escalationNeeded = newTier === 'weekly' && currentTier === 'monthly';
  } catch (e) {
    // swallow — compliance check must not crash the upload pipeline
  }

  let clearanceAchieved = false;
  try {
    clearanceAchieved = hasAchievedClearance(siteId, allRecords);
  } catch (e) {
    // swallow
  }

  let performanceCompliant = null;
  try {
    const status = getComplianceStatus(siteId, allRecords, siteRegistryObj);
    performanceCompliant = status === 'compliant' || status === 'borderline';
  } catch (e) {
    // swallow
  }

  let complianceNote = '';
  if (clearanceAchieved) {
    complianceNote = 'Site has achieved 90-day clearance with zero detections.';
  } else if (escalationNeeded) {
    complianceNote = 'New detection rate triggers escalation to weekly monitoring.';
  } else if (performanceCompliant === false) {
    complianceNote = 'Detection rate exceeds 10% performance standard.';
  } else {
    complianceNote = 'Site is compliant with current monitoring requirements.';
  }

  return { escalationNeeded, clearanceAchieved, performanceCompliant, complianceNote };
}
