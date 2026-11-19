# Medjat

**Ancient Egyptian Research Explorer**

An independent research workspace for discovering ancient Egyptian scholarship through Crossref metadata. Search the literature, examine whole-search patterns, trace shared references, review ancient-place evidence, and maintain a reusable bibliography.

The explorer covers ancient Egypt from the Predynastic to Roman Egypt. It is built for research, teaching, and bibliography development, with explicit limits on coverage and metadata completeness.

## Research workflow

1. **Discover.** Search a topic, site, author, or DOI. Use the left-hand refinements to add a historical period, publication year, type, or metadata requirement. Historical period adds keywords; the other controls use supported Crossref filters. Apply these together with Update search or the main Search button.
2. **Evaluate.** Open a publication beside the results. Read its deposited abstract, authors, identifiers, affiliations, funding, licenses, and source metadata where available.
3. **Follow connections.** Inspect references and deposited relations without losing the original results. Return to the preceding publication in the inspector.
4. **Collect.** Save publications from either the results or the inspector. The collection is matched by DOI and retained in the current browser.
5. **Reuse.** Copy APA, MLA, or Chicago author-date citations. In Collection, choose all saved, matching, or selected records and export RIS, BibTeX, CSV, or JSON. The controls show the exact scope and count; selection can include records outside the current search. Export takes a snapshot and leaves the list and selection intact. JSON backups can be imported and merged without duplicating DOIs.

Books and chapters can display an ISBN-matched cover from Open Library. A chapter's cover represents the containing book. Missing covers leave a text-only record.

## Beyond search

**Visualize** summarizes the entire applied Crossref query, including its period keywords and publication filters. Publication years, publication types, leading venues, and metadata availability come from server-side aggregates, not the first 25 results or the publications currently loaded. Select a supported chart category, then choose **Explore these publications** to refine the search. Unsubmitted topic edits remain in the search field. Tables provide the same chart values, and aggregate CSV includes the query, retrieval times, counts, and any unavailable summaries.

Crossref facet counts are approximate. Year buckets are limited to 1,000 returned values, venues to ten, and unavailable buckets are not treated as zero. Availability counts overlap. Broad keyword results can include irrelevant scholarship; charts describe Crossref candidates, not a verified disciplinary corpus. Exact DOI lookup has a single-record summary instead of comparative charts.

**Reference discovery**, inside Collection, compares deposited references from your selected publications, or all saved publications when nothing is selected. It finds sources cited by multiple seed works, DOI references missing from your bibliography, unresolved citations, and deposited relationships. The network is a bounded reading aid with equivalent connection lists: at most 50 seed works, 100 referenced nodes, and 500 displayed edges. It does not reconstruct a complete Cited-by graph. Review lists display the first 100 items in each category; select a narrower seed set to control the analysis.

For a citation without a DOI, request up to three possible Crossref matches, inspect a candidate, and explicitly confirm it. Rebuilding discovery incorporates confirmed links with separate researcher provenance. Matches can be undone. References and unresolved citations support deferred/dismissed review decisions; saving a reference adds its actual Crossref record to Collection.

**Places** connects a real interactive map to Crossref research. Choose one of 25 curated Pleiades places to search Crossref by a place name and optional topic, inspect ranked candidates, and save useful publications. Explicit title/abstract mentions are shown with their evidence; other candidates stay available in a disclosure. Place mentions in publication details link directly to Places and retain the originating publication, unfinished search, and return path.

Switch to **Your collection** to inspect place associations in saved Crossref records. Confirm or reject suggestions, assign places using your reading, mark nonspatial scholarship as not place-specific, and export the exact place/evidence subset in RIS, BibTeX, CSV, or JSON. Applied search names, topics, and evidence scope survive refresh and history navigation. Assignment has local search, full publication identity, a preview, and a direct entry above the list. Removal has local Undo; marking a work not place-specific retains its reviews for reversal. On mobile the selected-place map is compact and expandable, with search refinements disclosed on demand. Publications may have multiple places. The interface accounts for unassigned and nonspatial records; it never claims to map the entire Crossref query.

