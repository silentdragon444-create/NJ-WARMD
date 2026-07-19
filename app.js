import { siteRegistry } from './site_registry.js';
import { normalizeBatch } from './normalize.js';
import { validateRecord, checkBillCompliance } from './validate.js';
import { getSchedulingTier, isOverdue, hasAchievedClearance, getComplianceStatus, getPilotDayStats } from './compliance.js';
import { getAlertForDrugClass } from './alerts.js';
import neuroData from './neuro_data.js';

let allRecords = [];
let activeAlerts = [];
let viewAsOfDate = "2026-12-31";
let mapFilters = { siteType: "ALL", drugClass: "ALL", phase: "ALL" };
let complianceFilters = { search: "", status: "ALL" };
let sortColumn = "name";
let sortDirection = "asc";

let statewideTrendsChart = null;
let siteProfileChart = null;
let researchScatterChart = null;

let mainMap = null;
let mainMarkersLayer = null;
let researchMap = null;
let researchChoroplethLayer = null;
let activeResearchMetric = "arg";
let activeResearchDisease = "alzheimers";

let njCountiesGeoJson = null;

function getPopulationServed(siteId) {
  const idx = parseInt(siteId.split('_')[1]) || 1;
  if (siteId.startsWith('WWTP')) {
    return (idx * 20000) + 50000;
  } else if (siteId.startsWith('HOSPITAL')) {
    return (idx * 6000) + 12000;
  } else if (siteId.startsWith('SURFACE_WATER')) {
    return (idx * 12000) + 18000;
  } else if (siteId.startsWith('AGRICULTURAL')) {
    return (idx * 3000) + 4000;
  }
  return 10000;
}

window.addEventListener('DOMContentLoaded', async () => {
  try {
    const dataModule = await import('./data.js');
    allRecords = dataModule.syntheticRecords || [];
    const spinner = document.getElementById('loading-overlay');
    if (spinner) {
      spinner.style.opacity = '0';
      setTimeout(() => spinner.style.display = 'none', 300);
    }
  } catch (err) {
    console.warn("data.js unavailable, falling back to mock_data.js:", err);
    try {
      const mockModule = await import('./mock_data.js');
      allRecords = mockModule.syntheticRecords || [];
    } catch (e) {
      console.error("failed to load mock data:", e);
    }
    const spinner = document.getElementById('loading-overlay');
    if (spinner) spinner.style.display = 'none';
  }

  try {
    const response = await fetch('./nj_counties.geojson');
    njCountiesGeoJson = await response.json();
  } catch (e) {
    console.error("failed to load NJ counties GeoJSON:", e);
  }

  generateAlertsFromRecords();
  initTabs();
  initMap();
  initTrends();
  initUpload();
  initCompliance();
  initResearch();
  updateAlertBanner();
});

function initTabs() {
  const tabs = document.querySelectorAll('#top-nav button');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const targetTab = tab.getAttribute('data-tab');
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
      });
      document.getElementById(`tab-${targetTab}`).classList.remove('hidden');

      // leaflet and chart.js require an explicit size recalculation after a hidden element is shown
      if (targetTab === 'map' && mainMap) {
        mainMap.invalidateSize();
      } else if (targetTab === 'trends') {
        renderStatewideTrends();
        renderSiteProfileChart();
        renderCountyAggregates();
      } else if (targetTab === 'compliance') {
        renderComplianceStats();
        renderComplianceDirectory();
      } else if (targetTab === 'research') {
        if (researchMap) researchMap.invalidateSize();
        renderResearchChoropleth();
        renderResearchScatterPlot();
      }
    });
  });
}

function generateAlertsFromRecords() {
  activeAlerts = [];
  const publicWaterRecords = allRecords.filter(r => 
    (r.site_type === 'WWTP' || r.site_type === 'SURFACE_WATER') &&
    r.detected === true &&
    r.detection_status === 'CONFIRMED' &&
    r.sample_date <= viewAsOfDate
  );

  publicWaterRecords.forEach(record => {
    const alertTemplate = getAlertForDrugClass(record.drug_class);
    if (alertTemplate) {
      activeAlerts.push({
        id: `alert_${record.record_id}`,
        site_id: record.site_id,
        site_name: siteRegistry[record.site_id]?.name || record.site_id,
        municipality: record.municipality,
        county: record.county,
        target_gene: record.target_gene,
        drug_class: record.drug_class,
        sample_date: record.sample_date,
        device_type: record.device_type,
        explanation: alertTemplate.explanation,
        headline: alertTemplate.headline,
        whatToDo: alertTemplate.whatToDo,
        severity: alertTemplate.severity
      });
    }
  });
}

function updateAlertBanner() {
  const stickyAlert = document.getElementById('sticky-alert');
  const alertText = document.getElementById('sticky-alert-text');
  
  if (activeAlerts.length > 0) {
    stickyAlert.style.display = 'flex';
    alertText.innerText = `${activeAlerts.length} active public water system alerts: click to view details`;
    
    const hasCritical = activeAlerts.some(a => a.severity === 'critical');
    if (hasCritical) {
      stickyAlert.style.backgroundColor = '#dc2626';
    } else {
      stickyAlert.style.backgroundColor = '#f97316';
    }
  } else {
    stickyAlert.style.display = 'none';
  }

  const viewAlertsBtn = document.getElementById('view-alerts-btn');
  const alertsModal = document.getElementById('alerts-modal');
  const modalClose = document.getElementById('modal-close-btn');

  viewAlertsBtn.onclick = () => {
    renderAlertCards();
    alertsModal.classList.add('open');
  };

  modalClose.onclick = () => {
    alertsModal.classList.remove('open');
  };

  alertsModal.onclick = (e) => {
    if (e.target === alertsModal) {
      alertsModal.classList.remove('open');
    }
  };
}

