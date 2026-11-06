import { toFetchStyleError } from '../apiClient';
import { calculateProgress, formatTimeLeft, normalizeQueueStatus } from '../craftingUtils';
import { httpError, networkError } from '../../test-utils/http';

describe('apiClient.toFetchStyleError', () => {
  it('describes HTTP errors by status and status text', () => {
    expect(toFetchStyleError(httpError(404, '', 'Not Found')).message).toBe('Fetch error 404 Not Found');
    expect(toFetchStyleError({ isAxiosError: true, message: 'x', response: { status: 500 } }).message).toBe('Fetch error 500');
  });

  it('uses the axios message when there is no response', () => {
    expect(toFetchStyleError(networkError('Network Error')).message).toBe('Network Error');
  });

  it('passes through plain errors and wraps anything else', () => {
    const original = new Error('boom');
    expect(toFetchStyleError(original)).toBe(original);
    expect(toFetchStyleError({ isAxiosError: true, message: '' }).message).toBe('Request failed');
    expect(toFetchStyleError('nope').message).toBe('Request failed');
  });
});

describe('craftingUtils', () => {
  it('normalises backend status names', () => {
    expect(normalizeQueueStatus('Active')).toBe('Active');
    expect(normalizeQueueStatus(' in progress ')).toBe('Active');
    expect(normalizeQueueStatus('PAUSED')).toBe('Paused');
    expect(normalizeQueueStatus('queued')).toBe('Queued');
    expect(normalizeQueueStatus('Pending')).toBe('Queued');
    expect(normalizeQueueStatus('Complete')).toBeNull();
    expect(normalizeQueueStatus(undefined)).toBeNull();
  });

  describe('calculateProgress', () => {
    it('is work done over total work', () => {
      expect(calculateProgress(300, 150)).toBe(50);
      expect(calculateProgress(3, 1)).toBe(33);
    });

    it('is not affected by expediting (only the remaining time is)', () => {
      expect(calculateProgress(300, 150, true)).toBe(50);
    });

    it('clamps to 0–100 and handles missing data', () => {
      expect(calculateProgress(10, 25)).toBe(100);
      expect(calculateProgress(10, -5)).toBe(0);
      expect(calculateProgress(undefined, 5)).toBe(0);
      expect(calculateProgress(0, 5)).toBe(0);
      expect(calculateProgress(-10, 5)).toBe(0);
      expect(calculateProgress(10, undefined)).toBe(0);
    });
  });

  describe('formatTimeLeft', () => {
    it('shows the remaining minutes', () => {
      expect(formatTimeLeft(300, 150)).toBe('150 min left');
    });

    it('halves only the remaining time when expedited', () => {
      expect(formatTimeLeft(300, 150, true)).toBe('75 min left');
      expect(formatTimeLeft(300, 299, true)).toBe('1 min left');
    });

    it('reports completion and missing estimates', () => {
      expect(formatTimeLeft(100, 100)).toBe('Complete');
      expect(formatTimeLeft(100, 140, true)).toBe('Complete');
      expect(formatTimeLeft(undefined, 1)).toBe('No estimate');
      expect(formatTimeLeft(10, undefined)).toBe('No estimate');
    });
  });
});
