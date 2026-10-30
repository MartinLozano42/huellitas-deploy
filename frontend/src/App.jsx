import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import UserHome from './pages/UserHome.jsx';
import UserMascotas from './pages/UserMascotas.jsx';
import UserMascotaNueva from './pages/UserMascotaNueva.jsx';
import UserMascotaEditar from './pages/UserMascotaEditar.jsx';
import UserAfichePerdida from './pages/UserAfichePerdida.jsx';
import UserMascotaDetalle from './pages/UserMascotaDetalle.jsx';
import UserQRs from './pages/UserQRs.jsx';
import UserEscanerQR from './pages/UserEscanerQR.jsx';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Usuarios from './pages/Usuarios.jsx';
import Mascotas from './pages/Mascotas.jsx';
import QRs from './pages/QRs.jsx';
import Reportes from './pages/Reportes.jsx';
import UserReportar from './pages/UserReportar.jsx';
import UserReportes from './pages/UserReportes.jsx';
import UserChat from './pages/UserChat.jsx';
import UserNotificaciones from './pages/UserNotificaciones.jsx';
import PublicQrPage from './pages/PublicQrPage.jsx';

function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('prm_user') || '{}'); } catch { return {}; }
}

function ProtectedAdmin() {
  const token = localStorage.getItem('prm_token');
  const user = getStoredUser();
  return token && user.rol === 'ADMIN' ? <Layout /> : <Navigate to="/login" replace />;
}

function ProtectedUser() {
  const token = localStorage.getItem('prm_token');
  const user = getStoredUser();
  return token && user.rol === 'USER' ? <UserHome /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/qr/:codigo" element={<PublicQrPage />} />

      <Route path="/usuario" element={<ProtectedUser />}>
        <Route index element={<div />} />
        <Route path="mascotas" element={<UserMascotas />} />
        <Route path="mascotas/nueva" element={<UserMascotaNueva />} />
        <Route path="mascotas/:id/editar" element={<UserMascotaEditar />} />
        <Route path="afiches" element={<UserAfichePerdida />} />
        <Route path="mascotas/:id" element={<UserMascotaDetalle />} />
        <Route path="qr" element={<UserQRs />} />
        <Route path="leer-qr" element={<UserEscanerQR />} />
        <Route path="reportar" element={<UserReportar />} />
        <Route path="reportes" element={<UserReportes />} />
        <Route path="chat" element={<UserChat />} />
        <Route path="chat/:id" element={<UserChat />} />
        <Route path="notificaciones" element={<UserNotificaciones />} />
      </Route>

      <Route path="/admin" element={<ProtectedAdmin />}><Route index element={<Dashboard />} /></Route>
      <Route element={<ProtectedAdmin />}>
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/mascotas" element={<Mascotas />} />
        <Route path="/qr" element={<QRs />} />
        <Route path="/reportes" element={<Reportes />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
