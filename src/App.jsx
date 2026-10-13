import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './ui/AppShell.jsx'
import Inicio from './Inicio.jsx'
import Configuracoes from './config/Configuracoes.jsx'
import ListaClientes from './clientes/ListaClientes.jsx'
import FichaCliente from './clientes/FichaCliente.jsx'
import ListaVeiculos from './veiculos/ListaVeiculos.jsx'
import FichaVeiculo from './veiculos/FichaVeiculo.jsx'
import ListaOS from './os/ListaOS.jsx'
import NovaOS from './os/NovaOS.jsx'
import DetalheOS from './os/DetalheOS.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Inicio />} />
        <Route path="os" element={<ListaOS />} />
        <Route path="os/nova" element={<NovaOS />} />
        <Route path="os/:id" element={<DetalheOS />} />
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
