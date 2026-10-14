# Assinatura do cliente por link — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O cliente abre um link enviado no WhatsApp, confere a OS e assina com o dedo; o aceite trava itens e valores no banco e aparece impresso no PDF.

**Architecture:** Duas funções `security definer` no Postgres são a única porta do visitante: uma entrega *uma* OS a quem tem o código, a outra grava o aceite. A tabela continua sem política para visitante. Uma rota nova do mesmo app, fora do login, consome essas funções; o aceite é imutável e não forjável por escrita direta, garantido por gatilhos.

**Tech Stack:** Vite · React 19 · Supabase (Postgres + RPC) · PGlite (testes e demonstração) · @react-pdf/renderer · Vitest

**Spec:** `docs/superpowers/specs/2026-10-14-assinatura-do-cliente-design.md`
**Specs anteriores, em vigor onde não contradito:** `2026-10-13-mizuho-os-design.md`, `2026-10-14-os-sem-cadastro-design.md`

## Global Constraints

- Idioma de toda a interface, mensagens e nomes de código: **português do Brasil**.
- Dinheiro é **inteiro em centavos**; datas puras são texto `YYYY-MM-DD`.
- O link vale **30 dias**; o código é a concatenação de dois `gen_random_uuid()` sem hífens (244 bits, 64 caracteres hexadecimais).
- OS aceitam assinatura apenas em **orcamento** ou **aprovada**.
- Código inexistente e vencido respondem **igual** (`invalido`).
- O desenho é um PNG em data URL (`data:image/png;base64,`), **no máximo 200 000 caracteres**.
- A tabela `ordens_servico` **não** ganha política para visitante. O visitante só executa `obter_os_para_assinatura` e `registrar_aceite`.
- Depois do aceite, **itens, total e colunas do aceite não mudam**, nem por escrita direta; nome, telefone, veículo, placa e data seguem editáveis.
- Quem grava as colunas `assinatura_*`/`aceite_*` são as funções, sinalizando a transação com `set_config('mizuho.via_funcao', 'on', true)`.
- Alvo de toque mínimo **48px**; a página do cliente é pensada para celular.
- Commits em português, no imperativo.

## Review Focus

1. **Duplo toque em "Confirmar"** — o segundo pedido volta `ja_assinada`; a página tem de tratar isso como estado final, não como erro. → Tarefa 4.
2. **Código colado com lixo** — espaço, quebra de linha ou pontuação no fim, como o WhatsApp às vezes anexa. → Tarefa 2.
3. **Desenho em branco ou acidental** — um toque não pode virar assinatura. → Tarefa 3.
4. **Dono muda o valor enquanto o cliente olha** — `total_divergente`, e a tela recarrega avisando em vez de mostrar erro técnico. → Tarefas 1 e 4.
5. **Contornar a trava pela API** — escrever `aceite_*`, `total_centavos` ou itens direto, ou executar as funções internas sem login. → Tarefa 1.

---

## Estrutura de arquivos

**Criados:**

```
supabase/migrations/0007_assinatura_do_cliente.sql
supabase/atualizacao-0007.sql                  só a 0007, para colar no painel de produção
src/assinatura/codigo.js                       normalizar o código e montar o endereço
src/assinatura/estado.js                       situação do link, para o painel do dono
src/assinatura/desenho.js                      recorte, tamanho e "desenhou de verdade"
src/assinatura/erros.js                        código de erro do banco -> ação da tela
src/assinatura/QuadroAssinatura.jsx            canvas de desenho
src/assinatura/PaginaAssinatura.jsx            a página pública /assinar/:codigo
src/assinatura/BlocoAssinatura.jsx             o bloco do dono na OS aberta
src/data/assinatura.js                         chamadas às três funções
src/pdf/mensagem.js                            texto do WhatsApp, com o link
src/Raiz.jsx                                   separa a rota pública da área interna
```

**Modificados:**

```
supabase/schema.test.js        testes do banco
src/data/ordens.js             colunas do aceite na listagem
src/pdf/dadosDocumento.js      assinatura nos dados do documento
src/pdf/DocumentoOS.jsx        desenho na linha de assinatura
src/pdf/compartilhar.js        usa mensagem.js e leva o link
src/os/DetalheOS.jsx           bloco, trava e envio
src/os/ListaOS.jsx             selo na linha
src/Inicio.jsx                 destaque de "aguardando"
src/main.jsx                   usa Raiz
src/demo/banco.js              semente com uma OS aguardando
vercel.json                    cabeçalhos da rota pública
README.md
```

---

## Task 1: Banco — aceite, funções, travas e permissões

**Files:**
- Create: `supabase/migrations/0007_assinatura_do_cliente.sql`
- Modify: `supabase/schema.test.js`

**Interfaces:**
- Consumes: `ordens_servico`, `os_itens`, `configuracoes`, `cancelar_os`, `substituir_itens`, `definir_proximo_numero` (migrations 0001–0006).
- Produces (SQL, chamadas por RPC):
  - `gerar_link_assinatura(p_os_id uuid, p_renovar boolean default false) -> jsonb` `{ codigo, expira_em }` — só logado.
  - `obter_os_para_assinatura(p_codigo text) -> jsonb` `{ situacao, os?, oficina?, aceite_em? }` — visitante.
  - `registrar_aceite(p_codigo text, p_assinatura text, p_total_visto integer) -> jsonb` `{ ok, aceite_em }` — visitante.
  - Erros (texto da exceção): `link_invalido`, `ja_assinada`, `status_invalido`, `total_divergente`, `assinatura_invalida`.

> **Decisão do plano:** o spec lista "gerar link" e "gerar novo link" como duas funções. Aqui é **uma só**, com `p_renovar`. Mesmo comportamento, uma superfície a menos para proteger.

- [ ] **Step 1: Escrever os testes do banco (vão falhar)**

Em `supabase/schema.test.js`, acrescente ao fim do arquivo:

