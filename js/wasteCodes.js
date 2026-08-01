/**
 * Hazardous Waste Code Classifier
 *
 * Best-effort mapping of a reagent to a waste class/number from the DENR
 * "Classification and Coding of Hazardous Waste" reference table. Most
 * classes there are defined by measured properties (pH, extract
 * concentration) that can't be derived from a chemical name alone, so this
 * module matches on named substances, known solvent lists, constituent
 * elements, and GHS hazard keywords instead. Treat the result as a starting
 * point, not a compliance determination — always verify before disposal.
 */

function hasElement(formula, symbol) {
    if (!formula) return false;
    return new RegExp(`${symbol}(?![a-z])`).test(formula);
}

function includesAny(name, terms) {
    return terms.some((term) => name.includes(term));
}

function parseCelsius(text) {
    if (!text) return null;
    const match = text.match(/-?\d+(?:\.\d+)?/);
    return match ? parseFloat(match[0]) : null;
}

function hasAnyHalogen(formula) {
    return ['Cl', 'Br', 'I', 'F'].some((el) => hasElement(formula, el));
}

// True if the compound is organic and evidently liquid at room temperature —
// either PubChem's physical description says so directly, or its melting/boiling
// points bracket ~25°C. Used as a generalized solvent fallback below.
function isOrganicRoomTempLiquid({ formula, appearance, meltingPointC, boilingPointC }) {
    if (!hasElement(formula, 'C')) return false;
    // Melting point is a firmer signal than free-text appearance, which PubChem
    // sometimes reports inconsistently (e.g. a syrup/solution form for a solid
    // sugar). A known melting point at/above room temperature rules out "liquid"
    // outright, regardless of what the appearance text claims.
    if (meltingPointC !== null && meltingPointC >= 25) return false;
    if (appearance.includes('liquid')) return true;
    if (meltingPointC !== null && boilingPointC !== null) {
        return meltingPointC < 25 && boilingPointC > 25;
    }
    return false;
}

