class RetryService {
  calculateDelay(policy, retryCount) {
    let delay;
    switch (policy.strategy) {
      case 'fixed':
        delay = policy.base_delay_ms;
        break;
      case 'linear':
        delay = policy.base_delay_ms * (retryCount + 1);
        break;
      case 'exponential':
        delay = policy.base_delay_ms * Math.pow(2, retryCount);
        break;
      default:
        delay = policy.base_delay_ms;
    }
    return Math.min(delay, policy.max_delay_ms);
  }
  calculateNextRunAt(policy, retryCount) {
    const delayMs = this.calculateDelay(policy, retryCount);
    return new Date(Date.now() + delayMs);
  }
  shouldRetry(retryCount, maxRetries) {
    return retryCount < maxRetries;
  }
}
module.exports = new RetryService();