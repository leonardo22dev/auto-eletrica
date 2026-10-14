import { useState } from 'react'
import { useAuth } from './contexto.js'
import { modoDemo } from '../data/supabase.js'

export default function LoginScreen() {
  const { entrar } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function aoEnviar(e) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await entrar(email, senha)
    } catch (err) {
      setErro(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="min-h-dvh bg-linear-165 from-[#1B1A1E] via-[#2A1512] to-red-dark">
      <form
        onSubmit={aoEnviar}
        className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-6 py-8 text-white"
      >
        <div className="mx-auto w-30 rounded-2xl bg-white p-3">
          <img
            src="/logo-mizuho.png"
            alt="Auto Elétrica Mizuho II"
            className="block w-full"
          />
        </div>

        <h1 className="text-center font-marca text-2xl font-bold leading-tight">
          Auto Elétrica
          <br />
          Mizuho II
        </h1>
        <p className="-mt-3 text-center text-[10px] font-semibold tracking-[0.17em] text-[#C6A9A3] uppercase">
          Ordens de Serviço
        </p>

        <div>
          <label
            htmlFor="email"
            className="mb-1.5 block text-[10px] font-bold tracking-[0.12em] text-[#C6A9A3] uppercase"
          >
            E-mail
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-12 w-full rounded-xl border-[1.5px] border-white/20 bg-white/8 px-3.5 text-base font-semibold text-white placeholder:text-[#9E918D] focus:border-white/50 focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="senha"
            className="mb-1.5 block text-[10px] font-bold tracking-[0.12em] text-[#C6A9A3] uppercase"
          >
            Senha
          </label>
          <input
            id="senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            className="h-12 w-full rounded-xl border-[1.5px] border-white/20 bg-white/8 px-3.5 text-base font-semibold text-white focus:border-white/50 focus:outline-none"
          />
        </div>

        {modoDemo && (
          <div className="rounded-xl border border-[#F2D479] bg-[#FEF3C7] px-3 py-2.5 text-[12px] leading-snug text-[#7A4A06]">
            <strong className="font-extrabold">Modo demonstração.</strong> Entre com
            qualquer e-mail e senha. Os dados são de exemplo, vivem só nesta aba e
            somem ao recarregar a página.
          </div>
        )}

        {erro && (
          <p role="alert" className="rounded-lg bg-red/20 px-3 py-2 text-sm text-[#FFC9C2]">
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="h-12 w-full rounded-xl bg-red text-base font-bold text-white disabled:opacity-60"
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>

        <span className="mt-2 text-center text-[10px] tracking-[0.06em] text-[#8A7A76]">
          LB SOFTWARES
        </span>
      </form>
    </div>
  )
}
