import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Sidebar from '../Sidebar';
import Topbar from '../Topbar';
import { getCurrentUser } from '../../../utils/currentUser';
import { httpError, mockedAxios, mockGet } from '../../../test-utils/http';
import { adminUser, signIn } from '../../../test-utils/fixtures';

function renderAt(ui: React.ReactElement, path = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<h1>Login page</h1>} />
        <Route path="*" element={ui} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  it('shows the session user and the admin menu for admins', async () => {
    mockGet({ '/User/me': { username: 'Naledi Dlamini', userLevel: 'Admin' } });

    renderAt(<Sidebar />);

    expect(await screen.findByText('Naledi Dlamini')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Analytics' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveClass('active');
  });

  it('hides the admin menu from employees (PascalCase session)', async () => {
    mockGet({ '/User/me': { Username: 'Pieter van der Merwe', UserLevel: 'Employee' } });

    renderAt(<Sidebar />);

    expect(await screen.findByText('Pieter van der Merwe')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  });

  it('falls back to the stored user, then to placeholder details, without a session', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGet({ '/User/me': httpError(401) });
    signIn({ ...adminUser, name: 'Stored Name', role: 'Employee' });
    const { unmount } = renderAt(<Sidebar />);
    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalled());
    expect(screen.getByText('Stored Name')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
    unmount();

    window.localStorage.clear();
    renderAt(<Sidebar />);
    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalledTimes(2));
    expect(screen.getByText('J. Martinez')).toBeInTheDocument();
  });

  it('logs out: tells the server, clears local state and goes to login', async () => {
    mockGet({ '/User/me': { username: 'Naledi Dlamini', userLevel: 'Admin' } });
    mockedAxios.post.mockResolvedValue({ data: {} });
    signIn();
    window.localStorage.setItem('token', 'x');
    window.sessionStorage.setItem('artifax.authToken', 'y');
    renderAt(<Sidebar />);

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument();
    expect(mockedAxios.post).toHaveBeenCalledWith('/User/logout');
    expect(getCurrentUser()).toBeNull();
    expect(window.localStorage.getItem('token')).toBeNull();
    expect(window.sessionStorage.getItem('artifax.authToken')).toBeNull();
  });

  it('still logs out locally when the server call fails', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGet({ '/User/me': { username: 'Naledi Dlamini' } });
    mockedAxios.post.mockRejectedValue(httpError(500));
    signIn();
    renderAt(<Sidebar />);

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument();
    expect(error).toHaveBeenCalledWith('Logout API call failed:', expect.anything());
    expect(getCurrentUser()).toBeNull();
  });

  it('ignores a session response that arrives after unmounting', async () => {
    let resolve: (v: unknown) => void = () => {};
    mockedAxios.get.mockReturnValue(new Promise((r) => { resolve = r; }) as never);
    const { unmount } = renderAt(<Sidebar />);

    unmount();
    await act(async () => { resolve({ data: { username: 'Late' } }); });

    expect(screen.queryByText('Late')).not.toBeInTheDocument();
  });
});

describe('Topbar', () => {
  afterEach(() => document.documentElement.removeAttribute('data-theme'));

  it('builds breadcrumbs from the route', () => {
    renderAt(<Topbar />, '/inventory');
    expect(screen.getByText('Artifax')).toBeInTheDocument();
    expect(screen.getByText('Inventory')).toBeInTheDocument();
  });

  it('shows Dashboard for the root path and capitalises unknown segments', () => {
    const { unmount } = render(<MemoryRouter initialEntries={['/']}><Topbar /></MemoryRouter>);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    unmount();

    renderAt(<Topbar />, '/reports');
    expect(screen.getByText('Reports')).toBeInTheDocument();
  });

  it('shows the stored user and branch name', () => {
    signIn();

    renderAt(<Topbar />);

    expect(screen.getByText('Naledi Dlamini')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Main Branch' })).toBeInTheDocument();
  });

  it('looks up the branch name from the backend when only the id is stored', async () => {
    signIn({ ...adminUser, branchName: undefined, branchId: 3 });
    mockGet({ '/Branch/3': { branchID: 3, branchName: 'Durban Assembly Plant' } });

    renderAt(<Topbar />);

    expect(screen.getByRole('button', { name: 'Branch 3' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Durban Assembly Plant' })).toBeInTheDocument();
  });

  it('accepts a PascalCase branch, and keeps "Branch N" when the lookup returns no name or fails', async () => {
    signIn({ ...adminUser, branchName: undefined, branchId: 2 });
    mockGet({ '/Branch/2': { BranchID: 2, BranchName: 'Johannesburg Fabrication Plant' } });
    const first = renderAt(<Topbar />);
    expect(await screen.findByRole('button', { name: 'Johannesburg Fabrication Plant' })).toBeInTheDocument();
    first.unmount();

    mockGet({ '/Branch/2': {} });
    const second = renderAt(<Topbar />);
    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Branch 2' })).toBeInTheDocument();
    second.unmount();

    mockGet({ '/Branch/2': httpError(404) });
    renderAt(<Topbar />);
    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalledTimes(3));
    expect(screen.getByRole('button', { name: 'Branch 2' })).toBeInTheDocument();
  });

  it('ignores a branch lookup that finishes after unmounting', async () => {
    signIn({ ...adminUser, branchName: undefined, branchId: 3 });
    let resolve: (v: unknown) => void = () => {};
    let reject: (v: unknown) => void = () => {};
    mockedAxios.get.mockReturnValueOnce(new Promise((r) => { resolve = r; }) as never)
      .mockReturnValueOnce(new Promise((_, r) => { reject = r; }) as never);
    renderAt(<Topbar />).unmount();
    renderAt(<Topbar />).unmount();

    await act(async () => {
      resolve({ data: { branchName: 'Late' } });
      reject(httpError(500));
    });

    expect(screen.queryByText('Late')).not.toBeInTheDocument();
  });

  it('shows placeholders with no stored user', () => {
    renderAt(<Topbar />);

    expect(screen.getByRole('button', { name: 'Branch' })).toBeInTheDocument();
    expect(screen.getByText('D. Dastardly')).toBeInTheDocument();
  });

  it('defaults to the synthwave theme and remembers it', () => {
    renderAt(<Topbar />);

    expect(document.documentElement.dataset.theme).toBe('synthwave');
    expect(window.localStorage.getItem('theme')).toBe('synthwave');
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('switching to light mode is remembered for the next visit', () => {
    const { unmount } = renderAt(<Topbar />);

    fireEvent.click(screen.getByRole('checkbox'));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(window.localStorage.getItem('theme')).toBe('light');
    unmount();

    renderAt(<Topbar />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('switches back to synthwave', () => {
    window.localStorage.setItem('theme', 'light');
    renderAt(<Topbar />);

    fireEvent.click(screen.getByRole('checkbox'));

    expect(document.documentElement.dataset.theme).toBe('synthwave');
    expect(window.localStorage.getItem('theme')).toBe('synthwave');
  });

  it('keeps a saved synthwave choice without rewriting it', () => {
    window.localStorage.setItem('theme', 'synthwave');
    const setItem = jest.spyOn(Storage.prototype, 'setItem');

    renderAt(<Topbar />);

    expect(setItem).not.toHaveBeenCalledWith('theme', 'synthwave');
    setItem.mockRestore();
  });
});
