import { textoParaQuantidade, totalDoItem } from '../lib/dinheiro.js'

function vazio(item) {
  return (
    String(item.descricao || '').trim() === '' &&
    !Number(item.valor_unitario_centavos)
  )
}

// Converte o que está na tela no que vai para o banco, recusando o que não
// pode ir. Linha em branco do fim do formulário é descarte legítimo; linha
// com dinheiro e sem discriminação não é — o rodapé somou aquele valor e o
// documento sairia sem ele.
export function validarItens(itens) {
  const saida = []

  for (const [indice, item] of (itens || []).entries()) {
    const linha = indice + 1
    if (vazio(item)) continue

    const descricao = String(item.descricao || '').trim()
    if (descricao === '') {
      return { erro: `Item ${linha}: falta a discriminação do serviço ou peça.`, itens: [] }
    }

    const quantidade = textoParaQuantidade(item.quantidade)
    if (quantidade === null) {
      return { erro: `Item ${linha}: quantidade inválida.`, itens: [] }
    }

    const unitario = Number(item.valor_unitario_centavos) || 0
    saida.push({
      posicao: saida.length + 1,
      quantidade,
      descricao,
      valor_unitario_centavos: unitario,
      valor_total_centavos: totalDoItem(quantidade, unitario),
    })
  }

  return { erro: '', itens: saida }
}
