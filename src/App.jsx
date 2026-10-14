import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './ui/AppShell.jsx'
import Inicio from './Inicio.jsx'
import Configuracoes from './config/Configuracoes.jsx'
import ListaOS from './os/ListaOS.jsx'
import NovaOS from './os/NovaOS.jsx'
import DetalheOS from './os/DetalheOS.jsx'
import SomenteAdmin from './auth/SomenteAdmin.jsx'
import PaginaUsuarios from './usuarios/PaginaUsuarios.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Inicio />} />
        <Route path="os" element={<ListaOS />} />
        <Route path="os/nova" element={<NovaOS />} />
        <Route path="os/:id" element={<DetalheOS />} />
        <Route
          path="usuarios"
          element={<SomenteAdmin><PaginaUsuarios /></SomenteAdmin>}
        />
        <Route
          path="configuracoes"
          element={<SomenteAdmin><Configuracoes /></SomenteAdmin>}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
