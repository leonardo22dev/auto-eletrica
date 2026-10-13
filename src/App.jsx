import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './ui/AppShell.jsx'
import Configuracoes from './config/Configuracoes.jsx'
import ListaClientes from './clientes/ListaClientes.jsx'
import FichaCliente from './clientes/FichaCliente.jsx'
import ListaVeiculos from './veiculos/ListaVeiculos.jsx'
import FichaVeiculo from './veiculos/FichaVeiculo.jsx'
import ListaOS from './os/ListaOS.jsx'

function EmBreve({ nome }) {
  return <p className="p-6 text-mute">{nome}</p>
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<EmBreve nome="Início" />} />
        <Route path="os" element={<ListaOS />} />
        <Route path="os/nova" element={<EmBreve nome="Nova OS" />} />
        <Route path="os/:id" element={<EmBreve nome="Detalhe da OS" />} />
        <Route path="clientes" element={<ListaClientes />} />
        <Route path="clientes/:id" element={<FichaCliente />} />
        <Route path="veiculos" element={<ListaVeiculos />} />
        <Route path="veiculos/:id" element={<FichaVeiculo />} />
        <Route path="configuracoes" element={<Configuracoes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
