import { ClipboardEvent, FormEvent, KeyboardEvent, useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import './LoginPage.css';
import { getBranches, GetOtpQrCode, VerifyOtpCode, getCurrentUserFromSession, getEmployeeByEmail } from '../../services/authApi';
import { setCurrentUser } from '../../utils/currentUser';

const OTP_LENGTH = 6;

// Define the allowed view states for the component
type VerifyStatus = 'input' | 'success' | 'failed';

function OtpVerifyPage() {
  const navigate = useNavigate();
  
  // 🌟 View state control
  const [status, setStatus] = useState<VerifyStatus>('input');
  
  const [digits, setDigits] = useState<string[]>(Array.from({ length: OTP_LENGTH }, () => ''));
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [hasApp, setHasApp] = useState(true);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const code = useMemo(() => digits.join(''), [digits]);
  const isCodeComplete = code.length === OTP_LENGTH;

  async function GetCode() {
    try {
      const _data = await GetOtpQrCode();
      if (_data.qrCodeUri.length > 0) {
        setQrUri(_data.qrCodeUri);
      }
    } catch (error) {
      console.log(error);
    }
  }

  useEffect(() => {
    GetCode();
  }, []);

  const focusInput = (index: number) => {
    const target = inputRefs.current[index];
    if (target) {
      target.focus();
      target.select();
    }
  };

  const updateDigit = (index: number, value: string) => {
    const numeric = value.replace(/\D/g, '').slice(-1);
    setDigits((previous) => {
      const next = [...previous];
      next[index] = numeric;
      return next;
    });

    if (numeric && index < OTP_LENGTH - 1) {
      focusInput(index + 1);
    }
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      focusInput(index - 1);
      return;
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      focusInput(index - 1);
      return;
    }
    if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      event.preventDefault();
      focusInput(index + 1);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;

    event.preventDefault();
    const next = Array.from({ length: OTP_LENGTH }, (_, index) => pasted[index] || '');
    setDigits(next);
    focusInput(Math.min(pasted.length, OTP_LENGTH - 1));
  };

  // Resets the inputs when moving from the failed view back to the entry view
  const handleTryAgain = () => {
    setDigits(Array.from({ length: OTP_LENGTH }, () => ''));
    setSubmitAttempted(false);
    setErrorMessage('');
    setStatus('input');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitAttempted(true);
    setErrorMessage('');

    if (!isCodeComplete) return;

    try {
      // 1. Send clean raw code string to the backend
      await VerifyOtpCode(code);

      // 2. Hydrate application state with security details
      let sessionUser: any = {};
      try {
        sessionUser = await getCurrentUserFromSession();
      } catch (e) {
        sessionUser = {};
      }

      // Safe check: If session user data couldn't be loaded, redirect to fail screen
      if (!sessionUser) {
        setErrorMessage("Verification passed, but profile session could not be fetched.");
        setStatus('failed');
        return;
      }



      const currentEmail = sessionUser.UserEmail ?? (sessionUser as any)?.userEmail;
      const currentName = sessionUser.Username ?? (sessionUser as any)?.username ?? currentEmail;
      const currentRole = sessionUser.UserLevel ?? (sessionUser as any)?.userLevel ?? 'Employee';

      let branchName: string | undefined;
      let employeeId: number | undefined;
      let branchId: number | undefined;

      try {
        const employeeDetails = await getEmployeeByEmail(currentEmail);
        employeeId = employeeDetails.employeeId;
        branchId = employeeDetails.branchId;
        const branches = await getBranches();
        // The API serialises camelCase (branchID/branchName); accept both casings.
        const branch = (branches as Array<Record<string, unknown>>).find((b) => (b.BranchID ?? b.branchID) === branchId);
        branchName = (branch?.BranchName ?? branch?.branchName) as string | undefined;
      } catch (branchError) {
        branchName = undefined;
      }

      setCurrentUser({
        name: currentName,
        role: currentRole,
        email: currentEmail,
        employeeId,
        branchId,
        branchName,
      });

      // 🌟 SUCCESS: Switch status view inside the component
      setStatus('success');

    } catch (err) {
      // 🌟 FAILURE: Switch status view inside the component
      console.log(err);
      setStatus('failed');
    }
  };

  return (
    <main className="login-page-shell">
      <section className="login-card login-card-compact">
        
        {/* Render the standard header ONLY when we are inputting the code */}
        {status === 'input' && (
          <header className="login-card-header">
            <div className="login-title-row">
              <div className="login-avatar" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <rect x="4" y="6" width="16" height="12" rx="2" />
                  <path d="M8 10h8" />
                  <path d="M8 14h4" />
                </svg>
              </div>
              <h1>Verification Code</h1>
            </div>
          </header>
        )}

        <div className="login-card-body login-card-body-compact">
          
          {/* VIEW 1: CODE INPUT STAGE */}
          {status === 'input' && (
            <>
              <p className="login-subtitle">Open Google Authenticator on your mobile device to retrieve your login token.</p>

              {hasApp ? (
                <p onClick={() => setHasApp(false)} className='mb-5 underline hover:cursor-pointer w-fit text-primary-dark'>First time?</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '10px' }}>Scan this code to configure your Google Authenticator profile:</p>
                  <div style={{ padding: '10px', background: 'white', borderRadius: '8px' }}>
                    <QRCodeCanvas value={qrUri || ''} size={160} />
                  </div>
                </div>
              )}

              <form className="login-form" onSubmit={handleSubmit} noValidate>
                <div className="login-otp-sequence" role="group" aria-label="One-time password input">
                  {digits.map((digit, index) => (
                    <input
                      key={`otp-${index}`}
                      ref={(element) => { inputRefs.current[index] = element; }}
                      className={`login-otp-input ${(submitAttempted && !isCodeComplete) || errorMessage ? 'invalid' : ''}`}
                      type="text"
                      inputMode="numeric"
                      autoComplete={index === 0 ? 'one-time-code' : 'off'}
                      maxLength={1}
                      value={digit}
                      onChange={(event) => updateDigit(index, event.target.value)}
                      onKeyDown={(event) => handleKeyDown(index, event)}
                      onPaste={handlePaste}
                      aria-label={`Code digit ${index + 1}`}
                    />
                  ))}
                </div>

                {errorMessage && <p className="login-inline-error" role="alert">{errorMessage}</p>}
                {submitAttempted && !isCodeComplete && !errorMessage && (
                  <p className="login-inline-error" role="alert">Enter the full 6-digit code.</p>
                )}

                <button type="submit" className="login-submit" disabled={!isCodeComplete}>
                  Verify Account
                </button>

                <button type="button" className="login-secondary-action" onClick={() => navigate('/login')}>
                  Back To Login
                </button>
              </form>
            </>
          )}

          {/* VIEW 2: VERIFICATION SUCCESS STAGE */}
          {status === 'success' && (
            <>
              <div className="login-status-card success" role="status" aria-live="polite">
                <div className="login-status-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M8.2 12.3l2.4 2.4 5-5" />
                  </svg>
                </div>
                <h1>Verification Successful</h1>
                <p>Your OTP was accepted. You can continue to the application dashboard.</p>
              </div>

              <div className="login-actions-column">
                <button type="button" className="login-submit" onClick={() => navigate('/dashboard')}>
                  Continue To Dashboard
                </button>
              </div>
            </>
          )}

          {/* VIEW 3: VERIFICATION FAILED STAGE */}
          {status === 'failed' && (
            <>
              <div className="login-status-card failed" role="alert">
                <div className="login-status-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M9.5 9.5l5 5" />
                    <path d="M14.5 9.5l-5 5" />
                  </svg>
                </div>
                <h1>Verification Failed</h1>
                <p>The code entered did not match. Try again with the latest OTP.</p>
              </div>

              <div className="login-actions-column">
                <button type="button" className="login-submit" onClick={handleTryAgain}>
                  Try Again
                </button>
                <button type="button" className="login-secondary-action" onClick={() => navigate('/login')}>
                  Back To Login
                </button>
              </div>
            </>
          )}

        </div>
      </section>
    </main>
  );
}

export default OtpVerifyPage;