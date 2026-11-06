import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CraeteUsersPage from './craeteusers';
import { httpError, mockGet } from '../../../../test-utils/http';
import { branchesFixture } from '../../../../test-utils/fixtures';

const pieter = { id: 4, name: 'Pieter van der Merwe', email: 'pieter.vdmerwe@artifax.demo', branch: '2', role: 'Employee', status: 'Active' };

const input = (label: string) => screen.getByText(label, { selector: 'span' }).closest('label')!.querySelector('input')!;

function setup(props: Partial<React.ComponentProps<typeof CraeteUsersPage>> = {}) {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const onDelete = jest.fn();
  const utils = render(<CraeteUsersPage onSave={onSave} onDelete={onDelete} {...props} />);
  return { onSave, onDelete, ...utils };
}

function fillNewUser() {
  fireEvent.change(input('Full Name'), { target: { value: 'Lerato Khumalo' } });
  fireEvent.change(input('Email'), { target: { value: 'lerato.khumalo@artifax.demo' } });
  fireEvent.change(input('Password'), { target: { value: 'Secret123!' } });
}

describe('CraeteUsersPage', () => {
  beforeEach(() => mockGet({ '/Branch': branchesFixture }));

  describe('creating a user', () => {
    it('defaults to the first branch from the backend and submits the new user', async () => {
      const { onSave } = setup();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Select branch' })).toHaveTextContent('Main Branch'));

      fillNewUser();
      fireEvent.click(screen.getByRole('button', { name: 'Select role' }));
      fireEvent.click(screen.getByRole('option', { name: 'Employee' }));
      fireEvent.click(screen.getByRole('button', { name: 'Select branch' }));
      fireEvent.click(screen.getByRole('option', { name: 'Durban Assembly Plant' }));
      fireEvent.click(screen.getByRole('button', { name: 'Create User' }));

      await waitFor(() => expect(onSave).toHaveBeenCalledWith({
        id: null, name: 'Lerato Khumalo', email: 'lerato.khumalo@artifax.demo', branch: '3', role: 'Employee', status: 'Active', password: 'Secret123!',
      }));
    });

    it.each([
      ['', 'Secret123!', 'Email is required'],
      ['not-an-email', 'Secret123!', 'Please enter a valid email address'],
      ['lerato@artifax.demo', '', 'Password is required'],
      ['lerato@artifax.demo', 'abc', 'Password must be at least 5 characters'],
      ['lerato@artifax.demo', 'way-too-long-password', 'Password must be no more than 15 characters'],
    ])('blocks invalid input (%s / %s)', async (email, password, message) => {
      const { onSave } = setup();
      fireEvent.change(input('Full Name'), { target: { value: 'Lerato' } });
      fireEvent.change(input('Email'), { target: { value: email } });
      fireEvent.change(input('Password'), { target: { value: password } });

      expect(screen.getByText(message)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create User' })).toBeDisabled();
      fireEvent.submit(screen.getByRole('button', { name: 'Create User' }).closest('form')!);
      expect(onSave).not.toHaveBeenCalled();
    });

    it('shows the server’s message when saving fails', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const { onSave } = setup();
      onSave.mockRejectedValueOnce(new Error('Email Already Exists')).mockRejectedValueOnce({});
      await waitFor(() => expect(screen.getByRole('button', { name: 'Select branch' })).toHaveTextContent('Main Branch'));
      fillNewUser();

      fireEvent.click(screen.getByRole('button', { name: 'Create User' }));
      expect(await screen.findByText('Email Already Exists')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Create User' }));
      expect(await screen.findByText('Save failed', { selector: 'p' })).toBeInTheDocument();

      fireEvent.change(input('Full Name'), { target: { value: 'Lerato K' } });
      expect(screen.queryByText('Save failed', { selector: 'p' })).not.toBeInTheDocument();
    });

    it('falls back to placeholder branches when branches can’t be loaded', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockGet({ '/Branch': httpError(500) });
      setup();

      await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to load branches', expect.anything()));
      fireEvent.click(screen.getByRole('button', { name: 'Select branch' }));
      expect(screen.getByRole('option', { name: 'Warehouse A' })).toBeInTheDocument();
    });

    it('reads branches in any casing, and handles an empty list', async () => {
      mockGet({ '/Branch': [{ BranchId: 7, name: 'Pretoria Plant' }, {}] });
      const { unmount } = setup();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Select branch' })).toHaveTextContent('Pretoria Plant'));
      unmount();

      mockGet({ '/Branch': null });
      setup();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Select branch' })).toHaveTextContent('Warehouse A'));
    });

    it('toggles password visibility', () => {
      setup();

      fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
      expect(input('Password')).toHaveAttribute('type', 'text');
      fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
      expect(input('Password')).toHaveAttribute('type', 'password');
    });
  });

  describe('an existing user', () => {
    it('shows their details read-only until Edit is pressed', async () => {
      setup({ user: pieter });

      expect(input('Full Name')).toHaveValue('Pieter van der Merwe');
      expect(input('Email')).toHaveValue('pieter.vdmerwe@artifax.demo');
      expect(input('Full Name')).toBeDisabled();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Select branch' })).toHaveTextContent('Johannesburg Fabrication Plant'));
      expect(screen.getByRole('button', { name: 'Select role' })).toHaveTextContent('Employee');
    });

    it('asks the page before editing, and only allows it when the page agrees', async () => {
      const onRequestEdit = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      setup({ user: pieter, onRequestEdit });

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      await waitFor(() => expect(onRequestEdit).toHaveBeenCalledWith(4));
      expect(input('Full Name')).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      await waitFor(() => expect(input('Full Name')).toBeEnabled());
    });

    it('saves edits without a password unless one was typed', async () => {
      const { onSave } = setup({ user: pieter });
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      await waitFor(() => expect(input('Full Name')).toBeEnabled());

      fireEvent.change(input('Full Name'), { target: { value: 'Pieter vd Merwe' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => expect(onSave).toHaveBeenCalledWith({ ...pieter, name: 'Pieter vd Merwe', password: undefined }));
      await waitFor(() => expect(input('Full Name')).toBeDisabled());
    });

    it('sends a new password when one is typed', async () => {
      const { onSave } = setup({ user: pieter });
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      await waitFor(() => expect(input('Password')).toBeEnabled());

      fireEvent.change(input('Password'), { target: { value: 'NewPass1!' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ password: 'NewPass1!' })));
    });

    it('restores the saved details when editing is cancelled', async () => {
      setup({ user: pieter });
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      await waitFor(() => expect(input('Full Name')).toBeEnabled());
      fireEvent.change(input('Full Name'), { target: { value: 'Typo' } });

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(input('Full Name')).toHaveValue('Pieter van der Merwe');
      expect(input('Full Name')).toBeDisabled();
      expect(input('Password')).toHaveValue('************');
    });

    it('deletes the user', () => {
      const { onDelete } = setup({ user: pieter });

      fireEvent.click(screen.getByRole('button', { name: 'Delete User' }));

      expect(onDelete).toHaveBeenCalledWith(4);
    });

    it('keeps an edit going when the same user is refreshed, but resets for a different user or a new one', async () => {
      const { rerender, onSave, onDelete } = setup({ user: pieter });
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      await waitFor(() => expect(input('Full Name')).toBeEnabled());

      rerender(<CraeteUsersPage user={{ ...pieter }} onSave={onSave} onDelete={onDelete} />);
      expect(input('Full Name')).toBeEnabled();

      rerender(<CraeteUsersPage user={{ ...pieter, id: 6, name: 'Ayesha Patel' }} onSave={onSave} onDelete={onDelete} />);
      expect(input('Full Name')).toBeDisabled();
      expect(input('Full Name')).toHaveValue('Ayesha Patel');

      rerender(<CraeteUsersPage onSave={onSave} onDelete={onDelete} />);
      expect(input('Full Name')).toHaveValue('');
      expect(screen.getByRole('button', { name: 'Create User' })).toBeInTheDocument();
    });
  });
});
