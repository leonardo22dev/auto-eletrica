import { supabase } from './supabase.js'
import { codigoDoErro } from '../assinatura/erros.js'

// A mensagem técnica do banco vira um código que a tela sabe tratar.
function erroDoBanco(error, padrao) {
  const e = new Error(padrao)
  e.codigo = codigoDoErro(error?.message) || 'desconhecido'
  e.detalhe = error?.message
  return e
}

export async function gerarLinkAssinatura(osId, { renovar = false } = {}) {
  const { data, error } = await supabase.rpc('gerar_link_assinatura', {
    p_os_id: osId, p_renovar: renovar,
  })
  if (error) throw erroDoBanco(error, 'Não foi possível gerar o link de assinatura.')
  return data
}

export async function obterOsParaAssinatura(codigo) {
  const { data, error } = await supabase.rpc('obter_os_para_assinatura', {
    p_codigo: codigo,
  })
  if (error) throw erroDoBanco(error, 'Não foi possível carregar o orçamento.')
  return data
}

export async function registrarAceite({ codigo, assinatura, totalVisto }) {
  const { data, error } = await supabase.rpc('registrar_aceite', {
    p_codigo: codigo, p_assinatura: assinatura, p_total_visto: totalVisto,
  })
  if (error) throw erroDoBanco(error, 'Não foi possível registrar a assinatura.')
  return data
}
