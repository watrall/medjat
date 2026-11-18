# Ancient Egypt Research Explorer

An independent research workspace for discovering ancient Egyptian scholarship through Crossref metadata. Search the literature, inspect publication records, follow deposited references, save useful works, and export a bibliography.

The explorer covers ancient Egypt from the Predynastic to Roman Egypt. It is built for research, teaching, and bibliography development, with explicit limits on coverage and metadata completeness.

## Research workflow

1. **Discover.** Search a topic, site, author, or DOI. Use the left-hand refinements to add a historical period, publication year, type, or metadata requirement. Historical period adds keywords; the other controls use supported Crossref filters. Apply these together with Update search or the main Search button.
2. **Evaluate.** Open a publication beside the results. Read its deposited abstract, authors, identifiers, affiliations, funding, licenses, and source metadata where available.
3. **Follow connections.** Inspect references and deposited relations without losing the original results. Return to the preceding publication in the inspector.
4. **Collect.** Save publications from either the results or the inspector. The collection is matched by DOI and retained in the current browser.
5. **Reuse.** Copy APA, MLA, or Chicago author-date citations. Export the collection as RIS, BibTeX, CSV, or a JSON backup. JSON backups can be imported and merged without duplicating DOIs.

Books and chapters can display an ISBN-matched cover from Open Library. A chapter's cover represents the containing book. Missing covers leave a text-only record.

## Run locally

The application is static HTML, CSS, and ES modules. There is no runtime framework, database, API key, or required account.

With Python 3 installed:

```sh
python3 scripts/serve.py
```

Open [the local explorer](http://127.0.0.1:8614). Use an HTTP server rather than opening `index.html` directly, because the browser needs to load ES modules.

Alternatively, after installing the development dependencies:

```sh
npm ci
npm run dev
```

Static hosts, including GitHub Pages, can serve the repository root directly. There is no compilation step. Relative asset paths support deployment under a repository subpath. `.nojekyll` keeps GitHub Pages in static-file mode.

## Coverage and interpretation

Crossref exposes metadata deposited for DOI-bearing research outputs. It is **not a complete Egyptology bibliography**. Older scholarship, non-DOI publications, and some books and journals may be absent.

- Queries are relevance ranked; they are not exact-phrase or controlled-vocabulary searches. Candidate counts describe the Crossref query, not the size of a verified ancient Egyptian bibliography.
- Periods are discoverability aids, not authoritative historical classifications attached to individual records. Publication dates refer to the modern publication, not the historical period it studies.
- Missing abstracts, ORCIDs, references, or funding indicate missing deposited metadata. They do not indicate a publication's quality or the absence of relevant scholarship.
- A DOI opens a publication's landing page. Full-text access may be restricted.
- References and relations are shown when deposited. A Cited-by count does not provide a complete reverse citation graph.
- Formatted citations and format conversions can lose information. Check exports against the publication and your required citation style. Generic RIS types are corrected where the deposited Crossref type provides an unambiguous mapping.
- The application does not insert demonstration publications or fabricate ORCID associations.

Approximate historical ranges follow the [Egypt Exploration Society chronology](https://www.ees.ac.uk/static/102ae8e9-31ea-432d-a8d7434e3c65917d/EES-Chronology-of-Egypt.pdf). Chronological conventions differ; this is one consistently attributed reference.

## Data, storage, and privacy

Searches go directly from the browser to Crossref. Requests identify the application contact through `mailto=ethan.watrall@gmail.com`; there are no credentials in the frontend. The client caches recent responses in memory, cancels superseded searches, applies timeouts, and backs off on appropriate transient errors.

The collection is stored in `localStorage` on the current browser and origin. It is not synchronized between devices or between localhost and a hosted deployment. Private browsing, clearing browser data, and storage limits can remove it. The interface reports storage failures; export a JSON backup to keep a portable copy. Collections support up to 500 publications.

Open Library cover requests contain the deposited ISBN of the inspected book. Covers are requested only for inspected records and credited to Open Library. Google Fonts supplies Quicksand. Crossref supplies the official “Metadata from Crossref” badge directly from its asset CDN, following its [brand guidance](https://www.crossref.org/brand/). There is no application analytics or account system.

## Application structure

Quicksand typography, Lucide icons, and the supplied papyrus mark define the interface. The layout moves from a refinement/list/inspector workspace on desktop to linked list and detail views on mobile.

| Module | Responsibility |
| --- | --- |
| `js/main.js` | Query state, view transitions, result rendering, and collection actions |
| `js/data.js` | Scholarly period presets, normalization, identifiers, and shareable query state |
| `js/crossref.js` | API requests, cancellation, caching, retries, pagination, and citation negotiation |
| `js/inspector.js` | Publication metadata, references, relationships, and citation views |
| `js/collection.js` | Collection validation, persistence, and import/backup format |
| `js/export.js` | Bibliography conversion, CSV, JSON, and downloads |
| `js/covers.js` | ISBN validation and attributed Open Library covers |
| `js/dom.js` | Text-safe DOM construction and shared interface helpers |
| `css/tokens.css` | Primitive and semantic design tokens |
| `css/workspace.css` | Components, layout, responsive behavior, and interaction states |

API-supplied text is rendered through DOM text nodes. Data is not embedded in inline event handlers. DOI, ORCID, ISBN, and external URL handling have explicit validation. Raw deposited records remain available for download.

## Development checks

Use Node 24 and Python 3:

```sh
npm ci
npm run check
npm test
npm run test:e2e
```

Local browser tests use installed Google Chrome. In CI they use Playwright Chromium; install it with `npx playwright install --with-deps chromium`. Browser tests isolate synthetic fixtures under `tests/browser`; fixtures are not served as fallback research results. The suite covers the discover/inspect/save/export/import workflow, persistence, keyboard focus, period/filter queries, pagination, history, references, narrow layouts, errors, empty responses, untrusted metadata, and automated accessibility checks.

An optional live integration check makes a small number of real Crossref requests:

```sh
npm run test:live
```

The live check is deliberately separate from CI because service availability and deposited records can change. To capture real-data responsive previews while the app is served:

```sh
node scripts/capture-previews.mjs
```

The checked-in Lucide sprite contains only the icons used by the interface. Regenerate it after changing the icon list:

```sh
npm run build:icons
```

## Sources and licenses

Application code: [MIT](LICENSE). Lucide icons: [ISC](assets/LUCIDE-LICENSE). The papyrus logo was supplied by the project owner. Publication metadata is retrieved from Crossref; book cover images are provided by Open Library and are not relicensed by this repository.

Service documentation: [Crossref API guidance](https://www.crossref.org/documentation/retrieve-metadata/rest-api/tips-for-using-the-crossref-rest-api/), [content negotiation](https://www.crossref.org/documentation/retrieve-metadata/content-negotiation/), and [Open Library cover service](https://openlibrary.org/dev/docs/api/covers).
