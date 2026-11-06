import {
  GetOtpQrCode,
  VerifyOtpCode,
  getBranchById,
  getBranches,
  getCurrentUserFromSession,
  getEmployeeByEmail,
  loginEmployee,
} from '../authApi';
import { httpError, mockedAxios, mockGet, networkError } from '../../test-utils/http';

describe('authApi', () => {
  describe('loginEmployee', () => {
    it('posts the credentials and returns the response body', async () => {
      mockedAxios.post.mockResolvedValue({ data: { requires2FA: true, email: 'naledi.dlamini@artifax.demo' } });

      const result = await loginEmployee({ email: 'naledi.dlamini@artifax.demo', password: 'Artifax@2026' });

      expect(mockedAxios.post).toHaveBeenCalledWith('/User/employees/login', { email: 'naledi.dlamini@artifax.demo', password: 'Artifax@2026' });
      expect(result).toEqual({ requires2FA: true, email: 'naledi.dlamini@artifax.demo' });
    });

    it('uses the server’s message and status when login is rejected', async () => {
      mockedAxios.post.mockRejectedValue(httpError(401, 'Incorrect Password'));

      await expect(loginEmployee({ email: 'a', password: 'b' })).rejects.toMatchObject({ message: 'Incorrect Password', status: 401 });
    });

    it('reads a message from a JSON error body', async () => {
      mockedAxios.post.mockRejectedValue(httpError(400, { message: 'Email is required' }));

      await expect(loginEmployee({ email: '', password: '' })).rejects.toThrow('Email is required');
    });

    it('falls back to the status when the body has no message', async () => {
      mockedAxios.post.mockRejectedValueOnce(httpError(500, {}));
      await expect(loginEmployee({ email: 'a', password: 'b' })).rejects.toThrow('Request failed: 500');

      mockedAxios.post.mockRejectedValueOnce(networkError());
      await expect(loginEmployee({ email: 'a', password: 'b' })).rejects.toThrow('Request failed: unknown');
    });

    it('rethrows non-HTTP errors unchanged', async () => {
      const boom = new Error('boom');
      mockedAxios.post.mockRejectedValue(boom);

      await expect(loginEmployee({ email: 'a', password: 'b' })).rejects.toBe(boom);
    });
  });

  describe('getCurrentUserFromSession', () => {
    it('returns the signed-in user', async () => {
      mockGet({ '/User/me': { userLevel: 'Admin', userEmail: 'naledi.dlamini@artifax.demo', username: 'Naledi Dlamini' } });

      await expect(getCurrentUserFromSession()).resolves.toEqual({ userLevel: 'Admin', userEmail: 'naledi.dlamini@artifax.demo', username: 'Naledi Dlamini' });
    });

    it('returns null when there is no session (401)', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockGet({ '/User/me': httpError(401, 'No active session.') });

      await expect(getCurrentUserFromSession()).resolves.toBeNull();
      expect(warn).toHaveBeenCalledWith('No active cookie session found.');
      warn.mockRestore();
    });

    it('returns null when the error message mentions 401', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockedAxios.get.mockRejectedValue(new Error('Request failed with status code 401'));

      await expect(getCurrentUserFromSession()).resolves.toBeNull();
      warn.mockRestore();
    });

    it('returns null for any other failure', async () => {
      mockGet({ '/User/me': httpError(500, 'boom') });
      await expect(getCurrentUserFromSession()).resolves.toBeNull();

      mockedAxios.get.mockRejectedValueOnce(undefined);
      await expect(getCurrentUserFromSession()).resolves.toBeNull();
    });
  });

  describe('lookups', () => {
    it('fetches an employee by URL-encoded email', async () => {
      mockedAxios.get.mockResolvedValue({ data: { employeeId: 1, employeeName: 'Naledi Dlamini', branchId: 1, employeeLevel: 'Admin' } });

      const employee = await getEmployeeByEmail('naledi+ops@artifax.demo');

      expect(mockedAxios.get).toHaveBeenCalledWith('/User/employee/naledi%2Bops%40artifax.demo');
      expect(employee.employeeName).toBe('Naledi Dlamini');
    });

    it('fetches branches and a single branch', async () => {
      mockGet({ '/Branch': [{ BranchID: 1, BranchName: 'Main Branch' }], '/Branch/3': { BranchID: 3, BranchName: 'Durban Assembly Plant' } });

      await expect(getBranches()).resolves.toEqual([{ BranchID: 1, BranchName: 'Main Branch' }]);
      await expect(getBranchById(3)).resolves.toEqual({ BranchID: 3, BranchName: 'Durban Assembly Plant' });
    });

    it('reports a missing branch', async () => {
      mockGet({ '/Branch/9': httpError(404, '') });

      await expect(getBranchById(9)).rejects.toMatchObject({ status: 404, message: 'Request failed: 404' });
    });
  });

  describe('two-factor authentication', () => {
    it('gets the QR code setup URI', async () => {
      mockGet({ '/User/2fa-setup-uri': { qrCodeUri: 'otpauth://totp/ArtifaxApp:naledi?secret=ABC' } });

      await expect(GetOtpQrCode()).resolves.toEqual({ qrCodeUri: 'otpauth://totp/ArtifaxApp:naledi?secret=ABC' });
    });

    it('verifies a code', async () => {
      mockedAxios.post.mockResolvedValue({ data: { employeeId: 1, employeeName: 'Naledi Dlamini' } });

      await expect(VerifyOtpCode('123456')).resolves.toEqual({ employeeId: 1, employeeName: 'Naledi Dlamini' });
      expect(mockedAxios.post).toHaveBeenCalledWith('/User/employees/verify-2fa', { code: '123456' });
    });

    it('rejects an invalid code with the server message', async () => {
      mockedAxios.post.mockRejectedValue(httpError(401, 'Invalid 2FA Verification Code'));

      await expect(VerifyOtpCode('000000')).rejects.toThrow('Invalid 2FA Verification Code');
    });
  });
});
