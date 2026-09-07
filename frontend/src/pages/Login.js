import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { apiError } from "@/lib/api";
import { LOGO_URL } from "@/lib/cpl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Selamat datang kembali!");
      navigate("/");
    } catch (err) {
      setError(apiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex w-1/2 brand-gradient text-white flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute -left-16 bottom-10 w-80 h-80 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <div className="bg-white rounded-2xl p-2 shadow-xl">
            <img src={LOGO_URL} alt="UINSA" className="w-16 h-16 object-contain" />
          </div>
          <div>
            <p className="font-display font-extrabold text-xl">UIN Sunan Ampel</p>
            <p className="text-amber-300 text-sm tracking-wide">SURABAYA</p>
          </div>
        </div>
        <div className="relative">
          <h1 className="font-display text-4xl xl:text-5xl font-extrabold leading-tight">
            Sistem Informasi <span className="text-amber-400">Capaian</span> Kompetensi Lulusan
          </h1>
          <p className="mt-5 text-emerald-100/80 max-w-md leading-relaxed">
            Kelola, hitung, dan laporkan pencapaian 12 kriteria CPL berdasarkan bobot Sikap, Pengetahuan,
            Keterampilan Umum, dan Keterampilan Khusus.
          </p>
        </div>
        <p className="relative text-xs text-emerald-200/60">Outcome-Based Education (OBE) Management System</p>
      </div>

      {/* Right form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md fade-up">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <img src={LOGO_URL} alt="UINSA" className="w-14 h-14 object-contain" />
            <span className="font-display font-extrabold text-primary text-lg">SI-CPL UINSA</span>
          </div>
          <h2 className="font-display text-3xl font-bold text-slate-900">Masuk</h2>
          <p className="text-sm text-slate-500 mt-1 mb-8">Silakan masuk untuk mengelola data CPL.</p>

          <form onSubmit={submit} className="space-y-5">
            <div>
              <Label htmlFor="email" className="text-slate-700">Email</Label>
              <Input
                id="email"
                type="email"
                data-testid="login-email-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@uinsa.ac.id"
                className="mt-1.5 h-11"
                required
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-slate-700">Kata Sandi</Label>
              <Input
                id="password"
                type="password"
                data-testid="login-password-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1.5 h-11"
                required
              />
            </div>

            {error && (
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" data-testid="login-error">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading}
              data-testid="login-submit-button"
              className="w-full h-11 bg-[#064E3B] hover:bg-[#043E2F] text-white font-semibold"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Masuk
            </Button>

            <button
              type="button"
              data-testid="demo-credentials-button"
              onClick={() => {
                setEmail("imtinan.fakhri@gmail.com");
                setPassword("uinsa2024");
              }}
              className="w-full text-xs text-slate-500 hover:text-primary transition-colors"
            >
              Isi kredensial demo
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
