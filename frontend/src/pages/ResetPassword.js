import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import api, { apiError } from "@/lib/api";
import { LOGO_URL } from "@/lib/cpl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, KeyRound } from "lucide-react";
import { toast } from "sonner";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [status, setStatus] = useState("checking"); // checking | valid | invalid | done
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token) { setStatus("invalid"); setErr("Token tidak ditemukan."); return; }
    api.get("/auth/reset-info", { params: { token } })
      .then((r) => { setEmail(r.data.email); setStatus("valid"); })
      .catch((e) => { setStatus("invalid"); setErr(apiError(e.response?.data?.detail)); });
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (pw.length < 6) { setErr("Kata sandi minimal 6 karakter."); return; }
    if (pw !== pw2) { setErr("Konfirmasi kata sandi tidak cocok."); return; }
    setErr(""); setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: pw });
      setStatus("done");
      toast.success("Kata sandi berhasil diperbarui");
      setTimeout(() => navigate("/login"), 2500);
    } catch (e2) {
      setErr(apiError(e2.response?.data?.detail));
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 brand-gradient">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 fade-up" data-testid="reset-password-card">
        <div className="flex items-center gap-3 mb-6">
          <img src={LOGO_URL} alt="UINSA" className="w-12 h-12 object-contain" />
          <div>
            <p className="font-display font-extrabold text-primary">SI-CPL UINSA</p>
            <p className="text-xs text-slate-500">Atur Ulang Kata Sandi</p>
          </div>
        </div>

        {status === "checking" && (
          <div className="py-10 flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
        )}

        {status === "invalid" && (
          <div className="text-center py-6">
            <p className="text-rose-600 font-medium" data-testid="reset-invalid-message">{err || "Tautan tidak valid."}</p>
            <Link to="/login" className="inline-block mt-4 text-sm text-primary underline">Kembali ke halaman masuk</Link>
          </div>
        )}

        {status === "done" && (
          <div className="text-center py-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
            <p className="font-semibold text-slate-800">Kata sandi berhasil diperbarui!</p>
            <p className="text-sm text-slate-500 mt-1">Mengalihkan ke halaman masuk...</p>
          </div>
        )}

        {status === "valid" && (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-slate-600">Membuat kata sandi baru untuk <span className="font-semibold">{email}</span>.</p>
            <div>
              <Label className="text-xs">Kata Sandi Baru</Label>
              <Input type="password" data-testid="reset-password-input" value={pw} onChange={(e) => setPw(e.target.value)} className="mt-1 h-11" placeholder="Minimal 6 karakter" />
            </div>
            <div>
              <Label className="text-xs">Konfirmasi Kata Sandi</Label>
              <Input type="password" data-testid="reset-password-confirm-input" value={pw2} onChange={(e) => setPw2(e.target.value)} className="mt-1 h-11" />
            </div>
            {err && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{err}</p>}
            <Button type="submit" disabled={loading} data-testid="reset-submit-button" className="w-full h-11 bg-[#064E3B] hover:bg-[#043E2F]">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />}Simpan Kata Sandi
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
