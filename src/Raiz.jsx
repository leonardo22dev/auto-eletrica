import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider.jsx'
import AuthGate from './auth/AuthGate.jsx'
import App from './App.jsx'
import PaginaAssinatura from './assinatura/PaginaAssinatura.jsx'

// A rota do cliente fica FORA do AuthGate: ele não tem login e não precisa
// de nenhuma sessão. Só ela é pública; o resto continua atrás do login.
export default function Raiz() {
  return (
    <Routes>
      <Route path="/assinar/:codigo" element={<PaginaAssinatura />} />
      <Route
        path="*"
        element={
          <AuthProvider>
            <AuthGate>
              <App />
            </AuthGate>
          </AuthProvider>
        }
      />
    </Routes>
  )
}
