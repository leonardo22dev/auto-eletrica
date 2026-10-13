import { supabase } from './supabase.js'
import { STATUS, podeTransicionar } from '../lib/status.js'
import { totalDoItem } from '../lib/dinheiro.js'
import { normalizarPlaca } from '../lib/placa.js'
import { hojeISO } from '../lib/datas.js'

const CAMPOS_LISTA =
  'id, numero, status, cliente_nome, veiculo_placa, veiculo_descricao, ' +
  'data_abertura, data_conclusao, total_centavos'

export async function listarOrdens({
  termo = '', status = '', veiculoId = '', clienteId = '', limite = 100,
} = {}) {
  let q = supabase.from('ordens_servico').select(CAMPOS_LISTA)
    .order('data_abertura', { ascending: false })
    .order('numero', { ascending: false, nullsFirst: false })
    .limit(limite)

  if (status) q = q.eq('status', status)
  if (veiculoId) q = q.eq('veiculo_id', veiculoId)
  if (clienteId) q = q.eq('cliente_id', clienteId)

  const t = termo.trim()
  if (t) {
    const filtros = [
      `cliente_nome.ilike.%${t}%`,
      `veiculo_placa.ilike.%${normalizarPlaca(t)}%`,
    ]
    if (/^\d+$/.test(t)) filtros.push(`numero.eq.${t}`)
    q = q.or(filtros.join(','))
  }

  const { data, error } = await q
  if (error) throw new Error('Não foi possível listar as ordens de serviço.')
  return data
}

export async function buscarOrdem(id) {
  const { data, error } = await supabase
    .from('ordens_servico')
    .select('*, itens:os_itens(*)')
    .eq('id', id).single()
  if (error) throw new Error('Ordem de serviço não encontrada.')
  data.itens.sort((a, b) => a.posicao - b.posicao)
  return data
}

export async function ultimaOrdemDoVeiculo(veiculoId) {
  const { data, error } = await supabase
    .from('ordens_servico')
    .select(CAMPOS_LISTA)
    .eq('veiculo_id', veiculoId)
    .eq('status', STATUS.FINALIZADA)
    .order('data_conclusao', { ascending: false, nullsFirst: false })
    .limit(1).maybeSingle()
  if (error) throw new Error('Não foi possível consultar o histórico do veículo.')
  return data
}

// `veiculo.descricao` que chega aqui vem de descricaoVeiculo(veiculo), em
// src/data/veiculos.js — é a string que fica congelada e vai impressa no PDF.
function linhasDeItens(osId, itens) {
  return itens
    .filter((i) => String(i.descricao || '').trim() !== '')
    .map((i, indice) => ({
      os_id: osId,
      posicao: indice + 1,
      quantidade: Number(i.quantidade) || 1,
      descricao: String(i.descricao).trim(),
      valor_unitario_centavos: Number(i.valor_unitario_centavos) || 0,
      valor_total_centavos: totalDoItem(i.quantidade, i.valor_unitario_centavos),
    }))
}

export async function criarOrdem({ cliente, veiculo, itens = [],
                                   status = STATUS.ORCAMENTO, observacoes = '' }) {
  const { data: sessao } = await supabase.auth.getUser()
  const { data: os, error } = await supabase.from('ordens_servico').insert({
    status,
    cliente_id: cliente.id,
    veiculo_id: veiculo.id,
    cliente_nome: cliente.nome,
    cliente_telefone: cliente.telefone,
    veiculo_descricao: veiculo.descricao,
    veiculo_placa: normalizarPlaca(veiculo.placa),
    observacoes: observacoes || null,
    data_aprovacao: status === STATUS.ORCAMENTO ? null : new Date().toISOString(),
    criado_por: sessao?.user?.id ?? null,
  }).select().single()
  if (error) throw new Error('Não foi possível criar a ordem de serviço.')

  const linhas = linhasDeItens(os.id, itens)
  if (linhas.length) {
    const { error: erroItens } = await supabase.from('os_itens').insert(linhas)
    if (erroItens) throw new Error('A OS foi criada, mas os itens não foram salvos.')
  }
  return buscarOrdem(os.id)
}

// Substitui o conjunto de itens. O total é recalculado pelo trigger do banco.
export async function atualizarItens(osId, itens) {
  const { error: erroApaga } = await supabase
    .from('os_itens').delete().eq('os_id', osId)
  if (erroApaga) throw new Error('Não foi possível atualizar os itens.')

  const linhas = linhasDeItens(osId, itens)
  if (linhas.length) {
    const { error } = await supabase.from('os_itens').insert(linhas)
    if (error) throw new Error('Não foi possível salvar os itens.')
  }
}

export async function mudarStatus(osId, novoStatus) {
  const atual = await buscarOrdem(osId)
  if (!podeTransicionar(atual.status, novoStatus)) {
    throw new Error(`Não é possível ir de ${atual.status} para ${novoStatus}.`)
  }
  if (novoStatus === STATUS.CANCELADA) {
    await cancelarOrdem(osId)
    return buscarOrdem(osId)
  }

  const campos = { status: novoStatus }
  if (novoStatus === STATUS.APROVADA) campos.data_aprovacao = new Date().toISOString()
  if (novoStatus === STATUS.FINALIZADA && !atual.data_conclusao) {
    campos.data_conclusao = hojeISO()
  }

  const { error } = await supabase
    .from('ordens_servico').update(campos).eq('id', osId)
  if (error) throw new Error('Não foi possível mudar o status.')
  return buscarOrdem(osId)
}

// Devolve true quando o número foi devolvido à sequence.
export async function cancelarOrdem(osId) {
  const { data, error } = await supabase.rpc('cancelar_os', { p_os_id: osId })
  if (error) throw new Error('Não foi possível cancelar a ordem de serviço.')
  return Boolean(data)
}

export async function registrarPdfDaOrdem(osId, caminho) {
  const { error } = await supabase.from('ordens_servico')
    .update({ pdf_path: caminho, pdf_gerado_em: new Date().toISOString() })
    .eq('id', osId)
  if (error) throw new Error('Não foi possível registrar o PDF da OS.')
}
