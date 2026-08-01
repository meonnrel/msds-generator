/**
 * Molecule Structure Rendering Module
 * Converts SMILES notation into 2D structure drawings via RDKit.js (WASM)
 */

const RDKIT_BASE_URL = 'https://unpkg.com/@rdkit/rdkit/dist/';
const RDKIT_SCRIPT_URL = `${RDKIT_BASE_URL}RDKit_minimal.js`;

let scriptLoadPromise = null;
let rdkitModulePromise = null;

function loadScript(src) {
    if (!scriptLoadPromise) {
        scriptLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
            document.head.appendChild(script);
        });
    }
    return scriptLoadPromise;
}

/**
 * Lazily load and initialize the RDKit.js WASM module (cached after first call)
 * @returns {Promise<Object>} RDKit module instance
 */
function loadRDKit() {
    if (!rdkitModulePromise) {
        rdkitModulePromise = loadScript(RDKIT_SCRIPT_URL).then(() => {
            if (typeof window.initRDKitModule !== 'function') {
                throw new Error('RDKit.js failed to initialize.');
            }
            return window.initRDKitModule({ locateFile: (file) => `${RDKIT_BASE_URL}${file}` });
        });
    }
    return rdkitModulePromise;
}

/**
 * Kick off RDKit.js loading in the background so it's ready before it's needed
 */
export function preloadRDKit() {
    loadRDKit().catch((e) => console.warn('RDKit preload failed:', e));
}

const ASPECT_RATIO = 170 / 220;
const MIN_CANVAS_WIDTH = 120;
const MAX_CANVAS_WIDTH = 340;
const PX_PER_ATOM = 15;

/**
 * Render a SMILES string to an inline 2D structure SVG. The canvas is sized to the
 * molecule's own heavy-atom count rather than a single fixed size for every molecule —
 * RDKit auto-fits the drawing to whatever canvas it's given, so a small molecule dropped
 * into an oversized canvas ends up as a tiny drawing surrounded by empty padding, while a
 * canvas sized to the molecule fills edge-to-edge. The final on-screen size is still
 * whatever the CSS container specifies (see .reagent-structure-cell svg), so molecules of
 * every size end up equally "full" once displayed, and bond thickness stays proportionate.
 * @param {string} smiles
 * @returns {Promise<string|null>} SVG markup, or null if unavailable/invalid
 */
export async function smilesToSvg(smiles) {
    if (!smiles || smiles === 'Not Available') return null;

    let mol = null;
    try {
        const RDKit = await loadRDKit();
        mol = RDKit.get_mol(smiles);
        if (!mol) return null;

        const atomCount = mol.get_num_atoms ? mol.get_num_atoms() : 12;
        const width = Math.min(MAX_CANVAS_WIDTH, Math.max(MIN_CANVAS_WIDTH, MIN_CANVAS_WIDTH + atomCount * PX_PER_ATOM));
        const height = Math.round(width * ASPECT_RATIO);

        // Thin, scale-proportional bonds so larger/denser molecules (compressed
        // more tightly to fit the canvas) don't end up with stubby, cluttered lines
        return mol.get_svg_with_highlights(JSON.stringify({
            width,
            height,
            bondLineWidth: 1,
            scaleBondWidth: true,
            minFontSize: 12,
            maxFontSize: 16
        }));
    } catch (e) {
        console.warn('Failed to render structure for SMILES:', smiles, e);
        return null;
    } finally {
        if (mol) mol.delete();
    }
}

/**
 * Rasterize an SVG structure drawing into a PNG data URL (for docx embedding)
 * @param {string} svgMarkup
 * @param {number} width
 * @param {number} height
 * @returns {Promise<string>} PNG data URL
 */
export function svgToPngDataUrl(svgMarkup, width = 320, height = 240) {
    return new Promise((resolve, reject) => {
        const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = (e) => {
            URL.revokeObjectURL(url);
            reject(e);
        };
        img.src = url;
    });
}
