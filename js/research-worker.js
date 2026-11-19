import { analyzeReferences } from './references.js';
self.onmessage = (event) => {
  try {
    self.postMessage({
      result: analyzeReferences(event.data.seeds, event.data.savedIDs, event.data.decisions),
    });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
