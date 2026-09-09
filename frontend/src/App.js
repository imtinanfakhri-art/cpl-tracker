import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import InputNilai from "@/pages/InputNilai";
import MataKuliahPage from "@/pages/MataKuliahPage";
import FakultasProdiPage from "@/pages/FakultasProdiPage";
import LaporanPage from "@/pages/LaporanPage";
import UserManagement from "@/pages/UserManagement";
import AuditLog from "@/pages/AuditLog";
import ResetPassword from "@/pages/ResetPassword";
import { Loader2 } from "lucide-react";

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null)
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  if (user === false) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route
              element={
                <Protected>
                  <Layout />
                </Protected>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/input" element={<InputNilai />} />
              <Route path="/matakuliah" element={<MataKuliahPage />} />
              <Route path="/fakultas" element={<FakultasProdiPage />} />
              <Route path="/users" element={<UserManagement />} />
              <Route path="/audit" element={<AuditLog />} />
              <Route path="/laporan" element={<LaporanPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </div>
  );
}

export default App;
