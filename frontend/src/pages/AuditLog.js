import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { History, Loader2 } from "lucide-react";

const ACTION_COLOR = {
  buat: "bg-emerald-100 text-emerald-800",
  ubah: "bg-amber-100 text-amber-800",
  hapus: "bg-rose-100 text-rose-800",
  impor: "bg-teal-100 text-teal-800",
  kirim_reset: "bg-indigo-100 text-indigo-800",
  reset_sandi: "bg-indigo-100 text-indigo-800",
};
const ACTION_LABEL = {
  buat: "Buat", ubah: "Ubah", hapus: "Hapus", impor: "Impor",
  kirim_reset: "Kirim Reset", reset_sandi: "Reset Sandi",
};

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState("all");

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (entity !== "all") params.entity = entity;
    api.get("/audit", { params }).then((r) => { setLogs(r.data); setLoading(false); });
  }, [entity]);

  const fmtTime = (iso) => {
    try { return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }); }
    catch { return iso; }
  };

  return (
    <div className="fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 flex items-center gap-2"><History className="w-6 h-6 text-[#064E3B]" />Log Aktivitas</h1>
          <p className="text-sm text-slate-500 mt-1">Catatan perubahan data nilai dan akun pengguna.</p>
        </div>
        <Select value={entity} onValueChange={setEntity}>
          <SelectTrigger className="w-[180px] bg-white" data-testid="audit-entity-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Aktivitas</SelectItem>
            <SelectItem value="nilai">Data Nilai</SelectItem>
            <SelectItem value="pengguna">Pengguna</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="audit-table">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Waktu</th>
                <th className="text-left px-4 py-3">Pelaku</th>
                <th className="text-left px-4 py-3">Aksi</th>
                <th className="text-left px-4 py-3">Objek</th>
                <th className="text-left px-4 py-3">Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary inline" /></td></tr>
              )}
              {!loading && logs.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-slate-400">Belum ada aktivitas tercatat.</td></tr>
              )}
              {!loading && logs.map((l) => (
                <tr key={l.id} className="border-t hover:bg-slate-50/60" data-testid={`audit-row-${l.id}`}>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtTime(l.timestamp)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{l.actor_email}</p>
                    <p className="text-xs text-slate-400 capitalize">{l.actor_role}</p>
                  </td>
                  <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${ACTION_COLOR[l.action] || "bg-slate-100 text-slate-700"}`}>{ACTION_LABEL[l.action] || l.action}</span></td>
                  <td className="px-4 py-3 capitalize text-slate-600">{l.entity}</td>
                  <td className="px-4 py-3 text-slate-500">{l.summary || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