function renderAlertCards() {
  const container = document.getElementById('modal-alerts-content');
  container.innerHTML = '';

  if (activeAlerts.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #64748b;">No active public water system alerts currently logged.</p>';
    return;
  }

  activeAlerts.forEach(alert => {
    const severityClass = alert.severity === 'critical' ? 'critical' : (alert.severity === 'high' ? 'high' : 'moderate');
    const emailFrom = "NJ DEP Water Quality Alert System <alerts@dep.nj.gov>";
    const emailSubject = `URGENT: Water Quality Alert - ${alert.site_name} (${alert.municipality})`;
    const emailBody = `PUBLIC NOTICE: WATER QUALITY ADVISORY
Date of Sample: ${alert.sample_date}
Location: ${alert.site_name}, ${alert.municipality}, ${alert.county} County, NJ
Monitoring Platform: ${alert.device_type}

${alert.headline}

${alert.explanation}

${alert.whatToDo}

Issued by the New Jersey Department of Environmental Protection (DEP) under the Clean Water Monitoring Pilot Program (P.L. 2026, c. 4000). For updates, contact your local water utility or the DEP hotline at 1-877-WARN-DEP.`;

    const card = document.createElement('div');
    card.className = 'alert-card';
    card.innerHTML = `
      <div class="alert-card-header ${severityClass}">
        <strong>${alert.site_name} (${alert.county} County)</strong>
        <span class="badge ${alert.severity === 'critical' ? 'badge-alert' : (alert.severity === 'high' ? 'badge-flagged' : 'badge-gray')}">
          ${alert.severity}
        </span>
      </div>
      <div class="alert-card-body">
        <p style="font-weight: 700; color: #1e293b; margin-bottom: 0.5rem;">${alert.headline}</p>
        <p style="margin-bottom: 0.75rem;"><strong>About This Advisory:</strong> ${alert.explanation}</p>
        <p style="margin-bottom: 1rem;"><strong>What You Should Do:</strong> ${alert.whatToDo}</p>
        
        <h4 style="font-size: 0.8rem; text-transform: uppercase; color: #64748b; margin-bottom: 0.5rem; font-weight: 600;">DEP Public Notification Email Template</h4>
        <div class="mock-email">
          <div class="email-header">
            <div class="email-header-line"><strong>From:</strong> ${emailFrom}</div>
            <div class="email-header-line"><strong>Subject:</strong> ${emailSubject}</div>
          </div>
          <div class="email-body" id="email-body-${alert.id}">${emailBody}</div>
          <div class="email-actions">
            <button class="btn btn-secondary btn-copy" data-id="${alert.id}" style="font-size: 0.75rem; padding: 0.3rem 0.6rem;">Copy Email Text</button>
          </div>
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  container.querySelectorAll('.btn-copy').forEach(btn => {
    btn.onclick = () => {
      const alertId = btn.getAttribute('data-id');
      const emailBodyText = document.getElementById(`email-body-${alertId}`).innerText;
      navigator.clipboard.writeText(emailBodyText)
        .then(() => {
          btn.innerText = "Copied!";
          btn.classList.add('badge-clear');
          setTimeout(() => {
            btn.innerText = "Copy Email Text";
            btn.classList.remove('badge-clear');
          }, 2000);
        })
        .catch(err => {
          console.error("Failed to copy clipboard:", err);
        });
    };
  });
}

function initMap() {
  mainMap = L.map('map').setView([40.0, -74.5], 8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(mainMap);

  mainMarkersLayer = L.layerGroup().addTo(mainMap);

  const dateSlider = document.getElementById('filter-date-slider');
  const dateDisplay = document.getElementById('slider-date-display');
  const siteFilter = document.getElementById('filter-site-type');
  const drugFilter = document.getElementById('filter-drug-class');
  const phaseFilter = document.getElementById('filter-phase');

  // slider value (0-730) maps to days elapsed since 2025-01-01
  function updateSliderDate() {
    const startDate = new Date('2025-01-01T00:00:00');
    const elapsedDays = parseInt(dateSlider.value);
    const currentDate = new Date(startDate.getTime() + elapsedDays * 24 * 60 * 60 * 1000);
    viewAsOfDate = currentDate.toISOString().split('T')[0];
    dateDisplay.innerText = viewAsOfDate;
  }

  const handleFilterChange = () => {
    updateSliderDate();
    mapFilters.siteType = siteFilter.value;
    mapFilters.drugClass = drugFilter.value;
    mapFilters.phase = phaseFilter.value;
    generateAlertsFromRecords();
    updateAlertBanner();
    renderMarkers();
  };

  dateSlider.addEventListener('input', handleFilterChange);
  siteFilter.addEventListener('change', handleFilterChange);
  drugFilter.addEventListener('change', handleFilterChange);
  phaseFilter.addEventListener('change', handleFilterChange);

  document.getElementById('drawer-close-btn').addEventListener('click', () => {
    document.getElementById('map-drawer').classList.remove('open');
  });

  updateSliderDate();
  renderMarkers();
}

function renderMarkers() {
  mainMarkersLayer.clearLayers();

  for (const [siteId, site] of Object.entries(siteRegistry)) {
    if (mapFilters.siteType !== 'ALL' && site.type !== mapFilters.siteType) continue;
    if (mapFilters.phase !== 'ALL' && parseInt(site.phase) !== parseInt(mapFilters.phase)) continue;

    let siteRecords = allRecords.filter(r => r.site_id === siteId && r.sample_date <= viewAsOfDate);

    if (mapFilters.drugClass !== 'ALL') {
      siteRecords = siteRecords.filter(r => r.drug_class && r.drug_class.toLowerCase().includes(mapFilters.drugClass.toLowerCase()));
    }

    let statusColor = "#9ca3af";
    let statusText = "No Data";
    let statusBadgeClass = "badge-gray";

    if (siteRecords.length > 0) {
      siteRecords.sort((a, b) => new Date(b.sample_date) - new Date(a.sample_date));
      const latestSample = siteRecords[0];

      if (latestSample.detected === true) {
        statusColor = "#ef4444";
        statusText = "Alert (Recent Detection)";
        statusBadgeClass = "badge-alert";
      } else {
        const viewTime = new Date(viewAsOfDate).getTime();
        const cutoffTime = viewTime - 90 * 24 * 60 * 60 * 1000;

        const detectionsIn90Days = siteRecords.filter(r => {
          const sampleTime = new Date(r.sample_date).getTime();
          return r.detected === true && sampleTime >= cutoffTime && sampleTime <= viewTime;
        }).length;

        if (detectionsIn90Days > 1) {
          statusColor = "#f97316";
          statusText = "Flagged (>1 detection)";
          statusBadgeClass = "badge-flagged";
        } else if (detectionsIn90Days === 1) {
          statusColor = "#eab308";
          statusText = "Flagged (1 detection)";
          statusBadgeClass = "badge-flagged";
        } else {
          statusColor = "#22c55e";
          statusText = "Clear (No detections)";
          statusBadgeClass = "badge-clear";
        }
      }
    }

    // sqrt scaling makes radius proportional to population served without huge outlier circles
    const population = getPopulationServed(siteId);
    const radius = Math.sqrt(population / 10000) + 4;

    const marker = L.circleMarker([site.lat, site.lng], {
      radius: radius,
      fillColor: statusColor,
      color: "#334155",
      weight: 1.5,
      opacity: 0.9,
      fillOpacity: 0.8
    });

    marker.on('click', () => {
      openMapDrawer(siteId, site, statusText, statusBadgeClass, siteRecords);
    });

    marker.addTo(mainMarkersLayer);
  }
}

function openMapDrawer(siteId, site, statusText, statusBadgeClass, siteRecords) {
  const drawer = document.getElementById('map-drawer');
  document.getElementById('drawer-site-name').innerText = site.name;
  document.getElementById('drawer-site-id-label').innerText = `Site ID: ${siteId}`;
  document.getElementById('drawer-site-type').innerText = site.type;
  document.getElementById('drawer-site-county').innerText = `${site.county} County`;
  document.getElementById('drawer-site-municipality').innerText = site.municipality;

  const statusSpan = document.getElementById('drawer-status-badge');
  statusSpan.className = `badge ${statusBadgeClass}`;
  statusSpan.innerHTML = statusText.includes('Clear') ? `✔ ${statusText}` : `⚠ ${statusText}`;

  const lastSampleText = document.getElementById('drawer-last-sample');
  const nextDueText = document.getElementById('drawer-next-due');
  const tierText = document.getElementById('drawer-tier');

  const allSiteRecords = allRecords.filter(r => r.site_id === siteId && r.sample_date <= viewAsOfDate);
  const tier = getSchedulingTier(siteId, allSiteRecords);
  tierText.innerText = tier.toUpperCase();

  if (siteRecords.length > 0) {
    const lastDate = siteRecords[0].sample_date;
    lastSampleText.innerText = lastDate;
    const lastTime = new Date(lastDate);
    const offset = tier === 'weekly' ? 7 : 30;
    const nextTime = new Date(lastTime.getTime() + offset * 24 * 60 * 60 * 1000);
    nextDueText.innerText = nextTime.toISOString().split('T')[0];
  } else {
    lastSampleText.innerText = "No samples";
    nextDueText.innerText = "Immediate monitoring required";
  }

  const sparklinePlaceholder = document.getElementById('drawer-sparkline-svg-placeholder');
  sparklinePlaceholder.innerHTML = buildSparkline(siteId, allSiteRecords);

  drawer.classList.add('open');
}

function buildSparkline(siteId, siteRecords) {
  // 12 weekly buckets, each 20px wide, covering the 84 days prior to viewAsOfDate
  const endTime = new Date(viewAsOfDate).getTime();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  let svgContent = `<svg width="240" height="24" viewBox="0 0 240 24" xmlns="http://www.w3.org/2000/svg">`;

  for (let w = 0; w < 12; w++) {
    const bucketStart = endTime - (12 - w) * weekMs;
    const bucketEnd = endTime - (11 - w) * weekMs;

    const recordsInWeek = siteRecords.filter(r => {
      const sampleTime = new Date(r.sample_date).getTime();
      return sampleTime >= bucketStart && sampleTime < bucketEnd;
    });

    let color = "#e2e8f0";
    let titleText = `Week ${w+1}: No Sample`;

    if (recordsInWeek.length > 0) {
      const hasDetection = recordsInWeek.some(r => r.detected === true);
      if (hasDetection) {
        color = "#ef4444";
        titleText = `Week ${w+1}: Resistance Gene Detected`;
      } else {
        color = "#22c55e";
        titleText = `Week ${w+1}: Clean Sample`;
      }
    }

    const xPos = w * 20;
    svgContent += `<rect x="${xPos}" y="4" width="16" height="16" fill="${color}" rx="3" ry="3">
      <title>${titleText}</title>
    </rect>`;
  }

  svgContent += `</svg>`;
  return svgContent;
}

function initTrends() {
  const siteSelect = document.getElementById('trends-site-select');
  siteSelect.innerHTML = '';
  
  const sortedSiteIds = Object.keys(siteRegistry).sort();
  sortedSiteIds.forEach(id => {
    const option = document.createElement('option');
    option.value = id;
    option.innerText = `${id}: ${siteRegistry[id].name}`;
    siteSelect.appendChild(option);
  });

  siteSelect.addEventListener('change', () => {
    selectedTrendsSite = siteSelect.value;
    renderSiteProfileChart();
  });

  // Default selection
  selectedTrendsSite = sortedSiteIds[0];
}

let selectedTrendsSite = "WWTP_01";

function computeWeeklyStatusCounts(records, registry) {
  const startDate = new Date('2025-01-01T00:00:00');
  const counts = [];

  for (let w = 0; w < 104; w++) {
    const weekEndDate = new Date(startDate.getTime() + (w + 1) * 7 * 24 * 60 * 60 * 1000);
    const weekEndStr = weekEndDate.toISOString().split('T')[0];
    const weekEndTime = weekEndDate.getTime();

    let non_detected = 0;
    let low_alert = 0;
    let escalated = 0;
    let active_alert = 0;

    for (const siteId of Object.keys(registry)) {
      const siteRecords = records.filter(r => r.site_id === siteId && r.sample_date <= weekEndStr);
      
      if (siteRecords.length === 0) {
        non_detected++; // assume clear if no data initially
        continue;
      }

      // Sort by date descending
      siteRecords.sort((a, b) => new Date(b.sample_date) - new Date(a.sample_date));
      const latestSample = siteRecords[0];

      if (latestSample.detected === true) {
        active_alert++;
      } else {
        const cutoffTime = weekEndTime - 90 * 24 * 60 * 60 * 1000;
        const detectionsIn90Days = siteRecords.filter(r => {
          const sampleTime = new Date(r.sample_date).getTime();
          return r.detected === true && sampleTime >= cutoffTime && sampleTime <= weekEndTime;
        }).length;

        if (detectionsIn90Days > 1) {
          escalated++;
        } else if (detectionsIn90Days === 1) {
          low_alert++;
        } else {
          non_detected++;
        }
      }
    }

    counts.push({
      week: w + 1,
      dateLabel: weekEndStr,
      non_detected,
      low_alert,
      escalated,
      active_alert
    });
  }

  return counts;
}

function renderStatewideTrends() {
  const data = computeWeeklyStatusCounts(allRecords, siteRegistry);
  const labels = data.map(d => `W${d.week}`);
  
  const ctx = document.getElementById('statewide-trends-chart').getContext('2d');
  if (statewideTrendsChart) {
    statewideTrendsChart.destroy();
  }

  statewideTrendsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Alert (Recent Detection)',
          data: data.map(d => d.active_alert),
          backgroundColor: 'rgba(239, 68, 68, 0.7)',
          borderColor: '#ef4444',
          fill: true
        },
        {
          label: 'Escalated (>1 detection)',
          data: data.map(d => d.escalated),
          backgroundColor: 'rgba(249, 115, 22, 0.7)',
          borderColor: '#f97316',
          fill: true
        },
        {
          label: 'Low Alert (1 detection)',
          data: data.map(d => d.low_alert),
          backgroundColor: 'rgba(234, 179, 8, 0.7)',
          borderColor: '#eab308',
          fill: true
        },
        {
          label: 'Clear (No detections)',
          data: data.map(d => d.non_detected),
          backgroundColor: 'rgba(34, 197, 94, 0.7)',
          borderColor: '#22c55e',
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          grid: { display: false }
        },
        y: {
          stacked: true,
          title: { display: true, text: 'Number of Monitoring Sites' }
        }
      },
      plugins: {
        legend: { position: 'top' },
        annotation: {
          annotations: {
            phase2Line: {
              type: 'line',
              xMin: 34, // ~Month 8
              xMax: 34,
              borderColor: '#0f172a',
              borderWidth: 2,
              borderDash: [5, 5],
              label: {
                content: 'Phase 2 Start',
                display: true,
                position: 'start',
                backgroundColor: 'rgba(15,23,42,0.8)',
                color: '#ffffff',
                font: { size: 10, weight: 'bold' }
              }
            },
            phase3Line: {
              type: 'line',
              xMin: 69, // ~Month 16
              xMax: 69,
              borderColor: '#0f172a',
              borderWidth: 2,
              borderDash: [5, 5],
              label: {
                content: 'Phase 3 Start',
                display: true,
                position: 'start',
                backgroundColor: 'rgba(15,23,42,0.8)',
                color: '#ffffff',
                font: { size: 10, weight: 'bold' }
              }
            }
          }
        }
      }
    }
  });
}

function renderSiteProfileChart() {
  const siteRecords = allRecords.filter(r => r.site_id === selectedTrendsSite);
  siteRecords.sort((a, b) => new Date(a.sample_date) - new Date(b.sample_date));

  // collapse same-day records to the highest concentration so bars don't stack
  const dateMap = new Map();
  siteRecords.forEach(r => {
    if (!dateMap.has(r.sample_date)) {
      dateMap.set(r.sample_date, { date: r.sample_date, conc: r.detected ? r.concentration : 0, record: r });
    } else {
      const current = dateMap.get(r.sample_date);
      if (r.detected && r.concentration > current.conc) {
        current.conc = r.concentration;
        current.record = r;
      }
    }
  });

  const chartData = Array.from(dateMap.values());
  
  const ctx = document.getElementById('site-profile-chart').getContext('2d');
  if (siteProfileChart) {
    siteProfileChart.destroy();
  }

  const barColors = chartData.map(d => d.conc > 0 ? '#ef4444' : '#22c55e');

  // WWTP threshold is 10x higher than surface water per pilot program detection standards
  const siteType = siteRegistry[selectedTrendsSite]?.type;
  const threshold = siteType === 'WWTP' ? 500 : 50;

  siteProfileChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: chartData.map(d => d.date),
      datasets: [{
        label: 'Peak Concentration (Copies/mL, RFU or RPM)',
        data: chartData.map(d => d.conc),
        backgroundColor: barColors,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index;
          showRecordDetails(chartData[index].record);
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: { title: { display: true, text: 'Concentration' } }
      },
      plugins: {
        legend: { display: false },
        annotation: {
          annotations: {
            thresholdLine: {
              type: 'line',
              yMin: threshold,
              yMax: threshold,
              borderColor: '#f59e0b',
              borderWidth: 2,
              borderDash: [6, 4],
              label: {
                content: `Detection Standard Limit (${threshold})`,
                display: true,
                backgroundColor: 'rgba(245,158,11,0.85)'
              }
            }
          }
        }
      }
    }
  });

  document.getElementById('record-details-container').innerHTML =
    '<p style="color: #64748b; font-style: italic;">Click a bar on the concentration chart to inspect the raw laboratory results.</p>';
}

function showRecordDetails(record) {
  const container = document.getElementById('record-details-container');
  
  let pcrDetails = '';
  if (record.device_type === 'PCR') {
    pcrDetails = `<div class="details-row"><span>CT Value</span><span>${record.ct_value ?? 'N/A'}</span></div>`;
  }

  container.innerHTML = `
    <div class="record-details-card">
      <h4>Record ID: ${record.record_id}</h4>
      <div class="details-row"><span>Monitoring Station</span><span>${siteRegistry[record.site_id]?.name || record.site_id}</span></div>
      <div class="details-row"><span>Sample Date</span><span>${record.sample_date}</span></div>
      <div class="details-row"><span>Device Type</span><span>${record.device_type}</span></div>
      <div class="details-row"><span>Target Gene</span><span>${record.target_gene}</span></div>
      <div class="details-row"><span>Drug Class</span><span>${record.drug_class}</span></div>
      <div class="details-row"><span>Mechanism</span><span>${record.mechanism}</span></div>
      <div class="details-row"><span>Detection Status</span><span>${record.detection_status}</span></div>
      ${pcrDetails}
      <div class="details-row"><span>Concentration</span><span>${record.concentration} ${record.concentration_unit}</span></div>
      <div class="details-row"><span>Confidence Score</span><span>${record.confidence_score}</span></div>
      <div class="details-row"><span>Validation Status</span><span>${record.validation_status || 'ACCEPTED'}</span></div>
      <div class="details-row"><span>Submitted By</span><span>${record.submitted_by}</span></div>
    </div>
  `;
}

function renderCountyAggregates() {
  const tbody = document.querySelector('#county-aggregates-table tbody');
  tbody.innerHTML = '';

  const countiesMap = new Map();

  allRecords.forEach(r => {
    if (!r.county) return;
    if (!countiesMap.has(r.county)) {
      countiesMap.set(r.county, {
        county: r.county,
        total: 0,
        detections: 0,
        drugClasses: new Map()
      });
    }

    const cData = countiesMap.get(r.county);
    cData.total++;
    if (r.detected === true) {
      cData.detections++;
      if (r.drug_class) {
        cData.drugClasses.set(r.drug_class, (cData.drugClasses.get(r.drug_class) || 0) + 1);
      }
    }
  });

  const countiesList = Array.from(countiesMap.values());

  countiesList.forEach(c => {
    c.rate = c.total > 0 ? (c.detections / c.total) * 100 : 0;
    let topClass = "None";
    let maxCount = 0;
    c.drugClasses.forEach((count, key) => {
      if (count > maxCount) {
        maxCount = count;
        topClass = key;
      }
    });
    c.topClass = topClass;
    c.compliance = c.rate > 10 ? 'non_compliant' : (c.rate >= 5 ? 'borderline' : 'compliant');
  });

  countiesList.sort((a, b) => b.rate - a.rate);

  countiesList.forEach(c => {
    let compBadge = '';
    if (c.compliance === 'compliant') compBadge = '<span class="badge badge-clear">✔ Compliant</span>';
    else if (c.compliance === 'borderline') compBadge = '<span class="badge badge-flagged">⚠ Borderline</span>';
    else compBadge = '<span class="badge badge-alert">✘ Non-Compliant</span>';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${c.county}</strong></td>
      <td>${c.total}</td>
      <td>${c.detections}</td>
      <td>${c.rate.toFixed(1)}%</td>
      <td><span style="font-size:0.75rem;">${c.topClass}</span></td>
      <td>${compBadge}</td>
    `;
    tbody.appendChild(row);
  });
}

