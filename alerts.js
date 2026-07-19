export const drugClassAlerts = {
    carbapenem: {
        headline: "CRITICAL HEALTH ADVISORY: Confirmed detection of Carbapenem-Resistant Enterobacteriaceae (CRE) genetic markers in public water systems.",
        explanation: "Carbapenems are broad-spectrum beta-lactam antibiotics reserved as a critical line of defense for treating severe, multidrug-resistant bacterial infections. The detection of carbapenem resistance genes (such as NDM, KPC, or OXA) indicates that environmental bacteria carry traits that render these vital frontline treatments ineffective, representing a serious clinical threat.",
        whatToDo: "Do not consume untreated water. Bring all water to a rolling boil for at least one full minute, or use bottled water for drinking, cooking, brushing teeth, and food preparation. If you exhibit symptoms of a severe bacterial infection (such as high fever, chills, or persistent gastrointestinal distress), consult a medical professional immediately. Local water utilities are conducting emergency flushing and confirmatory testing.",
        severity: "critical"
    },

    polymyxin: {
        headline: "CRITICAL HEALTH ADVISORY: Confirmed detection of mobile colistin resistance (mcr) genes in public water systems.",
        explanation: "Colistin is a polymyxin antibiotic utilized as a vital therapeutic option of last resort for patients suffering from highly resistant Gram-negative infections. The presence of mobile colistin resistance (mcr) genes is a critical public health concern because these markers can easily transfer horizontally between bacterial species, threatening the utility of last-line clinical defenses.",
        whatToDo: "Avoid drinking untreated water. Boil water for at least one full minute or utilize bottled water for drinking and cooking. If you exhibit signs of infection, contact your healthcare provider immediately and reference the local environmental water quality monitoring reports. Public health departments are executing emergency response protocols.",
        severity: "critical"
    },

    peptide: {
        headline: "CRITICAL HEALTH ADVISORY: Confirmed detection of mobile colistin resistance (mcr) genes in public water systems.",
        explanation: "Colistin is a polymyxin antibiotic utilized as a vital therapeutic option of last resort for patients suffering from highly resistant Gram-negative infections. The presence of mobile colistin resistance (mcr) genes is a critical public health concern because these markers can easily transfer horizontally between bacterial species, threatening the utility of last-line clinical defenses.",
        whatToDo: "Avoid drinking untreated water. Boil water for at least one full minute or utilize bottled water for drinking and cooking. If you exhibit signs of infection, contact your healthcare provider immediately and reference the local environmental water quality monitoring reports. Public health departments are executing emergency response protocols.",
        severity: "critical"
    },

    cephalosporin: {
        headline: "WATER QUALITY ADVISORY: Elevated levels of Extended-Spectrum Beta-Lactamase (ESBL) cephalosporin resistance genes.",
        explanation: "Extended-spectrum cephalosporins are widely utilized to combat routine bacterial infections, including urinary tract infections and pneumonia. An increase in environmental cephalosporin resistance genes (such as CTX-M) indicates an elevated prevalence of resistant organisms in local water resources, which may increase the risk of treatment failure with standard oral antibiotics.",
        whatToDo: "Avoid swimming, wading, or boating in affected local surface waters, especially for individuals with open wounds, cuts, or compromised immune systems. If you develop symptoms of a skin, soft-tissue, or systemic infection following contact with local waterways, seek prompt medical evaluation. Utilities are currently tracking these concentrations.",
        severity: "high"
    },

    methicillin: {
        headline: "WATER QUALITY ADVISORY: Methicillin-resistant Staphylococcus aureus (MRSA) genetic markers detected in local monitoring stations.",
        explanation: "Methicillin resistance indicates the presence of Staphylococcus strains resistant to common beta-lactam antibiotics, including penicillins and early-generation cephalosporins. Environmental presence of the mecA or mecC genes suggests potential dissemination of strains capable of causing aggressive skin, blood, or soft-tissue infections that are difficult to manage in clinical settings.",
        whatToDo: "Ensure all skin cuts, scrapes, and abrasions are kept clean, disinfected, and securely covered, especially after recreational contact with local water bodies. Avoid sharing personal care items such as towels or athletic gear. Seek immediate medical attention if any skin infection becomes red, warm, swollen, or produces discharge.",
        severity: "high"
    },

    vancomycin: {
        headline: "WATER QUALITY ADVISORY: Vancomycin-resistant Enterococci (VRE) genetic indicators confirmed at local monitoring stations.",
        explanation: "Vancomycin is a glycopeptide antibiotic reserved for treating serious Gram-positive infections that are resistant to other treatments. The presence of vanA or vanB genes indicates enterococci or other organisms carry resistance to this essential clinical agent, presenting challenges for hospital infection control and community health.",
        whatToDo: "Practice strict hand hygiene, particularly after restroom use and before preparing food. If you are undergoing clinical treatment or have a weakened immune system, notify your healthcare provider of local water quality indicators if you experience persistent fever or gastrointestinal distress.",
        severity: "high"
    },

    aminoglycoside: {
        headline: "HEALTH MONITORING NOTICE: Elevated aminoglycoside resistance genes identified in the current monitoring cycle.",
        explanation: "Aminoglycoside antibiotics are vital therapeutic agents used to treat severe Gram-negative infections in hospitalized patients. While the presence of these resistance genes in environmental samples does not necessitate immediate restrictions on water use, it indicates an accumulation of resistance traits that could impact combination antibiotic therapies.",
        whatToDo: "No restrictions on public water use are currently in effect. Residents are advised to maintain standard hygiene practices and monitor updates from local environmental and health authorities.",
        severity: "moderate"
    },

    fluoroquinolone: {
        headline: "HEALTH MONITORING NOTICE: Detection of fluoroquinolone-resistant genetic elements in local monitoring stations.",
        explanation: "Fluoroquinolones are common broad-spectrum antibiotics frequently prescribed for urinary tract infections, respiratory infections, and skin conditions. Rising levels of environmental fluoroquinolone resistance (such as qnr genes) can lead to higher rates of treatment failure for routine outpatient bacterial infections, necessitating stronger, intravenous alternatives.",
        whatToDo: "Use prescribed antibiotics only as directed by a healthcare professional. Avoid requesting antibiotics for viral illnesses like the common cold. Monitor public advisories for updates on water monitoring data.",
        severity: "moderate"
    },

    tetracycline: {
        headline: "HEALTH MONITORING NOTICE: Tetracycline resistance genes recorded above baseline averages in local monitoring stations.",
        explanation: "Tetracyclines are broad-spectrum antibiotics widely used in human medicine and veterinary practices. Elevated environmental concentrations of tetracycline resistance genes (such as tetA or tetM) often reflect agricultural runoff or historical overuse, contributing to the selective pressure that sustains antibiotic resistance in environmental bacteria.",
        whatToDo: "No water use restrictions are required. The DEP is working with agricultural partners to implement best management practices and reduce agricultural runoff in the watershed.",
        severity: "moderate"
    },

    glycopeptide: {
        headline: "WATER QUALITY ADVISORY: Vancomycin-resistant Enterococci (VRE) genetic indicators confirmed at local monitoring stations.",
        explanation: "Vancomycin is a glycopeptide antibiotic reserved for treating serious Gram-positive infections that are resistant to other treatments. The presence of vanA or vanB genes indicates enterococci or other organisms carry resistance to this essential clinical agent, presenting challenges for hospital infection control and community health.",
        whatToDo: "Practice strict hand hygiene, particularly after restroom use and before preparing food. If you are undergoing clinical treatment or have a weakened immune system, notify your healthcare provider of local water quality indicators if you experience persistent fever or gastrointestinal distress.",
        severity: "high"
    }
};

// longest substring match handles CARD's compound drug class names (e.g. "cephalosporin;penam")
export function getAlertForDrugClass(drugClass) {
    if (!drugClass) return null;
    const lowerClass = drugClass.toLowerCase();
    
    let bestMatchKey = null;

    for (const key of Object.keys(drugClassAlerts)) {
        if (lowerClass.includes(key.toLowerCase())) {
            if (!bestMatchKey || key.length > bestMatchKey.length) {
                bestMatchKey = key;
            }
        }
    }
    
    return bestMatchKey ? drugClassAlerts[bestMatchKey] : null;
}