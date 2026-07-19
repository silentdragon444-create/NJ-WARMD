import { aroLookup, aliasIndex } from './lookup.js';
import { siteRegistry } from './site_registry.js';

const DEVICE_TYPES = ['PCR', 'BIOSENSOR', 'METAGENOMICS', 'MICROFLUIDIC'];

const DETECTION_STATUSES = ['CONFIRMED', 'PROBABLE', 'BORDERLINE', 'NOT_DETECTED'];

const SITE_ID_REGEX = /([A-Z][A-Z_]*_\d+).*?(\d{4}-\d{2}-\d{2})/;

export class NormalizationError extends Error {
  constructor(message, { field, row, deviceType } = {}) {
    super(message);
    this.name = 'NormalizationError';
    this.field = field;
    this.row = row;
    this.deviceType = deviceType;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [i];
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

const fuzzyCache = new Map();

function fuzzyMatchTarget(targetName) {
  const lowerInput = targetName.toLowerCase();
  
  if (fuzzyCache.has(lowerInput)) {
    return fuzzyCache.get(lowerInput);
  }
  
  let bestKey = null;
  let bestDist = Infinity;
  
  for (const key of Object.keys(aroLookup)) {
    const lowerKey = key.toLowerCase();
    
    if (lowerInput === lowerKey) {
      fuzzyCache.set(lowerInput, key);
      return key;
    }
    
    // skip if first two chars both differ — levenshtein would be >= 3 anyway
    if (lowerInput.length >= 3 && lowerKey.length >= 3) {
      if (lowerInput[0] !== lowerKey[0] && lowerInput[1] !== lowerKey[1]) {
        continue;
      }
    }
    
    const dist = levenshtein(lowerInput, lowerKey);
    if (dist < bestDist) {
      bestDist = dist;
      bestKey = key;
      
      if (bestDist === 0) {
        fuzzyCache.set(lowerInput, bestKey);
        return bestKey;
      }
    }
  }
  
  const result = bestDist <= 2 ? bestKey : null;
  fuzzyCache.set(lowerInput, result);
  return result;
}

function resolveTarget(rawName) {
  const trimmed = rawName.trim();
  if (aliasIndex[trimmed]) {
    return aliasIndex[trimmed];
  }
  if (aroLookup[trimmed]) {
    return trimmed;
  }
  const fuzzy = fuzzyMatchTarget(trimmed);
  if (fuzzy) {
    return fuzzy;
  }
  return null;
}

function generateRecordId(siteId, sampleDate, geneName) {
  const dateStr = sampleDate.replace(/[-:]/g, '').split('T')[0];
  const genePart = geneName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
  return `${siteId}_${dateStr}_${genePart}`;
}

function parsePCR(rawRow) {
  const well = rawRow.Well || '';
  const sampleName = (rawRow.SampleName || '').trim();
  const targetName = (rawRow.TargetName || '').trim();
  const ct = parseFloat(rawRow.CT);
  const ctMean = parseFloat(rawRow.CTMean);
  const ctSd = parseFloat(rawRow.CTSD);
  const quantity = parseFloat(rawRow.Quantity);
  const quantityMean = parseFloat(rawRow.QuantityMean);

  if (isNaN(ct)) {
    throw new NormalizationError('Missing or invalid CT value', { field: 'CT', row: rawRow, deviceType: 'PCR' });
  }
  if (!targetName) {
    throw new NormalizationError('Missing TargetName', { field: 'TargetName', row: rawRow, deviceType: 'PCR' });
  }

  const siteMatch = sampleName.match(SITE_ID_REGEX);
  if (!siteMatch) {
    throw new NormalizationError(`SampleName "${sampleName}" does not contain valid site ID pattern`, { field: 'SampleName', row: rawRow, deviceType: 'PCR' });
  }
  const siteId = siteMatch[1];
  const sampleDate = siteMatch[2];

  const canonicalKey = resolveTarget(targetName);
  if (!canonicalKey) {
    throw new NormalizationError(`Unrecognized target "${targetName}": not in ARO lookup`, { field: 'TargetName', row: rawRow, deviceType: 'PCR' });
  }
  const lookupEntry = aroLookup[canonicalKey];

  const detected = ct < 40 && quantity > 0;
  let detectionStatus;
  if (ct < 30) detectionStatus = 'CONFIRMED';
  else if (ct < 35) detectionStatus = 'PROBABLE';
  else if (ct < 40) detectionStatus = 'BORDERLINE';
  else detectionStatus = 'NOT_DETECTED';

  const confidenceScore = clamp(1 - (ctSd / 5), 0, 1);

  return {
    site_id: siteId,
    sample_date: sampleDate,
    device_type: 'PCR',
    device_id: `Well_${well}`,
    target_gene: canonicalKey,
    aro_number: lookupEntry.aro,
    canonical_name: lookupEntry.canonical,
    drug_class: lookupEntry.drugClass,
    mechanism: lookupEntry.mechanism,
    detected,
    detection_status: detectionStatus,
    ct_value: ct,
    concentration: detected ? quantity : 0,
    concentration_unit: 'COPIES_PER_ML',
    confidence_score: confidenceScore,
    raw_target_name: targetName,
    raw_device_fields: JSON.stringify(rawRow),
  };
}

function parseBiosensor(rawRow) {
  const sampleName = (rawRow.SampleName || '').trim();
  const targetName = (rawRow.TargetName || '').trim();
  const fluorescence = parseFloat(rawRow.Fluorescence);
  const blankFluorescence = parseFloat(rawRow.BlankFluorescence);
  const thresholdCycle = parseFloat(rawRow.ThresholdCycle);

  if (isNaN(fluorescence) || isNaN(blankFluorescence)) {
    throw new NormalizationError('Missing or invalid Fluorescence/BlankFluorescence', { field: 'Fluorescence', row: rawRow, deviceType: 'BIOSENSOR' });
  }
  if (!targetName) {
    throw new NormalizationError('Missing TargetName', { field: 'TargetName', row: rawRow, deviceType: 'BIOSENSOR' });
  }

  const siteMatch = sampleName.match(SITE_ID_REGEX);
  if (!siteMatch) {
    throw new NormalizationError(`SampleName "${sampleName}" does not contain valid site ID`, { field: 'SampleName', row: rawRow, deviceType: 'BIOSENSOR' });
  }
  const siteId = siteMatch[1];
  const sampleDate = siteMatch[2];

  const canonicalKey = resolveTarget(targetName);
  if (!canonicalKey) {
    throw new NormalizationError(`Unrecognized target "${targetName}"`, { field: 'TargetName', row: rawRow, deviceType: 'BIOSENSOR' });
  }
  const lookupEntry = aroLookup[canonicalKey];

  const signal = fluorescence - blankFluorescence;
  // threshold = 3x blank is the standard 3-sigma SNR cutoff for fluorescence assays
  const threshold = 3 * blankFluorescence || 10;
  const detected = signal > threshold && (!isNaN(thresholdCycle) ? thresholdCycle < 40 : true);

  let detectionStatus;
  if (!detected) detectionStatus = 'NOT_DETECTED';
  else if (thresholdCycle < 30) detectionStatus = 'CONFIRMED';
  else if (thresholdCycle < 35) detectionStatus = 'PROBABLE';
  else detectionStatus = 'BORDERLINE';

  const confidenceScore = clamp(blankFluorescence > 0 ? signal / (signal + blankFluorescence) : 0.5, 0, 1);

  return {
    site_id: siteId,
    sample_date: sampleDate,
    device_type: 'BIOSENSOR',
    device_id: '',
    target_gene: canonicalKey,
    aro_number: lookupEntry.aro,
    canonical_name: lookupEntry.canonical,
    drug_class: lookupEntry.drugClass,
    mechanism: lookupEntry.mechanism,
    detected,
    detection_status: detectionStatus,
    ct_value: null,
    concentration: detected ? signal : 0,
    concentration_unit: 'RFU',
    confidence_score: confidenceScore,
    raw_target_name: targetName,
    raw_device_fields: JSON.stringify(rawRow),
  };
}

function parseMetagenomics(rawRow) {
  const sampleName = (rawRow.SampleName || '').trim();
  const geneName = (rawRow.GeneName || '').trim();
  const readCount = parseInt(rawRow.ReadCount);
  const totalReads = parseInt(rawRow.TotalReads);
  const coverageDepth = parseFloat(rawRow.CoverageDepth);
  const avgMapQuality = parseFloat(rawRow.AvgMapQuality);

  if (isNaN(readCount) || isNaN(totalReads) || totalReads <= 0) {
    throw new NormalizationError('Missing or invalid ReadCount/TotalReads', { field: 'ReadCount', row: rawRow, deviceType: 'METAGENOMICS' });
  }
  if (!geneName) {
    throw new NormalizationError('Missing GeneName', { field: 'GeneName', row: rawRow, deviceType: 'METAGENOMICS' });
  }

  const siteMatch = sampleName.match(SITE_ID_REGEX);
  if (!siteMatch) {
    throw new NormalizationError(`SampleName "${sampleName}" does not contain valid site ID`, { field: 'SampleName', row: rawRow, deviceType: 'METAGENOMICS' });
  }
  const siteId = siteMatch[1];
  const sampleDate = siteMatch[2];

  const canonicalKey = resolveTarget(geneName);
  if (!canonicalKey) {
    throw new NormalizationError(`Unrecognized gene "${geneName}"`, { field: 'GeneName', row: rawRow, deviceType: 'METAGENOMICS' });
  }
  const lookupEntry = aroLookup[canonicalKey];

  const rpm = (readCount / totalReads) * 1000000;
  const detected = readCount > 10 && coverageDepth > 2;

  let detectionStatus;
  if (!detected) detectionStatus = 'NOT_DETECTED';
  else if (coverageDepth > 20) detectionStatus = 'CONFIRMED';
  else if (coverageDepth > 10) detectionStatus = 'PROBABLE';
  else detectionStatus = 'BORDERLINE';

  const confidenceScore = clamp(!isNaN(avgMapQuality) ? avgMapQuality / 60 : rpm / 100, 0, 1);

  return {
    site_id: siteId,
    sample_date: sampleDate,
    device_type: 'METAGENOMICS',
    device_id: '',
    target_gene: canonicalKey,
    aro_number: lookupEntry.aro,
    canonical_name: lookupEntry.canonical,
    drug_class: lookupEntry.drugClass,
    mechanism: lookupEntry.mechanism,
    detected,
    detection_status: detectionStatus,
    ct_value: null,
    concentration: detected ? rpm : 0,
    concentration_unit: 'RPM',
    confidence_score: confidenceScore,
    raw_target_name: geneName,
    raw_device_fields: JSON.stringify(rawRow),
  };
}

function parseMicrofluidic(rawRow) {
  const sampleName = (rawRow.SampleName || '').trim();
  const targetName = (rawRow.TargetName || '').trim();
  const positiveDroplets = parseInt(rawRow.PositiveDroplets);
  const totalDroplets = parseInt(rawRow.TotalDroplets);
  const endpointFluorescence = parseFloat(rawRow.EndpointFluorescence);

  if (isNaN(positiveDroplets) || isNaN(totalDroplets) || totalDroplets <= 0) {
    throw new NormalizationError('Missing or invalid droplet counts', { field: 'PositiveDroplets', row: rawRow, deviceType: 'MICROFLUIDIC' });
  }
  if (!targetName) {
    throw new NormalizationError('Missing TargetName', { field: 'TargetName', row: rawRow, deviceType: 'MICROFLUIDIC' });
  }

  const siteMatch = sampleName.match(SITE_ID_REGEX);
  if (!siteMatch) {
    throw new NormalizationError(`SampleName "${sampleName}" does not contain valid site ID`, { field: 'SampleName', row: rawRow, deviceType: 'MICROFLUIDIC' });
  }
  const siteId = siteMatch[1];
  const sampleDate = siteMatch[2];

  const canonicalKey = resolveTarget(targetName);
  if (!canonicalKey) {
    throw new NormalizationError(`Unrecognized target "${targetName}"`, { field: 'TargetName', row: rawRow, deviceType: 'MICROFLUIDIC' });
  }
  const lookupEntry = aroLookup[canonicalKey];

  const ratio = positiveDroplets / totalDroplets;
  // poisson correction: -ln(1-ratio) converts droplet fraction to copies/ul
  const concentration = -1 * Math.log(1 - ratio) * 1000;
  const detected = positiveDroplets > 0;

  let detectionStatus;
  if (!detected) detectionStatus = 'NOT_DETECTED';
  else if (positiveDroplets > 20) detectionStatus = 'CONFIRMED';
  else if (positiveDroplets > 5) detectionStatus = 'PROBABLE';
  else detectionStatus = 'BORDERLINE';

  const confidenceScore = clamp(positiveDroplets / 50, 0, 1);

  return {
    site_id: siteId,
    sample_date: sampleDate,
    device_type: 'MICROFLUIDIC',
    device_id: rawRow.ChannelID || '',
    target_gene: canonicalKey,
    aro_number: lookupEntry.aro,
    canonical_name: lookupEntry.canonical,
    drug_class: lookupEntry.drugClass,
    mechanism: lookupEntry.mechanism,
    detected,
    detection_status: detectionStatus,
    ct_value: null,
    concentration: detected ? concentration : 0,
    concentration_unit: 'COPIES_PER_ML',
    confidence_score: confidenceScore,
    raw_target_name: targetName,
    raw_device_fields: JSON.stringify(rawRow),
  };
}

const PARSERS = {
  PCR: parsePCR,
  BIOSENSOR: parseBiosensor,
  METAGENOMICS: parseMetagenomics,
  MICROFLUIDIC: parseMicrofluidic,
};

export function normalizeRecord(rawRow, deviceType, uploadMeta) {
  if (!rawRow || typeof rawRow !== 'object') {
    throw new NormalizationError('rawRow must be a non-null object', { field: null, row: rawRow, deviceType });
  }
  if (!DEVICE_TYPES.includes(deviceType)) {
    throw new NormalizationError(`Invalid deviceType "${deviceType}". Must be one of: ${DEVICE_TYPES.join(', ')}`, { field: 'deviceType', row: rawRow, deviceType });
  }
  if (!uploadMeta || !uploadMeta.submittedBy || !uploadMeta.uploadTimestamp) {
    throw new NormalizationError('uploadMeta must have submittedBy and uploadTimestamp', { field: 'uploadMeta', row: rawRow, deviceType });
  }

  const parser = PARSERS[deviceType];
  const parsed = parser(rawRow);
  const siteEntry = siteRegistry[parsed.site_id];

  if (!siteEntry) {
    throw new NormalizationError(`Site "${parsed.site_id}" not found in siteRegistry`, { field: 'site_id', row: rawRow, deviceType });
  }

  const sampleDate = parsed.sample_date || new Date().toISOString().split('T')[0];
  const recordId = generateRecordId(parsed.site_id, sampleDate, parsed.target_gene);

  return {
    record_id: recordId,
    site_id: parsed.site_id,
    site_type: siteEntry.type,
    county: siteEntry.county,
    municipality: siteEntry.municipality,
    lat: siteEntry.lat,
    lng: siteEntry.lng,
    sample_date: sampleDate,
    device_type: parsed.device_type,
    device_id: parsed.device_id,
    target_gene: parsed.target_gene,
    aro_number: parsed.aro_number,
    canonical_name: parsed.canonical_name,
    drug_class: parsed.drug_class,
    mechanism: parsed.mechanism,
    detected: parsed.detected,
    detection_status: parsed.detection_status,
    ct_value: parsed.ct_value,
    concentration: parsed.concentration,
    concentration_unit: parsed.concentration_unit,
    confidence_score: parsed.confidence_score,
    raw_target_name: parsed.raw_target_name,
    raw_device_fields: parsed.raw_device_fields,
    submitted_by: uploadMeta.submittedBy,
    upload_timestamp: uploadMeta.uploadTimestamp,
    normalization_timestamp: new Date().toISOString(),
    validation_status: null,
    validation_flags: [],
    compliance_status: null,
    compliance_note: null,
    clearance_achieved: null,
    data_quality_flag: 'PASS',
  };
}

export function normalizeBatch(rawRows, deviceType, uploadMeta) {
  const records = [];
  const errors = [];

  for (let i = 0; i < rawRows.length; i++) {
    try {
      const record = normalizeRecord(rawRows[i], deviceType, uploadMeta);
      records.push(record);
    } catch (err) {
      errors.push({
        row: rawRows[i],
        rowIndex: i,
        error: err.message,
        field: err.field || null,
      });
    }
  }

  return {
    records,
    errors,
    stats: {
      total: rawRows.length,
      succeeded: records.length,
      failed: errors.length,
    },
  };
}