```js
// ---------------------------------------------------------------------------
// Assinatura do cliente
// ---------------------------------------------------------------------------
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

// As colunas do aceite só mudam pelas funções. Para forjar um estado de teste
// (por exemplo, link vencido) o teste faz o que a função faz: sinaliza a
// transação antes de escrever.
async function comoFuncao(db, sql) {
  await db.exec(`begin; select set_config('mizuho.via_funcao','on',true); ${sql}; commit;`)
}

async function osComItem(db, centavos = 48000) {
  const os = await criarOS(db)
  await adicionarItem(db, os.id, 1, 'Alternador', centavos)
  return os
}

async function gerarLink(db, osId, renovar = false) {
  const { rows: [r] } = await db.query(
    'select gerar_link_assinatura($1, $2) as r', [osId, renovar])
  return r.r
}

async function obter(db, codigo) {
  const { rows: [r] } = await db.query(
    'select obter_os_para_assinatura($1) as r', [codigo])
  return r.r
}

async function aceitar(db, codigo, total = 48000, desenho = PNG) {
  const { rows: [r] } = await db.query(
    'select registrar_aceite($1, $2, $3) as r', [codigo, desenho, total])
  return r.r
}

describe('gerar_link_assinatura', () => {
  it('cria um código de 64 caracteres hexadecimais e validade de 30 dias', async () => {
    const os = await osComItem(db)
    const l = await gerarLink(db, os.id)
    expect(l.codigo).toMatch(/^[0-9a-f]{64}$/)
    const dias = (new Date(l.expira_em) - Date.now()) / 86400000
    expect(dias).toBeGreaterThan(29.9)
    expect(dias).toBeLessThan(30.1)
  })

  it('devolve o mesmo código enquanto ele valer', async () => {
    const os = await osComItem(db)
    const a = await gerarLink(db, os.id)
    const b = await gerarLink(db, os.id)
    expect(b.codigo).toBe(a.codigo)
  })

  it('renovar troca o código e invalida o anterior', async () => {
    const os = await osComItem(db)
    const a = await gerarLink(db, os.id)
    const b = await gerarLink(db, os.id, true)
    expect(b.codigo).not.toBe(a.codigo)
    expect((await obter(db, a.codigo)).situacao).toBe('invalido')
    expect((await obter(db, b.codigo)).situacao).toBe('valido')
  })

  it('gera outro código quando o anterior venceu', async () => {
    const os = await osComItem(db)
    const a = await gerarLink(db, os.id)
    await comoFuncao(db, `update ordens_servico set assinatura_expira_em = now() - interval '1 day' where id = '${os.id}'`)
    const b = await gerarLink(db, os.id)
    expect(b.codigo).not.toBe(a.codigo)
  })

  it('recusa OS finalizada, cancelada e já assinada', async () => {
    for (const status of ['finalizada', 'cancelada']) {
      const os = await osComItem(db)
      await db.query('update ordens_servico set status = $1 where id = $2', [status, os.id])
      await expect(gerarLink(db, os.id)).rejects.toThrow(/status/)
    }
    const os = await osComItem(db)
    const l = await gerarLink(db, os.id)
    await aceitar(db, l.codigo)
    await expect(gerarLink(db, os.id)).rejects.toThrow(/ja_assinada/)
  })
})

describe('obter_os_para_assinatura', () => {
  it('entrega só a OS do código, sem telefone do cliente', async () => {
    const os = await osComItem(db)
    await osComItem(db, 9900)
    const { codigo } = await gerarLink(db, os.id)
    const r = await obter(db, codigo)
    expect(r.situacao).toBe('valido')
    expect(r.os.total_centavos).toBe(48000)
    expect(r.os.itens).toHaveLength(1)
    expect(r.os.cliente_nome).toBe('Cliente Teste')
    expect(JSON.stringify(r)).not.toContain('98888-7777')
    expect(r.oficina.razao_social).toContain('MIZUHO')
  })

  // Quem tenta códigos não pode aprender quais existem.
  it('responde igual para código inexistente e para link vencido', async () => {
    const os = await osComItem(db)
    const { codigo } = await gerarLink(db, os.id)
    await comoFuncao(db, `update ordens_servico set assinatura_expira_em = now() - interval '1 day' where id = '${os.id}'`)
    const vencido = await obter(db, codigo)
    const inexistente = await obter(db, 'a'.repeat(64))
    expect(vencido).toEqual(inexistente)
    expect(vencido).toEqual({ situacao: 'invalido' })
  })

  it('aguenta entrada nula, vazia e curta', async () => {
    for (const lixo of [null, '', 'abc']) {
      const { rows: [r] } = await db.query('select obter_os_para_assinatura($1) as r', [lixo])
      expect(r.r).toEqual({ situacao: 'invalido' })
    }
  })

  it('mostra cancelada e finalizada sem permitir aceite', async () => {
    for (const status of ['cancelada', 'finalizada']) {
      const os = await osComItem(db)
      const { codigo } = await gerarLink(db, os.id)
      await db.query('update ordens_servico set status = $1 where id = $2', [status, os.id])
      expect((await obter(db, codigo)).situacao).toBe(status)
    }
  })

  it('informa assinado, com a data do aceite', async () => {
    const os = await osComItem(db)
    const { codigo } = await gerarLink(db, os.id)
    await aceitar(db, codigo)
    const r = await obter(db, codigo)
    expect(r.situacao).toBe('assinado')
    expect(r.aceite_em).toBeTruthy()
  })
})

describe('registrar_aceite', () => {
  it('grava o aceite e leva Orçamento para Aprovada', async () => {
    const os = await osComItem(db)
    const { codigo } = await gerarLink(db, os.id)
    const r = await aceitar(db, codigo)
    expect(r.ok).toBe(true)

    const { rows: [o] } = await db.query(
      'select * from ordens_servico where id = $1', [os.id])
    expect(o.status).toBe('aprovada')
    expect(o.aceite_em).toBeTruthy()
    expect(o.data_aprovacao).toBeTruthy()
    expect(o.aceite_assinatura).toBe(PNG)
    expect(o.aceite_total_centavos).toBe(48000)
    expect(o.aceite_nome).toBe('Cliente Teste')
  })

  it('mantém Aprovada como Aprovada', async () => {
    const os = await osComItem(db)
    await db.query("update ordens_servico set status = 'aprovada' where id = $1", [os.id])
    const { codigo } = await gerarLink(db, os.id)
    await aceitar(db, codigo)
    const { rows: [o] } = await db.query('select status from ordens_servico where id = $1', [os.id])
    expect(o.status).toBe('aprovada')
  })

  // Review Focus 1: o segundo toque.
  it('recusa a segunda assinatura', async () => {
    const os = await osComItem(db)
    const { codigo } = await gerarLink(db, os.id)
    await aceitar(db, codigo)
    await expect(aceitar(db, codigo)).rejects.toThrow(/ja_assinada/)
  })

  // Review Focus 4: o dono mexeu no valor enquanto o cliente olhava.
  it('recusa total divergente e não grava nada', async () => {
    const os = await osComItem(db, 48000)
    const { codigo } = await gerarLink(db, os.id)
    await expect(aceitar(db, codigo, 30000)).rejects.toThrow(/total_divergente/)
    const { rows: [o] } = await db.query(
      'select aceite_em, status from ordens_servico where id = $1', [os.id])
    expect(o.aceite_em).toBe(null)
    expect(o.status).toBe('orcamento')
  })

  it('recusa código errado, vencido e OS cancelada', async () => {
    await expect(aceitar(db, 'b'.repeat(64))).rejects.toThrow(/link_invalido/)

    const os = await osComItem(db)
    const { codigo } = await gerarLink(db, os.id)
    await comoFuncao(db, `update ordens_servico set assinatura_expira_em = now() - interval '1 day' where id = '${os.id}'`)
    await expect(aceitar(db, codigo)).rejects.toThrow(/link_invalido/)

    const os2 = await osComItem(db)
    const l2 = await gerarLink(db, os2.id)
    await db.query("update ordens_servico set status = 'cancelada' where id = $1", [os2.id])
    await expect(aceitar(db, l2.codigo)).rejects.toThrow(/status_invalido/)
  })

  it('recusa desenho fora do formato ou grande demais', async () => {
    const os = await osComItem(db)
    const { codigo } = await gerarLink(db, os.id)
    for (const ruim of [null, '', 'oi', 'data:image/jpeg;base64,AAAA',
      'data:image/png;base64,<script>', `data:image/png;base64,${'A'.repeat(200001)}`]) {
      await expect(aceitar(db, codigo, 48000, ruim)).rejects.toThrow(/assinatura_invalida/)
    }
  })
})

describe('trava depois do aceite', () => {
  async function osAssinada() {
    const os = await osComItem(db)
    const { codigo } = await gerarLink(db, os.id)
    await aceitar(db, codigo)
    return os
  }

  it('o banco recusa inserir, alterar e apagar itens', async () => {
    const os = await osAssinada()
    await expect(adicionarItem(db, os.id, 2, 'Extra', 1000)).rejects.toThrow(/assinada/)
    await expect(
      db.query('update os_itens set descricao = $1 where os_id = $2', ['Outro', os.id]),
    ).rejects.toThrow(/assinada/)
    await expect(
      db.query('delete from os_itens where os_id = $1', [os.id]),
    ).rejects.toThrow(/assinada/)
  })

  it('substituir_itens também é recusada e não perde nada', async () => {
    const os = await osAssinada()
    await expect(
      db.query("select substituir_itens($1, '[]'::jsonb)", [os.id]),
    ).rejects.toThrow(/assinada/)
    expect(await totalDaOS(db, os.id)).toBe(48000)
    const { rows } = await db.query('select count(*)::int as n from os_itens where os_id = $1', [os.id])
    expect(rows[0].n).toBe(1)
  })

  it('o total não muda por escrita direta', async () => {
    const os = await osAssinada()
    await expect(
      db.query('update ordens_servico set total_centavos = 1 where id = $1', [os.id]),
    ).rejects.toThrow(/assinada/)
  })

  // Review Focus 5.
  it('o aceite não se forja por escrita direta', async () => {
    const os = await osComItem(db)
    await expect(
      db.query('update ordens_servico set aceite_em = now() where id = $1', [os.id]),
    ).rejects.toThrow(/funcoes/)
    await expect(
      db.query("update ordens_servico set assinatura_codigo = 'previsivel' where id = $1", [os.id]),
    ).rejects.toThrow(/funcoes/)
    await expect(
      db.query(`insert into ordens_servico (cliente_nome, veiculo_descricao, veiculo_placa, aceite_em)
                values ('A', 'B', 'ABC1D23', now())`),
    ).rejects.toThrow(/funcoes/)
  })

  it('o aceite não se desfaz', async () => {
    const os = await osAssinada()
    await expect(
      db.query('update ordens_servico set aceite_em = null where id = $1', [os.id]),
    ).rejects.toThrow()
    await expect(
      comoFuncao(db, `update ordens_servico set aceite_assinatura = 'x' where id = '${os.id}'`),
    ).rejects.toThrow()
  })

  it('nome, telefone e status continuam editáveis, e o aceite guarda o nome original', async () => {
    const os = await osAssinada()
    await db.query(
      "update ordens_servico set cliente_nome = 'Nome Corrigido', cliente_telefone = '11999990000' where id = $1",
      [os.id])
    await db.query("update ordens_servico set status = 'finalizada' where id = $1", [os.id])
    const { rows: [o] } = await db.query(
      'select cliente_nome, aceite_nome, status from ordens_servico where id = $1', [os.id])
    expect(o.cliente_nome).toBe('Nome Corrigido')
    expect(o.aceite_nome).toBe('Cliente Teste')
    expect(o.status).toBe('finalizada')
  })

  it('cancelar OS assinada é permitido', async () => {
    const os = await osAssinada()
    await db.query('select cancelar_os($1)', [os.id])
    const { rows: [o] } = await db.query('select status from ordens_servico where id = $1', [os.id])
    expect(o.status).toBe('cancelada')
  })

  // A trava de itens não pode impedir o administrador de limpar uma OS: na
  // cascata, a OS já não é visível para o gatilho dos itens.
  it('apagar a OS inteira, pelo painel, leva os itens junto mesmo assinada', async () => {
    const os = await osAssinada()
    await db.query('delete from ordens_servico where id = $1', [os.id])
    const { rows } = await db.query('select count(*)::int as n from os_itens')
    expect(rows[0].n).toBe(0)
  })
})

describe('permissões do visitante', () => {
  async function como(papel, fn) {
    await db.exec(`set role ${papel}`)
    try { return await fn() } finally { await db.exec('reset role') }
  }

  it('visitante executa só as duas funções do link', async () => {
    const os = await osComItem(db)
    const { codigo } = await gerarLink(db, os.id)
    const r = await como('anon', () => obter(db, codigo))
    expect(r.situacao).toBe('valido')
    const ok = await como('anon', () => aceitar(db, codigo))
    expect(ok.ok).toBe(true)
  })

  // Já existia aberto a visitante antes desta mudança: com a chave anon, que é
  // pública, alguém poderia reiniciar a numeração das OS.
  it('visitante NÃO executa as funções internas', async () => {
    const os = await osComItem(db)
    const chamadas = [
      ['select definir_proximo_numero(5)', []],
      ['select cancelar_os($1)', [os.id]],
      ["select substituir_itens($1, '[]'::jsonb)", [os.id]],
      ['select gerar_link_assinatura($1, false)', [os.id]],
    ]
    for (const [sql, args] of chamadas) {
      await expect(como('anon', () => db.query(sql, args))).rejects.toThrow(/permission denied/)
    }
  })

  it('usuário logado executa as internas', async () => {
    const os = await osComItem(db)
    await como('authenticated', async () => {
      const { rows: [r] } = await db.query('select gerar_link_assinatura($1, false) as r', [os.id])
      expect(r.r.codigo).toHaveLength(64)
    })
  })

  it('visitante não lê a tabela', async () => {
    await osComItem(db)
    const lidas = await como('anon', async () => {
      try {
        const { rows } = await db.query('select * from ordens_servico')
        return rows.length
      } catch { return 0 }
    })
    expect(lidas).toBe(0)
  })
})
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm test -- schema`
Expected: FAIL — `function gerar_link_assinatura(uuid, boolean) does not exist`.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/0007_assinatura_do_cliente.sql`:

```sql
-- Assinatura do cliente por link.
--
-- A tabela continua fechada a visitantes. O visitante alcanca a OS por duas
-- funcoes, e cada uma entrega uma OS so, a quem tem o codigo.

-- ---------------------------------------------------------------------------
-- 1. Colunas do aceite
-- ---------------------------------------------------------------------------
alter table ordens_servico
  add column assinatura_codigo        text unique,
  add column assinatura_expira_em     timestamptz,
  add column aceite_em                timestamptz,
  add column aceite_assinatura        text,
  add column aceite_total_centavos    int,
  add column aceite_nome              text,
  add column aceite_agente            text,
  add column aceite_ip                text;

