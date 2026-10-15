import { supabase } from './supabase.js'
import { condicaoIlike } from './filtros.js'
import { STATUS, podeTransicionar } from '../lib/status.js'
import { normalizarPlaca } from '../lib/placa.js'
import { validarItens } from '../os/validarItens.js'
import { validarDadosDaOs } from '../os/dadosOs.js'

const CAMPOS_LISTA =
  'id, numero, status, cliente_nome, cliente_telefone, veiculo_placa, ' +
  'veiculo_descricao, data_os, total_centavos, ' +
  'aceite_em, assinatura_codigo, assinatura_expira_em'

const CAMPOS_LISTA_COM_ITEM = `${CAMPOS_LISTA}, itens:os_itens(posicao, descricao)`

export function servicoPrincipal(os) {
  const itens = os?.itens || []
  if (itens.length === 0) return ''
  const primeiro = itens.slice().sort((a, b) => a.posicao - b.posicao)[0]
  const extras = itens.length - 1
  return extras > 0 ? `${primeiro.descricao} (+${extras})` : primeiro.descricao
}

export async function listarOrdens({
  termo = '', status = '', emAberto = false, limite = 100, comItens = false,
} = {}) {
  let q = supabase.from('ordens_servico')
    .select(comItens ? CAMPOS_LISTA_COM_ITEM : CAMPOS_LISTA)
    .order('data_os', { ascending: false })
    .order('numero', { ascending: false, nullsFirst: false })
    .limit(limite)

  if (status) q = q.eq('status', status)

  // Filtrado no banco, antes do limite. Filtrar depois, no cliente, recortaria
  // por data e esconderia um orçamento antigo esperando resposta — justamente
  // o que a tela de Início existe para mostrar. `in` é um filtro próprio,
  // combinado por and, então convive com o `or` da busca.
  if (emAberto) q = q.in('status', [STATUS.ORCAMENTO, STATUS.APROVADA])

  const t = termo.trim()
  if (t) {
    const filtros = [
      condicaoIlike('cliente_nome', t),
      condicaoIlike('veiculo_placa', normalizarPlaca(t)),
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
    .from('ordens_servico').select('*, itens:os_itens(*)').eq('id', id).single()
  if (error) throw new Error('Ordem de serviço não encontrada.')
  data.itens.sort((a, b) => a.posicao - b.posicao)
  return data
}

// Sem cadastro, a memória do sistema são as próprias OS. Esta consulta é o
// que faz a placa continuar sendo um atalho: devolve o que foi digitado da
// última vez naquele carro, para a tela oferecer.
export async function ultimaOsDaPlaca(placa) {
  const p = normalizarPlaca(placa)
  if (!p) return null
  const { data, error } = await supabase
    .from('ordens_servico')
    .select('numero, data_os, cliente_nome, cliente_telefone, veiculo_descricao, veiculo_placa')
    .eq('veiculo_placa', p)
    // OS cancelada foi abandonada; sugerir o que ela tinha seria propagar erro.
    .neq('status', STATUS.CANCELADA)
    .order('data_os', { ascending: false })
    .order('numero', { ascending: false, nullsFirst: false })
    .limit(1).maybeSingle()
  if (error) throw new Error('Não foi possível consultar o histórico da placa.')
  return data
}

export async function ultimaOsFinalizadaDaPlaca(placa) {
  const p = normalizarPlaca(placa)
  if (!p) return null
  const { data, error } = await supabase
    .from('ordens_servico')
    .select(CAMPOS_LISTA_COM_ITEM)
    .eq('veiculo_placa', p)
    .eq('status', STATUS.FINALIZADA)
    .order('data_os', { ascending: false })
    .limit(1).maybeSingle()
  if (error) throw new Error('Não foi possível consultar a garantia da placa.')
  return data
}

export async function criarOrdem({ dados, itens = [],
                                   status = STATUS.ORCAMENTO, observacoes = '' }) {
  const campos = validarDadosDaOs(dados)
  if (campos.erro) throw new Error(campos.erro)
  const { erro, itens: linhas } = validarItens(itens)
  if (erro) throw new Error(erro)

  const { data: sessao } = await supabase.auth.getSession()
  const { data: os, error } = await supabase.from('ordens_servico').insert({
    ...campos.dados,
    status,
    observacoes: observacoes || null,
    data_aprovacao: status === STATUS.ORCAMENTO ? null : new Date().toISOString(),
    criado_por: sessao?.session?.user?.id ?? null,
  }).select().single()
  if (error) throw new Error('Não foi possível criar a ordem de serviço.')

  if (linhas.length) await substituirItens(os.id, linhas)
  return buscarOrdem(os.id)
}

export async function atualizarDadosDaOs(osId, dados) {
  const campos = validarDadosDaOs(dados)
  if (campos.erro) throw new Error(campos.erro)
  const { error } = await supabase
    .from('ordens_servico').update(campos.dados).eq('id', osId)
  if (error) throw new Error('Não foi possível salvar os dados da OS.')
  return buscarOrdem(osId)
}

// Troca o conjunto de itens numa transação só, no banco. Em duas requisições
// separadas, uma falha depois do delete deixava a OS sem item nenhum e com
// total zero — documento emitido destruído sem cópia.
async function substituirItens(osId, linhas) {
  const { error } = await supabase.rpc('substituir_itens', {
    p_os_id: osId, p_itens: linhas,
  })
  if (error) throw new Error('Não foi possível salvar os itens.')
}

export async function atualizarItens(osId, itens) {
  const { erro, itens: linhas } = validarItens(itens)
  if (erro) throw new Error(erro)
  await substituirItens(osId, linhas)
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
  if (novoStatus === STATUS.FINALIZADA) campos.finalizada_em = new Date().toISOString()

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

const BUCKET_PDFS = 'os-pdfs'

// Exclusão definitiva, só para administrador (o banco confere). O PDF publicado
// sai primeiro: se o arquivo ficasse, o link já enviado por WhatsApp continuaria
// abrindo o documento de uma OS que não existe mais. Se a exclusão no banco
// falhar depois disso, a OS continua lá e o PDF é regerado no próximo envio.
export async function excluirOrdem(os) {
  if (os.pdf_path) {
    const { error: erroPdf } = await supabase.storage.from(BUCKET_PDFS).remove([os.pdf_path])
    if (erroPdf) throw new Error('Não foi possível apagar o PDF da OS. Tente de novo.')
  }
  const { error } = await supabase.rpc('excluir_os', { p_os_id: os.id })
  if (error) {
    throw new Error(/acesso_negado/.test(error.message)
      ? 'Só o administrador pode excluir uma OS.'
      : 'Não foi possível excluir a OS.')
  }
}

// O registro mínimo do que foi excluído. Só o administrador lê (RLS).
export async function listarOsExcluidas({ limite = 50 } = {}) {
  const { data, error } = await supabase
    .from('os_excluidas')
    .select('*')
    .order('excluida_em', { ascending: false })
    .order('id', { ascending: false })
    .limit(limite)
  if (error) throw new Error('Não foi possível ler as OS excluídas.')
  return data ?? []
}
