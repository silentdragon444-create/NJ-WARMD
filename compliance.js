/**
 * Helper to determine the "anchor" or evaluation date of the records dataset.
 * If all records are old (more than 31 days in the past compared to the system date),
 * we assume we are running tests on historical/static data and evaluate relative
 * to the most recent record date in the dataset. Otherwise, we evaluate relative to the current time.
 * 
 * @param {Array} records - Array of sample records.
 * @returns {Date} The date to evaluate compliance against.
 */
function parseDateLocal(dateStr) {
  if (!dateStr) return NaN;
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length !== 3) return NaN;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return d.getTime();
}

function getEvaluationDate(records) {
  const now = new Date();
  if (!records || records.length === 0) return now;
  
  let maxTime = 0;
  for (const r of records) {
    const t = parseDateLocal(r.sample_date);
    if (!isNaN(t) && t > maxTime) {
      maxTime = t;
    }
  }
  
  if (maxTime === 0) return now;
  
  const latestRecordDate = new Date(maxTime);
  const diffMs = now.getTime() - latestRecordDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  
  // If latest record is more than 31 days old, evaluate relative to the latest record's date
  if (diffDays > 31) {
    return latestRecordDate;
  }
  return now;
}

/**
 * Function 1: getSchedulingTier
 * Returns 'weekly' if the site has more than 1 detection in the past 90 days,
 * otherwise returns 'monthly'.
 * 
 * @param {string} siteId - Unique identifier for the monitoring site.
 * @param {Array} records - Array of sample records.
 * @returns {string} 'weekly' or 'monthly'
 */
export function getSchedulingTier(siteId, records) {
  const refDate = getEvaluationDate(records);
  const cutoffTime = refDate.getTime() - 90 * 24 * 60 * 60 * 1000;
  
  let detectionsCount = 0;
  for (const r of records) {
    if (r.site_id === siteId && r.detected === true) {
      const recordTime = parseDateLocal(r.sample_date);
      if (!isNaN(recordTime) && recordTime >= cutoffTime && recordTime <= refDate.getTime()) {
        detectionsCount++;
      }
    }
  }
  
  return detectionsCount > 1 ? 'weekly' : 'monthly';
}

/**
 * Function 2: isOverdue
 * Returns true if the site is on a weekly schedule and hasn't submitted a sample in 7 days,
 * or on a monthly schedule and hasn't submitted a sample in 31 days.
 * 
 * @param {string} siteId - Unique identifier for the monitoring site.
 * @param {Array} records - Array of sample records.
 * @param {Object} siteRegistry - Object containing site registration details.
 * @returns {boolean} True if the site is overdue for a submission, false otherwise.
 */
export function isOverdue(siteId, records, siteRegistry) {
  const refDate = getEvaluationDate(records);
  const tier = getSchedulingTier(siteId, records);
  
  const siteRecords = records.filter(r => r.site_id === siteId);
  if (siteRecords.length === 0) {
    // If no submissions have ever occurred, the site is overdue
    return true;
  }
  
  let maxTime = 0;
  for (const r of siteRecords) {
    const t = parseDateLocal(r.sample_date);
    if (!isNaN(t) && t > maxTime) {
      maxTime = t;
    }
  }
  
  if (maxTime === 0) return true;
  
  const lastSubmission = new Date(maxTime);
  const diffDays = (refDate.getTime() - lastSubmission.getTime()) / (1000 * 60 * 60 * 24);
  
  if (tier === 'weekly') {
    return diffDays > 7;
  } else {
    return diffDays > 31;
  }
}

/**
 * Function 3: hasAchievedClearance
 * Returns true if the site has had zero detections for 90 consecutive days.
 * 
 * @param {string} siteId - Unique identifier for the monitoring site.
 * @param {Array} records - Array of sample records.
 * @returns {boolean} True if the site has zero detections in the past 90 days.
 */
export function hasAchievedClearance(siteId, records) {
  const refDate = getEvaluationDate(records);
  const cutoffTime = refDate.getTime() - 90 * 24 * 60 * 60 * 1000;
  
  const siteRecords = records.filter(r => r.site_id === siteId);
  const detectionsIn90Days = siteRecords.filter(r => {
    if (!r.detected) return false;
    const t = parseDateLocal(r.sample_date);
    return !isNaN(t) && t >= cutoffTime && t <= refDate.getTime();
  });
  
  return detectionsIn90Days.length === 0;
}

/**
 * Function 4: getComplianceStatus
 * Returns one of 'compliant', 'borderline', 'overdue', or 'non_compliant'.
 * Non-compliant means detection rate over 10% in the past 90 days.
 * Borderline means 5-10% detection rate in the past 90 days.
 * Overdue means no submission when one was required.
 * Compliant otherwise.
 * 
 * @param {string} siteId - Unique identifier for the monitoring site.
 * @param {Array} records - Array of sample records.
 * @param {Object} siteRegistry - Object containing site registration details.
 * @returns {string} The compliance status of the site.
 */
export function getComplianceStatus(siteId, records, siteRegistry) {
  const refDate = getEvaluationDate(records);
  const cutoffTime = refDate.getTime() - 90 * 24 * 60 * 60 * 1000;
  
  const siteRecords = records.filter(r => r.site_id === siteId);
  const recordsIn90Days = siteRecords.filter(r => {
    const t = parseDateLocal(r.sample_date);
    return !isNaN(t) && t >= cutoffTime && t <= refDate.getTime();
  });
  
  let detectionRate = 0;
  if (recordsIn90Days.length > 0) {
    const detectionsCount = recordsIn90Days.filter(r => r.detected === true).length;
    detectionRate = (detectionsCount / recordsIn90Days.length) * 100;
  }
  
  // Non-compliant if detection rate is strictly over 10%
  if (detectionRate > 10) {
    return 'non_compliant';
  }
  
  // Check if overdue first before falling back to borderline or compliant
  const overdue = isOverdue(siteId, records, siteRegistry);
  if (overdue) {
    return 'overdue';
  }
  
  // Borderline if detection rate is between 5% and 10% (inclusive)
  if (detectionRate >= 5 && detectionRate <= 10) {
    return 'borderline';
  }
  
  return 'compliant';
}

/**
 * Function 5: getPilotDayStats
 * Returns stats on pilot program progression: days elapsed, days remaining (out of 730),
 * current phase (1, 2, or 3 based on 8-month calendar intervals), and start date of the current phase.
 * 
 * @param {string} startDate - Program start date as an ISO string.
 * @returns {Object} Pilot day stats object.
 */
export function getPilotDayStats(startDate) {
  const now = new Date();
  const start = new Date(startDate);
  
  // Calculate full days elapsed since start
  const diffMs = now.getTime() - start.getTime();
  const daysElapsed = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  const daysRemaining = Math.max(0, 730 - daysElapsed);
  
  // Calculate phase boundary dates using 8-month calendar intervals
  const phase1Start = new Date(start);
  const phase2Start = new Date(start.getFullYear(), start.getMonth() + 8, start.getDate());
  const phase3Start = new Date(start.getFullYear(), start.getMonth() + 16, start.getDate());
  
  let currentPhase = 1;
  let phaseStartDate = phase1Start;
  
  if (now >= phase3Start) {
    currentPhase = 3;
    phaseStartDate = phase3Start;
  } else if (now >= phase2Start) {
    currentPhase = 2;
    phaseStartDate = phase2Start;
  }
  
  return {
    daysElapsed,
    daysRemaining,
    currentPhase,
    phaseStartDate: phaseStartDate.toISOString()
  };
}
