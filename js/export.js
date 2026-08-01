/**
 * Document Export Module for MSDS Generator
 * Handles Word (.docx) export
 */

import { titleCase, formatFormulaHtml } from './pubchem.js';
import { svgToPngDataUrl } from './structure.js';

const PROPERTY_LABELS = {
    appearance: 'Appearance',
    odor: 'Odor',
    boiling_point: 'Boiling Point',
    melting_point: 'Melting Point',
    density: 'Density',
    solubility: 'Solubility',
    molar_mass: 'Molar Mass'
};

const SAFETY_LABELS = {
    hazards: 'Hazards',
    first_aid: 'First Aid',
    waste_code: 'Waste Code'
};

// Font Size: 11pt = 22 (docx half-points)
const FONT_SIZE_11PT = 22;
// Line Spacing: 1.15 line height = 276 (where 240 is 1.0)
const LINE_SPACING_115 = 276;

// Table Column Widths in DXA (Total Printable Width = 9360 DXA for 8.5" page with 1" margins)
const COL1_WIDTH_DXA = 3000; // Reagent (~32%) - widened to give structure drawings more room
const COL2_WIDTH_DXA = 3800; // Physical Properties (~41%)
const COL3_WIDTH_DXA = 2560; // Safety Information (~27%)

// Structure Image Dimensions (rendered px for rasterization, and docx display size in points)
const STRUCTURE_RASTER_WIDTH = 440;
const STRUCTURE_RASTER_HEIGHT = 340;
const STRUCTURE_DOCX_WIDTH = 150;
const STRUCTURE_DOCX_HEIGHT = 116;

/**
 * Convert a data URL to a Uint8Array (for docx.js ImageRun)
 */
async function dataUrlToUint8Array(dataUrl) {
    const res = await fetch(dataUrl);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
}

/**
 * Format chemical formula into array of docx TextRun parts using native Google Docs / Word subscript (Ctrl + ,)
 */
function createFormulaRuns(docx, formula) {
    if (!formula || formula === 'Not Available') {
        return [new docx.TextRun({ text: 'Not Available', font: 'Arial', size: FONT_SIZE_11PT })];
    }

    // Numbers immediately following an element symbol, ')', ']', or '}' are subscripts (e.g. H2SO4 -> H(sub 2)S O(sub 4))
    const regex = /([A-Za-z\)\}\]])(\d+)/g;
    const runs = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(formula)) !== null) {
        const textBefore = formula.substring(lastIndex, match.index) + match[1];
        if (textBefore) {
            runs.push(new docx.TextRun({ text: textBefore, font: 'Arial', size: FONT_SIZE_11PT }));
        }
        runs.push(new docx.TextRun({ text: match[2], font: 'Arial', size: FONT_SIZE_11PT, subScript: true }));
        lastIndex = regex.lastIndex;
    }

    const remaining = formula.substring(lastIndex);
    if (remaining) {
        runs.push(new docx.TextRun({ text: remaining, font: 'Arial', size: FONT_SIZE_11PT }));
    }

    return runs.length > 0 ? runs : [new docx.TextRun({ text: formula, font: 'Arial', size: FONT_SIZE_11PT })];
}

/**
 * Export selected chemical data to a formatted Word document (.docx)
 * @param {Array} chemicals List of processed chemical objects with selected properties
 * @param {string} filename Output file name
 */
