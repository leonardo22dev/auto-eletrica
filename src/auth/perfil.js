export const PAPEL = { ADMIN: 'admin', ATENDENTE: 'atendente' }

const ROTULOS = {
  [PAPEL.ADMIN]: 'Administrador',
  [PAPEL.ATENDENTE]: 'Atendente',
}

export function rotuloPapel(papel) {
  return ROTULOS[papel] ?? ''
}

export function ehAdmin(perfil) {
  return perfil?.papel === PAPEL.ADMIN && perfil?.ativo === true
}

// A tela só esconde o que o usuário não pode usar: quem barra de verdade é o
// banco. Por isso a lista é a mesma regra, e não uma lista de permissões.
export function abasDoMenu(perfil) {
  const abas = [
    { id: 'inicio', para: '/', rotulo: 'Início', exata: true },
    { id: 'historico', para: '/os', rotulo: 'Histórico' },
  ]
  if (ehAdmin(perfil)) {
    abas.push(
      { id: 'usuarios', para: '/usuarios', rotulo: 'Usuários' },
      { id: 'ajustes', para: '/configuracoes', rotulo: 'Ajustes' },
    )
  }
  return abas
}
