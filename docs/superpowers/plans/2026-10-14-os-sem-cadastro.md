# OS sem cadastro — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a ordem de serviço autossuficiente — nome, telefone, veículo, placa e data digitados nela — removendo os cadastros de cliente e de veículo.

**Architecture:** As colunas que hoje são cópia congelada na `ordens_servico` passam a ser a fonte. As tabelas `clientes` e `veiculos` são removidas, e a sugestão por placa e o aviso de garantia passam a consultar as próprias OS, por uma coluna já indexada.

**Tech Stack:** Vite · React 19 · Tailwind 4 · Supabase · PGlite (testes e modo demonstração) · Vitest

**Spec:** `docs/superpowers/specs/2026-10-14-os-sem-cadastro-design.md`
**Spec anterior, ainda em vigor onde não contradito:** `docs/superpowers/specs/2026-10-13-mizuho-os-design.md`

## Global Constraints

- Idioma de toda a interface, mensagens e nomes de código: **português do Brasil**.
- Dinheiro é **inteiro em centavos** em toda a aplicação e no banco.
- Placa é gravada e consultada **normalizada**: maiúscula, sem hífen, sem espaço.
- Datas puras são `date` no banco e string `YYYY-MM-DD` no JS. **Nunca** `new Date('YYYY-MM-DD')`.
- A OS passa a ter **uma data só**: `data_os`, editável, nasce com hoje.
- A garantia conta de `data_os` quando a OS está finalizada, usando `configuracoes.garantia_meses`.
- Tokens: `--red #CC2E1E` · `--ink #141414` · `--bg #F6F4F2` · `--paper #FFFFFF` · `--line #E4E1DE`.
- Alvo de toque mínimo **48px**.
- Nada de cadastro: nenhuma tela cria cliente ou veículo, e nenhum código grava em tabela que não seja `ordens_servico`, `os_itens` ou `configuracoes`.

## Review Focus

1. **Placa escrita de outro jeito** — `abc-1234`, `ABC-1234` e `ABC1234` precisam achar a mesma sugestão e a mesma garantia. → Tarefa 5 (exercita as consultas da Tarefa 1 contra Postgres real).
2. **OS cancelada como sugestão** — se a última OS da placa foi cancelada, a sugestão tem de vir da anterior, não dela. → Tarefa 5.
3. **Placa sem histórico** — primeira vez daquele carro: nenhuma sugestão, nenhum aviso, tela não quebra. → Tarefa 5.
4. **Data editada para trás** — a garantia passa a contar da data digitada, e o documento imprime essa data. → Tarefa 5.
5. **Nome ou veículo em branco** — recusado antes de gravar, com mensagem que diz qual campo falta; o banco também recusa, como segunda barreira. → Tarefa 1 (validação e check do banco) e Tarefa 5 (caminho completo).

---

## Estrutura de arquivos

**Removidos por completo:**

```
src/data/clientes.js
src/data/veiculos.js
src/data/veiculos.test.js
src/clientes/      ListaClientes.jsx  FichaCliente.jsx  FormCliente.jsx  SelecionarCliente.jsx
src/veiculos/      ListaVeiculos.jsx  FichaVeiculo.jsx  FormVeiculo.jsx
```

**Criados:**

```
src/os/dadosOs.js          validação dos campos da OS — puro
src/os/dadosOs.test.js
src/os/CamposDaOs.jsx      placa, data, nome, telefone, veículo — usado na Nova OS e no Detalhe
supabase/migrations/0006_os_sem_cadastro.sql
```

**Modificados:**

```
src/data/ordens.js         consultas por placa, criarOrdem com campos diretos, data_os
src/os/NovaOS.jsx          fluxo sem cadastro
src/os/DetalheOS.jsx       cabeçalho editável
src/os/ListaOS.jsx         vira o Histórico
src/Inicio.jsx             lista as OS em aberto
src/ui/AppShell.jsx        três abas
src/App.jsx                rotas sem cliente e sem veículo
src/pdf/dadosDocumento.js  data_os no lugar de data_conclusao || data_abertura
src/demo/banco.js          semente sem clientes e veículos
src/demo/cliente.js        operador neq, sem relações de cadastro
src/demo/consulta.js       operador neq
src/demo/fluxo.test.js     fluxo sem cadastro
supabase/schema.test.js    schema sem cadastro
README.md
```

---

## Task 1: Banco e camada de dados

**Files:**
- Create: `supabase/migrations/0006_os_sem_cadastro.sql`, `src/os/dadosOs.js`, `src/os/dadosOs.test.js`
- Modify: `src/data/ordens.js`, `src/pdf/dadosDocumento.js`, `src/pdf/dadosDocumento.test.js`, `supabase/schema.test.js`, `src/demo/consulta.js`, `src/demo/consulta.test.js`, `src/demo/cliente.js`
- Test: os acima

**Interfaces:**
- Consumes: `normalizarPlaca`, `hojeISO`, `STATUS`, `validarItens`, `condicaoIlike`.
- Produces:
  - `validarDadosDaOs(dados) -> { erro: string, dados: object }`
  - `ultimaOsDaPlaca(placa) -> Promise<Sugestao|null>` com `{ cliente_nome, cliente_telefone, veiculo_descricao, veiculo_placa, numero, data_os }`
  - `ultimaOsFinalizadaDaPlaca(placa) -> Promise<OS|null>` (com `itens`, para `servicoPrincipal`)
  - `criarOrdem({ dados, itens, status, observacoes }) -> Promise<OS>`
  - `atualizarDadosDaOs(osId, dados) -> Promise<OS>`

