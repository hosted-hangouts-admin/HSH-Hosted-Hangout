export async function loadHostedHangouts(backendOrigin) {
  const url = new URL('/api/catalog', backendOrigin);
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) throw new Error('Hosted Hangouts is temporarily unavailable.');
  return response.json();
}