-- ---------------------------------------------------------------------------
-- 2. O aceite so muda pelas funcoes
--
-- Qualquer funcionario logado pode atualizar qualquer coluna da OS pela API.
-- Sem esta trava, ele poderia escrever um aceite que o cliente nunca deu. As
-- funcoes sinalizam a transacao com uma variavel local; nada mais a define,
-- porque o PostgREST so expoe funcoes do schema public.
-- ---------------------------------------------------------------------------
create or replace function proteger_aceite() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  via_funcao boolean := coalesce(current_setting('mizuho.via_funcao', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if not via_funcao and (
         new.assinatura_codigo is not null or new.assinatura_expira_em is not null
         or new.aceite_em is not null or new.aceite_assinatura is not null
         or new.aceite_total_centavos is not null or new.aceite_nome is not null
         or new.aceite_agente is not null or new.aceite_ip is not null) then
      raise exception 'os campos de assinatura so mudam pelas funcoes do sistema';
    end if;
    return new;
  end if;

  -- UPDATE
  if old.aceite_em is not null then
    -- Com aceite, o aceite e o total nao mudam, nem pelas funcoes.
    if (new.aceite_em, new.aceite_assinatura, new.aceite_total_centavos,
        new.aceite_nome, new.aceite_agente, new.aceite_ip, new.assinatura_codigo)
       is distinct from
       (old.aceite_em, old.aceite_assinatura, old.aceite_total_centavos,
        old.aceite_nome, old.aceite_agente, old.aceite_ip, old.assinatura_codigo) then
      raise exception 'o aceite do cliente nao pode ser alterado';
    end if;
    if new.total_centavos is distinct from old.total_centavos then
      raise exception 'OS assinada pelo cliente: o total nao pode mudar';
    end if;
    return new;
  end if;

  if not via_funcao and (new.assinatura_codigo, new.assinatura_expira_em,
      new.aceite_em, new.aceite_assinatura, new.aceite_total_centavos,
      new.aceite_nome, new.aceite_agente, new.aceite_ip)
     is distinct from
     (old.assinatura_codigo, old.assinatura_expira_em,
      old.aceite_em, old.aceite_assinatura, old.aceite_total_centavos,
      old.aceite_nome, old.aceite_agente, old.aceite_ip) then
    raise exception 'os campos de assinatura so mudam pelas funcoes do sistema';
  end if;
  return new;
end $$;

create trigger ordens_protege_aceite
before insert or update on ordens_servico
for each row execute function proteger_aceite();

-- ---------------------------------------------------------------------------
-- 3. Itens imutaveis depois do aceite
--
-- No banco, nao so na tela: uma tela desatualizada ou um cliente HTTP direto
-- nao podem contornar. Em cascata (OS apagada) a OS ja nao e visivel aqui, e
-- a exclusao segue.
-- ---------------------------------------------------------------------------
create or replace function travar_itens_assinados() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_aceite timestamptz;
begin
  select aceite_em into v_aceite
    from ordens_servico
   where id = coalesce(new.os_id, old.os_id);

  if v_aceite is not null then
    raise exception 'OS assinada pelo cliente: itens e valores nao podem mudar';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger os_itens_trava_assinada
before insert or update or delete on os_itens
for each row execute function travar_itens_assinados();

-- ---------------------------------------------------------------------------
-- 4. Gerar o link (so usuario logado)
-- ---------------------------------------------------------------------------
create or replace function gerar_link_assinatura(
  p_os_id uuid, p_renovar boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v       ordens_servico%rowtype;
  v_codigo text;
  v_expira timestamptz;
begin
  select * into v from ordens_servico where id = p_os_id for update;
  if not found then
    raise exception 'OS % nao encontrada', p_os_id;
  end if;
  if v.aceite_em is not null then
    raise exception 'ja_assinada';
  end if;
  if v.status not in ('orcamento', 'aprovada') then
    raise exception 'status_invalido: OS % nao aceita assinatura', v.status;
  end if;

  if not p_renovar and v.assinatura_codigo is not null
     and v.assinatura_expira_em > now() then
    return jsonb_build_object('codigo', v.assinatura_codigo,
                              'expira_em', v.assinatura_expira_em);
  end if;

  -- 244 bits, com funcao nativa do Postgres e sem extensao.
  v_codigo := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expira := now() + interval '30 days';

  perform set_config('mizuho.via_funcao', 'on', true);
  update ordens_servico
     set assinatura_codigo = v_codigo, assinatura_expira_em = v_expira
   where id = p_os_id;

  return jsonb_build_object('codigo', v_codigo, 'expira_em', v_expira);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Ver a OS pelo codigo (visitante)
-- ---------------------------------------------------------------------------
create or replace function obter_os_para_assinatura(p_codigo text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v      ordens_servico%rowtype;
  c      configuracoes%rowtype;
  v_itens jsonb;
  v_situacao text;
begin
  if p_codigo is null or length(p_codigo) < 32 then
    return jsonb_build_object('situacao', 'invalido');
  end if;

  select * into v from ordens_servico where assinatura_codigo = p_codigo;
  if not found then
    return jsonb_build_object('situacao', 'invalido');
  end if;

  -- Quem tem o codigo ja o conhece: dizer que foi assinado nao vaza nada.
  if v.aceite_em is not null then
    return jsonb_build_object('situacao', 'assinado', 'aceite_em', v.aceite_em);
  end if;

  -- Vencido responde igual a inexistente, de proposito.
  if v.assinatura_expira_em is null or v.assinatura_expira_em <= now() then
    return jsonb_build_object('situacao', 'invalido');
  end if;

  v_situacao := case
    when v.status in ('orcamento', 'aprovada') then 'valido'
    else v.status
  end;

  select * into c from configuracoes where id = 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'posicao', posicao,
           'quantidade', quantidade,
           'descricao', descricao,
           'valor_unitario_centavos', valor_unitario_centavos,
           'valor_total_centavos', valor_total_centavos
         ) order by posicao), '[]'::jsonb)
    into v_itens
    from os_itens where os_id = v.id;

  return jsonb_build_object(
    'situacao', v_situacao,
    'os', jsonb_build_object(
      'numero', v.numero,
      'data_os', v.data_os,
      'cliente_nome', v.cliente_nome,
      'veiculo_descricao', v.veiculo_descricao,
      'veiculo_placa', v.veiculo_placa,
      'total_centavos', v.total_centavos,
      'status', v.status,
      'itens', v_itens
    ),
    'oficina', jsonb_build_object(
      'razao_social', c.razao_social,
      'telefone', c.telefone,
      'texto_garantia', c.texto_garantia,
      'garantia_meses', c.garantia_meses
    )
  );
end $$;

-- ---------------------------------------------------------------------------
-- 6. Registrar o aceite (visitante)
-- ---------------------------------------------------------------------------
create or replace function registrar_aceite(
  p_codigo text, p_assinatura text, p_total_visto integer
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v        ordens_servico%rowtype;
  v_agora  timestamptz := now();
  v_cab    jsonb;
  v_ip     text;
  v_agente text;
begin
  if p_assinatura is null
     or length(p_assinatura) > 200000
     or p_assinatura !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' then
    raise exception 'assinatura_invalida';
  end if;

  select * into v from ordens_servico where assinatura_codigo = p_codigo for update;
  if not found or v.assinatura_expira_em is null then
    raise exception 'link_invalido';
  end if;
  if v.aceite_em is not null then
    raise exception 'ja_assinada';
  end if;
  if v.assinatura_expira_em <= v_agora then
    raise exception 'link_invalido';
  end if;
  if v.status not in ('orcamento', 'aprovada') then
    raise exception 'status_invalido';
  end if;
  if p_total_visto is distinct from v.total_centavos then
    raise exception 'total_divergente';
  end if;

  -- IP e agente saem dos cabecalhos que o PostgREST expoe. Se nao vierem, o
  -- aceite vale pelo desenho e pelo horario; nunca falha por causa disto.
  begin
    v_cab    := nullif(current_setting('request.headers', true), '')::jsonb;
    v_ip     := coalesce(v_cab->>'cf-connecting-ip',
                         trim(split_part(coalesce(v_cab->>'x-forwarded-for', ''), ',', 1)));
    v_agente := left(v_cab->>'user-agent', 300);
  exception when others then
    v_ip := null; v_agente := null;
  end;

  perform set_config('mizuho.via_funcao', 'on', true);
  update ordens_servico
     set aceite_em = v_agora,
         aceite_assinatura = p_assinatura,
         aceite_total_centavos = v.total_centavos,
         aceite_nome = v.cliente_nome,
         aceite_agente = v_agente,
         aceite_ip = nullif(v_ip, ''),
         status = case when v.status = 'orcamento' then 'aprovada' else v.status end,
         data_aprovacao = case when v.status = 'orcamento' then v_agora else v.data_aprovacao end
   where id = v.id;

  return jsonb_build_object('ok', true, 'aceite_em', v_agora);
end $$;

-- ---------------------------------------------------------------------------
-- 7. Quem executa o que
--
-- O Supabase concede execucao de toda funcao nova aos papeis anon e
-- authenticated. Sem revogar, um visitante com a chave anon - que e publica,
-- vai no JavaScript do site - executava as funcoes internas. Verificado em
-- producao: definir_proximo_numero, cancelar_os e substituir_itens respondiam
-- a visitante. A primeira reiniciaria a numeracao das OS.
-- ---------------------------------------------------------------------------
revoke execute on function definir_proximo_numero(bigint)        from public, anon;
revoke execute on function cancelar_os(uuid)                     from public, anon;
revoke execute on function substituir_itens(uuid, jsonb)         from public, anon;
revoke execute on function gerar_link_assinatura(uuid, boolean)  from public, anon;
revoke execute on function obter_os_para_assinatura(text)        from public;
revoke execute on function registrar_aceite(text, text, integer) from public;

grant execute on function definir_proximo_numero(bigint)        to authenticated;
grant execute on function cancelar_os(uuid)                     to authenticated;
grant execute on function substituir_itens(uuid, jsonb)         to authenticated;
grant execute on function gerar_link_assinatura(uuid, boolean)  to authenticated;
grant execute on function obter_os_para_assinatura(text)        to anon, authenticated;
grant execute on function registrar_aceite(text, text, integer) to anon, authenticated;
```

- [ ] **Step 4: Rodar os testes do banco**

Run: `npm test -- schema`
Expected: PASS em tudo, incluindo os novos.

Se `set role anon` não for suportado pelo PGlite e os três testes de permissão falharem por isso (e não por assertiva), registre um `Ruling:` no ledger, troque-os por `it.skip` com o motivo no nome e **mantenha** a verificação ao vivo da Tarefa 7, que cobre exatamente isso contra o Supabase real.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS. A migration nova entra sozinha no modo demonstração e nos testes de fluxo, que aplicam todas as migrations em ordem.

- [ ] **Step 6: Gerar o SQL de atualização para a produção**

A produção já tem as migrations 0001–0006. Para ela, só a 0007:

```bash
cp supabase/migrations/0007_assinatura_do_cliente.sql supabase/atualizacao-0007.sql
```

E regenere o arquivo completo, para quem montar um banco do zero:

```bash
{ echo "-- Mizuho OS - banco completo, para colar no SQL Editor do Supabase."; echo "-- Equivale a aplicar as migrations 0001 a 0007, em ordem. Rode uma vez so."; echo; for f in supabase/migrations/*.sql; do echo "-- ====== $(basename "$f") ======"; cat "$f"; echo; done; } > supabase/setup-completo.sql
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Adiciona aceite do cliente no banco, com travas e permissoes"
```

---

## Task 2: Funções puras e camada de dados

**Files:**
- Create: `src/assinatura/codigo.js`, `src/assinatura/estado.js`, `src/assinatura/erros.js`, `src/data/assinatura.js`, `src/pdf/mensagem.js`
- Test: `src/assinatura/codigo.test.js`, `src/assinatura/estado.test.js`, `src/assinatura/erros.test.js`, `src/pdf/mensagem.test.js`
- Modify: `src/data/ordens.js`

**Interfaces:**
- Consumes: `supabase`, `STATUS`, `formatarBRL`.
- Produces:
  - `normalizarCodigo(texto) -> string` (`''` quando não há código)
  - `urlDeAssinatura(base, codigo) -> string`
  - `situacaoDoLink(os, agora) -> 'assinada'|'indisponivel'|'nao_enviada'|'vencido'|'aguardando'`
  - `acaoParaErro(mensagem) -> { tipo: 'recarregar'|'refazer'|'invalido'|'assinado'|'tentar', texto }`
  - `gerarLinkAssinatura(osId, { renovar }) -> Promise<{ codigo, expira_em }>`
  - `obterOsParaAssinatura(codigo) -> Promise<{ situacao, os?, oficina?, aceite_em? }>`
  - `registrarAceite({ codigo, assinatura, totalVisto }) -> Promise<{ ok, aceite_em }>` (lança `Error` com `.codigo` = código do banco)
  - `mensagemWhatsApp({ os, config, urlPdf, urlAssinatura }) -> string`

- [ ] **Step 1: Teste do código (vai falhar)**

`src/assinatura/codigo.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { normalizarCodigo, urlDeAssinatura } from './codigo.js'

const COD = 'a1b2c3d4'.repeat(8) // 64 hex

describe('normalizarCodigo', () => {
  it('aceita o código puro', () => {
    expect(normalizarCodigo(COD)).toBe(COD)
  })

  // Review Focus 2: o que o WhatsApp e o copiar-e-colar trazem junto.
  it('tira espaço, quebra de linha e pontuação em volta', () => {
    expect(normalizarCodigo(`  ${COD}\n`)).toBe(COD)
    expect(normalizarCodigo(`${COD}.`)).toBe(COD)
    expect(normalizarCodigo(`${COD},`)).toBe(COD)
    expect(normalizarCodigo(`${COD})`)).toBe(COD)
  })

  it('aceita maiúscula e devolve em minúscula', () => {
    expect(normalizarCodigo(COD.toUpperCase())).toBe(COD)
  })

  it('devolve vazio para o que não é código', () => {
    expect(normalizarCodigo('')).toBe('')
    expect(normalizarCodigo(null)).toBe('')
    expect(normalizarCodigo('abc')).toBe('')
    expect(normalizarCodigo('z'.repeat(64))).toBe('')
  })
})

describe('urlDeAssinatura', () => {
  it('monta o endereço sem barra duplicada', () => {
    expect(urlDeAssinatura('https://x.vercel.app', COD)).toBe(`https://x.vercel.app/assinar/${COD}`)
    expect(urlDeAssinatura('https://x.vercel.app/', COD)).toBe(`https://x.vercel.app/assinar/${COD}`)
  })
})
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm test -- codigo`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar `src/assinatura/codigo.js`**

```js
// O código tem 64 caracteres hexadecimais. Extrair os 64 primeiros é o que
// torna a página tolerante ao que o WhatsApp e o copiar-e-colar anexam: espaço,
// quebra de linha, ponto, vírgula, parêntese.
export function normalizarCodigo(texto) {
  const limpo = String(texto ?? '').trim().toLowerCase()
  return limpo.match(/^[0-9a-f]{64}/)?.[0] ?? ''
}

export function urlDeAssinatura(base, codigo) {
  return `${String(base).replace(/\/+$/, '')}/assinar/${codigo}`
}
```

- [ ] **Step 4: Teste da situação do link (vai falhar)**

`src/assinatura/estado.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { situacaoDoLink } from './estado.js'

const AGORA = new Date('2026-10-14T15:00:00-03:00')
const base = { status: 'orcamento', assinatura_codigo: null, assinatura_expira_em: null, aceite_em: null }

describe('situacaoDoLink', () => {
  it('nao_enviada quando ainda não há código', () => {
    expect(situacaoDoLink(base, AGORA)).toBe('nao_enviada')
  })

  it('aguardando dentro da validade', () => {
    const os = { ...base, assinatura_codigo: 'x', assinatura_expira_em: '2026-11-01T00:00:00-03:00' }
    expect(situacaoDoLink(os, AGORA)).toBe('aguardando')
  })

  it('vencido depois da validade', () => {
    const os = { ...base, assinatura_codigo: 'x', assinatura_expira_em: '2026-10-01T00:00:00-03:00' }
    expect(situacaoDoLink(os, AGORA)).toBe('vencido')
  })

  it('assinada quando há aceite, mesmo com o link vencido', () => {
    const os = { ...base, aceite_em: '2026-10-10T10:00:00-03:00',
      assinatura_codigo: 'x', assinatura_expira_em: '2026-10-01T00:00:00-03:00' }
    expect(situacaoDoLink(os, AGORA)).toBe('assinada')
  })

  it('indisponivel para OS cancelada ou finalizada sem aceite', () => {
    expect(situacaoDoLink({ ...base, status: 'cancelada' }, AGORA)).toBe('indisponivel')
    expect(situacaoDoLink({ ...base, status: 'finalizada' }, AGORA)).toBe('indisponivel')
  })

  it('aprovada sem aceite ainda aceita o link', () => {
    expect(situacaoDoLink({ ...base, status: 'aprovada' }, AGORA)).toBe('nao_enviada')
  })

  it('aguenta OS nula', () => {
    expect(situacaoDoLink(null, AGORA)).toBe('indisponivel')
  })
})
```

Run: `npm test -- estado`
Expected: FAIL.

- [ ] **Step 5: Implementar `src/assinatura/estado.js`**

```js
import { STATUS } from '../lib/status.js'

// Estado do link, visto do lado do dono. O aceite vence todo o resto: uma OS
// assinada continua assinada mesmo depois de o link expirar.
export function situacaoDoLink(os, agora = new Date()) {
  if (!os) return 'indisponivel'
  if (os.aceite_em) return 'assinada'
  if (os.status !== STATUS.ORCAMENTO && os.status !== STATUS.APROVADA) {
    return 'indisponivel'
  }
  if (!os.assinatura_codigo) return 'nao_enviada'
  const expira = new Date(os.assinatura_expira_em).getTime()
  if (Number.isNaN(expira) || expira <= new Date(agora).getTime()) return 'vencido'
  return 'aguardando'
}
```

- [ ] **Step 6: Teste do mapeamento de erros (vai falhar)**

`src/assinatura/erros.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { acaoParaErro } from './erros.js'

describe('acaoParaErro', () => {
  // Review Focus 1: o segundo toque não é erro, é o estado final.
  it('ja_assinada recarrega e mostra o estado assinado', () => {
    expect(acaoParaErro('ja_assinada').tipo).toBe('recarregar')
  })

  // Review Focus 4: o valor mudou enquanto o cliente olhava.
  it('total_divergente recarrega e avisa que o orçamento mudou', () => {
    const a = acaoParaErro('total_divergente')
    expect(a.tipo).toBe('recarregar')
    expect(a.texto).toMatch(/atualizado/i)
  })

  it('link_invalido e status_invalido recarregam para a tela correspondente', () => {
    expect(acaoParaErro('link_invalido').tipo).toBe('recarregar')
    expect(acaoParaErro('status_invalido').tipo).toBe('recarregar')
  })

  it('assinatura_invalida pede para refazer o desenho', () => {
    expect(acaoParaErro('assinatura_invalida').tipo).toBe('refazer')
  })

  it('erro desconhecido ou de rede permite tentar de novo', () => {
    expect(acaoParaErro('Failed to fetch').tipo).toBe('tentar')
    expect(acaoParaErro(undefined).tipo).toBe('tentar')
  })

  it('reconhece o código dentro de uma mensagem maior', () => {
    expect(acaoParaErro('P0001: total_divergente (detalhe)').tipo).toBe('recarregar')
  })
})
```

Run: `npm test -- erros`
Expected: FAIL.

- [ ] **Step 7: Implementar `src/assinatura/erros.js`**

```js
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
```

- [ ] **Step 8: Teste da mensagem do WhatsApp (vai falhar)**

`src/pdf/mensagem.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { mensagemWhatsApp } from './mensagem.js'

const config = { razao_social: 'Auto Elétrica MIZUHO II Ltda. - ME' }
const os = {
  numero: 1042, status: 'orcamento', cliente_nome: 'João Silva',
  veiculo_descricao: 'GM Chevette 1982', veiculo_placa: 'ABC1234',
}

describe('mensagemWhatsApp', () => {
  it('chama de orçamento enquanto for orçamento', () => {
    const m = mensagemWhatsApp({ os, config })
    expect(m).toContain('Olá, João Silva!')
    expect(m).toContain('o orçamento nº 1042')
    expect(m).toContain('GM Chevette 1982')
  })

  it('chama de OS depois de aprovada', () => {
    const m = mensagemWhatsApp({ os: { ...os, status: 'aprovada' }, config })
    expect(m).toContain('a OS nº 1042')
  })

  it('leva o link do PDF quando existe', () => {
    const m = mensagemWhatsApp({ os, config, urlPdf: 'https://x/pdf' })
    expect(m).toContain('https://x/pdf')
  })

  it('pede a assinatura e leva o link quando existe', () => {
    const m = mensagemWhatsApp({ os, config, urlAssinatura: 'https://x/assinar/abc' })
    expect(m).toMatch(/assine/i)
    expect(m).toContain('https://x/assinar/abc')
  })

  it('sem link de assinatura, não pede assinatura', () => {
    expect(mensagemWhatsApp({ os, config })).not.toMatch(/assine/i)
  })

  it('aguenta OS sem número', () => {
    const m = mensagemWhatsApp({ os: { ...os, numero: null }, config })
    expect(m).toContain('seu orçamento')
  })
})
```

Run: `npm test -- mensagem`
Expected: FAIL.

- [ ] **Step 9: Implementar `src/pdf/mensagem.js`**

```js
import { STATUS } from '../lib/status.js'

export function mensagemWhatsApp({ os, config, urlPdf, urlAssinatura }) {
  const documento = os.status === STATUS.ORCAMENTO ? 'orçamento' : 'OS'
  const artigo = os.status === STATUS.ORCAMENTO ? 'o' : 'a'
  const titulo = os.numero == null
    ? `seu ${documento}`
    : `${artigo} ${documento} nº ${os.numero}`

  const linhas = [
    `Olá, ${os.cliente_nome}! Segue ${titulo} da ${config.razao_social}.`,
    `Veículo: ${os.veiculo_descricao} — ${os.veiculo_placa}`,
  ]
  if (urlPdf) linhas.push(urlPdf)
  if (urlAssinatura) {
    linhas.push('', 'Para aprovar, confira e assine por aqui:', urlAssinatura)
  }
  return linhas.join('\n')
}
```

- [ ] **Step 10: Camada de dados `src/data/assinatura.js`**

```js
import { supabase } from './supabase.js'
import { codigoDoErro } from '../assinatura/erros.js'

// A mensagem técnica do banco vira um código que a tela sabe tratar.
function erroDoBanco(error, padrao) {
  const e = new Error(padrao)
  e.codigo = codigoDoErro(error?.message) || 'desconhecido'
  e.detalhe = error?.message
  return e
}

export async function gerarLinkAssinatura(osId, { renovar = false } = {}) {
  const { data, error } = await supabase.rpc('gerar_link_assinatura', {
    p_os_id: osId, p_renovar: renovar,
  })
  if (error) throw erroDoBanco(error, 'Não foi possível gerar o link de assinatura.')
  return data
}

export async function obterOsParaAssinatura(codigo) {
  const { data, error } = await supabase.rpc('obter_os_para_assinatura', {
    p_codigo: codigo,
  })
  if (error) throw erroDoBanco(error, 'Não foi possível carregar o orçamento.')
  return data
}

export async function registrarAceite({ codigo, assinatura, totalVisto }) {
  const { data, error } = await supabase.rpc('registrar_aceite', {
    p_codigo: codigo, p_assinatura: assinatura, p_total_visto: totalVisto,
  })
  if (error) throw erroDoBanco(error, 'Não foi possível registrar a assinatura.')
  return data
}
```

- [ ] **Step 11: Colunas do aceite na listagem**

Em `src/data/ordens.js`, troque `CAMPOS_LISTA` por:

```js
const CAMPOS_LISTA =
  'id, numero, status, cliente_nome, cliente_telefone, veiculo_placa, ' +
  'veiculo_descricao, data_os, total_centavos, ' +
  'aceite_em, assinatura_codigo, assinatura_expira_em'
```

- [ ] **Step 12: Rodar e commitar**

Run: `npm test` e `npm run lint`
Expected: PASS e sem saída de lint.

```bash
git add -A
git commit -m "Adiciona codigo, estado do link, erros e mensagem da assinatura"
```

---

## Task 3: Quadro de assinatura

**Files:**
- Create: `src/assinatura/desenho.js`, `src/assinatura/QuadroAssinatura.jsx`
- Test: `src/assinatura/desenho.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `caixaDoDesenho({ data, width, height }) -> { x, y, w, h } | null`
  - `tracoSuficiente(comprimentoPx) -> boolean`
  - `dimensionarParaExportar(largura, altura, larguraMaxima) -> { w, h }`
  - `<QuadroAssinatura ref aoMudar />` com `ref.current.limpar()` e `ref.current.exportar() -> string | null`

- [ ] **Step 1: Teste do desenho (vai falhar)**

`src/assinatura/desenho.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { caixaDoDesenho, tracoSuficiente, dimensionarParaExportar } from './desenho.js'

// Monta um ImageData sintético: largura x altura, RGBA, tudo transparente.
function imagem(largura, altura, tintas = []) {
  const data = new Uint8ClampedArray(largura * altura * 4)
  for (const [x, y] of tintas) data[(y * largura + x) * 4 + 3] = 255
  return { data, width: largura, height: altura }
}

describe('caixaDoDesenho', () => {
  it('devolve a menor caixa que contém a tinta', () => {
    const img = imagem(10, 10, [[2, 3], [6, 8]])
    expect(caixaDoDesenho(img)).toEqual({ x: 2, y: 3, w: 5, h: 6 })
  })

  // Review Focus 3: nada desenhado não pode virar assinatura.
  it('devolve nulo quando o quadro está vazio', () => {
    expect(caixaDoDesenho(imagem(10, 10))).toBe(null)
  })

  it('aguenta um único ponto', () => {
    expect(caixaDoDesenho(imagem(5, 5, [[1, 1]]))).toEqual({ x: 1, y: 1, w: 1, h: 1 })
  })
})

describe('tracoSuficiente', () => {
  it('recusa o toque acidental e o ponto', () => {
    expect(tracoSuficiente(0)).toBe(false)
    expect(tracoSuficiente(5)).toBe(false)
  })

  it('aceita um traço de verdade', () => {
    expect(tracoSuficiente(80)).toBe(true)
  })
})

describe('dimensionarParaExportar', () => {
  it('não amplia o que já cabe', () => {
    expect(dimensionarParaExportar(300, 100, 500)).toEqual({ w: 300, h: 100 })
  })

  it('reduz mantendo a proporção', () => {
    expect(dimensionarParaExportar(1000, 400, 500)).toEqual({ w: 500, h: 200 })
  })

  it('nunca devolve dimensão zero', () => {
    const d = dimensionarParaExportar(2000, 1, 500)
    expect(d.w).toBeGreaterThan(0)
    expect(d.h).toBeGreaterThanOrEqual(1)
  })
})
```

Run: `npm test -- desenho`
Expected: FAIL.

- [ ] **Step 2: Implementar `src/assinatura/desenho.js`**

```js
// Menor retângulo que contém tinta (alfa > 0), ou nulo se o quadro está vazio.
export function caixaDoDesenho({ data, width, height }) {
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

// Um toque acidental ou um ponto não é assinatura. O comprimento é somado em
// pixels de tela ao longo do traço.
const COMPRIMENTO_MINIMO_PX = 40
export function tracoSuficiente(comprimentoPx) {
  return comprimentoPx >= COMPRIMENTO_MINIMO_PX
}

export function dimensionarParaExportar(largura, altura, larguraMaxima) {
  if (largura <= larguraMaxima) return { w: largura, h: altura }
  const fator = larguraMaxima / largura
  return { w: larguraMaxima, h: Math.max(1, Math.round(altura * fator)) }
}
```

- [ ] **Step 3: Rodar e confirmar PASS**

Run: `npm test -- desenho`
Expected: PASS, 8 testes.

- [ ] **Step 4: O componente `src/assinatura/QuadroAssinatura.jsx`**

```jsx
import { useEffect, useImperativeHandle, useRef } from 'react'
import { caixaDoDesenho, tracoSuficiente, dimensionarParaExportar } from './desenho.js'

const LARGURA_EXPORTADA = 500
const COR_TRACO = '#141414'

// O quadro guarda o traço em pixels reais da tela (devicePixelRatio) para
// ficar nítido, e exporta recortado e reduzido, para o PNG ficar leve.
export default function QuadroAssinatura({ ref, aoMudar }) {
  const canvasRef = useRef(null)
  const estado = useRef({ desenhando: false, ultimo: null, comprimento: 0 })

  function contexto() {
    return canvasRef.current.getContext('2d')
  }

  function ajustarTamanho() {
    const canvas = canvasRef.current
    const caixa = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(caixa.width * dpr)
    canvas.height = Math.round(caixa.height * dpr)
    const ctx = contexto()
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.6
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = COR_TRACO
  }

  useEffect(() => {
    ajustarTamanho()
    window.addEventListener('resize', ajustarTamanho)
    return () => window.removeEventListener('resize', ajustarTamanho)
  }, [])

  function ponto(e) {
    const caixa = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top }
  }

  function aoPressionar(e) {
    canvasRef.current.setPointerCapture(e.pointerId)
    const p = ponto(e)
    estado.current = { desenhando: true, ultimo: p, comprimento: estado.current.comprimento }
    const ctx = contexto()
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.x + 0.01, p.y + 0.01)
    ctx.stroke()
  }

  function aoMover(e) {
    const s = estado.current
    if (!s.desenhando) return
    const p = ponto(e)
    const ctx = contexto()
    ctx.beginPath()
    ctx.moveTo(s.ultimo.x, s.ultimo.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    s.comprimento += Math.hypot(p.x - s.ultimo.x, p.y - s.ultimo.y)
    s.ultimo = p
    aoMudar?.(tracoSuficiente(s.comprimento))
  }

  function aoSoltar() {
    estado.current.desenhando = false
  }

  useImperativeHandle(ref, () => ({
    limpar() {
      const canvas = canvasRef.current
      contexto().clearRect(0, 0, canvas.width, canvas.height)
      estado.current = { desenhando: false, ultimo: null, comprimento: 0 }
      aoMudar?.(false)
    },

    // PNG recortado na tinta e reduzido. Nulo se não há desenho de verdade.
    exportar() {
      if (!tracoSuficiente(estado.current.comprimento)) return null
      const canvas = canvasRef.current
      const ctx = contexto()
      const imagem = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const caixa = caixaDoDesenho(imagem)
      if (!caixa) return null

      const margem = 6
      const x = Math.max(0, caixa.x - margem)
      const y = Math.max(0, caixa.y - margem)
      const w = Math.min(canvas.width - x, caixa.w + margem * 2)
      const h = Math.min(canvas.height - y, caixa.h + margem * 2)
      const { w: ws, h: hs } = dimensionarParaExportar(w, h, LARGURA_EXPORTADA)

      const saida = document.createElement('canvas')
      saida.width = ws
      saida.height = hs
      saida.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, ws, hs)
      return saida.toDataURL('image/png')
    },
  }))

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={aoPressionar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      onPointerLeave={aoSoltar}
      aria-label="Quadro de assinatura. Desenhe com o dedo."
      className="block h-[180px] w-full touch-none rounded-xl border-[1.5px] border-dashed border-[#CFCBC7] bg-white"
    />
  )
}
```

- [ ] **Step 5: Lint e build**

Run: `npm run lint` e `npm run build`
Expected: sem erro. Este componente é o único trecho que **não** tem teste automatizado — o gesto do dedo só se confere num aparelho; a lógica em volta foi isolada e testada acima.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Adiciona o quadro de assinatura e a logica de recorte do desenho"
```

---

## Task 4: Página pública do cliente

**Files:**
- Create: `src/assinatura/PaginaAssinatura.jsx`, `src/Raiz.jsx`
- Modify: `src/main.jsx`, `vercel.json`

**Interfaces:**
- Consumes: `obterOsParaAssinatura`, `registrarAceite`, `normalizarCodigo`, `acaoParaErro`, `QuadroAssinatura`, `formatarBRL`, `formatarData`, `formatarDataHora`, `formatarPlaca`.
- Produces: rota `/assinar/:codigo`, fora do `AuthGate`.

- [ ] **Step 1: A página, `src/assinatura/PaginaAssinatura.jsx`**

```jsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { obterOsParaAssinatura, registrarAceite } from '../data/assinatura.js'
import { normalizarCodigo } from './codigo.js'
import { acaoParaErro } from './erros.js'
import QuadroAssinatura from './QuadroAssinatura.jsx'
import { formatarBRL, centavosParaTexto } from '../lib/dinheiro.js'
import { formatarData, formatarDataHora } from '../lib/datas.js'
import { formatarPlaca } from '../lib/placa.js'

function Cabecalho({ oficina }) {
  return (
    <header className="bg-ink px-4 py-3 text-white">
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <img src="/logo-mizuho.png" alt="" className="h-9 rounded-md bg-white p-px" />
        <span className="font-marca text-base leading-tight font-bold">
          {oficina?.razao_social || 'Auto Elétrica Mizuho II'}
        </span>
      </div>
    </header>
  )
}

function Mensagem({ titulo, texto, oficina }) {
  return (
    <div className="min-h-dvh bg-[#F6F4F2]">
      <Cabecalho oficina={oficina} />
      <main className="mx-auto max-w-xl p-5">
        <h1 className="mb-2 text-xl font-extrabold">{titulo}</h1>
        <p className="text-[15px] leading-relaxed text-[#4A4846]">{texto}</p>
        {oficina?.telefone && (
          <p className="mt-4 text-sm text-mute">
            Oficina: <strong className="text-ink">{oficina.telefone}</strong>
          </p>
        )}
      </main>
    </div>
  )
}

export default function PaginaAssinatura() {
  const { codigo: bruto } = useParams()
  const codigo = normalizarCodigo(bruto)
  const quadro = useRef(null)

  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erroRede, setErroRede] = useState('')
  const [aviso, setAviso] = useState('')
  const [desenhou, setDesenhou] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [concluido, setConcluido] = useState(false)

  // Página pública: fora dos buscadores, mesmo que o cabeçalho HTTP falhe.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  const carregar = useCallback(async () => {
    if (!codigo) {
      setDados({ situacao: 'invalido' })
      setCarregando(false)
      return null
    }
    try {
      const r = await obterOsParaAssinatura(codigo)
      setDados(r)
      setErroRede('')
      return r
    } catch {
      setErroRede('Não foi possível carregar o orçamento. Confira a conexão.')
      return null
    } finally {
      setCarregando(false)
    }
  }, [codigo])

  useEffect(() => { carregar() }, [carregar])

  async function confirmar() {
    const desenho = quadro.current?.exportar()
    if (!desenho) {
      setAviso('Desenhe a sua assinatura no quadro antes de confirmar.')
      return
    }
    setEnviando(true)
    setAviso('')
    try {
      await registrarAceite({
        codigo, assinatura: desenho, totalVisto: dados.os.total_centavos,
      })
      setConcluido(true)
      await carregar()
    } catch (e) {
      const acao = acaoParaErro(e.codigo || e.message)
      if (acao.tipo === 'recarregar') {
        // Não é falha: a tela passa a mostrar o estado real (já assinado,
        // valores atualizados, link vencido).
        const r = await carregar()
        if (acao.texto && r?.situacao === 'valido') setAviso(acao.texto)
      } else {
        setAviso(acao.texto)
      }
    } finally {
      setEnviando(false)
    }
  }

  if (carregando) {
    return <div className="grid min-h-dvh place-items-center text-mute">Carregando…</div>
  }

  if (erroRede && !dados) {
    return (
      <Mensagem titulo="Sem conexão" texto={erroRede} />
    )
  }

  const { situacao, os, oficina } = dados || {}

  if (situacao === 'invalido') {
    return (
      <Mensagem
        titulo="Este link não é mais válido"
        texto="Peça um novo link à oficina para assinar o orçamento."
        oficina={oficina}
      />
    )
  }

  if (situacao === 'assinado' || concluido) {
    const quando = dados?.aceite_em ? formatarDataHora(dados.aceite_em) : ''
    return (
      <Mensagem
        titulo="Orçamento assinado"
        texto={quando
          ? `Assinado em ${quando}. Obrigado! A oficina já recebeu a sua aprovação.`
          : 'Obrigado! A oficina já recebeu a sua aprovação.'}
        oficina={oficina}
      />
    )
  }

  const podeAssinar = situacao === 'valido'
  const meses = oficina?.garantia_meses ?? 3

  return (
    <div className="min-h-dvh bg-[#F6F4F2] pb-28">
      <Cabecalho oficina={oficina} />

      <main className="mx-auto max-w-xl p-4">
        <p className="text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
          Orçamento
        </p>
        <h1 className="mb-3 text-2xl font-extrabold tracking-tight">
          Nº {os.numero ?? '—'}
        </h1>

        <dl className="mb-3 rounded-xl border border-linha bg-paper p-3 text-[13px]">
          {[
            ['Data', formatarData(os.data_os)],
            ['Cliente', os.cliente_nome],
            ['Veículo', os.veiculo_descricao],
            ['Placa', formatarPlaca(os.veiculo_placa)],
          ].map(([r, v], i, l) => (
            <div key={r} className={`flex justify-between py-1.5 ${i < l.length - 1 ? 'border-b border-linha' : ''}`}>
              <dt className="text-mute">{r}</dt>
              <dd className="font-bold">{v}</dd>
            </div>
          ))}
        </dl>

        <ul className="mb-3">
          {os.itens.map((i) => (
            <li key={i.posicao} className="mb-2 rounded-xl border border-linha bg-paper px-3 py-2.5">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-extrabold text-red">{String(i.quantidade).replace('.', ',')}×</span>
                <span className="text-[13px] font-semibold">{i.descricao}</span>
              </div>
              <div className="mt-1.5 flex justify-between border-t border-dashed border-linha pt-1.5 text-[11.5px] text-mute">
                <span>Unit. {centavosParaTexto(i.valor_unitario_centavos)}</span>
                <strong className="text-[13px] text-ink">{formatarBRL(i.valor_total_centavos)}</strong>
              </div>
            </li>
          ))}
        </ul>

        <div className="mb-3 flex items-baseline justify-between rounded-xl border border-linha bg-paper px-3 py-3">
          <span className="text-[10px] font-bold tracking-[0.14em] text-mute uppercase">Total</span>
          <strong className="text-3xl font-extrabold tracking-tight">{formatarBRL(os.total_centavos)}</strong>
        </div>

        {oficina?.texto_garantia && (
          <p className="mb-4 rounded-xl border border-[#F3C7BF] bg-red-tint px-3 py-2.5 text-[11.5px] leading-snug text-red-dark">
            <strong>{oficina.texto_garantia}</strong>
            <br />Garantia de {meses} {meses === 1 ? 'mês' : 'meses'}.
          </p>
        )}

        {!podeAssinar && (
          <p className="rounded-xl border border-linha bg-paper p-3 text-sm text-[#4A4846]">
            {situacao === 'cancelada'
              ? 'Esta ordem de serviço foi cancelada pela oficina.'
              : 'Esta ordem de serviço já foi concluída.'}
          </p>
        )}

        {podeAssinar && (
          <>
            <p className="mb-2 text-[14px] leading-snug">
              Eu, <strong>{os.cliente_nome}</strong>, estou de acordo com este
              orçamento no valor de <strong>{formatarBRL(os.total_centavos)}</strong>.
            </p>

            <QuadroAssinatura ref={quadro} aoMudar={setDesenhou} />

            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-mute">Assine com o dedo no quadro acima.</span>
              <button
                type="button"
                onClick={() => quadro.current?.limpar()}
                className="h-10 px-2 text-sm font-semibold text-red"
              >
                Limpar
              </button>
            </div>

            {aviso && (
              <p role="alert" className="mt-3 rounded-lg bg-[#FEF3C7] px-3 py-2 text-sm font-semibold text-[#7A4A06]">
                {aviso}
              </p>
            )}
          </>
        )}
      </main>

      {podeAssinar && (
        <div className="fixed inset-x-0 bottom-0 border-t border-linha bg-paper px-4 pt-3 pb-4">
          <div className="mx-auto max-w-xl">
            <button
              type="button"
              onClick={confirmar}
              disabled={!desenhou || enviando}
              className="h-14 w-full rounded-xl bg-red text-base font-bold text-white disabled:opacity-50"
            >
              {enviando ? 'Enviando…' : 'Confirmar e assinar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Separar a rota pública da área interna, `src/Raiz.jsx`**

```jsx
import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider.jsx'
import AuthGate from './auth/AuthGate.jsx'
import App from './App.jsx'
import PaginaAssinatura from './assinatura/PaginaAssinatura.jsx'

// A rota do cliente fica FORA do AuthGate: ele não tem login e não precisa
// de nenhuma sessão. Só ela é pública; o resto continua atrás do login.
export default function Raiz() {
  return (
    <Routes>
      <Route path="/assinar/:codigo" element={<PaginaAssinatura />} />
      <Route
        path="*"
        element={
          <AuthProvider>
            <AuthGate>
              <App />
            </AuthGate>
          </AuthProvider>
        }
      />
    </Routes>
  )
}
```

- [ ] **Step 3: Usar a raiz em `src/main.jsx`**

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import Raiz from './Raiz.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Raiz />
    </BrowserRouter>
  </StrictMode>,
)
```

- [ ] **Step 4: Cabeçalhos da rota pública em `vercel.json`**

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/assinar/(.*)",
      "headers": [
        { "key": "X-Robots-Tag", "value": "noindex, nofollow" },
        { "key": "Referrer-Policy", "value": "no-referrer" }
      ]
    }
  ]
}
```

- [ ] **Step 5: Verificar a navegação interna**

`App.jsx` declara rotas relativas (`os`, `os/nova`, `configuracoes`) e agora fica sob o `path="*"` da raiz. Confirme que o roteamento interno segue funcionando:

Run: `npm run lint` e `npm run build`
Expected: sem erro.

Run: `npm run dev` e abra `/os`, `/os/nova` e `/configuracoes`.
Expected: as três abrem normalmente (com `VITE_MODO_DEMO=1`, entra com qualquer usuário). Se alguma cair no redirecionamento para `/`, a rota-curinga está engolindo o prefixo: nesse caso troque `path="*"` por `path="/*"` e repita.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Adiciona a pagina publica de assinatura, fora do login"
```

---

## Task 5: PDF com a assinatura

**Files:**
- Modify: `src/pdf/dadosDocumento.js`, `src/pdf/DocumentoOS.jsx`
- Test: `src/pdf/dadosDocumento.test.js`, `src/pdf/DocumentoOS.test.jsx`

**Interfaces:**
- Consumes: `formatarDataHora`.
- Produces: `dados.assinatura = { imagem: string, textoData: string } | null`.

- [ ] **Step 1: Testes (vão falhar)**

Em `src/pdf/dadosDocumento.test.js`, ao fim:

```js
describe('assinatura do cliente no documento', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo='

  it('sem aceite, não há assinatura', () => {
    expect(montarDadosDocumento(OS, CONFIG).assinatura).toBe(null)
  })

  it('com aceite, entrega o desenho e a data por extenso', () => {
    const d = montarDadosDocumento({
      ...OS, aceite_em: '2026-10-14T15:32:00-03:00', aceite_assinatura: PNG,
    }, CONFIG)
    expect(d.assinatura.imagem).toBe(PNG)
    expect(d.assinatura.textoData).toBe(
      'Assinado digitalmente pelo cliente em 14/10/2026 às 15:32')
  })

  it('aceite sem desenho não imprime assinatura', () => {
    const d = montarDadosDocumento({
      ...OS, aceite_em: '2026-10-14T15:32:00-03:00', aceite_assinatura: null,
    }, CONFIG)
    expect(d.assinatura).toBe(null)
  })
})
```

Em `src/pdf/DocumentoOS.test.jsx`, dentro do `describe('DocumentoOS')`:

```jsx
  describe('assinatura do cliente', () => {
    // PNG 1x1 válido.
    const PNG =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

    function contarImagens(buffer) {
      return (buffer.toString('latin1').match(/\/Subtype\s*\/Image/g) || []).length
    }

    it('imprime o texto da data do aceite', async () => {
      const texto = textoDoPdf(await renderizar({
        ...OS, aceite_em: '2026-10-14T15:32:00-03:00', aceite_assinatura: PNG,
      }))
      expect(texto).toContain('Assinado digitalmente pelo cliente em 14/10/2026 às 15:32')
    })

    it('inclui o desenho como imagem no arquivo', async () => {
      const sem = await renderizar(OS)
      const com = await renderizar({
        ...OS, aceite_em: '2026-10-14T15:32:00-03:00', aceite_assinatura: PNG,
      })
      expect(contarImagens(com)).toBe(contarImagens(sem) + 1)
    })

    it('sem aceite, o PDF sai como antes', async () => {
      const texto = textoDoPdf(await renderizar(OS))
      expect(texto).not.toContain('Assinado digitalmente')
    })
  })
```

Run: `npm test -- pdf`
Expected: FAIL.

- [ ] **Step 2: Implementar em `src/pdf/dadosDocumento.js`**

Acrescente ao topo o import:

```js
import { formatarDataHora } from '../lib/datas.js'
```

Adicione, antes de `montarDadosDocumento`:

```js
function textoDaAssinatura(aceiteEm) {
  return `Assinado digitalmente pelo cliente em ${formatarDataHora(aceiteEm)}`
}
```

E no objeto retornado por `montarDadosDocumento`, antes de `linhas`:

```js
    assinatura: os.aceite_em && os.aceite_assinatura
      ? { imagem: os.aceite_assinatura, textoData: textoDaAssinatura(os.aceite_em) }
      : null,
```

- [ ] **Step 3: Implementar em `src/pdf/DocumentoOS.jsx`**

Em `StyleSheet.create`, junto de `assinatura`:

```js
  imagemAssinatura: { height: 46, objectFit: 'contain', marginBottom: 2 },
  textoAssinado: { fontSize: 7, marginTop: 2, color: '#444444' },
```

E troque o bloco da assinatura:

```jsx
          <View style={s.assinatura}>
            {dados.assinatura && (
              <Image style={s.imagemAssinatura} src={dados.assinatura.imagem} />
            )}
            <View style={s.riscoAssinatura} />
            <Text style={s.rotuloAssinatura}>Assinatura do Cliente</Text>
            {dados.assinatura && (
              <Text style={s.textoAssinado}>{dados.assinatura.textoData}</Text>
            )}
          </View>
```

- [ ] **Step 4: Rodar e confirmar PASS**

Run: `npm test -- pdf`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Imprime a assinatura do cliente e a data do aceite no PDF"
```

---

## Task 6: Lado do dono

**Files:**
- Create: `src/assinatura/BlocoAssinatura.jsx`
- Modify: `src/os/DetalheOS.jsx`, `src/pdf/compartilhar.js`, `src/os/ListaOS.jsx`, `src/Inicio.jsx`

**Interfaces:**
- Consumes: `gerarLinkAssinatura`, `situacaoDoLink`, `urlDeAssinatura`, `mensagemWhatsApp`, `formatarDataHora`.
- Produces: `enviarOsPorWhatsApp({ os, config, urlAssinatura })`.

- [ ] **Step 1: O bloco, `src/assinatura/BlocoAssinatura.jsx`**

```jsx
import { formatarDataHora } from '../lib/datas.js'
import { situacaoDoLink } from './estado.js'
import Botao from '../ui/Botao.jsx'

const ROTULOS = {
  nao_enviada: ['Não enviada', 'O link nasce no primeiro envio pelo WhatsApp.'],
  aguardando: ['Aguardando assinatura', null],
  vencido: ['Link vencido', 'Gere um novo link e envie de novo.'],
  indisponivel: ['Indisponível', 'Só orçamento e OS aprovada aceitam assinatura.'],
}

export default function BlocoAssinatura({ os, aoCopiar, aoRenovar, ocupado }) {
  const situacao = situacaoDoLink(os)

  if (situacao === 'assinada') {
    return (
      <div className="mt-3 rounded-xl border border-[#BCE5C8] bg-[#F0FAF2] p-3">
        <h2 className="mb-1 text-[10px] font-bold tracking-[0.14em] text-[#15803D] uppercase">
          Assinada pelo cliente
        </h2>
        <p className="mb-2 text-[12.5px] text-[#3D6B4B]">
          {os.aceite_nome} · {formatarDataHora(os.aceite_em)}
        </p>
        {os.aceite_assinatura && (
          <img
            src={os.aceite_assinatura}
            alt="Assinatura do cliente"
            className="h-16 rounded-lg border border-linha bg-white p-1"
          />
        )}
        <p className="mt-2 text-xs text-[#3D6B4B]">
          Itens e valores estão travados. Para alterar, cancele e duplique.
        </p>
      </div>
    )
  }

  const [titulo, nota] = ROTULOS[situacao]
  const expira = situacao === 'aguardando' && os.assinatura_expira_em
    ? `Válido até ${formatarDataHora(os.assinatura_expira_em)}.`
    : nota

  return (
    <div className="mt-3 rounded-xl border border-linha bg-paper p-3">
      <h2 className="mb-1 text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
        Assinatura do cliente
      </h2>
      <p className="text-[13px] font-bold">{titulo}</p>
      {expira && <p className="mt-0.5 text-xs text-mute">{expira}</p>}

      {(situacao === 'aguardando' || situacao === 'vencido') && (
        <div className="mt-2 flex gap-2">
          {situacao === 'aguardando' && (
            <Botao variante="fantasma" tamanho="pequeno" onClick={aoCopiar} disabled={ocupado}>
              Copiar link
            </Botao>
          )}
          <Botao variante="fantasma" tamanho="pequeno" onClick={aoRenovar} disabled={ocupado}>
            Gerar novo link
          </Botao>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: `src/pdf/compartilhar.js` usa a mensagem e leva o link**

Troque a função local `mensagem` por import e passe o link adiante. No topo:

```js
import { mensagemWhatsApp } from './mensagem.js'
```

Apague a função `mensagem(os, config, url)` e substitua `enviarOsPorWhatsApp` por:

```js
// No celular, a Web Share API entrega o arquivo direto ao WhatsApp.
// No desktop isso não existe: o navegador não anexa arquivo no WhatsApp Web,
// então o PDF sobe para o Storage e vai o link. Nos dois casos, quando a OS
// aceita assinatura, a mensagem leva também o link para o cliente assinar.
export async function enviarOsPorWhatsApp({ os, config, urlAssinatura }) {
  const blob = await gerarPdfDaOS(os, config)
  const nome = nomeArquivoPdf(os)
  const arquivo = new File([blob], nome, { type: 'application/pdf' })

  if (navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({
        files: [arquivo],
        title: nome,
        text: mensagemWhatsApp({ os, config, urlAssinatura }),
      })
      return { via: 'compartilhamento' }
    } catch (erro) {
      if (erro?.name === 'AbortError') return { via: 'cancelado' }
      // Qualquer outra falha cai no caminho do link, abaixo.
    }
  }

  try {
    const urlPdf = await subirPdf(os, blob)
    const texto = mensagemWhatsApp({ os, config, urlPdf, urlAssinatura })
    window.open(linkWhatsApp(os.cliente_telefone, texto), '_blank')
    return { via: 'link', url: urlPdf }
  } catch {
    // Sem rede para subir, ao menos entrega o arquivo na mão do dono.
    baixarPdf(blob, nome)
    return { via: 'download' }
  }
}
```

- [ ] **Step 3: `src/os/DetalheOS.jsx` — bloco, trava e envio**

Imports novos:

```jsx
import { gerarLinkAssinatura } from '../data/assinatura.js'
import { situacaoDoLink } from '../assinatura/estado.js'
import { urlDeAssinatura } from '../assinatura/codigo.js'
import BlocoAssinatura from '../assinatura/BlocoAssinatura.jsx'
```

Troque a função `whatsapp` por:

```jsx
  // O link nasce no primeiro envio e é reaproveitado enquanto valer.
  async function linkParaEnviar() {
    const situacao = situacaoDoLink(os)
    if (situacao === 'assinada' || situacao === 'indisponivel') return undefined
    const { codigo } = await gerarLinkAssinatura(os.id)
    await buscar()
    return urlDeAssinatura(window.location.origin, codigo)
  }

  const whatsapp = () => executar(async () => {
    const urlAssinatura = await linkParaEnviar()
    const { enviarOsPorWhatsApp } = await import('../pdf/compartilhar.js')
    const r = await enviarOsPorWhatsApp({ os, config, urlAssinatura })
    const mensagens = {
      compartilhamento: 'PDF entregue ao aplicativo escolhido.',
      link: 'WhatsApp aberto com o PDF e o link de assinatura.',
      download: 'Sem conexão para enviar: o PDF foi baixado.',
      cancelado: '',
    }
    setAviso(mensagens[r.via] ?? '')
  })

  const copiarLink = () => executar(async () => {
    const { codigo } = await gerarLinkAssinatura(os.id)
    await navigator.clipboard.writeText(urlDeAssinatura(window.location.origin, codigo))
    setAviso('Link copiado.')
  })

  const novoLink = () => executar(async () => {
    await gerarLinkAssinatura(os.id, { renovar: true })
    await buscar()
    setAviso('Novo link gerado. O anterior não vale mais; envie de novo.')
  })
```

Itens em somente leitura depois do aceite — troque a linha do `ItensEditor` e o botão "Salvar itens":

```jsx
        <ItensEditor itens={itens} aoMudar={setItens} somenteLeitura={Boolean(os.aceite_em)} />

        {!os.aceite_em && (
          <div className="mt-2">
            <Botao variante="fantasma" tamanho="pequeno" onClick={salvarItens}
              disabled={ocupado}>
              Salvar itens
            </Botao>
          </div>
        )}
```

E, logo depois do bloco do total, antes das observações:

```jsx
        <BlocoAssinatura os={os} aoCopiar={copiarLink} aoRenovar={novoLink} ocupado={ocupado} />
```

- [ ] **Step 4: Selo nas listas, `src/os/ListaOS.jsx`**

Imports e função:

```jsx
import { situacaoDoLink } from '../assinatura/estado.js'

function SeloAssinatura({ os }) {
  const s = situacaoDoLink(os)
  if (s === 'assinada') {
    return (
      <span className="ml-1 inline-block rounded-full bg-[#DCFCE7] px-2 py-[3px] text-[9.5px] font-bold tracking-[0.07em] text-[#15803D] uppercase">
        Assinada
      </span>
    )
  }
  if (s === 'aguardando') {
    return (
      <span className="ml-1 inline-block rounded-full border border-[#B45309] px-2 py-[2px] text-[9.5px] font-bold tracking-[0.07em] text-[#B45309] uppercase">
        Aguardando
      </span>
    )
  }
  return null
}
```

Em `LinhaOS`, depois de `<Chip status={os.status} />`:

```jsx
        <SeloAssinatura os={os} />
```

- [ ] **Step 5: Destaque no Início, `src/Inicio.jsx`**

Importe `situacaoDoLink` e conte:

```jsx
import { situacaoDoLink } from './assinatura/estado.js'
```

Dentro do `.then`, junto do `setDados`:

```jsx
          const aguardando = pendentes.filter(
            (o) => situacaoDoLink(o) === 'aguardando').length
```

e acrescente `aguardando,` ao objeto de `setDados`. Antes do `<h2>` "Em aberto":

```jsx
          {dados.aguardando > 0 && (
            <p className="mb-3 rounded-xl border border-[#F2D479] bg-[#FEF3C7] px-3 py-2.5 text-[13px] font-semibold text-[#7A4A06]">
              {dados.aguardando} {dados.aguardando === 1 ? 'orçamento aguardando' : 'orçamentos aguardando'} assinatura do cliente.
            </p>
          )}
```

- [ ] **Step 6: Verificar**

Run: `npm test`, `npm run lint`, `npm run build`
Expected: tudo verde.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Leva o link de assinatura no WhatsApp e mostra a situacao ao dono"
```

---

## Task 7: Demonstração, documentação e verificação ao vivo

**Files:**
- Modify: `src/demo/banco.js`, `src/demo/fluxo.test.js`, `README.md`

**Interfaces:**
- Consumes: tudo das tarefas anteriores.
- Produces: nada.

- [ ] **Step 1: Teste de fluxo da assinatura no modo demonstração (vai falhar)**

Em `src/demo/fluxo.test.js`, acrescente um `describe` ao fim:

```js
describe('modo demonstração — assinatura do cliente', () => {
  let dados

  beforeAll(async () => {
    dados = await import('../data/assinatura.js')
  })

  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

  it('gera o link, o cliente confere e assina, e a OS passa a Aprovada', async () => {
    const os = await ordens.criarOrdem({
      dados: {
        veiculo_placa: 'ASS1A23', data_os: hojeISO(),
        cliente_nome: 'Cliente Assina', cliente_telefone: '',
        veiculo_descricao: 'Carro',
      },
      itens: [{ quantidade: '1', descricao: 'Serviço', valor_unitario_centavos: 25000 }],
    })

    const { codigo } = await dados.gerarLinkAssinatura(os.id)
    const visto = await dados.obterOsParaAssinatura(codigo)
    expect(visto.situacao).toBe('valido')
    expect(visto.os.total_centavos).toBe(25000)

    await dados.registrarAceite({ codigo, assinatura: PNG, totalVisto: 25000 })

    const depois = await ordens.buscarOrdem(os.id)
    expect(depois.status).toBe(STATUS.APROVADA)
    expect(depois.aceite_assinatura).toBe(PNG)
    expect((await dados.obterOsParaAssinatura(codigo)).situacao).toBe('assinado')
  })

  it('o banco recusa alterar os itens depois do aceite', async () => {
    const os = await ordens.criarOrdem({
      dados: {
        veiculo_placa: 'ASS2A23', data_os: hojeISO(),
        cliente_nome: 'Cliente Trava', cliente_telefone: '',
        veiculo_descricao: 'Carro',
      },
      itens: [{ quantidade: '1', descricao: 'Serviço', valor_unitario_centavos: 10000 }],
    })
    const { codigo } = await dados.gerarLinkAssinatura(os.id)
    await dados.registrarAceite({ codigo, assinatura: PNG, totalVisto: 10000 })

    await expect(ordens.atualizarItens(os.id, [
      { quantidade: '1', descricao: 'Outro', valor_unitario_centavos: 99999 },
    ])).rejects.toThrow()
  })

  it('total divergente é recusado com o código que a tela entende', async () => {
    const os = await ordens.criarOrdem({
      dados: {
        veiculo_placa: 'ASS3A23', data_os: hojeISO(),
        cliente_nome: 'Cliente Diverge', cliente_telefone: '',
        veiculo_descricao: 'Carro',
      },
      itens: [{ quantidade: '1', descricao: 'Serviço', valor_unitario_centavos: 10000 }],
    })
    const { codigo } = await dados.gerarLinkAssinatura(os.id)
    const erro = await dados.registrarAceite({ codigo, assinatura: PNG, totalVisto: 1 })
      .catch((e) => e)
    expect(erro.codigo).toBe('total_divergente')
  })
})
```

Run: `npm test -- fluxo`
Expected: FAIL antes da semente/dados; passa quando os passos anteriores estão no lugar.

- [ ] **Step 2: Uma OS aguardando assinatura na semente**

Em `src/demo/banco.js`, dentro de `SEMENTE`, depois dos `insert into os_itens`, acrescente — usando o mesmo sinalizador das funções, porque a trava barra escrita direta:

```sql
  -- Uma OS com link enviado e ainda sem assinatura, para o Início mostrar
  -- "aguardando". Escrita com o sinalizador que as funções do banco usam.
  begin;
  select set_config('mizuho.via_funcao', 'on', true);
  update ordens_servico
     set assinatura_codigo = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
         assinatura_expira_em = now() + interval '20 days'
   where id = 'bbbbbbbb-3333-4333-8333-333333333333';
  commit;
```

O código tem exatamente 64 caracteres hexadecimais, como os gerados de verdade;
só existe na demonstração, que nunca toca o banco real.

- [ ] **Step 3: README**

Na seção **O que faz**, acrescente:

```markdown
- Assinatura do cliente: o WhatsApp leva o PDF e um link; o cliente confere a OS e
  assina com o dedo. O aceite trava itens e valores no banco e sai impresso no PDF.
```

Na seção **Banco de dados**, acrescente:

```markdown
Para quem já tem o banco de pé, a atualização da assinatura é só
`supabase/atualizacao-0007.sql`, colada no SQL Editor. Ela também retira dos
visitantes a permissão de executar as funções internas.
```

- [ ] **Step 4: Suíte, lint e build**

Run: `npm test`, `npm run lint`, `npm run build`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Atualiza a demonstracao e a documentacao para a assinatura do cliente"
```

- [ ] **Step 6: Verificação ao vivo — depende do SQL aplicado em produção**

Esta etapa só roda depois que o conteúdo de `supabase/atualizacao-0007.sql` for colado e executado no SQL Editor do projeto. Antes disso, **não** há como testar contra o Supabase real.

Com a chave anon e o usuário `mizuho`, rode o script de verificação, que deve confirmar, nesta ordem:

1. visitante recebe `permission denied` em `definir_proximo_numero`, `cancelar_os`, `substituir_itens` e `gerar_link_assinatura` (use argumentos que não gravam: `p_numero: 0`, UUID nulo);
2. logado, `gerar_link_assinatura` devolve um código de 64 caracteres;
3. visitante, com esse código, recebe `situacao: valido` e **não** vê o telefone do cliente;
4. visitante registra o aceite; a OS vira `aprovada`;
5. uma segunda assinatura é recusada com `ja_assinada`;
6. logado, alterar itens daquela OS é recusado;
7. visitante continua sem ler a tabela `ordens_servico`.

O registro de teste fica rotulado `TESTE DE ASSINATURA` e deve ser removido depois:

```sql
delete from ordens_servico where cliente_nome = 'TESTE DE ASSINATURA';
```

(`delete` direto no SQL Editor funciona: a cascata dos itens passa pela trava porque a OS já não é visível ali.)

---

## O que este plano não cobre

- **O gesto do dedo no quadro.** O projeto não tem teste de componente. A lógica em volta é testada; o desenho em si só se confere num aparelho.
- **O PDF publicado no Storage** continua sendo o do momento do envio. Ele é regerado na próxima ação do dono; quem abre o link do PDF antes disso vê o orçamento sem a assinatura.
- **Aviso ativo ao dono** quando o cliente assina: fora de escopo, como no spec.