- [ ] **Step 1: Teste da validação dos campos (vai falhar)**

`src/os/dadosOs.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { validarDadosDaOs, CAMPOS_VAZIOS } from './dadosOs.js'

const bom = {
  veiculo_placa: 'ABC1234',
  data_os: '2026-10-14',
  cliente_nome: 'João Silva',
  cliente_telefone: '(11) 98888-7777',
  veiculo_descricao: 'GM Chevette 1982',
}

describe('validarDadosDaOs', () => {
  it('aceita os campos completos e normaliza a placa', () => {
    const r = validarDadosDaOs({ ...bom, veiculo_placa: 'abc-1234' })
    expect(r.erro).toBe('')
    expect(r.dados.veiculo_placa).toBe('ABC1234')
  })

  it('apara espaço das pontas', () => {
    const r = validarDadosDaOs({ ...bom, cliente_nome: '  João Silva  ' })
    expect(r.dados.cliente_nome).toBe('João Silva')
  })

  // Review Focus 5: campo em branco precisa dizer qual é.
  it('recusa sem nome, dizendo qual campo falta', () => {
    const r = validarDadosDaOs({ ...bom, cliente_nome: '   ' })
    expect(r.erro).toContain('nome')
  })

  it('recusa sem descrição do veículo', () => {
    const r = validarDadosDaOs({ ...bom, veiculo_descricao: '' })
    expect(r.erro).toContain('veículo')
  })

  it('recusa placa inválida', () => {
    expect(validarDadosDaOs({ ...bom, veiculo_placa: 'ABC12' }).erro).toContain('laca')
    expect(validarDadosDaOs({ ...bom, veiculo_placa: '' }).erro).toContain('laca')
  })

  it('recusa data fora do formato', () => {
    expect(validarDadosDaOs({ ...bom, data_os: '14/10/2026' }).erro).toContain('ata')
    expect(validarDadosDaOs({ ...bom, data_os: '' }).erro).toContain('ata')
  })

  it('aceita telefone vazio, que é opcional', () => {
    const r = validarDadosDaOs({ ...bom, cliente_telefone: '' })
    expect(r.erro).toBe('')
    expect(r.dados.cliente_telefone).toBe(null)
  })

  it('CAMPOS_VAZIOS traz a data de hoje e o resto em branco', () => {
    const v = CAMPOS_VAZIOS()
    expect(v.data_os).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(v.cliente_nome).toBe('')
    expect(v.veiculo_placa).toBe('')
  })
})
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm test -- dadosOs`
Expected: FAIL — `Cannot find module './dadosOs.js'`

- [ ] **Step 3: Implementar `src/os/dadosOs.js`**

```js
import { normalizarPlaca, placaValida } from '../lib/placa.js'
import { hojeISO } from '../lib/datas.js'

export function CAMPOS_VAZIOS() {
  return {
    veiculo_placa: '',
    data_os: hojeISO(),
    cliente_nome: '',
    cliente_telefone: '',
    veiculo_descricao: '',
  }
}

// Única porta de entrada dos dados da OS. A tela chama antes de salvar, e a
// camada de dados chama de novo: sem cadastro por trás, estes campos são o
// documento, e documento com campo em branco não se emite.
export function validarDadosDaOs(entrada) {
  const d = entrada || {}
  const nome = String(d.cliente_nome || '').trim()
  const veiculo = String(d.veiculo_descricao || '').trim()
  const placa = normalizarPlaca(d.veiculo_placa)
  const data = String(d.data_os || '')
  const telefone = String(d.cliente_telefone || '').trim()

  if (!placaValida(placa)) {
    return { erro: 'Informe a placa do veículo (ABC1234 ou ABC1D23).', dados: null }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return { erro: 'Informe a data da OS.', dados: null }
  }
  if (nome === '') {
    return { erro: 'Informe o nome do cliente.', dados: null }
  }
  if (veiculo === '') {
    return { erro: 'Informe o veículo.', dados: null }
  }

  return {
    erro: '',
    dados: {
      veiculo_placa: placa,
      data_os: data,
      cliente_nome: nome,
      cliente_telefone: telefone || null,
      veiculo_descricao: veiculo,
    },
  }
}
```

- [ ] **Step 4: Rodar e confirmar PASS**

Run: `npm test -- dadosOs`
Expected: PASS, 8 testes.

- [ ] **Step 5: Escrever o teste do schema novo, antes da migration**

Este passo vem antes da migration de propósito: o teste precisa ser visto
falhando contra o schema velho, senão não prova nada.

Em `supabase/schema.test.js`, **substitua** `semearClienteEVeiculo` e `criarOS`
por:

```js
async function criarOS(db, extra = {}) {
  const campos = {
    cliente_nome: 'Cliente Teste',
    cliente_telefone: '(11) 98888-7777',
    veiculo_descricao: 'GM Chevette 1982',
    veiculo_placa: 'ABC1D23',
    ...extra,
  }
  const { rows: [os] } = await db.query(
    `insert into ordens_servico
       (cliente_nome, cliente_telefone, veiculo_descricao, veiculo_placa)
     values ($1, $2, $3, $4) returning id, numero, data_os`,
    [campos.cliente_nome, campos.cliente_telefone,
     campos.veiculo_descricao, campos.veiculo_placa],
  )
  return os
}
```

Troque `beforeEach` para apenas `db = await criarBanco()` e remova a variável
`semente`. Em todas as chamadas, `criarOS(db, semente)` vira `criarOS(db)`.

