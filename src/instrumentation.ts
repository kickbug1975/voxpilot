export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeWorker } = await import('./lib/queue');
    initializeWorker();
  }
}
