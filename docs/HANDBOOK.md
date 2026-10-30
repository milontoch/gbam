# HandyQuill handbook

Everything you need to run, change and grow the site, in one place. Written 30 October 2026.

## 1. What this is

HandyQuill is a set of free tools that run inside the visitor's browser. Files and typed text are not uploaded anywhere.

- **Live address (free, kept for now):** https://gbam.bematthew164.workers.dev
- **Code:** https://github.com/milontoch/gbam (public)
- **Hosting:** Cloudflare Workers with static files. Every push to the `main` branch builds and publishes automatically in about a minute.
- **Built with:** Astro (static pages), TypeScript, plain CSS. Libraries: `pdf-lib` and `fflate` (PDF and ZIP), `pdfjs-dist` (draw PDF pages), `onnxruntime-web` with the MODNet model (passport photo background tool).

### The 13 tools

Image: Compress Image, Resize Image, Passport Photo Maker. PDF: Merge, Split, Rotate, Compress, Images to PDF. Documents: Invoice and Receipt, CV Builder. Calculators and WhatsApp: CGPA Calculator, Loan Interest Calculator, WhatsApp Link Generator.

## 2. Daily commands

| Command | What it does |
|---|---|
| `npm install` | Install what the project needs (do this first on a new computer) |
| `npm run dev` | Work on the site at http://localhost:4321. Unpublished guides (drafts) show here |
| `npm run build` | Build the real site into `dist/` |
| `npm run preview` | Look at the built site locally |
| `npm run check` | Type-check (finds mistakes without running the site) |
| `npm run test:e2e` | Build, then run every browser test (about 15 minutes) |
| `node tests/run.mjs --only=pdfrotate` | Run one group of tests. Groups: pages, seo, images, pdf, pdfcompress, pdfmaker, pdfrotate, docs, calc, passport, security, slow |
| `BASE_URL=https://gbam.bematthew164.workers.dev node tests/run.mjs` | Run the tests against the live site |
| `node tests/headers-live.mjs https://gbam.bematthew164.workers.dev` | Check the live security headers |
| `npm run seo:baseline` | Re-record the SEO reference (see section 6) |

Needs **Node 22.23.4 or newer**. The project pins Node 24 in `.node-version`, which GitHub and Cloudflare both read.

## 3. How a change reaches the world

1. Edit, then run `npm run check` and the relevant tests.
2. `git add`, `git commit`, `git push origin main`.
3. GitHub runs the same checks on its own computer (the "test" check). Cloudflare builds and publishes (the "Workers Builds" check). Both should show a green tick on the commit at github.com/milontoch/gbam.
4. If Cloudflare's build fails, the old site stays live. Look at the build log in the Cloudflare dashboard (Workers & Pages, the `gbam` project, Deployments).

## 4. Routine jobs

**Add a tool.** (1) Add an entry to `src/data/tools.ts` (name, titles, descriptions, `live: true`). (2) Add `src/pages/<slug>.astro` using `ToolPage`. (3) Add `src/scripts/<slug>.ts`. Keep calculation or layout logic in a separate `*-core.ts` file so tests can check it directly. (4) Add a test file in `tests/` and register it in `tests/run.mjs`. (5) Run `npm run seo:baseline` after checking that only the new page was flagged.

**Publish a guide.** Guides are Markdown files in `src/content/guides/`. `draft: true` keeps one unpublished. When you have read it and checked every claim, change it to `draft: false` and push. Then run `npm run seo:baseline`. Guide titles must be 55 characters or fewer and descriptions 70 to 160, and the build stops if they are not.

**Change the contact email, date or analytics.** Edit `src/data/site.ts`. Update `updated` whenever you change the Privacy or Terms text. An empty `analyticsToken` removes all analytics code from the site.

**Update dependencies.** GitHub's Dependabot opens a pull request every week. Merge it only when GitHub's check is green. Be careful with major versions (for example TypeScript 7), because they can break things.

## 5. Privacy and security rules the code follows

- No tool sends your files or typed text anywhere. The tests check this on every page: no request leaves the site, nothing is uploaded, no cookies, nothing kept in browser storage. The one allowed outside contact is Cloudflare's cookie-free analytics.
- `public/_headers` sets a strict Content-Security-Policy: only the site's own scripts run, no inline code, no `eval`. `wasm-unsafe-eval` is allowed only because the passport photo tool runs WebAssembly.
- **If you add anything from another company** (ads, a chat widget, other analytics), you must widen the policy in `public/_headers` for that company's addresses, and then run `node tests/run.mjs --only=security`. Add each address one at a time, and update the Privacy page to match.
- No secrets are in the repository. The analytics token and the Search Console token are public values by design.

