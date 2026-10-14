const CODIGOS = [
  'ja_assinada', 'total_divergente', 'link_invalido',
  'status_invalido', 'assinatura_invalida',
]

export function codigoDoErro(mensagem) {
  const texto = String(mensagem ?? '')
  return CODIGOS.find((c) => texto.includes(c)) ?? ''
}

// O que a tela faz com cada recusa do banco. Quase todas se resolvem relendo
// a OS: a página mostra o estado real em vez de um erro técnico.
export function acaoParaErro(mensagem) {
  switch (codigoDoErro(mensagem)) {
    case 'ja_assinada':
      return { tipo: 'recarregar', texto: '' }
    case 'total_divergente':
      return {
        tipo: 'recarregar',
        texto: 'O orçamento foi atualizado pela oficina. Confira os valores antes de assinar.',
      }
    case 'link_invalido':
    case 'status_invalido':
      return { tipo: 'recarregar', texto: '' }
    case 'assinatura_invalida':
      return { tipo: 'refazer', texto: 'Não foi possível ler a assinatura. Limpe e assine de novo.' }
    default:
      return { tipo: 'tentar', texto: 'Não foi possível enviar agora. Confira a conexão e tente de novo.' }
  }
}
