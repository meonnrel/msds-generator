/**
 * Main Application Logic
 * MSDS Generator Web Version
 */

import { getChemicalData, fetchAutocomplete, formatFormulaHtml } from './pubchem.js';
import { exportToDocx, exportToCsv, copyTableToClipboard } from './export.js';

// Available Properties
const ALL_PROPERTIES = [
    { key: 'formula', label: 'Formula' },
    { key: 'molar_mass', label: 'Molar Mass' },
    { key: 'appearance', label: 'Appearance' },
    { key: 'odor', label: 'Odor' },
    { key: 'boiling_point', label: 'Boiling Point' },
    { key: 'melting_point', label: 'Melting Point' },
    { key: 'density', label: 'Density' },
    { key: 'solubility', label: 'Solubility' },
    { key: 'hazards', label: 'Hazards' },
    { key: 'first_aid', label: 'First Aid' }
];

// App State
let reagentCounter = 0;
let reagentsState = [];
let processedChemicals = [];
let autocompleteTimeout = null;

// DOM Elements
const reagentsListEl = document.getElementById('reagentsList');
const btnAddReagent = document.getElementById('btnAddReagent');
const btnGenerate = document.getElementById('btnGenerate');
const msdsPaperEl = document.getElementById('msdsPaper');
const filenameInput = document.getElementById('filenameInput');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const btnExportDocx = document.getElementById('btnExportDocx');
const btnExportCsv = document.getElementById('btnExportCsv');
const btnCopyClipboard = document.getElementById('btnCopyClipboard');
const btnPrintMsds = document.getElementById('btnPrintMsds');
const toastContainer = document.getElementById('toastContainer');
const presetsWrapEl = document.getElementById('presetsWrap');

/**
 * Show Toast Notification
 */
