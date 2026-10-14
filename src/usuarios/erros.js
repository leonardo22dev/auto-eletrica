const MENSAGENS = {
  acesso_negado: 'Você não tem permissão para fazer isso.',
  usuario_invalido:
    'Usuário inválido. Use de 3 a 30 letras minúsculas, números, ponto, hífen ou sublinhado, sem espaço nem acento.',
  nome_invalido: 'Informe o nome da pessoa, com até 60 letras.',
  senha_invalida: 'A senha precisa ter pelo menos 8 caracteres.',
  papel_invalido: 'Escolha o nível de acesso.',
  dados_invalidos: 'Confira os dados e tente de novo.',
  usuario_em_uso: 'Já existe um usuário com esse nome.',
  usuario_nao_encontrado: 'Usuário não encontrado. Atualize a lista.',
  proprio_usuario: 'Você não pode mudar o próprio nível nem bloquear a si mesmo.',
  ultimo_admin: 'O sistema precisa de pelo menos um administrador ativo.',
}

const CODIGOS = Object.keys(MENSAGENS)

export function codigoDoErro(mensagem) {
  const texto = String(mensagem ?? '')
  return CODIGOS.find((c) => texto.includes(c)) ?? ''
}

export function mensagemDoErro(mensagem) {
  return MENSAGENS[codigoDoErro(mensagem)]
    ?? 'Não foi possível concluir. Confira a conexão e tente de novo.'
}