let pendingAccepted = [];
let pendingErrors = [];

function initUpload() {
  const dragZone = document.getElementById('drag-drop-zone');
  const fileInput = document.getElementById('file-input');
  
  dragZone.onclick = () => fileInput.click();

  dragZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dragZone.classList.add('dragover');
  });

  dragZone.addEventListener('dragleave', () => {
    dragZone.classList.remove('dragover');
  });

  dragZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dragZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      processFile(fileInput.files[0]);
    }
  });

  const accordionToggle = document.getElementById('errors-accordion-toggle');
  const accordionBody = document.getElementById('errors-accordion-body');
  const accordionArrow = document.getElementById('accordion-arrow');

  accordionToggle.onclick = () => {
    if (accordionBody.style.display === 'none') {
      accordionBody.style.display = 'block';
      accordionArrow.innerText = '▲';
    } else {
      accordionBody.style.display = 'none';
      accordionArrow.innerText = '▼';
    }
  };

  document.getElementById('preview-submit-btn').onclick = submitPendingRecords;
  document.getElementById('preview-cancel-btn').onclick = () => {
    document.getElementById('preview-panel').style.display = 'none';
    pendingAccepted = [];
    pendingErrors = [];
  };
}

function processFile(file) {
  const reader = new FileReader();
  const operatorName = document.getElementById('operator-name').value || "DEP Operator";
  const deviceType = document.querySelector('input[name="device-type-select"]:checked').value;

  reader.onload = function(e) {
    const textContent = e.target.result;
    let parsedRows = [];

    try {
      if (file.name.endsWith('.json')) {
        parsedRows = JSON.parse(textContent);
        if (!Array.isArray(parsedRows)) parsedRows = [parsedRows];
      } else {
        // Papa Parse CSV
        const parseResult = Papa.parse(textContent, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true
        });
        parsedRows = parseResult.data;
      }

      const uploadMeta = {
        submittedBy: operatorName,
        uploadTimestamp: new Date().toISOString()
      };

      const result = normalizeBatch(parsedRows, deviceType, uploadMeta);

      pendingAccepted = [];
      pendingErrors = [...result.errors];

      result.records.forEach((record, index) => {
        const siteHistory = allRecords.filter(r => r.site_id === record.site_id);
        const valResult = validateRecord(record, siteHistory);

        if (valResult.valid) {
          pendingAccepted.push(valResult.record);
        } else {
          pendingErrors.push({
            row: JSON.parse(record.raw_device_fields || '{}'),
            rowIndex: index,
            error: `Validation Error: ${valResult.flags.join(', ')}`,
            field: valResult.flags[0] || null
          });
        }
      });

      showUploadPreviewPanel(parsedRows.length);

    } catch (err) {
      alert(`Unable to process this lab file. Please verify the file format and try again. (${err.message})`);
    }
  };

  reader.readAsText(file);
}

