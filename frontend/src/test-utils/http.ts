// Helpers for mocking backend responses in tests (axios is mocked globally by src/__mocks__/axios.js).
import axios from 'axios';

export const mockedAxios = axios as jest.Mocked<typeof axios>;

/** Shape axios gives a failed HTTP response. */
export function httpError(status: number, data: unknown = '', statusText = '') {
  return { isAxiosError: true, message: `Request failed with status code ${status}`, response: { status, statusText, data } };
}

/** Shape axios gives when the server can't be reached. */
export function networkError(message = 'Network Error') {
  return { isAxiosError: true, message };
}

type Route = unknown | ((url: string, body?: unknown) => unknown);

function normalize(url: string): string {
  return url.replace(/^\/+/, '').replace(/\/+$/, '');
}

function resolveRoute(routes: Record<string, Route>, url: string, body?: unknown): Promise<unknown> {
  const key = Object.keys(routes).find((candidate) => normalize(candidate) === normalize(url));
  if (key === undefined) {
    return Promise.reject(httpError(404, `No mock for ${url}`, 'Not Found'));
  }
  const route = routes[key];
  const value = typeof route === 'function' ? (route as (u: string, b?: unknown) => unknown)(url, body) : route;
  if (value && typeof value === 'object' && 'isAxiosError' in (value as object)) {
    return Promise.reject(value);
  }
  return Promise.resolve({ data: value });
}

/**
 * Mock GET responses by URL, e.g. mockGet({ '/Order': orders, '/User': users }).
 * A value created with httpError()/networkError() makes that URL fail. Unknown URLs return 404.
 */
export function mockGet(routes: Record<string, Route>): void {
  mockedAxios.get.mockImplementation((url: string) => resolveRoute(routes, url) as never);
}

/** Every write (post/put/patch/delete) succeeds with an empty body unless overridden. */
export function mockWritesSucceed(): void {
  mockedAxios.post.mockResolvedValue({ data: {} });
  mockedAxios.put.mockResolvedValue({ data: {} });
  mockedAxios.patch.mockResolvedValue({ data: {} });
  mockedAxios.delete.mockResolvedValue({ data: {} });
}
