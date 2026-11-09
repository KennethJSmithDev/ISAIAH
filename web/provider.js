// The real workspace alone owns network access. The static simulation replaces
// this module with a local, event-driven provider at build time.
export const eventDriven = false;
export const requiresOperatorKey = true;
export async function api(path, data) {
  const response = await fetch(path, data === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Isaiah-Request': 'browser' },
    body: JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