function showUploadPreviewPanel(totalRows) {
  document.getElementById('upload-success-banner').style.display = 'none';

  const previewPanel = document.getElementById('preview-panel');
  previewPanel.style.display = 'block';

  const summaryRow = document.getElementById('preview-summary-row');
  summaryRow.innerText = `${totalRows} records processed · ${pendingAccepted.length} accepted · ${pendingErrors.length} errors`;

  const tbody = document.querySelector('#preview-table tbody');
  tbody.innerHTML = '';
  
  const showCount = Math.min(pendingAccepted.length, 10);
  for (let i = 0; i < showCount; i++) {
    const rec = pendingAccepted[i];
    const siteName = siteRegistry[rec.site_id]?.name || rec.site_id;
    const detectedBadge = rec.detected 
      ? '<span class="badge badge-alert">⚠ Detected</span>' 
      : '<span class="badge badge-clear">✔ Clear</span>';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${siteName}</td>
      <td>${rec.sample_date}</td>
      <td>${rec.target_gene}</td>
      <td>${detectedBadge}</td>
      <td>${rec.concentration} ${rec.concentration_unit}</td>
      <td>${rec.confidence_score.toFixed(3)}</td>
    `;
    tbody.appendChild(tr);
  }

  if (pendingAccepted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #64748b;">No accepted records from this batch.</td></tr>';
  }

  const errorsAccordion = document.getElementById('errors-accordion');
  const errorCountBadge = document.getElementById('error-count-badge');
  const errorBody = document.getElementById('errors-accordion-body');

  if (pendingErrors.length > 0) {
    errorsAccordion.style.display = 'block';
    errorCountBadge.innerText = pendingErrors.length;
    errorBody.innerHTML = '';
    
    pendingErrors.forEach(err => {
      const errItem = document.createElement('div');
      errItem.className = 'error-item';
      errItem.innerHTML = `
        <div style="font-weight:600; color:#b91c1c; font-size:0.8rem;">Row Index: ${err.rowIndex + 1}: ${err.error}</div>
        <pre>${JSON.stringify(err.row, null, 2)}</pre>
      `;
      errorBody.appendChild(errItem);
    });
  } else {
    errorsAccordion.style.display = 'none';
  }
}

function submitPendingRecords() {
  const affectedSites = new Set();
  let escalationsCount = 0;
  const newAlertDetections = [];
  
  pendingAccepted.forEach(record => {
    const siteId = record.site_id;
    affectedSites.add(siteRegistry[siteId]?.name || siteId);
    const siteHistory = allRecords.filter(r => r.site_id === siteId);
    const compResult = checkBillCompliance(
      record,
      siteHistory,
      siteRegistry,
      { getSchedulingTier, hasAchievedClearance, getComplianceStatus }
    );
    record.compliance_status = compResult.performanceCompliant === false ? 'non_compliant' : (getComplianceStatus(siteId, [...siteHistory, record], siteRegistry));
    record.compliance_note = compResult.complianceNote;
    record.clearance_achieved = compResult.clearanceAchieved;
    if (compResult.escalationNeeded) {
      escalationsCount++;
    }
    allRecords.push(record);
  });

  const isPublicWaterRecord = r => (r.site_type === 'WWTP' || r.site_type === 'SURFACE_WATER');
  pendingAccepted.forEach(record => {
    if (isPublicWaterRecord(record) && record.detected === true && record.detection_status === 'CONFIRMED') {
      const alertTemplate = getAlertForDrugClass(record.drug_class);
      if (alertTemplate) {
        newAlertDetections.push(`${record.target_gene} at ${siteRegistry[record.site_id]?.name || record.site_id}`);
      }
    }
  });

  generateAlertsFromRecords();
  updateAlertBanner();
  renderMarkers();

  document.getElementById('preview-panel').style.display = 'none';

  const successBanner = document.getElementById('upload-success-banner');
  const detailsList = document.getElementById('upload-success-details');
  detailsList.innerHTML = '';

  const sitesLi = document.createElement('li');
  sitesLi.innerHTML = `<strong>Affected Sites (${affectedSites.size}):</strong> ${Array.from(affectedSites).join(', ')}`;
  detailsList.appendChild(sitesLi);

  const escLi = document.createElement('li');
  escLi.innerHTML = `<strong>Scheduling Escalation:</strong> ${escalationsCount > 0
    ? `<span style="color:#d97706; font-weight:700;">⚠ ${escalationsCount} site(s) escalated monthly ➔ weekly</span>`
    : 'None triggered.'}`;
  detailsList.appendChild(escLi);

  const alertLi = document.createElement('li');
  alertLi.innerHTML = `<strong>Detections Alert Generation:</strong> ${newAlertDetections.length > 0
    ? `<span style="color:#dc2626; font-weight:700;">⚠ Alerts Generated: ${newAlertDetections.join(', ')}</span>`
    : 'No alert-level detections logged.'}`;
  detailsList.appendChild(alertLi);

  successBanner.style.display = 'block';

  pendingAccepted = [];
  pendingErrors = [];
}

function initCompliance() {
  const searchInput = document.getElementById('compliance-search-input');
  const statusFilter = document.getElementById('compliance-status-filter');

  const filterHandler = () => {
    complianceFilters.search = searchInput.value.toLowerCase().trim();
    complianceFilters.status = statusFilter.value;
    renderComplianceDirectory();
  };

  searchInput.addEventListener('input', filterHandler);
  statusFilter.addEventListener('change', filterHandler);

  const headers = document.querySelectorAll('#compliance-directory-table th');
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const col = header.getAttribute('data-sort');
      if (!col) return;

      if (sortColumn === col) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortColumn = col;
        sortDirection = 'asc';
      }

      // Update headers text
      headers.forEach(h => {
        const text = h.innerText.replace(/[↕▲▼]/g, '').trim();
        const sc = h.getAttribute('data-sort');
        if (sc === sortColumn) {
          h.innerText = `${text} ${sortDirection === 'asc' ? '▲' : '▼'}`;
        } else {
          h.innerText = `${text} ↕`;
        }
      });

      renderComplianceDirectory();
    });
  });
}

function renderComplianceStats() {
  let meetingCount = 0;
  let totalSites = Object.keys(siteRegistry).length;

  for (const siteId of Object.keys(siteRegistry)) {
    const siteRecords = allRecords.filter(r => r.site_id === siteId && r.sample_date <= viewAsOfDate);
    const status = getComplianceStatus(siteId, siteRecords, siteRegistry);
    if (status === 'compliant' || status === 'borderline') {
      meetingCount++;
    }
  }

  const rate = totalSites > 0 ? (meetingCount / totalSites) * 100 : 0;
  document.getElementById('metric-compliance-rate').innerText = `${rate.toFixed(0)}%`;
  document.getElementById('metric-active-alerts').innerText = activeAlerts.length;
  const stats = getPilotDayStats('2025-01-01');
  document.getElementById('metric-days-left').innerText = `${stats.daysRemaining} days`;
}

function renderComplianceDirectory() {
  const tbody = document.querySelector('#compliance-directory-table tbody');
  tbody.innerHTML = '';

  const siteRowsData = [];

  for (const [siteId, site] of Object.entries(siteRegistry)) {
    const allSiteRecords = allRecords.filter(r => r.site_id === siteId && r.sample_date <= viewAsOfDate);
    allSiteRecords.sort((a, b) => new Date(b.sample_date) - new Date(a.sample_date));
    const lastSampleDate = allSiteRecords.length > 0 ? allSiteRecords[0].sample_date : '-';
    const tier = getSchedulingTier(siteId, allSiteRecords);
    let nextDueDate = '-';
    if (allSiteRecords.length > 0) {
      const offset = tier === 'weekly' ? 7 : 30;
      const nextTime = new Date(new Date(lastSampleDate).getTime() + offset * 24 * 60 * 60 * 1000);
      nextDueDate = nextTime.toISOString().split('T')[0];
    } else {
      nextDueDate = 'Immediate';
    }

    const viewTime = new Date(viewAsOfDate).getTime();
    const cutoffTime = viewTime - 90 * 24 * 60 * 60 * 1000;
    const recordsIn90Days = allSiteRecords.filter(r => {
      const sampleTime = new Date(r.sample_date).getTime();
      return sampleTime >= cutoffTime && sampleTime <= viewTime;
    });

    let rate = 0;
    if (recordsIn90Days.length > 0) {
      const detections = recordsIn90Days.filter(r => r.detected === true).length;
      rate = (detections / recordsIn90Days.length) * 100;
    }

    const status = getComplianceStatus(siteId, allSiteRecords, siteRegistry);

    // Filter by compliance status dropdown
    if (complianceFilters.status !== 'ALL' && status !== complianceFilters.status) continue;

    // Filter by search string
    const matchSearch = site.name.toLowerCase().includes(complianceFilters.search) ||
                        site.county.toLowerCase().includes(complianceFilters.search) ||
                        site.municipality.toLowerCase().includes(complianceFilters.search) ||
                        siteId.toLowerCase().includes(complianceFilters.search);
                        
    if (complianceFilters.search && !matchSearch) continue;

    siteRowsData.push({
      id: siteId,
      name: site.name,
      county: site.county,
      phase: site.phase,
      tier: tier,
      last_sample: lastSampleDate,
      next_due: nextDueDate,
      rate: rate,
      status: status,
      records: allSiteRecords
    });
  }

  siteRowsData.sort((a, b) => {
    let valA = a[sortColumn];
    let valB = b[sortColumn];

    if (sortColumn === 'rate') {
      valA = a.rate;
      valB = b.rate;
    }

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  siteRowsData.forEach(row => {
    // Styling row backgrounds
    let statusClass = "compliant";
    let statusBadge = "Compliant";
    let statusBadgeClass = "badge-clear";

    if (row.status === 'borderline') {
      statusClass = "borderline";
      statusBadge = "Borderline";
      statusBadgeClass = "badge-flagged";
    } else if (row.status === 'overdue') {
      statusClass = "overdue";
      statusBadge = "Overdue";
      statusBadgeClass = "badge-flagged";
    } else if (row.status === 'non_compliant') {
      statusClass = "non_compliant";
      statusBadge = "Non-Compliant";
      statusBadgeClass = "badge-alert";
    }

    const tr = document.createElement('tr');
    tr.className = `clickable-row ${statusClass}`;
    tr.id = `row-site-${row.id}`;
    tr.innerHTML = `
      <td><strong>${row.name}</strong></td>
      <td>${row.county}</td>
      <td>Phase ${row.phase}</td>
      <td><span style="font-size:0.75rem;">${row.tier.toUpperCase()}</span></td>
      <td>${row.last_sample}</td>
      <td>${row.next_due}</td>
      <td>${row.rate.toFixed(0)}%</td>
      <td><span class="badge ${statusBadgeClass}">${statusBadge}</span></td>
    `;

    const expandTr = document.createElement('tr');
    expandTr.className = 'expandable-row';
    expandTr.style.display = 'none';
    expandTr.id = `expand-site-${row.id}`;

    const sortedHist = [...row.records].sort((a,b) => new Date(a.sample_date) - new Date(b.sample_date));
    let miniTableRows = '';
    sortedHist.forEach(r => {
      miniTableRows += `
        <tr>
          <td>${r.sample_date}</td>
          <td>${r.target_gene}</td>
          <td>${r.detected ? `<span style="color:#b91c1c; font-weight:600;">Detected (${r.concentration} ${r.concentration_unit})</span>` : 'Clean'}</td>
          <td>${r.device_type}</td>
          <td>${r.confidence_score.toFixed(3)}</td>
        </tr>
      `;
    });

    if (sortedHist.length === 0) {
      miniTableRows = '<tr><td colspan="5" style="text-align: center; color: #64748b;">No samples submitted yet.</td></tr>';
    }

    expandTr.innerHTML = `
      <td colspan="8">
        <div class="expanded-content">
          <h4>Submission History for ${row.name}</h4>
          <div class="table-wrapper" style="max-height: 200px; margin-bottom: 0.75rem;">
            <table class="data-table" style="background:#ffffff;">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Target Gene</th>
                  <th>Result</th>
                  <th>Device Type</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                ${miniTableRows}
              </tbody>
            </table>
          </div>
          <div style="display:flex; justify-content:flex-end;">
            <button class="btn btn-secondary btn-csv" data-id="${row.id}" style="font-size:0.8rem; padding: 0.4rem 0.8rem;">
              Download all records as CSV
            </button>
          </div>
        </div>
      </td>
    `;

    tr.onclick = (e) => {
      if (e.target.closest('button')) return;
      
      const expandRow = document.getElementById(`expand-site-${row.id}`);
      if (expandRow.style.display === 'none') {
        expandRow.style.display = 'table-row';
      } else {
        expandRow.style.display = 'none';
      }
    };

    tbody.appendChild(tr);
    tbody.appendChild(expandTr);
  });

  tbody.querySelectorAll('.btn-csv').forEach(btn => {
    btn.onclick = () => {
      const siteId = btn.getAttribute('data-id');
      downloadSiteRecordsCSV(siteId);
    };
  });
}

function downloadSiteRecordsCSV(siteId) {
  const siteRecords = allRecords.filter(r => r.site_id === siteId);
  const site = siteRegistry[siteId];

  const headers = [
    "Record ID", "Site ID", "Site Name", "County", "Municipality", "Sample Date",
    "Device Type", "Target Gene", "ARO Number", "Drug Class", "Detected", 
    "Concentration", "Concentration Unit", "Confidence Score", "Compliance Status"
  ];

  let csvContent = headers.join(",") + "\n";
  siteRecords.forEach(r => {
    const row = [
      r.record_id, r.site_id, `"${site.name}"`, r.county, r.municipality, r.sample_date,
      r.device_type, r.target_gene, r.aro_number, `"${r.drug_class}"`, r.detected,
      r.concentration, r.concentration_unit, r.confidence_score, r.compliance_status || "compliant"
    ];
    csvContent += row.join(",") + "\n";
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', `${siteId}_compliance_records.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function initResearch() {
  researchMap = L.map('research-map').setView([40.0, -74.5], 7.5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(researchMap);

  researchChoroplethLayer = L.layerGroup().addTo(researchMap);

  const btnArg = document.getElementById('btn-metric-arg');
  const btnAlz = document.getElementById('btn-metric-alzheimers');
  const btnPk = document.getElementById('btn-metric-parkinsons');

  const updateButtons = (activeBtn) => {
    [btnArg, btnAlz, btnPk].forEach(btn => btn.classList.remove('active'));
    activeBtn.classList.add('active');
  };

  btnArg.onclick = () => { activeResearchMetric = 'arg'; updateButtons(btnArg); renderResearchChoropleth(); };
  btnAlz.onclick = () => { activeResearchMetric = 'alzheimers'; updateButtons(btnAlz); renderResearchChoropleth(); };
  btnPk.onclick = () => { activeResearchMetric = 'parkinsons'; updateButtons(btnPk); renderResearchChoropleth(); };

  document.querySelectorAll('input[name="scatter-disease-select"]').forEach(radio => {
    radio.addEventListener('change', () => {
      activeResearchDisease = radio.value;
      renderResearchScatterPlot();
    });
  });
}

function getCountyArgRates() {
  const rates = {};
  Object.keys(neuroData).forEach(county => {
    rates[county] = { total: 0, detections: 0 };
  });

  allRecords.forEach(r => {
    if (r.county && rates[r.county] && r.sample_date <= viewAsOfDate) {
      rates[r.county].total++;
      if (r.detected === true) {
        rates[r.county].detections++;
      }
    }
  });

  const finalRates = {};
  Object.keys(rates).forEach(county => {
    const data = rates[county];
    finalRates[county] = data.total > 0 ? (data.detections / data.total) * 100 : 0;
  });

  return finalRates;
}

function getArgColor(val) {
  return val > 30 ? '#7f2d1d' :
         val > 20 ? '#ba4a00' :
         val > 15 ? '#d35400' :
         val > 10 ? '#e67e22' :
         val > 5  ? '#f39c12' :
         val > 2  ? '#f5b041' : '#f9e79f';
}

function getDiseaseColor(val) {
  return val > 35 ? '#4a148c' :
         val > 25 ? '#6a1b9a' :
         val > 20 ? '#8e24aa' :
         val > 15 ? '#ab47bc' :
         val > 10 ? '#ba68c8' :
         val > 5  ? '#d1c4e9' : '#ede7f6';
}

function renderResearchChoropleth() {
  researchChoroplethLayer.clearLayers();
  
  if (!njCountiesGeoJson) return;

  const argRates = getCountyArgRates();

  L.geoJSON(njCountiesGeoJson, {
    style: (feature) => {
      const county = feature.properties.NAME;
      let val = 0;
      let color = '#ffffff';

      if (activeResearchMetric === 'arg') {
        val = argRates[county] || 0;
        color = getArgColor(val);
      } else if (activeResearchMetric === 'alzheimers') {
        val = neuroData[county]?.alzheimersRate || 0;
        color = getDiseaseColor(val);
      } else {
        val = neuroData[county]?.parkinsonsRate || 0;
        color = getDiseaseColor(val);
      }

      return {
        fillColor: color,
        weight: 1.5,
        opacity: 0.9,
        color: '#475569',
        fillOpacity: 0.75
      };
    },
    onEachFeature: (feature, layer) => {
      const county = feature.properties.NAME;
      const argVal = argRates[county] || 0;
      const alzVal = neuroData[county]?.alzheimersRate || 0;
      const pkVal = neuroData[county]?.parkinsonsRate || 0;

      let popupContent = `
        <div style="font-family:'Inter',sans-serif; font-size:0.8rem;">
          <h4 style="margin:0 0 0.25rem 0; font-weight:700;">${county} County</h4>
          <strong>ARG Detection Rate:</strong> ${argVal.toFixed(1)}%<br>
          <strong>Alzheimer's Death Rate:</strong> ${alzVal.toFixed(1)} per 100k<br>
          <strong>Parkinson's Death Rate:</strong> ${pkVal.toFixed(1)} per 100k
        </div>
      `;
      layer.bindTooltip(popupContent, { sticky: true });
    }
  }).addTo(researchChoroplethLayer);
}

function calculateRegression(points) {
  const n = points.length;
  if (n < 2) return { m: 0, b: 0, r2: 0, linePoints: [] };

  let sumX = 0, sumY = 0;
  points.forEach(p => {
    sumX += p.x;
    sumY += p.y;
  });

  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let den = 0;

  points.forEach(p => {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) ** 2;
  });

  const m = den !== 0 ? num / den : 0;
  const b = meanY - m * meanX;

  // Calculate R2
  let ssTot = 0;
  let ssRes = 0;
  points.forEach(p => {
    ssTot += (p.y - meanY) ** 2;
    const predictedY = m * p.x + b;
    ssRes += (p.y - predictedY) ** 2;
  });

  const r2 = ssTot !== 0 ? 1 - (ssRes / ssTot) : 0;

  // Generate 2 points representing the line
  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));

  const linePoints = [
    { x: minX, y: m * minX + b },
    { x: maxX, y: m * maxX + b }
  ];

  return { m, b, r2, linePoints };
}