export async function exportToDocx(chemicals, filename = 'MSDS_Output.docx') {
    if (!window.docx) {
        throw new Error('Word export library (docx.js) is not loaded.');
    }

    const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, AlignmentType, WidthType, LineRuleType } = window.docx;

    if (!filename.endsWith('.docx')) {
        filename += '.docx';
    }

    // Build Table Rows
    const tableRows = [];

    // Header Row
    const headerRow = new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: [
            new TableCell({
                width: { size: COL1_WIDTH_DXA, type: WidthType.DXA },
                shading: { fill: 'F3F4F6' },
                margins: { top: 120, bottom: 120, left: 140, right: 140 },
                children: [
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { line: LINE_SPACING_115, lineRule: LineRuleType.AUTO },
                        children: [new TextRun({ text: 'Reagent', bold: true, font: 'Arial', size: FONT_SIZE_11PT, color: '111827' })]
                    })
                ]
            }),
            new TableCell({
                width: { size: COL2_WIDTH_DXA, type: WidthType.DXA },
                shading: { fill: 'F3F4F6' },
                margins: { top: 120, bottom: 120, left: 140, right: 140 },
                children: [
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { line: LINE_SPACING_115, lineRule: LineRuleType.AUTO },
                        children: [new TextRun({ text: 'Chemical And Physical Properties', bold: true, font: 'Arial', size: FONT_SIZE_11PT, color: '111827' })]
                    })
                ]
            }),
            new TableCell({
                width: { size: COL3_WIDTH_DXA, type: WidthType.DXA },
                shading: { fill: 'F3F4F6' },
                margins: { top: 120, bottom: 120, left: 140, right: 140 },
                children: [
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { line: LINE_SPACING_115, lineRule: LineRuleType.AUTO },
                        children: [new TextRun({ text: 'Safety Information', bold: true, font: 'Arial', size: FONT_SIZE_11PT, color: '111827' })]
                    })
                ]
            })
        ]
    });

    tableRows.push(headerRow);

    // Data Rows
    let anyWasteCodeShown = false;
    for (const item of chemicals) {
        const selected = item.selected || {};
        const chemicalName = titleCase(item.name);
        if (selected.waste_code) anyWasteCodeShown = true;

        // Reagent Cell Paragraphs
        const reagentParagraphs = [
            new Paragraph({
                spacing: { line: LINE_SPACING_115, lineRule: LineRuleType.AUTO, after: 40 },
                children: [new TextRun({ text: chemicalName, bold: true, font: 'Arial', size: FONT_SIZE_11PT })]
            })
        ];

        if (selected.formula) {
            reagentParagraphs.push(
                new Paragraph({
                    spacing: { line: LINE_SPACING_115, lineRule: LineRuleType.AUTO },
                    children: createFormulaRuns(docx, selected.formula)
                })
            );
        }

        if (item.structureSvg) {
            try {
                const pngDataUrl = await svgToPngDataUrl(item.structureSvg, STRUCTURE_RASTER_WIDTH, STRUCTURE_RASTER_HEIGHT);
                const imageData = await dataUrlToUint8Array(pngDataUrl);
                reagentParagraphs.push(
                    new Paragraph({
                        spacing: { line: LINE_SPACING_115, lineRule: LineRuleType.AUTO, before: 60 },
                        children: [
                            new docx.ImageRun({
                                type: 'png',
                                data: imageData,
                                transformation: { width: STRUCTURE_DOCX_WIDTH, height: STRUCTURE_DOCX_HEIGHT }
                            })
                        ]
                    })
                );
            } catch (e) {
                console.warn('Failed to embed structure image in docx:', e);
            }
        }

        // Physical Properties Cell Paragraphs
        const propParagraphs = [];
        for (const [key, label] of Object.entries(PROPERTY_LABELS)) {
            if (key === 'formula') continue;
            if (selected[key]) {
                propParagraphs.push(
                    new Paragraph({
                        spacing: { line: LINE_SPACING_115, lineRule: LineRuleType.AUTO, after: 40 },
                        children: [
                            new TextRun({ text: `${label}: `, italics: true, font: 'Arial', size: FONT_SIZE_11PT }),
                            new TextRun({ text: String(selected[key]), font: 'Arial', size: FONT_SIZE_11PT })
                        ]
                    })
                );
            }
        }
        if (propParagraphs.length === 0) {
            propParagraphs.push(
                new Paragraph({
                    spacing: { line: LINE_SPACING_115, lineRule: LineRuleType.AUTO },
                    children: [new TextRun({ text: 'None selected', italics: true, font: 'Arial', size: FONT_SIZE_11PT })]
                })
            );
        }

        // Safety Info Cell Paragraphs
        const safetyParagraphs = [];
        for (const [key, label] of Object.entries(SAFETY_LABELS)) {
            if (selected[key]) {
                safetyParagraphs.push(
                    new Paragraph({
                        spacing: { line: LINE_SPACING_115, lineRule: LineRuleType.AUTO, after: 40 },
                        children: [
                            new TextRun({ text: `${label}: `, italics: true, font: 'Arial', size: FONT_SIZE_11PT }),
                            new TextRun({ text: String(selected[key]), font: 'Arial', size: FONT_SIZE_11PT })
                        ]
                    })
                );
            }
        }
        if (safetyParagraphs.length === 0) {
            safetyParagraphs.push(
                new Paragraph({
                    spacing: { line: LINE_SPACING_115, lineRule: LineRuleType.AUTO },
                    children: [new TextRun({ text: 'None selected', italics: true, font: 'Arial', size: FONT_SIZE_11PT })]
                })
            );
        }

        // Add Row with cantSplit and explicit DXA cell widths
        tableRows.push(
            new TableRow({
                cantSplit: true,
                children: [
                    new TableCell({
                        width: { size: COL1_WIDTH_DXA, type: WidthType.DXA },
                        margins: { top: 100, bottom: 100, left: 140, right: 140 },
                        children: reagentParagraphs
                    }),
                    new TableCell({
                        width: { size: COL2_WIDTH_DXA, type: WidthType.DXA },
                        margins: { top: 100, bottom: 100, left: 140, right: 140 },
                        children: propParagraphs
                    }),
                    new TableCell({
                        width: { size: COL3_WIDTH_DXA, type: WidthType.DXA },
                        margins: { top: 100, bottom: 100, left: 140, right: 140 },
                        children: safetyParagraphs
                    })
                ]
            })
        );
    }

    // Construct Document with Arial 11pt and 1.15 line spacing default
    const doc = new Document({
        styles: {
            default: {
                document: {
                    run: {
                        font: 'Arial',
                        size: FONT_SIZE_11PT
                    },
                    paragraph: {
                        spacing: { line: LINE_SPACING_115, lineRule: LineRuleType.AUTO }
                    }
                }
            }
        },
        sections: [
            {
                properties: {
                    page: {
                        margin: {
                            top: 1440,    // 1 inch
                            bottom: 1440, // 1 inch
                            left: 1440,   // 1 inch
                            right: 1440   // 1 inch
                        }
                    }
                },
                children: [
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { line: LINE_SPACING_115, lineRule: LineRuleType.AUTO, after: 240 },
                        children: [
                            new TextRun({
                                text: 'Material Safety Data Sheet',
                                bold: true,
                                font: 'Arial',
                                size: 32, // 16pt title
                                color: '111827'
                            })
                        ]
                    }),
                    new Table({
                        width: { size: 9360, type: WidthType.DXA }, // Full 6.5 inch printable table width
                        columnWidths: [COL1_WIDTH_DXA, COL2_WIDTH_DXA, COL3_WIDTH_DXA],
                        rows: tableRows
                    }),
                    ...(anyWasteCodeShown ? [
                        new Paragraph({
                            spacing: { line: LINE_SPACING_115, lineRule: LineRuleType.AUTO, before: 160 },
                            children: [
                                new TextRun({
                                    text: 'Waste codes are auto-classified from the DENR Hazardous Waste Classification & Coding guide based on chemical identity, not measured pH or lab-tested concentration — verify before disposal.',
                                    italics: true,
                                    font: 'Arial',
                                    size: 16, // 8pt
                                    color: '4a3b6e'
                                })
                            ]
                        })
                    ] : [])
                ]
            }
        ]
    });

    // Generate Blob and Trigger Download
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Copy the reagent table as rich HTML (with a plain-text fallback) to the clipboard,
 * so it can be pasted straight into an existing Google Doc (or Word doc) as a real
 * table — structure images included, no "Material Safety Data Sheet" heading.
 * @param {Array} chemicals List of processed chemical objects with selected properties
 */
