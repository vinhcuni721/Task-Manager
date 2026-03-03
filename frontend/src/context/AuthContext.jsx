import { createContext, useContext, useEffect, useMemo, useState } from "react";

const AUTH_STORAGE_KEY = "taskflow_auth";
const ACCOUNT_STORAGE_KEY = "taskflow_accounts";
const MAX_STORED_ACCOUNTS = 8;

const AuthContext = createContext(null);

function normalizeAuth(rawAuth) {
  if (!rawAuth?.token || !rawAuth?.user) return null;
  return {
    token: String(rawAuth.token),
    user: rawAuth.user,
  };
}

function getAccountId(user, token = "") {
  const email = String(user?.email || "")
    .trim()
    .toLowerCase();
  if (email) return `email:${email}`;

  const numericId = Number(user?.id);
  if (Number.isInteger(numericId) && numericId > 0) {
    return `id:${numericId}`;
  }

  if (token) {
    return `token:${token.slice(-18)}`;
  }

  const fallback = String(user?.name || "user")
    .trim()
    .toLowerCase();
  return `name:${fallback || "user"}`;
}

function normalizeAccount(rawAccount) {
  const auth = normalizeAuth(rawAccount);
  if (!auth) return null;

  return {
    id: rawAccount?.id || getAccountId(auth.user, auth.token),
    token: auth.token,
    user: auth.user,
    lastUsedAt: rawAccount?.lastUsedAt || new Date().toISOString(),
  };
}

function sortAccounts(accounts) {
  return [...accounts].sort((a, b) => {
    const timeA = new Date(a.lastUsedAt).getTime() || 0;
    const timeB = new Date(b.lastUsedAt).getTime() || 0;
    return timeB - timeA;
  });
}

function readStoredAuth() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return normalizeAuth(parsed);
  } catch (error) {
    return null;
  }
}

function readStoredAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNT_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const dedupMap = new Map();
    parsed.forEach((item) => {
      const normalized = normalizeAccount(item);
      if (!normalized) return;
      if (!dedupMap.has(normalized.id)) {
        dedupMap.set(normalized.id, normalized);
      }
    });

    return sortAccounts(Array.from(dedupMap.values())).slice(0, MAX_STORED_ACCOUNTS);
  } catch (error) {
    return [];
  }
}

function upsertAccount(accounts, auth) {
  const current = normalizeAuth(auth);
  if (!current) return accounts;

  const next = {
    id: getAccountId(current.user, current.token),
    token: current.token,
    user: current.user,
    lastUsedAt: new Date().toISOString(),
  };

  const merged = [next, ...accounts.filter((item) => item.id !== next.id)];
  return sortAccounts(merged).slice(0, MAX_STORED_ACCOUNTS);
}

function persistAuth(auth) {
  try {
    if (!auth) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return;
    }
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
  } catch (error) {
    // Ignore storage errors.
  }
}

function persistAccounts(accounts) {
  try {
    localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
  } catch (error) {
    // Ignore storage errors.
  }
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => readStoredAuth());
  const [accounts, setAccounts] = useState(() => readStoredAccounts());

  useEffect(() => {
    if (!auth?.token || !auth?.user) return;

    setAccounts((current) => {
      const id = getAccountId(auth.user, auth.token);
      const exists = current.some((item) => item.id === id);
      if (exists) return current;

      const next = upsertAccount(current, auth);
      persistAccounts(next);
      return next;
    });
  }, [auth]);

  const login = (nextAuth) => {
    const safeAuth = normalizeAuth(nextAuth);
    if (!safeAuth) return false;

    persistAuth(safeAuth);
    setAuth(safeAuth);

    setAccounts((current) => {
      const nextAccounts = upsertAccount(current, safeAuth);
      persistAccounts(nextAccounts);
      return nextAccounts;
    });

    return true;
  };

  const logout = () => {
    persistAuth(null);
    setAuth(null);
  };

  const switchAccount = (accountId) => {
    const target = accounts.find((item) => item.id === accountId);
    if (!target?.token || !target?.user) return false;

    const safeAuth = {
      token: target.token,
      user: target.user,
    };

    persistAuth(safeAuth);
    setAuth(safeAuth);

    setAccounts((current) => {
      const nextAccounts = upsertAccount(current, safeAuth);
      persistAccounts(nextAccounts);
      return nextAccounts;
    });

    return true;
  };

  const currentAccountId = auth?.user ? getAccountId(auth.user, auth?.token || "") : "";

  const accountSessions = useMemo(
    () =>
      accounts.map((item) => ({
        id: item.id,
        user: item.user,
        lastUsedAt: item.lastUsedAt,
      })),
    [accounts]
  );

  const value = useMemo(
    () => ({
      token: auth?.token || "",
      user: auth?.user || null,
      isAuthenticated: Boolean(auth?.token),
      currentAccountId,
      accountSessions,
      login,
      logout,
      switchAccount,
    }),
    [auth, currentAccountId, accountSessions]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
