import { rotuloPapel } from '../auth/perfil.js'

export const PAPEIS = [
  { valor: 'atendente', rotulo: 'Atendente' },
  { valor: 'admin', rotulo: 'Administrador' },
]

const FORMATO_USUARIO = /^[a-z0-9._-]{3,30}$/

export function normalizarUsuario(texto) {
  return String(texto ?? '').trim().toLowerCase()
}

export function validarSenha(senha) {
  return String(senha ?? '').length >= 8
    ? ''
    : 'A senha precisa ter pelo menos 8 caracteres.'
}

// Espelha as regras do banco só para dar a resposta na hora, antes de ir à
// rede. Quem decide é o banco: se as duas divergirem, vale a dele.
export function validarNovoUsuario({ usuario, nome, senha, papel }) {
  const erros = {}
  if (!FORMATO_USUARIO.test(normalizarUsuario(usuario))) {
    erros.usuario = 'Use de 3 a 30 letras minúsculas, números, ponto, hífen ou sublinhado, sem espaço nem acento.'
  }
  const n = String(nome ?? '').trim()
  if (n === '' || n.length > 60) erros.nome = 'Informe o nome, com até 60 letras.'
  const s = validarSenha(senha)
  if (s) erros.senha = s
  if (!PAPEIS.some((p) => p.valor === papel)) erros.papel = 'Escolha o nível de acesso.'
  return erros
}

export function acoesDoUsuario({ alvo, euId }) {
  const ehVoce = alvo.user_id === euId
  return {
    ehVoce,
    podeBloquear: !ehVoce && alvo.ativo,
    podeReativar: !ehVoce && !alvo.ativo,
    podeMudarPapel: !ehVoce,
    // Excluir vale para quem está ativo ou bloqueado; só não vale para si
    // mesmo. O banco ainda recusa excluir o último administrador ativo.
    podeExcluir: !ehVoce,
  }
}

export function textoDaAtividade({ ator_nome: quem, alvo_usuario: alvo, acao, detalhe = {} }) {
  switch (acao) {
    case 'criado':
      return `${quem} criou o usuário ${alvo} (${rotuloPapel(detalhe.papel)})`
    case 'bloqueado':
      return `${quem} bloqueou ${alvo}`
    case 'reativado':
      return `${quem} reativou ${alvo}`
    case 'senha_redefinida':
      return `${quem} redefiniu a senha de ${alvo}`
    case 'papel_alterado':
      return `${quem} mudou o nível de ${alvo} para ${rotuloPapel(detalhe.para)}`
    case 'nome_alterado':
      return `${quem} mudou o nome de ${alvo} para ${detalhe.para}`
    case 'excluido':
      return `${quem} excluiu o usuário ${alvo} (${detalhe.nome})`
    default:
      return `${quem} fez uma alteração em ${alvo}`
  }
}