export async function copyTableToClipboard(chemicals) {
    const baseCellStyle = 'border:1px solid #999999;padding:8px;vertical-align:top;font-family:Arial,sans-serif;font-size:11pt;';
    const cellStyle = `${baseCellStyle}background-color:#ffffff;`;
    const headerStyle = `${baseCellStyle}background-color:#f3f4f6;font-weight:bold;text-align:center;`;

    let rowsHtml = `
        <tr>
            <th style="${headerStyle}width:25%;">Reagent</th>
            <th style="${headerStyle}width:42%;">Chemical And Physical Properties</th>
            <th style="${headerStyle}width:33%;">Safety Information</th>
        </tr>
    `;

    for (const item of chemicals) {
        const selected = item.selected || {};
        const chemicalName = titleCase(item.name);

        let reagentCell = `<strong>${chemicalName}</strong>`;
        if (selected.formula) {
            reagentCell += `<br>${formatFormulaHtml(selected.formula)}`;
        }
        if (item.structureSvg) {
            try {
                const pngDataUrl = await svgToPngDataUrl(item.structureSvg, STRUCTURE_RASTER_WIDTH, STRUCTURE_RASTER_HEIGHT);
                // Explicit width/height attributes are what paste sanitizers (Google Docs
                // included) actually honor when sizing an inline image — a CSS max-width
                // alone is often dropped, letting the image paste in at its full raster
                // resolution and overflow the cell. The style is kept as a belt-and-braces
                // cap in case the destination does respect it.
                reagentCell += `<br><img src="${pngDataUrl}" alt="${chemicalName} structure" width="${STRUCTURE_DOCX_WIDTH}" height="${STRUCTURE_DOCX_HEIGHT}" style="max-width:100%;height:auto;display:block;">`;
            } catch (e) {
                console.warn('Failed to embed structure image in clipboard copy:', e);
            }
        }

        const propLines = [];
        for (const [key, label] of Object.entries(PROPERTY_LABELS)) {
            if (selected[key]) propLines.push(`<i>${label}:</i> ${selected[key]}`);
        }
        const propertiesCell = propLines.length > 0 ? propLines.join('<br>') : '<i>None selected</i>';

        const safetyLines = [];
        for (const [key, label] of Object.entries(SAFETY_LABELS)) {
            if (selected[key]) safetyLines.push(`<i>${label}:</i> ${selected[key]}`);
        }
        const safetyCell = safetyLines.length > 0 ? safetyLines.join('<br>') : '<i>None selected</i>';

        rowsHtml += `
            <tr>
                <td style="${cellStyle}">${reagentCell}</td>
                <td style="${cellStyle}">${propertiesCell}</td>
                <td style="${cellStyle}">${safetyCell}</td>
            </tr>
        `;
    }

    const html = `<table style="border-collapse:collapse;width:100%;">${rowsHtml}</table>`;
    const text = chemicals.map((item) => titleCase(item.name)).join('\n');

    await copyRichHtml(html, text);
}

