import { useAuth } from './contexto.js'
import LoginScreen from './LoginScreen.jsx'

export default function AuthGate({ children }) {
  const { sessao, perfil, carregando, erroPerfil, recarregarPerfil } = useAuth()
  if (carregando) {
    return (
      <div className="grid min-h-dvh place-items-center text-mute">Carregando…</div>
    )
  }
  if (erroPerfil) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <p className="font-bold">Não foi possível verificar o seu acesso.</p>
          <p className="mt-1 text-sm text-mute">Confira a conexão e tente de novo.</p>
          <button
            type="button"
            onClick={recarregarPerfil}
            className="mt-4 h-12 rounded-xl bg-red px-6 font-bold text-white"
          >
            Tentar de novo
          </button>
        </div>
      </div>
    )
  }
  if (!sessao) return <LoginScreen />
  // Sessão aberta, mas sem perfil ativo: a sessão está sendo encerrada.
  if (!perfil) {
    return (
      <div className="grid min-h-dvh place-items-center text-mute">Carregando…</div>
    )
  }
  return children
}
