// alerts.js
// Plain-Language Alert Text Library (EPA Public Notice Template Aligned)
// Keys use singular drug class names to match CARD-normalized drug_class field

export const drugClassAlerts = {
    carbapenem: {
        headline: "Critical alert: Carbapenem-resistant bacterial genetic markers have been detected in recent localized samples.",
        explanation: "Carbapenems are highly potent antibiotics typically reserved as a last line of defense for severe healthcare-associated infections. When bacteria develop resistance to these drugs, standard treatment options become dangerously limited and can leave infections incredibly difficult to treat with conventional medicine.",
        whatToDo: "What should you do? Do not drink untreated water from local sources until further notice. Boil water for at least one minute or use bottled water for drinking and cooking. If you experience symptoms of a severe infection (high fever, persistent vomiting, confusion), seek emergency medical care immediately. Local water utilities and health officials will provide updates as testing continues.",
        severity: "critical"
    },

    polymyxin: {
        headline: "Critical alert: Colistin-resistant mobile genetic elements (mcr genes) have been identified in the testing node.",
        explanation: "Colistin is used as an absolute antibiotic of last resort to treat multi-drug resistant infections when all other options fail. The presence of colistin resistance markers indicates a critical public health vulnerability, where bacteria can essentially bypass the final tier of chemical defenses.",
        whatToDo: "What should you do? Avoid untreated water from local sources until further notice. Boil water for at least one minute or use bottled water. If you develop symptoms of a drug-resistant infection (persistent fever, non-healing wounds, unusual discharge), contact your healthcare provider immediately and mention local water testing results. Local health officials will issue updates.",
        severity: "critical"
    },

    peptide: {
        headline: "Critical alert: Colistin-resistant mobile genetic elements (mcr genes) have been identified in the testing node.",
        explanation: "Colistin is used as an absolute antibiotic of last resort to treat multi-drug resistant infections when all other options fail. The presence of colistin resistance markers indicates a critical public health vulnerability, where bacteria can essentially bypass the final tier of chemical defenses.",
        whatToDo: "What should you do? Avoid untreated water from local sources until further notice. Boil water for at least one minute or use bottled water. If you develop symptoms of a drug-resistant infection (persistent fever, non-healing wounds, unusual discharge), contact your healthcare provider immediately and mention local water testing results. Local health officials will issue updates.",
        severity: "critical"
    },

    cephalosporin: {
        headline: "High-level alert: Extended-spectrum Cephalosporin-resistant bacteria have been detected above baseline thresholds.",
        explanation: "Cephalosporins are broad-spectrum antibiotics widely used to combat routine respiratory, skin, and urinary tract infections. Elevated environmental resistance means these common community infections run a significantly higher risk of escalating into severe, hard-to-manage clinical cases.",
        whatToDo: "What should you do? Practice good hand hygiene, especially after swimming or boating in local waterways. If you have a wound that becomes red, swollen, or warm, seek medical attention promptly. Ensure any prescribed antibiotics are taken exactly as directed. Local health departments will provide updates on water quality.",
        severity: "high"
    },

    methicillin: {
        headline: "High-level alert: Methicillin-resistant Staphylococcus genetic elements have been recovered from the monitoring site.",
        explanation: "Methicillin resistance indicates the presence of staph strains that are resistant to beta-lactam antibiotics, including penicillins and cephalosporins. These strains can cause aggressive skin, blood, and soft-tissue infections that often require complex, prolonged hospitalization to cure.",
        whatToDo: "What should you do? Keep wounds clean and covered. Avoid sharing towels, razors, or personal items. If you develop a skin infection (redness, swelling, pus, fever), seek medical care promptly and tell your provider about local resistance alerts. Clean gym and pool surfaces regularly. Local health officials will provide guidance.",
        severity: "high"
    },

    vancomycin: {
        headline: "High-level alert: Vancomycin-resistant Enterococci indicators have been confirmed in recent target samples.",
        explanation: "Vancomycin is a heavy-duty antibiotic relied upon to treat severe infections that are completely immune to weaker medications. Resistance to this drug means common intestinal bacteria can transform into pathogens capable of evading routine clinical therapies.",
        whatToDo: "What should you do? Wash hands thoroughly after using the restroom and before preparing food. If you are hospitalized, ask staff about infection control measures. Report any unusual symptoms (persistent diarrhea, fever, urinary pain) to your healthcare provider. Local health authorities will issue updates on monitoring results.",
        severity: "high"
    },

    aminoglycoside: {
        headline: "Moderate alert: Elevated markers for Aminoglycoside resistance have been identified in the current screening cycle.",
        explanation: "Aminoglycosides are essential antibiotics frequently deployed in hospital settings to stop severe Gram-negative bacterial infections in their tracks. While resistance here does not completely exhaust medical options, it can hint at an erosion of effective frontline combination therapies.",
        whatToDo: "What should you do? Continue normal activities but practice good hygiene. Monitor local health advisories for updates. If you have a weakened immune system or are undergoing hospital treatment, inform your healthcare provider about local resistance findings. No restrictions on water use are required at this time.",
        severity: "moderate"
    },

    fluoroquinolone: {
        headline: "Moderate alert: Fluoroquinolone-resistant bacterial genetic fragments have been logged at the testing location.",
        explanation: "Fluoroquinolones are highly popular, highly prescribed antibiotics used for a wide array of everyday bacterial infections like UTIs and pneumonia. Rising resistance means these common outpatient prescriptions may fail more frequently, forcing doctors to pivot to stronger intravenous alternatives.",
        whatToDo: "What should you do? Complete any prescribed antibiotic course as directed by your doctor. Do not request antibiotics for viral infections. If you develop a bacterial infection, inform your provider of local resistance alerts so they can choose the most effective treatment. Continue normal water use.",
        severity: "moderate"
    },

    tetracycline: {
        headline: "Moderate alert: Tetracycline resistance markers have been recorded above historical average baselines.",
        explanation: "Tetracyclines are broad-spectrum antibiotics used in both human medicine and agricultural practices. High environmental levels often point to runoff or prolonged overuse, which trains environmental bacteria to survive basic antibiotic exposures.",
        whatToDo: "What should you do? Use antibiotics only as prescribed. Do not share antibiotics or use leftover prescriptions. If you are concerned about antibiotic-resistant infections, talk to your healthcare provider. Continue normal water use. Local health officials will monitor and report any changes.",
        severity: "moderate"
    },

    glycopeptide: {
        headline: "High-level alert: Vancomycin-resistant genetic markers (vanA/vanB) have been detected in water samples.",
        explanation: "Glycopeptide antibiotics like vancomycin are critical for treating serious Gram-positive infections, including MRSA. Resistance genes vanA and vanB indicate bacteria can survive treatment with these last-resort drugs, posing a significant treatment challenge.",
        whatToDo: "What should you do? Practice strict hand hygiene, especially in healthcare settings. If you develop signs of infection (fever, wound redness, swelling), seek medical attention promptly and inform your provider about local resistance findings. Healthcare facilities should reinforce infection control protocols. Local health authorities will provide updates.",
        severity: "high"
    }
};

export function getAlertForDrugClass(drugClass) {
    if (!drugClass) return null;
    const lowerClass = drugClass.toLowerCase();
    
    let bestMatchKey = null;

    // Check for each key in drugClassAlerts to see if it's a substring of the target drug class
    for (const key of Object.keys(drugClassAlerts)) {
        if (lowerClass.includes(key.toLowerCase())) {
            if (!bestMatchKey || key.length > bestMatchKey.length) {
                bestMatchKey = key;
            }
        }
    }
    
    return bestMatchKey ? drugClassAlerts[bestMatchKey] : null;
}