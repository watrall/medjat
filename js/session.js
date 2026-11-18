const KEY = 'ancient-egypt-reading-session-v1';
export function readSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(KEY));
    return session?.version === 1 && session.url === location.pathname + location.search
      ? session
      : null;
  } catch {
    return null;
  }
}
export function writeSession(context) {
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ version: 1, url: location.pathname + location.search, ...context }),
    );
    return true;
  } catch {
    return false;
  }
}
