import { useEffect, useState } from 'react'
import { supabase } from '../data/supabase.js'
import { AuthCtx } from './contexto.js'
import { usuarioParaEmail } from './usuario.js'

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

  async function entrar(usuario, senha) {
    const email = usuarioParaEmail(usuario)
    if (!email) throw new Error('Informe o usuário, sem espaço nem acento.')
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    })
    if (error) throw new Error('Usuário ou senha incorretos.')
  }

  async function sair() {
    await supabase.auth.signOut()
  }

  const valor = { sessao, usuario: sessao?.user ?? null, carregando, entrar, sair }
  return <AuthCtx.Provider value={valor}>{children}</AuthCtx.Provider>
}
