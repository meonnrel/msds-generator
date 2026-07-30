/**
 * PubChem API Integration Module
 * MSDS Generator Web Version
 */

// PubChem API Endpoints
const PUBCHEM_AUTOCOMPLETE_URL = 'https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound';
const PUBCHEM_PUG_REST_URL = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound';
const PUBCHEM_PUG_VIEW_URL = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound';

/**
 * Fetch autocomplete suggestions for a chemical query
 * @param {string} query 
 * @returns {Promise<string[]>}
 */
export async function fetchAutocomplete(query) {
    if (!query || query.trim().length < 2) return [];
    try {
        const response = await fetch(`${PUBCHEM_AUTOCOMPLETE_URL}/${encodeURIComponent(query.trim())}/JSON?limit=8`);
        if (!response.ok) return [];
        const data = await response.json();
        return data?.dictionary_terms?.compound || [];
    } catch (err) {
        console.error('Autocomplete fetch error:', err);
        return [];
    }
}

/**
 * Clean text strings from PubChem raw data
 */
export function cleanText(text) {
    if (!text || text === 'Not available' || text === 'Not Available') return 'Not Available';
    let cleaned = text
        .replace(/\.{2,}/g, '')
        .replace(/\s*\([^)]*\d{4}[^)]*\)/g, '')
        .replace(/\s*\[[0-9]+\]/g, '')
        .trim();
    return cleaned || 'Not Available';
}

/**
 * Fix scientific unit casing (e.g. mg/L, g/mL, °C, g/mol)
 */
export function fixUnitCasing(text) {
    if (!text || text === 'Not Available' || text === 'Not available') return text;
    
    return text
        .replace(/\bmg\/l\b/gi, 'mg/L')
        .replace(/\bg\/l\b/gi, 'g/L')
        .replace(/\bmg\/ml\b/gi, 'mg/mL')
        .replace(/\bg\/ml\b/gi, 'g/mL')
        .replace(/\bg\/cm3\b/gi, 'g/cm³')
        .replace(/\bg\/cm\^3\b/gi, 'g/cm³')
        .replace(/\bg\/mol\b/gi, 'g/mol')
        .replace(/\bdeg c\b/gi, '°C')
        .replace(/\bdeg c\.\b/gi, '°C')
        .replace(/°\s*c\b/gi, '°C')
        .replace(/\bcelsius\b/gi, '°C');
}

/**
 * Capitalize first letter of each word (Title Case) while preserving Roman numerals & scientific units
 */
export function titleCase(text) {
    if (!text || text === 'Not Available' || text === 'Not available') return text;
    let formatted = text.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    // Preserve Roman numerals inside parentheses (e.g. (ii) -> (II), (iii) -> (III), (iv) -> (IV))
    formatted = formatted.replace(/\((i{1,3}|iv|v|vi{1,3}|ix|x)\)/gi, (m) => m.toUpperCase());
    return fixUnitCasing(formatted);
}

/**
 * Format chemical formulas with HTML subscripts (numbers after letters or brackets)
 */
export function formatFormulaHtml(formula) {
    if (!formula || formula === 'Not Available') return 'Not Available';
    return formula.replace(/([A-Za-z\)\}\]])(\d+)/g, '$1<sub>$2</sub>');
}

/**
 * Recursively search sections for a specific keyword in TOCHeading
 */
function findSection(sections, keyword) {
    if (!sections || !Array.isArray(sections)) return null;

    for (const section of sections) {
        const heading = section?.TOCHeading || '';
        if (heading.toLowerCase().includes(keyword.toLowerCase())) {
            return section;
        }
        if (section?.Section) {
            const result = findSection(section.Section, keyword);
            if (result) return result;
        }
    }
    return null;
}

/**
 * Extract values from a section's Information block
 */
