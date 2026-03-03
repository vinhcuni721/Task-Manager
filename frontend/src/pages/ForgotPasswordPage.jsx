import { useState } from "react";
import { Link } from "react-router-dom";
import { authApi } from "../services/api";
import BrandLogo from "../components/BrandLogo";

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      setSubmitting(true);
      setError("");
      setMessage("");
      const response = await authApi.forgotPassword({ email });
      setMessage(response.message || "If this email exists, a reset link has been sent.");
    } catch (err) {
      setError(err.message || "Failed to send reset email");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8">
      <div className="mx-auto grid max-w-5xl grid-cols-1 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl lg:grid-cols-2">
        <section className="relative hidden min-h-[560px] p-10 lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(14,165,233,0.3),transparent_45%),radial-gradient(circle_at_80%_90%,rgba(99,102,241,0.2),transparent_40%)]" />
          <div className="relative">
            <BrandLogo inverse subtitle="Secure Account Recovery" className="mb-6" />
            <p className="inline-flex rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
              Account Recovery
            </p>
            <h1 className="mt-4 text-3xl font-bold text-white">Forgot your password?</h1>
            <p className="mt-3 text-sm text-slate-300">Enter your email and we will send you a secure reset link.</p>
            <ul className="mt-8 space-y-3 text-sm text-slate-200">
              <li className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2">Reset link expires after 60 minutes</li>
              <li className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2">If email is not registered, no details are revealed</li>
              <li className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2">Use a strong new password when resetting</li>
            </ul>
          </div>
        </section>

        <section className="bg-white p-6 md:p-10">
          <form onSubmit={handleSubmit} className="mx-auto w-full max-w-md">
            <BrandLogo subtitle="Recover Access" className="mb-4" />
            <h2 className="text-3xl font-bold text-slate-900">Forgot Password</h2>
            <p className="mt-2 text-sm text-slate-600">Enter your email to receive a reset link.</p>

            <label className="mt-6 block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-indigo-100"
                placeholder="you@email.com"
              />
            </label>

            {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
            {message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Sending..." : "Send Reset Link"}
            </button>

            <p className="mt-4 text-sm text-slate-600">
              Back to{" "}
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

export default ForgotPasswordPage;
