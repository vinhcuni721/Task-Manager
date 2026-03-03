import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authApi } from "../services/api";
import BrandLogo from "../components/BrandLogo";

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 6.2A10.7 10.7 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-4 5" />
      <path d="M6.2 10.5A17 17 0 0 0 2 12s3.5 7 10 7c.7 0 1.3-.1 2-.2" />
      <path d="M14.5 14.5A3.5 3.5 0 0 1 9.5 9.5" />
    </svg>
  );
}

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [twoFA, setTwoFA] = useState({
    required: false,
    challengeToken: "",
    code: "",
    delivery: "",
    expiresInSeconds: 0,
    devOtpCode: "",
  });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      setSubmitting(true);
      setError("");
      const response = await authApi.login(form);
      const payload = response?.data || {};
      if (payload.requires_2fa) {
        setTwoFA({
          required: true,
          challengeToken: payload.challenge_token || "",
          code: "",
          delivery: payload.delivery || "email",
          expiresInSeconds: Number(payload.expires_in_seconds || 0),
          devOtpCode: payload.dev_otp_code || "",
        });
        return;
      }
      const loginPayload = {
        ...payload,
        user: {
          ...(payload?.user || {}),
          email: payload?.user?.email || form.email,
        },
      };
      login(loginPayload);
      sessionStorage.setItem("taskflow_flash_success", "Dang nhap thanh cong");
      navigate(loginPayload?.user?.role === "admin" ? "/admin" : "/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify2FA = async (event) => {
    event.preventDefault();
    try {
      setSubmitting(true);
      setError("");
      const response = await authApi.verify2FA({
        challenge_token: twoFA.challengeToken,
        code: twoFA.code,
      });
      const payload = response?.data || {};
      const loginPayload = {
        ...payload,
        user: {
          ...(payload?.user || {}),
          email: payload?.user?.email || form.email,
        },
      };
      login(loginPayload);
      sessionStorage.setItem("taskflow_flash_success", "Dang nhap thanh cong");
      navigate(loginPayload?.user?.role === "admin" ? "/admin" : "/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "2FA verification failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8">
      <div className="mx-auto grid max-w-5xl grid-cols-1 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl lg:grid-cols-2">
        <section className="relative hidden min-h-[560px] p-10 lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(99,102,241,0.35),transparent_45%),radial-gradient(circle_at_80%_90%,rgba(14,165,233,0.25),transparent_40%)]" />
          <div className="relative">
            <BrandLogo inverse subtitle="Professional Task Workspace" className="mb-6" />
            <p className="inline-flex rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
              TaskFlow Workspace
            </p>
            <h1 className="mt-4 text-3xl font-bold text-white">Quan ly cong viec gon, nhanh, de theo doi</h1>
            <p className="mt-3 text-sm text-slate-300">Dang nhap de tiep tuc voi board, thong ke, va thong bao realtime.</p>
            <ul className="mt-8 space-y-3 text-sm text-slate-200">
              <li className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2">Theo doi task theo list, kanban, calendar</li>
              <li className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2">Phan quyen team va quy trinh phe duyet</li>
              <li className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2">Checklist va time tracking theo task</li>
            </ul>
          </div>
        </section>

        <section className="bg-white p-6 md:p-10">
          <form onSubmit={twoFA.required ? handleVerify2FA : handleSubmit} className="mx-auto w-full max-w-md">
            <BrandLogo subtitle="Secure Sign In" className="mb-4" />
            <h2 className="text-3xl font-bold text-slate-900">Login</h2>
            <p className="mt-2 text-sm text-slate-600">
              {twoFA.required ? "Nhap ma xac thuc de hoan tat dang nhap." : "Access your TaskFlow workspace."}
            </p>

            <div className="mt-6 space-y-4">
              {!twoFA.required && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
                    <input
                      type="email"
                      name="email"
                      required
                      value={form.email}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-indigo-100"
                      placeholder="you@email.com"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        name="password"
                        required
                        value={form.password}
                        onChange={handleChange}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 pr-11 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-indigo-100"
                        placeholder="Nhap mat khau"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </label>
                </>
              )}

              {twoFA.required && (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Verification code</span>
                  <input
                    type="text"
                    name="otp_code"
                    required
                    value={twoFA.code}
                    onChange={(event) => setTwoFA((current) => ({ ...current, code: event.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-indigo-100"
                    placeholder="6-digit code"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Code sent via {twoFA.delivery}. Expires in {twoFA.expiresInSeconds || 0}s.
                  </p>
                  {twoFA.devOtpCode && (
                    <p className="mt-1 text-xs font-semibold text-amber-700">Dev OTP: {twoFA.devOtpCode}</p>
                  )}
                </label>
              )}
            </div>

            {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (twoFA.required ? "Verifying..." : "Logging in...") : twoFA.required ? "Verify Code" : "Login"}
            </button>

            {!twoFA.required && (
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <p>
                  <Link to="/forgot-password" className="font-medium text-brand-600 hover:text-brand-500">
                    Forgot password?
                  </Link>
                </p>
                <p>
                  No account yet?{" "}
                  <Link to="/register" className="font-medium text-brand-600 hover:text-brand-500">
                    Register
                  </Link>
                </p>
              </div>
            )}
          </form>
        </section>
      </div>
    </div>
  );
}

export default LoginPage;
