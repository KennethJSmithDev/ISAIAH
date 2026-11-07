export function standalonePort() {
  const port = process.env.ISAIAH_LOOPBACK_PORT ?? '18757';
  if (!/^[0-9]{4,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535) {
    throw new Error('ISAIAH_LOOPBACK_PORT must be an unprivileged TCP port.');
  }
  return Number(port);
}
