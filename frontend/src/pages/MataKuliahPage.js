import { useEffect, useMemo, useState } from "react";
import api, { apiError } from "@/lib/api";
import { CATEGORIES, CRITERIA, codesByCategory } from "@/lib/cpl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, BookOpen } from "lucide-react";
import { toast } from "sonner";

const empty = { name: "", code: "", sks: 3, fakultas_id: "", prodi_id: "", cpl_codes: [] };

export default function MataKuliahPage() {
  const [fakultas, setFakultas] = useState([]);
  const [prodi, setProdi] = useState([]);
  const [matkul, setMatkul] = useState([]);
  const [fFak, setFFak] = useState("all");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(empty);
  const [modalProdi, setModalProdi] = useState([]);

  const loadFak = () => api.get("/fakultas").then((r) => setFakultas(r.data));
  const loadMk = () => api.get("/matakuliah").then((r) => setMatkul(r.data));
  useEffect(() => { loadFak(); loadMk(); }, []);

  useEffect(() => {
    if (!form.fakultas_id) { setModalProdi([]); return; }
    api.get("/prodi", { params: { fakultas_id: form.fakultas_id } }).then((r) => setModalProdi(r.data));
  }, [form.fakultas_id]);

  const fakMap = useMemo(() => Object.fromEntries(fakultas.map((f) => [f.id, f.name])), [fakultas]);

  const openNew = () => { setEditId(null); setForm(empty); setOpen(true); };
  const openEdit = (m) => { setEditId(m.id); setForm({ ...m }); setOpen(true); };

  const toggleCode = (code) => {
    setForm((f) => ({
      ...f,
      cpl_codes: f.cpl_codes.includes(code) ? f.cpl_codes.filter((c) => c !== code) : [...f.cpl_codes, code],
    }));
  };

  const save = async () => {
    if (!form.name || !form.fakultas_id || !form.prodi_id) { toast.error("Lengkapi nama, fakultas, dan prodi."); return; }
    if (form.cpl_codes.length === 0) { toast.error("Pilih minimal satu kriteria CPL."); return; }
    try {
      const payload = { ...form, sks: Number(form.sks) };
      if (editId) await api.put(`/matakuliah/${editId}`, payload);
      else await api.post("/matakuliah", payload);
      toast.success(editId ? "Mata kuliah diperbarui" : "Mata kuliah ditambahkan");
      setOpen(false); loadMk();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const del = async (id) => {
    if (!window.confirm("Hapus mata kuliah ini?")) return;
    await api.delete(`/matakuliah/${id}`); toast.success("Mata kuliah dihapus"); loadMk();
  };

  const filtered = fFak === "all" ? matkul : matkul.filter((m) => m.fakultas_id === fFak);
  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach((m) => { const key = fakMap[m.fakultas_id] || "Lainnya"; (g[key] = g[key] || []).push(m); });
    return g;
  }, [filtered, fakMap]);

  return (
    <div className="fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Mata Kuliah</h1>
          <p className="text-sm text-slate-500 mt-1">Kelola mata kuliah, dikelompokkan per fakultas & prodi.</p>
        </div>
        <div className="flex gap-2">
          <Select value={fFak} onValueChange={setFFak}>
            <SelectTrigger className="w-[210px] bg-white" data-testid="mk-faculty-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Fakultas</SelectItem>
              {fakultas.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={openNew} data-testid="add-matakuliah-button" className="bg-[#064E3B] hover:bg-[#043E2F]"><Plus className="w-4 h-4 mr-2" />Tambah</Button>
        </div>
      </div>

      {Object.keys(grouped).length === 0 && (
        <Card className="p-10 text-center text-slate-400 shadow-sm">Belum ada mata kuliah.</Card>
      )}

      <div className="space-y-6">
        {Object.entries(grouped).map(([fakName, items]) => (
          <div key={fakName}>
            <h2 className="font-display font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#064E3B]" /> {fakName}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((m) => (
                <Card key={m.id} className="p-5 shadow-sm hover:shadow-md transition-shadow" data-testid={`mk-card-${m.id}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{m.name}</p>
                      <p className="text-xs text-slate-500">{m.code} · {m.sks} SKS</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(m)} data-testid={`edit-mk-${m.id}`}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => del(m.id)} data-testid={`delete-mk-${m.id}`} className="text-rose-600"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {m.cpl_codes.map((c) => <Badge key={c} variant="secondary" className="text-[10px] font-mono">{c}</Badge>)}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Edit Mata Kuliah" : "Tambah Mata Kuliah"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Nama Mata Kuliah</Label><Input data-testid="mk-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" /></div>
              <div><Label className="text-xs">Kode</Label><Input data-testid="mk-code-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Fakultas</Label>
                <Select value={form.fakultas_id} onValueChange={(v) => setForm({ ...form, fakultas_id: v, prodi_id: "" })}>
                  <SelectTrigger data-testid="mk-faculty-select" className="mt-1"><SelectValue placeholder="Pilih" /></SelectTrigger>
                  <SelectContent>{fakultas.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">SKS</Label><Input type="number" min="1" data-testid="mk-sks-input" value={form.sks} onChange={(e) => setForm({ ...form, sks: e.target.value })} className="mt-1" /></div>
            </div>
            <div>
              <Label className="text-xs">Program Studi</Label>
              <Select value={form.prodi_id} onValueChange={(v) => setForm({ ...form, prodi_id: v })} disabled={!form.fakultas_id}>
                <SelectTrigger data-testid="mk-prodi-select" className="mt-1"><SelectValue placeholder="Pilih" /></SelectTrigger>
                <SelectContent>{modalProdi.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-2 block">Kriteria CPL yang dibebankan ({form.cpl_codes.length} dipilih)</Label>
              <div className="space-y-3 border rounded-lg p-3 max-h-56 overflow-y-auto">
                {CATEGORIES.map((cat) => (
                  <div key={cat.key}>
                    <p className="text-xs font-semibold text-slate-600 mb-1.5">{cat.name}</p>
                    {codesByCategory(cat.key).map((code) => {
                      const crit = CRITERIA.find((c) => c.code === code);
                      return (
                        <label key={code} className="flex items-start gap-2 py-1 cursor-pointer">
                          <Checkbox checked={form.cpl_codes.includes(code)} onCheckedChange={() => toggleCode(code)} data-testid={`mk-cpl-${code.toLowerCase()}`} />
                          <span className="text-xs text-slate-600 leading-snug"><span className="font-mono font-semibold text-slate-800">{code}</span> — {crit.label}</span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={save} data-testid="save-mk-button" className="bg-[#064E3B] hover:bg-[#043E2F]">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
