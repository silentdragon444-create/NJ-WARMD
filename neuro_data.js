// neuro_data.js
// NJ county-level age-adjusted death rates (per 100,000 population)
// Alzheimer's: 2021-2023 NJSHAD data (3-year aggregated)
//   Source: NJSHAD Health Data Query, Alzheimer's disease mortality (ICD-10 G30)
//   Rates are age-adjusted per 100,000. Counties without sufficient deaths use NJ statewide rate.
// Parkinson's: County-level data not available from NJSHAD.
//   Using statewide age-adjusted rate of 6.5 per 100,000 for all counties.
//   Source: NJSHAD, Parkinson's disease (ICD-10 G20), 2021-2023 statewide.

const neuroData = {
    "Atlantic": { alzheimersRate: 27.7, parkinsonsRate: 6.5 },
    "Bergen": { alzheimersRate: 21.6, parkinsonsRate: 6.5 },
    "Burlington": { alzheimersRate: 19.6, parkinsonsRate: 6.5 },
    "Camden": { alzheimersRate: 25.6, parkinsonsRate: 6.5 },
    "Cape May": { alzheimersRate: 42.0, parkinsonsRate: 6.5 },
    "Cumberland": { alzheimersRate: 26.4, parkinsonsRate: 6.5 },
    "Essex": { alzheimersRate: 14.4, parkinsonsRate: 6.5 },
    "Gloucester": { alzheimersRate: 31.6, parkinsonsRate: 6.5 },
    "Hudson": { alzheimersRate: 15.8, parkinsonsRate: 6.5 },
    "Hunterdon": { alzheimersRate: 9.3, parkinsonsRate: 6.5 },
    "Mercer": { alzheimersRate: 16.1, parkinsonsRate: 6.5 },
    "Middlesex": { alzheimersRate: 14.0, parkinsonsRate: 6.5 },
    "Monmouth": { alzheimersRate: 19.2, parkinsonsRate: 6.5 },
    "Morris": { alzheimersRate: 23.4, parkinsonsRate: 6.5 },
    "Ocean": { alzheimersRate: 19.8, parkinsonsRate: 6.5 },
    "Passaic": { alzheimersRate: 18.0, parkinsonsRate: 6.5 },
    "Salem": { alzheimersRate: 20.6, parkinsonsRate: 6.5 },
    "Somerset": { alzheimersRate: 15.9, parkinsonsRate: 6.5 },
    "Sussex": { alzheimersRate: 23.2, parkinsonsRate: 6.5 },
    "Union": { alzheimersRate: 17.4, parkinsonsRate: 6.5 },
    "Warren": { alzheimersRate: 14.1, parkinsonsRate: 6.5 }
};

// Export for use in maps/modules
export default neuroData;