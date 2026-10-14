import { totalDoItem, textoParaQuantidade, somarCentavos } from '../lib/dinheiro.js'

// Modo "Valor total": em vez de um preço por item, a oficina digita o que
// combinou com o cliente. Não há coluna nova nem flag no banco: a OS guarda os
// serviços como itens de valor zero e fecha com uma linha "Valor total" que
// leva o valor. O banco já soma os itens, então total, trava depois da
// assinatura, versão do que o cliente viu e atividade seguem valendo.
//
// O modo é derivado dos próprios itens (ehModoValorTotal): não há estado a
// manter em sincronia.

export const ROTULO_VALOR_TOTAL = 'Valor total'

const mesmoRotulo = (descricao) =>
  String(descricao ?? '').trim().toLowerCase() === ROTULO_VALOR_TOTAL.toLowerCase()

const semPreco = (item) => !Number(item.valor_unitario_centavos)

// Serviços sem preço fechados, na última linha, por "Valor total" de
// quantidade 1. Qualquer outra forma é uma OS itemizada comum.
export function ehModoValorTotal(itens) {
  if (!Array.isArray(itens) || itens.length === 0) return false
  const ultimo = itens.at(-1)
  if (!mesmoRotulo(ultimo.descricao)) return false
  if (textoParaQuantidade(ultimo.quantidade) !== 1) return false
  return itens.slice(0, -1).every(semPreco)
}

export function separarValorTotal(itens) {
  const ultimo = itens.at(-1)
  return {
    servicos: itens.slice(0, -1),
    totalCentavos: Number(ultimo?.valor_unitario_centavos) || 0,
  }
}

// Monta os itens da OS a partir dos serviços (só descrição e quantidade) e do
// valor total. Serviço em branco é descartado; nenhum serviço leva preço.
export function montarItensValorTotal(servicos, totalCentavos) {
  const lista = (servicos || [])
    .filter((s) => String(s.descricao ?? '').trim() !== '')
    .map((s) => ({
      quantidade: s.quantidade ?? '1',
      descricao: String(s.descricao).trim(),
      valor_unitario_centavos: 0,
    }))

  lista.push({
    quantidade: '1',
    descricao: ROTULO_VALOR_TOTAL,
    valor_unitario_centavos: Number(totalCentavos) || 0,
  })
  return lista
}

// Troca de "Detalhar valores" para "Valor total": as descrições ficam, os
// preços são somados no valor total. Já estando no modo, devolve como está.
export function paraModoValorTotal(itens) {
  if (ehModoValorTotal(itens)) return itens
  const soma = somarCentavos(
    (itens || []).map((i) => totalDoItem(i.quantidade, i.valor_unitario_centavos)),
  )
  return montarItensValorTotal(itens, soma)
}

// "Valor total" quando a OS foi fechada por um valor total; "Total" quando é
// a soma de itens com preço.
export function rotuloDoTotal(itens) {
  return ehModoValorTotal(itens) ? ROTULO_VALOR_TOTAL : 'Total'
}

const temDescricao = (item) => String(item.descricao ?? '').trim() !== ''

// Troca de "Valor total" para "Detalhar valores". Precisa terminar numa forma
// que NÃO pareça valor total, senão o modo (que vem dos itens) voltaria
// sozinho. Um serviço só recebe o valor como preço; com vários, a oficina
// informa o preço de cada um (veja totalDeQuemSaiu, para avisar na tela).
export function paraModoDetalhado(itens) {
  if (!ehModoValorTotal(itens)) return itens
  const { servicos, totalCentavos } = separarValorTotal(itens)
  const lista = servicos.filter(temDescricao)

  if (lista.length === 0) {
    return [{ quantidade: '1', descricao: '', valor_unitario_centavos: totalCentavos }]
  }
  if (lista.length === 1) {
    return [{ ...lista[0], valor_unitario_centavos: totalCentavos }]
  }
  return lista
}

// O valor total que a troca para "Detalhar valores" não consegue guardar (com
// vários serviços não há onde pôr): a tela mostra para o usuário redistribuir.
export function totalDeQuemSaiu(itens) {
  if (!ehModoValorTotal(itens)) return 0
  const { servicos, totalCentavos } = separarValorTotal(itens)
  return servicos.filter(temDescricao).length >= 2 ? totalCentavos : 0
}

// A linha de fechamento: o documento e a tela de assinatura mostram só o
// valor, sem quantidade nem unitário.
export function ehLinhaValorTotal(item) {
  return mesmoRotulo(item?.descricao)
}

// O documento imprime item de valor zero sem preço (colunas em branco).
export function itemSemPreco(item) {
  return !Number(item?.valor_unitario_centavos) && !Number(item?.valor_total_centavos)
}
