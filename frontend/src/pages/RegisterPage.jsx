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

function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (form.password !== form.confirmPassword) {
      setError("Password confirmation does not match");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      const response = await authApi.register({
        name: form.name,
        email: form.email,
        password: form.password,
      });
      const registerPayload = {
        ...response.data,
        user: {
          ...(response.data?.user || {}),
          email: response.data?.user?.email || form.email,
          name: response.data?.user?.name || form.name,
        },
      };
      login(registerPayload);
      navigate(registerPayload?.user?.role === "admin" ? "/admin" : "/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Register failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8">
      <div className="mx-auto grid max-w-5xl grid-cols-1 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl lg:grid-cols-2">
        <section className="relative hidden min-h-[560px] p-10 lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(16,185,129,0.32),transparent_45%),radial-gradient(circle_at_80%_90%,rgba(14,165,233,0.22),transparent_40%)]" />
          <div className="relative">
            <BrandLogo inverse subtitle="Professional Task Workspace" className="mb-6" />
            <p className="inline-flex rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
              New Workspace
            </p>
            <h1 className="mt-4 text-3xl font-bold text-white">Tao tai khoan de bat dau quan ly cong viec</h1>
            <p className="mt-3 text-sm text-slate-300">Sau khi dang ky, ban co the tao task, theo doi tien do va lam viec theo team ngay.</p>
            <ul className="mt-8 space-y-3 text-sm text-slate-200">
              <li className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2">Task list, kanban, calendar trong mot noi</li>
              <li className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2">Template de tao task nhanh hon</li>
              <li className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2">Thong ke va nhac viec theo muc uu tien</li>
            </ul>
          </div>
        </section>

        <section className="bg-white p-6 md:p-10">
          <form onSubmit={handleSubmit} className="mx-auto w-full max-w-md">
            <BrandLogo subtitle="Create Workspace Account" className="mb-4" />
            <h2 className="text-3xl font-bold text-slate-900">Register</h2>
            <p className="mt-2 text-sm text-slate-600">Create your TaskFlow account.</p>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Name</span>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-indigo-100"
                  placeholder="Your name"
                />
              </label>

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
                    minLength={8}
                    required
                    value={form.password}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 pr-11 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-indigo-100"
                    placeholder="Minimum 8, include upper/lower/number/special"
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

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Confirm password</span>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    name="confirmPassword"
                    minLength={8}
                    required
                    value={form.confirmPassword}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 pr-11 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-indigo-100"
                    placeholder="Nhap lai mat khau"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((current) => !current)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </label>
            </div>

            {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Creating account..." : "Register"}
            </button>

            <p className="mt-4 text-sm text-slate-600">
              Already have an account?{" "}
              <Link to="/login" className="font-medium text-brand-600 hover:text-brand-500">
                Login
              </Link>
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}

export default RegisterPage;
