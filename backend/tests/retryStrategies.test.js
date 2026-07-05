import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const retryService = require('../src/services/retryService');
describe('Retry Strategies', () => {
  describe('Fixed Delay', () => {
    const policy = { strategy: 'fixed', base_delay_ms: 5000, max_delay_ms: 5000 };
    it('should return constant delay regardless of retry count', () => {
      expect(retryService.calculateDelay(policy, 0)).toBe(5000);
      expect(retryService.calculateDelay(policy, 1)).toBe(5000);
      expect(retryService.calculateDelay(policy, 5)).toBe(5000);
      expect(retryService.calculateDelay(policy, 10)).toBe(5000);
    });
  });
  describe('Linear Backoff', () => {
    const policy = { strategy: 'linear', base_delay_ms: 1000, max_delay_ms: 30000 };
    it('should increase delay linearly', () => {
      expect(retryService.calculateDelay(policy, 0)).toBe(1000);
      expect(retryService.calculateDelay(policy, 1)).toBe(2000);
      expect(retryService.calculateDelay(policy, 2)).toBe(3000);
      expect(retryService.calculateDelay(policy, 4)).toBe(5000);
    });
    it('should cap at max_delay_ms', () => {
      expect(retryService.calculateDelay(policy, 50)).toBe(30000);
    });
  });
  describe('Exponential Backoff', () => {
    const policy = { strategy: 'exponential', base_delay_ms: 1000, max_delay_ms: 60000 };
    it('should increase delay exponentially', () => {
      expect(retryService.calculateDelay(policy, 0)).toBe(1000);
      expect(retryService.calculateDelay(policy, 1)).toBe(2000);
      expect(retryService.calculateDelay(policy, 2)).toBe(4000);
      expect(retryService.calculateDelay(policy, 3)).toBe(8000);
      expect(retryService.calculateDelay(policy, 4)).toBe(16000);
    });
    it('should cap at max_delay_ms', () => {
      expect(retryService.calculateDelay(policy, 10)).toBe(60000);
    });
  });
  describe('shouldRetry', () => {
    it('should retry when retryCount < maxRetries', () => {
      expect(retryService.shouldRetry(0, 3)).toBe(true);
      expect(retryService.shouldRetry(1, 3)).toBe(true);
      expect(retryService.shouldRetry(2, 3)).toBe(true);
    });
    it('should not retry when retryCount >= maxRetries', () => {
      expect(retryService.shouldRetry(3, 3)).toBe(false);
      expect(retryService.shouldRetry(5, 3)).toBe(false);
    });
  });
  describe('calculateNextRunAt', () => {
    it('should return a future date', () => {
      const policy = { strategy: 'fixed', base_delay_ms: 5000, max_delay_ms: 5000 };
      const nextRunAt = retryService.calculateNextRunAt(policy, 0);
      expect(nextRunAt.getTime()).toBeGreaterThan(Date.now());
    });
  });
});