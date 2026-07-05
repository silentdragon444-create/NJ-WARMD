"""
synthetic_data.py
Generates 2 years of synthetic ARB/ARG monitoring data for the NJ water monitoring pilot program.
Reads site_registry.js to get site definitions, then generates canonical records.
"""

import json
import math
import random
import re
import os
from datetime import datetime, timedelta

random.seed(42)

SITE_REGISTRY_PATH = os.path.join(os.path.dirname(__file__), 'site_registry.js')
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), 'synthetic_records.json')

# Top clinically significant ARG targets (one per ARO entry for variety)
# All genes must exist in lookup.js aroLookup
TARGET_GENES = [
    "KPC-2", "KPC-3", "NDM-1", "OXA-48", "VIM-1", "IMP-1",
    "CTX-M-15", "CTX-M-14", "SHV-12", "TEM-1",
    "mecA", "mecC",
    "vanA", "vanB",
    "qnrS1", "qnrB1", "aac(6')-Ib-cr",
    "aac(3)-IIa", "aac(6')-Ie/aph(2'')-Ia",
    "mcr-1", "mcr-3",
    "tetA", "tetM", "tetX",
]

# Gene metadata from lookup.js (drug_class, mechanism, aro_number)
GENE_METADATA = {
    "KPC-2": {"drug_class": "carbapenem", "mechanism": "antibiotic inactivation", "aro": "ARO:3003510"},
    "KPC-3": {"drug_class": "carbapenem", "mechanism": "antibiotic inactivation", "aro": "ARO:3000069"},
    "NDM-1": {"drug_class": "carbapenem", "mechanism": "antibiotic inactivation", "aro": "ARO:3000590"},
    "OXA-48": {"drug_class": "carbapenem", "mechanism": "antibiotic inactivation", "aro": "ARO:3001799"},
    "VIM-1": {"drug_class": "carbapenem", "mechanism": "antibiotic inactivation", "aro": "ARO:3000855"},
    "IMP-1": {"drug_class": "carbapenem", "mechanism": "antibiotic inactivation", "aro": "ARO:3000855"},
    "CTX-M-15": {"drug_class": "cephalosporin", "mechanism": "antibiotic inactivation", "aro": "ARO:3000590"},
    "CTX-M-14": {"drug_class": "cephalosporin", "mechanism": "antibiotic inactivation", "aro": "ARO:3000590"},
    "SHV-12": {"drug_class": "cephalosporin", "mechanism": "antibiotic inactivation", "aro": "ARO:3000590"},
    "TEM-1": {"drug_class": "penicillin", "mechanism": "antibiotic inactivation", "aro": "ARO:3000413"},
    "mecA": {"drug_class": "methicillin", "mechanism": "antibiotic target replacement", "aro": "ARO:3000690"},
    "mecC": {"drug_class": "methicillin", "mechanism": "antibiotic target replacement", "aro": "ARO:3001213"},
    "vanA": {"drug_class": "glycopeptide antibiotic", "mechanism": "antibiotic target alteration", "aro": "ARO:3000010"},
    "vanB": {"drug_class": "glycopeptide antibiotic", "mechanism": "antibiotic target alteration", "aro": "ARO:3000011"},
    "qnrS1": {"drug_class": "fluoroquinolone", "mechanism": "antibiotic target protection", "aro": "ARO:3000448"},
    "qnrB1": {"drug_class": "fluoroquinolone", "mechanism": "antibiotic target protection", "aro": "ARO:3000442"},
    "aac(6')-Ib-cr": {"drug_class": "aminoglycoside antibiotic;fluoroquinolone antibiotic", "mechanism": "antibiotic inactivation", "aro": "ARO:3002547"},
    "aac(3)-IIa": {"drug_class": "aminoglycoside antibiotic", "mechanism": "antibiotic inactivation", "aro": "ARO:3000167"},
    "aac(6')-Ie/aph(2'')-Ia": {"drug_class": "aminoglycoside antibiotic", "mechanism": "antibiotic inactivation", "aro": "ARO:3000219"},
    "mcr-1": {"drug_class": "peptide antibiotic", "mechanism": "antibiotic target alteration", "aro": "ARO:3003689"},
    "mcr-3": {"drug_class": "peptide antibiotic", "mechanism": "antibiotic target alteration", "aro": "ARO:3004139"},
    "tetA": {"drug_class": "tetracycline antibiotic", "mechanism": "antibiotic efflux", "aro": "ARO:3000196"},
    "tetM": {"drug_class": "tetracycline antibiotic", "mechanism": "antibiotic target protection", "aro": "ARO:3000186"},
    "tetX": {"drug_class": "tetracycline antibiotic", "mechanism": "antibiotic inactivation", "aro": "ARO:3000205"},
}

