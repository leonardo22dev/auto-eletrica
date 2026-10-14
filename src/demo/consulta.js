// Tradutor do pouco de PostgREST que a aplicação usa para SQL, para o modo
// demonstração rodar contra um Postgres de verdade no navegador.
//
// Não é um cliente Supabase: cobre exatamente as formas de consulta que
// src/data/*.js constrói, e nada além. Qualquer consulta nova precisa passar
// por aqui — é de propósito, para a demonstração não divergir em silêncio.

// Separa "id, nome, itens:os_itens(posicao, descricao)" nas colunas da
// tabela e nos relacionamentos embutidos, respeitando os parênteses.
export function separarSelect(texto) {
  const colunas = []
  const embutidos = []

  let atual = ''
  let profundidade = 0
  const partes = []

  for (const ch of String(texto || '*')) {
    if (ch === '(') profundidade++
    if (ch === ')') profundidade--
    if (ch === ',' && profundidade === 0) {
      partes.push(atual)
      atual = ''
      continue
    }
    atual += ch
  }
  if (atual.trim() !== '') partes.push(atual)

  for (const parte of partes) {
    const limpo = parte.trim()
    const m = limpo.match(/^(?:([\w]+):)?([\w]+)\((.*)\)$/)
    if (m) {
      embutidos.push({
        apelido: m[1] || m[2],
        tabela: m[2],
        colunas: m[3].split(',').map((c) => c.trim()).filter(Boolean),
      })
    } else if (limpo !== '') {
      colunas.push(limpo)
    }
  }

  return { colunas, embutidos }
}

// Traduz uma condição do formato `coluna.operador.valor`, onde o valor pode
// vir entre aspas justamente para conter vírgula e parêntese.
export function condicaoParaSql(condicao, params) {
  const m = String(condicao).match(/^([\w]+)\.(eq|ilike|is|gte|lte)\.(.*)$/s)
  if (!m) throw new Error(`Condição não suportada no modo demonstração: ${condicao}`)

  const [, coluna, operador, bruto] = m

  let valor = bruto
  if (valor.startsWith('"') && valor.endsWith('"')) {
    valor = valor.slice(1, -1).replace(/\\(["\\])/g, '$1')
  }

  if (operador === 'ilike') {
    params.push(valor)
    return `${coluna} ilike $${params.length}`
  }
  if (operador === 'is') {
    return `${coluna} is ${valor === 'null' ? 'null' : valor}`
  }
  if (operador === 'eq' && /^-?\d+$/.test(valor)) {
    // Número entra literal: o or= do PostgREST não tem como tipar o parâmetro,
    // e comparar bigint com texto quebraria.
    return `${coluna} = ${valor}`
  }

  params.push(valor)
  const simbolo = { eq: '=', gte: '>=', lte: '<=' }[operador]
  return `${coluna} ${simbolo} $${params.length}`
}

function clausulaOnde(filtros, params) {
  const partes = filtros.map((f) => {
    if (f.tipo === 'or') {
      const dentro = separarCondicoes(f.expressao)
        .map((c) => condicaoParaSql(c, params))
        .join(' or ')
      // Entre parênteses para não vazar sobre os filtros vizinhos.
      return `(${dentro})`
    }
    if (f.tipo === 'ilike') {
      params.push(f.valor)
      return `${f.coluna} ilike $${params.length}`
    }
    params.push(f.valor)
    return `${f.coluna} = $${params.length}`
  })
  return partes.length ? ` where ${partes.join(' and ')}` : ''
}

// Corta a lista do `or` nas vírgulas de fora das aspas.
function separarCondicoes(expressao) {
  const saida = []
  let atual = ''
  let dentroDeAspas = false
  let escapando = false

  for (const ch of String(expressao)) {
    if (escapando) { atual += ch; escapando = false; continue }
    if (ch === '\\') { atual += ch; escapando = true; continue }
    if (ch === '"') dentroDeAspas = !dentroDeAspas
    if (ch === ',' && !dentroDeAspas) { saida.push(atual); atual = ''; continue }
    atual += ch
  }
  if (atual.trim() !== '') saida.push(atual)
  return saida.map((c) => c.trim()).filter(Boolean)
}

export function montarSelect({ tabela, colunas, filtros, ordens, limite }) {
  const params = []
  let sql = `select ${colunas.join(', ')} from ${tabela}`
  sql += clausulaOnde(filtros, params)

  if (ordens?.length) {
    const partes = ordens.map((o) => {
      let p = `${o.coluna} ${o.crescente === false ? 'desc' : 'asc'}`
      if (o.nulosPrimeiro === true) p += ' nulls first'
      if (o.nulosPrimeiro === false) p += ' nulls last'
      return p
    })
    sql += ` order by ${partes.join(', ')}`
  }

  if (limite) sql += ` limit ${Number(limite)}`
  return { sql, params }
}
