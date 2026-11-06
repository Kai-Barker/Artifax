import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LoginPage from '../LoginPage';
import OtpVerifyPage from '../OtpVerifyPage';
import ProtectedRoute from '../../../layouts/ProtectedRoute';
import { getCurrentUser } from '../../../utils/currentUser';
import { httpError, mockedAxios, mockGet } from '../../../test-utils/http';
import { branchesFixture } from '../../../test-utils/fixtures';

// QR rendering needs a real canvas; show the encoded value instead.
jest.mock('qrcode.react', () => ({ QRCodeCanvas: ({ value }: { value: string }) => <span data-testid="qr">{value}</span> }));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/verify" element={<OtpVerifyPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<h1>Dashboard home</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const emailInput = () => screen.getByText('Email').closest('label')!.querySelector('input')!;
const passwordInput = () => screen.getByText('Password').closest('label')!.querySelector('input')!;

describe('LoginPage', () => {
  it('validates email and password before allowing a login', () => {
    renderAt('/login');
    const login = screen.getByRole('button', { name: 'Login' });
    expect(login).toBeDisabled();

    fireEvent.blur(emailInput());
    fireEvent.blur(passwordInput());
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();

    fireEvent.change(emailInput(), { target: { value: 'not-an-email' } });
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();

    fireEvent.change(emailInput(), { target: { value: 'naledi.dlamini@artifax.demo' } });
    fireEvent.change(passwordInput(), { target: { value: 'Artifax@2026' } });
    expect(login).toBeEnabled();
    expect(screen.getByText('Use your company email address.')).toBeInTheDocument();
  });

  it('shows the submit-time errors when the form is submitted empty', () => {
    renderAt('/login');

    fireEvent.submit(screen.getByRole('button', { name: 'Login' }).closest('form')!);

    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('sends the trimmed credentials and moves on to 2FA', async () => {
    mockedAxios.post.mockResolvedValue({ data: { requires2FA: true } });
    mockGet({ '/User/2fa-setup-uri': { qrCodeUri: 'otpauth://x' } });
    renderAt('/login');

    fireEvent.change(emailInput(), { target: { value: '  naledi.dlamini@artifax.demo ' } });
    fireEvent.change(passwordInput(), { target: { value: 'Artifax@2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByRole('heading', { name: 'Verification Code' })).toBeInTheDocument();
    expect(mockedAxios.post).toHaveBeenCalledWith('/User/employees/login', { email: 'naledi.dlamini@artifax.demo', password: 'Artifax@2026' });
  });

  it.each([
    [httpError(401, 'Incorrect Password'), 'Incorrect email or password.'],
    [httpError(500, 'Server is down'), 'Server is down'],
    [{ notAnError: true }, 'Login failed. Please check your credentials.'],
  ])('explains a failed login (%#)', async (failure, message) => {
    mockedAxios.post.mockRejectedValue(failure);
    renderAt('/login');
    fireEvent.change(emailInput(), { target: { value: 'naledi.dlamini@artifax.demo' } });
    fireEvent.change(passwordInput(), { target: { value: 'wrong' } });

    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText('Login error')).toBeInTheDocument();
  });

  it('toggles password visibility', () => {
    renderAt('/login');

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(passwordInput()).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(passwordInput()).toHaveAttribute('type', 'password');
  });
});

describe('OtpVerifyPage', () => {
  const digit = (n: number) => screen.getByRole('textbox', { name: `Code digit ${n}` });
  const typeCode = (code: string) => code.split('').forEach((c, i) => fireEvent.change(digit(i + 1), { target: { value: c } }));

  function mockSignedInBackend(me: unknown = { userLevel: 'Admin', userEmail: 'naledi.dlamini@artifax.demo', username: 'Naledi Dlamini' }) {
    mockGet({
      '/User/2fa-setup-uri': { qrCodeUri: 'otpauth://totp/ArtifaxApp:naledi?secret=ABC' },
      '/User/me': me,
      '/User/employee/naledi.dlamini%40artifax.demo': { employeeId: 1, branchId: 1 },
      '/Branch': branchesFixture,
    });
  }

  it('shows the setup QR code from the backend for first-time users', async () => {
    mockSignedInBackend();
    renderAt('/login/verify');

    fireEvent.click(screen.getByText('First time?'));

    await waitFor(() => expect(screen.getByTestId('qr')).toHaveTextContent('otpauth://totp/ArtifaxApp:naledi?secret=ABC'));
  });

  it('ignores an empty or failed QR code request', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockGet({ '/User/2fa-setup-uri': { qrCodeUri: '' } });
    const { unmount } = renderAt('/login/verify');
    fireEvent.click(screen.getByText('First time?'));
    await waitFor(() => expect(screen.getByTestId('qr')).toHaveTextContent(''));
    unmount();

    mockGet({ '/User/2fa-setup-uri': httpError(401, 'No login session pending.') });
    renderAt('/login/verify');
    await waitFor(() => expect(log).toHaveBeenCalled());
  });

  it('verifies the code, stores the user with their branch, and offers the dashboard', async () => {
    mockSignedInBackend();
    mockedAxios.post.mockResolvedValue({ data: {} });
    renderAt('/login/verify');

    typeCode('123456');
    fireEvent.click(screen.getByRole('button', { name: 'Verify Account' }));

    expect(await screen.findByRole('heading', { name: 'Verification Successful' })).toBeInTheDocument();
    expect(mockedAxios.post).toHaveBeenCalledWith('/User/employees/verify-2fa', { code: '123456' });
    expect(getCurrentUser()).toEqual({
      name: 'Naledi Dlamini', role: 'Admin', email: 'naledi.dlamini@artifax.demo', employeeId: 1, branchId: 1, branchName: 'Main Branch',
    });

    mockGet({ '/User/me': { username: 'Naledi Dlamini' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue To Dashboard' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard home' })).toBeInTheDocument();
  });

  it('accepts PascalCase session data and copes without employee details', async () => {
    mockGet({
      '/User/2fa-setup-uri': { qrCodeUri: 'x' },
      '/User/me': { UserLevel: 'Employee', UserEmail: 'w@artifax.demo', Username: 'Wanda' },
      '/User/employee/w%40artifax.demo': httpError(404),
    });
    mockedAxios.post.mockResolvedValue({ data: {} });
    renderAt('/login/verify');

    typeCode('654321');
    fireEvent.click(screen.getByRole('button', { name: 'Verify Account' }));

    await screen.findByRole('heading', { name: 'Verification Successful' });
    expect(getCurrentUser()).toEqual({ name: 'Wanda', role: 'Employee', email: 'w@artifax.demo' });
  });

  it('falls back to the email as name and Employee as role', async () => {
    mockSignedInBackend({ userEmail: 'naledi.dlamini@artifax.demo' });
    mockGet({
      '/User/2fa-setup-uri': { qrCodeUri: 'x' },
      '/User/me': { userEmail: 'naledi.dlamini@artifax.demo' },
      '/User/employee/naledi.dlamini%40artifax.demo': { employeeId: 1, branchId: 9 },
      '/Branch': [{ BranchID: 9, BranchName: 'Pretoria Plant' }],
    });
    mockedAxios.post.mockResolvedValue({ data: {} });
    renderAt('/login/verify');

    typeCode('111111');
    fireEvent.click(screen.getByRole('button', { name: 'Verify Account' }));

    await screen.findByRole('heading', { name: 'Verification Successful' });
    expect(getCurrentUser()).toMatchObject({ name: 'naledi.dlamini@artifax.demo', role: 'Employee', branchName: 'Pretoria Plant' });
  });

  it('shows the failure view for a wrong code, and lets the user try again', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mockSignedInBackend();
    mockedAxios.post.mockRejectedValue(httpError(401, 'Invalid 2FA Verification Code'));
    renderAt('/login/verify');

    typeCode('000000');
    fireEvent.click(screen.getByRole('button', { name: 'Verify Account' }));

    expect(await screen.findByRole('heading', { name: 'Verification Failed' })).toBeInTheDocument();
    expect(getCurrentUser()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(digit(1)).toHaveValue('');
  });

  it('fails when the session can’t be loaded after verifying', async () => {
    mockGet({ '/User/2fa-setup-uri': { qrCodeUri: 'x' }, '/User/me': httpError(500) });
    mockedAxios.post.mockResolvedValue({ data: {} });
    renderAt('/login/verify');

    typeCode('123456');
    fireEvent.click(screen.getByRole('button', { name: 'Verify Account' }));

    expect(await screen.findByRole('heading', { name: 'Verification Failed' })).toBeInTheDocument();
  });

  it('requires all six digits', () => {
    mockSignedInBackend();
    renderAt('/login/verify');
    typeCode('123');

    fireEvent.submit(screen.getByRole('button', { name: 'Verify Account' }).closest('form')!);

    expect(screen.getByText('Enter the full 6-digit code.')).toBeInTheDocument();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('keeps only digits, supports paste and arrow/backspace navigation', () => {
    mockSignedInBackend();
    renderAt('/login/verify');

    fireEvent.change(digit(1), { target: { value: 'a7' } });
    expect(digit(1)).toHaveValue('7');
    expect(digit(2)).toHaveFocus();

    fireEvent.keyDown(digit(2), { key: 'Backspace' });
    expect(digit(1)).toHaveFocus();
    fireEvent.keyDown(digit(1), { key: 'ArrowRight' });
    expect(digit(2)).toHaveFocus();
    fireEvent.keyDown(digit(2), { key: 'ArrowLeft' });
    expect(digit(1)).toHaveFocus();
    fireEvent.keyDown(digit(1), { key: 'ArrowLeft' });
    fireEvent.keyDown(digit(6), { key: 'ArrowRight' });
    fireEvent.keyDown(digit(1), { key: 'Enter' });

    fireEvent.paste(digit(1), { clipboardData: { getData: () => '98-76 54' } });
    expect(['1', '2', '3', '4', '5', '6'].map((n) => (digit(Number(n)) as HTMLInputElement).value).join('')).toBe('987654');

    fireEvent.paste(digit(1), { clipboardData: { getData: () => 'abc' } });
    expect(digit(1)).toHaveValue('9');
  });

  it('goes back to login from either view', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mockSignedInBackend();
    renderAt('/login/verify');
    fireEvent.click(screen.getByRole('button', { name: 'Back To Login' }));
    expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument();
  });
});

describe('ProtectedRoute', () => {
  it('shows a loading message, then the page for a signed-in user', async () => {
    mockGet({ '/User/me': { username: 'Naledi Dlamini' } });

    renderAt('/dashboard');

    expect(screen.getByText('Verifying Session...')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Dashboard home' })).toBeInTheDocument();
  });

  it('accepts the PascalCase session shape', async () => {
    mockGet({ '/User/me': { Username: 'Naledi Dlamini' } });

    renderAt('/dashboard');

    expect(await screen.findByRole('heading', { name: 'Dashboard home' })).toBeInTheDocument();
  });

  it('redirects to login without a valid session', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGet({ '/User/me': httpError(401) });

    renderAt('/dashboard');

    expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument();
  });

  it('redirects to login when the session has no user name', async () => {
    mockGet({ '/User/me': { userLevel: 'Admin' } });

    renderAt('/dashboard');

    expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument();
  });
});