function extractValues(section) {
    const values = [];
    if (!section) return values;

    try {
        const infoList = section.Information || [];
        for (const info of infoList) {
            const valObj = info.Value;
            if (!valObj) continue;

            if (valObj.StringWithMarkup && Array.isArray(valObj.StringWithMarkup)) {
                for (const item of valObj.StringWithMarkup) {
                    if (item.String) values.push(cleanText(item.String));
                }
            } else if (valObj.String) {
                values.push(cleanText(valObj.String));
            } else if (valObj.Number && Array.isArray(valObj.Number)) {
                const number = valObj.Number[0];
                const unit = valObj.Unit || '';
                values.push(`${number} ${unit}`.trim());
            }
        }
    } catch (e) {
        console.warn('Error extracting values:', e);
    }
    return values;
}

/**
 * Choose best value matching units or default to first
 */
function chooseValue(values, units = []) {
    if (!values || values.length === 0) return 'Not Available';

    for (const unit of units) {
        for (const value of values) {
            if (value.toLowerCase().includes(unit.toLowerCase())) {
                return cleanText(value);
            }
        }
    }
    return cleanText(values[0]);
}

/**
 * Clean appearance string
 */
function cleanAppearance(text) {
    if (!text || text === 'Not Available') return 'Not Available';

    const keywords = [
        'clear', 'colorless', 'colored', 'yellow', 'white', 'blue',
        'green', 'brown', 'black', 'red', 'orange', 'purple',
        'liquid', 'solid', 'gas', 'crystalline', 'powder', 'granular', 'viscous'
    ];

    const lowerText = text.toLowerCase();
    const found = [];

    for (const word of keywords) {
        if (lowerText.includes(word) && !found.includes(word)) {
            found.push(word);
        }
    }

    if (found.length > 0) {
        return titleCase(found.join(' '));
    }
    return titleCase(text.split('.')[0]);
}

/**
 * Clean hazards list
 */
function cleanHazards(text) {
    if (!text || text === 'Not Available') return 'Not Available';

    const lowerText = text.toLowerCase();
    const hazardKeywords = [
        'flammable', 'explosive', 'oxidizing', 'corrosive',
        'irritant', 'toxic', 'acute toxicity', 'carcinogenic',
        'mutagenic', 'sensitizer', 'environmental hazard', 'compressed gas'
    ];

    const found = [];
    for (const keyword of hazardKeywords) {
        if (lowerText.includes(keyword) && !found.includes(keyword)) {
            found.push(keyword);
        }
    }

    if (found.length > 0) {
        return found.map(word => titleCase(word)).join(', ');
    }
    return 'Not Available';
}

/**
 * Get basic properties (Molecular Formula, Weight) from Compound JSON
 */
function getBasicProperties(compoundRecord) {
    let formula = 'Not Available';
    let molarMass = 'Not Available';

    try {
        const props = compoundRecord?.PC_Compounds?.[0]?.props || [];
        for (const prop of props) {
            const label = prop?.urn?.label;
            if (label === 'Molecular Formula') {
                formula = prop?.value?.sval || formula;
            } else if (label === 'Molecular Weight') {
                const val = prop?.value?.sval || prop?.value?.fval;
                if (val) molarMass = fixUnitCasing(`${val} g/mol`);
            }
        }
    } catch (e) {
        console.warn('Error parsing basic properties:', e);
    }

    return { formula, molarMass };
}

/**
 * Get physical properties from PUG View JSON
 */