**Living bibliography**, inside Collection, checks saved DOIs against current Crossref metadata on request. Compare changed fields, inspect the current record, and accept or defer each update. Accepted changes preserve the original save time and retain previous metadata in the research backup. Concurrent changes or removals in another tab prevent stale acceptance. Update notices expose their deposited type, source, and DOI; read the notice to establish its meaning. A check finding no notices is not proof that a work has no correction or retraction.

Repository: [watrall/medjat](https://github.com/watrall/medjat).

## Run locally

The application is static HTML, CSS, and ES modules. There is no runtime framework, backend service, API key, or required account.

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

The source runs directly without compilation. For hosting, use `npm run build` to assemble the runtime files in `dist/`. Relative asset paths support deployment under a subpath.

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

Medjat retains the existing browser storage identifiers and accepts collection backups exported under the former Ancient Egypt Research Explorer name. The collection is stored in IndexedDB on the current browser and origin. Read/write transactions protect concurrent saves, removals, and imports; open tabs refresh through change notifications. Existing localStorage collections migrate once without deleting the original backup. The collection is not synchronized between devices or between localhost and a hosted deployment. Private browsing, clearing browser data, and storage limits can remove it. The interface reports storage failures and keeps changes in memory for the visit when persistence is unavailable; export a JSON backup to keep a portable copy. Collections support up to 500 publications.

Research review decisions are stored per item in localStorage, with a session fallback when storage is unavailable. JSON version 2 backups include these decisions and remain compatible with version 1 publication-only imports. Scoped JSON exports include the scoped publications and the current decisions for the single reading list. Research backups preserve review dates; they are not an immutable audit log. Places reads a bundled Pleiades gazetteer. Place-name/topic searches are sent to Crossref. OpenStreetMap supplies map tiles and receives map-area requests, the normal browser Referer, and network information; publication records and review decisions are not sent to the tile provider. Local name matching does not send publication text to Pleiades. The map can be used through its place selector and publication list if tiles are unavailable.

The current view and inspected DOI are addressable in the URL. Per-tab session storage retains unfinished query changes, collection search, and the reference reading trail, including expanded references and focus position. This is reading-position convenience, not a backup. Places URLs also retain the applied name, topic, and evidence scope; per-tab state retains draft refinements, map expansion, assignment choices, and an inspected publication. A shared collection-filter URL uses the receiving browser’s local saved list. Search results are retrieved again on refresh and may change; saved publications remain independent of those results.

Publication-date sorts use offset pagination, limited here to the first 10,000 candidates; relevance uses cursor pagination. Narrow the topic or publication years for deeper date-specific research. These controls follow the [current Crossref API contract](https://api.crossref.org/swagger-ui/index.html); publication dates are never replaced with deposit dates.

Open Library cover requests contain the deposited ISBN of the inspected book. Covers are requested only for inspected records and credited to Open Library. Google Fonts supplies Quicksand. Crossref supplies the official “Metadata from Crossref” badge directly from its asset CDN, following its [brand guidance](https://www.crossref.org/brand/). There is no application analytics or account system.

## Application structure

Quicksand typography, Lucide icons, and the supplied papyrus mark define the interface. The layout moves from a refinement/list/inspector workspace on desktop to linked list and detail views on mobile.

| Module                    | Responsibility                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `js/main.js`              | Query state, view transitions, result rendering, and collection actions            |
| `js/data.js`              | Scholarly period presets, normalization, identifiers, and shareable query state    |
| `js/crossref.js`          | API requests, cancellation, caching, retries, pagination, and citation negotiation |
| `js/inspector.js`         | Publication metadata, references, relationships, and citation views                |
| `js/collection.js`        | Collection validation, legacy storage input, and import/backup format              |
| `js/collection-store.js`  | Transactional browser persistence and cross-tab change notifications               |
| `js/collection-tools.js`  | Collection search, scoped export, selection feedback, and import                   |
| `js/session.js`           | Per-tab reading-position persistence                                               |
| `js/export.js`            | Bibliography conversion, CSV, JSON, and downloads                                  |
| `js/aggregates.js`        | Whole-query Crossref facet and metadata-presence summaries                         |
| `js/visualize.js`         | Accessible charts, refinement actions, and aggregate CSV                           |
| `js/references.js`        | Pure reference overlap and provenance analysis                                     |
| `js/research.js`          | Reference review, manual matching, and worker coordination                         |
| `js/research-worker.js`   | Bounded local reference computation                                                |
| `js/research-store.js`    | Per-item review persistence and portable decisions                                 |
| `js/place-data.js`        | Pleiades index, metadata mention evidence, and Crossref place queries              |
| `js/place-state.js`       | Applied Places URL parsing and serialization                                       |
| `js/place-publication.js` | Shared bibliographic identity for place research                                   |
| `js/place-focus.js`       | Focus continuity for updating place research surfaces                              |
| `js/place-map.js`         | Lazy-loaded Leaflet map, clustering, and geographic navigation                     |
| `js/places.js`            | Linked place discovery, publication inspector, and return context                  |
| `js/place-collection.js`  | Reviewed saved-place associations and scoped bibliography export                   |
| `js/changes.js`           | Explicit saved-metadata comparison and acceptance                                  |
| `js/covers.js`            | ISBN validation and attributed Open Library covers                                 |
| `js/dom.js`               | Text-safe DOM construction and shared interface helpers                            |
| `css/tokens.css`          | Primitive and semantic design tokens                                               |
| `css/workspace.css`       | Components, layout, responsive behavior, and interaction states                    |

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

The live check is deliberately separate from CI because service availability and deposited records can change.
The checked-in Lucide sprite contains only the icons used by the interface. Regenerate it after changing the icon list:

```sh
npm run build:icons
```

## Publishing

[Medjat](https://medjat.wunderkammer.dev/) is hosted on Cloudflare Pages. `npm run build` creates `dist/` from an explicit runtime file list. Publish only that directory so tests, development scripts, source data snapshots, package metadata, and repository documentation are excluded from the website. Tests and CI remain in the source repository.

The Cloudflare Pages project uses `main` as the production branch, `npm run build` as the build command, and `dist` as the build output directory. Leave the root directory at the repository root. `.node-version` pins the build to Node 24.

`npm run check:repository` checks tracked paths throughout the reachable commit history against the repository file list. GitHub Actions runs this check, syntax checks, unit tests, browser tests, and the runtime build. The workflow only validates the repository; Cloudflare manages deployment separately. Cloudflare's automatic deployments do not wait for GitHub Actions to finish.

## Maintaining place names

`python3 scripts/build-gazetteer.py` rebuilds the 25-place index offline from the committed Pleiades name/coordinate snapshot and reviewed name policy. The output records its source hash and retrieval/review dates. Use `--refresh` to fetch canonical records, then review the policy against source changes before committing the refreshed bundle. Unknown approved names fail validation rather than silently disappearing.

The policy retains selected attested and romanized variants with source and language information. It excludes ambiguous short names, fragments, and constituent-location names where treating them as equivalents would mislead. A name match remains candidate evidence. Gazetteer changes recompute suggestions without replacing the researcher’s confirmed, rejected, manual, or nonspatial decisions.

## Sources and licenses

Application code: [MIT](LICENSE). Lucide icons: [ISC](assets/LUCIDE-LICENSE). Leaflet 1.9.4: [BSD-2-Clause](assets/vendor/leaflet/LICENSE), vendored for static hosting. Map tiles: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), with visible attribution and standard browser caching. The map is modern geographic context, not a reconstruction of ancient boundaries or landscapes. The papyrus logo was supplied by the project owner. Publication metadata is retrieved from Crossref; book cover images are provided by Open Library and are not relicensed by this repository. The bundled Pleiades site data is attributed to Pleiades contributors, the Ancient World Mapping Center, and the Institute for the Study of the Ancient World under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/); each site retains its canonical source link.

Service documentation: [Crossref API guidance](https://www.crossref.org/documentation/retrieve-metadata/rest-api/tips-for-using-the-crossref-rest-api/), [content negotiation](https://www.crossref.org/documentation/retrieve-metadata/content-negotiation/), and [Open Library cover service](https://openlibrary.org/dev/docs/api/covers).