def parse_site_registry(filepath):
    """Parse the JS site_registry.js file to extract site data."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Extract the main object content between { and the final };
    match = re.search(r'export\s+const\s+siteRegistry\s*=\s*({.*?});\s*$', content, re.DOTALL)
    if not match:
        raise ValueError("Could not find siteRegistry in JS file")

    obj_str = match.group(1)
    # Replace JS-style keys without quotes with quoted keys
    # This is a simplified parser — assumes consistent formatting
    sites = {}
    # Find each top-level key-value pair
    pattern = re.compile(r'"([^"]+)"\s*:\s*\{([^}]+)\}', re.DOTALL)
    for m in pattern.finditer(obj_str):
        site_id = m.group(1)
        fields_str = m.group(2)
        site = {}
        for fname, fval in re.findall(r'"([^"]+)"\s*:\s*"([^"]*)"', fields_str):
            site[fname] = fval
        for fname, fval in re.findall(r'"([^"]+)"\s*:\s*(-?[0-9.]+)', fields_str):
            site[fname] = float(fval) if '.' in fval else int(fval)
        for fname, fval in re.findall(r'"([^"]+)"\s*:\s*(true|false)', fields_str):
            site[fname] = fval == 'true'
        sites[site_id] = site
    return sites


def detection_probability(site_type, month, month_index, improvement_factor):
    """Calculate detection probability for a site type, accounting for seasonality and improvement."""
    base_probs = {
        'WWTP': 0.5,
        'HOSPITAL': 0.15,
        'SURFACE_WATER': 0.25,
        'AGRICULTURAL': 0.35,
    }
    base = base_probs.get(site_type, 0.2)

    # Seasonal sine wave: peaks in July (month 7), trough in January (month 1)
    seasonal = 1.0 + 0.4 * math.sin((month - 4) * math.pi / 6)

    prob = base * seasonal * improvement_factor
    return min(prob, 0.95)


def generate_concentration(site_type, detected):
    """Generate concentration value if detected."""
    if not detected:
        return 0
    if site_type == 'WWTP':
        return round(10 ** (random.gauss(3.5, 0.8)), 2)
    else:
        return round(10 ** (random.gauss(2.8, 0.6)), 2)


def generate_records_for_site(site_id, site, start_date, num_months):
    """Generate 2 years of records for a single site."""
    records = []
    tier = site.get('schedulingTier', 'monthly')
    interval_days = 7 if tier == 'weekly' else 30

    if tier == 'weekly':
        interval_days = 7
    else:
        interval_days = 30

    site_type = site.get('type', 'WWTP')

    # Generate records at regular intervals
    cur_date = start_date
    end_date = start_date + timedelta(days=730)

    record_counter = 0
    while cur_date < end_date:
        month = cur_date.month
        elapsed_months = (cur_date.year - start_date.year) * 12 + (cur_date.month - start_date.month)
        total_months = 24

        # Improvement factor: 30% reduction over 2 years
        improvement_factor = 1.0 - 0.30 * (elapsed_months / total_months)

        for gene in TARGET_GENES:
            prob = detection_probability(site_type, month, elapsed_months, improvement_factor)
            detected = random.random() < prob
            conc = generate_concentration(site_type, detected)

            if not detected:
                detection_status = 'NOT_DETECTED'
            elif conc > 1000:
                detection_status = 'CONFIRMED'
            elif conc > 100:
                detection_status = 'PROBABLE'
            else:
                detection_status = 'BORDERLINE'

            if detected:
                confidence = round(random.uniform(0.85, 0.99), 4)
            else:
                confidence = round(random.uniform(0.70, 0.95), 4)

            record_counter += 1

            # Get gene metadata from GENE_METADATA dictionary
            gene_meta = GENE_METADATA.get(gene, {})

            records.append({
                'record_id': f'{site_id}_{cur_date.strftime("%Y%m%d")}_{gene.replace("-", "_").replace("/", "_")}_{record_counter}',
                'site_id': site_id,
                'site_type': site_type,
                'county': site.get('county', ''),
                'municipality': site.get('municipality', ''),
                'lat': site.get('lat', 0),
                'lng': site.get('lng', 0),
                'sample_date': cur_date.strftime('%Y-%m-%d'),
                'device_type': 'PCR',
                'device_id': f'SYNTHETIC_{site_id}',
                'target_gene': gene,
                'aro_number': gene_meta.get('aro', ''),
                'canonical_name': gene,
                'drug_class': gene_meta.get('drug_class', ''),
                'mechanism': gene_meta.get('mechanism', ''),
                'detected': detected,
                'detection_status': detection_status,
                'ct_value': round(random.uniform(20, 38), 2) if detected else None,
                'concentration': conc,
                'concentration_unit': 'COPIES_PER_ML',
                'confidence_score': confidence,
                'raw_target_name': gene,
                'raw_device_fields': '{}',
                'submitted_by': 'synthetic_generator',
                'upload_timestamp': cur_date.strftime('%Y-%m-%dT12:00:00Z'),
                'normalization_timestamp': cur_date.strftime('%Y-%m-%dT12:00:00Z'),
                'validation_status': None,
                'validation_flags': [],
                'compliance_status': None,
                'compliance_note': None,
                'clearance_achieved': None,
                'data_quality_flag': 'PASS',
            })

        cur_date += timedelta(days=interval_days)

    return records


def main():
    print("Parsing site registry...")
    sites = parse_site_registry(SITE_REGISTRY_PATH)
    print(f"Found {len(sites)} sites")

    start_date = datetime(2025, 1, 1)
    all_records = []

    for site_id, site in sorted(sites.items()):
        records = generate_records_for_site(site_id, site, start_date, 24)
        all_records.extend(records)
        print(f"  {site_id} ({site.get('type', '?')}) -> {len(records)} records")

    print(f"\nTotal synthetic records generated: {len(all_records)}")

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(all_records, f, indent=2)

    print(f"Written to {OUTPUT_PATH}")


if __name__ == '__main__':
    main()
