import { bancoDemo, USUARIO_DEMO_ID } from './banco.js'
import { separarSelect, montarSelect } from './consulta.js'

// Relacionamentos que a aplicação embute no select. Mapeados à mão de
// propósito: se alguém embutir um relacionamento novo, a demonstração
// quebra alto em vez de devolver dado faltando em silêncio.
const RELACOES = {
  'ordens_servico.os_itens': {
    chaveLocal: 'id', tabela: 'os_itens', chaveRemota: 'os_id', lista: true,
  },
}


const USUARIO_DEMO = {
  id: USUARIO_DEMO_ID,
  email: 'demonstracao@mizuho.local',
}

function erro(mensagem, code) {
  return { data: null, error: { message: mensagem, code } }
}

class Consulta {
  constructor(tabela) {
    this.tabela = tabela
    this.operacao = 'select'
    this.textoSelect = '*'
    this.filtros = []
    this.ordens = []
    this.limite = null
    this.corpo = null
    this.unico = null
  }

  select(texto = '*') {
    if (this.operacao === 'select') this.textoSelect = texto
    else this.retornar = texto
    return this
  }

  insert(linhas) { this.operacao = 'insert'; this.corpo = linhas; return this }
  update(campos) { this.operacao = 'update'; this.corpo = campos; return this }
  delete() { this.operacao = 'delete'; return this }

  eq(coluna, valor) { this.filtros.push({ tipo: 'eq', coluna, valor }); return this }
  neq(coluna, valor) { this.filtros.push({ tipo: 'neq', coluna, valor }); return this }
  in(coluna, valor) { this.filtros.push({ tipo: 'in', coluna, valor }); return this }
  ilike(coluna, valor) { this.filtros.push({ tipo: 'ilike', coluna, valor }); return this }
  or(expressao) { this.filtros.push({ tipo: 'or', expressao }); return this }

  order(coluna, opcoes = {}) {
    this.ordens.push({
      coluna,
      crescente: opcoes.ascending !== false,
      nulosPrimeiro: opcoes.nullsFirst,
    })
    return this
  }

  limit(n) { this.limite = n; return this }
  single() { this.unico = 'obrigatorio'; return this }
  maybeSingle() { this.unico = 'opcional'; return this }

  then(resolver, rejeitar) {
    return this.executar().then(resolver, rejeitar)
  }

  async executar() {
    try {
      const db = await bancoDemo()
      const linhas = await this[`fazer_${this.operacao}`](db)
      const comEmbutidos = await this.embutir(db, linhas)

      if (this.unico) {
        if (comEmbutidos.length === 0) {
          return this.unico === 'opcional'
            ? { data: null, error: null }
            : erro('Nenhum registro encontrado', 'PGRST116')
        }
        return { data: comEmbutidos[0], error: null }
      }
      return { data: comEmbutidos, error: null }
    } catch (e) {
      // 23505 é a violação de unicidade, que a aplicação trata por código.
      const code = /duplicate key|unique constraint/i.test(e.message) ? '23505' : undefined
      return erro(e.message, code)
    }
  }

  async fazer_select(db) {
    const { colunas } = separarSelect(this.textoSelect)
    const { sql, params } = montarSelect({
      tabela: this.tabela,
      colunas: colunas.length ? colunas : ['*'],
      filtros: this.filtros,
      ordens: this.ordens,
      limite: this.limite,
    })
    const r = await db.query(sql, params)
    return r.rows
  }

  async fazer_insert(db) {
    const linhas = Array.isArray(this.corpo) ? this.corpo : [this.corpo]
    const salvas = []
    for (const linha of linhas) {
      const campos = Object.keys(linha).filter((k) => linha[k] !== undefined)
      const marcadores = campos.map((_, i) => `$${i + 1}`)
      const valores = campos.map((c) => linha[c])
      const r = await db.query(
        `insert into ${this.tabela} (${campos.join(', ')})
         values (${marcadores.join(', ')}) returning *`,
        valores,
      )
      salvas.push(r.rows[0])
    }
    return salvas
  }

