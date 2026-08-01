/**
 * Main Application Logic
 * MSDS Generator Web Version
 */

import { getChemicalData, fetchAutocomplete, formatFormulaHtml, titleCase } from './pubchem.js';
import { exportToDocx, copyTableToClipboard } from './export.js';
import { preloadRDKit, smilesToSvg } from './structure.js';
import { classifyWasteCode } from './wasteCodes.js';

// Available Properties, grouped to mirror the three MSDS table columns
// (Reagent | Chemical And Physical Properties | Safety Information)
const PROPERTY_GROUPS = [
    {
        title: 'Reagent',
        properties: [
            { key: 'formula', label: 'Formula' },
            { key: 'structure', label: 'Structure' }
        ]
    },
    {
        title: 'Chemical And Physical Properties',
        properties: [
            { key: 'molar_mass', label: 'Molar Mass' },
            { key: 'appearance', label: 'Appearance' },
            { key: 'odor', label: 'Odor' },
            { key: 'boiling_point', label: 'Boiling Point' },
            { key: 'melting_point', label: 'Melting Point' },
            { key: 'density', label: 'Density' },
            { key: 'solubility', label: 'Solubility' }
        ]
    },
    {
        title: 'Safety Information',
        properties: [
            { key: 'hazards', label: 'Hazards' },
            { key: 'first_aid', label: 'First Aid' },
            { key: 'waste_code', label: 'Waste Code' }
        ]
    }
];

const ALL_PROPERTIES = PROPERTY_GROUPS.flatMap((group) => group.properties);

// App State
let reagentCounter = 0;
let reagentsState = [];
let processedChemicals = [];
let autocompleteTimeout = null;

// DOM Elements
let reagentsListEl;
let btnAddReagent;
let btnGenerate;
let msdsPaperEl;
let filenameInput;
let btnExportDocx;
let btnCopyGoogleDocs;
let toastContainer;

/**
 * Show Toast Notification
 */
function showToast(message, type = 'info') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-triangle';

    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

/**
 * Initialize Reagent Card
 */
function createReagentCard(initialName = '') {
    reagentCounter++;
    const cardId = reagentCounter;

    const defaultProps = {};
    ALL_PROPERTIES.forEach(p => defaultProps[p.key] = true);

    const reagentObj = {
        id: cardId,
        name: initialName,
        checkboxes: defaultProps
    };

    reagentsState.push(reagentObj);

    const card = document.createElement('div');
    card.className = 'reagent-card';
    card.id = `reagentCard_${cardId}`;

    card.innerHTML = `
        <div class="reagent-header">
            <span class="reagent-badge">Reagent ${reagentsState.length}</span>
            <div class="reagent-card-actions">
                <button type="button" class="btn-remove-reagent" title="Remove Reagent" data-id="${cardId}">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
        <div class="search-wrapper">
            <input type="text" class="input-control chemical-name-input" placeholder="Chemical name (e.g. Ethanol)" value="${initialName}" data-id="${cardId}" autocomplete="off">
            <div class="autocomplete-dropdown" id="dropdown_${cardId}"></div>
        </div>
        <div class="props-toggle-section">
            <div class="props-toggle-header">
                <span>Properties</span>
                <span class="toggle-all-link" data-id="${cardId}" data-state="all">Select / Unselect All</span>
            </div>
            <div class="props-grid">
                ${PROPERTY_GROUPS.map(group => `
                    <div class="props-group">
                        ${group.properties.map(p => `
                            <label class="checkbox-label">
                                <input type="checkbox" data-id="${cardId}" data-prop="${p.key}" checked>
                                <span>${p.label}</span>
                            </label>
                        `).join('')}
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    if (reagentsListEl) {
        reagentsListEl.appendChild(card);
    }
    updateReagentNumbers();

    // Attach Event Listeners for this card
    const nameInput = card.querySelector('.chemical-name-input');
    const dropdown = card.querySelector('.autocomplete-dropdown');
    const removeBtn = card.querySelector('.btn-remove-reagent');
    const toggleAllBtn = card.querySelector('.toggle-all-link');
    const checkboxes = card.querySelectorAll('input[type="checkbox"]');

    // Name Input & Autocomplete
    nameInput.addEventListener('input', (e) => {
        reagentObj.name = e.target.value;
        handleAutocomplete(e.target.value, dropdown, nameInput, reagentObj);
    });

    nameInput.addEventListener('blur', () => {
        setTimeout(() => dropdown.classList.remove('active'), 200);
    });

    // Remove Card
    removeBtn.addEventListener('click', () => {
        if (reagentsState.length <= 1) {
            showToast('You must keep at least one reagent card.', 'info');
            return;
        }
        reagentsState = reagentsState.filter(r => r.id !== cardId);
        card.remove();
        updateReagentNumbers();
    });

    // Toggle All Checkboxes
    toggleAllBtn.addEventListener('click', () => {
        const isAll = toggleAllBtn.getAttribute('data-state') === 'all';
        const newState = !isAll;

        checkboxes.forEach(cb => {
            cb.checked = newState;
            const propKey = cb.getAttribute('data-prop');
            reagentObj.checkboxes[propKey] = newState;
        });

        toggleAllBtn.setAttribute('data-state', newState ? 'all' : 'none');
    });

    // Single Checkbox Toggle
    checkboxes.forEach(cb => {
        cb.addEventListener('change', (e) => {
            const propKey = e.target.getAttribute('data-prop');
            reagentObj.checkboxes[propKey] = e.target.checked;
        });
    });

    return nameInput;
}

