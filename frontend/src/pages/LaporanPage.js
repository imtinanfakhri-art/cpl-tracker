import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
  CATEGORIES, CATEGORY_MAP, CRITERIA, CRITERIA_MAP, predicateFor, fmt,
  TAHUN_AKADEMIK, LOGO_URL,
} from "@/lib/cpl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Printer, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, Legend,
} from "recharts";
import { toast } from "sonner";

const TYPES = [
  { key: "tahun", label: "Per Tahun Akademik" },
  { key: "matakuliah", label: "Per Mata Kuliah" },
  { key: "cpl", label: "Per Kriteria CPL" },
];

export default function LaporanPage() {
  const [reportType, setReportType] = useState("tahun");
  const [fakultas, setFakultas] = useState([]);
  const [prodi, setProdi] = useState([]);
  const [fFak, setFFak] = useState("all");
  const [fProdi, setFProdi] = useState("all");
  const [fTahun, setFTahun] = useState("all");
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.get("/fakultas").then((r) => setFakultas(r.data)); }, []);
  useEffect(() => {
    if (fFak === "all") { setProdi([]); setFProdi("all"); return; }
    api.get("/prodi", { params: { fakultas_id: fFak } }).then((r) => setProdi(r.data));
    setFProdi("all");
  }, [fFak]);

  const load = () => {
    setLoading(true);
    const params = {};
    if (fFak !== "all") params.fakultas_id = fFak;
    if (fProdi !== "all") params.prodi_id = fProdi;
    if (fTahun !== "all") params.tahun_akademik = fTahun;
    api.get("/grades", { params }).then((r) => { setGrades(r.data); setLoading(false); });
  };
  useEffect(() => { load(); }, [fFak, fProdi, fTahun]);

  // Aggregations
  const byYear = useMemo(() => {
    const g = {};
    grades.forEach((r) => {
      const k = r.tahun_akademik;
      g[k] = g[k] || { key: k, totals: [], count: 0 };
      if (r.total_score != null) g[k].totals.push(r.total_score);
      g[k].count++;
    });
    return Object.values(g).map((x) => ({ key: x.key, count: x.count, avg: x.totals.length ? +(x.totals.reduce((a, b) => a + b, 0) / x.totals.length).toFixed(2) : 0 })).sort((a, b) => a.key.localeCompare(b.key));
  }, [grades]);

  const byCourse = useMemo(() => {
    const g = {};
    grades.forEach((r) => {
      const k = r.mata_kuliah_id;
      g[k] = g[k] || { key: k, name: r.mata_kuliah_name, prodi: r.prodi_name, totals: [], count: 0 };
      if (r.total_score != null) g[k].totals.push(r.total_score);
      g[k].count++;
    });
    return Object.values(g).map((x) => ({ ...x, avg: x.totals.length ? +(x.totals.reduce((a, b) => a + b, 0) / x.totals.length).toFixed(2) : 0 })).sort((a, b) => b.avg - a.avg);
  }, [grades]);

  const byCpl = useMemo(() => {
    const sums = {};
    CRITERIA.forEach((c) => (sums[c.code] = []));
    grades.forEach((r) => {
      Object.entries(r.scores || {}).forEach(([code, val]) => { if (sums[code] && val != null) sums[code].push(val); });
    });
    return CRITERIA.map((c) => ({
      code: c.code, label: c.label, category: CATEGORY_MAP[c.category_key].name,
      color: CATEGORY_MAP[c.category_key].color,
      avg: sums[c.code].length ? +(sums[c.code].reduce((a, b) => a + b, 0) / sums[c.code].length).toFixed(2) : 0,
      count: sums[c.code].length,
    }));
  }, [grades]);

  const scopeLabel = useMemo(() => {
    const parts = [];
    parts.push(fFak === "all" ? "Semua Fakultas" : fakultas.find((f) => f.id === fFak)?.name);
    if (fProdi !== "all") parts.push(prodi.find((p) => p.id === fProdi)?.name);
    parts.push(fTahun === "all" ? "Semua Tahun Akademik" : `T.A. ${fTahun}`);
    return parts.filter(Boolean).join(" · ");
  }, [fFak, fProdi, fTahun, fakultas, prodi]);

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.setTextColor(6, 78, 59);
    doc.text("Laporan Capaian Kompetensi Lulusan (CPL)", 14, 18);
    doc.setFontSize(10); doc.setTextColor(80);
    doc.text("UIN Sunan Ampel Surabaya", 14, 25);
    doc.text(`${TYPES.find((t) => t.key === reportType).label}  |  ${scopeLabel}`, 14, 31);

    let head, body;
    if (reportType === "tahun") {
      head = [["Tahun Akademik", "Jumlah Data", "Rata-rata CPL", "Predikat"]];
      body = byYear.map((r) => [r.key, r.count, fmt(r.avg), predicateFor(r.avg).grade]);
    } else if (reportType === "matakuliah") {
      head = [["Mata Kuliah", "Prodi", "Jumlah Data", "Rata-rata CPL", "Predikat"]];
      body = byCourse.map((r) => [r.name, r.prodi, r.count, fmt(r.avg), predicateFor(r.avg).grade]);
    } else {
      head = [["Kode", "Kategori", "Kriteria", "Rata-rata", "N"]];
      body = byCpl.map((r) => [r.code, r.category, r.label, fmt(r.avg), r.count]);
    }
    autoTable(doc, { head, body, startY: 38, headStyles: { fillColor: [6, 78, 59] }, styles: { fontSize: 8 } });
    doc.save(`laporan-cpl-${reportType}.pdf`);
    toast.success("PDF berhasil diunduh");
  };

  const exportExcel = () => {
    let data;
    if (reportType === "tahun") data = byYear.map((r) => ({ "Tahun Akademik": r.key, "Jumlah Data": r.count, "Rata-rata CPL": r.avg, "Predikat": predicateFor(r.avg).grade }));
    else if (reportType === "matakuliah") data = byCourse.map((r) => ({ "Mata Kuliah": r.name, "Prodi": r.prodi, "Jumlah Data": r.count, "Rata-rata CPL": r.avg, "Predikat": predicateFor(r.avg).grade }));
    else data = byCpl.map((r) => ({ "Kode": r.code, "Kategori": r.category, "Kriteria": r.label, "Rata-rata": r.avg, "Jumlah Nilai": r.count }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan CPL");
    XLSX.writeFile(wb, `laporan-cpl-${reportType}.xlsx`);
    toast.success("Excel berhasil diunduh");
  };

  return (
    <div className="fade-up">
      <div className="no-print flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Laporan & Cetak</h1>
          <p className="text-sm text-slate-500 mt-1">Laporan diagram & tabel. Cetak atau unduh sebagai PDF.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()} data-testid="print-report-button"><Printer className="w-4 h-4 mr-2" />Cetak</Button>
          <Button variant="outline" onClick={exportExcel} data-testid="export-excel-report-button" className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"><FileSpreadsheet className="w-4 h-4 mr-2" />Excel</Button>
          <Button onClick={exportPDF} data-testid="export-pdf-report-button" className="bg-[#D97706] hover:bg-[#b45309] text-white"><Download className="w-4 h-4 mr-2" />PDF</Button>
        </div>
      </div>

      <Card className="no-print p-4 mb-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div><Label className="text-xs mb-1.5 block">Fakultas</Label>
            <Select value={fFak} onValueChange={setFFak}><SelectTrigger data-testid="report-faculty-filter"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Semua Fakultas</SelectItem>{fakultas.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><Label className="text-xs mb-1.5 block">Prodi</Label>
            <Select value={fProdi} onValueChange={setFProdi} disabled={fFak === "all"}><SelectTrigger data-testid="report-prodi-filter"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Semua Prodi</SelectItem>{prodi.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><Label className="text-xs mb-1.5 block">Tahun Akademik</Label>
            <Select value={fTahun} onValueChange={setFTahun}><SelectTrigger data-testid="report-year-filter"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Semua Tahun</SelectItem>{TAHUN_AKADEMIK.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><Label className="text-xs mb-1.5 block">Jenis Laporan</Label>
            <Tabs value={reportType} onValueChange={setReportType}>
              <TabsList className="w-full">
                {TYPES.map((t) => <TabsTrigger key={t.key} value={t.key} data-testid={`report-tab-${t.key}`} className="text-xs flex-1">{t.label.replace("Per ", "")}</TabsTrigger>)}
              </TabsList>
            </Tabs>
          </div>
        </div>
      </Card>

      {/* Printable area */}
      <div className="print-area" data-testid="report-print-area">
        <div className="flex items-center gap-4 mb-6 pb-4 border-b-2 border-[#064E3B]">
          <img src={LOGO_URL} alt="UINSA" className="w-16 h-16 object-contain" />
          <div>
            <h2 className="font-display text-xl font-bold text-[#064E3B]">Laporan Capaian Kompetensi Lulusan (CPL)</h2>
            <p className="text-sm text-slate-600">UIN Sunan Ampel Surabaya</p>
            <p className="text-xs text-slate-500 mt-0.5">{TYPES.find((t) => t.key === reportType).label} — {scopeLabel}</p>
          </div>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
        ) : grades.length === 0 ? (
          <Card className="p-10 text-center text-slate-400 shadow-sm">Tidak ada data untuk filter ini.</Card>
        ) : (
          <>
            {reportType === "tahun" && <ReportTahun rows={byYear} />}
            {reportType === "matakuliah" && <ReportCourse rows={byCourse} />}
            {reportType === "cpl" && <ReportCpl rows={byCpl} />}
          </>
        )}
      </div>
    </div>
  );
}

function GradeBadge({ score }) {
  const p = predicateFor(score);
  return <span className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${p.color}`}>{p.grade}</span>;
}

function Table({ headers, children, testid }) {
  return (
    <Card className="shadow-sm overflow-hidden mb-6">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid={testid}>
          <thead className="bg-[#064E3B] text-white text-xs uppercase">
            <tr>{headers.map((h, i) => <th key={i} className={`px-4 py-3 ${h.align === "right" ? "text-right" : h.align === "center" ? "text-center" : "text-left"}`}>{h.label}</th>)}</tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </Card>
  );
}

function ReportTahun({ rows }) {
  return (
    <>
      <Card className="p-5 shadow-sm mb-6">
        <h3 className="font-display font-semibold text-slate-800 mb-4">Rata-rata CPL per Tahun Akademik</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={rows}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="key" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} /><Tooltip />
            <Bar dataKey="avg" fill="#064E3B" radius={[6, 6, 0, 0]} name="Rata-rata CPL" /></BarChart>
        </ResponsiveContainer>
      </Card>
      <Table testid="report-table-tahun" headers={[{ label: "Tahun Akademik" }, { label: "Jumlah Data", align: "center" }, { label: "Rata-rata CPL", align: "right" }, { label: "Predikat", align: "center" }]}>
        {rows.map((r) => (
          <tr key={r.key} className="border-t hover:bg-slate-50">
            <td className="px-4 py-3 font-medium">{r.key}</td>
            <td className="px-4 py-3 text-center text-slate-500">{r.count}</td>
            <td className="px-4 py-3 text-right font-mono font-bold">{fmt(r.avg)}</td>
            <td className="px-4 py-3 text-center"><GradeBadge score={r.avg} /></td>
          </tr>
        ))}
      </Table>
    </>
  );
}

function ReportCourse({ rows }) {
  return (
    <>
      <Card className="p-5 shadow-sm mb-6">
        <h3 className="font-display font-semibold text-slate-800 mb-4">Rata-rata CPL per Mata Kuliah</h3>
        <ResponsiveContainer width="100%" height={Math.max(260, rows.length * 42)}>
          <BarChart data={rows} layout="vertical" margin={{ left: 20 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} /><Tooltip />
            <Bar dataKey="avg" fill="#059669" radius={[0, 6, 6, 0]} name="Rata-rata CPL" /></BarChart>
        </ResponsiveContainer>
      </Card>
      <Table testid="report-table-matakuliah" headers={[{ label: "Mata Kuliah" }, { label: "Prodi" }, { label: "Jumlah Data", align: "center" }, { label: "Rata-rata", align: "right" }, { label: "Predikat", align: "center" }]}>
        {rows.map((r) => (
          <tr key={r.key} className="border-t hover:bg-slate-50">
            <td className="px-4 py-3 font-medium">{r.name}</td>
            <td className="px-4 py-3 text-slate-500">{r.prodi}</td>
            <td className="px-4 py-3 text-center text-slate-500">{r.count}</td>
            <td className="px-4 py-3 text-right font-mono font-bold">{fmt(r.avg)}</td>
            <td className="px-4 py-3 text-center"><GradeBadge score={r.avg} /></td>
          </tr>
        ))}
      </Table>
    </>
  );
}

function ReportCpl({ rows }) {
  return (
    <>
      <Card className="p-5 shadow-sm mb-6">
        <h3 className="font-display font-semibold text-slate-800 mb-4">Rata-rata per 12 Kriteria CPL</h3>
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={rows}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="code" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} /><Tooltip />
            <Bar dataKey="avg" radius={[6, 6, 0, 0]} name="Rata-rata">{rows.map((r) => <Cell key={r.code} fill={r.color} />)}</Bar></BarChart>
        </ResponsiveContainer>
      </Card>
      <Table testid="report-table-cpl" headers={[{ label: "Kode" }, { label: "Kategori" }, { label: "Kriteria" }, { label: "Rata-rata", align: "right" }, { label: "N", align: "center" }]}>
        {rows.map((r) => (
          <tr key={r.code} className="border-t hover:bg-slate-50">
            <td className="px-4 py-3 font-mono font-semibold">{r.code}</td>
            <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />{r.category}</span></td>
            <td className="px-4 py-3 text-slate-500 text-xs max-w-md">{r.label}</td>
            <td className="px-4 py-3 text-right font-mono font-bold">{fmt(r.avg)}</td>
            <td className="px-4 py-3 text-center text-slate-500">{r.count}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
