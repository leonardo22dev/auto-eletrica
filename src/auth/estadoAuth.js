// Regras do estado de acesso, sem React: o AuthProvider só as aplica. Ficam
// aqui para serem testadas sem montar a árvore (os efeitos não rodam em
// renderToString).

// A partir da sessão e do último perfil lido, diz em que pé está a pessoa.
//   perfilLido  undefined = ainda não leu (ou leu de outra pessoa); null = não
//               existe perfil; objeto = o perfil.
//   semAcesso   leu e não pode entrar (sem perfil, ou bloqueado).
export function derivarAcesso({ sessao, lido }) {
  const id = sessao?.user?.id ?? null
  // Comparar o id evita usar o perfil de outra sessão.
  const doUsuario = sessao && lido && lido.id === id ? lido : null
  const perfilLido = doUsuario ? doUsuario.perfil : undefined
  const perfil = perfilLido && perfilLido.ativo ? perfilLido : null
  const semAcesso = perfilLido !== undefined && !perfil
  const falhouAoLer = Boolean(sessao) && perfilLido === undefined && Boolean(doUsuario?.erro)
  const lendo = Boolean(sessao) && perfilLido === undefined && !falhouAoLer
  return { perfilLido, perfil, semAcesso, falhouAoLer, lendo }
}

// O que lembrar do perfil depois de uma mudança de sessão. Ao sair, esquece:
// se ficasse, quem foi bloqueado e reativado logo depois entraria de novo
// com o bloqueio antigo e seria deslogado em seguida, na mesma aba.
export function lidoAposSessao(lido, sessaoNova) {
  return sessaoNova ? lido : null
}