Em **"data de abertura"**, renomeie o bloco para **"data da OS"** e troque
`data_abertura` por `data_os` nas duas asserções.

Em **"integridade dos cadastros"**, remova os testes `recusa placa fora do
formato normalizado`, `não deixa apagar cliente que tem veículo` e `não deixa
apagar veículo que tem OS`, e acrescente:

```js
describe('OS autossuficiente', () => {
  it('não existe mais tabela de cliente nem de veículo', async () => {
    await expect(db.query('select 1 from clientes')).rejects.toThrow()
    await expect(db.query('select 1 from veiculos')).rejects.toThrow()
  })

  it('cria OS sem nenhum cadastro por trás', async () => {
    const os = await criarOS(db)
    expect(os.numero).toBeTruthy()
    const { rows } = await db.query(
      'select cliente_nome, veiculo_placa from ordens_servico where id = $1', [os.id])
    expect(rows[0].cliente_nome).toBe('Cliente Teste')
    expect(rows[0].veiculo_placa).toBe('ABC1D23')
  })

  // Review Focus 5: segunda barreira, depois da validação no app.
  it('recusa nome em branco', async () => {
    await expect(criarOS(db, { cliente_nome: '   ' })).rejects.toThrow()
  })

  it('recusa veículo em branco', async () => {
    await expect(criarOS(db, { veiculo_descricao: '' })).rejects.toThrow()
  })

  it('recusa placa fora do formato normalizado', async () => {
    await expect(criarOS(db, { veiculo_placa: 'abc-1234' })).rejects.toThrow()
  })

  it('a data da OS nasce com hoje em São Paulo', async () => {
    const { rows: [agora] } = await db.query(
      "select to_char((now() at time zone 'America/Sao_Paulo')::date,'YYYY-MM-DD') as hoje")
    const os = await criarOS(db)
    const { rows } = await db.query(
      "select to_char(data_os,'YYYY-MM-DD') as d from ordens_servico where id = $1",
      [os.id])
    expect(rows[0].d).toBe(agora.hoje)
  })
})
```

- [ ] **Step 6: Rodar e confirmar a falha**

Run: `npm test -- schema`
Expected: FAIL — `column "data_os" does not exist`, e as tabelas `clientes` e
`veiculos` ainda respondem.

- [ ] **Step 7: Escrever a migration**

`supabase/migrations/0006_os_sem_cadastro.sql`:

```sql
-- A ordem de servico passa a ser autossuficiente: nome, telefone, veiculo,
-- placa e data sao digitados nela, e os cadastros deixam de existir.

-- Uma data so, como no talao. Onde havia conclusao, ela era a data mais
-- precisa do servico - entao e ela que sobrevive.
alter table ordens_servico rename column data_abertura to data_os;
update ordens_servico set data_os = data_conclusao where data_conclusao is not null;
alter table ordens_servico drop column data_conclusao;

-- Os vinculos saem. Os indices que os usavam caem junto com as colunas.
alter table ordens_servico drop column cliente_id;
alter table ordens_servico drop column veiculo_id;

-- O que era copia congelada vira a fonte, e por isso passa a ter exigencia
-- de conteudo: documento com campo em branco nao se emite.
alter table ordens_servico
  add constraint os_nome_preenchido check (length(trim(cliente_nome)) > 0),
  add constraint os_veiculo_preenchido check (length(trim(veiculo_descricao)) > 0),
  add constraint os_placa_formato check (veiculo_placa ~ '^[A-Z0-9]{7}$');

create index ordens_data_idx on ordens_servico (data_os desc);

drop table veiculos;
drop table clientes;
```

- [ ] **Step 8: Rodar o teste do schema, agora com a migration**

O `criarBanco()` aplica todas as migrations em ordem, então a `0006` entra sozinha.

Run: `npm test -- schema`
Expected: PASS.

- [ ] **Step 9: Operador `neq` no tradutor do modo demonstração**

Em `src/demo/consulta.test.js`, acrescente dentro de `describe('condicaoParaSql')`:

```js
  it('traduz diferente de', () => {
    const params = []
    expect(condicaoParaSql('status.neq.cancelada', params)).toBe('status <> $1')
    expect(params).toEqual(['cancelada'])
  })
```

E dentro de `describe('montarSelect')`:

```js
  it('aplica o filtro de diferente', () => {
    const { sql, params } = montarSelect({
      tabela: 'ordens_servico', colunas: ['*'],
      filtros: [{ tipo: 'neq', coluna: 'status', valor: 'cancelada' }],
      ordens: [], limite: null,
    })
    expect(sql).toBe('select * from ordens_servico where status <> $1')
    expect(params).toEqual(['cancelada'])
  })
```

Run: `npm test -- consulta`
Expected: FAIL nos dois novos.

- [ ] **Step 10: Implementar o `neq`**

Em `src/demo/consulta.js`, no regex de `condicaoParaSql`, troque
`(eq|ilike|is|gte|lte)` por `(eq|neq|ilike|is|gte|lte)`, e no mapa de símbolos
troque `{ eq: '=', gte: '>=', lte: '<=' }` por
`{ eq: '=', neq: '<>', gte: '>=', lte: '<=' }`.

Em `clausulaOnde`, antes do `if (f.tipo === 'ilike')`, acrescente:

```js
    if (f.tipo === 'neq') {
      params.push(f.valor)
      return `${f.coluna} <> $${params.length}`
    }
```

Em `src/demo/cliente.js`, na classe `Consulta`, ao lado de `eq`:

