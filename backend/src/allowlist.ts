const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS ?? '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

export function isHostAllowed(host: string): boolean {
  return ALLOWED_HOSTS.includes(host);
}

export { ALLOWED_HOSTS };
