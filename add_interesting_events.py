"""
add_interesting_events.py
Adds 7 compelling demo events to the synthetic dataset:
1. Carbapenem outbreak at Passaic Valley (WWTP_09) in month 4
2. Hospital achieves 90-day clearance in month 11
3. Surface water site fails Phase 1 performance standard
4. Colistin resistance at agricultural site
5. Multi-drug resistant cluster at Bergen WWTP_01
6. Vancomycin resistance at Hunterdon agricultural site
7. Aminoglycoside spike at Hackettstown WWTP_13

Idempotent: removes existing EVENT records before re-injecting.
"""

import json
import os

JSON_PATH = os.path.join(os.path.dirname(__file__), 'synthetic_records.json')

# Site coordinates from site_registry.js
SITE_COORDS = {
    'WWTP_09': {'lat': 40.7128, 'lng': -74.1345},
    'HOSPITAL_01': {'lat': 40.9458, 'lng': -74.0628},
    'SURFACE_WATER_01': {'lat': 40.9164, 'lng': -74.1820},
    'AGRICULTURAL_01': {'lat': 39.5910, 'lng': -75.4670},
    'WWTP_01': {'lat': 40.8327, 'lng': -74.0323},
    'AGRICULTURAL_03': {'lat': 40.5560, 'lng': -74.8230},
    'WWTP_13': {'lat': 40.8174, 'lng': -74.8327},
}

# Gene metadata from lookup.js (drug_class, mechanism, aro_number)
GENE_METADATA = {
    "KPC-2": {"drug_class": "carbapenem", "mechanism": "antibiotic inactivation", "aro": "ARO:3003510"},
    "KPC-3": {"drug_class": "carbapenem", "mechanism": "antibiotic inactivation", "aro": "ARO:3000069"},
    "NDM-1": {"drug_class": "carbapenem", "mechanism": "antibiotic inactivation", "aro": "ARO:3000590"},
    "OXA-48": {"drug_class": "carbapenem", "mechanism": "antibiotic inactivation", "aro": "ARO:3001799"},
    "CTX-M-15": {"drug_class": "cephalosporin", "mechanism": "antibiotic inactivation", "aro": "ARO:3000590"},
    "SHV-12": {"drug_class": "cephalosporin", "mechanism": "antibiotic inactivation", "aro": "ARO:3000590"},
    "TEM-1": {"drug_class": "penicillin", "mechanism": "antibiotic inactivation", "aro": "ARO:3000413"},
    "mecA": {"drug_class": "methicillin", "mechanism": "antibiotic target replacement", "aro": "ARO:3000690"},
    "vanA": {"drug_class": "glycopeptide antibiotic", "mechanism": "antibiotic target alteration", "aro": "ARO:3000010"},
    "mcr-1": {"drug_class": "peptide antibiotic", "mechanism": "antibiotic target alteration", "aro": "ARO:3003689"},
    "aac(3)-IIa": {"drug_class": "aminoglycoside antibiotic", "mechanism": "antibiotic inactivation", "aro": "ARO:3000167"},
    "aac(6')-Ie/aph(2'')-Ia": {"drug_class": "aminoglycoside antibiotic", "mechanism": "antibiotic inactivation", "aro": "ARO:3000219"},
}


def make_event(site_id, sample_date, gene, detected, concentration, confidence):
    coords = SITE_COORDS.get(site_id, {'lat': 0, 'lng': 0})
    site_type = 'WWTP' if site_id.startswith('WWTP') else (
        'HOSPITAL' if site_id.startswith('HOSPITAL') else (
        'SURFACE_WATER' if site_id.startswith('SURFACE_WATER') else 'AGRICULTURAL'))
    
    # Get gene metadata from GENE_METADATA dictionary
    gene_meta = GENE_METADATA.get(gene, {})
    
    return {
        'record_id': f'{site_id}_{sample_date.replace("-", "")}_{gene}_EVENT',
        'site_id': site_id,
        'site_type': site_type,
        'county': '',
        'municipality': '',
        'lat': coords['lat'],
        'lng': coords['lng'],
        'sample_date': sample_date,
        'device_type': 'PCR',
        'device_id': 'DEMO_EVENT',
        'target_gene': gene,
        'aro_number': gene_meta.get('aro', ''),
        'canonical_name': gene,
        'drug_class': gene_meta.get('drug_class', ''),
        'mechanism': gene_meta.get('mechanism', ''),
        'detected': detected,
        'detection_status': 'CONFIRMED' if detected else 'NOT_DETECTED',
        'ct_value': round(22.5, 2) if detected else None,
        'concentration': concentration if detected else 0,
        'concentration_unit': 'COPIES_PER_ML',
        'confidence_score': confidence,
        'raw_target_name': gene,
        'raw_device_fields': '{}',
        'submitted_by': 'demo_injector',
        'upload_timestamp': f'{sample_date}T14:00:00Z',
        'normalization_timestamp': f'{sample_date}T14:00:00Z',
        'validation_status': None,
        'validation_flags': [],
        'compliance_status': None,
        'compliance_note': None,
        'clearance_achieved': None,
        'data_quality_flag': 'PASS',
    }


def main():
    with open(JSON_PATH, 'r', encoding='utf-8') as f:
        records = json.load(f)

    # Idempotent: remove any previously injected EVENT records
    records = [r for r in records if not r.get('record_id', '').endswith('_EVENT')]

    events = [
        make_event('WWTP_09', '2025-04-15', 'KPC-2', True, 12500.0, 0.99),
        make_event('WWTP_09', '2025-04-15', 'KPC-3', True, 8700.0, 0.99),
        make_event('WWTP_09', '2025-04-15', 'NDM-1', True, 5400.0, 0.99),
        make_event('WWTP_09', '2025-04-15', 'OXA-48', True, 3200.0, 0.99),

        make_event('HOSPITAL_01', '2025-11-01', 'CTX-M-15', False, 0, 0.95),

        make_event('SURFACE_WATER_01', '2025-08-20', 'CTX-M-15', True, 6800.0, 0.99),
        make_event('SURFACE_WATER_01', '2025-08-20', 'SHV-12', True, 4200.0, 0.99),
        make_event('SURFACE_WATER_01', '2025-08-20', 'TEM-1', True, 9100.0, 0.99),

        make_event('AGRICULTURAL_01', '2025-06-10', 'mcr-1', True, 2800.0, 0.99),

        make_event('WWTP_01', '2025-09-05', 'NDM-1', True, 7500.0, 0.99),
        make_event('WWTP_01', '2025-09-05', 'mecA', True, 6200.0, 0.98),
        make_event('WWTP_01', '2025-09-05', 'vanA', True, 4800.0, 0.99),
        make_event('WWTP_01', '2025-09-05', 'mcr-1', True, 3600.0, 0.98),
        make_event('WWTP_01', '2025-09-05', 'CTX-M-15', True, 11000.0, 0.99),

        make_event('AGRICULTURAL_03', '2025-07-22', 'vanA', True, 5100.0, 0.99),

        make_event('WWTP_13', '2026-02-14', 'aac(3)-IIa', True, 15000.0, 0.99),
        make_event('WWTP_13', '2026-02-14', "aac(6')-Ie/aph(2'')-Ia", True, 9800.0, 0.99),
    ]

    records.extend(events)
    print(f"Added {len(events)} event records")

    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(records, f, indent=2)

    print(f"Total records: {len(records)}")


if __name__ == '__main__':
    main()
