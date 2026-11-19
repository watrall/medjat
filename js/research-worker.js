import { analyzeReferences } from './references.js';
self.onmessage = (event) => {
  try {
    self.postMessage({ result: analyzeReferences(event.data.seeds, event.data.savedIDs) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
