import { API, CONTACT, getWork, request } from './crossref.js';
import { normalizeWork } from './data.js';
import { el, notify } from './dom.js';
import { researchData, reviewDecision } from './research-store.js';
import { serializeCollection } from './collection.js';
import { downloadText } from './download.js';
import { citationKey, doiKey } from './decision-keys.js';
import { RESEARCH_LIMITS } from './references.js';
function network(data) {
  const refs = data.references.slice(0, RESEARCH_LIMITS.referencedNodes),
    seeds = data.seeds;
  const ns = 'http://www.w3.org/2000/svg',
    svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 1000 ${Math.max(seeds.length, refs.length, 1) * 32 + 40}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    'Deposited citation network. Seed publications on the left, referenced DOIs on the right. Connection lists provide the same evidence.',
  );
  const node = (tag, attrs, text) => {
    const n = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) n.setAttribute(key, value);
    if (text) n.textContent = text;
    svg.append(n);
  };
  for (const edge of data.edges
    .filter((edge) => ['cites', 'researcher-confirmed citation match'].includes(edge.type))
    .slice(0, RESEARCH_LIMITS.edges)) {
    const a = seeds.findIndex((seed) => seed.id === edge.source),
      b = refs.findIndex((ref) => ref.doi === edge.target);
    if (a >= 0 && b >= 0)
      node('line', {
        x1: 370,
        y1: a * 32 + 25,
        x2: 600,
        y2: b * 32 + 25,
        stroke: 'var(--color-control)',
        'stroke-dasharray': edge.type === 'cites' ? '' : '5 4',
      });
  }
  seeds.forEach((seed, i) =>
    node(
      'text',
      { x: 10, y: i * 32 + 30, fill: 'var(--color-ink)', 'font-size': 13 },
      seed.title.slice(0, 48),
    ),
  );
  refs.forEach((ref, i) =>
    node(
      'text',
      { x: 610, y: i * 32 + 30, fill: 'var(--color-accent)', 'font-size': 13 },
      ref.doi.slice(0, 48),
    ),
  );
  return el('div', { class: 'reference-network' }, svg);
}
export function createResearch(root, { getSeeds, getSaved, onSave, onInspect }) {
  let worker,
    generation = 0;
  const decide = (key, value) => {
    if (!reviewDecision(key, value))
      notify('Review decision kept for this visit only. Download a research backup to retain it.');
  };
  function referenceRow(ref) {
    const key = doiKey(ref.doi),
      state = researchData()[key];
    const row = el(
      'li',
      {},
      el('p', {}, ref.label),
      el(
        'p',
        { class: 'scope-note' },
        `Referenced by ${ref.sources.length}: ${ref.sources.map((source) => (source.researcherConfirmed ? '[researcher-confirmed match] ' : '') + source.title).join('; ')}`,
      ),
    );
    const status = el(
      'p',
      { role: 'status' },
      state ? `Review: ${state.decision}` : 'Not reviewed',
    );
    row.append(
      el(
        'button',
        {
          class: 'text-button',
          onclick: async () => {
            try {
              const work = await getWork(ref.doi);
              onInspect(work);
            } catch (error) {
              status.textContent = error.message;
            }
          },
        },
        'Inspect reference',
      ),
      el(
        'button',
        {
          class: 'text-button',
          onclick: async (event) => {
            event.currentTarget.disabled = true;
            try {
              const work = await getWork(ref.doi);
              if (!getSaved().has(work.id)) await onSave(work);
              decide(key, { decision: 'saved', sources: ref.sources });
              status.textContent = 'Saved to collection';
            } catch (error) {
              status.textContent = error.message;
            } finally {
              event.currentTarget.disabled = false;
            }
          },
        },
        getSaved().has(ref.doi) ? 'Keep in collection' : 'Save reference',
      ),
    );
    for (const decision of ['deferred', 'dismissed'])
      row.append(
        el(
          'button',
          {
            class: 'text-button',
            onclick: () => {
              decide(key, { decision, sources: ref.sources });
              status.textContent = `Review: ${decision}`;
            },
          },
          decision === 'deferred' ? 'Defer' : 'Dismiss',
        ),
      );
    row.append(status);
    for (const source of ref.sources.filter((source) => source.researcherConfirmed))
      row.append(
        el(
          'button',
          {
            class: 'text-button',
            onclick: () => {
              decide(citationKey(source.id, source.label), {
                decision: 'unmatched',
                source: source.id,
                label: source.label,
              });
              run();
            },
          },
          `Undo citation match from ${source.title}`,
        ),
      );
    return row;
  }
  function unresolvedRow(ref) {
    const key = citationKey(ref.source, ref.label);
    const status = el(
      'p',
      { role: 'status' },
      researchData()[key]?.decision
        ? `Review: ${researchData()[key].decision}. No confirmed DOI match.`
        : 'No DOI supplied. Matching requires your confirmation.',
    );
    const matches = el('div');
    return el(
      'li',
      {},
      el('p', {}, ref.label),
      el('p', { class: 'scope-note' }, `Source: ${ref.sourceTitle}`),
      el(
        'button',
        {
          class: 'text-button',
          onclick: async (event) => {
            event.currentTarget.disabled = true;
            status.textContent = 'Looking for up to three possible matches…';
            try {
              const url = new URL(`${API}/works`);
              url.searchParams.set('query.bibliographic', ref.label);
              url.searchParams.set('rows', '3');
              url.searchParams.set('mailto', CONTACT);
              const response = await request(url);
              matches.replaceChildren();
              for (const raw of response.body.message.items || []) {
                let work;
                try {
                  work = normalizeWork(raw);
                } catch {
                  continue;
                }
                matches.append(
                  el('p', {}, `${work.title} · ${work.year || 'Date not supplied'} · ${work.doi}`),
                  el(
                    'button',
                    { class: 'text-button', onclick: () => onInspect(work) },
                    'Inspect candidate',
                  ),
                  el(
                    'button',
                    {
                      class: 'text-button',
                      onclick: () => {
                        decide(key, {
                          decision: 'confirmed',
                          doi: work.id,
                          source: ref.source,
                          label: ref.label,
                        });
                        status.textContent = `Confirmed DOI: ${work.id}`;
                      },
                    },
                    'Confirm this match',
                  ),
                );
              }
              status.textContent = matches.childElementCount
                ? 'Candidates are suggestions, not established citation links.'
                : 'No candidates returned.';
            } catch (error) {
              status.textContent = error.message;
            } finally {
              event.currentTarget.disabled = false;
            }
          },
        },
        'Find possible matches',
      ),
      ...['deferred', 'dismissed'].map((decision) =>
        el(
          'button',
          {
            class: 'text-button',
            onclick: () => {
              decide(key, { decision, source: ref.source, label: ref.label });
              status.textContent = `Review: ${decision}. No confirmed DOI match.`;
            },
          },
          decision === 'deferred' ? 'Defer citation' : 'Dismiss citation',
        ),
      ),
      matches,
      status,
    );
  }
  function render(data, total) {
    root.replaceChildren(
      el('h2', {}, 'Reference discovery'),
      el(
        'p',
        {},
        `${data.seeds.length} seed publications analyzed${total > RESEARCH_LIMITS.seeds ? ` of ${total}; select up to ${RESEARCH_LIMITS.seeds} records to control this set` : ''}. ${data.missingReferenceLists} have no deposited reference list. This is a bounded research set, not the whole search.`,
      ),
    );
    root.append(
      el(
        'button',
        {
          class: 'text-button',
          onclick: () =>
            downloadText(serializeCollection(getSaved()), {
              type: 'application/json',
              filename: 'medjat-research-backup.json',
            }),
        },
        'Download research backup with review decisions',
      ),
      el('button', { class: 'text-button', onclick: run }, 'Rebuild from current selection'),
    );
    const graph = el(
      'details',
      {},
      el(
        'summary',
        {},
        `View citation network (up to ${RESEARCH_LIMITS.seeds + RESEARCH_LIMITS.referencedNodes} nodes and ${RESEARCH_LIMITS.edges} edges)`,
      ),
      el(
        'p',
        { class: 'scope-note' },
        'Solid lines are deposited DOI citations; dashed lines are researcher-confirmed matches. Connection lists below retain source provenance.',
      ),
      network(data),
    );
    root.append(graph);
    for (const [title, rows, builder] of [
      ['Shared foundations', data.shared, referenceRow],
      ['Missing from your bibliography', data.missing, referenceRow],
      ['Unresolved citations', data.unresolved, unresolvedRow],
    ]) {
      root.append(
        el(
          'details',
          {},
          el('summary', {}, `${title} (${rows.length})`),
          rows.length
            ? el(
                'ol',
                { class: 'review-list' },
                rows.slice(0, RESEARCH_LIMITS.reviewRows).map(builder),
              )
            : el(
                'p',
                {},
                'No items in this category. Missing deposited references can limit discovery.',
              ),
          rows.length > RESEARCH_LIMITS.reviewRows &&
            el(
              'p',
              {},
              `First ${RESEARCH_LIMITS.reviewRows} items shown. Narrow the selected seed set to review more.`,
            ),
        ),
      );
    }
    root.append(
      el(
        'details',
        {},
        el('summary', {}, 'Deposited relationships'),
        el(
          'ul',
          {},
          data.edges
            .filter(
              (edge) =>
                edge.type !== 'cites' && edge.type !== 'researcher-confirmed citation match',
            )
            .map((edge) => el('li', {}, `${edge.source} → ${edge.type} → ${edge.target}`)),
        ),
      ),
    );
  }
  function run() {
    worker?.terminate();
    const id = ++generation,
      seeds = getSeeds();
    root.replaceChildren(el('p', { role: 'status' }, 'Comparing deposited references…'));
    worker = new Worker(new URL('./research-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      if (id !== generation) return;
      if (event.data.error) root.replaceChildren(el('p', { role: 'alert' }, event.data.error));
      else render(event.data.result, seeds.length);
      worker.terminate();
    };
    worker.onerror = () =>
      root.replaceChildren(
        el(
          'p',
          { role: 'alert' },
          'Reference comparison could not run. Try a smaller selected set.',
        ),
      );
    worker.postMessage({
      seeds: seeds.slice(0, RESEARCH_LIMITS.seeds),
      savedIDs: [...getSaved().keys()],
      decisions: researchData(),
    });
  }
  return {
    run,
    cancel() {
      generation++;
      worker?.terminate();
    },
  };
}
