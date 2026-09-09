import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, ShieldCheck, KeyRound, Copy } from "lucide-react";
import { toast } from "sonner";

const ROLES = [
  { value: "admin", label: "Admin", color: "bg-[#064E3B] text-white" },
  { value: "kaprodi", label: "Kaprodi", color: "bg-amber-100 text-amber-800 border border-amber-300" },
  { value: "dosen", label: "Dosen", color: "bg-teal-100 text-teal-800 border border-teal-300" },
];
const roleBadge = (r) => ROLES.find((x) => x.value === r)?.color || "bg-slate-100";
const empty = { email: "", password: "", name: "", role: "dosen", fakultas_id: "", prodi_id: "" };

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [fakultas, setFakultas] = useState([]);
  const [prodi, setProdi] = useState([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(empty);
  const [resetInfo, setResetInfo] = useState(null);

  const sendReset = async (u) => {
    try {
      const { data } = await api.post(`/users/${u.id}/send-reset`);
      if (data.email_sent) toast.success(`Tautan reset dikirim ke email ${data.email}`);
      else setResetInfo({ email: data.email, link: data.reset_link, note: data.email_error });
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(resetInfo.link);
    toast.success("Tautan disalin");
  };

  const load = () => api.get("/users").then((r) => setUsers(r.data));
  useEffect(() => { load(); api.get("/fakultas").then((r) => setFakultas(r.data)); }, []);
  useEffect(() => {
    if (!form.fakultas_id) { setProdi([]); return; }
    api.get("/prodi", { params: { fakultas_id: form.fakultas_id } }).then((r) => setProdi(r.data));
  }, [form.fakultas_id]);

  const fakMap = Object.fromEntries(fakultas.map((f) => [f.id, f.name]));

  const openNew = () => { setEditId(null); setForm(empty); setOpen(true); };
  const openEdit = (u) => {
    setEditId(u.id);
    setForm({ email: u.email, password: "", name: u.name || "", role: u.role, fakultas_id: u.fakultas_id || "", prodi_id: u.prodi_id || "" });
    setOpen(true);
  };

  const save = async () => {
    if (!form.email || (!editId && !form.password)) { toast.error("Email dan kata sandi wajib diisi."); return; }
    if (form.role !== "admin" && !form.prodi_id) { toast.error("Kaprodi/Dosen wajib punya prodi."); return; }
    try {
      const payload = { ...form };
      if (form.role === "admin") { payload.fakultas_id = null; payload.prodi_id = null; }
      if (editId) {
        if (!payload.password) delete payload.password;
        delete payload.email;
        await api.put(`/users/${editId}`, payload);
      } else {
        await api.post("/users", payload);
      }
      toast.success(editId ? "User diperbarui" : "User ditambahkan");
      setOpen(false); load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const toggleActive = async (u) => {
    try { await api.put(`/users/${u.id}`, { is_active: !u.is_active }); load(); }
    catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const del = async (u) => {
    if (!window.confirm(`Hapus user ${u.email}?`)) return;
    try { await api.delete(`/users/${u.id}`); toast.success("User dihapus"); load(); }
    catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  return (
    <div className="fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Manajemen Pengguna</h1>
          <p className="text-sm text-slate-500 mt-1">Kelola akun Admin, Kaprodi, dan Dosen beserta hak aksesnya.</p>
        </div>
        <Button onClick={openNew} data-testid="add-user-button" className="bg-[#064E3B] hover:bg-[#043E2F]"><Plus className="w-4 h-4 mr-2" />Tambah Pengguna</Button>
      </div>

      <Card className="shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="users-table">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Nama / Email</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-left px-4 py-3">Cakupan (Prodi)</th>
                <th className="text-center px-4 py-3">Aktif</th>
                <th className="text-right px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t hover:bg-slate-50/60" data-testid={`user-row-${u.id}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{u.name || "-"}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </td>
                  <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${roleBadge(u.role)}`}>{ROLES.find((r) => r.value === u.role)?.label}</span></td>
                  <td className="px-4 py-3 text-slate-500">{u.role === "admin" ? "Semua" : (u.prodi_id ? <ProdiName fakultas_id={u.fakultas_id} prodi_id={u.prodi_id} /> : "—")}</td>
                  <td className="px-4 py-3 text-center"><Switch checked={u.is_active} onCheckedChange={() => toggleActive(u)} data-testid={`toggle-active-${u.id}`} /></td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => sendReset(u)} data-testid={`reset-user-${u.id}`} className="text-amber-600" title="Kirim tautan reset kata sandi"><KeyRound className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(u)} data-testid={`edit-user-${u.id}`}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => del(u)} data-testid={`delete-user-${u.id}`} className="text-rose-600"><Trash2 className="w-4 h-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-[#064E3B]" />{editId ? "Edit Pengguna" : "Tambah Pengguna"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label className="text-xs">Nama</Label><Input data-testid="user-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs">Email</Label><Input type="email" data-testid="user-email-input" value={form.email} disabled={!!editId} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs">Kata Sandi {editId && <span className="text-slate-400">(kosongkan jika tidak diubah)</span>}</Label><Input type="password" data-testid="user-password-input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1" /></div>
            <div>
              <Label className="text-xs">Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v, ...(v === "admin" ? { fakultas_id: "", prodi_id: "" } : {}) })}>
                <SelectTrigger data-testid="user-role-select" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {form.role !== "admin" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Fakultas</Label>
                  <Select value={form.fakultas_id} onValueChange={(v) => setForm({ ...form, fakultas_id: v, prodi_id: "" })}>
                    <SelectTrigger data-testid="user-fakultas-select" className="mt-1"><SelectValue placeholder="Pilih" /></SelectTrigger>
                    <SelectContent>{fakultas.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Prodi</Label>
                  <Select value={form.prodi_id} onValueChange={(v) => setForm({ ...form, prodi_id: v })} disabled={!form.fakultas_id}>
                    <SelectTrigger data-testid="user-prodi-select" className="mt-1"><SelectValue placeholder="Pilih" /></SelectTrigger>
                    <SelectContent>{prodi.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={save} data-testid="save-user-button" className="bg-[#064E3B] hover:bg-[#043E2F]">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!resetInfo} onOpenChange={(o) => !o && setResetInfo(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5 text-amber-600" />Tautan Reset Kata Sandi</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{resetInfo?.note || "Bagikan tautan ini ke pengguna. Berlaku 2 jam."}</p>
            <p className="text-xs text-slate-500">Untuk: <span className="font-medium">{resetInfo?.email}</span></p>
            <div className="flex gap-2">
              <Input readOnly value={resetInfo?.link || ""} data-testid="reset-link-value" className="text-xs font-mono" />
              <Button onClick={copyLink} data-testid="copy-reset-link-button" className="bg-[#064E3B] hover:bg-[#043E2F] shrink-0"><Copy className="w-4 h-4" /></Button>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setResetInfo(null)}>Tutup</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProdiName({ fakultas_id, prodi_id }) {
  const [name, setName] = useState("");
  useEffect(() => {
    if (!fakultas_id || !prodi_id) return;
    api.get("/prodi", { params: { fakultas_id } }).then((r) => setName(r.data.find((p) => p.id === prodi_id)?.name || prodi_id));
  }, [fakultas_id, prodi_id]);
  return <span>{name}</span>;
}
