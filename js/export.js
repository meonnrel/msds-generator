/**
 * Document Export Module for MSDS Generator
 * Handles Word (.docx), CSV, and Clipboard copying
 */

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

/**
 * Format chemical formula into array of docx TextRun parts (subscript numbers)
 */
function createFormulaRuns(docx, formula) {
    if (!formula || formula === 'Not Available') {
        return [new docx.TextRun({ text: 'Not Available', font: 'Arial', size: 24 })];
    }

    const parts = formula.split(/(\d+)/);
    return parts.map(part => {
        const isNum = /^\d+$/.test(part);
        return new docx.TextRun({
            text: part,
            font: 'Arial',
            size: 24,
            subScript: isNum
        });
    });
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

    const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, AlignmentType, WidthType, BorderStyle } = window.docx;

    if (!filename.endsWith('.docx')) {
        filename += '.docx';
    }

    // Build Table Rows
    const tableRows = [];

    // Header Row
    const headerRow = new TableRow({
        tableHeader: true,
        children: [
            new TableCell({
                width: { size: 25, type: WidthType.PERCENTAGE },
                shading: { fill: 'F3F4F6' },
                margins: { top: 150, bottom: 150, left: 150, right: 150 },
                children: [
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: 'Reagent', bold: true, font: 'Arial', size: 24, color: '111827' })]
                    })
                ]
            }),
            new TableCell({
                width: { size: 42, type: WidthType.PERCENTAGE },
                shading: { fill: 'F3F4F6' },
                margins: { top: 150, bottom: 150, left: 150, right: 150 },
                children: [
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: 'Chemical And Physical Properties', bold: true, font: 'Arial', size: 24, color: '111827' })]
                    })
                ]
            }),
            new TableCell({
                width: { size: 33, type: WidthType.PERCENTAGE },
                shading: { fill: 'F3F4F6' },
                margins: { top: 150, bottom: 150, left: 150, right: 150 },
                children: [
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: 'Safety Information', bold: true, font: 'Arial', size: 24, color: '111827' })]
                    })
                ]
            })
        ]
    });

    tableRows.push(headerRow);

    // Data Rows
    for (const item of chemicals) {
        const selected = item.selected || {};
        const chemicalName = item.name.charAt(0).toUpperCase() + item.name.slice(1);

        // Reagent Cell Paragraphs
        const reagentParagraphs = [
            new Paragraph({
                children: [new TextRun({ text: chemicalName, bold: true, font: 'Arial', size: 24 })]
            })
        ];

        if (selected.formula) {
            reagentParagraphs.push(
                new Paragraph({
                    children: createFormulaRuns(docx, selected.formula)
                })
            );
        }

        // Physical Properties Cell Paragraphs
        const propParagraphs = [];
        for (const [key, label] of Object.entries(PROPERTY_LABELS)) {
            if (key === 'formula') continue; // Formula is in reagent cell
            if (selected[key]) {
                propParagraphs.push(
                    new Paragraph({
                        spacing: { after: 60 },
                        children: [
                            new TextRun({ text: `${label}: `, italics: true, font: 'Arial', size: 24 }),
                            new TextRun({ text: String(selected[key]), font: 'Arial', size: 24 })
                        ]
                    })
                );
            }
        }
        if (propParagraphs.length === 0) {
            propParagraphs.push(new Paragraph({ children: [new TextRun({ text: 'None selected', italics: true, font: 'Arial', size: 24 })] }));
        }

        // Safety Info Cell Paragraphs
        const safetyParagraphs = [];
        for (const [key, label] of Object.entries(SAFETY_LABELS)) {
            if (selected[key]) {
                safetyParagraphs.push(
                    new Paragraph({
                        spacing: { after: 60 },
                        children: [
                            new TextRun({ text: `${label}: `, italics: true, font: 'Arial', size: 24 }),
                            new TextRun({ text: String(selected[key]), font: 'Arial', size: 24 })
                        ]
                    })
                );
            }
        }
        if (safetyParagraphs.length === 0) {
            safetyParagraphs.push(new Paragraph({ children: [new TextRun({ text: 'None selected', italics: true, font: 'Arial', size: 24 })] }));
        }

        // Add Row
        tableRows.push(
            new TableRow({
                children: [
                    new TableCell({
                        margins: { top: 120, bottom: 120, left: 150, right: 150 },
                        children: reagentParagraphs
                    }),
                    new TableCell({
                        margins: { top: 120, bottom: 120, left: 150, right: 150 },
                        children: propParagraphs
                    }),
                    new TableCell({
                        margins: { top: 120, bottom: 120, left: 150, right: 150 },
                        children: safetyParagraphs
                    })
                ]
            })
        );
    }

    // Construct Document
    const doc = new Document({
        sections: [
            {
                children: [
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 300 },
                        children: [
                            new TextRun({
                                text: 'Material Safety Data Sheet',
                                bold: true,
                                font: 'Arial',
                                size: 36,
                                color: '1F2937'
                            })
                        ]
                    }),
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
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

/**
 * Export selected chemical data to CSV format
 */
export function exportToCsv(chemicals, filename = 'MSDS_Output.csv') {
    if (!filename.endsWith('.csv')) filename += '.csv';

    const rows = [
        ['Reagent', 'Formula', 'Molar Mass', 'Appearance', 'Odor', 'Boiling Point', 'Melting Point', 'Density', 'Solubility', 'Hazards', 'First Aid']
    ];

    for (const item of chemicals) {
        const s = item.selected || {};
        rows.push([
            item.name,
            s.formula || '',
            s.molar_mass || '',
            s.appearance || '',
            s.odor || '',
            s.boiling_point || '',
            s.melting_point || '',
            s.density || '',
            s.solubility || '',
            s.hazards || '',
            s.first_aid || ''
        ]);
    }

    const csvContent = rows
        .map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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
 * Copy formatted text table to clipboard
 */
export async function copyTableToClipboard(chemicals) {
    let tsv = 'Reagent\tChemical & Physical Properties\tSafety Information\n';

    for (const item of chemicals) {
        const s = item.selected || {};
        const chemicalName = item.name.toUpperCase() + (s.formula ? ` (${s.formula})` : '');
        
        const propsArr = [];
        for (const [key, label] of Object.entries(PROPERTY_LABELS)) {
            if (key !== 'formula' && s[key]) {
                propsArr.push(`${label}: ${s[key]}`);
            }
        }
        const propsStr = propsArr.join(' | ');

        const safetyArr = [];
        for (const [key, label] of Object.entries(SAFETY_LABELS)) {
            if (s[key]) {
                safetyArr.push(`${label}: ${s[key]}`);
            }
        }
        const safetyStr = safetyArr.join(' | ');

        tsv += `${chemicalName}\t${propsStr}\t${safetyStr}\n`;
    }

    await navigator.clipboard.writeText(tsv);
}