// Ordered most-specific-first; the first matching rule wins.
const RULES = [
    // A. Cyanide
    { code: 'A101', label: 'Waste With Cyanide', test: ({ name }) => name.includes('cyanide') },

    // L404 PCB / M505 POPs / M502 Asbestos (checked early — override elemental/solvent matches)
    {
        code: 'L404',
        label: 'Polychlorinated Biphenyl (PCB) Waste',
        test: ({ name }) => name.includes('polychlorinated biphenyl') || /\bpcb\b/.test(name)
    },
    {
        code: 'M505',
        label: 'Persistent Organic Pollutants (POPs) Waste',
        test: ({ name }) => includesAny(name, [
            'aldrin', 'chlordane', 'dieldrin', 'endrin', 'heptachlor',
            'hexachlorobenzene', 'mirex', 'toxaphene',
            'dichlorodiphenyltrichloroethane', 'dichlorodiphenyl trichloroethane'
        ]) || /\bddt\b/.test(name)
    },
    { code: 'M502', label: 'Asbestos Waste', test: ({ name }) => name.includes('asbestos') },

    // G. Waste organic solvents (named lists)
    {
        code: 'G703',
        label: 'Halogenated Organic Solvent',
        test: ({ name }) => includesAny(name, [
            'tetrachloroethylene', 'perchloroethylene', 'trichloroethylene',
            'methylene chloride', 'dichloromethane', '1,1,1-trichloroethane',
            'carbon tetrachloride', 'chlorobenzene', '1,2,2-trichloroethane'
        ])
    },
    {
        code: 'G704',
        label: 'Non-Halogenated Organic Solvent',
        // The source table's list is explicitly "not limited to" the named entries — common lab
        // solvents in the same family as the ones listed (e.g. other simple alcohols) are included too.
        test: ({ name }) => includesAny(name, [
            'xylene', 'acetone', 'ethyl acetate', 'ethylbenzene', 'ethyl benzene',
            'diethyl ether', 'ethyl ether', 'methyl isobutyl ketone',
            'n-butyl alcohol', '1-butanol', 'butan-1-ol', 'cyclohexanol',
            'methanol', 'cresol', 'cresylic acid', 'nitrobenzene', 'toluene',
            'carbon disulfide', 'isobutanol', '2-methyl-1-propanol', 'pyridine',
            'benzene', '2-ethoxyethanol', '2-nitropropane',
            'ethanol', 'ethyl alcohol', 'isopropanol', 'isopropyl alcohol',
            '2-propanol', 'propan-2-ol', 'n-propanol', '1-propanol',
            'hexane', 'heptane', 'tetrahydrofuran'
        ])
    },

    // H/I. Grease & waste oils
    { code: 'I102', label: 'Used Or Waste Oil (Vegetable)', test: ({ name }) => name.includes('vegetable oil') },
    { code: 'I103', label: 'Used Or Waste Oil (Tallow)', test: ({ name }) => name.includes('tallow') },
    { code: 'H802', label: 'Grease Waste', test: ({ name }) => name.includes('grease') },

    // D. Inorganic chemicals (constituent element)
    { code: 'D401', label: 'Selenium And Its Compounds', test: ({ formula }) => hasElement(formula, 'Se') },
    { code: 'D402', label: 'Arsenic And Its Compounds', test: ({ formula }) => hasElement(formula, 'As') },
    { code: 'D403', label: 'Barium And Its Compounds', test: ({ formula }) => hasElement(formula, 'Ba') },
    { code: 'D404', label: 'Cadmium And Its Compounds', test: ({ formula }) => hasElement(formula, 'Cd') },
    { code: 'D405', label: 'Chromium Compounds', test: ({ formula }) => hasElement(formula, 'Cr') },
    { code: 'D406', label: 'Lead Compounds', test: ({ formula }) => hasElement(formula, 'Pb') },
    { code: 'D407', label: 'Mercury And Mercury Compounds', test: ({ formula }) => hasElement(formula, 'Hg') },
    {
        code: 'D408',
        label: 'Fluoride And Its Compounds',
        // Only inorganic fluoride salts — excludes organofluorine compounds
        test: ({ formula }) => hasElement(formula, 'F') && !hasElement(formula, 'C')
    },
    {
        code: 'D499',
        label: 'Other Inorganic Chemical Waste',
        test: ({ name, formula }) => name.includes('carbonyl') || ['Sb', 'Be', 'Te', 'Tl', 'Cu', 'Zn'].some((el) => hasElement(formula, el))
    },

    // B. Acid waste (named substances)
    {
        code: 'B206',
        label: 'Mixture Of Sulfuric And Hydrochloric Acid',
        test: ({ name }) => name.includes('sulfuric acid') && name.includes('hydrochloric acid')
    },
    { code: 'B201', label: 'Sulfuric Acid', test: ({ name }) => name.includes('sulfuric acid') },
    { code: 'B202', label: 'Hydrochloric Acid', test: ({ name }) => name.includes('hydrochloric acid') },
    { code: 'B203', label: 'Nitric Acid', test: ({ name }) => name.includes('nitric acid') },
    { code: 'B204', label: 'Phosphoric Acid', test: ({ name }) => name.includes('phosphoric acid') },
    { code: 'B205', label: 'Hydrofluoric Acid', test: ({ name }) => name.includes('hydrofluoric acid') },
    {
        code: 'B207',
        label: 'Other Inorganic Acid',
        test: ({ name }) => includesAny(name, [
            'perchloric acid', 'chromic acid', 'boric acid', 'hydrobromic acid',
            'hydroiodic acid', 'carbonic acid', 'chloric acid'
        ])
    },
    {
        code: 'B208',
        label: 'Organic Acid',
        test: ({ name, formula }) => name.includes('acid') && hasElement(formula, 'C')
    },
    { code: 'B299', label: 'Other Acid Waste', test: ({ name }) => name.includes('acid') },

    // C. Alkali waste (named substances)
    { code: 'C301', label: 'Caustic Soda', test: ({ name }) => name.includes('sodium hydroxide') || name.includes('caustic soda') },
    { code: 'C302', label: 'Potash', test: ({ name }) => includesAny(name, ['potassium hydroxide', 'potash', 'potassium carbonate']) },
    { code: 'C304', label: 'Ammonium Hydroxide', test: ({ name }) => includesAny(name, ['ammonium hydroxide', 'ammonia solution']) || name === 'ammonia' },
    { code: 'C305', label: 'Lime Slurries', test: ({ name }) => name.includes('calcium hydroxide') || name.includes('lime') },
    { code: 'C399', label: 'Other Alkali Waste', test: ({ name }) => name.includes('hydroxide') },

    // E. Reactive chemical waste — fallback based on GHS hazard keywords
    { code: 'E503', label: 'Explosive And Unstable Chemicals', test: ({ hazards }) => hazards.includes('explosive') },
    { code: 'E501', label: 'Oxidizing Agents', test: ({ hazards }) => hazards.includes('oxidizing') },

    // G. Waste organic solvents — generalized fallback for anything organic and liquid
    // at room temperature that wasn't already caught by a more specific rule above.
    // Lets this cover arbitrary solvents instead of only the ones named in the source table.
    {
        code: 'G703',
        label: 'Halogenated Organic Solvent',
        test: (ctx) => isOrganicRoomTempLiquid(ctx) && hasAnyHalogen(ctx.formula)
    },
    {
        code: 'G704',
        label: 'Non-Halogenated Organic Solvent',
        test: (ctx) => isOrganicRoomTempLiquid(ctx)
    }
];

/**
 * Classify a chemical against the hazardous waste code table
 * @param {Object} chemical
 * @param {string} chemical.name Chemical name
 * @param {string} chemical.formula Molecular formula
 * @param {string} chemical.hazards Cleaned hazards text (from PubChem GHS data)
 * @param {string} [chemical.appearance] Physical description text (from PubChem)
 * @param {string} [chemical.meltingPoint] Melting point text, e.g. "-114 °C"
 * @param {string} [chemical.boilingPoint] Boiling point text, e.g. "78.37 °C"
 * @returns {string} e.g. "B201 (Sulfuric Acid)", or "Not Classified" if no rule matched
 */
export function classifyWasteCode({ name, formula, hazards, appearance, meltingPoint, boilingPoint }) {
    const ctx = {
        name: (name || '').toLowerCase(),
        formula: formula && formula !== 'Not Available' ? formula : '',
        hazards: (hazards || '').toLowerCase(),
        appearance: (appearance || '').toLowerCase(),
        meltingPointC: parseCelsius(meltingPoint),
        boilingPointC: parseCelsius(boilingPoint)
    };

    for (const rule of RULES) {
        if (rule.test(ctx)) {
            return `${rule.code} (${rule.label})`;
        }
    }

    return 'Not Classified';
}
