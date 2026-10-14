import { supabase } from './supabase.js'

export async function listarAtividadeDaOs(osId) {
  const { data, error } = await supabase
    .from('os_historico')
    .select('id, acao, detalhe, usuario_nome, em')
    .eq('os_id', osId)
    .order('em', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw new Error('Não foi possível carregar a atividade desta OS.')
  return data ?? []
}