/**
 * Handle Autocomplete Fetch & Dropdown
 */
function handleAutocomplete(query, dropdownEl, inputEl, reagentObj) {
    clearTimeout(autocompleteTimeout);

    if (!query || query.trim().length < 2) {
        dropdownEl.classList.remove('active');
        dropdownEl.innerHTML = '';
        return;
    }

    autocompleteTimeout = setTimeout(async () => {
        const terms = await fetchAutocomplete(query);
        if (terms.length === 0) {
            dropdownEl.classList.remove('active');
            dropdownEl.innerHTML = '';
            return;
        }

        dropdownEl.innerHTML = terms.map(term => `
            <div class="autocomplete-item">${term}</div>
        `).join('');

        dropdownEl.classList.add('active');

        dropdownEl.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                inputEl.value = item.textContent;
                reagentObj.name = item.textContent;
                dropdownEl.classList.remove('active');
            });
        });
    }, 250);
}

/**
 * Update numbers on reagent badges after removal
 */
function updateReagentNumbers() {
    if (!reagentsListEl) return;
    const cards = reagentsListEl.querySelectorAll('.reagent-card');
    cards.forEach((card, index) => {
        const badge = card.querySelector('.reagent-badge');
        if (badge) badge.textContent = `Reagent ${index + 1}`;
    });
}

/**
 * Render Live MSDS Table Preview
 */