function getPhysicalProperties(viewRecord) {
    try {
        const sections = viewRecord?.Record?.Section || [];

        // Appearance
        const appearanceValues = extractValues(findSection(sections, 'Physical Description'));
        let appearance = 'Not Available';
        for (const val of appearanceValues) {
            const cleaned = cleanAppearance(val);
            if (['liquid', 'solid', 'gas'].some(x => cleaned.toLowerCase().includes(x))) {
                appearance = cleaned;
                break;
            }
        }
        if (appearance === 'Not Available' && appearanceValues.length > 0) {
            appearance = cleanAppearance(appearanceValues[0]);
        }

        // Odor
        const odorValues = extractValues(findSection(sections, 'Odor'));
        const odorRaw = chooseValue(odorValues, ['odor', 'odorless']);
        const odor = titleCase(odorRaw === 'Not Available' ? odorRaw : odorRaw.replace(/\s+odor$/i, ''));

        // Boiling Point
        const boilingPoint = fixUnitCasing(
            chooseValue(
                extractValues(findSection(sections, 'Boiling Point')),
                ['deg C', '°C']
            )
        );

        // Melting Point
        const meltingPoint = fixUnitCasing(
            chooseValue(
                extractValues(findSection(sections, 'Melting Point')),
                ['deg C', '°C']
            )
        );

        // Density
        const density = fixUnitCasing(
            chooseValue(
                extractValues(findSection(sections, 'Density')),
                ['g/mL', 'g/ml', 'g/cm']
            )
        );

        // Solubility
        const solubility = fixUnitCasing(
            titleCase(
                chooseValue(
                    extractValues(findSection(sections, 'Solubility')),
                    ['g/L', 'g/l', 'mg/mL', 'miscible']
                )
            )
        );

        return {
            appearance,
            odor,
            boiling_point: boilingPoint,
            melting_point: meltingPoint,
            density,
            solubility
        };
    } catch (e) {
        console.error('Error extracting physical properties:', e);
        return {
            appearance: 'Not Available',
            odor: 'Not Available',
            boiling_point: 'Not Available',
            melting_point: 'Not Available',
            density: 'Not Available',
            solubility: 'Not Available'
        };
    }
}

/**
 * Extract safety information (Hazards & First Aid)
 */
function getSafetyInformation(viewRecord) {
    try {
        const sections = viewRecord?.Record?.Section || [];
        const hazardValues = [];

        for (const sectionName of [
            'Hazard Statements',
            'GHS Classification',
            'Hazards Identification',
            'Safety and Hazards'
        ]) {
            const sec = findSection(sections, sectionName);
            if (sec) {
                hazardValues.push(...extractValues(sec));
            }
        }

        const firstAidSec = findSection(sections, 'First Aid Measures') || findSection(sections, 'First Aid');
        const firstAidValues = extractValues(firstAidSec);

        const hazardText = hazardValues.join(' ');
        const hazards = cleanHazards(hazardText);
        const firstAid = firstAidValues.length > 0 ? titleCase(firstAidValues[0]) : 'Not Available';

        return { hazards, first_aid: firstAid };
    } catch (e) {
        console.error('Error extracting safety info:', e);
        return { hazards: 'Not Available', first_aid: 'Not Available' };
    }
}

/**
 * Fetch full chemical data for a chemical name from PubChem
 * @param {string} chemicalName 
 * @returns {Promise<Object|null>}
 */
export async function getChemicalData(chemicalName) {
    if (!chemicalName || !chemicalName.trim()) return null;

    const trimmedName = chemicalName.trim();
    const titleCasedName = titleCase(trimmedName);

    try {
        // 1. Get CID
        const cidRes = await fetch(`${PUBCHEM_PUG_REST_URL}/name/${encodeURIComponent(trimmedName)}/cids/JSON`);
        if (!cidRes.ok) throw new Error(`Chemical '${trimmedName}' not found on PubChem.`);
        
        const cidData = await cidRes.json();
        const cid = cidData?.IdentifierList?.CID?.[0];
        if (!cid) throw new Error(`No CID found for '${trimmedName}'.`);

        // 2. Fetch Compound JSON & PUG View JSON concurrently
        const [compoundRes, viewRes] = await Promise.all([
            fetch(`${PUBCHEM_PUG_REST_URL}/cid/${cid}/JSON`),
            fetch(`${PUBCHEM_PUG_VIEW_URL}/${cid}/JSON`)
        ]);

        if (!compoundRes.ok || !viewRes.ok) {
            throw new Error(`Failed to fetch PubChem records for '${trimmedName}' (CID: ${cid}).`);
        }

        const compoundJson = await compoundRes.json();
        const viewJson = await viewRes.json();

        // 3. Parse Data
        const basic = getBasicProperties(compoundJson);
        const properties = getPhysicalProperties(viewJson);
        const safety = getSafetyInformation(viewJson);

        return {
            cid,
            name: titleCasedName,
            formula: basic.formula,
            molar_mass: basic.molarMass,
            properties,
            safety
        };
    } catch (err) {
        console.error(`Error fetching data for ${chemicalName}:`, err);
        throw err;
    }
}
