import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Users from './users';
import { showError, showSuccess } from '../../utils/toast';
import { getCurrentUser } from '../../utils/currentUser';
import { httpError, mockedAxios, mockGet, mockWritesSucceed } from '../../test-utils/http';
import { adminUser, branchesFixture, signIn } from '../../test-utils/fixtures';

jest.mock('../../utils/toast', () => ({ showError: jest.fn(), showSuccess: jest.fn(), showInfo: jest.fn() }));

// The form and list have their own tests; these stand-ins expose the props and callbacks the page wires up.
jest.mock('./componets/userList/UserList', () => ({
  __esModule: true,
  default: ({ users, selectedUserId, loading, onSelectUser, onCreateNewUser, branchMap }: any) => (
    <section aria-label="user list">
      <p>{loading ? 'Loading users' : `${users.length} users`} · selected {String(selectedUserId)}</p>
      <ul>
        {users.map((u: any) => (
          <li key={u.id}>
            <button onClick={() => onSelectUser(u.id)}>{u.name} ({u.role}, {branchMap[Number(u.branch)] ?? u.branch})</button>
          </li>
        ))}
      </ul>
      <button onClick={onCreateNewUser}>New user</button>
    </section>
  ),
}));
jest.mock('./componets/craeteUser/craeteusers', () => ({
  __esModule: true,
  default: ({ user, onSave, onDelete, onRequestEdit }: any) => (
    <section aria-label="user form">
      <p>Form for {user ? user.email : 'new user'}</p>
      <button onClick={() => onSave({ id: null, name: 'Lerato Khumalo', email: 'lerato.khumalo@artifax.demo', branch: '2', role: 'Employee', status: 'Active', password: 'Secret123!' })}>Create Lerato</button>
      <button onClick={() => onSave({ id: null, name: 'Ruan Botha', email: 'RUAN.botha@artifax.demo', branch: '1', role: 'Admin', status: 'Active' })}>Create Ruan</button>
      {user && (
        <>
          <button onClick={() => onSave({ ...user, branch: '3' })}>Move to Durban</button>
          <button onClick={() => onSave({ ...user, name: `${user.name} Jr`, password: 'NewPass1!' })}>Rename with password</button>
          <button onClick={() => onSave({ ...user, email: 'renamed@artifax.demo', role: 'Employee', password: '' })}>Change email</button>
          <button onClick={() => onDelete(user.id)}>Delete</button>
          <button onClick={async () => { const ok = await onRequestEdit(user.id); (globalThis as any).editOk = ok; }}>Request edit</button>
        </>
      )}
    </section>
  ),
}));

const admins = [{ employeeId: 1, employeeName: 'Naledi Dlamini', employeeEmail: 'naledi.dlamini@artifax.demo', branchId: 1 }];
const employees = [
  { EmployeeID: 4, EmployeeName: 'Pieter van der Merwe', EmployeeEmail: 'pieter.vdmerwe@artifax.demo', BranchID: 2 },
  { EmployeeId: 6, employeeName: 'Ayesha Patel', employeeEmail: 'ayesha.patel@artifax.demo', BranchId: 3 },
];

function mockBackend(overrides: Record<string, unknown> = {}) {
  mockGet({
    '/User/admins': admins,
    '/User/employees': employees,
    '/Branch': [...branchesFixture, { BranchId: 9, name: 'Pretoria Plant' }, { branchName: 'No id' }],
    '/User/me': { userLevel: 'Admin', username: 'Naledi Dlamini' },
    ...overrides,
  });
}

async function renderPage() {
  render(<Users />);
  await screen.findByText(/3 users/);
}

const select = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));

