import { render, screen } from '@testing-library/react';
import App from './App';
import { httpError, mockGet } from './test-utils/http';

// App wires the routes together; each page has its own tests. These check the route guards.
describe('App routing', () => {
  it('sends visitors without a session to the login page', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGet({ '/User/me': httpError(401, 'No active session.') });
    window.location.hash = '#/dashboard';

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument();
  });

  it('redirects unknown addresses to the login page', async () => {
    window.location.hash = '#/does-not-exist';

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument();
  });
});