## 6. The SEO safety net

`tests/seo-baseline.json` records every page's address, title, description, heading, canonical link and structured data. A test fails if any of them changes by accident. When a change is intended, check it, then run `npm run seo:baseline` and commit the new file. **Never change a page address casually.** Google has already learned the current addresses.

You can redesign freely (colours, fonts, layout in `src/styles/` and `src/layouts/`). Keep the addresses, text, headings, links and speed the same, and the safety net will tell you if something slips.

## 7. Moving to your own domain (when you are ready)

Everything below depends on `site` in `astro.config.mjs`, which feeds the sitemap, robots.txt, canonical links and share image.

**Before you pay**
1. Choose the final brand name first. Make the name and the domain match.
2. Use a registrar that shows the **total price for this exact name**, and check the renewal price. Treat the word "premium" as a stop sign. (`handy.site` was a premium name: the first registrar took the money and showed "Active", but the registry never registered it, and the name would have cost about ₦3.3 million. A refund was needed.)
3. Prefer a `.com`.

**After you pay: confirm it is real**
- `.com`: `whois -h whois.verisign-grs.com yourname.com` must NOT say "No match". Other endings: `whois -h whois.nic.<ending> yourname.<ending>`.
- Within minutes, `dig +short NS yourname.com` should list nameservers. If neither shows within an hour, contact the registrar before doing anything else.

**Connect it**
1. Add the domain to Cloudflare (free plan) and change the nameservers at the registrar.
2. In the Worker's settings add a custom domain. Turn on "Always Use HTTPS".
3. Change `site` in `astro.config.mjs`. Rebuild, run `npm run seo:baseline` (canonical links change), run all tests, push.
4. Redirect the old `*.workers.dev` address to the new one with permanent (301) redirects, and keep them for **at least a year** (Google's advice). This needs a few lines of Worker code, because `workers.dev` addresses cannot use the normal redirect settings.
5. Search Console: add the new domain as its own property (verify with DNS), submit `sitemap.xml`, and keep the old property for monitoring.
6. Web Analytics: add the new hostname, put its token in `src/data/site.ts`.
7. Optional: Cloudflare Email Routing for `hello@yourdomain`, then update `email` in `src/data/site.ts` and the Privacy and Terms date.
8. Expect a few weeks of settling in Google's results. Do not promote the old address in the meantime.

## 8. AdSense notes

- Needs an adult account holder, original content, and access to the site's HTML.
- Google's help page lists "subdomains on platforms already on the public suffix list" as addable sites, and `workers.dev` is on that list, so the current address is technically eligible. Approval still depends on content quality. A site that moves later needs to be added and reviewed again, which is why a final domain first is cheaper.
- The most common rejection is "low value content". Publish several genuinely useful guides first, and avoid thin or copied pages.
- Ads need a wider security policy (section 5) and, for visitors in Europe and the UK, a consent message.
- Never click your own ads or ask others to. Never buy traffic. Either can close the account permanently.

## 9. Known limits (so they are never a surprise)

- iPhone HEIC photos open only in Safari. Chrome and Firefox cannot open them.
- The passport photo background tool downloads about 10 MB the first time (model plus engine). It asks first on slow connections.
- Password-protected PDFs cannot be processed. The tools say so.
- Compress PDF "Maximum" mode turns pages into pictures, so text is no longer selectable. "Keep text" only helps when the PDF contains large pictures.
- `pdf-lib` has had no updates since 2021. It works well, but if a security problem is ever found in it, it would need replacing.
- The CGPA degree classes are the bands commonly published for Nigerian universities. They are not an official ruling for any one school, and the tool says so.
- Tested automatically in Chrome only. Safari, Firefox and real phones were not tested by machine. Check new work by hand on an iPhone and an Android phone.

## 10. Things still open

- **Three guides are drafts waiting for a human review:** the WhatsApp chat link, how to calculate CGPA, and flat versus reducing balance loans.
- **PAYE and POS-charge calculators** were deliberately not built. They depend on rules that change. Build them only from the current official tables.
- **A link-in-bio page**, the second WhatsApp helper from the original plan.
- **A 4.0-scale CGPA mode** for universities that use it.
- **The domain move** (section 7).
