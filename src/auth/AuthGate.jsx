import { useAuth } from './contexto.js'
import LoginScreen from './LoginScreen.jsx'

export default function AuthGate({ children }) {
  const { sessao, carregando } = useAuth()
  if (carregando) {
    return (
      <div className="grid min-h-dvh place-items-center text-mute">Carregando…</div>
    )
  }
  if (!sessao) return <LoginScreen />
  return children
}
