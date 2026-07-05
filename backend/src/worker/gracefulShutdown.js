class GracefulShutdown {
  constructor() {
    this.isShuttingDown = false;
    this.callbacks = [];
  }
  onShutdown(callback) {
    this.callbacks.push(callback);
  }
  init() {
    const signals = ['SIGTERM', 'SIGINT'];
    signals.forEach(signal => {
      process.on(signal, async () => {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;
        console.log(`\n[SHUTDOWN] Received ${signal}, starting graceful shutdown...`);
        for (const callback of this.callbacks) {
          try {
            await callback();
          } catch (error) {
            console.error('[SHUTDOWN] Error in shutdown callback:', error.message);
          }
        }
        console.log('[SHUTDOWN] Graceful shutdown complete');
        process.exit(0);
      });
    });
  }
}
module.exports = new GracefulShutdown();