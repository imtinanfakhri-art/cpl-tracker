import { useEffect, useMemo, useRef, useState } from "react";
import api, { apiError } from "@/lib/api";
import {
  CATEGORIES, CATEGORY_MAP, CRITERIA_MAP, codesByCategory, computeScores, predicateFor, fmt,
  TAHUN_AKADEMIK, SEMESTER_TYPES, KELAS, SEMESTER_NUMBERS,
} from "@/lib/cpl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Save, Trash2, Pencil, X, Loader2, Upload, FileDown, Search } from "lucide-react";
import { toast } from "sonner";

export default function InputNilai() {
  const [fakultas, setFakultas] = useState([]);
  const [prodi, setProdi] = useState([]);
  const [matkul, setMatkul] = useState([]);
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState(null);
  const [tblSearch, setTblSearch] = useState("");
  const [tblTahun, setTblTahun] = useState("all");
  const [tblKelas, setTblKelas] = useState("all");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  const [form, setForm] = useState({
    fakultas_id: "", prodi_id: "", mata_kuliah_id: "",
    tahun_akademik: TAHUN_AKADEMIK[TAHUN_AKADEMIK.length - 3],
    semester_type: "Ganjil", kelas: "A", semester_number: "I",
  });
  const [scores, setScores] = useState({});
  const [catFilter, setCatFilter] = useState("all");

  useEffect(() => { api.get("/fakultas").then((r) => setFakultas(r.data)); }, []);
  useEffect(() => {
    if (!form.fakultas_id) { setProdi([]); return; }
    api.get("/prodi", { params: { fakultas_id: form.fakultas_id } }).then((r) => setProdi(r.data));
  }, [form.fakultas_id]);
  useEffect(() => {
    if (!form.prodi_id) { setMatkul([]); return; }
    api.get("/matakuliah", { params: { prodi_id: form.prodi_id } }).then((r) => setMatkul(r.data));
  }, [form.prodi_id]);

  const loadGrades = () => api.get("/grades").then((r) => setGrades(r.data));
  useEffect(() => { loadGrades(); }, []);

  const selectedMk = useMemo(() => matkul.find((m) => m.id === form.mata_kuliah_id), [matkul, form.mata_kuliah_id]);
  const activeCodes = selectedMk?.cpl_codes || [];

  const preview = useMemo(() => computeScores(scores), [scores]);
  const previewPred = predicateFor(preview.total);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const resetForm = () => {
    setEditId(null);
    setScores({});
    setForm((f) => ({ ...f, mata_kuliah_id: "" }));
  };

  const save = async () => {
    if (!form.fakultas_id || !form.prodi_id || !form.mata_kuliah_id) {
      toast.error("Lengkapi Fakultas, Prodi, dan Mata Kuliah.");
      return;
    }
    const cleanScores = {};
    activeCodes.forEach((c) => {
      const v = scores[c];
      if (v !== undefined && v !== null && v !== "" && !Number.isNaN(Number(v))) cleanScores[c] = Number(v);
    });
    if (Object.keys(cleanScores).length === 0) {
      toast.error("Isi minimal satu nilai kriteria CPL.");
      return;
    }
    setLoading(true);
    try {
      const payload = { ...form, scores: cleanScores };
      if (editId) await api.put(`/grades/${editId}`, payload);
      else await api.post("/grades", payload);
      toast.success(editId ? "Data nilai diperbarui" : "Data nilai tersimpan");
      resetForm();
      loadGrades();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const startEdit = async (g) => {
    setEditId(g.id);
    setForm({
      fakultas_id: g.fakultas_id, prodi_id: g.prodi_id, mata_kuliah_id: g.mata_kuliah_id,
      tahun_akademik: g.tahun_akademik, semester_type: g.semester_type, kelas: g.kelas, semester_number: g.semester_number,
    });
    setScores(g.scores || {});
    setCatFilter("all");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const del = async (id) => {
    if (!window.confirm("Hapus data nilai ini?")) return;
    await api.delete(`/grades/${id}`);
    toast.success("Data dihapus");
    loadGrades();
  };

  const filteredGrades = useMemo(() => grades.filter((g) => {
    if (tblTahun !== "all" && g.tahun_akademik !== tblTahun) return false;
    if (tblKelas !== "all" && g.kelas !== tblKelas) return false;
    if (tblSearch && !`${g.mata_kuliah_name} ${g.mata_kuliah_code} ${g.prodi_name}`.toLowerCase().includes(tblSearch.toLowerCase())) return false;
    return true;
  }), [grades, tblTahun, tblKelas, tblSearch]);

  const CSV_HEADERS = ["Kode Mata Kuliah", "Tahun Akademik", "Semester", "Kelas", "Semester Mahasiswa", "CPL-S1", "CPL-S2", "CPL-S3", "CPL-P1", "CPL-P2", "CPL-P3", "CPL-P4", "CPL-KU1", "CPL-KU2", "CPL-KK1", "CPL-KK2", "CPL-KK3"];

  const downloadTemplate = () => {
    const example = ["TI301", "2024-2025", "Ganjil", "A", "V", "80", "85", "78", "90", "", "", "", "88", "82", "95", "90", "85"];
    const csv = CSV_HEADERS.join(",") + "\n" + example.join(",") + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "template-nilai-cpl.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) { toast.error("File CSV kosong atau tidak valid."); return; }
    const header = lines[0].split(",").map((h) => h.trim());
    const idx = (name) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
    const cKode = idx("Kode Mata Kuliah"), cTahun = idx("Tahun Akademik"), cSem = idx("Semester"), cKelas = idx("Kelas"), cSemMhs = idx("Semester Mahasiswa");
    const cplCols = header.map((h, i) => ({ h, i })).filter((x) => x.h.toUpperCase().startsWith("CPL-"));
    const rows = [];
    for (let r = 1; r < lines.length; r++) {
      const cells = lines[r].split(",");
      const code = (cells[cKode] || "").trim();
      if (!code) continue;
      const scores = {};
      cplCols.forEach(({ h, i }) => { const v = (cells[i] || "").trim(); if (v !== "" && !Number.isNaN(Number(v))) scores[h.toUpperCase()] = Number(v); });
      rows.push({ mata_kuliah_code: code, tahun_akademik: (cells[cTahun] || "").trim(), semester_type: (cells[cSem] || "").trim(), kelas: (cells[cKelas] || "").trim(), semester_number: (cells[cSemMhs] || "").trim(), scores });
    }
    if (!rows.length) { toast.error("Tidak ada baris valid di CSV."); return; }
    setImporting(true);
    try {
      const { data } = await api.post("/grades/bulk", { rows });
      toast.success(`${data.created} data nilai berhasil diimpor`);
      if (data.errors?.length) toast.warning(`${data.errors.length} baris gagal: ${data.errors.slice(0, 2).join("; ")}`);
      loadGrades();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const visibleCats = catFilter === "all" ? CATEGORIES : CATEGORIES.filter((c) => c.key === catFilter);

  return (
    <div className="fade-up">
      <div className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Input Nilai CPL</h1>
        <p className="text-sm text-slate-500 mt-1">Masukkan nilai tiap kriteria CPL per mata kuliah, tahun akademik, dan kelas.</p>
      </div>

      <Card className="p-6 mb-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Fakultas">
            <Select value={form.fakultas_id} onValueChange={(v) => { set("fakultas_id", v); set("prodi_id", ""); set("mata_kuliah_id", ""); }}>
              <SelectTrigger data-testid="cpl-input-form-faculty-select"><SelectValue placeholder="Pilih fakultas" /></SelectTrigger>
              <SelectContent>{fakultas.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Program Studi">
            <Select value={form.prodi_id} onValueChange={(v) => { set("prodi_id", v); set("mata_kuliah_id", ""); }} disabled={!form.fakultas_id}>
              <SelectTrigger data-testid="cpl-input-form-prodi-select"><SelectValue placeholder="Pilih prodi" /></SelectTrigger>
              <SelectContent>{prodi.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Mata Kuliah">
            <Select value={form.mata_kuliah_id} onValueChange={(v) => set("mata_kuliah_id", v)} disabled={!form.prodi_id}>
              <SelectTrigger data-testid="cpl-input-form-course-select"><SelectValue placeholder="Pilih mata kuliah" /></SelectTrigger>
              <SelectContent>{matkul.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Tahun Akademik">
            <Select value={form.tahun_akademik} onValueChange={(v) => set("tahun_akademik", v)}>
              <SelectTrigger data-testid="cpl-input-form-academic-year-select"><SelectValue /></SelectTrigger>
              <SelectContent>{TAHUN_AKADEMIK.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Semester">
            <Select value={form.semester_type} onValueChange={(v) => set("semester_type", v)}>
              <SelectTrigger data-testid="cpl-input-form-semester-type-select"><SelectValue /></SelectTrigger>
              <SelectContent>{SEMESTER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Kelas">
            <Select value={form.kelas} onValueChange={(v) => set("kelas", v)}>
              <SelectTrigger data-testid="cpl-input-form-class-select"><SelectValue /></SelectTrigger>
              <SelectContent>{KELAS.map((k) => <SelectItem key={k} value={k}>Kelas {k}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Semester Mahasiswa">
            <Select value={form.semester_number} onValueChange={(v) => set("semester_number", v)}>
              <SelectTrigger data-testid="cpl-input-form-semester-number-select"><SelectValue /></SelectTrigger>
              <SelectContent>{SEMESTER_NUMBERS.map((s) => <SelectItem key={s} value={s}>Semester {s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Filter Kategori CPL">
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger data-testid="cpl-input-form-category-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kategori</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c.key} value={c.key}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </Card>

      {/* Criteria inputs */}
      {selectedMk ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {visibleCats.map((cat) => {
              const codes = codesByCategory(cat.key).filter((c) => activeCodes.includes(c));
              if (!codes.length) return null;
              return (
                <Card key={cat.key} className="p-5 shadow-sm" data-testid={`cpl-category-block-${cat.key}`}>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-3 h-3 rounded-full" style={{ background: cat.color }} />
                    <h3 className="font-display font-semibold text-slate-800">{cat.name}</h3>
                    <Badge variant="outline" className="ml-auto">Bobot {cat.weight}%</Badge>
                  </div>
                  <div className="space-y-3">
                    {codes.map((code) => (
                      <div key={code} className="flex items-center gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-800">{code}</p>
                          <p className="text-xs text-slate-500 leading-snug">{CRITERIA_MAP[code].label}</p>
                        </div>
                        <Input
                          type="number" min="0" max="100" step="0.01" placeholder="0-100"
                          data-testid={`cpl-score-input-${code.toLowerCase()}`}
                          value={scores[code] ?? ""}
                          onChange={(e) => setScores((s) => ({ ...s, [code]: e.target.value }))}
                          className="w-28 text-right font-mono"
                        />
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Live preview */}
          <div>
            <Card className="p-6 shadow-sm sticky top-6" data-testid="cpl-preview-card">
              <h3 className="font-display font-semibold text-slate-800 mb-4">Pratinjau Perhitungan</h3>
              <div className="space-y-2.5 mb-4">
                {CATEGORIES.map((c) => (
                  <div key={c.key} className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">{c.name} <span className="text-xs">({c.weight}%)</span></span>
                    <span className="font-mono font-semibold text-slate-800">{fmt(preview.category_averages[c.key])}</span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-4">
                <p className="text-xs text-slate-500">Rata-rata Total (Terbobot)</p>
                <p className="font-mono text-4xl font-extrabold text-[#064E3B]">{fmt(preview.total)}</p>
                <div className={`inline-block mt-2 px-3 py-1 rounded-full border text-sm font-semibold ${previewPred.color}`}>
                  {previewPred.grade} — {previewPred.predicate}
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <Button onClick={save} disabled={loading} data-testid="save-cpl-grade-button" className="flex-1 bg-[#064E3B] hover:bg-[#043E2F]">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  {editId ? "Perbarui" : "Simpan"}
                </Button>
                {editId && (
                  <Button variant="outline" onClick={resetForm} data-testid="cancel-edit-button"><X className="w-4 h-4" /></Button>
                )}
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <Card className="p-10 text-center text-slate-400 shadow-sm">Pilih mata kuliah untuk mulai memasukkan nilai CPL.</Card>
      )}

      {/* CSV Import */}
      <Card className="mt-8 p-5 shadow-sm border-emerald-200 bg-emerald-50/40" data-testid="csv-import-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display font-semibold text-slate-800 flex items-center gap-2"><Upload className="w-4 h-4 text-[#064E3B]" />Impor Nilai Massal (CSV)</h3>
            <p className="text-xs text-slate-500 mt-1">Unggah banyak data nilai sekaligus. Gunakan template agar kolom sesuai.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadTemplate} data-testid="download-template-button"><FileDown className="w-4 h-4 mr-2" />Template CSV</Button>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleImport} className="hidden" data-testid="csv-file-input" />
            <Button onClick={() => fileRef.current?.click()} disabled={importing} data-testid="import-csv-button" className="bg-[#064E3B] hover:bg-[#043E2F]">
              {importing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}Unggah CSV
            </Button>
          </div>
        </div>
      </Card>

      {/* Existing records */}
      <Card className="mt-6 shadow-sm overflow-hidden">
        <div className="p-5 border-b flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display font-semibold text-slate-800">Data Nilai Tersimpan</h3>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Cari mata kuliah / prodi..." value={tblSearch} onChange={(e) => setTblSearch(e.target.value)} data-testid="grades-search-input" className="pl-9 w-56 h-9" />
            </div>
            <Select value={tblTahun} onValueChange={setTblTahun}>
              <SelectTrigger className="w-[140px] h-9" data-testid="grades-year-filter"><SelectValue placeholder="Tahun" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Semua Tahun</SelectItem>{TAHUN_AKADEMIK.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={tblKelas} onValueChange={setTblKelas}>
              <SelectTrigger className="w-[120px] h-9" data-testid="grades-class-filter"><SelectValue placeholder="Kelas" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Semua Kelas</SelectItem>{KELAS.map((k) => <SelectItem key={k} value={k}>Kelas {k}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="grades-table">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Mata Kuliah</th>
                <th className="text-left px-4 py-3">Prodi</th>
                <th className="text-left px-4 py-3">Tahun / Sem</th>
                <th className="text-left px-4 py-3">Kelas</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-center px-4 py-3">Predikat</th>
                <th className="text-right px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredGrades.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-slate-400">Belum ada data nilai.</td></tr>
              )}
              {filteredGrades.map((g) => {
                const p = predicateFor(g.total_score);
                return (
                  <tr key={g.id} className="border-t hover:bg-slate-50/60" data-testid={`grade-row-${g.id}`}>
                    <td className="px-4 py-3 font-medium text-slate-800">{g.mata_kuliah_name}</td>
                    <td className="px-4 py-3 text-slate-500">{g.prodi_name}</td>
                    <td className="px-4 py-3 text-slate-500">{g.tahun_akademik} · {g.semester_type}</td>
                    <td className="px-4 py-3 text-slate-500">{g.kelas} / {g.semester_number}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">{fmt(g.total_score)}</td>
                    <td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${p.color}`}>{p.grade}</span></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(g)} data-testid={`edit-grade-${g.id}`}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => del(g.id)} data-testid={`delete-grade-${g.id}`} className="text-rose-600 hover:text-rose-700"><Trash2 className="w-4 h-4" /></Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="text-xs text-slate-600 mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}
