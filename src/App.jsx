import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import './App.css';

const emptyProfile = {
  display_name: '',
  campus: '',
  course: '',
  year_of_study: '',
  bio: '',
  interests: '',
  is_discoverable: false,
};

const gradients = [
  'linear-gradient(145deg, #ff9aaf, #a66cff)',
  'linear-gradient(145deg, #7c9cff, #c38bff)',
  'linear-gradient(145deg, #ffbd83, #ff79b7)',
  'linear-gradient(145deg, #72d6c9, #7c9cff)',
];

const emojis = ['🌷', '🦋', '🌙', '✨'];

function displayInterests(interests) {
  if (Array.isArray(interests)) return interests;
  if (typeof interests === 'string') {
    return interests.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const [activeTab, setActiveTab] = useState('Discover');
  const [profiles, setProfiles] = useState([]);
  const [actions, setActions] = useState({});
  const [index, setIndex] = useState(0);
  const [notice, setNotice] = useState('');
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const [profileForm, setProfileForm] = useState(emptyProfile);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileEditMessage, setProfileEditMessage] = useState('');

  // Restore the signed-in session and listen for login/logout changes.
  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error) setMessage(error.message);
      setSession(data?.session ?? null);
      setLoading(false);
    }

    restoreSession();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // Load the signed-in user's own profile.
  useEffect(() => {
    if (!session) {
      setProfileForm(emptyProfile);
      setProfiles([]);
      setActions({});
      setIndex(0);
      setProfileEditMessage('');
      return undefined;
    }

    let cancelled = false;

    async function loadProfile() {
      setProfileLoading(true);
      setProfileEditMessage('');

      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, campus, course, year_of_study, bio, interests, is_discoverable')
        .eq('id', session.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error('Profile load error:', error);
        setProfileEditMessage(`Could not load profile: ${error.message}`);
        setProfileForm({
          ...emptyProfile,
          display_name: session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || '',
        });
      } else if (data) {
        setProfileForm({
          display_name: data.display_name || '',
          campus: data.campus || '',
          course: data.course || '',
          year_of_study: data.year_of_study || '',
          bio: data.bio || '',
          interests: Array.isArray(data.interests) ? data.interests.join(', ') : '',
          is_discoverable: data.is_discoverable === true,
        });
      } else {
        setProfileForm({
          ...emptyProfile,
          display_name: session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || '',
        });
      }

      setProfileLoading(false);
    }

    loadProfile();
    return () => { cancelled = true; };
  }, [session]);

  // Load real profiles and this user's saved Like/Pass decisions.
  useEffect(() => {
    if (!session) return undefined;

    let cancelled = false;

    async function loadDiscovery() {
      setDiscoverLoading(true);
      setNotice('');

      const [{ data: profileRows, error: profilesError }, { data: actionRows, error: actionsError }] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, display_name, campus, course, year_of_study, bio, interests, photo_url')
          .eq('is_discoverable', true)
          .neq('id', session.user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('profile_actions')
          .select('target_id, action')
          .eq('actor_id', session.user.id),
      ]);

      if (cancelled) return;

      if (profilesError) {
        console.error('Discover profiles error:', profilesError);
        setNotice(`Could not load campus profiles: ${profilesError.message}`);
        setProfiles([]);
        setActions({});
      } else if (actionsError) {
        console.error('Profile actions error:', actionsError);
        setNotice(`Could not load your saved Likes and Passes: ${actionsError.message}`);
        setProfiles(profileRows || []);
        setActions({});
      } else {
        const nextActions = {};
        (actionRows || []).forEach((row) => {
          nextActions[row.target_id] = row.action;
        });
        setActions(nextActions);
        setProfiles(profileRows || []);
        setIndex(0);
      }

      setDiscoverLoading(false);
    }

    loadDiscovery();
    return () => { cancelled = true; };
  }, [session]);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage('');

    if (mode === 'signup' && !name.trim()) {
      setMessage('Please enter your name.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() } },
        });
        if (error) throw error;

        setMessage(data.session
          ? 'Account created successfully!'
          : 'Account created. Check your email to confirm your address before logging in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (error) {
      setMessage(error.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveProfile(event) {
    event.preventDefault();
    setProfileEditMessage('');

    if (!session) {
      setProfileEditMessage('Please sign in again before saving your profile.');
      return;
    }
    if (!profileForm.display_name.trim()) {
      setProfileEditMessage('Please enter your display name.');
      return;
    }

    setProfileSaving(true);
    try {
      const { error } = await supabase.from('profiles').upsert({
        id: session.user.id,
        display_name: profileForm.display_name.trim(),
        campus: profileForm.campus.trim() || null,
        course: profileForm.course.trim() || null,
        year_of_study: profileForm.year_of_study || null,
        bio: profileForm.bio.trim() || null,
        interests: profileForm.interests.split(',').map((item) => item.trim()).filter(Boolean),
        is_discoverable: profileForm.is_discoverable,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      if (error) throw error;
      setProfileEditMessage('Your profile was saved successfully! 💜');
    } catch (error) {
      console.error('Profile save error:', error);
      setProfileEditMessage(`Could not save profile: ${error.message || 'Please try again.'}`);
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleProfileAction(action) {
    const current = profiles[index];
    if (!current || !session || actionBusy) return;

    if (current.id === session.user.id) {
      setNotice('You cannot Like or Pass on your own profile.');
      return;
    }

    setActionBusy(true);
    setNotice('');

    try {
      const { error } = await supabase.from('profile_actions').upsert({
        actor_id: session.user.id,
        target_id: current.id,
        action,
      }, { onConflict: 'actor_id,target_id' });

      if (error) throw error;

      setActions((previous) => ({ ...previous, [current.id]: action }));
      setNotice(action === 'like'
        ? `You liked ${current.display_name || 'this profile'}! 💗 Your Like was saved.`
        : `You passed on ${current.display_name || 'this profile'}. Your choice was saved.`);

      // The saved action removes this profile from the available deck.
      setIndex(0);
    } catch (error) {
      console.error('Could not save profile action:', error);
      setNotice(`Could not save your ${action === 'like' ? 'Like' : 'Pass'}: ${error.message || 'Please try again.'}`);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) setMessage(error.message);
    else {
      setActiveTab('Discover');
      setMessage('You have signed out.');
    }
  }

  function nextProfile() {
    if (profiles.length < 1) return;
    setIndex((current) => (current + 1) % profiles.length);
    setNotice('');
  }

  async function openLikes() {
    setActiveTab('Likes');
    setNotice('');
  }

  if (loading) {
    return <main className="auth-page"><p>Loading Campus Chemistry...</p></main>;
  }

  if (!session) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="auth-brand">💜 Campus Chemistry</div>
          <p className="auth-eyebrow">SAME CAMPUS. DIFFERENT CHEMISTRY.</p>
          <h1>{mode === 'signup' ? 'Meet your kind of person.' : 'Welcome back.'}</h1>
          <p className="auth-description">
            {mode === 'signup' ? 'Create an account to get started.' : 'Sign in to continue your journey.'}
          </p>

          <div className="auth-tabs">
            <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setMessage(''); }}>Sign up</button>
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setMessage(''); }}>Log in</button>
          </div>

          <form onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <label>Your name
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter your name" autoComplete="name" maxLength={60} required />
              </label>
            )}
            <label>Email address
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required />
            </label>
            <label>Password
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} required />
            </label>
            {message && <p className="auth-message" role="status">{message}</p>}
            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? 'Please wait...' : mode === 'signup' ? 'Create account →' : 'Log in →'}
            </button>
          </form>
          <p className="auth-terms">By continuing, you agree to use Campus Chemistry respectfully and safely.</p>
        </section>
      </main>
    );
  }

  const availableProfiles = profiles.filter((profile) => !actions[profile.id]);
  const currentProfile = availableProfiles.length
    ? availableProfiles[Math.min(index, availableProfiles.length - 1)]
    : null;

  const likedProfiles = profiles.filter((profile) => actions[profile.id] === 'like');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home">
          <span className="brand-icon">♡</span>
          <span>campus<span className="brand-accent">chemistry</span></span>
        </a>
        <div className="campus-label">YOUR CAMPUS ERA</div>
        <nav className="navigation">
          { [['Discover', '✳️'], ['Likes', '♡'], ['Messages', '▤'], ['My Profile', '◉']].map(([label, icon]) => (
            <button key={label} className={`nav-item ${activeTab === label ? 'active' : ''}`} onClick={() => { if (label === 'Likes') openLikes(); else { setActiveTab(label); setNotice(''); } }}>
              <span>{icon}</span>{label}
              {label === 'Likes' && likedProfiles.length > 0 && <span className="nav-count">{likedProfiles.length}</span>}
            </button>
          )) }
        </nav>
        <div className="sidebar-bottom">
          <div className="safety-note"><span>🛡️</span><strong>Your safety matters</strong><p>Real connections. Mutual respect.</p></div>
          <div className="demo-label">SUPABASE-POWERED PREVIEW</div>
          <button className="nav-item" type="button" onClick={handleLogout}>↪ Sign out</button>
        </div>
      </aside>

      <main className="main-content" id="home">
        <header className="topbar">
          <div>
            <div className="eyebrow">YOUR PEOPLE ARE OUT THERE</div>
            <h1>Find your <span>chemistry.</span></h1>
            <p className="subtitle">Meet someone new. Start a beautiful plot twist.</p>
          </div>
          <div className="top-pill"><span className="status-dot" />Campus discovery</div>
        </header>

        {notice && <div className="notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Dismiss notice">×</button></div>}

        {activeTab === 'Discover' ? (
          <section className="discovery-layout">
            <div className="profile-column">
              <div className="section-heading">
                <div><span className="eyebrow">THE VIBE DECK</span><h2>Someone worth meeting.</h2></div>
                <span className="counter-label">{discoverLoading ? 'Loading…' : availableProfiles.length ? `${Math.min(index + 1, availableProfiles.length)} / ${availableProfiles.length}` : '0 profiles'}</span>
              </div>

              {discoverLoading ? (
                <article className="profile-card"><div className="profile-details"><p>Loading campus profiles...</p></div></article>
              ) : currentProfile ? (
                <article className="profile-card">
                  <div className="profile-art" style={{ background: gradients[index % gradients.length] }}>
                    <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
                    {currentProfile.photo_url
                      ? <img src={currentProfile.photo_url} alt={`${currentProfile.display_name || 'Campus'} profile`} className="profile-photo" />
                      : <span className="profile-emoji">{emojis[index % emojis.length]}</span>}
                    <span className="art-sticker">YOUR NEXT<br />PLOT TWIST?</span>
                    <span className="art-caption">CAMPUS CHEMISTRY ✦</span>
                    <div className="profile-identity">
                      <span className="verified-tag">✦ CAMPUS PROFILE</span>
                      <h2>{currentProfile.display_name || 'Campus student'}</h2>
                      <p>{[currentProfile.course, currentProfile.year_of_study].filter(Boolean).join(' · ') || 'Add your study details'}</p>
                    </div>
                  </div>
                  <div className="profile-details">
                    {currentProfile.campus && <p className="bio">{currentProfile.campus}</p>}
                    <p className="bio">{currentProfile.bio || 'This student has not added a bio yet.'}</p>
                    <div className="interest-list">
                      {displayInterests(currentProfile.interests).map((interest) => <span className="interest-tag" key={interest}>{interest}</span>)}
                    </div>
                    <div className="profile-actions">
                      <button type="button" className="pass-button" onClick={() => handleProfileAction('pass')} disabled={actionBusy}>×</button>
                      <button type="button" className="like-button" onClick={() => handleProfileAction('like')} disabled={actionBusy}><span>♡</span> {actionBusy ? 'Saving…' : 'Like'}</button>
                    </div>
                    <p className="mutual-note">💌 Matches can happen when two people Like each other.</p>
                  </div>
                </article>
              ) : (
                <section className="empty-state">
                  <span>💜</span>
                  <h2>You're all caught up!</h2>
                  <p>
                    {profiles.length === 0
                      ? 'No other campus profiles are available yet. Once other students create profiles, they can appear here.'
                      : 'You have already Liked or Passed on every available profile.'}
                  </p>
                  <button type="button" className="like-button" onClick={() => setActiveTab('My Profile')}>View My Profile</button>
                </section>
              )}

              <div className="deck-footer"><span>✦ GOOD VIBES ONLY</span><button type="button" onClick={nextProfile} disabled={availableProfiles.length < 2}>Next profile ↗️</button></div>
            </div>
            <aside className="side-column">
              <section className="welcome-card"><span className="welcome-emoji">💘</span><span className="eyebrow">A LITTLE REMINDER</span><h3>Love your own plot.</h3><p>No pressure, no games. Just discover people and see where the chemistry goes.</p><div className="sparkle-decoration">✳️</div></section>
              <section className="prompt-card"><span className="eyebrow">BREAK THE ICE</span><h3>Skip the boring “hey”.</h3><p>What's your ideal first date?</p><div className="date-ideas"><span>☕ Coffee & chaos</span><span>🌇 Sunset walk</span><span>🎮 Games & laughs</span></div></section>
              <section className="privacy-card"><span>🔒</span><div><strong>Privacy first.</strong><p>Your information should stay yours.</p></div></section>
            </aside>
          </section>
        ) : activeTab === 'My Profile' ? (
          <section className="empty-state profile-page">
            <span>💜</span>
            <h2>My Profile</h2>
            <p>Tell your campus community a little about yourself.</p>
            {profileLoading ? <p>Loading your profile...</p> : (
              <form onSubmit={handleSaveProfile} className="profile-form">
                <label>Display name *<input value={profileForm.display_name} onChange={(event) => setProfileForm({ ...profileForm, display_name: event.target.value })} maxLength={60} required placeholder="Your name" /></label>
                <label>Campus / college<input value={profileForm.campus} onChange={(event) => setProfileForm({ ...profileForm, campus: event.target.value })} placeholder="Your college or university" maxLength={120} /></label>
                <label>Course<input value={profileForm.course} onChange={(event) => setProfileForm({ ...profileForm, course: event.target.value })} placeholder="e.g. B.Tech Computer Science" maxLength={120} /></label>
                <label>Year of study<select value={profileForm.year_of_study} onChange={(event) => setProfileForm({ ...profileForm, year_of_study: event.target.value })}><option value="">Choose your year</option><option value="1st year">1st year</option><option value="2nd year">2nd year</option><option value="3rd year">3rd year</option><option value="4th year">4th year</option><option value="Postgraduate">Postgraduate</option><option value="Other">Other</option></select></label>
                <label>About me<textarea value={profileForm.bio} onChange={(event) => setProfileForm({ ...profileForm, bio: event.target.value })} placeholder="Share a little about yourself..." maxLength={500} rows={4} /></label>
                <label>Interests (separate with commas)<input value={profileForm.interests} onChange={(event) => setProfileForm({ ...profileForm, interests: event.target.value })} placeholder="Music, coding, travel" maxLength={250} /></label>
                <label className="discoverable-option"><input type="checkbox" checked={profileForm.is_discoverable} onChange={(event) => setProfileForm({ ...profileForm, is_discoverable: event.target.checked })} /> Show my profile to signed-in campus users</label>
                <p className="auth-description">Your profile appears in Discover only if you turn this on. Signed in as {session.user.email}</p>
                {profileEditMessage && <p className="auth-message" role="status">{profileEditMessage}</p>}
                <button className="auth-submit" type="submit" disabled={profileSaving || profileLoading}>{profileSaving ? 'Saving...' : 'Save profile 💜'}</button>
              </form>
            )}
            <button type="button" className="like-button" onClick={() => setActiveTab('Discover')}>Back to Discover</button>
          </section>
        ) : activeTab === 'Likes' ? (
          <section className="empty-state">
            <span>♡</span>
            <h2>Your Likes</h2>
            {likedProfiles.length ? (
              <div className="interest-list">
                {likedProfiles.map((profile) => (
                  <span className="interest-tag" key={profile.id}>{profile.display_name || 'Campus student'}</span>
                ))}
              </div>
            ) : (
              <p>Your saved Likes will appear here when you Like campus profiles.</p>
            )}
            <button type="button" className="like-button" onClick={() => setActiveTab('Discover')}>Back to Discover</button>
          </section>
        ) : (
          <section className="empty-state"><span>✦</span><h2>Messages</h2><p>Messaging will be added in a future version.</p><button type="button" className="like-button" onClick={() => setActiveTab('Discover')}>Back to Discover</button></section>
        )}

        <footer className="page-footer"><span>MADE FOR CONNECTIONS ✦ NOT COMPLICATIONS</span><span>Campus Chemistry · Early concept</span></footer>
      </main>
    </div>
  );
}
