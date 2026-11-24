import { getWork } from './crossref.js';
import { el, notify, externalLink } from './dom.js';
import { researchData, reviewDecision } from './research-store.js';
import { changesKey } from './decision-keys.js';
const fields = [
  'title',
  'abstract',
  'author',
  'reference',
  'relation',
  'license',
  'funder',
  'link',
  'assertion',
  'update-to',
  'updated-by',
  'published',
  'published-online',
  'published-print',
];
export function metadataChanges(before, after) {
  return fields
    .filter(
      (field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null),
    )
    .map((field) => ({ field, before: before[field] ?? null, after: after[field] ?? null }));
}
export function createChangeReview(root, { getRecords, onAccept, onInspect }) {
  let controller;
  async function run() {
    controller?.abort();
    const active = new AbortController();
    controller = active;
    const records = [...getRecords().values()];
    let done = 0;
    const status = el('p', { role: 'status' }, `Checking ${records.length} saved records…`),
      list = el('ol', { class: 'review-list' });
    const cancel = el(
      'button',
      { class: 'button', onclick: () => active.abort() },
      'Cancel change check',
    );
    root.replaceChildren(
      el('h2', {}, 'Living bibliography'),
      el(
        'p',
        {},
        'Check saved DOI metadata for changes. Publication dates, registration dates, and the dates a publisher last updated the record are different. No detected update is not a guarantee that a publication has no correction or retraction.',
      ),
      cancel,
      status,
      list,
    );
    const queue = [...records];
    const decisions = researchData();
    async function worker() {
      while (queue.length && !active.signal.aborted) {
        const entry = queue.shift();
        try {
          const next = await getWork(entry.work.id, { signal: active.signal, fresh: true });
          if (active.signal.aborted) return;
          const changes = metadataChanges(entry.work.raw, next.raw),
            history = decisions[changesKey(next.id)];
          if (changes.length) {
            const details = el(
              'details',
              {},
              el('summary', {}, `${entry.work.title}: ${changes.length} changed fields`),
            );
            for (const change of changes)
              details.append(
                el('h3', {}, change.field),
                el('p', {}, 'Saved value'),
                el('pre', {}, JSON.stringify(change.before, null, 2)),
                el('p', {}, 'Current Crossref value'),
                el('pre', {}, JSON.stringify(change.after, null, 2)),
              );
            const row = el(
              'li',
              {},
              details,
              el(
                'p',
                {},
                `Current deposit: ${next.deposited || 'Not supplied'}. Previously reviewed: ${history?.reviewedAt || 'Never'}.`,
              ),
              el(
                'button',
                { class: 'text-button', onclick: () => onInspect(next) },
                'Inspect current record',
              ),
            );
            row.append(
              el(
                'button',
                {
                  class: 'button',
                  onclick: async (event) => {
                    event.currentTarget.disabled = true;
                    try {
                      await onAccept(next, entry.savedAt, entry.work.raw);
                      if (
                        !reviewDecision(changesKey(next.id), {
                          decision: 'accepted',
                          fields: changes.map((change) => change.field),
                          previousRaw: entry.work.raw,
                        })
                      )
                        notify('Change history is session-only. Export a research backup.');
                      row.replaceChildren(el('p', {}, `${next.title}: saved metadata updated.`));
                    } catch (error) {
                      row.append(el('p', { role: 'alert' }, error.message));
                      event.currentTarget.disabled = false;
                    }
                  },
                },
                'Accept updated metadata',
              ),
              el(
                'button',
                {
                  class: 'text-button',
                  onclick: () => {
                    reviewDecision(changesKey(next.id), {
                      decision: 'deferred',
                      fields: changes.map((change) => change.field),
                    });
                    row.append(el('p', {}, 'Deferred. Your saved record is unchanged.'));
                  },
                },
                'Defer changes',
              ),
            );
            list.append(row);
          }
          const notices = ['update-to', 'updated-by'].flatMap((key) =>
            Array.isArray(next.raw[key]) ? next.raw[key] : [],
          );
          if (notices.length)
            list.append(
              el(
                'li',
                {},
                el('h3', {}, `Updates associated with ${next.title}`),
                el(
                  'p',
                  {},
                  'Read the notice to establish what it changes. Updates may concern this work or identify this work as a notice about another record.',
                ),
                notices.map((notice) =>
                  el(
                    'p',
                    {},
                    `${notice.type || 'Update'} · ${notice.source || 'Source not supplied'} · `,
                    notice.DOI
                      ? externalLink(
                          notice.DOI,
                          `https://doi.org/${encodeURIComponent(notice.DOI)}`,
                        )
                      : 'DOI not supplied',
                  ),
                ),
              ),
            );
        } catch (error) {
          if (!active.signal.aborted)
            list.append(el('li', {}, `${entry.work.title}: ${error.message}`));
        } finally {
          done++;
          status.textContent = `Checked ${done} of ${records.length} saved records. Changes require your acceptance.`;
        }
      }
    }
    await Promise.all([worker(), worker()]);
    cancel.replaceWith(el('button', { class: 'button', onclick: run }, 'Check again'));
    status.textContent = active.signal.aborted
      ? `Check cancelled after ${done} records. Saved metadata is unchanged unless you accepted an update.`
      : `Checked ${done} records. ${list.children.length ? 'Review the findings below.' : 'No tracked field changes or update notices found.'}`;
  }
  return { run, cancel: () => controller?.abort() };
}
