// @ts-check

/** @param {string} workId */
export const placeScopeKey = (workId) => `place-scope:${workId}`;

/** @param {string} workId @param {string} placeId */
export const placeKey = (workId, placeId) => `place:${workId}:${placeId}`;

/** @param {string} workId @param {string} label */
export const citationKey = (workId, label) => `citation:${workId}:${label}`;

/** @param {string} doi */
export const changesKey = (doi) => `changes:${doi}`;

/** @param {string} doi */
export const doiKey = (doi) => `doi:${doi}`;

/** @param {string} doi */
export const notesKey = (doi) => `notes:${doi}`;