/**
 * Copy rich HTML (with a plain-text fallback) to the clipboard. Prefers the modern
 * async Clipboard API, but that requires a secure context and is often blocked on
 * file:// pages in real browsers — falls back to the older execCommand('copy') on a
 * hidden contenteditable element, which works there.
 */
async function copyRichHtml(html, text) {
    if (navigator.clipboard && window.ClipboardItem) {
        try {
            await navigator.clipboard.write([
                new ClipboardItem({
                    'text/html': new Blob([html], { type: 'text/html' }),
                    'text/plain': new Blob([text], { type: 'text/plain' })
                })
            ]);
            return;
        } catch (e) {
            console.warn('Async clipboard write failed, falling back to execCommand:', e);
        }
    }

    const container = document.createElement('div');
    container.contentEditable = 'true';
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    // Without an explicit width the div shrink-wraps to the table's natural content
    // width, so "width:100%" on the table resolves against that instead of a real
    // page — pin it to a standard page's printable width (8.5in - 1in margins each side).
    container.style.width = '650px';
    container.innerHTML = html;
    document.body.appendChild(container);

    const range = document.createRange();
    range.selectNodeContents(container);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    let success = false;
    try {
        success = document.execCommand('copy');
    } finally {
        selection.removeAllRanges();
        document.body.removeChild(container);
    }

    if (!success) {
        throw new Error('Copy command was not successful.');
    }
}