function renderResearchScatterPlot() {
  const argRates = getCountyArgRates();
  
  const points = [];
  Object.keys(neuroData).forEach(county => {
    const x = argRates[county] || 0;
    const y = activeResearchDisease === 'alzheimers' 
      ? neuroData[county].alzheimersRate 
      : neuroData[county].parkinsonsRate;
    
    points.push({ x, y, county });
  });

  const regression = calculateRegression(points);
  const diseaseLabel = activeResearchDisease === 'alzheimers' ? "Alzheimer's" : "Parkinson's";

  const ctx = document.getElementById('research-scatter-chart').getContext('2d');
  if (researchScatterChart) {
    researchScatterChart.destroy();
  }

  // Draw scatter + line
  researchScatterChart = new Chart(ctx, {
    data: {
      datasets: [
        {
          type: 'scatter',
          label: 'NJ Counties',
          data: points.map(p => ({ x: p.x, y: p.y })),
          backgroundColor: '#6a1b9a',
          borderColor: '#4a148c',
          borderWidth: 1,
          pointRadius: 6,
          pointHoverRadius: 8
        },
        {
          type: 'line',
          label: 'Regression Line',
          data: regression.linePoints,
          borderColor: '#ef4444',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { display: true, text: 'Environmental ARG Detection Rate (%)' },
          min: 0
        },
        y: {
          title: { display: true, text: `${diseaseLabel} Death Rate (per 100,000)` }
        }
      },
      plugins: {
        legend: { position: 'top' },
        title: {
          display: true,
          text: `Correlation Analysis (R² = ${regression.r2.toFixed(3)})`,
          font: { size: 13, weight: 'bold' }
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              if (context.datasetIndex === 0) {
                const pt = points[context.dataIndex];
                return `${pt.county}: (${pt.x.toFixed(1)}%, ${pt.y.toFixed(1)})`;
              }
              return `Regression: y = ${regression.m.toFixed(2)}x + ${regression.b.toFixed(2)}`;
            }
          }
        }
      }
    }
  });
}