```js
  neq(coluna, valor) { this.filtros.push({ tipo: 'neq', coluna, valor }); return this }
```

Run: `npm test -- consulta`
Expected: PASS.

- [ ] **Step 11: Reescrever `src/data/ordens.js`**

```js
import { supabase } from './supabase.js'
import { condicaoIlike } from './filtros.js'
import { STATUS, podeTransicionar } from '../lib/status.js'
import { normalizarPlaca } from '../lib/placa.js'
import { validarItens } from '../os/validarItens.js'
import { validarDadosDaOs } from '../os/dadosOs.js'

const CAMPOS_LISTA =
  'id, numero, status, cliente_nome, cliente_telefone, veiculo_placa, ' +
  'veiculo_descricao, data_os, total_centavos'

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

  // Orçamento e aprovada são o que está pendurado. Filtrado aqui porque o
  // `or` já está ocupado pela busca e os dois não se combinam no PostgREST.
  if (emAberto) {
    return data.filter(
      (o) => o.status === STATUS.ORCAMENTO || o.status === STATUS.APROVADA)
  }
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
```

- [ ] **Step 12: Apontar o PDF para `data_os`**

Em `src/pdf/dadosDocumento.js`, troque:

```js
    data: dataPorExtenso(os.data_conclusao || os.data_abertura),
```

por:

```js
    data: dataPorExtenso(os.data_os),
```

Em `src/pdf/dadosDocumento.test.js`, no objeto `OS`, troque as linhas
`data_abertura: '2026-08-10',` e `data_conclusao: '2026-08-12',` por
`data_os: '2026-08-12',`. Remova o teste `cai na data de abertura quando não
há conclusão` e troque o teste `usa a data de conclusão e não desloca o dia`
por:

```js
  it('imprime a data da OS, sem deslocar o dia', () => {
    const d = montarDadosDocumento(OS, CONFIG)
    expect(d.data).toEqual({ dia: '12', mes: 'agosto', ano: '2026' })
  })
```

Faça a mesma troca no objeto `OS` de `src/pdf/DocumentoOS.test.jsx`.

- [ ] **Step 13: Rodar a suíte e conferir o que quebrou**

Run: `npm test`
Expected: PASS em `dadosOs`, `schema`, `consulta`, `dadosDocumento` e
`DocumentoOS`. FALHAM `src/data/veiculos.test.js` e `src/demo/fluxo.test.js`,
que ainda testam o cadastro — é esperado, e a Tarefa 5 os substitui.

- [ ] **Step 14: Remover o teste do cadastro de veículo**

```bash
git rm src/data/veiculos.test.js
```

`descricaoVeiculo` deixa de existir: a descrição passa a ser digitada.

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "Torna a OS autossuficiente no banco e na camada de dados"
```

---

## Task 2: Nova OS sem cadastro

**Files:**
- Create: `src/os/CamposDaOs.jsx`
- Modify: `src/os/NovaOS.jsx`
- Delete: nenhum

**Interfaces:**
- Consumes: `CAMPOS_VAZIOS`, `validarDadosDaOs`, `ultimaOsDaPlaca`, `ultimaOsFinalizadaDaPlaca`, `criarOrdem`, `servicoPrincipal`, `vencimentoGarantia`, `garantiaVigente`, `formatarData`, `hojeISO`, `useConfiguracoes`.
- Produces: `<CamposDaOs campos aoMudar />`.

- [ ] **Step 1: `src/os/CamposDaOs.jsx`**

Os cinco campos do talão, usados tanto na Nova OS quanto no Detalhe. A placa
fica em caixa grande, como já está hoje na Nova OS.

```jsx
import { normalizarPlaca } from '../lib/placa.js'
import Campo from '../ui/Campo.jsx'

