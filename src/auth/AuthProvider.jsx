import { useEffect, useState } from 'react'
import { supabase } from '../data/supabase.js'
import { AuthCtx } from './contexto.js'

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session)
      setCarregando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nova) => {
      setSessao(nova)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function entrar(email, senha) {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    })
    if (error) throw new Error('E-mail ou senha incorretos.')
  }

  async function sair() {
    await supabase.auth.signOut()
  }

  const valor = { sessao, usuario: sessao?.user ?? null, carregando, entrar, sair }
  return <AuthCtx.Provider value={valor}>{children}</AuthCtx.Provider>
}