function renderMsdsPreview(chemicals) {
    if (!msdsPaperEl) return;

    if (!chemicals || chemicals.length === 0) {
        msdsPaperEl.innerHTML = `
            <div class="empty-state">
                <p>Enter chemical names to generate your MSDS table.</p>
            </div>
        `;
        return;
    }

    let rowsHtml = '';
    let anyWasteCodeShown = false;

    for (const item of chemicals) {
        const selected = item.selected || {};
        const chemicalName = titleCase(item.name);
        const formulaHtml = formatFormulaHtml(selected.formula);

        // Reagent Cell
        const reagentCell = `
            <div class="reagent-name-cell">${chemicalName}</div>
            ${selected.formula ? `<div class="reagent-formula-cell">${formulaHtml}</div>` : ''}
            ${item.structureSvg ? `<div class="reagent-structure-cell">${item.structureSvg}</div>` : ''}
        `;

        // Physical Properties Cell
        const propItems = [];
        const propLabels = {
            molar_mass: 'Molar Mass',
            appearance: 'Appearance',
            odor: 'Odor',
            boiling_point: 'Boiling Point',
            melting_point: 'Melting Point',
            density: 'Density',
            solubility: 'Solubility'
        };

        for (const [key, label] of Object.entries(propLabels)) {
            if (selected[key]) {
                propItems.push(`
                    <div class="prop-list-item">
                        <span class="prop-label">${label}:</span>
                        <span class="prop-value">${selected[key]}</span>
                    </div>
                `);
            }
        }

        const propertiesCell = propItems.length > 0 ? propItems.join('') : '<em>None selected</em>';

        // Safety Information Cell
        const safetyItems = [];
        if (selected.hazards) {
            const hazardsList = selected.hazards.split(', ');
            const badgesHtml = hazardsList.map(h => `<span class="badge-hazard">${h}</span>`).join(' ');
            safetyItems.push(`
                <div class="prop-list-item">
                    <span class="prop-label">Hazards:</span>
                    <div>${badgesHtml}</div>
                </div>
            `);
        }

        if (selected.first_aid) {
            safetyItems.push(`
                <div class="prop-list-item">
                    <span class="prop-label">First Aid:</span>
                    <span class="prop-value">${selected.first_aid}</span>
                </div>
            `);
        }

        if (selected.waste_code) {
            safetyItems.push(`
                <div class="prop-list-item">
                    <span class="prop-label">Waste Code:</span>
                    <span class="prop-value">${selected.waste_code}</span>
                </div>
            `);
            anyWasteCodeShown = true;
        }

        const safetyCell = safetyItems.length > 0 ? safetyItems.join('') : '<em>None selected</em>';

        rowsHtml += `
            <tr>
                <td>${reagentCell}</td>
                <td>${propertiesCell}</td>
                <td>${safetyCell}</td>
            </tr>
        `;
    }

    msdsPaperEl.innerHTML = `
        <div class="msds-paper-header">
            <h2>Material Safety Data Sheet</h2>
        </div>
        <table class="msds-table">
            <thead>
                <tr>
                    <th style="width: 32%;">Reagent</th>
                    <th style="width: 38%;">Chemical And Physical Properties</th>
                    <th style="width: 30%;">Safety Information</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
        </table>
        ${anyWasteCodeShown ? `
            <p class="waste-code-footnote">
                Waste codes are auto-classified from the DENR Hazardous Waste Classification &amp; Coding guide based on chemical identity, not measured pH or lab-tested concentration &mdash; verify before disposal.
            </p>
        ` : ''}
    `;
}

/**
 * Show Loading State
 */
function showPreviewSkeleton() {
    if (!msdsPaperEl) return;
    msdsPaperEl.innerHTML = `
        <div class="msds-paper-header">
            <h2>Material Safety Data Sheet</h2>
            <p>Fetching chemical records from PubChem...</p>
        </div>
        <div style="padding: 20px; text-align: center; color: var(--pastel-purple);">
            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 10px;"></i>
            <p>Loading chemical data...</p>
        </div>
    `;
}

/**
 * Generate MSDS Action
 */