export default function CamposDaOs({ campos, aoMudar, erroPlaca = '' }) {
  function mudar(chave, valor) {
    aoMudar({ ...campos, [chave]: valor })
  }

  return (
    <>
      <div className="mb-3">
        <label
          htmlFor="placa"
          className="mb-1.5 block text-[10px] font-bold tracking-[0.12em] text-mute uppercase"
        >
          Placa
        </label>
        <input
          id="placa"
          value={campos.veiculo_placa}
          onChange={(e) => mudar('veiculo_placa', normalizarPlaca(e.target.value))}
          maxLength={7}
          autoCapitalize="characters"
          placeholder="ABC1D23"
          className={`h-15 w-full rounded-xl border-[1.5px] bg-paper text-center text-2xl font-extrabold tracking-[0.14em] focus:outline-none ${erroPlaca ? 'border-red' : 'border-ink'}`}
        />
        {erroPlaca && <p className="mt-1 text-xs font-semibold text-red">{erroPlaca}</p>}
      </div>

      <Campo id="data_os" rotulo="Data" tipo="date"
        valor={campos.data_os} aoMudar={(v) => mudar('data_os', v)} />
      <Campo id="cliente_nome" rotulo="Nome do cliente" autoComplete="name"
        valor={campos.cliente_nome} aoMudar={(v) => mudar('cliente_nome', v)} />
      <Campo id="cliente_telefone" rotulo="Telefone" inputMode="tel" autoComplete="tel"
        valor={campos.cliente_telefone} aoMudar={(v) => mudar('cliente_telefone', v)} />
      <Campo id="veiculo_descricao" rotulo="Veículo"
        valor={campos.veiculo_descricao} aoMudar={(v) => mudar('veiculo_descricao', v)}
        placeholder="GM Chevette 1982 — Bege" />
    </>
  )
}
```

- [ ] **Step 2: Reescrever `src/os/NovaOS.jsx`**

Substitua o arquivo inteiro. O fluxo:

```jsx
// 1. Estado: campos (CAMPOS_VAZIOS()), itens, observacoes, sugestao, ultimaFinalizada.
// 2. Ao a placa ficar válida, consulta ultimaOsDaPlaca e ultimaOsFinalizadaDaPlaca.
//    - Achou: guarda em `sugestao` e mostra o cartão verde com nome, telefone e
//      veículo da última vez, e um botão "Usar estes dados" que copia os três
//      campos. Nada é preenchido sem o toque.
//    - Review Focus 3: placa sem histórico não mostra cartão nem aviso.
// 3. Garantia: se ultimaFinalizada existe e
//    garantiaVigente(vencimentoGarantia(ultimaFinalizada.data_os, meses), hojeISO()),
//    mostra a tarja âmbar com número, servicoPrincipal e data de vencimento.
// 4. <CamposDaOs /> com os cinco campos.
// 5. <ItensEditor /> e o total fixo no rodapé, como hoje.
// 6. "Orçamento" e "Gerar OS" chamam criarOrdem({ dados: campos, itens, status,
//    observacoes }) e navegam para /os/:id. O erro da validação vai para a tela.
// 7. Rascunho: salvarRascunho({ campos, itens, observacoes }) a cada mudança;
//    ao montar, oferece retomar; limparRascunho() após criar.
```

O cartão da sugestão, em `bg-[#F0FAF2]` com borda `#BCE5C8`, como o de hoje:

```jsx
{sugestao && (
  <div className="mb-2 rounded-xl border border-[#BCE5C8] bg-[#F0FAF2] px-3 py-2.5">
    <span className="block text-[13px] font-bold">
      Última OS deste carro
      {sugestao.numero ? ` — nº ${sugestao.numero}` : ''}
    </span>
    <span className="text-[11.5px] text-[#3D6B4B]">
      {sugestao.cliente_nome}
      {sugestao.cliente_telefone ? ` · ${sugestao.cliente_telefone}` : ''}
      {` · ${sugestao.veiculo_descricao}`}
    </span>
    <button
      type="button"
      onClick={usarSugestao}
      className="mt-2 h-10 rounded-lg bg-ink px-3 text-xs font-bold text-white"
    >
      Usar estes dados
    </button>
  </div>
)}
```

```jsx
function usarSugestao() {
  setCampos((c) => ({
    ...c,
    cliente_nome: sugestao.cliente_nome,
    cliente_telefone: sugestao.cliente_telefone || '',
    veiculo_descricao: sugestao.veiculo_descricao,
  }))
}
```

- [ ] **Step 3: Remover a dependência do rascunho antigo**

O rascunho gravava `{ placa, itens, observacoes }`. Passa a gravar
`{ campos, itens, observacoes }`. Em `retomarRascunho`, use
`setCampos({ ...CAMPOS_VAZIOS(), ...(r.campos || {}) })`. Um rascunho no
formato antigo não tem `campos`, então cai no vazio sem quebrar.

- [ ] **Step 4: Verificar build e lint**

Run: `npm run lint` e `npm run build`
Expected: ambos sem saída de erro.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Reescreve a Nova OS sem cadastro, com sugestao pela placa"
```

---

## Task 3: Detalhe da OS com cabeçalho editável

**Files:**
- Modify: `src/os/DetalheOS.jsx`

**Interfaces:**
- Consumes: `atualizarDadosDaOs`, `<CamposDaOs>`, `vencimentoGarantia`, `editadaDepoisDeEmitida`.
- Produces: nada que outra tarefa consuma.

- [ ] **Step 1: Trocar o bloco de dados por campos editáveis**

Hoje o arquivo mostra uma `<dl>` com cliente, telefone, veículo e placa em
texto. Troque por um bloco que começa fechado e abre para edição:

```jsx
const [editandoDados, setEditandoDados] = useState(false)
const [campos, setCampos] = useState(null)

// Semeia os campos quando a OS chega, sem efeito — em efeito custaria um
// render extra e um piscar de campos vazios.
if (os && !campos) {
  setCampos({
    veiculo_placa: os.veiculo_placa,
    data_os: os.data_os,
    cliente_nome: os.cliente_nome,
    cliente_telefone: os.cliente_telefone || '',
    veiculo_descricao: os.veiculo_descricao,
  })
}

const salvarDados = () => executar(async () => {
  await atualizarDadosDaOs(os.id, campos)
  const atualizada = await buscar()
  setEditandoDados(false)
  setAviso('Dados salvos.')
  await regerarPdfPublicado(atualizada)
})
```

Na renderização, quando `editandoDados` for falso, o mesmo `<dl>` de hoje mais
a linha de Data; quando for verdadeiro, `<CamposDaOs campos={campos}
aoMudar={setCampos} />` e um botão **Salvar dados**. O gatilho é um botão
*Editar* no canto do bloco.

Após `buscar()`, zere `campos` com `setCampos(null)` para que ele seja semeado
de novo com o que o banco devolveu.

- [ ] **Step 2: Trocar a garantia para `data_os`**

```jsx
const vencimento = os.status === STATUS.FINALIZADA
  ? vencimentoGarantia(os.data_os, meses)
  : null
```

E no cabeçalho, troque a linha das duas datas por:

```jsx
<p className="text-[11.5px] text-[#9A9490]">{formatarData(os.data_os)}</p>
```

- [ ] **Step 3: Ajustar o duplicar**

`duplicar()` grava o rascunho no formato novo:

```jsx
function duplicar() {
  salvarRascunho({
    campos: {
      veiculo_placa: os.veiculo_placa,
      data_os: hojeISO(),
      cliente_nome: os.cliente_nome,
      cliente_telefone: os.cliente_telefone || '',
      veiculo_descricao: os.veiculo_descricao,
    },
    itens: itens.map((i) => ({
      quantidade: String(i.quantidade),
      descricao: i.descricao,
      valor_unitario_centavos: i.valor_unitario_centavos,
    })),
    observacoes: os.observacoes || '',
  })
  navegar('/os/nova')
}
```

A data da cópia é hoje, não a da OS original: é uma OS nova.

- [ ] **Step 4: Verificar build e lint**

Run: `npm run lint` e `npm run build`
Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Permite corrigir nome, placa, veiculo e data na OS aberta"
```

---

## Task 4: Início, Histórico e navegação de três abas

**Files:**
- Modify: `src/ui/AppShell.jsx`, `src/App.jsx`, `src/Inicio.jsx`, `src/os/ListaOS.jsx`
- Delete: `src/clientes/` inteiro, `src/veiculos/` inteiro, `src/data/clientes.js`, `src/data/veiculos.js`

**Interfaces:**
- Consumes: `listarOrdens({ emAberto })`.
- Produces: nada que outra tarefa consuma.

- [ ] **Step 1: Três abas em `src/ui/AppShell.jsx`**

```jsx
import { House, FileText, Settings } from 'lucide-react'

const ABAS = [
  { para: '/', rotulo: 'Início', Icone: House, exata: true },
  { para: '/os', rotulo: 'Histórico', Icone: FileText },
  { para: '/configuracoes', rotulo: 'Ajustes', Icone: Settings },
]
```

Remova o import de `Users`.

- [ ] **Step 2: Rotas em `src/App.jsx`**

```jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './ui/AppShell.jsx'
import Inicio from './Inicio.jsx'
import Configuracoes from './config/Configuracoes.jsx'
import ListaOS from './os/ListaOS.jsx'
import NovaOS from './os/NovaOS.jsx'
import DetalheOS from './os/DetalheOS.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Inicio />} />
        <Route path="os" element={<ListaOS />} />
        <Route path="os/nova" element={<NovaOS />} />
        <Route path="os/:id" element={<DetalheOS />} />
        <Route path="configuracoes" element={<Configuracoes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
```

- [ ] **Step 3: Início mostra o que está em aberto**

Em `src/Inicio.jsx`, troque a quarta consulta `listarOrdens({ limite: 8 })` por
`listarOrdens({ emAberto: true, limite: 20 })`, renomeie `recentes` para
`emAberto` e troque o título **Recentes** por **Em aberto**. O estado vazio
passa a ser:

```jsx
<EstadoVazio
  titulo="Nada em aberto"
  descricao="Todo orçamento foi respondido e todo serviço foi concluído."
  acao={<Botao onClick={() => navegar('/os/nova')}>Nova OS</Botao>}
/>
```

O cálculo do faturado do mês passa a usar `data_os`:

```js
const faturado = somarCentavos(
  finalizadas.filter((o) => o.data_os && o.data_os >= inicioDoMes)
    .map((o) => o.total_centavos),
)
```

- [ ] **Step 4: Histórico**

Em `src/os/ListaOS.jsx`, troque o título **Ordens de Serviço** por
**Histórico**, e em `LinhaOS` troque `formatarData(os.data_abertura)` por
`formatarData(os.data_os)`. O botão **Nova** sai do topo: o Histórico é só
consulta, e a Nova OS nasce no Início.

- [ ] **Step 5: Apagar o cadastro**

```bash
git rm -r src/clientes src/veiculos src/data/clientes.js src/data/veiculos.js
```

- [ ] **Step 6: Conferir que nada mais importa o removido**

Run: `grep -rn "clientes\.js\|veiculos\.js\|SelecionarCliente\|FichaVeiculo\|FormVeiculo\|descricaoVeiculo" src/`
Expected: nenhuma saída.

- [ ] **Step 7: Verificar build, lint e testes**

Run: `npm run lint`, `npm run build`, `npm test`
Expected: lint e build sem erro; `npm test` ainda falha em
`src/demo/fluxo.test.js`, que a Tarefa 5 reescreve.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Reduz a navegacao a tres abas e remove as telas de cadastro"
```

---

## Task 5: Modo demonstração e documentação

**Files:**
- Modify: `src/demo/banco.js`, `src/demo/cliente.js`, `src/demo/fluxo.test.js`, `README.md`

**Interfaces:**
- Consumes: tudo das tarefas anteriores.
- Produces: nada.

- [ ] **Step 1: Semente sem cadastro em `src/demo/banco.js`**

Substitua a constante `SEMENTE` por:

```js
const SEMENTE = `
  insert into ordens_servico
    (id, status, cliente_nome, cliente_telefone,
     veiculo_descricao, veiculo_placa, data_os, finalizada_em)
  values
    ('bbbbbbbb-1111-4111-8111-111111111111', 'finalizada',
     'João Silva', '(11) 98888-7777', 'GM Chevette 1982 — Bege', 'ABC1234',
     current_date - 18, now() - interval '18 days'),
    ('bbbbbbbb-2222-4222-8222-222222222222', 'aprovada',
     'Marcos Pereira', '(11) 97777-6666', 'VW Fusca 1975 — Azul', 'HIJ3K67',
     current_date - 3, null),
    ('bbbbbbbb-3333-4333-8333-333333333333', 'orcamento',
     'Ana Ribeiro', '(11) 96666-5555', 'Volvo V70 2003 — Prata', 'LMN4P89',
     current_date - 1, null);

  insert into os_itens
    (os_id, posicao, quantidade, descricao, valor_unitario_centavos, valor_total_centavos)
  values
    ('bbbbbbbb-1111-4111-8111-111111111111', 1, 1,
     'Alternador — recondicionamento completo', 38000, 38000),
    ('bbbbbbbb-1111-4111-8111-111111111111', 2, 1, 'Correia do alternador', 10000, 10000),
    ('bbbbbbbb-2222-4222-8222-222222222222', 1, 1, 'Limpeza de bicos injetores', 28000, 28000),
    ('bbbbbbbb-2222-4222-8222-222222222222', 2, 4, 'Vela de ignição NGK', 5000, 20000),
    ('bbbbbbbb-3333-4333-8333-333333333333', 1, 1, 'Módulo de injeção — diagnóstico', 18000, 18000),
    ('bbbbbbbb-3333-4333-8333-333333333333', 2, 1, 'Bateria Moura 60Ah', 32500, 32500);

  select setval('os_numero_seq', (select max(numero) from ordens_servico), true);
`
```

No `STUBS`, mantenha tudo — a migration `0006` ainda referencia `auth.users` e
as tabelas de storage.

- [ ] **Step 2: Relações do modo demonstração**

Em `src/demo/cliente.js`, o mapa `RELACOES` passa a ter só uma entrada:

```js
const RELACOES = {
  'ordens_servico.os_itens': {
    chaveLocal: 'id', tabela: 'os_itens', chaveRemota: 'os_id', lista: true,
  },
}
```

- [ ] **Step 3: Reescrever `src/demo/fluxo.test.js`**

```js
import { describe, it, expect, beforeAll, vi } from 'vitest'

// Percorre o modo demonstração pelas MESMAS funções que as telas chamam.
// É o que prova que o tradutor de consultas cobre as formas realmente usadas.
vi.stubEnv('VITE_MODO_DEMO', '1')

let ordens, configuracoes, STATUS, hojeISO, vencimentoGarantia, garantiaVigente

beforeAll(async () => {
  ordens = await import('../data/ordens.js')
  configuracoes = await import('../data/configuracoes.js')
  STATUS = (await import('../lib/status.js')).STATUS
  hojeISO = (await import('../lib/datas.js')).hojeISO
  const g = await import('../lib/garantia.js')
  vencimentoGarantia = g.vencimentoGarantia
  garantiaVigente = g.garantiaVigente
})

describe('modo demonstração — leitura', () => {
  it('lê as configurações semeadas', async () => {
    const c = await configuracoes.buscarConfiguracoes()
    expect(c.razao_social).toContain('MIZUHO')
  })

  it('lista OS e filtra por status', async () => {
    expect((await ordens.listarOrdens()).length).toBe(3)
    expect(await ordens.listarOrdens({ status: STATUS.ORCAMENTO })).toHaveLength(1)
  })

  it('traz só o que está em aberto', async () => {
    const abertas = await ordens.listarOrdens({ emAberto: true })
    expect(abertas).toHaveLength(2)
    expect(abertas.every((o) => o.status !== STATUS.FINALIZADA)).toBe(true)
  })

  it('busca por nome, por placa e por número', async () => {
    expect(await ordens.listarOrdens({ termo: 'Marcos' })).toHaveLength(1)
    expect(await ordens.listarOrdens({ termo: 'abc-1234' })).toHaveLength(1)
    const uma = (await ordens.listarOrdens())[0]
    expect(await ordens.listarOrdens({ termo: String(uma.numero) })).toHaveLength(1)
  })

  // Review Focus 1: a mesma placa escrita de jeitos diferentes.
  it('sugere os dados da última OS da placa, escrita de qualquer jeito', async () => {
    for (const escrita of ['ABC1234', 'abc-1234', ' abc 1234 ']) {
      const s = await ordens.ultimaOsDaPlaca(escrita)
      expect(s.cliente_nome).toBe('João Silva')
      expect(s.veiculo_descricao).toContain('Chevette')
    }
  })

  // Review Focus 3: primeira vez daquele carro.
  it('não sugere nada para placa sem histórico', async () => {
    expect(await ordens.ultimaOsDaPlaca('ZZZ9Z99')).toBe(null)
    expect(await ordens.ultimaOsFinalizadaDaPlaca('ZZZ9Z99')).toBe(null)
  })

  it('acha a última finalizada da placa, com garantia ainda vigente', async () => {
    const u = await ordens.ultimaOsFinalizadaDaPlaca('ABC1234')
    expect(u.status).toBe(STATUS.FINALIZADA)
    expect(ordens.servicoPrincipal(u)).toContain('Alternador')
    const venc = vencimentoGarantia(u.data_os, 3)
    expect(garantiaVigente(venc, hojeISO())).toBe(true)
  })
})

describe('modo demonstração — escrita', () => {
  it('cria OS digitando tudo, sem cadastro nenhum', async () => {
    const os = await ordens.criarOrdem({
      dados: {
        veiculo_placa: 'tst-1d23',
        data_os: hojeISO(),
        cliente_nome: '  Cliente de Teste  ',
        cliente_telefone: '(11) 95555-4444',
        veiculo_descricao: 'Fiat Uno 1995',
      },
      itens: [
        { quantidade: '1', descricao: 'Troca de bateria', valor_unitario_centavos: 32500 },
        { quantidade: '2', descricao: 'Lâmpada H4', valor_unitario_centavos: 1800 },
      ],
      status: STATUS.APROVADA,
    })
    expect(os.veiculo_placa).toBe('TST1D23')
    expect(os.cliente_nome).toBe('Cliente de Teste')
    expect(os.total_centavos).toBe(36100)
  })

  // Review Focus 5.
  it('recusa OS sem nome e sem veículo', async () => {
    const base = {
      veiculo_placa: 'XYZ1A23', data_os: hojeISO(),
      cliente_nome: 'Fulano', veiculo_descricao: 'Carro',
    }
    await expect(ordens.criarOrdem({ dados: { ...base, cliente_nome: '' }, itens: [] }))
      .rejects.toThrow(/nome/)
    await expect(ordens.criarOrdem({ dados: { ...base, veiculo_descricao: '' }, itens: [] }))
      .rejects.toThrow(/veículo/)
  })

  it('corrige os dados de uma OS já emitida', async () => {
    const lista = await ordens.listarOrdens({ termo: 'Marcos' })
    const os = await ordens.atualizarDadosDaOs(lista[0].id, {
      veiculo_placa: 'HIJ3K67', data_os: hojeISO(),
      cliente_nome: 'Marcos Pereira da Silva',
      cliente_telefone: '(11) 97777-6666',
      veiculo_descricao: 'VW Fusca 1975 — Azul',
    })
    expect(os.cliente_nome).toBe('Marcos Pereira da Silva')
  })

  // Review Focus 2: cancelada não serve de sugestão.
  it('ignora OS cancelada ao sugerir pela placa', async () => {
    const nova = await ordens.criarOrdem({
      dados: {
        veiculo_placa: 'ABC1234', data_os: hojeISO(),
        cliente_nome: 'Nome Errado', cliente_telefone: '',
        veiculo_descricao: 'Carro errado',
      },
      itens: [],
    })
    await ordens.cancelarOrdem(nova.id)
    const s = await ordens.ultimaOsDaPlaca('ABC1234')
    expect(s.cliente_nome).toBe('João Silva')
  })

  // Review Focus 4: a data digitada manda na garantia e no documento.
  it('conta a garantia a partir da data digitada', async () => {
    const os = await ordens.criarOrdem({
      dados: {
        veiculo_placa: 'DAT1A23', data_os: '2026-01-31',
        cliente_nome: 'Data Antiga', cliente_telefone: '',
        veiculo_descricao: 'Carro',
      },
      itens: [{ quantidade: '1', descricao: 'Serviço', valor_unitario_centavos: 1000 }],
      status: STATUS.APROVADA,
    })
    const finalizada = await ordens.mudarStatus(os.id, STATUS.FINALIZADA)
    expect(finalizada.data_os).toContain('2026-01-31')
    expect(vencimentoGarantia('2026-01-31', 3)).toBe('2026-04-30')
  })

  it('cancela a última OS e devolve o número', async () => {
    const nova = await ordens.criarOrdem({
      dados: {
        veiculo_placa: 'CAN1A23', data_os: hojeISO(),
        cliente_nome: 'Cancelado', cliente_telefone: '',
        veiculo_descricao: 'Carro',
      },
      itens: [],
    })
    expect(await ordens.cancelarOrdem(nova.id)).toBe(true)
    const depois = await ordens.buscarOrdem(nova.id)
    expect(depois.numero).toBe(null)
  })
})
```

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS em tudo.

- [ ] **Step 5: Atualizar o README**

Na seção **O que faz**, troque a linha
`- Cadastro de clientes e veículos, com a placa como atalho principal.`
por:

```markdown
- OS autossuficiente: nome, telefone, veículo, placa e data digitados nela.
- A placa consulta as OS anteriores e oferece os dados da última vez, sem cadastro.
```

Remova a linha da ficha do veículo e acrescente:

```markdown
- Histórico em tela própria, com busca por nome, placa ou número.
```

Na tabela de documentação, acrescente:

```markdown
| `docs/superpowers/specs/2026-10-14-os-sem-cadastro-design.md` | Emenda: OS sem cadastro |
```

- [ ] **Step 6: Verificar tudo e commitar**

Run: `npm test`, `npm run lint`, `npm run build`
Expected: suíte verde, lint sem saída, build concluído.

```bash
git add -A
git commit -m "Atualiza o modo demonstracao e a documentacao para a OS sem cadastro"
```

---

## Verificação manual no modo demonstração

Com `VITE_MODO_DEMO=1` no `.env.local` e `npm run dev`:

1. Entre com qualquer e-mail e senha.
2. **Início** mostra duas OS em aberto, e nenhuma finalizada.
3. **Nova OS**: digite `abc-1234`. Aparece o cartão com João Silva e a tarja de
   garantia vigente. Toque em *Usar estes dados* e os três campos se preenchem.
4. Troque a data para uma do mês passado e confira que o PDF imprime essa data.
5. Digite uma placa nova, como `XYZ1A23`: nenhum cartão, nenhum aviso.
6. Deixe o nome em branco e tente gerar: a tela recusa dizendo que falta o nome.
7. Na OS aberta, toque em *Editar*, corrija o nome e salve.
8. **Histórico**: busque por `Ana`, por `LMN4P89` e pelo número de uma OS.
9. Confira que não existe mais aba de Clientes nem de Veículos.
