import { Navigate } from 'react-router-dom'
import { useAuth } from './contexto.js'
import { ehAdmin } from './perfil.js'

// Esconde a rota de quem não é administrador. É cortesia: o banco é que barra.
export default function SomenteAdmin({ children }) {
  const { perfil } = useAuth()
  if (!ehAdmin(perfil)) return <Navigate to="/" replace />
  return children
}