describe('Users page', () => {
  beforeEach(() => signIn());

  it('combines admins and employees from the backend with their branch names', async () => {
    mockBackend();

    await renderPage();

    expect(screen.getByRole('button', { name: 'Naledi Dlamini (Admin, Main Branch)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pieter van der Merwe (Employee, Johannesburg Fabrication Plant)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ayesha Patel (Employee, Durban Assembly Plant)' })).toBeInTheDocument();
  });

  it('handles missing fields and empty responses', async () => {
    mockBackend({ '/User/admins': null, '/User/employees': [{}], '/Branch': null });
    render(<Users />);

    expect(await screen.findByText(/1 users/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '(Employee, 0)' })).toBeInTheDocument();
  });

  it('tells the user when the list can’t be loaded', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockBackend({ '/User/admins': httpError(500) });

    render(<Users />);

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Unable to load users. Please refresh the page.'));
    expect(screen.getByText(/0 users/)).toBeInTheDocument();
  });

  it('stops showing the loading state if the request hangs', async () => {
    jest.useFakeTimers();
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedAxios.get.mockReturnValue(new Promise(() => {}) as never);
    render(<Users />);
    expect(screen.getByText(/Loading users/)).toBeInTheDocument();

    act(() => { jest.advanceTimersByTime(4000); });

    expect(error).toHaveBeenCalledWith('Fetch users timed out');
    expect(screen.getByText(/0 users/)).toBeInTheDocument();
    jest.useRealTimers();
  });

  it('selects a user for editing and clears the selection for a new user', async () => {
    mockBackend();
    await renderPage();

    select(/Ayesha Patel/);
    expect(screen.getByText('Form for ayesha.patel@artifax.demo')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New user' }));
    expect(screen.getByText('Form for new user')).toBeInTheDocument();
  });

  describe('creating users', () => {
    it('checks the session, creates the employee and selects them', async () => {
      mockBackend();
      mockedAxios.post.mockResolvedValue({ data: { employeeId: 6 } });
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Create Lerato' }));

      await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('User created successfully.'));
      expect(mockedAxios.get).toHaveBeenCalledWith('/User/me');
      expect(mockedAxios.post).toHaveBeenCalledWith('/User/employee', {
        BranchID: 2, EmployeeEmail: 'lerato.khumalo@artifax.demo', EmployeeName: 'Lerato Khumalo', EmployeePassword: 'Secret123!', EmployeeLevel: 'Employee',
      });
      expect(screen.getByText(/selected 6/)).toBeInTheDocument();
    });

    it('finds the new user by email when the response has no id', async () => {
      mockBackend({ '/User/admins': [...admins, { employeeId: 2, employeeName: 'Ruan Botha', employeeEmail: 'ruan.botha@artifax.demo', branchId: 1 }] });
      mockedAxios.post.mockResolvedValue({ data: {} });
      render(<Users />);
      await screen.findByText(/4 users/);

      fireEvent.click(screen.getByRole('button', { name: 'Create Ruan' }));

      await waitFor(() => expect(screen.getByText(/selected 2/)).toBeInTheDocument());
      expect(mockedAxios.post).toHaveBeenCalledWith('/User/employee', expect.objectContaining({ EmployeeLevel: 'Admin', EmployeePassword: '' }));
    });

    it('accepts PascalCase ids and copes when the new user isn’t found', async () => {
      mockBackend();
      mockedAxios.post.mockResolvedValueOnce({ data: { EmployeeID: 9 } }).mockResolvedValueOnce({ data: null });
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Create Lerato' }));
      await waitFor(() => expect(screen.getByText(/selected 9/)).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Create Ruan' }));
      await waitFor(() => expect(showSuccess).toHaveBeenCalledTimes(2));
    });

    it('reports a failed create', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockBackend();
      mockedAxios.post.mockRejectedValue(httpError(401, 'Creation attempted by non-admin!'));
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Create Lerato' }));

      await waitFor(() => expect(showError).toHaveBeenCalledWith('Unable to save user. Please try again.'));
    });
  });

  describe('updating users', () => {
    it('uses the branch endpoint when only the branch changes, and updates the stored session for yourself', async () => {
      mockBackend();
      mockWritesSucceed();
      await renderPage();
      select(/Naledi Dlamini/);

      fireEvent.click(screen.getByRole('button', { name: 'Move to Durban' }));

      await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('User updated successfully.'));
      expect(mockedAxios.patch).toHaveBeenCalledWith('/User/employee/branch?EmployeeEmail=naledi.dlamini%40artifax.demo&BranchId=3');
      expect(getCurrentUser()).toMatchObject({ branchId: 3, email: 'naledi.dlamini@artifax.demo' });
    });

    it('moves another user without touching the stored session', async () => {
      mockBackend();
      mockWritesSucceed();
      await renderPage();
      select(/Pieter/);

      fireEvent.click(screen.getByRole('button', { name: 'Move to Durban' }));

      await waitFor(() => expect(showSuccess).toHaveBeenCalled());
      expect(getCurrentUser()).toEqual(adminUser);
    });

    it('sends a details update with the new password', async () => {
      mockBackend();
      mockWritesSucceed();
      await renderPage();
      select(/Pieter/);

      fireEvent.click(screen.getByRole('button', { name: 'Rename with password' }));

      await waitFor(() => expect(mockedAxios.patch).toHaveBeenCalledWith('/User/employee?EmployeeEmail=pieter.vdmerwe%40artifax.demo', {
        BranchID: 2, EmployeeEmail: 'pieter.vdmerwe@artifax.demo', EmployeeName: 'Pieter van der Merwe Jr', EmployeeLevel: 'Employee', EmployeePassword: 'NewPass1!',
      }));
      expect(getCurrentUser()).toEqual(adminUser);
    });

    it('updates your own stored profile when you change your details', async () => {
      mockBackend();
      mockWritesSucceed();
      await renderPage();
      select(/Naledi Dlamini/);

      fireEvent.click(screen.getByRole('button', { name: 'Change email' }));

      await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('User updated successfully.'));
      const [, payload] = mockedAxios.patch.mock.calls[0];
      expect(payload).not.toHaveProperty('EmployeePassword');
      expect(getCurrentUser()).toMatchObject({ email: 'renamed@artifax.demo', role: 'Employee', branchName: 'Main Branch' });
    });

    it('keeps the stored branch name when the branch isn’t in the list', async () => {
      signIn({ ...adminUser, email: 'ayesha.patel@artifax.demo', branchName: 'Old name' });
      mockBackend({ '/Branch': [] });
      mockWritesSucceed();
      await renderPage();
      select(/Ayesha Patel/);

      fireEvent.click(screen.getByRole('button', { name: 'Change email' }));

      await waitFor(() => expect(getCurrentUser()).toMatchObject({ branchName: 'Old name', email: 'renamed@artifax.demo' }));
    });

    it('handles updates when nobody is stored as logged in', async () => {
      window.localStorage.clear();
      mockBackend();
      mockWritesSucceed();
      await renderPage();
      select(/Pieter/);

      fireEvent.click(screen.getByRole('button', { name: 'Move to Durban' }));
      await waitFor(() => expect(showSuccess).toHaveBeenCalledTimes(1));
      fireEvent.click(screen.getByRole('button', { name: 'Change email' }));
      await waitFor(() => expect(showSuccess).toHaveBeenCalledTimes(2));
      expect(getCurrentUser()).toBeNull();
    });

    it('reports a failed update', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockBackend();
      mockedAxios.patch.mockRejectedValue(httpError(500));
      await renderPage();
      select(/Pieter/);

      fireEvent.click(screen.getByRole('button', { name: 'Move to Durban' }));

      await waitFor(() => expect(showError).toHaveBeenCalledWith('Unable to save user. Please try again.'));
    });
  });

  describe('deleting and refreshing', () => {
    it('deletes a user and clears the selection', async () => {
      mockBackend();
      mockWritesSucceed();
      await renderPage();
      select(/Ayesha Patel/);

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('User deleted successfully.'));
      expect(mockedAxios.delete).toHaveBeenCalledWith('/User/employee?id=6');
      expect(screen.getByText('Form for new user')).toBeInTheDocument();
    });

    it('reports a failed delete', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockBackend();
      mockedAxios.delete.mockRejectedValue(httpError(401));
      await renderPage();
      select(/Ayesha Patel/);

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(showError).toHaveBeenCalledWith('Unable to delete user. Please try again.'));
    });

    it('reloads the latest users before editing', async () => {
      mockBackend();
      await renderPage();
      select(/Ayesha Patel/);
      const before = mockedAxios.get.mock.calls.length;

      fireEvent.click(screen.getByRole('button', { name: 'Request edit' }));

      await waitFor(() => expect((globalThis as any).editOk).toBe(true));
      expect(mockedAxios.get.mock.calls.length).toBe(before + 3);
    });
  });
});
