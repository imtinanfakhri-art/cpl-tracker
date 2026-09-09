import { useEffect, useState } from "react";
import api from "@/lib/api";
import { CATEGORIES, predicateFor, fmt, TAHUN_AKADEMIK } from "@/lib/cpl";
import { Card } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import { Building2, GraduationCap, BookOpen, ClipboardList, Loader2 } from "lucide-react";

const GRADE_COLORS = { A: "#059669", B: "#F59E0B", C: "#EAB308", D: "#F97316", E: "#E11D48" };

function Kpi({ icon: Icon, label, value, sub, testid }) {
  return (
    <Card className="p-5 border-border/70 shadow-sm" data-testid={testid}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="font-display text-3xl font-extrabold text-slate-900 mt-1">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
        <div className="w-11 h-11 rounded-xl bg-[#064E3B]/10 text-[#064E3B] flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fakultas, setFakultas] = useState([]);
  const [prodi, setProdi] = useState([]);
  const [fFak, setFFak] = useState("all");
  const [fProdi, setFProdi] = useState("all");
  const [fTahun, setFTahun] = useState("all");

  useEffect(() => {
    api.get("/fakultas").then((r) => setFakultas(r.data));
  }, []);

  useEffect(() => {
    if (fFak === "all") setProdi([]);
    else api.get("/prodi", { params: { fakultas_id: fFak } }).then((r) => setProdi(r.data));
    setFProdi("all");
  }, [fFak]);

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (fFak !== "all") params.fakultas_id = fFak;
    if (fProdi !== "all") params.prodi_id = fProdi;
    if (fTahun !== "all") params.tahun_akademik = fTahun;
    api.get("/reports/dashboard", { params }).then((r) => {
      setData(r.data);
      setLoading(false);
    });
  }, [fFak, fProdi, fTahun]);

  const pred = data ? predicateFor(data.counts.grades ? data.overall_average : null) : null;

  return (
    <div className="fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Dashboard CPL</h1>
          <p className="text-sm text-slate-500 mt-1">Ringkasan pencapaian kompetensi lulusan.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={fFak} onValueChange={setFFak}>
            <SelectTrigger className="w-[190px] bg-white" data-testid="dashboard-faculty-filter"><SelectValue placeholder="Fakultas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Fakultas</SelectItem>
              {fakultas.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fProdi} onValueChange={setFProdi} disabled={fFak === "all"}>
            <SelectTrigger className="w-[180px] bg-white" data-testid="dashboard-prodi-filter"><SelectValue placeholder="Prodi" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Prodi</SelectItem>
              {prodi.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fTahun} onValueChange={setFTahun}>
            <SelectTrigger className="w-[150px] bg-white" data-testid="dashboard-year-filter"><SelectValue placeholder="Tahun" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Tahun</SelectItem>
              {TAHUN_AKADEMIK.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading || !data ? (
        <div className="h-96 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <>
          {data.scope && data.scope.role !== "admin" && data.scope.prodi_name && (
            <Card className="p-5 mb-6 border-l-4 border-l-[#D97706] shadow-sm" data-testid="prodi-summary-card">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Ringkasan Prodi Anda</p>
                  <h2 className="font-display text-xl font-bold text-slate-900 mt-0.5">{data.scope.prodi_name}</h2>
                  <p className="text-sm text-slate-500">{data.scope.fakultas_name}</p>
                </div>
                <div className="flex gap-8">
                  <div className="text-center">
                    <p className="font-mono text-3xl font-extrabold text-[#064E3B]">{fmt(data.counts.grades ? data.overall_average : null)}</p>
                    <p className="text-xs text-slate-500">Rata-rata CPL</p>
                  </div>
                  <div className="text-center">
                    <p className="font-mono text-3xl font-extrabold text-slate-800">{data.counts.grades}</p>
                    <p className="text-xs text-slate-500">Data Nilai</p>
                  </div>
                  <div className="text-center">
                    <p className="font-mono text-3xl font-extrabold text-slate-800">{data.counts.matakuliah}</p>
                    <p className="text-xs text-slate-500">Mata Kuliah</p>
                  </div>
                </div>
              </div>
            </Card>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Kpi icon={Building2} label="Fakultas" value={data.counts.fakultas} testid="kpi-fakultas" />
            <Kpi icon={GraduationCap} label="Program Studi" value={data.counts.prodi} testid="kpi-prodi" />
            <Kpi icon={BookOpen} label="Mata Kuliah" value={data.counts.matakuliah} testid="kpi-matakuliah" />
            <Kpi icon={ClipboardList} label="Data Nilai" value={data.counts.grades} testid="kpi-grades" />
          </div>

          {/* Overall average banner */}
          <Card className="p-6 mb-6 brand-gradient text-white border-none overflow-hidden relative" data-testid="dashboard-weighted-average-card">
            <div className="absolute right-0 top-0 w-64 h-64 bg-amber-400/10 rounded-full blur-3xl" />
            <div className="relative flex flex-wrap items-center justify-between gap-6">
              <div>
                <p className="text-emerald-100/80 text-sm">Rata-rata Total CPL (Terbobot)</p>
                <p className="font-mono text-5xl font-extrabold mt-1 text-amber-400">{fmt(data.counts.grades ? data.overall_average : null)}</p>
                <p className="text-emerald-100/70 text-xs mt-1">
                  Predikat: <span className="font-semibold text-white">{pred?.grade} — {pred?.predicate}</span>
                </p>
              </div>
              <div className="flex gap-3 flex-wrap">
                {data.category_averages.map((c) => (
                  <div key={c.key} className="bg-white/10 backdrop-blur rounded-xl px-4 py-3 border border-white/15 min-w-[130px]">
                    <p className="text-[11px] text-emerald-100/80">{c.name} · {c.weight}%</p>
                    <p className="font-mono text-2xl font-bold">{fmt(c.average)}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Bar */}
            <Card className="p-5 lg:col-span-7 shadow-sm">
              <h3 className="font-display font-semibold text-slate-800 mb-4">Rata-rata Nilai per Kategori CPL</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.category_averages} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="average" radius={[6, 6, 0, 0]} name="Rata-rata">
                    {data.category_averages.map((c) => <Cell key={c.key} fill={c.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Pie */}
            <Card className="p-5 lg:col-span-5 shadow-sm">
              <h3 className="font-display font-semibold text-slate-800 mb-4">Distribusi Predikat</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.grade_distribution.filter((g) => g.count > 0)}
                    dataKey="count" nameKey="grade" cx="50%" cy="50%" innerRadius={55} outerRadius={95}
                    paddingAngle={3} label={(e) => `${e.grade}: ${e.count}`}
                  >
                    {data.grade_distribution.map((g) => <Cell key={g.grade} fill={GRADE_COLORS[g.grade]} />)}
                  </Pie>
                  <Tooltip formatter={(value, name, props) => [value, `Predikat ${props.payload.grade}`]} />
                  <Legend payload={data.grade_distribution.filter((g) => g.count > 0).map((g) => ({ value: `Predikat ${g.grade}`, type: "square", color: GRADE_COLORS[g.grade] }))} />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            {/* Radar */}
            <Card className="p-5 lg:col-span-12 shadow-sm">
              <h3 className="font-display font-semibold text-slate-800 mb-4">Radar 12 Kriteria CPL</h3>
              <ResponsiveContainer width="100%" height={380}>
                <RadarChart data={data.criteria_averages.map((c) => ({ subject: c.code, value: c.average }))}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Radar name="Rata-rata" dataKey="value" stroke="#064E3B" fill="#059669" fillOpacity={0.45} />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
