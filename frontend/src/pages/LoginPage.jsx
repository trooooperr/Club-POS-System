import React, { useState, useEffect } from 'react';
import { useApp, ROLE_HIERARCHY } from '../context/AppContext';
import { Lock, User, ShieldCheck, Mail, ArrowLeft, KeyRound } from 'lucide-react';

const RC = { admin:'#F59E0B', manager:'#3B82F6', staff:'#10B981' };

export default function LoginPage() {
  const { login, forgotPassword, resetPassword, settings } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow]         = useState(false);
  const [error, setError]       = useState('');
  const [busy,  setBusy]        = useState(false);


  // Forgot password states
  const [fpMode, setFpMode]     = useState(null); // null | 'email' | 'otp' | 'done'
  const [fpEmail, setFpEmail]   = useState('');
  const [fpOtp, setFpOtp]       = useState('');
  const [fpNewPwd, setFpNewPwd] = useState('');
  const [fpError, setFpError]   = useState('');
  const [fpBusy, setFpBusy]     = useState(false);
  const [fpMsg, setFpMsg]       = useState('');


  const submit = async e => {
    e.preventDefault();
    setError(''); setBusy(true);
    const r = await login(username.trim(), password);
    setBusy(false);
    if (r.error) setError(r.error);
  };

  const quick = (u, p) => { setUsername(u); setPassword(p); setError(''); };

  // ── Forgot Password Handlers ──────────────────────────────────
  const handleSendOtp = async () => {
    if (!fpEmail.trim()) { setFpError('Enter your email'); return; }
    setFpBusy(true); setFpError('');
    const r = await forgotPassword(fpEmail.trim());
    setFpBusy(false);
    if (r.error) { setFpError(r.error); return; }
    setFpMsg(`Verification code sent to the Owner's email`);
    setFpMode('otp');
  };

  const handleResetPwd = async () => {
    if (!fpOtp.trim()) { setFpError('Enter the OTP'); return; }
    if (fpNewPwd.length < 6) { setFpError('Password must be at least 6 characters'); return; }
    setFpBusy(true); setFpError('');
    const r = await resetPassword(fpEmail.trim(), fpOtp.trim(), fpNewPwd);
    setFpBusy(false);
    if (r.error) { setFpError(r.error); return; }
    setFpMode('done');
  };

  const closeFP = () => {
    setFpMode(null); setFpEmail(''); setFpOtp(''); setFpNewPwd(''); setFpError(''); setFpMsg('');
  };

  // ── Forgot Password UI ────────────────────────────────────────
  if (fpMode) {
    return (
      <div className="lpage">
        <div className="lcard fi">
          <div className="llogo">
            <img src="/favicon.ico" alt="Logo" className="llogo-img" />
          <div className="ltitle">{settings.restaurantName || 'HUMTUM Billing System'}</div>
            <div className="lsub">
              {fpMode === 'done' ? '✓ Password Reset!' : fpMode === 'otp' ? 'Enter Verification Code' : 'Account Recovery'}
            </div>
          </div>

          {fpMode === 'email' && (
            <>
              <div style={{ marginBottom: 20 }}>
                <div style={{ 
                  background: 'rgba(245,158,11,0.05)', 
                  border: '1px solid rgba(245,158,11,0.2)', 
                  borderRadius: 12, 
                  padding: '26px', 
                  marginBottom: 20, 
                  textAlign: 'center' 
                }}>
                  <ShieldCheck size={24} style={{ color: 'var(--a)', marginBottom: 8 }}/>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t0)', marginBottom: 4 }}>
                    Admin Authorization
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.5 }}>
                    Resetting a <strong>Team Password</strong> requires a verification code sent to the registered <strong>Owner's Email</strong>.
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button 
                    type="button" 
                    className={`btn ${fpEmail === 'admin_account' ? 'btn-primary' : 'btn-ghost'}`} 
                    style={{ width: '100%', justifyContent: 'flex-start', height: 48, padding: '0 16px' }}
                    onClick={() => { setFpEmail('admin_account'); setFpError(''); }}
                  >
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ width:32, height:32, borderRadius:8, background:'rgba(245,158,11,0.1)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--a)' }}>
                        <Lock size={18}/>
                      </div>
                      <div style={{ textAlign:'left' }}>
                        <div style={{ fontSize:13, fontWeight:700 }}>Owner Account</div>
                        <div style={{ fontSize:10, opacity:0.6 }}>Reset Primary Admin</div>
                      </div>
                    </div>
                  </button>

                  <button 
                    type="button" 
                    className={`btn ${fpEmail === 'manager_team' ? 'btn-primary' : 'btn-ghost'}`} 
                    style={{ width: '100%', justifyContent: 'flex-start', height: 48, padding: '0 16px' }}
                    onClick={() => { setFpEmail('manager_team'); setFpError(''); }}
                  >
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ width:32, height:32, borderRadius:8, background:'rgba(59,130,246,0.1)', display:'flex', alignItems:'center', justifyContent:'center', color:'#3B82F6' }}>
                        <ShieldCheck size={18}/>
                      </div>
                      <div style={{ textAlign:'left' }}>
                        <div style={{ fontSize:13, fontWeight:700 }}>Manager Account</div>
                        <div style={{ fontSize:10, opacity:0.6 }}>Reset Manager Access</div>
                      </div>
                    </div>
                  </button>

                  <button 
                    type="button" 
                    className={`btn ${fpEmail === 'staff_team' ? 'btn-primary' : 'btn-ghost'}`} 
                    style={{ width: '100%', justifyContent: 'flex-start', height: 48, padding: '0 16px' }}
                    onClick={() => { setFpEmail('staff_team'); setFpError(''); }}
                  >
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ width:32, height:32, borderRadius:8, background:'rgba(16,185,129,0.1)', display:'flex', alignItems:'center', justifyContent:'center', color:'#10B981' }}>
                        <User size={18}/>
                      </div>
                      <div style={{ textAlign:'left' }}>
                        <div style={{ fontSize:13, fontWeight:700 }}>All Staff (Team)</div>
                        <div style={{ fontSize:10, opacity:0.6 }}>Reset Staff Access</div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {fpError && (
                <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:7, padding:'7px 11px', fontSize:12, color:'var(--red)', marginBottom:11 }}>
                  {fpError}
                </div>
              )}

              <button 
                type="button" 
                className="btn btn-primary btn-lg" 
                style={{ 
                  width:'100%', 
                  marginTop:12, 
                  background: 'amber', 
                  color: '#000',
                  height: 50,
                  fontSize: 14,
                  fontWeight: 800,
                  boxShadow: '0 4px 15px rgba(245,158,11,0.2)'
                }} 
                disabled={fpBusy || !fpEmail} 
                onClick={handleSendOtp}
              >
                {fpBusy ? 'Sending Reset Code…' : 'Request Security Code →'}
              </button>
            </>
          )}

          {fpMode === 'otp' && (
            <>
              {fpMsg && (
                <div style={{ background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:7, padding:'7px 11px', fontSize:12, color:'var(--green)', marginBottom:11 }}>
                  {fpMsg}
                </div>
              )}
              <div className="fgroup">
                <label className="lbl">OTP Code</label>
                <div style={{ position:'relative' }}>
                  <KeyRound size={16} style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'var(--t2)' }}/>
                  <input value={fpOtp} onChange={e=>setFpOtp(e.target.value)} placeholder="6-digit OTP" maxLength={6} style={{ paddingLeft:42, letterSpacing:4, fontSize:18, textAlign:'center' }}/>
                </div>
              </div>
              <div className="fgroup">
                <label className="lbl">New Password</label>
                <div style={{ position:'relative' }}>
                  <Lock size={16} style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'var(--t2)' }}/>
                  <input type="password" value={fpNewPwd} onChange={e=>setFpNewPwd(e.target.value)} placeholder="Min 6 characters" style={{ paddingLeft:42 }}/>
                </div>
              </div>
              {fpError && (
                <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:7, padding:'7px 11px', fontSize:12, color:'var(--red)', marginBottom:11 }}>
                  {fpError}
                </div>
              )}
              <button type="button" className="btn btn-primary btn-lg" style={{ width:'100%', marginTop:2 }} disabled={fpBusy} onClick={handleResetPwd}>
                {fpBusy ? 'Resetting…' : 'Reset Password →'}
              </button>
            </>
          )}

          {fpMode === 'done' && (
            <div style={{ textAlign:'center', padding:'16px 0' }}>
              <div style={{ fontSize:38, marginBottom:8 }}>✅</div>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--green)', marginBottom:4 }}>Password Changed!</div>
              <div style={{ fontSize:12, color:'var(--t2)', marginBottom:16 }}>You can now sign in with your new password.</div>
              <button className="btn btn-primary btn-lg" style={{ width:'100%' }} onClick={closeFP}>Back to Login</button>
            </div>
          )}

          {fpMode !== 'done' && (
            <button type="button" className="btn btn-ghost" style={{ width:'100%', marginTop:12 }} onClick={closeFP}>
              <ArrowLeft size={12}/> Back to Login
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Main Login UI ─────────────────────────────────────────────
  return (
    <div className="lpage">
      <div className="lcard fi">
        {/* Brand */}
        <div className="llogo">
          <img src="/favicon.ico" alt="Logo" className="llogo-img" />
          <div className="ltitle">{settings.restaurantName || 'HUMTUM Billing System'}</div>
          <div className="lsub">Point of Sale</div>
        </div>

        {/* Accent divider */}
  

        {/* Form */}
        <form onSubmit={submit}>
          <div className="fgroup">
            <label className="lbl">Username</label>
            <div style={{ position:'relative' }}>
              <User size={16} style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'var(--t2)' }}/>
              <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Enter username" autoComplete="username" required style={{ paddingLeft:42 }}/>
            </div>
          </div>

          <div className="fgroup">
            <label className="lbl">Password</label>
            <div style={{ position:'relative' }}>
              <Lock size={16} style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'var(--t2)' }}/>
              <input type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter password" required style={{ paddingLeft:42, paddingRight:48 }}/>
              <button
                type="button"
                onClick={() => setShow(!show)}
                style={{
                  position: 'absolute',
                  right: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--t2)',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.5px'
                }}
              >
                {show ? 'HIDE' : 'SHOW'}
              </button>
            </div>
          </div>

          {/* Forgot Password Link */}
          <div style={{ textAlign:'right', marginBottom:8 }}>
            <button type="button" onClick={()=>setFpMode('email')}
              style={{ background:'none', border:'none', color:'var(--a)', fontSize:11, fontWeight:600, cursor:'pointer', padding:0 }}>
              Forgot Password?
            </button>
          </div>

          {error && (
            <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:7, padding:'7px 11px', fontSize:12, color:'var(--red)', marginBottom:11 }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-lg" style={{ width:'100%', marginTop:2 }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign In →'}
          </button>
        </form>



        <p style={{ textAlign:'center', fontSize:10, color:'rgba(255,255,255,0.3)', marginTop:12, letterSpacing:'0.04em' }}>
          © {new Date().getFullYear()} {settings.restaurantName}
        </p>
      </div>
    </div>
  );
}