  async fazer_update(db) {
    const campos = Object.keys(this.corpo)
    const params = campos.map((c) => this.corpo[c])
    const atribuicoes = campos.map((c, i) => `${c} = $${i + 1}`)
    const condicoes = this.filtros.map((f) => {
      params.push(f.valor)
      return `${f.coluna} = $${params.length}`
    })
    const onde = condicoes.length ? ` where ${condicoes.join(' and ')}` : ''
    const r = await db.query(
      `update ${this.tabela} set ${atribuicoes.join(', ')}${onde} returning *`, params)
    return r.rows
  }

  async fazer_delete(db) {
    const params = []
    const condicoes = this.filtros.map((f) => {
      params.push(f.valor)
      return `${f.coluna} = $${params.length}`
    })
    const onde = condicoes.length ? ` where ${condicoes.join(' and ')}` : ''
    await db.query(`delete from ${this.tabela}${onde}`, params)
    return []
  }

  async embutir(db, linhas) {
    const { embutidos } = separarSelect(
      this.operacao === 'select' ? this.textoSelect : (this.retornar || '*'))
    if (embutidos.length === 0 || linhas.length === 0) return linhas

    for (const emb of embutidos) {
      const relacao = RELACOES[`${this.tabela}.${emb.tabela}`]
      if (!relacao) {
        throw new Error(
          `Relacionamento ${this.tabela}.${emb.tabela} não mapeado no modo demonstração.`)
      }
      const chaves = [...new Set(linhas.map((l) => l[relacao.chaveLocal]))].filter(Boolean)
      if (chaves.length === 0) continue

      const colunas = emb.colunas.includes('*')
        ? ['*']
        : [...new Set([...emb.colunas, relacao.chaveRemota])]
      const marcadores = chaves.map((_, i) => `$${i + 1}`)
      const r = await db.query(
        `select ${colunas.join(', ')} from ${relacao.tabela}
          where ${relacao.chaveRemota} in (${marcadores.join(', ')})`, chaves)

      for (const linha of linhas) {
        const filhas = r.rows.filter(
          (f) => f[relacao.chaveRemota] === linha[relacao.chaveLocal])
        linha[emb.apelido] = relacao.lista ? filhas : (filhas[0] ?? null)
      }
    }
    return linhas
  }
}

async function chamarRpc(nome, args) {
  const db = await bancoDemo()
  try {
    const chaves = Object.keys(args || {})
    const marcadores = chaves.map((_, i) => `$${i + 1}`)
    const valores = chaves.map((c) => {
      const v = args[c]
      return typeof v === 'object' && v !== null ? JSON.stringify(v) : v
    })
    const r = await db.query(
      `select ${nome}(${marcadores.join(', ')}) as resultado`, valores)
    return { data: r.rows[0]?.resultado ?? null, error: null }
  } catch (e) {
    return erro(e.message)
  }
}

let sessao = null
const ouvintes = new Set()

function avisar() {
  for (const fn of ouvintes) fn('SIGNED_IN', sessao)
}

export const clienteDemo = {
  from: (tabela) => new Consulta(tabela),
  rpc: (nome, args) => chamarRpc(nome, args),

  auth: {
    async getSession() { return { data: { session: sessao }, error: null } },
    async getUser() { return { data: { user: sessao?.user ?? null }, error: null } },
    // Qualquer e-mail e senha entram: é uma demonstração, não um sistema
    // com conta de verdade. O aviso na tela deixa isso explícito.
    async signInWithPassword({ email }) {
      sessao = { user: { ...USUARIO_DEMO, email: email || USUARIO_DEMO.email } }
      avisar()
      return { data: { session: sessao }, error: null }
    },
    async signOut() { sessao = null; avisar(); return { error: null } },
    onAuthStateChange(fn) {
      ouvintes.add(fn)
      return { data: { subscription: { unsubscribe: () => ouvintes.delete(fn) } } }
    },
  },

  storage: {
    from: () => ({
      // Sem servidor para hospedar, o PDF vira um endereço local do próprio
      // navegador: abre nesta aba, mas não é um link que se envie a ninguém.
      async upload(caminho, blob) {
        urlsDePdf.set(caminho, URL.createObjectURL(blob))
        return { data: { path: caminho }, error: null }
      },
      getPublicUrl(caminho) {
        return { data: { publicUrl: urlsDePdf.get(caminho) || '#' } }
      },
    }),
  },
}

const urlsDePdf = new Map()
