# MSDS Generator (Web Version)

![MSDS Generator Banner](https://img.shields.io/badge/License-MIT-purple.svg) ![Build Status](https://img.shields.io/badge/Hosting-GitHub_Pages-brightgreen.svg) ![PubChem](https://img.shields.io/badge/Data_Source-PubChem_PUG_REST-blue.svg)

> A modern, 100% client-side web application that generates formatted Material Safety Data Sheets (MSDS / SDS) using live chemical data from NCBI's PubChem database.

Designed for pre-lab students, chemists, and lab researchers who need quick, clean, and customized reagent safety tables for lab notebooks and reports.

---

## ✨ Features

- ⚡ **100% Client-Side & Free**: Runs entirely in your browser using PubChem's REST & PUG View APIs with zero backend or API keys required.
- 🔍 **Live Autocomplete**: Real-time chemical search dropdown powered by PubChem.
- 🧪 **Quick Presets**: 1-click presets for common pre-lab reagents (*Ethanol, Acetone, Hydrochloric Acid, Sodium Hydroxide, Sulfuric Acid, Benzoic Acid, etc.*).
- 🎛️ **Customizable Properties**: Toggle individual physical properties (Formula, Molar Mass, Appearance, Odor, Boiling Point, Melting Point, Density, Solubility) and safety data (Hazards, First Aid).
- 📝 **Formatted Chemical Formulas**: Automatic HTML subscript formatting (e.g., $H_2SO_4$, $C_2H_5OH$).
- 📄 **Word Export (.docx)**: Direct in-browser Word document export matching standard academic lab report tables.
- 📊 **CSV & Clipboard Copy**: Export to CSV or copy formatted tables directly into Google Docs, Excel, or Notion.
- 🖨️ **Print & PDF Support**: Print stylesheet optimized for printing physical lab notebook reference sheets.
- 🌙 **Dark & Light Mode**: Built-in sleek dark glassmorphism and light laboratory themes.

---

## 🚀 How to Host for FREE on GitHub Pages

You can host this static website for free on GitHub Pages in under 2 minutes:

### Step 1: Create a New GitHub Repository
1. Go to [GitHub New Repository](https://github.com/new).
2. Name your repo (e.g. `msds-generator-web` or `msds-generator`).
3. Set visibility to **Public**.
4. Leave initialized options unchecked and click **Create repository**.

### Step 2: Push Your Code to GitHub
Open your terminal inside this folder (`C:\Users\ASUS\Documents\Programming\msds-generator-web`) and run:

```bash
git init
git add .
git commit -m "Initial commit of MSDS Generator web app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

*(Replace `YOUR_USERNAME` and `YOUR_REPO_NAME` with your actual GitHub username and repository name).*

### Step 3: Enable GitHub Pages
1. On GitHub, go to your repository's **Settings** tab.
2. Click **Pages** in the left sidebar menu.
3. Under **Build and deployment** -> **Source**, select **Deploy from a branch**.
4. Under **Branch**, select `main` and folder `/ (root)`, then click **Save**.
5. After 1 minute, GitHub Pages will give you your free live URL:
   `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/`

---

## 🛠️ Local Development

No Node.js or build steps required! Simply open `index.html` in any web browser or use a live server extension (like VS Code Live Server):

```bash
# Optional: using Python's built-in HTTP server
python -m http.server 8000
```

Then visit `http://localhost:8000` in your browser.

---

## 📡 API Reference

Data is retrieved live from the NCBI PubChem database:
- **Autocomplete**: `https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound/{query}/JSON`
- **PUG REST Compound CIDs**: `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{chemical}/cids/JSON`
- **PUG View Full Record**: `https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/{cid}/JSON`

---

## 👤 Author

Coded with ❤️ by **[@meonnrel](https://github.com/meonnrel)**  
Instagram: [@meonnrel](https://www.instagram.com/meonnrel/)

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
