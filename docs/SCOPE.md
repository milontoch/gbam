# Gbam: scope, site map, structure

## Launch tools (8 pages from 5 families)

| # | Page URL | Tool | Library | Risk |
|---|----------|------|---------|------|
| 1 | /compress-image | Image compressor | Canvas API (built in) | Low |
| 2 | /resize-image | Image resizer | Canvas API (built in) | Low |
| 3 | /merge-pdf | Merge PDF | pdf-lib | Low |
| 4 | /split-pdf | Split PDF | pdf-lib | Low |
| 5 | /invoice-generator | Invoice / receipt generator | print-to-PDF via browser | Medium |
| 6 | /passport-photo-maker | Passport photo maker | Canvas API | Medium |
| 7 | /cv-builder | CV builder | print-to-PDF via browser | Medium |
| 8 | /compress-pdf | Compress PDF (page re-render) | pdfjs-dist + pdf-lib | High, cut first |

Build order: 1 (proves the template), then 2, 3, 4, 5, 6, 7, 8.

## Site map

- / (Home: tool grid, privacy message)
- 8 tool pages above (flat URLs, short and keyword-based)
- /about, /privacy, /terms, /contact
- /sitemap.xml and /robots.txt (generated or static)
- /404

## Later (not in v1)
Calculators (PAYE, POS charges, CGPA, loan interest), WhatsApp helpers, AI tools with daily limits.

## Folder structure

```
gbam/
  public/                 files served as-is (favicon, robots.txt, _headers)
  src/
    layouts/              Base.astro (every page), ToolPage.astro (every tool)
    components/           Header, Footer, ToolCard, PrivacyBadge, FileDropzone
    data/tools.ts         ONE list of all tools; home grid, menu and sitemap read from it
    pages/                one file per URL (index.astro, compress-image.astro, ...)
    scripts/              browser logic per tool (compress-image.ts, merge-pdf.ts, ...)
    styles/               global.css (design tokens), tool.css
  docs/                   notes like this file
  astro.config.mjs
  package.json
```

Rule: adding a tool = one entry in tools.ts + one page + one script.
