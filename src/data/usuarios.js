import { supabase } from './supabase.js'
import { codigoDoErro, mensagemDoErro } from '../usuarios/erros.js'

function erroDoBanco(error) {
  const e = new Error(mensagemDoErro(error?.message))
  e.codigo = codigoDoErro(error?.message) || 'desconhecido'
  e.detalhe = error?.message
  return e
}

// O bloqueado ainda lê o próprio perfil (a policy deixa), e é por ele que a
// tela descobre que foi bloqueado. `null` = não existe perfil: sem acesso.
export async function buscarPerfil(userId) {
  const { data, error } = await supabase
    .from('perfis')
    .select('user_id, usuario, nome, papel, ativo')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw erroDoBanco(error)
  return data
}

export async function listarUsuarios() {
  const { data, error } = await supabase.rpc('listar_usuarios')
  if (error) throw erroDoBanco(error)
  return data ?? []
}

export async function criarUsuario({ usuario, nome, senha, papel }) {
  const { data, error } = await supabase.rpc('criar_usuario', {
    p_usuario: usuario, p_nome: nome, p_senha: senha, p_papel: papel,
  })
  if (error) throw erroDoBanco(error)
  return data
}

export async function alterarUsuario({ userId, nome, papel, ativo }) {
  const { error } = await supabase.rpc('alterar_usuario', {
    p_user_id: userId, p_nome: nome, p_papel: papel, p_ativo: ativo,
  })
  if (error) throw erroDoBanco(error)
}

export async function redefinirSenha({ userId, senha }) {
  const { error } = await supabase.rpc('redefinir_senha', {
    p_user_id: userId, p_senha: senha,
  })
  if (error) throw erroDoBanco(error)
}

// Apaga a conta de vez. O que a pessoa produziu fica: as OS dela permanecem
// (sem autor) e a atividade mantém o nome. Quem vai voltar, bloqueie.
export async function excluirUsuario({ userId }) {
  const { error } = await supabase.rpc('excluir_usuario', { p_user_id: userId })
  if (error) throw erroDoBanco(error)
}

export async function listarAtividadeDeUsuarios({ limite = 30 } = {}) {
  const { data, error } = await supabase
    .from('usuarios_historico')
    .select('id, ator_nome, alvo_usuario, acao, detalhe, em')
    .order('em', { ascending: false })
    .limit(limite)
  if (error) throw erroDoBanco(error)
  return data ?? []
}
