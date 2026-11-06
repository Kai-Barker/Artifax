import { act, renderHook } from '@testing-library/react';
import { toast } from 'react-toastify';
import { clearAuthToken, getAuthToken, setAuthToken } from '../authToken';
import { clearCurrentUser, getCurrentUser, setCurrentUser, subscribeCurrentUser, useCurrentUser } from '../currentUser';
import { showError, showInfo, showSuccess } from '../toast';
import { getCurrentDateSAST } from '../../Date/dateUtils';
import { useThemeAwareIcon } from '../../hooks/useThemeIcon';
import { api, useApi } from '../../hooks';
import { adminUser } from '../../test-utils/fixtures';

jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

describe('currentUser', () => {
  it('stores, reads and clears the logged-in user', () => {
    expect(getCurrentUser()).toBeNull();

    setCurrentUser(adminUser);
    expect(getCurrentUser()).toEqual(adminUser);

    clearCurrentUser();
    expect(getCurrentUser()).toBeNull();
  });

  it('ignores corrupt or incomplete stored data', () => {
    window.localStorage.setItem('artifax.currentUser', '{not json');
    expect(getCurrentUser()).toBeNull();

    window.localStorage.setItem('artifax.currentUser', JSON.stringify({ name: 'No Role' }));
    expect(getCurrentUser()).toBeNull();
  });

  it('notifies subscribers on change and stops after unsubscribing', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeCurrentUser(listener);

    setCurrentUser(adminUser);
    window.dispatchEvent(new StorageEvent('storage'));
    clearCurrentUser();
    unsubscribe();
    setCurrentUser(adminUser);

    expect(listener.mock.calls).toEqual([[adminUser], [adminUser], [null]]);
  });

  it('useCurrentUser re-renders when the user changes', () => {
    const { result } = renderHook(() => useCurrentUser());
    expect(result.current).toBeNull();

    act(() => setCurrentUser(adminUser));
    expect(result.current).toEqual(adminUser);

    act(() => clearCurrentUser());
    expect(result.current).toBeNull();
  });
});

describe('authToken', () => {
  afterEach(() => clearAuthToken());

  it('keeps the token in memory and session storage', () => {
    expect(getAuthToken()).toBeNull();

    setAuthToken('abc');
    expect(getAuthToken()).toBe('abc');
    expect(window.sessionStorage.getItem('artifax.authToken')).toBe('abc');

    clearAuthToken();
    expect(getAuthToken()).toBeNull();
    expect(window.sessionStorage.getItem('artifax.authToken')).toBeNull();
  });

  it('restores a token saved in session storage', () => {
    window.sessionStorage.setItem('artifax.authToken', 'from-storage');

    expect(getAuthToken()).toBe('from-storage');
  });
});

describe('toast helpers', () => {
  it('shows success, error and info toasts with the app’s defaults', () => {
    showSuccess('Saved');
    showError('Failed');
    showInfo('FYI');

    expect(toast.success).toHaveBeenCalledWith('Saved', expect.objectContaining({ position: 'top-right', autoClose: 3000 }));
    expect(toast.error).toHaveBeenCalledWith('Failed', expect.objectContaining({ autoClose: 5000 }));
    expect(toast.info).toHaveBeenCalledWith('FYI', expect.objectContaining({ autoClose: 3000 }));
  });
});

describe('getCurrentDateSAST', () => {
  afterEach(() => jest.useRealTimers());

  it('formats the date in South African time', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-06T23:30:00Z')); // 01:30 on the 7th in SAST

    expect(getCurrentDateSAST()).toBe('Sat, 7 Nov 2026');
  });
});

describe('hooks', () => {
  it('useApi returns the shared client', () => {
    const { result } = renderHook(() => useApi());

    expect(result.current).toBe(api);
  });

  it('useThemeAwareIcon switches to the white icon in the synthwave theme', async () => {
    document.documentElement.removeAttribute('data-theme');
    const { result } = renderHook(() => useThemeAwareIcon('dark.png', 'white.png'));
    expect(result.current).toBe('dark.png');

    await act(async () => {
      document.documentElement.dataset.theme = 'synthwave';
      await Promise.resolve();
    });
    expect(result.current).toBe('white.png');

    await act(async () => {
      document.documentElement.dataset.theme = 'light';
      await Promise.resolve();
    });
    expect(result.current).toBe('dark.png');
    document.documentElement.removeAttribute('data-theme');
  });

  it('useThemeAwareIcon keeps the default icon when no white variant exists', () => {
    document.documentElement.dataset.theme = 'synthwave';

    const { result } = renderHook(() => useThemeAwareIcon('dark.png'));

    expect(result.current).toBe('dark.png');
    document.documentElement.removeAttribute('data-theme');
  });
});
