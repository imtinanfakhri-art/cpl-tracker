import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Building2, GraduationCap, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export default function FakultasProdiPage() {
  const [fakultas, setFakultas] = useState([]);
  const [prodi, setProdi] = useState([]);
  const [selectedFak, setSelectedFak] = useState(null);

  const [fakOpen, setFakOpen] = useState(false);
  const [fakForm, setFakForm] = useState({ name: "", code: "" });
  const [fakEdit, setFakEdit] = useState(null);

  const [prodiOpen, setProdiOpen] = useState(false);
  const [prodiForm, setProdiForm] = useState({ name: "", code: "" });
  const [prodiEdit, setProdiEdit] = useState(null);

  const loadFak = () => api.get("/fakultas").then((r) => setFakultas(r.data));
  const loadProdi = (fid) => api.get("/prodi", { params: { fakultas_id: fid } }).then((r) => setProdi(r.data));

  useEffect(() => { loadFak(); }, []);
  useEffect(() => { if (selectedFak) loadProdi(selectedFak.id); else setProdi([]); }, [selectedFak]);

  // Fakultas
  const saveFak = async () => {
    if (!fakForm.name) { toast.error("Nama fakultas wajib diisi."); return; }
    try {
      if (fakEdit) await api.put(`/fakultas/${fakEdit}`, fakForm);
      else await api.post("/fakultas", fakForm);
      toast.success("Fakultas tersimpan"); setFakOpen(false); loadFak();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };
  const delFak = async (f) => {
    if (!window.confirm(`Hapus ${f.name}? Prodi & mata kuliah terkait ikut terhapus.`)) return;
    await api.delete(`/fakultas/${f.id}`); toast.success("Fakultas dihapus");
    if (selectedFak?.id === f.id) setSelectedFak(null);
    loadFak();
  };

  // Prodi
  const saveProdi = async () => {
    if (!prodiForm.name) { toast.error("Nama prodi wajib diisi."); return; }
    try {
      const payload = { ...prodiForm, fakultas_id: selectedFak.id };
      if (prodiEdit) await api.put(`/prodi/${prodiEdit}`, payload);
      else await api.post("/prodi", payload);
      toast.success("Prodi tersimpan"); setProdiOpen(false); loadProdi(selectedFak.id);
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };
  const delProdi = async (p) => {
    if (!window.confirm(`Hapus ${p.name}?`)) return;
    await api.delete(`/prodi/${p.id}`); toast.success("Prodi dihapus"); loadProdi(selectedFak.id);
  };

  return (
    <div className="fade-up">
      <div className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Fakultas & Program Studi</h1>
        <p className="text-sm text-slate-500 mt-1">Tambah, ubah, dan hapus fakultas beserta program studinya.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fakultas */}
        <Card className="shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b bg-slate-50/50">
            <h3 className="font-display font-semibold text-slate-800 flex items-center gap-2"><Building2 className="w-4 h-4 text-[#064E3B]" />Fakultas</h3>
            <Button size="sm" onClick={() => { setFakEdit(null); setFakForm({ name: "", code: "" }); setFakOpen(true); }} data-testid="add-fakultas-button" className="bg-[#064E3B] hover:bg-[#043E2F]"><Plus className="w-4 h-4 mr-1" />Tambah</Button>
          </div>
          <div className="divide-y">
            {fakultas.length === 0 && <p className="p-6 text-center text-slate-400 text-sm">Belum ada fakultas.</p>}
            {fakultas.map((f) => (
              <div
                key={f.id}
                onClick={() => setSelectedFak(f)}
                data-testid={`fakultas-item-${f.id}`}
                className={`flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors ${selectedFak?.id === f.id ? "bg-emerald-50" : "hover:bg-slate-50"}`}
              >
                <div className="flex-1">
                  <p className="font-medium text-slate-800">{f.name}</p>
                  {f.code && <p className="text-xs text-slate-400">{f.code}</p>}
                </div>
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setFakEdit(f.id); setFakForm({ name: f.name, code: f.code || "" }); setFakOpen(true); }} data-testid={`edit-fakultas-${f.id}`}><Pencil className="w-4 h-4" /></Button>
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); delFak(f); }} data-testid={`delete-fakultas-${f.id}`} className="text-rose-600"><Trash2 className="w-4 h-4" /></Button>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </div>
            ))}
          </div>
        </Card>

        {/* Prodi */}
        <Card className="shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b bg-slate-50/50">
            <h3 className="font-display font-semibold text-slate-800 flex items-center gap-2"><GraduationCap className="w-4 h-4 text-[#064E3B]" />
              Program Studi {selectedFak && <span className="text-slate-400 font-normal text-sm">· {selectedFak.name}</span>}
            </h3>
            <Button size="sm" disabled={!selectedFak} onClick={() => { setProdiEdit(null); setProdiForm({ name: "", code: "" }); setProdiOpen(true); }} data-testid="add-prodi-button" className="bg-[#064E3B] hover:bg-[#043E2F]"><Plus className="w-4 h-4 mr-1" />Tambah</Button>
          </div>
          <div className="divide-y">
            {!selectedFak && <p className="p-6 text-center text-slate-400 text-sm">Pilih fakultas di sebelah kiri.</p>}
            {selectedFak && prodi.length === 0 && <p className="p-6 text-center text-slate-400 text-sm">Belum ada prodi.</p>}
            {prodi.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50" data-testid={`prodi-item-${p.id}`}>
                <div className="flex-1">
                  <p className="font-medium text-slate-800">{p.name}</p>
                  {p.code && <p className="text-xs text-slate-400">{p.code}</p>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setProdiEdit(p.id); setProdiForm({ name: p.name, code: p.code || "" }); setProdiOpen(true); }} data-testid={`edit-prodi-${p.id}`}><Pencil className="w-4 h-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => delProdi(p)} data-testid={`delete-prodi-${p.id}`} className="text-rose-600"><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Fakultas dialog */}
      <Dialog open={fakOpen} onOpenChange={setFakOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{fakEdit ? "Edit Fakultas" : "Tambah Fakultas"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label className="text-xs">Nama Fakultas</Label><Input data-testid="fakultas-name-input" value={fakForm.name} onChange={(e) => setFakForm({ ...fakForm, name: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs">Kode (opsional)</Label><Input data-testid="fakultas-code-input" value={fakForm.code} onChange={(e) => setFakForm({ ...fakForm, code: e.target.value })} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFakOpen(false)}>Batal</Button>
            <Button onClick={saveFak} data-testid="save-fakultas-button" className="bg-[#064E3B] hover:bg-[#043E2F]">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prodi dialog */}
      <Dialog open={prodiOpen} onOpenChange={setProdiOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{prodiEdit ? "Edit Prodi" : "Tambah Prodi"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label className="text-xs">Nama Program Studi</Label><Input data-testid="prodi-name-input" value={prodiForm.name} onChange={(e) => setProdiForm({ ...prodiForm, name: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs">Kode (opsional)</Label><Input data-testid="prodi-code-input" value={prodiForm.code} onChange={(e) => setProdiForm({ ...prodiForm, code: e.target.value })} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProdiOpen(false)}>Batal</Button>
            <Button onClick={saveProdi} data-testid="save-prodi-button" className="bg-[#064E3B] hover:bg-[#043E2F]">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
