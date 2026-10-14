import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../data/supabase.js'
import { buscarPerfil } from '../data/usuarios.js'
import { AuthCtx } from './contexto.js'
import { usuarioParaEmail } from './usuario.js'

const AVISO_BLOQUEADO = 'Acesso bloqueado. Fale com o administrador.'

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(null)
  const [carregandoSessao, setCarregandoSessao] = useState(true)
  // { id, perfil, erro }: o perfil lido para aquele usuário. Comparar o id
  // evita mostrar o perfil de uma sessão anterior.
  const [lido, setLido] = useState(null)
  const [revalidacao, setRevalidacao] = useState(0)
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session)
      setCarregandoSessao(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nova) => {
      setSessao(nova)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const idDoUsuario = sessao?.user?.id ?? null

  // Lê o perfil de quem entrou, e de novo quando a aba volta ao foco: é assim
  // que um bloqueio feito enquanto o app estava aberto chega à tela.
  useEffect(() => {
    if (!idDoUsuario) return undefined
    let cancelado = false
    buscarPerfil(idDoUsuario)
      .then((perfil) => { if (!cancelado) setLido({ id: idDoUsuario, perfil, erro: false }) })
      .catch(() => {
        if (cancelado) return
        // Falha de rede não é bloqueio: mantém o que já se sabia.
        setLido((anterior) => anterior?.id === idDoUsuario
          ? { ...anterior, erro: true }
          : { id: idDoUsuario, perfil: undefined, erro: true })
      })
    return () => { cancelado = true }
  }, [idDoUsuario, revalidacao])

  useEffect(() => {
    const aoVoltar = () => setRevalidacao((n) => n + 1)
    window.addEventListener('focus', aoVoltar)
    return () => window.removeEventListener('focus', aoVoltar)
  }, [])

  const doUsuario = sessao && lido?.id === idDoUsuario ? lido : null
  const perfilLido = doUsuario ? doUsuario.perfil : undefined // undefined: ainda lendo
  const perfil = perfilLido && perfilLido.ativo ? perfilLido : null
  const semAcesso = perfilLido !== undefined && !perfil // lido, e não pode entrar

  // Sem perfil ou bloqueado: encerra a sessão e deixa um aviso para a tela de login.
  useEffect(() => {
    if (!sessao || !semAcesso) return
    supabase.auth.signOut().then(() => setAviso(AVISO_BLOQUEADO))
  }, [sessao, semAcesso])

  const recarregarPerfil = useCallback(() => setRevalidacao((n) => n + 1), [])

  async function entrar(usuario, senha) {
    setAviso('')
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

  const falhouAoLer = Boolean(sessao) && perfilLido === undefined && Boolean(doUsuario?.erro)
  const carregando = carregandoSessao
    || (Boolean(sessao) && perfilLido === undefined && !falhouAoLer)

  const valor = {
    sessao,
    usuario: sessao?.user ?? null,
    perfil,
    carregando,
    aviso,
    erroPerfil: falhouAoLer,
    recarregarPerfil,
    entrar,
    sair,
  }
  return <AuthCtx.Provider value={valor}>{children}</AuthCtx.Provider>
}