async function generateMsds() {
    const validReagents = reagentsState.filter(r => r.name && r.name.trim().length > 0);

    if (validReagents.length === 0) {
        showToast('Please enter at least one chemical name.', 'error');
        return;
    }

    if (btnGenerate) {
        btnGenerate.disabled = true;
        btnGenerate.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Fetching...`;
    }
    showPreviewSkeleton();

    processedChemicals = [];
    const errors = [];

    for (const reagent of validReagents) {
        try {
            const data = await getChemicalData(reagent.name);
            if (data) {
                const selected = {};
                for (const [propKey, isChecked] of Object.entries(reagent.checkboxes)) {
                    if (isChecked) {
                        if (propKey in data.properties) {
                            selected[propKey] = data.properties[propKey];
                        } else if (propKey in data.safety) {
                            selected[propKey] = data.safety[propKey];
                        } else if (propKey === 'formula') {
                            selected.formula = data.formula;
                        } else if (propKey === 'molar_mass') {
                            selected.molar_mass = data.molar_mass;
                        } else if (propKey === 'waste_code') {
                            selected.waste_code = classifyWasteCode({
                                name: data.name,
                                formula: data.formula,
                                hazards: data.safety.hazards,
                                appearance: data.properties.appearance,
                                meltingPoint: data.properties.melting_point,
                                boilingPoint: data.properties.boiling_point
                            });
                        }
                    }
                }
                data.selected = selected;
                data.structureSvg = reagent.checkboxes.structure ? await smilesToSvg(data.smiles) : null;
                processedChemicals.push(data);
            }
        } catch (err) {
            console.error(err);
            errors.push(reagent.name);
        }
    }

    if (btnGenerate) {
        btnGenerate.disabled = false;
        btnGenerate.innerHTML = `<i class="fas fa-heart"></i> Generate MSDS`;
    }

    if (processedChemicals.length === 0) {
        showToast(`Could not find records for: ${errors.join(', ')}`, 'error');
        renderMsdsPreview([]);
        return;
    }

    if (errors.length > 0) {
        showToast(`Skipped invalid chemical(s): ${errors.join(', ')}`, 'info');
    } else {
        showToast(`Generated MSDS for ${processedChemicals.length} chemical(s)!`, 'success');
    }

    renderMsdsPreview(processedChemicals);
}

/**
 * Bind Export Handlers
 */
function initExportHandlers() {
    if (btnExportDocx) {
        btnExportDocx.addEventListener('click', async () => {
            if (processedChemicals.length === 0) {
                showToast('Please generate an MSDS first.', 'error');
                return;
            }
            const filename = (filenameInput ? filenameInput.value.trim() : '') || 'MSDS_Output.docx';
            try {
                btnExportDocx.disabled = true;
                btnExportDocx.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Exporting...`;
                await exportToDocx(processedChemicals, filename);
                showToast('Word document exported!', 'success');
            } catch (e) {
                console.error(e);
                showToast('Failed to export Word document.', 'error');
            } finally {
                btnExportDocx.disabled = false;
                btnExportDocx.innerHTML = `<i class="fas fa-file-word"></i> Download .docx`;
            }
        });
    }

    if (btnCopyGoogleDocs) {
        btnCopyGoogleDocs.addEventListener('click', async () => {
            if (processedChemicals.length === 0) {
                showToast('Please generate an MSDS first.', 'error');
                return;
            }
            try {
                btnCopyGoogleDocs.disabled = true;
                btnCopyGoogleDocs.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Copying...`;
                await copyTableToClipboard(processedChemicals);
                showToast('Table copied! Paste it into your Google Doc.', 'success');
            } catch (e) {
                console.error(e);
                showToast('Failed to copy table.', 'error');
            } finally {
                btnCopyGoogleDocs.disabled = false;
                btnCopyGoogleDocs.innerHTML = `<i class="fas fa-copy"></i> Copy For Google Docs`;
            }
        });
    }
}

/**
 * Main App Initialization
 */
function initApp() {
    // Bind DOM elements
    reagentsListEl = document.getElementById('reagentsList');
    btnAddReagent = document.getElementById('btnAddReagent');
    btnGenerate = document.getElementById('btnGenerate');
    msdsPaperEl = document.getElementById('msdsPaper');
    filenameInput = document.getElementById('filenameInput');
    btnExportDocx = document.getElementById('btnExportDocx');
    btnCopyGoogleDocs = document.getElementById('btnCopyGoogleDocs');
    toastContainer = document.getElementById('toastContainer');

    createReagentCard();
    initExportHandlers();
    preloadRDKit();

    if (btnAddReagent) {
        btnAddReagent.addEventListener('click', () => {
            const input = createReagentCard();
            if (input) input.focus();
        });
    }

    if (btnGenerate) {
        btnGenerate.addEventListener('click', generateMsds);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
