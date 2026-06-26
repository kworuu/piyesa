// auth.js — lightweight DEMO-ONLY client-side "auth" shared by login.html,
// SignUp/SignUp.html, and the main app (index.html/app.js).
//
// IMPORTANT: this is NOT real authentication. Accounts and passwords are
// stored in plain text in the browser's localStorage purely so the
// login/signup screens have something to click through for a demo/pitch.
// There is no server-side verification. Do not use this pattern in
// production — see README.md "Known limitations".

const PiyesaAuth = (() => {
  const ACCOUNTS_KEY = "piyesa_accounts";
  const SESSION_KEY = "piyesa_session";

  function getAccounts() {
    try {
      return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveAccount(email, fullName, password) {
    const accounts = getAccounts();
    accounts[email.toLowerCase()] = { fullName, password };
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  function accountExists(email) {
    return !!getAccounts()[email.toLowerCase()];
  }

  function checkCredentials(email, password) {
    const account = getAccounts()[email.toLowerCase()];
    if (!account) return { ok: false, reason: "no_account" };
    if (account.password !== password) return { ok: false, reason: "bad_password" };
    return { ok: true, fullName: account.fullName };
  }

  function startSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY));
    } catch (e) {
      return null;
    }
  }

  function endSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  // Call at the top of any page that requires a session. Redirects to
  // login if none exists. Returns the session if present.
  function requireSession(redirectTo) {
    const session = getSession();
    if (!session) {
      window.location.href = redirectTo || "/login.html";
      return null;
    }
    return session;
  }

  return {
    saveAccount,
    accountExists,
    checkCredentials,
    startSession,
    getSession,
    endSession,
    requireSession,
  };
})();
