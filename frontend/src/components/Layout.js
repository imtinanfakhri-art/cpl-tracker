import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LOGO_URL } from "@/lib/cpl";
import { LayoutDashboard, PencilLine, BookOpen, Building2, FileBarChart2, Users, History, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard", roles: ["admin", "kaprodi", "dosen"] },
  { to: "/input", label: "Input Nilai CPL", icon: PencilLine, testid: "nav-input", roles: ["admin", "kaprodi", "dosen"] },
  { to: "/matakuliah", label: "Mata Kuliah", icon: BookOpen, testid: "nav-matakuliah", roles: ["admin", "kaprodi"] },
  { to: "/fakultas", label: "Fakultas & Prodi", icon: Building2, testid: "nav-fakultas", roles: ["admin"] },
  { to: "/users", label: "Manajemen Pengguna", icon: Users, testid: "nav-users", roles: ["admin"] },
  { to: "/audit", label: "Log Aktivitas", icon: History, testid: "nav-audit", roles: ["admin"] },
  { to: "/laporan", label: "Laporan & Cetak", icon: FileBarChart2, testid: "nav-laporan", roles: ["admin", "kaprodi", "dosen"] },
];

const ROLE_LABEL = { admin: "Administrator", kaprodi: "Kepala Prodi", dosen: "Dosen" };

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    toast.success("Berhasil keluar");
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="no-print w-64 shrink-0 bg-[#022c22] text-slate-200 flex flex-col fixed h-screen border-r border-black/30">
        <div className="brand-gradient px-5 py-5 flex items-center gap-3 border-b border-white/10">
          <div className="bg-white rounded-xl p-1.5 shadow-lg">
            <img src={LOGO_URL} alt="UINSA" className="w-11 h-11 object-contain" />
          </div>
          <div className="leading-tight">
            <p className="font-display font-extrabold text-white text-sm">SI-CPL UINSA</p>
            <p className="text-[11px] text-amber-300/90">Capaian Kompetensi Lulusan</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1">
          {NAV.filter((item) => item.roles.includes(user?.role)).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                data-testid={item.testid}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${
                    isActive
                      ? "bg-[#064E3B] text-amber-300 border-l-4 border-amber-400 font-semibold"
                      : "text-slate-300 hover:bg-white/5 hover:text-white border-l-4 border-transparent"
                  }`
                }
              >
                <Icon className="w-[18px] h-[18px]" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="text-xs text-amber-300/90 mb-0.5 font-medium">{ROLE_LABEL[user?.role] || user?.role}</div>
          <div className="text-xs text-slate-400 mb-2 truncate" data-testid="current-user-email">
            {user?.email}
          </div>
          <Button
            onClick={handleLogout}
            variant="outline"
            size="sm"
            data-testid="logout-button"
            className="w-full bg-transparent border-white/20 text-slate-200 hover:bg-rose-600 hover:text-white hover:border-rose-600"
          >
            <LogOut className="w-4 h-4 mr-2" /> Keluar
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 ml-64 print:ml-0 min-h-screen">
        <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