function showToast(message, type = 'info') {
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

    // Default all checkboxes to true
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
            <input type="text" class="input-control chemical-name-input" placeholder="e.g. Ethanol, Acetone, Hydrochloric acid..." value="${initialName}" data-id="${cardId}" autocomplete="off">
            <div class="autocomplete-dropdown" id="dropdown_${cardId}"></div>
        </div>
        <div class="props-toggle-section">
            <div class="props-toggle-header">
                <span>Included Properties</span>
                <span class="toggle-all-link" data-id="${cardId}" data-state="all">Select / Unselect All</span>
            </div>
            <div class="props-grid">
                ${ALL_PROPERTIES.map(p => `
                    <label class="checkbox-label">
                        <input type="checkbox" data-id="${cardId}" data-prop="${p.key}" checked>
                        <span>${p.label}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `;

    reagentsListEl.appendChild(card);
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
        // Hide dropdown after small delay to allow item click
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

        // Add Click handlers to items
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
    if (!chemicals || chemicals.length === 0) {
        msdsPaperEl.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-flask"></i>
                <h3>No Chemicals Generated Yet</h3>
                <p>Add reagent names above and click <strong>Generate MSDS</strong> to create your table.</p>
            </div>
        `;
        return;
    }

    let rowsHtml = '';

    for (const item of chemicals) {
        const selected = item.selected || {};
        const chemicalName = item.name.charAt(0).toUpperCase() + item.name.slice(1);
        const formulaHtml = formatFormulaHtml(selected.formula);

        // Reagent Cell
        const reagentCell = `
            <div class="reagent-name-cell">${chemicalName}</div>
            ${selected.formula ? `<div class="reagent-formula-cell">${formulaHtml}</div>` : ''}
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
            <p>Generated via PubChem Database • Pre-Lab Reagent Reference</p>
        </div>
        <table class="msds-table">
            <thead>
                <tr>
                    <th style="width: 25%;">Reagent</th>
                    <th style="width: 42%;">Chemical And Physical Properties</th>
                    <th style="width: 33%;">Safety Information</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
        </table>
    `;
}

/**
 * Show Skeleton Loader in Preview
 */
function showPreviewSkeleton() {
    msdsPaperEl.innerHTML = `
        <div class="msds-paper-header">
            <h2>Material Safety Data Sheet</h2>
            <p>Fetching chemical records from PubChem...</p>
        </div>
        <div style="padding: 20px;">
            <div class="skeleton" style="width: 100%; height: 35px; margin-bottom: 20px;"></div>
            <div class="skeleton" style="width: 100%; height: 60px;"></div>
            <div class="skeleton" style="width: 100%; height: 60px;"></div>
            <div class="skeleton" style="width: 100%; height: 60px;"></div>
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

    btnGenerate.disabled = true;
    btnGenerate.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Fetching PubChem...`;
    showPreviewSkeleton();

    processedChemicals = [];
    const errors = [];

    for (const reagent of validReagents) {
        try {
            const data = await getChemicalData(reagent.name);
            if (data) {
                // Filter properties based on checkboxes
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
                        }
                    }
                }
                data.selected = selected;
                processedChemicals.push(data);
            }
        } catch (err) {
            console.error(err);
            errors.push(reagent.name);
        }
    }

    btnGenerate.disabled = false;
    btnGenerate.innerHTML = `<i class="fas fa-bolt"></i> Generate MSDS`;

    if (processedChemicals.length === 0) {
        showToast(`Could not find records for: ${errors.join(', ')}`, 'error');
        renderMsdsPreview([]);
        return;
    }

    if (errors.length > 0) {
        showToast(`Skipped invalid chemical(s): ${errors.join(', ')}`, 'info');
    } else {
        showToast(`Successfully generated MSDS for ${processedChemicals.length} chemical(s)!`, 'success');
    }

    renderMsdsPreview(processedChemicals);
}

/**
 * Initialize Preset Buttons
 */
function initPresets() {
    const presets = [
        'Ethanol',
        'Acetone',
        'Hydrochloric acid',
        'Sodium hydroxide',
        'Sulfuric acid',
        'Benzoic acid',
        'Methanol',
        'Copper(II) sulfate'
    ];

    presetsWrapEl.innerHTML = presets.map(p => `
        <button class="preset-chip" type="button" data-name="${p}">
            <i class="fas fa-plus"></i> ${p}
        </button>
    `).join('');

    presetsWrapEl.querySelectorAll('.preset-chip').forEach(chip => {
        chip.addEventListener('click', async () => {
            const name = chip.getAttribute('data-name');
            // Check if last input is empty, fill it, else add new card
            const lastReagent = reagentsState[reagentsState.length - 1];
            if (lastReagent && (!lastReagent.name || !lastReagent.name.trim())) {
                lastReagent.name = name;
                const cardEl = document.getElementById(`reagentCard_${lastReagent.id}`);
                if (cardEl) {
                    const input = cardEl.querySelector('.chemical-name-input');
                    if (input) input.value = name;
                }
            } else {
                createReagentCard(name);
            }

            await generateMsds();
        });
    });
}

/**
 * Theme Toggle Handler
 */
function initThemeToggle() {
    const savedTheme = localStorage.getItem('msds_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('msds_theme', newTheme);
        updateThemeIcon(newTheme);
    });
}

function updateThemeIcon(theme) {
    const icon = themeToggleBtn.querySelector('i');
    if (icon) {
        icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
}

/**
 * Bind Export Handlers
 */
function initExportHandlers() {
    // Export DOCX
    btnExportDocx.addEventListener('click', async () => {
        if (processedChemicals.length === 0) {
            showToast('Please generate an MSDS first before exporting.', 'error');
            return;
        }
        const filename = filenameInput.value.trim() || 'MSDS_Output.docx';
        try {
            btnExportDocx.disabled = true;
            btnExportDocx.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Exporting...`;
            await exportToDocx(processedChemicals, filename);
            showToast('Word document exported successfully!', 'success');
        } catch (e) {
            console.error(e);
            showToast('Failed to export Word document.', 'error');
        } finally {
            btnExportDocx.disabled = false;
            btnExportDocx.innerHTML = `<i class="fas fa-file-word"></i> Download .docx`;
        }
    });

    // Export CSV
    btnExportCsv.addEventListener('click', () => {
        if (processedChemicals.length === 0) {
            showToast('Please generate an MSDS first before exporting.', 'error');
            return;
        }
        const filename = (filenameInput.value.trim() || 'MSDS_Output').replace(/\.docx$/i, '') + '.csv';
        exportToCsv(processedChemicals, filename);
        showToast('CSV file downloaded!', 'success');
    });

    // Copy to Clipboard
    btnCopyClipboard.addEventListener('click', async () => {
        if (processedChemicals.length === 0) {
            showToast('Please generate an MSDS first.', 'error');
            return;
        }
        try {
            await copyTableToClipboard(processedChemicals);
            showToast('Formatted MSDS copied to clipboard!', 'success');
        } catch (e) {
            showToast('Failed to copy table.', 'error');
        }
    });

    // Print
    btnPrintMsds.addEventListener('click', () => {
        if (processedChemicals.length === 0) {
            showToast('Please generate an MSDS first before printing.', 'error');
            return;
        }
        window.print();
    });
}

// App Initialization
document.addEventListener('DOMContentLoaded', () => {
    initThemeToggle();
    initPresets();
    createReagentCard(); // Create initial reagent card 1
    initExportHandlers();

    btnAddReagent.addEventListener('click', () => {
        const input = createReagentCard();
        input.focus();
    });

    btnGenerate.addEventListener('click', generateMsds);
});
