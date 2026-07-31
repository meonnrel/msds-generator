/**
 * Document Export Module for MSDS Generator
 * Handles Word (.docx) export
 */

import { titleCase } from './pubchem.js';

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
    first_aid: 'First Aid'
};

// Font Size: 11pt = 22 (docx half-points)
const FONT_SIZE_11PT = 22;
// Line Spacing: 1.15 line height = 276 (where 240 is 1.0)
const LINE_SPACING_115 = 276;

// Table Column Widths in DXA (Total Printable Width = 9360 DXA for 8.5" page with 1" margins)
const COL1_WIDTH_DXA = 2060; // Reagent (~22%)
const COL2_WIDTH_DXA = 4300; // Physical Properties (~46%)
const COL3_WIDTH_DXA = 3000; // Safety Information (~32%)

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
    for (const item of chemicals) {
        const selected = item.selected || {};
        const chemicalName = titleCase(item.name);

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
                    })
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
