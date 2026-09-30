import React, { useState } from 'react';
import { Lock, Mail, User, ArrowRight, ArrowLeft, Loader2, ShieldCheck, Zap, Eye, EyeOff } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { 
  sendPasswordResetEmail, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword 
} from "firebase/auth";
import { db, auth, backupAuth, handleFirestoreError, OperationType } from '../firebase';
import { User as UserType, UserRole, NotificationType } from '../types';
import { notifyAdmins, createNotification } from '../services/notificationService';
import { syncSetDoc } from '../services/firestoreSync';
import { parseApiResponse } from '../services/apiUtils';
import { clearStaleAuthSession, logAuthDiagnostic } from '../services/authService';
import { signOut } from 'firebase/auth';
import seededUsers from '../users.json';
import { AutomatiqaLogo } from './AutomatiqaLogo';

interface AuthProps {
  onLogin: (user: UserType) => void;
}

type AuthView = 'login' | 'signup' | 'forgot-password';

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [view, setView] = useState<AuthView>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [resetLink, setResetLink] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');

  const clearState = () => {
    setError('');
    setSuccessMsg('');
    setResetLink('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setName('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const switchView = (newView: AuthView) => {
    clearState();
    setView(newView);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) { setError('Email address is required.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setIsLoading(true);
    const path = `users/${normalizedEmail}`;
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      
      // Mirror registration to Backup Project Auth
      try {
        await createUserWithEmailAndPassword(backupAuth, normalizedEmail, password);
      } catch (bAuthErr) {
        console.warn("Backup Auth user mirror note:", bAuthErr);
      }

      const userRef = doc(db, "users", normalizedEmail);
      
      // Default admin logic: the users with specified emails are automatically Super Admins
      const isDefaultSuperAdmin = normalizedEmail === 'shanmugapriya@qaoncloud.com' || normalizedEmail === 'vinuta@qaoncloud.com';
      
      const newUser: UserType = {
        email: normalizedEmail,
        name: name.trim() || normalizedEmail.split('@')[0],
        role: isDefaultSuperAdmin ? UserRole.SUPER_ADMIN : UserRole.TEAM_MEMBER,
        assignedProjectIds: []
      };
      await syncSetDoc(userRef, { ...newUser, status: 'active', createdAt: new Date().toISOString() });
      await createNotification({
        recipientEmail: normalizedEmail,
        senderName: 'System Engine',
        type: NotificationType.USER_SIGNUP,
        title: 'Welcome to AutomatiQA',
        message: `Welcome ${newUser.name}! Your account has been registered successfully. Admin will assign workspace projects.`
      });
      await notifyAdmins('New User Registration', `${newUser.name} (${newUser.email}) registered a new account.`, 'System Engine', NotificationType.USER_SIGNUP);
      setIsLoading(false);
      setSuccessMsg('Account created successfully! Please sign in to establish your session.');
      setTimeout(() => { switchView('login'); setEmail(normalizedEmail); }, 2000);
    } catch (err: any) {
      if (err.code) {
        const code = err.code || '';
        if (code === 'auth/email-already-in-use') setError("This email is already associated with an account.");
        else if (code === 'auth/invalid-email') setError("The email address provided is not valid.");
        else if (code === 'auth/weak-password') setError("The password is too weak. Use at least 6 characters.");
        else if (code === 'auth/network-request-failed') setError("Network verification failed. Please check your connectivity.");
        else setError("Onboarding failed. Please ensure all fields are correct.");
      } else {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Retrieve input values from React state or direct form DOM elements to guarantee reliable entry across browsers
    const form = e.currentTarget as HTMLFormElement;
    const emailEl = (form?.elements?.namedItem('username') as HTMLInputElement) || (form?.elements?.namedItem('email') as HTMLInputElement) || (document.getElementById('login-email') as HTMLInputElement);
    const passwordEl = (form?.elements?.namedItem('password') as HTMLInputElement) || (document.getElementById('login-password') as HTMLInputElement);

    const inputEmail = (email || emailEl?.value || '').trim();
    const inputPassword = password || passwordEl?.value || '';

    if (emailEl?.value && !email) setEmail(emailEl.value);
    if (passwordEl?.value && !password) setPassword(passwordEl.value);

    if (!inputEmail || !inputPassword) { 
      setError('Please enter your email and password.'); 
      setIsLoading(false); 
      return; 
    }

    // Strict validation: uppercase letters are not accepted in the Email field
    if (/[A-Z]/.test(inputEmail)) {
      setError('Uppercase letters are not accepted in the email field. Please use lowercase letters only.');
      setIsLoading(false);
      return;
    }

    // Standard lowercase email format check
    const emailFormatRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
    if (!emailFormatRegex.test(inputEmail)) {
      setError('Please enter a valid email address.');
      setIsLoading(false);
      return;
    }

    const normalizedEmail = inputEmail;
    const path = `users/${normalizedEmail}`;

    logAuthDiagnostic('Login attempt initiated', { email: normalizedEmail });

    // Clean up any lingering or stale auth state prior to authentication
    if (auth.currentUser) {
      try {
        await signOut(auth);
      } catch (soErr) {}
    }
    clearStaleAuthSession({ clearFirebaseSdkStorage: true });

    try {
      try {
        await signInWithEmailAndPassword(auth, normalizedEmail, inputPassword);
      } catch (signInErr: any) {
        const code = signInErr?.code || '';
        const msg = signInErr?.message || '';

        // If known seeded user and not yet created in Firebase Auth, attempt seamless user creation
        const seeded = (seededUsers as any[]).find(u => u.id?.toLowerCase() === normalizedEmail || u.data?.email?.toLowerCase() === normalizedEmail);
        if (seeded && (code === 'auth/user-not-found' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials' || msg.includes('invalid-credential') || msg.includes('user-not-found'))) {
          try {
            await createUserWithEmailAndPassword(auth, normalizedEmail, inputPassword);
          } catch (createErr) {
            throw signInErr;
          }
        } else if (code === 'auth/internal-error' || code === 'auth/user-token-expired' || code === 'auth/invalid-user-token' || code === 'auth/null-user') {
          // Recover from stale SDK storage artifacts by clearing auth tokens and retrying once cleanly
          logAuthDiagnostic('Encountered stale storage error during sign-in, retrying with clean state', { code });
          clearStaleAuthSession({ clearFirebaseSdkStorage: true });
          try {
            await signInWithEmailAndPassword(auth, normalizedEmail, inputPassword);
          } catch (retryErr) {
            throw retryErr;
          }
        } else {
          throw signInErr;
        }
      }

      let userRef = doc(db, "users", normalizedEmail);
      let userSnap;
      try {
        userSnap = await getDoc(userRef);
      } catch (docErr) {
        handleFirestoreError(docErr, OperationType.GET, path);
        // Retry with active db after failover switch if needed
        userRef = doc(db, "users", normalizedEmail);
        try {
          userSnap = await getDoc(userRef);
        } catch (retryErr) {
          console.warn("User document fetch failed after failover:", retryErr);
        }
      }

      if (!userSnap || !userSnap.exists()) {
        // Find seeded user data if available
        const seeded = (seededUsers as any[]).find(u => u.id?.toLowerCase() === normalizedEmail || u.data?.email?.toLowerCase() === normalizedEmail);
        const seededData = seeded?.data;

        const isDefaultSuperAdmin = normalizedEmail === 'shanmugapriya@qaoncloud.com' || normalizedEmail === 'vinuta@qaoncloud.com';
        const rawName = normalizedEmail.split('@')[0];
        const formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

        const newUser: UserType = {
          email: normalizedEmail,
          name: seededData?.name || auth.currentUser?.displayName || formattedName,
          role: (seededData?.role as UserRole) || (isDefaultSuperAdmin ? UserRole.SUPER_ADMIN : UserRole.TEAM_MEMBER),
          assignedProjectIds: seededData?.assignedProjectIds || []
        };

        try {
          await syncSetDoc(userRef, { ...newUser, status: 'active', createdAt: new Date().toISOString() });
        } catch (syncErr) {
          console.warn("Failed to persist auto-provisioned profile to Firestore, proceeding with session:", syncErr);
        }

        setIsLoading(false);
        try {
          sessionStorage.setItem('automatiqa_user', JSON.stringify(newUser));
          localStorage.setItem('automatiqa_user', JSON.stringify(newUser));
        } catch (e) {}
        logAuthDiagnostic('Login succeeded with auto-provisioned user', { email: normalizedEmail, role: newUser.role });
        onLogin(newUser);
        return;
      }

      const userData = userSnap.data() as UserType;
      setIsLoading(false);
      try {
        sessionStorage.setItem('automatiqa_user', JSON.stringify(userData));
        localStorage.setItem('automatiqa_user', JSON.stringify(userData));
      } catch (e) {}
      logAuthDiagnostic('Login succeeded with existing profile', { email: normalizedEmail, role: userData.role });
      onLogin(userData);
    } catch (err: any) {
      logAuthDiagnostic('Login error encountered', { code: err.code, message: err.message });
      if (err.code) {
        const code = err.code || '';
        const message = err.message || '';
        if (code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || message.includes('auth/invalid-credential') || message.includes('invalid-credential')) {
          setError("Invalid email or password credentials.");
        } else if (code === 'auth/too-many-requests') {
          setError("Access temporarily blocked due to multiple failed attempts. Please try again later.");
        } else if (code === 'auth/network-request-failed') {
          setError("Network error: Verification services are unreachable. Please check your connection.");
        } else {
          setError("Authentication failed. Please check your credentials.");
        }
      } else {
        handleFirestoreError(err, OperationType.GET, path);
        setError("Authentication failed. Please try again.");
      }
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    setError("");
    setSuccessMsg("");
    setResetLink("");

    const inputEmail = email.trim();

    if (!inputEmail) {
      setError("Please enter your registered email.");
      return;
    }

    if (/[A-Z]/.test(inputEmail)) {
      setError("Uppercase letters are not accepted in the email field. Please use lowercase letters only.");
      return;
    }

    const normalizedEmail = inputEmail.toLowerCase();

    setIsLoading(true);

    try {
      await sendPasswordResetEmail(auth, normalizedEmail);

      // Attempt to retrieve a direct password reset link from the backend
      // to display as a reliable corporate firewall bypass backup option
      try {
        const linkRes = await fetch('/api/auth/reset-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: normalizedEmail })
        });
        const parsed = await parseApiResponse(linkRes);
        if (parsed.ok && parsed.data?.resetLink) {
          setResetLink(parsed.data.resetLink);
        }
      } catch (linkErr) {
        console.warn("Could not retrieve secure recovery bypass link:", linkErr);
      }

      setSuccessMsg(
        "Automatiqa Apps password reset email sent successfully. Please check your inbox."
      );
    } catch (err: any) {
      if (err.code === "auth/user-not-found") {
        setError("No account exists with this email.");
      } else if (err.code === "auth/invalid-email") {
        setError("Invalid email address.");
      } else {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };  // Shared input class — matching requested format
  const labelClass = "text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1";
  const iconClass = "absolute left-4 top-1/2 -translate-y-1/2 text-slate-400";

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#eef4f6] font-sans">
      <div className="w-full max-w-[460px] bg-white rounded-[2.5rem] overflow-hidden shadow-[0_20px_60px_rgba(15,23,42,0.06)] border border-slate-100 relative z-10 flex flex-col">
        
        {/* ── LOGIN VIEW ── */}
        {view === 'login' && (
          <form onSubmit={handleLogin} className="flex flex-col">
            {/* Upper white section */}
            <div className="p-8 md:p-10 bg-white flex flex-col gap-6">
              
              {/* Header block with stacked logo (symbol on top) and badge */}
              <div className="flex flex-col items-center justify-center text-center w-full gap-3 mb-2">
                <AutomatiqaLogo variant="stacked" size="md" showTagline={true} />
                <div className="flex items-center gap-1.5 px-3 py-1 bg-[#e2f1f5] rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00A896]" />
                  <span className="text-[9px] font-black text-[#00A896] uppercase tracking-wider">IDENTITY ACCESS</span>
                </div>
              </div>

              {/* Horizontal line divider */}
              <div className="w-full h-[1px] bg-slate-100" />

              {/* Error / Success Toast alerts inside top card section */}
              {error && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-xs font-semibold flex items-center gap-2.5 shadow-sm animate-in fade-in duration-200">
                  <Zap size={14} className="text-rose-500 flex-shrink-0" />
                  <span className="leading-relaxed">{error}</span>
                </div>
              )}
              {successMsg && (
                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-600 text-xs font-semibold flex items-center gap-2.5 shadow-sm animate-in fade-in duration-200">
                  <Zap size={14} className="text-emerald-500 flex-shrink-0" />
                  <span className="leading-relaxed">{successMsg}</span>
                </div>
              )}

              {/* Email Input */}
              <div className="flex flex-col gap-2">
                <label htmlFor="login-email" className={labelClass}>Registered Email</label>
                <div className="relative">
                  <Mail className={iconClass} size={16} />
                  <input 
                    id="login-email"
                    name="username"
                    type="email" 
                    required 
                    autoComplete="username"
                    tabIndex={0}
                    value={email || ''} 
                    onChange={e => {
                      setEmail(e.target.value);
                      if (error && error.includes('Uppercase')) {
                        setError('');
                      }
                    }} 
                    className={`w-full pl-12 pr-6 py-4 bg-slate-50 border rounded-2xl text-sm font-semibold text-slate-700 placeholder-slate-400 outline-none transition-all shadow-sm ${
                      email && /[A-Z]/.test(email)
                        ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/20 focus:border-rose-500 bg-rose-50/20'
                        : 'border-slate-200 focus:ring-2 focus:ring-[#00A896]/20 focus:border-[#00A896] focus:bg-white'
                    }`}
                    placeholder="name@company.com" 
                    aria-invalid={Boolean(email && /[A-Z]/.test(email))}
                    aria-describedby={email && /[A-Z]/.test(email) ? "login-email-error" : undefined}
                  />
                </div>
                {email && /[A-Z]/.test(email) && (
                  <p id="login-email-error" className="text-xs text-rose-500 font-semibold flex items-center gap-1.5 ml-1 animate-in fade-in duration-150">
                    <Zap size={13} className="text-rose-500 flex-shrink-0" />
                    <span>Uppercase letters are not accepted in the Email field.</span>
                  </p>
                )}
              </div>

              {/* Password Input */}
              <div className="flex flex-col gap-2">
                <label htmlFor="login-password" className={labelClass}>Password</label>
                <div className="relative">
                  <Lock className={iconClass} size={16} />
                  <input 
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'} 
                    required 
                    autoComplete="current-password"
                    tabIndex={0}
                    value={password || ''} 
                    onChange={e => setPassword(e.target.value)} 
                    className="w-full pl-12 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-[#00A896]/20 focus:border-[#00A896] focus:bg-white transition-all shadow-sm" 
                    placeholder="••••••••" 
                  />
                  <button 
                    type="button" 
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword(!showPassword)} 
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-all cursor-pointer p-1"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

            </div>

            {/* Lower dark navy section */}
            <div className="px-8 py-10 md:px-10 md:py-10 bg-[#0a0e1a] flex flex-col gap-5">
              <button 
                type="submit" 
                disabled={isLoading} 
                className="w-full py-4 bg-[#00dfc2] hover:bg-[#00c5ac] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] text-[#0a0e1a] rounded-2xl font-black text-xs uppercase tracking-widest border-none cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-[#00dfc2]/20 transition-all"
              >
                {isLoading ? (
                  <Loader2 size={16} className="animate-spin text-[#0a0e1a]" />
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>

              <div className="flex items-center justify-between w-full mt-2">
                <button 
                  type="button" 
                  onClick={() => switchView('forgot-password')} 
                  className="text-slate-400 hover:text-slate-300 font-bold text-[10px] uppercase tracking-wider bg-transparent border-none cursor-pointer transition-colors"
                >
                  Forgot Password?
                </button>
                <button 
                  type="button" 
                  onClick={() => switchView('signup')} 
                  className="text-[#00dfc2] hover:text-[#00c5ac] font-bold text-[10px] uppercase tracking-wider bg-transparent border-none cursor-pointer transition-colors"
                >
                  Create Account
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ── SIGNUP VIEW ── */}
        {view === 'signup' && (
          <form onSubmit={handleSignup} className="flex flex-col">
            {/* Upper white section */}
            <div className="p-8 md:p-10 bg-white flex flex-col gap-5">
              
              {/* Header block with stacked logo (symbol on top) and badge */}
              <div className="flex flex-col items-center justify-center text-center w-full gap-3 mb-2">
                <AutomatiqaLogo variant="stacked" size="md" showTagline={true} />
                <div className="flex items-center gap-1.5 px-3 py-1 bg-[#e2f1f5] rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00A896]" />
                  <span className="text-[9px] font-black text-[#00A896] uppercase tracking-wider">ONBOARDING</span>
                </div>
              </div>

              {/* Horizontal line divider */}
              <div className="w-full h-[1px] bg-slate-100" />

              {/* Error / Success messages */}
              {error && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-xs font-semibold flex items-center gap-2.5 shadow-sm animate-in fade-in duration-200">
                  <Zap size={14} className="text-rose-500 flex-shrink-0" />
                  <span className="leading-relaxed">{error}</span>
                </div>
              )}
              {successMsg && (
                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-600 text-xs font-semibold flex items-center gap-2.5 shadow-sm animate-in fade-in duration-200">
                  <Zap size={14} className="text-emerald-500 flex-shrink-0" />
                  <span className="leading-relaxed">{successMsg}</span>
                </div>
              )}

              {/* Full Name Input */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="signup-name" className={labelClass}>Full Name</label>
                <div className="relative">
                  <User className={iconClass} size={16} />
                  <input 
                    id="signup-name"
                    name="name"
                    type="text" 
                    required 
                    tabIndex={0}
                    value={name || ''} 
                    onChange={e => setName(e.target.value)} 
                    className="w-full pl-12 pr-6 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-[#00A896]/20 focus:border-[#00A896] focus:bg-white transition-all shadow-sm" 
                    placeholder="John Doe" 
                  />
                </div>
              </div>

              {/* Workspace Email Input */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="signup-email" className={labelClass}>Workspace Email</label>
                <div className="relative">
                  <Mail className={iconClass} size={16} />
                  <input 
                    id="signup-email"
                    name="email"
                    type="email" 
                    required 
                    tabIndex={0}
                    autoComplete="email"
                    value={email || ''} 
                    onChange={e => setEmail(e.target.value)} 
                    className="w-full pl-12 pr-6 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-[#00A896]/20 focus:border-[#00A896] focus:bg-white transition-all shadow-sm" 
                    placeholder="name@company.com" 
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="signup-password" className={labelClass}>Set Password</label>
                <div className="relative">
                  <Lock className={iconClass} size={16} />
                  <input 
                    id="signup-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'} 
                    required 
                    tabIndex={0}
                    autoComplete="new-password"
                    value={password || ''} 
                    onChange={e => setPassword(e.target.value)} 
                    className="w-full pl-12 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-[#00A896]/20 focus:border-[#00A896] focus:bg-white transition-all shadow-sm" 
                    placeholder="••••••••" 
                  />
                  <button 
                    type="button" 
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword(!showPassword)} 
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-all cursor-pointer p-1"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Verify Password Input */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="signup-confirm-password" className={labelClass}>Verify Password</label>
                <div className="relative">
                  <ShieldCheck className={iconClass} size={16} />
                  <input 
                    id="signup-confirm-password"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'} 
                    required 
                    tabIndex={0}
                    autoComplete="new-password"
                    value={confirmPassword || ''} 
                    onChange={e => setConfirmPassword(e.target.value)} 
                    className="w-full pl-12 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-[#00A896]/20 focus:border-[#00A896] focus:bg-white transition-all shadow-sm" 
                    placeholder="••••••••" 
                  />
                  <button 
                    type="button" 
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)} 
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-all cursor-pointer p-1"
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

            </div>

            {/* Lower dark navy section */}
            <div className="px-8 py-10 md:px-10 md:py-10 bg-[#0a0e1a] flex flex-col gap-5">
              <button 
                type="submit" 
                disabled={isLoading} 
                className="w-full py-4 bg-[#00dfc2] hover:bg-[#00c5ac] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] text-[#0a0e1a] rounded-2xl font-black text-xs uppercase tracking-widest border-none cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-[#00dfc2]/20 transition-all"
              >
                {isLoading ? (
                  <Loader2 size={16} className="animate-spin text-[#0a0e1a]" />
                ) : (
                  <>
                    <span>Create Account</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>

              <div className="flex items-center justify-between w-full mt-2">
                <span className="text-slate-500 font-bold text-[10px] uppercase tracking-wider">Already joined?</span>
                <button 
                  type="button" 
                  onClick={() => switchView('login')} 
                  className="text-[#00dfc2] hover:text-[#00c5ac] font-bold text-[10px] uppercase tracking-wider bg-transparent border-none cursor-pointer transition-colors"
                >
                  Sign In
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ── FORGOT PASSWORD VIEW ── */}
        {view === 'forgot-password' && (
          <form onSubmit={handleForgotPassword} className="flex flex-col">
            {/* Upper white section */}
            <div className="p-8 md:p-10 bg-white flex flex-col gap-6">
              
              {/* Header block with stacked logo (symbol on top) and badge */}
              <div className="flex flex-col items-center justify-center text-center w-full gap-3 mb-2">
                <AutomatiqaLogo variant="stacked" size="md" showTagline={true} />
                <div className="flex items-center gap-1.5 px-3 py-1 bg-[#e2f1f5] rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00A896]" />
                  <span className="text-[9px] font-black text-[#00A896] uppercase tracking-wider">RECOVERY</span>
                </div>
              </div>

              {/* Horizontal line divider */}
              <div className="w-full h-[1px] bg-slate-100" />

              {/* Warning/info text */}
              <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl text-indigo-700 text-xs font-semibold leading-relaxed shadow-sm">
                Enter your email address below and we'll send you an Automatiqa Apps recovery link.
              </div>

              {/* Error / Success messages */}
              {error && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-xs font-semibold flex items-center gap-2.5 shadow-sm animate-in fade-in duration-200">
                  <Zap size={14} className="text-rose-500 flex-shrink-0" />
                  <span className="leading-relaxed">{error}</span>
                </div>
              )}
              {successMsg && (
                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-600 text-xs font-semibold flex items-center gap-2.5 shadow-sm animate-in fade-in duration-200">
                  <Zap size={14} className="text-emerald-500 flex-shrink-0" />
                  <span className="leading-relaxed">{successMsg}</span>
                </div>
              )}

              {/* Recovery Email Input */}
              <div className="flex flex-col gap-2">
                <label htmlFor="forgot-email" className={labelClass}>Recovery Email</label>
                <div className="relative">
                  <Mail className={iconClass} size={16} />
                  <input 
                    id="forgot-email"
                    name="email"
                    type="email" 
                    required 
                    tabIndex={0}
                    autoComplete="email"
                    value={email || ''} 
                    onChange={e => {
                      setEmail(e.target.value);
                      if (error && error.includes('Uppercase')) {
                        setError('');
                      }
                    }} 
                    className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-[#00A896]/20 focus:border-[#00A896] focus:bg-white transition-all shadow-sm" 
                    placeholder="name@company.com" 
                  />
                </div>
              </div>

              {/* Direct recovery secure link for qaoncloud delivery bypass */}
              {resetLink && (
                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex flex-col gap-3 shadow-sm animate-in fade-in duration-200">
                  <p className="text-xs text-emerald-700 font-semibold leading-relaxed">
                    ℹ️ <strong>Delivery Warning:</strong> Corporate email firewalls (such as <strong>qaoncloud.com</strong>) often completely block emails from sandbox domains (<em>automatiqa.firebaseapp.com</em>).
                  </p>
                  <p className="text-xs text-slate-600 font-medium leading-relaxed">
                    To guarantee you are not blocked, click the direct secure recovery link below to reset your password immediately:
                  </p>
                  <a 
                    href={resetLink} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="block w-full text-center py-3 bg-[#00dfc2] hover:bg-[#00c5ac] text-[#0a0e1a] rounded-xl font-black text-xs uppercase tracking-widest text-decoration-none shadow-md transition-all"
                  >
                    Reset Password Now (Automatiqa Apps)
                  </a>
                </div>
              )}

            </div>

            {/* Lower dark navy section */}
            <div className="px-8 py-10 md:px-10 md:py-10 bg-[#0a0e1a] flex flex-col gap-5">
              <button 
                type="submit" 
                disabled={isLoading} 
                className="w-full py-4 bg-[#00dfc2] hover:bg-[#00c5ac] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] text-[#0a0e1a] rounded-2xl font-black text-xs uppercase tracking-widest border-none cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-[#00dfc2]/20 transition-all"
              >
                {isLoading ? (
                  <Loader2 size={16} className="animate-spin text-[#0a0e1a]" />
                ) : (
                  <span>Send Email</span>
                )}
              </button>

              <div className="flex items-center justify-between w-full mt-2">
                <span className="text-slate-500 font-bold text-[10px] uppercase tracking-wider">Remembered password?</span>
                <button 
                  type="button" 
                  onClick={() => switchView('login')} 
                  className="text-[#00dfc2] hover:text-[#00c5ac] font-bold text-[10px] uppercase tracking-wider bg-transparent border-none cursor-pointer transition-colors"
                >
                  Back to Sign In
                </button>
              </div>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};

export default Auth;