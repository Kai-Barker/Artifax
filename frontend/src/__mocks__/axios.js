// Manual Jest mock for axios, applied automatically to every test file.
//
// The app creates its HTTP clients with axios.create() when modules load
// (hooks/useApi.ts and services/apiClient.ts). This mock makes create() return one shared
// mock client, so tests control every response through the same jest.fn()s:
//
//   import axios from 'axios';
//   const mockedAxios = axios as jest.Mocked<typeof axios>;
//   mockedAxios.get.mockResolvedValue({ data: [...] });
//
// No test can reach a real server; all data is mocked per test.
// (CRA's resetMocks: true clears these implementations before each test.)

const client = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
  request: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: {
    request: { use: jest.fn(), eject: jest.fn() },
    response: { use: jest.fn(), eject: jest.fn() },
  },
};

// Plain function (not jest.fn) so resetMocks never clears it.
function isAxiosError(value) {
  return Boolean(value && value.isAxiosError === true);
}

const axios = {
  ...client,
  create: () => client,
  isAxiosError,
};

module.exports = axios;
module.exports.default = axios;
module.exports.isAxiosError = isAxiosError;
