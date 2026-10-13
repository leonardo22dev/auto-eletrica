import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './ui/AppShell.jsx'

function EmBreve({ nome }) {
  return <p className="p-6 text-mute">{nome}</p>
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<EmBreve nome="Início" />} />
        <Route path="os" element={<EmBreve nome="Ordens de Serviço" />} />
        <Route path="os/nova" element={<EmBreve nome="Nova OS" />} />
        <Route path="os/:id" element={<EmBreve nome="Detalhe da OS" />} />
        <Route path="clientes" element={<EmBreve nome="Clientes" />} />
        <Route path="clientes/:id" element={<EmBreve nome="Cliente" />} />
        <Route path="veiculos" element={<EmBreve nome="Veículos" />} />
        <Route path="veiculos/:id" element={<EmBreve nome="Ficha do veículo" />} />
        <Route path="configuracoes" element={<EmBreve nome="Configurações" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
