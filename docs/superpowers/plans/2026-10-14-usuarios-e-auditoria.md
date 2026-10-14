# Usuários, níveis de acesso e registro de atividade — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O dono controla quem acessa o sistema (criar, bloquear, trocar senha, dois níveis) e cada OS mostra quem fez o quê, com tudo imposto pelo banco e não só pela tela.

**Architecture:** Uma tabela `perfis` liga cada usuário do Supabase Auth a um nível e a um "ativo". Toda policy e toda função `security definer` passam a exigir usuário ativo; Ajustes e numeração exigem administrador. Quatro funções `security definer`, só para administrador, criam e alteram usuários direto em `auth.users` (sem `service_role`). Gatilhos gravam um histórico só de inclusão por OS. A tela ganha a aba Usuários, o menu por nível e a seção Atividade na OS.

**Tech Stack:** Vite · React 19 · Supabase (Postgres, RLS, RPC, Auth) · PGlite (testes e demonstração) · Vitest · oxlint

**Spec:** `docs/superpowers/specs/2026-10-14-usuarios-e-auditoria-design.md`
**Specs anteriores, em vigor onde não contradito:** `2026-10-13-mizuho-os-design.md`, `2026-10-14-os-sem-cadastro-design.md`, `2026-10-14-assinatura-do-cliente-design.md`

## Global Constraints

- Idioma da interface, mensagens e nomes de código: **português do Brasil**. Commits em português, no imperativo.
- Níveis: exatamente `'admin'` e `'atendente'`.
- Usuário (o que se digita no login): `^[a-z0-9._-]{3,30}$`, sempre minúsculo; e-mail interno `usuario@mizuho.invalid`.
- Senha: **mínimo de 8 caracteres** (e no máximo 72 bytes, limite do bcrypt).
- **Sem** `service_role`, **sem** Edge Function: tudo por funções SQL chamáveis só por administrador.
- Usuário sem perfil = **sem acesso** (falha fechada).
- Bloquear = `perfis.ativo = false` **e** `auth.users.banned_until` e `auth.sessions` apagadas; o corte é imediato por RLS.
- Ninguém altera o próprio papel nem o próprio `ativo`; o sistema nunca fica sem administrador ativo.
- O histórico (`os_historico`, `usuarios_historico`) é só de inclusão: nenhum `insert/update/delete` para `authenticated` ou `anon`.
- Toda função nova: `revoke execute ... from public, anon` e `grant execute ... to authenticated` explícitos (o `alter default privileges` da 0007 já tira de `anon`).
- Dinheiro é inteiro em centavos; datas puras são texto `YYYY-MM-DD`; instantes (`em`) são `timestamptz`.
- **Ordem de publicação: SQL no Supabase primeiro, deploy depois.** Nada é publicado antes de o dono confirmar que aplicou o SQL.

## Rulings sobre o spec

O spec é a autoridade; estas correções vieram da leitura do código e entram no spec na Tarefa 9.

1. **§6, quais funções recebem `usuario_ativo()`:** `cancelar_os` e `substituir_itens` são `security invoker`, então o RLS já as barra para quem está bloqueado ("OS nao encontrada"). `versao_da_os` não é chamável por `authenticated`. Só `gerar_link_assinatura` (definer) ganha a checagem explícita, e `definir_proximo_numero` passa a exigir administrador. Os testes provam as quatro.
2. **§5.1, migration "aborta sem administrador":** num projeto novo ainda não há usuário, e abortar quebraria o `setup-completo.sql`. Regra final: um gatilho em `auth.users` torna o **primeiro** usuário criado um administrador; a migration aborta apenas se existirem usuários e nenhum virar administrador.
3. **§6, regra do "último administrador":** com a trava "ninguém altera a si mesmo", o ator é sempre um administrador que continua ativo, então a regra só é alcançável por concorrência. A defesa real é adquirir o lock **antes** de conferir `usuario_admin()`. A regra do último administrador fica como guarda defensiva e não tem teste direto.
4. **§8, nome da seção:** "Atividade", não "Histórico", porque "Histórico" já é o nome da aba da lista de OS.
5. **§8, "Sair":** o atendente não vê Ajustes, onde estava o botão Sair. A casca do app passa a mostrar o nome e o Sair para todos.
6. **§5.3:** a ação `nome_alterado` entra na lista de `usuarios_historico`.
7. **Demonstração:** continua com um único usuário simulado (qualquer login entra como o administrador de demonstração). A aba Usuários funciona nela, sem provar o login dos usuários criados.

## Review Focus

1. **Usuário bloqueado com o app aberto chamando funções `security definer`** — recusa na hora, não só por RLS. → Tarefa 2 (`gerar_link_assinatura`, `definir_proximo_numero`, `cancelar_os`, `substituir_itens`).
2. **Projeto novo e usuário criado direto no painel** — o primeiro vira administrador; os seguintes, sem perfil, ficam sem acesso. → Tarefa 2.
3. **Limpeza manual de OS de teste (`delete from ordens_servico`) com histórico e itens** — tem de continuar funcionando, sem violar chave estrangeira. → Tarefa 4.
4. **Renomear ou apagar um usuário** — o nome gravado no histórico não muda e as OS dele permanecem. → Tarefas 2 e 4.
5. **Usuário digitado com maiúscula ou espaço e senha com acento** — `MARIA ` vira `maria`; senha acentuada de 72 bytes é aceita, 73 é recusada sem derrubar a função. → Tarefa 3.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/demo/stubsSupabase.js` (novo) | Stubs do `auth`/`storage`/`extensions` do Supabase, compartilhados pelos testes de banco e pela demonstração |
| `supabase/banco-de-teste.js` (novo) | `criarBanco`, `como`, `criarOS`, `adicionarItem`, `aplicarMigration` para os testes de banco |
| `supabase/migrations/0008_perfis_e_acesso.sql` (novo) | `perfis`, helpers, backfill, primeiro usuário, RLS por usuário ativo/admin |
| `supabase/migrations/0009_gestao_de_usuarios.sql` (novo) | `usuarios_historico` e as quatro funções de gestão |
| `supabase/migrations/0010_historico_de_atividade.sql` (novo) | `os_historico`, `registrar_historico`, gatilhos |
| `supabase/acesso.test.js`, `usuarios.test.js`, `historico.test.js` (novos) | Testes de banco por migration |
| `src/auth/perfil.js` (novo) | `ehAdmin`, `abasDoMenu`, rótulos de papel |
| `src/auth/AuthProvider.jsx`, `AuthGate.jsx`, `LoginScreen.jsx`, `SomenteAdmin.jsx` | Perfil na sessão, bloqueio, aviso, guarda de rota |
| `src/ui/AppShell.jsx`, `src/App.jsx` | Menu por nível, nome, Sair, rotas protegidas |
| `src/data/usuarios.js`, `src/data/historico.js`, `src/usuarios/erros.js`, `src/usuarios/regras.js` | Dados, erros e regras puras da aba Usuários |
| `src/usuarios/PaginaUsuarios.jsx`, `ListaUsuarios.jsx`, `FormUsuario.jsx` | Tela de usuários |
| `src/os/textoDoEvento.js`, `src/os/AtividadeDaOs.jsx` | Texto e seção "Atividade" na OS |
| `src/demo/banco.js`, `src/demo/cliente.js` | Demonstração com `auth.uid()` e perfis |
| `supabase/setup-completo.sql`, `supabase/atualizacao-usuarios.sql` | Pacotes para colar no SQL Editor |

---

### Task 1: Base de testes compartilhada e stubs do `auth`

Refatoração sem mudança de comportamento: os próximos testes precisam de `auth.uid()`, `auth.identities`, `auth.sessions`, de `crypt()` e de um banco que pare numa migration.

**Files:**
- Create: `src/demo/stubsSupabase.js`, `supabase/banco-de-teste.js`
- Modify: `supabase/schema.test.js:1-90`, `src/demo/banco.js`

**Interfaces:**
- Produces:
  - `STUBS_DO_SUPABASE: string` (SQL)
  - `criarBanco({ ate?: '0007' }) => Promise<PGlite>`; sem `ate`, aplica tudo e cria `USUARIO_TESTE` em `auth.users`
  - `aplicarMigration(db, 'NNNN_nome.sql')`, `concederComoOSupabase(db)`
  - `como(db, papel, fn, uid = USUARIO_TESTE)`: seta `request.jwt.claim.sub` quando `papel === 'authenticated'`
  - `criarOS(db, extra)`, `adicionarItem(db, osId, posicao, descricao, centavos)`, `USUARIO_TESTE`

- [ ] **Step 1: Criar os stubs compartilhados**

`src/demo/stubsSupabase.js`:

```js
// O Supabase traz prontos o schema `auth`, o `storage`, o pgcrypto (no schema
// `extensions`) e os papéis anon/authenticated. O PGlite é Postgres puro, então
// as migrations reais rodam sobre estes stubs. As COLUNAS de auth.users e
// auth.identities são as que as migrations usam; o bcrypt de verdade só é
// verificado contra o Supabase real.
export const STUBS_DO_SUPABASE = `
  create schema if not exists auth;
  create schema if not exists extensions;

  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    instance_id uuid, aud text, role text, email text,
    encrypted_password text, email_confirmed_at timestamptz,
    raw_app_meta_data jsonb, raw_user_meta_data jsonb,
    created_at timestamptz not null default now(), updated_at timestamptz,
    banned_until timestamptz, last_sign_in_at timestamptz,
    confirmation_token text, recovery_token text,
    email_change_token_new text, email_change text
  );
  create table auth.identities (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    provider_id text not null, identity_data jsonb not null, provider text not null,
    last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
  );
  create table auth.sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade
  );

  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  create function extensions.gen_salt(text) returns text
    language sql as $$ select 'salt' $$;
  create function extensions.crypt(text, text) returns text
    language sql as $$ select 'stub$' || md5($1 || $2) $$;

  create role authenticated;
  create role anon;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;

  create schema if not exists storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean not null default false
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text, name text
  );
  alter table storage.objects enable row level security;
`
```

- [ ] **Step 2: Criar o módulo de apoio dos testes de banco**

`supabase/banco-de-teste.js`:

```js
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STUBS_DO_SUPABASE } from '../src/demo/stubsSupabase.js'

const AQUI = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = join(AQUI, 'migrations')

// O usuário logado "padrão" dos testes. Num projeto novo o primeiro usuário
// criado vira administrador (migration 0008), e é isto que ele é.
export const USUARIO_TESTE = '11111111-1111-4111-8111-111111111111'

export function arquivosDeMigration() {
  return readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()
}

export function aplicarMigration(db, nome) {
  return db.exec(readFileSync(join(MIGRATIONS, nome), 'utf8'))
}

// O Supabase concede as tabelas aos papéis anon e authenticated por padrão, e
// é o RLS que protege. Sem imitar isso, "visitante não lê" passaria por falta
// de permissão de tabela e não provaria nada sobre o RLS.
export function concederComoOSupabase(db) {
  return db.exec(`
    grant usage on schema public to anon, authenticated;
    grant all on all tables in schema public to anon, authenticated;
    grant all on all sequences in schema public to anon, authenticated;
  `)
}

// `ate` é o prefixo da última migration a aplicar (ex.: '0007'): serve para
// testar o caminho de quem já usava o sistema antes da atualização.
export async function criarBanco({ ate } = {}) {
  const db = await new PGlite()
  await db.exec(STUBS_DO_SUPABASE)
  for (const nome of arquivosDeMigration()) {
    if (ate && nome.slice(0, 4) > ate) break
    await aplicarMigration(db, nome)
  }
  await concederComoOSupabase(db)
  if (!ate) {
    await db.query(
      "insert into auth.users (id, email) values ($1, 'teste@mizuho.invalid')",
      [USUARIO_TESTE],
    )
  }
  return db
}

// Executa como um papel do Supabase e volta a ser dono. Para `authenticated`,
// informa quem é o usuário (o `sub` do JWT), que é o que auth.uid() lê.
export async function como(db, papel, fn, uid = USUARIO_TESTE) {
  await db.exec(`set role ${papel}`)
  if (papel === 'authenticated') {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid])
  }
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
    await db.exec("select set_config('request.jwt.claim.sub', '', false)")
  }
}

export async function criarOS(db, extra = {}) {
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

export async function adicionarItem(db, osId, posicao, descricao, centavos) {
  await db.query(
    `insert into os_itens (os_id, posicao, quantidade, descricao,
                           valor_unitario_centavos, valor_total_centavos)
     values ($1, $2, 1, $3, $4, $4)`,
    [osId, posicao, descricao, centavos],
  )
}
```

- [ ] **Step 3: Fazer `schema.test.js` usar o módulo**

Em `supabase/schema.test.js`, apague do topo tudo o que vai de `import { PGlite }` até o fim da função `adicionarItem` (inclui `STUBS_DO_SUPABASE`, `criarBanco`, `como`, `criarOS`, `adicionarItem`) e deixe no lugar:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { criarBanco, como, criarOS, adicionarItem } from './banco-de-teste.js'
```

Mantenha `totalDaOS`, `let db`, o `beforeEach` e todo o resto. Se algum teste usa `readFileSync`, `join` ou `PGlite` diretamente, importe de volta apenas o que ele usa.

- [ ] **Step 4: Fazer a demonstração usar os mesmos stubs**

Em `src/demo/banco.js`: troque a constante `STUBS` por `import { STUBS_DO_SUPABASE } from './stubsSupabase.js'` e use-a em `db.exec(STUBS_DO_SUPABASE)`. Troque a inserção do usuário por:

```js
await db.query(
  'insert into auth.users (id, email) values ($1, $2)',
  [USUARIO_DEMO_ID, 'demonstracao@mizuho.local'],
)
```

- [ ] **Step 5: Rodar tudo**

Run: `npm test`
Expected: **297 passed**, 0 failed (refatoração: nada muda de comportamento).

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/demo/stubsSupabase.js supabase/banco-de-teste.js supabase/schema.test.js src/demo/banco.js
git commit -m "Extrai stubs do Supabase e apoio de teste de banco para reuso"
```

---

### Task 2: Perfis, níveis e acesso só de usuário ativo (migration 0008)

**Files:**
- Create: `supabase/migrations/0008_perfis_e_acesso.sql`, `supabase/acesso.test.js`

**Interfaces:**
- Consumes: Task 1 (`criarBanco`, `como`, `criarOS`, `aplicarMigration`, `concederComoOSupabase`, `USUARIO_TESTE`)
- Produces (SQL): tabela `perfis(user_id, usuario, nome, papel, ativo, criado_em, criado_por)`; `usuario_ativo() boolean`; `usuario_admin() boolean`; gatilho `auth_users_primeiro_perfil`; policies reescritas

- [ ] **Step 1: Escrever os testes (vermelhos)**

`supabase/acesso.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import {
  criarBanco, como, criarOS, aplicarMigration, concederComoOSupabase, USUARIO_TESTE,
} from './banco-de-teste.js'

const ATENDENTE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BLOQUEADO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SEM_PERFIL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

let db

// Cria o usuário em auth.users e, se `perfil` vier, o perfil (como dono, o que
// a API não permite a ninguém).
async function novoUsuario(id, perfil) {
  await db.query('insert into auth.users (id, email) values ($1, $2)',
    [id, `${id.slice(0, 8)}@mizuho.invalid`])
  if (!perfil) return
  await db.query(
    `insert into perfis (user_id, usuario, nome, papel, ativo)
     values ($1, $2, $3, $4, $5)`,
    [id, `u${id.slice(0, 6)}`, `Nome ${id.slice(0, 4)}`, perfil.papel, perfil.ativo ?? true])
}

const comoUsuario = (uid, fn) => como(db, 'authenticated', fn, uid)

const NOVA_OS = `insert into ordens_servico
  (cliente_nome, veiculo_descricao, veiculo_placa)
  values ('Cliente', 'Carro', 'ABC1D23') returning id`

beforeEach(async () => {
  db = await criarBanco()
  await novoUsuario(ATENDENTE, { papel: 'atendente' })
  await novoUsuario(BLOQUEADO, { papel: 'atendente', ativo: false })
  await novoUsuario(SEM_PERFIL, null)
})

describe('quem é quem', () => {
  it('o primeiro usuário de um projeto novo vira administrador', async () => {
    const { rows } = await db.query(
      'select papel, ativo from perfis where user_id = $1', [USUARIO_TESTE])
    expect(rows).toEqual([{ papel: 'admin', ativo: true }])
  })

  it('usuário criado depois, direto no painel, fica sem perfil e sem acesso', async () => {
    const { rows } = await db.query('select 1 from perfis where user_id = $1', [SEM_PERFIL])
    expect(rows).toHaveLength(0)
    const r = await comoUsuario(SEM_PERFIL, () => db.query('select usuario_ativo() as a'))
    expect(r.rows[0].a).toBe(false)
  })

  it('usuario_ativo e usuario_admin refletem o perfil', async () => {
    const ler = (uid) => comoUsuario(uid, async () => {
      const { rows: [r] } = await db.query(
        'select usuario_ativo() as ativo, usuario_admin() as admin')
      return r
    })
    expect(await ler(USUARIO_TESTE)).toEqual({ ativo: true, admin: true })
    expect(await ler(ATENDENTE)).toEqual({ ativo: true, admin: false })
    expect(await ler(BLOQUEADO)).toEqual({ ativo: false, admin: false })
    expect(await ler(SEM_PERFIL)).toEqual({ ativo: false, admin: false })
  })
})

describe('OS: só usuário ativo', () => {
  it('atendente cria e lê OS', async () => {
    await comoUsuario(ATENDENTE, () => db.query(NOVA_OS))
    const r = await comoUsuario(ATENDENTE, () => db.query('select id from ordens_servico'))
    expect(r.rows).toHaveLength(1)
  })

  it('usuário sem perfil não lê nem cria OS', async () => {
    await criarOS(db)
    const lido = await comoUsuario(SEM_PERFIL, () => db.query('select id from ordens_servico'))
    expect(lido.rows).toHaveLength(0)
    await expect(comoUsuario(SEM_PERFIL, () => db.query(NOVA_OS)))
      .rejects.toThrow(/row-level security/)
  })

  it('usuário bloqueado não lê nem altera OS', async () => {
    const os = await criarOS(db)
    const lido = await comoUsuario(BLOQUEADO, () => db.query('select id from ordens_servico'))
    expect(lido.rows).toHaveLength(0)
    const alterado = await comoUsuario(BLOQUEADO, () => db.query(
      "update ordens_servico set cliente_nome = 'Invasor' where id = $1 returning id", [os.id]))
    expect(alterado.rows).toHaveLength(0)
    const { rows: [o] } = await db.query(
      'select cliente_nome from ordens_servico where id = $1', [os.id])
    expect(o.cliente_nome).toBe('Cliente Teste')
  })

  it('visitante continua sem ler OS', async () => {
    await criarOS(db)
    const r = await como(db, 'anon', () => db.query('select id from ordens_servico'))
    expect(r.rows).toHaveLength(0)
  })
})

// O bloqueio vale também por funções, que não passam pelo RLS da mesma forma.
describe('funções: usuário bloqueado e atendente', () => {
  it('bloqueado não gera link de assinatura', async () => {
    const os = await criarOS(db)
    await expect(comoUsuario(BLOQUEADO, () =>
      db.query('select gerar_link_assinatura($1, false)', [os.id])))
      .rejects.toThrow(/acesso_negado/)
  })

  it('usuário ativo gera link de assinatura', async () => {
    const os = await criarOS(db)
    const r = await comoUsuario(ATENDENTE, () =>
      db.query('select gerar_link_assinatura($1, false) as r', [os.id]))
    expect(r.rows[0].r.codigo).toHaveLength(64)
  })

  it('bloqueado não cancela OS: ela não existe para ele', async () => {
    const os = await criarOS(db)
    await expect(comoUsuario(BLOQUEADO, () =>
      db.query('select cancelar_os($1)', [os.id]))).rejects.toThrow(/nao encontrada/)
    const { rows: [o] } = await db.query(
      'select status from ordens_servico where id = $1', [os.id])
    expect(o.status).toBe('orcamento')
  })

  it('bloqueado não substitui itens', async () => {
    const os = await criarOS(db)
    await expect(comoUsuario(BLOQUEADO, () =>
      db.query('select substituir_itens($1, $2::jsonb)', [os.id, '[]'])))
      .rejects.toThrow(/nao encontrada/)
  })

  it('atendente não define a numeração; administrador define', async () => {
    await expect(comoUsuario(ATENDENTE, () =>
      db.query('select definir_proximo_numero($1)', [500]))).rejects.toThrow(/acesso_negado/)
    await comoUsuario(USUARIO_TESTE, () =>
      db.query('select definir_proximo_numero($1)', [500]))
    const os = await criarOS(db)
    expect(Number(os.numero)).toBe(500)
  })
})

describe('Ajustes: só administrador', () => {
  it('atendente lê mas não altera as configurações', async () => {
    const lido = await comoUsuario(ATENDENTE, () =>
      db.query('select razao_social from configuracoes where id = 1'))
    expect(lido.rows).toHaveLength(1)
    const r = await comoUsuario(ATENDENTE, () => db.query(
      "update configuracoes set razao_social = 'X' where id = 1 returning id"))
    expect(r.rows).toHaveLength(0)
    const { rows: [c] } = await db.query('select razao_social from configuracoes where id = 1')
    expect(c.razao_social).toBe('Auto Elétrica MIZUHO II Ltda. - ME')
  })

  it('administrador altera as configurações', async () => {
    const r = await comoUsuario(USUARIO_TESTE, () => db.query(
      "update configuracoes set telefone = '11 0000-0000' where id = 1 returning id"))
    expect(r.rows).toHaveLength(1)
  })
})

describe('perfis: leitura limitada e nenhuma escrita direta', () => {
  it('atendente vê só o próprio perfil; administrador vê todos; visitante nenhum', async () => {
    const atendente = await comoUsuario(ATENDENTE, () => db.query('select user_id from perfis'))
    expect(atendente.rows.map((r) => r.user_id)).toEqual([ATENDENTE])
    const admin = await comoUsuario(USUARIO_TESTE, () => db.query('select user_id from perfis'))
    expect(admin.rows).toHaveLength(3)
    const visitante = await como(db, 'anon', () => db.query('select user_id from perfis'))
    expect(visitante.rows).toHaveLength(0)
  })

  it('o bloqueado ainda lê o próprio perfil (a tela precisa saber que foi bloqueado)', async () => {
    const r = await comoUsuario(BLOQUEADO, () => db.query('select ativo from perfis'))
    expect(r.rows).toEqual([{ ativo: false }])
  })

  it('ninguém se promove pela API', async () => {
    const r = await comoUsuario(ATENDENTE, () => db.query(
      "update perfis set papel = 'admin' where user_id = $1 returning user_id", [ATENDENTE]))
    expect(r.rows).toHaveLength(0)
    await expect(comoUsuario(ATENDENTE, () => db.query(
      `insert into perfis (user_id, usuario, nome, papel) values ($1, 'novo', 'Novo', 'admin')`,
      [SEM_PERFIL]))).rejects.toThrow(/row-level security/)
  })
})

describe('quem já usava o sistema antes da atualização', () => {
  it('vira administrador, com usuário tirado do e-mail e sem colisão', async () => {
    const antigo = await criarBanco({ ate: '0007' })
    await antigo.query(`
      insert into auth.users (id, email, created_at) values
        ('21111111-1111-4111-8111-111111111111', 'Maria.Silva@gmail.com', now() - interval '2 days'),
        ('22222222-2222-4222-8222-222222222222', 'maria.silva@outra.com',  now() - interval '1 day'),
        ('23333333-3333-4333-8333-333333333333', null,                     now())`)
    await aplicarMigration(antigo, '0008_perfis_e_acesso.sql')
    const { rows } = await antigo.query(
      'select usuario, papel, ativo from perfis order by usuario')
    expect(rows).toEqual([
      { usuario: 'maria.silva', papel: 'admin', ativo: true },
      { usuario: 'maria.silva.2222', papel: 'admin', ativo: true },
      { usuario: 'usuario', papel: 'admin', ativo: true },
    ])
  })

  it('a OS e o histórico de quem for apagado do painel permanecem', async () => {
    const os = await criarOS(db)
    await db.query('update ordens_servico set criado_por = $1 where id = $2', [ATENDENTE, os.id])
    await db.query('delete from auth.users where id = $1', [ATENDENTE])
    const { rows: [o] } = await db.query(
      'select criado_por from ordens_servico where id = $1', [os.id])
    expect(o.criado_por).toBe(null)
    const { rows: p } = await db.query('select 1 from perfis where user_id = $1', [ATENDENTE])
    expect(p).toHaveLength(0)
  })
})

describe('concessão', () => {
  it('as funções novas não ficam abertas ao visitante', async () => {
    for (const fn of ['usuario_ativo()', 'usuario_admin()']) {
      await expect(como(db, 'anon', () => db.query(`select ${fn}`)))
        .rejects.toThrow(/permission denied/)
    }
  })
})
```

- [ ] **Step 2: Rodar e ver vermelho**

Run: `npx vitest run supabase/acesso.test.js`
Expected: FAIL — `relation "perfis" does not exist` (e `function usuario_ativo() does not exist`).

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/0008_perfis_e_acesso.sql`:

```sql
-- Perfis, niveis de acesso e acesso so de usuario ativo.
--
-- Ate aqui qualquer usuario logado fazia tudo. Agora o acesso depende de um
-- perfil ativo, e Ajustes e numeracao dependem de ser administrador.

-- ---------------------------------------------------------------------------
-- 1. Perfis
-- ---------------------------------------------------------------------------
create table perfis (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  usuario    text not null unique check (usuario ~ '^[a-z0-9._-]{3,30}$'),
  nome       text not null check (length(trim(nome)) > 0),
  papel      text not null check (papel in ('admin', 'atendente')),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null
);
alter table perfis enable row level security;

-- Quem ja usava o sistema vira administrador: e o dono e quem ele ja liberou.
-- O usuario sai da parte do e-mail antes do @; repetidos ganham um sufixo.
with base as (
  select u.id, u.created_at,
         left(
           case
             when length(regexp_replace(lower(split_part(coalesce(u.email, ''), '@', 1)),
                                        '[^a-z0-9._-]', '', 'g')) >= 3
               then regexp_replace(lower(split_part(coalesce(u.email, ''), '@', 1)),
                                   '[^a-z0-9._-]', '', 'g')
             else 'usuario'
           end, 24) as nome_base
    from auth.users u
), numerado as (
  select id, nome_base,
         row_number() over (partition by nome_base order by created_at, id) as n
    from base
)
insert into perfis (user_id, usuario, nome, papel)
select id,
       case when n = 1 then nome_base else nome_base || '.' || substr(id::text, 1, 4) end,
       nome_base,
       'admin'
  from numerado;

-- Trava: se existem usuarios e nenhum virou administrador, algo deu errado, e
-- aplicar as policies abaixo trancaria o dono para fora.
do $$
begin
  if exists (select 1 from auth.users)
     and not exists (select 1 from perfis where papel = 'admin' and ativo) then
    raise exception 'migration abortada: existem usuarios e nenhum virou administrador';
  end if;
end $$;

-- Projeto novo: o primeiro usuario criado (pelo painel) vira administrador.
-- Sem isto, quem instala o sistema do zero nao entraria nunca. Depois do
-- primeiro, usuario criado fora do sistema fica sem perfil e sem acesso.
create or replace function perfil_do_primeiro_usuario() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_base text;
begin
  perform pg_advisory_xact_lock(hashtext('perfis_primeiro'));
  if not exists (select 1 from perfis) then
    v_base := regexp_replace(lower(split_part(coalesce(new.email, ''), '@', 1)),
                             '[^a-z0-9._-]', '', 'g');
    if length(v_base) < 3 then v_base := 'admin'; end if;
    v_base := left(v_base, 30);
    insert into perfis (user_id, usuario, nome, papel)
    values (new.id, v_base, v_base, 'admin');
  end if;
  return new;
end $$;

create trigger auth_users_primeiro_perfil
after insert on auth.users
for each row execute function perfil_do_primeiro_usuario();

-- ---------------------------------------------------------------------------
-- 2. Quem e quem
--
-- security definer para ler `perfis` sem passar pelo proprio RLS dele (que
-- chama estas funcoes). Sem perfil, ou inativo, e sem acesso.
-- ---------------------------------------------------------------------------
create or replace function usuario_ativo() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from perfis where user_id = auth.uid() and ativo)
$$;

create or replace function usuario_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from perfis
                  where user_id = auth.uid() and ativo and papel = 'admin')
$$;

revoke execute on function usuario_ativo(), usuario_admin() from public, anon;
grant  execute on function usuario_ativo(), usuario_admin() to authenticated;
revoke execute on function perfil_do_primeiro_usuario() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS: so usuario ativo; Ajustes so administrador
--
-- `(select ...)` faz o Postgres avaliar a funcao uma vez por consulta, nao
-- uma por linha.
-- ---------------------------------------------------------------------------
drop policy conf_le  on configuracoes;
drop policy conf_upd on configuracoes;
create policy conf_le  on configuracoes for select to authenticated
  using ((select usuario_ativo()));
create policy conf_upd on configuracoes for update to authenticated
  using ((select usuario_admin())) with check ((select usuario_admin()));

drop policy os_le  on ordens_servico;
drop policy os_ins on ordens_servico;
drop policy os_upd on ordens_servico;
create policy os_le  on ordens_servico for select to authenticated
  using ((select usuario_ativo()));
create policy os_ins on ordens_servico for insert to authenticated
  with check ((select usuario_ativo()));
create policy os_upd on ordens_servico for update to authenticated
  using ((select usuario_ativo())) with check ((select usuario_ativo()));

drop policy item_le  on os_itens;
drop policy item_ins on os_itens;
drop policy item_upd on os_itens;
drop policy item_del on os_itens;
create policy item_le  on os_itens for select to authenticated
  using ((select usuario_ativo()));
create policy item_ins on os_itens for insert to authenticated
  with check ((select usuario_ativo()));
create policy item_upd on os_itens for update to authenticated
  using ((select usuario_ativo())) with check ((select usuario_ativo()));
create policy item_del on os_itens for delete to authenticated
  using ((select usuario_ativo()));

drop policy pdf_grava   on storage.objects;
drop policy pdf_regrava on storage.objects;
create policy pdf_grava on storage.objects for insert to authenticated
  with check (bucket_id = 'os-pdfs' and (select usuario_ativo()));
create policy pdf_regrava on storage.objects for update to authenticated
  using (bucket_id = 'os-pdfs' and (select usuario_ativo()))
  with check (bucket_id = 'os-pdfs' and (select usuario_ativo()));

-- Perfis: cada um le o proprio (o bloqueado precisa saber que foi bloqueado);
-- o administrador le todos. Nao ha policy de escrita: so as funcoes escrevem.
create policy perfis_le on perfis for select to authenticated
  using (user_id = (select auth.uid()) or (select usuario_admin()));
revoke insert, update, delete, truncate on perfis from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4. Funcoes que o RLS nao cobre
--
-- gerar_link_assinatura e security definer: ignora o RLS, entao a checagem
-- tem de ser dela. (cancelar_os e substituir_itens sao security invoker e
-- ja respondem pelo RLS; versao_da_os nem e chamavel por usuario.)
-- ---------------------------------------------------------------------------
create or replace function gerar_link_assinatura(
  p_os_id uuid, p_renovar boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v        ordens_servico%rowtype;
  v_codigo text;
  v_expira timestamptz;
begin
  if not usuario_ativo() then
    raise exception 'acesso_negado';
  end if;

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

  update ordens_servico
     set assinatura_codigo = v_codigo, assinatura_expira_em = v_expira
   where id = p_os_id;

  return jsonb_build_object('codigo', v_codigo, 'expira_em', v_expira);
end $$;

create or replace function definir_proximo_numero(p_numero bigint) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if not usuario_admin() then
    raise exception 'acesso_negado';
  end if;
  if p_numero < 1 then
    raise exception 'O proximo numero precisa ser maior que zero';
  end if;
  if exists (select 1 from ordens_servico
              where numero is not null and numero >= p_numero) then
    raise exception 'Ja existe OS com numero maior ou igual a %', p_numero;
  end if;
  perform setval('os_numero_seq', p_numero, false);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Apagar um usuario no painel nao pode esbarrar nas OS dele
-- ---------------------------------------------------------------------------
alter table ordens_servico drop constraint ordens_servico_criado_por_fkey;
alter table ordens_servico add constraint ordens_servico_criado_por_fkey
  foreign key (criado_por) references auth.users(id) on delete set null;
```

- [ ] **Step 4: Rodar e ver verde**

Run: `npx vitest run supabase/acesso.test.js`
Expected: todos os testes de `acesso.test.js` passam.

- [ ] **Step 5: Manter a demonstração funcionando**

A migration vale também para a demonstração (ela roda as migrations reais), e `gerar_link_assinatura` e `definir_proximo_numero` agora exigem usuário. Sem isto os testes de fluxo da demonstração quebram aqui, e não numa tarefa distante.

Em `src/demo/cliente.js`, no objeto `auth`, troque `signInWithPassword` e `signOut` por:

```js
    async signInWithPassword({ email }) {
      sessao = { user: { ...USUARIO_DEMO, email: email || USUARIO_DEMO.email } }
      // As funções do banco leem quem está logado em auth.uid(), que lê este
      // sinalizador: é o que o PostgREST faz com o JWT no Supabase de verdade.
      const db = await bancoDemo()
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [USUARIO_DEMO_ID])
      avisar()
      return { data: { session: sessao }, error: null }
    },
    async signOut() {
      sessao = null
      const db = await bancoDemo()
      await db.query("select set_config('request.jwt.claim.sub', '', false)")
      avisar()
      return { error: null }
    },
```

Em `src/demo/banco.js`, no fim de `SEMENTE` (antes do `select setval`), acrescente:

```sql
  -- O perfil do usuário simulado nasceu da migration 0008 com o nome do e-mail.
  update perfis set nome = 'Demonstração', usuario = 'demo'
   where user_id = '99999999-9999-4999-8999-999999999999';
```

Em `src/demo/fluxo.test.js`, no `beforeAll`, depois das importações já existentes, acrescente a entrada na sessão:

```js
  const { supabase } = await import('../data/supabase.js')
  await supabase.auth.signInWithPassword({ email: 'teste@teste.com', password: 'x' })
```

Rode `npm test`. Se outro teste da demonstração (por exemplo da página de assinatura ou do bloco do dono) chamar `gerarLinkAssinatura` ou `definirProximoNumero` sem sessão, faça a mesma entrada no `beforeAll` dele.

Run: `npm test`
Expected: suíte inteira verde (297 anteriores + os novos). Se um teste antigo de `schema.test.js` falhar por falta de usuário ativo, ele roda como `authenticated` sem `como()`; troque para `como(db, 'authenticated', ...)`.

- [ ] **Step 6: Teste de mutação**

Em `0008_perfis_e_acesso.sql`, troque temporariamente `using ((select usuario_ativo()))` de **`os_le`** por `using (true)` e rode `npx vitest run supabase/acesso.test.js`.
Expected: **FAIL** em "usuário bloqueado não lê nem altera OS" e em "usuário sem perfil não lê nem cria OS". Reverta. Repita trocando, em `gerar_link_assinatura`, o `if not usuario_ativo()` por `if false`: **FAIL** em "bloqueado não gera link de assinatura". Reverta e confirme verde.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0008_perfis_e_acesso.sql supabase/acesso.test.js src/demo
git commit -m "Adiciona perfis e niveis de acesso, com RLS por usuario ativo"
```

---

### Task 3: Gestão de usuários (migration 0009)

**Files:**
- Create: `supabase/migrations/0009_gestao_de_usuarios.sql`, `supabase/usuarios.test.js`

**Interfaces:**
- Consumes: Task 2 (`perfis`, `usuario_admin()`, `usuario_ativo()`)
- Produces (SQL, todas `security definer`, só para administrador):
  - `listar_usuarios() returns jsonb` — array de `{user_id, usuario, nome, papel, ativo, criado_em}`
  - `criar_usuario(p_usuario text, p_nome text, p_senha text, p_papel text) returns jsonb` — `{user_id, usuario}`
  - `alterar_usuario(p_user_id uuid, p_nome text, p_papel text, p_ativo boolean) returns void`
  - `redefinir_senha(p_user_id uuid, p_senha text) returns void`
  - tabela `usuarios_historico(id, ator_id, ator_nome, alvo_id, alvo_usuario, acao, detalhe, em)`
  - Códigos de erro (texto da exceção): `acesso_negado`, `usuario_invalido`, `nome_invalido`, `senha_invalida`, `papel_invalido`, `dados_invalidos`, `usuario_em_uso`, `usuario_nao_encontrado`, `proprio_usuario`, `ultimo_admin`

- [ ] **Step 1: Escrever os testes (vermelhos)**

`supabase/usuarios.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { criarBanco, como, USUARIO_TESTE } from './banco-de-teste.js'

const ATENDENTE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OUTRO_ADMIN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

let db
const comoUsuario = (uid, fn) => como(db, 'authenticated', fn, uid)
const comoAdmin = (fn) => comoUsuario(USUARIO_TESTE, fn)

const criar = (usuario, nome = 'Maria', senha = 'senha1234', papel = 'atendente') =>
  comoAdmin(async () => {
    const { rows: [r] } = await db.query(
      'select criar_usuario($1, $2, $3, $4) as r', [usuario, nome, senha, papel])
    return r.r
  })

const alterar = (quem, id, nome, papel, ativo) =>
  comoUsuario(quem, () => db.query(
    'select alterar_usuario($1, $2, $3, $4)', [id, nome, papel, ativo]))

async function perfilDe(id) {
  const { rows } = await db.query('select * from perfis where user_id = $1', [id])
  return rows[0]
}

beforeEach(async () => {
  db = await criarBanco()
  // Um atendente e um segundo administrador já existentes, criados como dono.
  for (const [id, usuario, papel] of [
    [ATENDENTE, 'atendente1', 'atendente'], [OUTRO_ADMIN, 'admin2', 'admin'],
  ]) {
    await db.query('insert into auth.users (id, email) values ($1, $2)',
      [id, `${usuario}@mizuho.invalid`])
    await db.query(
      `insert into perfis (user_id, usuario, nome, papel) values ($1, $2, $3, $4)`,
      [id, usuario, usuario, papel])
  }
})

describe('quem pode chamar', () => {
  it('atendente é recusado em todas as funções de gestão', async () => {
    const chamadas = [
      ['select listar_usuarios()', []],
      ["select criar_usuario('novo1', 'Novo', 'senha1234', 'atendente')", []],
      ['select alterar_usuario($1, $2, $3, $4)', [ATENDENTE, 'X', 'atendente', true]],
      ['select redefinir_senha($1, $2)', [ATENDENTE, 'senha1234']],
    ]
    for (const [sql, args] of chamadas) {
      await expect(comoUsuario(ATENDENTE, () => db.query(sql, args)))
        .rejects.toThrow(/acesso_negado/)
    }
  })

  it('visitante não executa nenhuma', async () => {
    await expect(como(db, 'anon', () => db.query('select listar_usuarios()')))
      .rejects.toThrow(/permission denied/)
  })

  it('bloqueado também é recusado', async () => {
    await db.query('update perfis set ativo = false where user_id = $1', [ATENDENTE])
    await expect(comoUsuario(ATENDENTE, () => db.query('select listar_usuarios()')))
      .rejects.toThrow(/acesso_negado/)
  })
})

describe('listar_usuarios', () => {
  it('devolve todos, com o que a tela precisa', async () => {
    const lista = await comoAdmin(async () => {
      const { rows: [r] } = await db.query('select listar_usuarios() as r')
      return r.r
    })
    expect(lista).toHaveLength(3)
    expect(Object.keys(lista[0]).sort()).toEqual(
      ['ativo', 'criado_em', 'nome', 'papel', 'user_id', 'usuario'])
  })
})

describe('criar_usuario', () => {
  it('cria o login do Supabase Auth, a identidade e o perfil', async () => {
    const r = await criar('maria', 'Maria Souza')
    expect(r.usuario).toBe('maria')

    const { rows: [u] } = await db.query('select * from auth.users where id = $1', [r.user_id])
    expect(u.email).toBe('maria@mizuho.invalid')
    expect(u.aud).toBe('authenticated')
    expect(u.role).toBe('authenticated')
    expect(u.email_confirmed_at).not.toBe(null)
    expect(u.instance_id).toBe('00000000-0000-0000-0000-000000000000')
    expect(u.encrypted_password).toMatch(/^stub\$/)
    expect(u.encrypted_password).not.toContain('senha1234')
    // O GoTrue lê estas quatro como texto: NULL quebra o login com
    // "Database error querying schema".
    for (const col of ['confirmation_token', 'recovery_token',
                       'email_change_token_new', 'email_change']) {
      expect(u[col]).toBe('')
    }

    const { rows: ident } = await db.query(
      'select * from auth.identities where user_id = $1', [r.user_id])
    expect(ident).toHaveLength(1)
    expect(ident[0].provider).toBe('email')
    expect(ident[0].identity_data.email).toBe('maria@mizuho.invalid')

    const p = await perfilDe(r.user_id)
    expect(p).toMatchObject({ usuario: 'maria', nome: 'Maria Souza', papel: 'atendente', ativo: true })
    expect(p.criado_por).toBe(USUARIO_TESTE)
  })

  it('normaliza o usuário: maiúscula e espaço nas pontas', async () => {
    const r = await criar('  MARIA ')
    expect(r.usuario).toBe('maria')
  })

  it('registra a criação no histórico de usuários', async () => {
    await criar('maria', 'Maria Souza')
    const { rows } = await db.query(
      "select ator_nome, alvo_usuario, acao, detalhe from usuarios_historico where acao = 'criado'")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ alvo_usuario: 'maria', detalhe: { papel: 'atendente' } })
  })

  it.each([
    ['usuario curto', ['ab'], /usuario_invalido/],
    ['usuario com espaço', ['ma ria'], /usuario_invalido/],
    ['usuario com acento', ['josé'], /usuario_invalido/],
    ['usuario com 31 caracteres', ['a'.repeat(31)], /usuario_invalido/],
    ['nome vazio', ['maria', '   '], /nome_invalido/],
    ['senha de 7 caracteres', ['maria', 'Maria', '1234567'], /senha_invalida/],
    ['senha de 73 bytes', ['maria', 'Maria', 'a'.repeat(73)], /senha_invalida/],
    ['papel desconhecido', ['maria', 'Maria', 'senha1234', 'dono'], /papel_invalido/],
  ])('recusa %s', async (_nome, args, erro) => {
    await expect(criar(...args)).rejects.toThrow(erro)
  })

  it('aceita senha acentuada de exatamente 72 bytes', async () => {
    // 'é' ocupa 2 bytes: 36 letras = 72 bytes.
    await expect(criar('maria', 'Maria', 'é'.repeat(36))).resolves.toBeTruthy()
  })

  it('recusa usuário repetido, inclusive em outra caixa', async () => {
    await criar('maria')
    await expect(criar('MARIA')).rejects.toThrow(/usuario_em_uso/)
  })

  it('recusa usuário cujo e-mail já existe sem perfil (criado direto no painel)', async () => {
    await db.query("insert into auth.users (id, email) values (gen_random_uuid(), 'fantasma@mizuho.invalid')")
    await expect(criar('fantasma')).rejects.toThrow(/usuario_em_uso/)
  })
})

describe('alterar_usuario', () => {
  it('muda nome e nível e registra cada mudança', async () => {
    await alterar(USUARIO_TESTE, ATENDENTE, 'Novo Nome', 'admin', true)
    expect(await perfilDe(ATENDENTE)).toMatchObject({ nome: 'Novo Nome', papel: 'admin' })
    const { rows } = await db.query(
      "select acao, detalhe from usuarios_historico where alvo_id = $1 order by acao", [ATENDENTE])
    expect(rows.map((r) => r.acao)).toEqual(['nome_alterado', 'papel_alterado'])
    expect(rows[1].detalhe).toEqual({ de: 'atendente', para: 'admin' })
  })

  it('bloquear: marca inativo, proíbe novo login e encerra as sessões', async () => {
    await db.query('insert into auth.sessions (user_id) values ($1), ($1)', [ATENDENTE])
    await alterar(USUARIO_TESTE, ATENDENTE, 'atendente1', 'atendente', false)

    expect((await perfilDe(ATENDENTE)).ativo).toBe(false)
    const { rows: [u] } = await db.query(
      'select banned_until from auth.users where id = $1', [ATENDENTE])
    expect(new Date(u.banned_until).getTime()).toBeGreaterThan(Date.now() + 365 * 86400000)
    const { rows: s } = await db.query(
      'select 1 from auth.sessions where user_id = $1', [ATENDENTE])
    expect(s).toHaveLength(0)
    const { rows: h } = await db.query(
      "select acao from usuarios_historico where alvo_id = $1", [ATENDENTE])
    expect(h.map((r) => r.acao)).toContain('bloqueado')
  })

  it('bloqueado perde o acesso às OS na mesma hora', async () => {
    await db.query(`insert into ordens_servico (cliente_nome, veiculo_descricao, veiculo_placa)
                    values ('C', 'V', 'ABC1D23')`)
    const antes = await comoUsuario(ATENDENTE, () => db.query('select id from ordens_servico'))
    expect(antes.rows).toHaveLength(1)
    await alterar(USUARIO_TESTE, ATENDENTE, 'atendente1', 'atendente', false)
    const depois = await comoUsuario(ATENDENTE, () => db.query('select id from ordens_servico'))
    expect(depois.rows).toHaveLength(0)
  })

  it('reativar: volta a ativo e limpa o banimento', async () => {
    await alterar(USUARIO_TESTE, ATENDENTE, 'atendente1', 'atendente', false)
    await alterar(USUARIO_TESTE, ATENDENTE, 'atendente1', 'atendente', true)
    expect((await perfilDe(ATENDENTE)).ativo).toBe(true)
    const { rows: [u] } = await db.query(
      'select banned_until from auth.users where id = $1', [ATENDENTE])
    expect(u.banned_until).toBe(null)
    const { rows: h } = await db.query(
      "select acao from usuarios_historico where alvo_id = $1", [ATENDENTE])
    expect(h.map((r) => r.acao)).toEqual(['bloqueado', 'reativado'])
  })

  it('ninguém altera o próprio papel nem o próprio ativo', async () => {
    await expect(alterar(USUARIO_TESTE, USUARIO_TESTE, 'Eu', 'atendente', true))
      .rejects.toThrow(/proprio_usuario/)
    await expect(alterar(USUARIO_TESTE, USUARIO_TESTE, 'Eu', 'admin', false))
      .rejects.toThrow(/proprio_usuario/)
    expect((await perfilDe(USUARIO_TESTE)).papel).toBe('admin')
  })

  it('o próprio nome pode mudar', async () => {
    await alterar(USUARIO_TESTE, USUARIO_TESTE, 'Dono da Oficina', 'admin', true)
    expect((await perfilDe(USUARIO_TESTE)).nome).toBe('Dono da Oficina')
  })

  it('rebaixado, o administrador perde o poder na hora (o que o lock garante sob concorrência)', async () => {
    await alterar(USUARIO_TESTE, OUTRO_ADMIN, 'admin2', 'atendente', true)
    await expect(alterar(OUTRO_ADMIN, USUARIO_TESTE, 'x', 'atendente', true))
      .rejects.toThrow(/acesso_negado/)
    expect((await perfilDe(USUARIO_TESTE)).papel).toBe('admin')
  })

  it('recusa usuário inexistente e dados inválidos', async () => {
    await expect(alterar(USUARIO_TESTE, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'X', 'atendente', true))
      .rejects.toThrow(/usuario_nao_encontrado/)
    await expect(alterar(USUARIO_TESTE, ATENDENTE, '', 'atendente', true))
      .rejects.toThrow(/nome_invalido/)
    await expect(alterar(USUARIO_TESTE, ATENDENTE, 'X', 'dono', true))
      .rejects.toThrow(/papel_invalido/)
    await expect(alterar(USUARIO_TESTE, ATENDENTE, 'X', 'atendente', null))
      .rejects.toThrow(/dados_invalidos/)
  })
})

describe('redefinir_senha', () => {
  const redefinir = (quem, id, senha) =>
    comoUsuario(quem, () => db.query('select redefinir_senha($1, $2)', [id, senha]))

  it('troca o hash, encerra as sessões e registra', async () => {
    const { rows: [antes] } = await db.query(
      'select encrypted_password from auth.users where id = $1', [ATENDENTE])
    await db.query('insert into auth.sessions (user_id) values ($1)', [ATENDENTE])
    await redefinir(USUARIO_TESTE, ATENDENTE, 'novasenha99')

    const { rows: [depois] } = await db.query(
      'select encrypted_password from auth.users where id = $1', [ATENDENTE])
    expect(depois.encrypted_password).not.toBe(antes.encrypted_password)
    expect(depois.encrypted_password).not.toContain('novasenha99')
    const { rows: s } = await db.query('select 1 from auth.sessions where user_id = $1', [ATENDENTE])
    expect(s).toHaveLength(0)
    const { rows: h } = await db.query(
      "select acao from usuarios_historico where alvo_id = $1", [ATENDENTE])
    expect(h.map((r) => r.acao)).toEqual(['senha_redefinida'])
  })

  it('o administrador troca a própria senha', async () => {
    await expect(redefinir(USUARIO_TESTE, USUARIO_TESTE, 'outrasenha1')).resolves.toBeTruthy()
  })

  it('recusa senha curta e usuário inexistente', async () => {
    await expect(redefinir(USUARIO_TESTE, ATENDENTE, '1234567')).rejects.toThrow(/senha_invalida/)
    await expect(redefinir(USUARIO_TESTE, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'senha1234'))
      .rejects.toThrow(/usuario_nao_encontrado/)
  })
})

describe('usuarios_historico', () => {
  it('só o administrador lê; ninguém escreve pela API', async () => {
    await criar('maria')
    const admin = await comoAdmin(() => db.query('select id from usuarios_historico'))
    expect(admin.rows.length).toBeGreaterThan(0)
    const atendente = await comoUsuario(ATENDENTE, () => db.query('select id from usuarios_historico'))
    expect(atendente.rows).toHaveLength(0)

    await expect(comoAdmin(() => db.query(
      `insert into usuarios_historico (ator_nome, alvo_id, alvo_usuario, acao)
       values ('x', gen_random_uuid(), 'x', 'criado')`))).rejects.toThrow(/row-level security/)
    const alterado = await comoAdmin(() => db.query(
      "update usuarios_historico set ator_nome = 'forjado' returning id"))
    expect(alterado.rows).toHaveLength(0)
    const apagado = await comoAdmin(() => db.query('delete from usuarios_historico returning id'))
    expect(apagado.rows).toHaveLength(0)
  })

  it('o nome de quem agiu fica congelado no registro', async () => {
    await criar('maria')
    await alterar(USUARIO_TESTE, USUARIO_TESTE, 'Nome Novo do Dono', 'admin', true)
    const { rows } = await db.query(
      "select ator_nome from usuarios_historico where acao = 'criado'")
    expect(rows[0].ator_nome).not.toBe('Nome Novo do Dono')
  })
})
```

- [ ] **Step 2: Rodar e ver vermelho**

Run: `npx vitest run supabase/usuarios.test.js`
Expected: FAIL — `function listar_usuarios() does not exist` / `relation "usuarios_historico" does not exist`.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/0009_gestao_de_usuarios.sql`:

```sql
-- Gestao de usuarios, so para administrador.
--
-- Cria e altera usuarios direto em auth.users, sem service_role. O caminho e
-- sensivel a mudancas internas do Supabase Auth: o que o GoTrue exige de uma
-- linha de auth.users esta no comentario de criar_usuario, e a verificacao
-- que vale e entrar com o usuario criado, contra o projeto real.

-- ---------------------------------------------------------------------------
-- 1. Registro das acoes sobre usuarios (so de inclusao)
-- ---------------------------------------------------------------------------
create table usuarios_historico (
  id            bigint generated always as identity primary key,
  -- Sem chave estrangeira: o historico sobrevive a quem for apagado do painel.
  ator_id       uuid,
  ator_nome     text not null,
  alvo_id       uuid not null,
  alvo_usuario  text not null,
  acao          text not null check (acao in
                  ('criado', 'nome_alterado', 'papel_alterado',
                   'bloqueado', 'reativado', 'senha_redefinida')),
  detalhe       jsonb not null default '{}'::jsonb,
  em            timestamptz not null default now()
);
create index usuarios_historico_em_idx on usuarios_historico (em desc, id desc);

alter table usuarios_historico enable row level security;
create policy usuarios_hist_le on usuarios_historico for select to authenticated
  using ((select usuario_admin()));
revoke insert, update, delete, truncate on usuarios_historico from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2. Porta de entrada comum
--
-- A ordem importa: o lock vem ANTES da conferencia de administrador. Se fosse
-- depois, dois administradores que se rebaixam ao mesmo tempo conferiam "sou
-- administrador" antes de qualquer um gravar, e os dois passavam.
-- Interna: so as funcoes abaixo a chamam (como dono).
-- ---------------------------------------------------------------------------
create or replace function iniciar_gestao_de_usuarios() returns perfis
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ator perfis%rowtype;
begin
  if not usuario_admin() then
    raise exception 'acesso_negado';
  end if;
  perform pg_advisory_xact_lock(hashtext('perfis_gestao'));
  select * into v_ator from perfis
   where user_id = auth.uid() and ativo and papel = 'admin';
  if not found then
    raise exception 'acesso_negado';
  end if;
  return v_ator;
end $$;

revoke execute on function iniciar_gestao_de_usuarios() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Listar
-- ---------------------------------------------------------------------------
create or replace function listar_usuarios() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not usuario_admin() then
    raise exception 'acesso_negado';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id', p.user_id, 'usuario', p.usuario, 'nome', p.nome,
             'papel', p.papel, 'ativo', p.ativo, 'criado_em', p.criado_em)
           order by p.ativo desc, lower(p.nome), p.usuario)
      from perfis p), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Criar
--
-- O que o GoTrue exige de uma linha de auth.users para o login funcionar:
--  * instance_id nulo-zero, aud e role 'authenticated', e-mail confirmado;
--  * confirmation_token, recovery_token, email_change_token_new e email_change
--    como '' (NULL quebra o login com "Database error querying schema");
--  * uma linha em auth.identities com provider 'email';
--  * senha em bcrypt, via crypt() do pgcrypto (schema extensions no Supabase).
-- ---------------------------------------------------------------------------
create or replace function criar_usuario(
  p_usuario text, p_nome text, p_senha text, p_papel text
) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_ator    perfis%rowtype;
  v_usuario text := lower(trim(coalesce(p_usuario, '')));
  v_nome    text := trim(coalesce(p_nome, ''));
  v_email   text;
  v_id      uuid := gen_random_uuid();
begin
  v_ator := iniciar_gestao_de_usuarios();

  if v_usuario !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'usuario_invalido';
  end if;
  if v_nome = '' or length(v_nome) > 60 then
    raise exception 'nome_invalido';
  end if;
  if p_senha is null or length(p_senha) < 8 or octet_length(p_senha) > 72 then
    raise exception 'senha_invalida';
  end if;
  if p_papel is null or p_papel not in ('admin', 'atendente') then
    raise exception 'papel_invalido';
  end if;

  v_email := v_usuario || '@mizuho.invalid';
  if exists (select 1 from perfis where usuario = v_usuario)
     or exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'usuario_em_uso';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_email, crypt(p_senha, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email,
                       'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );

  insert into perfis (user_id, usuario, nome, papel, criado_por)
  values (v_id, v_usuario, v_nome, p_papel, v_ator.user_id);

  insert into usuarios_historico (ator_id, ator_nome, alvo_id, alvo_usuario, acao, detalhe)
  values (v_ator.user_id, v_ator.nome, v_id, v_usuario, 'criado',
          jsonb_build_object('papel', p_papel));

  return jsonb_build_object('user_id', v_id, 'usuario', v_usuario);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Alterar (nome, nivel, bloqueio)
-- ---------------------------------------------------------------------------
create or replace function alterar_usuario(
  p_user_id uuid, p_nome text, p_papel text, p_ativo boolean
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ator perfis%rowtype;
  v_alvo perfis%rowtype;
  v_nome text := trim(coalesce(p_nome, ''));
begin
  v_ator := iniciar_gestao_de_usuarios();

  select * into v_alvo from perfis where user_id = p_user_id for update;
  if not found then
    raise exception 'usuario_nao_encontrado';
  end if;
  if v_nome = '' or length(v_nome) > 60 then
    raise exception 'nome_invalido';
  end if;
  if p_papel is null or p_papel not in ('admin', 'atendente') then
    raise exception 'papel_invalido';
  end if;
  if p_ativo is null then
    raise exception 'dados_invalidos';
  end if;

  -- Nem para cima nem para baixo: quem se bloqueia ou se rebaixa nao volta
  -- sozinho. O nome proprio pode mudar.
  if p_user_id = v_ator.user_id
     and (p_papel <> v_alvo.papel or p_ativo <> v_alvo.ativo) then
    raise exception 'proprio_usuario';
  end if;

  -- Guarda defensiva: com a regra acima o ator continua administrador ativo,
  -- entao so uma regressao nela deixaria o sistema sem administrador.
  if v_alvo.papel = 'admin' and v_alvo.ativo and (p_papel <> 'admin' or not p_ativo)
     and not exists (select 1 from perfis
                      where papel = 'admin' and ativo and user_id <> p_user_id) then
    raise exception 'ultimo_admin';
  end if;

  update perfis set nome = v_nome, papel = p_papel, ativo = p_ativo
   where user_id = p_user_id;

  if p_ativo is distinct from v_alvo.ativo then
    -- 100 anos: o GoTrue le banned_until como horario e nao entende 'infinity'.
    update auth.users
       set banned_until = case when p_ativo then null
                               else now() + interval '100 years' end
     where id = p_user_id;
    if not p_ativo then
      delete from auth.sessions where user_id = p_user_id;
    end if;
    insert into usuarios_historico (ator_id, ator_nome, alvo_id, alvo_usuario, acao)
    values (v_ator.user_id, v_ator.nome, p_user_id, v_alvo.usuario,
            case when p_ativo then 'reativado' else 'bloqueado' end);
  end if;

  if v_nome is distinct from v_alvo.nome then
    insert into usuarios_historico (ator_id, ator_nome, alvo_id, alvo_usuario, acao, detalhe)
    values (v_ator.user_id, v_ator.nome, p_user_id, v_alvo.usuario, 'nome_alterado',
            jsonb_build_object('de', v_alvo.nome, 'para', v_nome));
  end if;

  if p_papel is distinct from v_alvo.papel then
    insert into usuarios_historico (ator_id, ator_nome, alvo_id, alvo_usuario, acao, detalhe)
    values (v_ator.user_id, v_ator.nome, p_user_id, v_alvo.usuario, 'papel_alterado',
            jsonb_build_object('de', v_alvo.papel, 'para', p_papel));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Redefinir senha
-- ---------------------------------------------------------------------------
create or replace function redefinir_senha(p_user_id uuid, p_senha text) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_ator perfis%rowtype;
  v_alvo perfis%rowtype;
begin
  v_ator := iniciar_gestao_de_usuarios();

  select * into v_alvo from perfis where user_id = p_user_id;
  if not found then
    raise exception 'usuario_nao_encontrado';
  end if;
  if p_senha is null or length(p_senha) < 8 or octet_length(p_senha) > 72 then
    raise exception 'senha_invalida';
  end if;

  update auth.users
     set encrypted_password = crypt(p_senha, gen_salt('bf')), updated_at = now()
   where id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;

  insert into usuarios_historico (ator_id, ator_nome, alvo_id, alvo_usuario, acao)
  values (v_ator.user_id, v_ator.nome, p_user_id, v_alvo.usuario, 'senha_redefinida');
end $$;

-- ---------------------------------------------------------------------------
-- 7. Quem executa
-- ---------------------------------------------------------------------------
revoke execute on function listar_usuarios()                          from public, anon;
revoke execute on function criar_usuario(text, text, text, text)      from public, anon;
revoke execute on function alterar_usuario(uuid, text, text, boolean) from public, anon;
revoke execute on function redefinir_senha(uuid, text)                from public, anon;

grant execute on function listar_usuarios()                          to authenticated;
grant execute on function criar_usuario(text, text, text, text)      to authenticated;
grant execute on function alterar_usuario(uuid, text, text, boolean) to authenticated;
grant execute on function redefinir_senha(uuid, text)                to authenticated;
```

- [ ] **Step 4: Rodar e ver verde**

Run: `npx vitest run supabase/usuarios.test.js`
Expected: todos passam.

Run: `npm test`
Expected: suíte inteira verde.

- [ ] **Step 5: Teste de mutação**

`iniciar_gestao_de_usuarios` tem duas checagens que se repetem de propósito (a rápida, antes do lock, e a que vale, depois dele). Troque temporariamente **só a primeira** (`if not usuario_admin() then`) por `if false then` e rode `npx vitest run supabase/usuarios.test.js`.
Expected: **continua verde** (a segunda barra do mesmo jeito; isto prova que a redundância é real). Agora troque **também** o `raise exception 'acesso_negado'` da segunda por `null`: **FAIL** em "atendente é recusado em todas as funções de gestão" e em "rebaixado, o administrador perde o poder na hora". Reverta as duas.

Em `alterar_usuario`, troque `p_user_id = v_ator.user_id` por `false`: **FAIL** em "ninguém altera o próprio papel nem o próprio ativo". Reverta e confirme verde.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0009_gestao_de_usuarios.sql supabase/usuarios.test.js
git commit -m "Adiciona funcoes de gestao de usuarios restritas a administrador"
```

---

### Task 4: Histórico de atividade por OS (migration 0010)

**Files:**
- Create: `supabase/migrations/0010_historico_de_atividade.sql`, `supabase/historico.test.js`

**Interfaces:**
- Consumes: Tasks 2–3 (`perfis`, `usuario_ativo()`); gatilhos existentes `recalcular_total_os`, `travar_itens_assinados`
- Produces (SQL): tabela `os_historico(id, os_id, usuario_id, usuario_nome, acao, detalhe, transacao, em)`; `acao` ∈ `criada | dados_alterados | itens_alterados | status_alterado | link_gerado | aceita | cancelada`; `detalhe`:
  - `criada`: `{status, numero}`
  - `dados_alterados`: `{<campo>: {de, para}}` para `cliente_nome, cliente_telefone, veiculo_descricao, veiculo_placa, data_os, observacoes`
  - `itens_alterados`: `{total_de, total_para}` (centavos), uma linha por transação
  - `status_alterado`: `{de, para}`; `cancelada`: `{de}`
  - `link_gerado`: `{expira_em}`; `aceita`: `{total_centavos, status_de, status_para}`

- [ ] **Step 1: Escrever os testes (vermelhos)**

`supabase/historico.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import {
  criarBanco, como, criarOS, adicionarItem, USUARIO_TESTE,
} from './banco-de-teste.js'

const ATENDENTE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

let db
const comoUsuario = (uid, fn) => como(db, 'authenticated', fn, uid)

async function eventos(osId, acao) {
  const { rows } = await db.query(
    `select acao, usuario_nome, usuario_id, detalhe from os_historico
      where os_id = $1 ${acao ? 'and acao = $2' : ''} order by id`,
    acao ? [osId, acao] : [osId])
  return rows
}

// Cria a OS como o atendente, pela API (é assim que ela nasce na vida real).
async function osDoAtendente() {
  return comoUsuario(ATENDENTE, async () => {
    const { rows: [os] } = await db.query(
      `insert into ordens_servico (cliente_nome, veiculo_descricao, veiculo_placa, criado_por)
       values ('Cliente', 'Carro', 'ABC1D23', $1) returning id`, [ATENDENTE])
    return os
  })
}

beforeEach(async () => {
  db = await criarBanco()
  await db.query("insert into auth.users (id, email) values ($1, 'atendente1@mizuho.invalid')", [ATENDENTE])
  await db.query(
    `insert into perfis (user_id, usuario, nome, papel)
     values ($1, 'atendente1', 'Maria Atendente', 'atendente')`, [ATENDENTE])
})

describe('quem fez', () => {
  it('registra a criação com o nome de quem criou', async () => {
    const os = await osDoAtendente()
    const ev = await eventos(os.id)
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({
      acao: 'criada', usuario_nome: 'Maria Atendente', usuario_id: ATENDENTE,
    })
  })

  it('fora de uma sessão, o autor é "Sistema"', async () => {
    const os = await criarOS(db)
    expect((await eventos(os.id))[0].usuario_nome).toBe('Sistema')
  })

  it('o nome gravado não muda quando a pessoa é renomeada, nem some se ela for apagada', async () => {
    const os = await osDoAtendente()
    await db.query("update perfis set nome = 'Outro Nome' where user_id = $1", [ATENDENTE])
    expect((await eventos(os.id))[0].usuario_nome).toBe('Maria Atendente')
    await db.query('delete from auth.users where id = $1', [ATENDENTE])
    const ev = await eventos(os.id)
    expect(ev[0].usuario_nome).toBe('Maria Atendente')
  })
})

describe('o que é registrado', () => {
  it('dados alterados: só os campos que mudaram, com de e para', async () => {
    const os = await osDoAtendente()
    await comoUsuario(ATENDENTE, () => db.query(
      `update ordens_servico set cliente_nome = 'Cliente Novo', veiculo_placa = 'XYZ9K88'
        where id = $1`, [os.id]))
    const [ev] = await eventos(os.id, 'dados_alterados')
    expect(ev.detalhe).toEqual({
      cliente_nome: { de: 'Cliente', para: 'Cliente Novo' },
      veiculo_placa: { de: 'ABC1D23', para: 'XYZ9K88' },
    })
  })

  it('atualizar sem mudar nada não registra', async () => {
    const os = await osDoAtendente()
    await comoUsuario(ATENDENTE, () => db.query(
      "update ordens_servico set cliente_nome = 'Cliente' where id = $1", [os.id]))
    expect(await eventos(os.id, 'dados_alterados')).toHaveLength(0)
  })

  it('status: de e para; cancelar tem ação própria', async () => {
    const os = await osDoAtendente()
    await comoUsuario(ATENDENTE, () => db.query(
      "update ordens_servico set status = 'aprovada' where id = $1", [os.id]))
    expect((await eventos(os.id, 'status_alterado'))[0].detalhe)
      .toEqual({ de: 'orcamento', para: 'aprovada' })

    await comoUsuario(ATENDENTE, () => db.query('select cancelar_os($1)', [os.id]))
    const cancelada = await eventos(os.id, 'cancelada')
    expect(cancelada).toHaveLength(1)
    expect(cancelada[0].usuario_nome).toBe('Maria Atendente')
    expect(cancelada[0].detalhe).toEqual({ de: 'aprovada' })
  })

  it('o link de assinatura gerado vira evento', async () => {
    const os = await osDoAtendente()
    await comoUsuario(ATENDENTE, () =>
      db.query('select gerar_link_assinatura($1, false)', [os.id]))
    const ev = await eventos(os.id, 'link_gerado')
    expect(ev).toHaveLength(1)
    expect(ev[0].usuario_nome).toBe('Maria Atendente')
    expect(ev[0].detalhe.expira_em).toBeTruthy()
  })

  it('o aceite do cliente aparece como "Cliente (assinatura)", sem usuário', async () => {
    const os = await osDoAtendente()
    await adicionarItem(db, os.id, 1, 'Alternador', 48000)
    const { rows: [{ r: link }] } = await comoUsuario(ATENDENTE, () =>
      db.query('select gerar_link_assinatura($1, false) as r', [os.id]))
    const { rows: [{ r: vista }] } = await como(db, 'anon', () =>
      db.query('select obter_os_para_assinatura($1) as r', [link.codigo]))
    // Mesmo com um funcionário logado no mesmo navegador, quem assina é o cliente.
    await comoUsuario(ATENDENTE, () => db.query(
      'select registrar_aceite($1, $2, $3, $4)', [link.codigo, PNG, 48000, vista.versao]))

    const [aceite] = await eventos(os.id, 'aceita')
    expect(aceite.usuario_nome).toBe('Cliente (assinatura)')
    expect(aceite.usuario_id).toBe(null)
    expect(aceite.detalhe).toEqual({
      total_centavos: 48000, status_de: 'orcamento', status_para: 'aprovada',
    })
    // O status mudou por causa do aceite: não há um segundo evento para isso.
    expect(await eventos(os.id, 'status_alterado')).toHaveLength(0)
  })
})

describe('itens', () => {
  it('uma operação com vários itens vira UM evento, com total antes e depois', async () => {
    const os = await osDoAtendente()
    await comoUsuario(ATENDENTE, () => db.query(
      'select substituir_itens($1, $2::jsonb)', [os.id, JSON.stringify([
        { posicao: 1, quantidade: 1, descricao: 'Alternador',
          valor_unitario_centavos: 38000, valor_total_centavos: 38000 },
        { posicao: 2, quantidade: 1, descricao: 'Correia',
          valor_unitario_centavos: 10000, valor_total_centavos: 10000 },
      ])]))
    const ev = await eventos(os.id, 'itens_alterados')
    expect(ev).toHaveLength(1)
    expect(ev[0].detalhe).toEqual({ total_de: 0, total_para: 48000 })
    expect(ev[0].usuario_nome).toBe('Maria Atendente')
  })

  it('uma segunda edição é outro evento, partindo do total anterior', async () => {
    const os = await osDoAtendente()
    const itens = (valor) => JSON.stringify([
      { posicao: 1, quantidade: 1, descricao: 'Alternador',
        valor_unitario_centavos: valor, valor_total_centavos: valor }])
    await comoUsuario(ATENDENTE, () =>
      db.query('select substituir_itens($1, $2::jsonb)', [os.id, itens(38000)]))
    await comoUsuario(ATENDENTE, () =>
      db.query('select substituir_itens($1, $2::jsonb)', [os.id, itens(45000)]))
    const ev = await eventos(os.id, 'itens_alterados')
    expect(ev.map((e) => e.detalhe)).toEqual([
      { total_de: 0, total_para: 38000 },
      { total_de: 38000, total_para: 45000 },
    ])
  })

  it('trocar um item por outro do mesmo valor também é registrado', async () => {
    const os = await osDoAtendente()
    await adicionarItem(db, os.id, 1, 'Alternador novo', 30000)
    await comoUsuario(ATENDENTE, () => db.query(
      "update os_itens set descricao = 'Alternador recondicionado' where os_id = $1", [os.id]))
    const ev = await eventos(os.id, 'itens_alterados')
    expect(ev.length).toBeGreaterThan(0)
    expect(ev.at(-1).detalhe).toEqual({ total_de: 30000, total_para: 30000 })
  })

  it('OS assinada recusa a edição e não deixa evento para trás', async () => {
    const os = await osDoAtendente()
    await adicionarItem(db, os.id, 1, 'Alternador', 48000)
    const { rows: [{ r: link }] } = await comoUsuario(ATENDENTE, () =>
      db.query('select gerar_link_assinatura($1, false) as r', [os.id]))
    const { rows: [{ r: vista }] } = await como(db, 'anon', () =>
      db.query('select obter_os_para_assinatura($1) as r', [link.codigo]))
    await como(db, 'anon', () => db.query(
      'select registrar_aceite($1, $2, $3, $4)', [link.codigo, PNG, 48000, vista.versao]))
    const antes = (await eventos(os.id, 'itens_alterados')).length

    await expect(comoUsuario(ATENDENTE, () => db.query(
      "update os_itens set descricao = 'Outro' where os_id = $1", [os.id])))
      .rejects.toThrow(/assinada/)
    expect((await eventos(os.id, 'itens_alterados')).length).toBe(antes)
  })
})

describe('o histórico não se altera', () => {
  it('quem usa o sistema lê, mas não escreve, edita nem apaga', async () => {
    const os = await osDoAtendente()
    const lido = await comoUsuario(ATENDENTE, () =>
      db.query('select id from os_historico where os_id = $1', [os.id]))
    expect(lido.rows.length).toBeGreaterThan(0)

    await expect(comoUsuario(ATENDENTE, () => db.query(
      `insert into os_historico (os_id, usuario_nome, acao) values ($1, 'x', 'criada')`,
      [os.id]))).rejects.toThrow(/row-level security/)
    const alterado = await comoUsuario(ATENDENTE, () => db.query(
      "update os_historico set usuario_nome = 'forjado' returning id"))
    expect(alterado.rows).toHaveLength(0)
    const apagado = await comoUsuario(ATENDENTE, () =>
      db.query('delete from os_historico returning id'))
    expect(apagado.rows).toHaveLength(0)
  })

  it('bloqueado e visitante não leem', async () => {
    const os = await osDoAtendente()
    await db.query('update perfis set ativo = false where user_id = $1', [ATENDENTE])
    const bloqueado = await comoUsuario(ATENDENTE, () =>
      db.query('select id from os_historico where os_id = $1', [os.id]))
    expect(bloqueado.rows).toHaveLength(0)
    const visitante = await como(db, 'anon', () =>
      db.query('select id from os_historico'))
    expect(visitante.rows).toHaveLength(0)
  })

  it('não há função de registro exposta a ninguém', async () => {
    const os = await criarOS(db)
    await expect(comoUsuario(USUARIO_TESTE, () => db.query(
      "select registrar_historico($1, 'criada', '{}'::jsonb)", [os.id])))
      .rejects.toThrow(/permission denied/)
  })
})

// A limpeza manual dos registros de teste, no SQL Editor, é um delete direto.
describe('limpeza manual', () => {
  it('apagar uma OS com itens e histórico funciona e leva o histórico junto', async () => {
    const os = await osDoAtendente()
    await adicionarItem(db, os.id, 1, 'Alternador', 48000)
    await comoUsuario(ATENDENTE, () => db.query(
      "update ordens_servico set cliente_nome = 'Outro' where id = $1", [os.id]))
    expect((await eventos(os.id)).length).toBeGreaterThan(2)

    await db.query('delete from ordens_servico where id = $1', [os.id])

    const { rows: o } = await db.query('select 1 from ordens_servico where id = $1', [os.id])
    const { rows: h } = await db.query('select 1 from os_historico where os_id = $1', [os.id])
    const { rows: i } = await db.query('select 1 from os_itens where os_id = $1', [os.id])
    expect([o.length, h.length, i.length]).toEqual([0, 0, 0])
  })
})
```

- [ ] **Step 2: Rodar e ver vermelho**

Run: `npx vitest run supabase/historico.test.js`
Expected: FAIL — `relation "os_historico" does not exist`.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/0010_historico_de_atividade.sql`:

```sql
-- Historico de atividade por OS: quem criou, quem mudou o que e quando.
--
-- Gravado por gatilho, no banco, para nao depender da tela: uma chamada direta
-- a API deixa o mesmo rastro. Tabela so de inclusao.

create table os_historico (
  id           bigint generated always as identity primary key,
  -- cascade: a limpeza manual de OS de teste (delete no SQL Editor) precisa
  -- continuar possivel; quem usa o sistema nao apaga OS.
  os_id        uuid not null references ordens_servico(id) on delete cascade,
  usuario_id   uuid,
  -- Copia congelada: renomear ou apagar a pessoa nao reescreve o passado.
  usuario_nome text not null,
  acao         text not null check (acao in
                 ('criada', 'dados_alterados', 'itens_alterados',
                  'status_alterado', 'link_gerado', 'aceita', 'cancelada')),
  detalhe      jsonb not null default '{}'::jsonb,
  -- Junta as linhas de item de uma mesma operacao em um evento so.
  transacao    bigint not null default txid_current(),
  em           timestamptz not null default now()
);
create index os_historico_os_idx on os_historico (os_id, em, id);
create unique index os_historico_itens_unico
  on os_historico (os_id, transacao) where acao = 'itens_alterados';

alter table os_historico enable row level security;
create policy os_historico_le on os_historico for select to authenticated
  using ((select usuario_ativo()));
revoke insert, update, delete, truncate on os_historico from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Registrar (interna: so os gatilhos chamam, como dono)
-- ---------------------------------------------------------------------------
create or replace function registrar_historico(
  p_os uuid, p_acao text, p_detalhe jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid  uuid;
  v_nome text;
begin
  if p_acao = 'aceita' then
    -- Quem assina e o cliente, mesmo que haja um funcionario logado no mesmo
    -- navegador.
    v_nome := 'Cliente (assinatura)';
  else
    v_uid := auth.uid();
    select nome into v_nome from perfis where user_id = v_uid;
    if v_nome is null then
      v_uid := null;
      v_nome := 'Sistema';
    end if;
  end if;

  insert into os_historico (os_id, usuario_id, usuario_nome, acao, detalhe)
  values (p_os, v_uid, v_nome, p_acao, coalesce(p_detalhe, '{}'::jsonb))
  on conflict (os_id, transacao) where acao = 'itens_alterados' do nothing;
end $$;

revoke execute on function registrar_historico(uuid, text, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Gatilho da OS
-- ---------------------------------------------------------------------------
create or replace function historico_da_os() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_dados jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    perform registrar_historico(new.id, 'criada',
      jsonb_build_object('status', new.status, 'numero', new.numero));
    return null;
  end if;

  -- O total muda por causa dos itens: completa o evento de itens da mesma
  -- transacao (aberto pelo gatilho de os_itens) com o total final.
  if new.total_centavos is distinct from old.total_centavos then
    update os_historico
       set detalhe = detalhe || jsonb_build_object('total_para', new.total_centavos)
     where os_id = new.id and acao = 'itens_alterados' and transacao = txid_current();
  end if;

  if old.aceite_em is null and new.aceite_em is not null then
    perform registrar_historico(new.id, 'aceita', jsonb_build_object(
      'total_centavos', new.aceite_total_centavos,
      'status_de', old.status, 'status_para', new.status));
  elsif new.status is distinct from old.status then
    if new.status = 'cancelada' then
      perform registrar_historico(new.id, 'cancelada',
        jsonb_build_object('de', old.status));
    else
      perform registrar_historico(new.id, 'status_alterado',
        jsonb_build_object('de', old.status, 'para', new.status));
    end if;
  end if;

  if new.assinatura_codigo is not null
     and new.assinatura_codigo is distinct from old.assinatura_codigo then
    perform registrar_historico(new.id, 'link_gerado',
      jsonb_build_object('expira_em', new.assinatura_expira_em));
  end if;

  if new.cliente_nome is distinct from old.cliente_nome then
    v_dados := v_dados || jsonb_build_object('cliente_nome',
      jsonb_build_object('de', old.cliente_nome, 'para', new.cliente_nome));
  end if;
  if new.cliente_telefone is distinct from old.cliente_telefone then
    v_dados := v_dados || jsonb_build_object('cliente_telefone',
      jsonb_build_object('de', old.cliente_telefone, 'para', new.cliente_telefone));
  end if;
  if new.veiculo_descricao is distinct from old.veiculo_descricao then
    v_dados := v_dados || jsonb_build_object('veiculo_descricao',
      jsonb_build_object('de', old.veiculo_descricao, 'para', new.veiculo_descricao));
  end if;
  if new.veiculo_placa is distinct from old.veiculo_placa then
    v_dados := v_dados || jsonb_build_object('veiculo_placa',
      jsonb_build_object('de', old.veiculo_placa, 'para', new.veiculo_placa));
  end if;
  if new.data_os is distinct from old.data_os then
    v_dados := v_dados || jsonb_build_object('data_os',
      jsonb_build_object('de', old.data_os, 'para', new.data_os));
  end if;
  if new.observacoes is distinct from old.observacoes then
    v_dados := v_dados || jsonb_build_object('observacoes',
      jsonb_build_object('de', old.observacoes, 'para', new.observacoes));
  end if;
  if v_dados <> '{}'::jsonb then
    perform registrar_historico(new.id, 'dados_alterados', v_dados);
  end if;

  return null;
end $$;

create trigger ordens_historico
after insert or update on ordens_servico
for each row execute function historico_da_os();

-- ---------------------------------------------------------------------------
-- Gatilho dos itens
--
-- BEFORE, para ler o total ANTES de a linha mudar e de o recalculo rodar. O
-- nome sorteia antes de os_itens_trava_assinada: se a trava recusar, a
-- instrucao inteira desfaz, inclusive este registro.
-- ---------------------------------------------------------------------------
create or replace function historico_dos_itens() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_os    uuid := coalesce(new.os_id, old.os_id);
  v_total int;
begin
  select total_centavos into v_total from ordens_servico where id = v_os;
  -- OS ja removida (apagada no SQL Editor, itens saindo em cascata): nada a
  -- registrar, e gravar aqui violaria a chave estrangeira do historico.
  if found then
    perform registrar_historico(v_os, 'itens_alterados',
      jsonb_build_object('total_de', v_total, 'total_para', v_total));
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger os_itens_historico
before insert or update or delete on os_itens
for each row execute function historico_dos_itens();
```

- [ ] **Step 4: Rodar e ver verde**

Run: `npx vitest run supabase/historico.test.js`
Expected: todos passam.

Run: `npm test`
Expected: suíte inteira verde.

- [ ] **Step 5: Teste de mutação**

Em `historico_dos_itens`, troque temporariamente `if found then` por `if true then` e rode `npx vitest run supabase/historico.test.js`.
Expected: **FAIL** em "apagar uma OS com itens e histórico funciona..." (violação de chave estrangeira). Reverta. Em `registrar_historico`, remova a cláusula `on conflict ... do nothing`: **FAIL** em "uma operação com vários itens vira UM evento". Reverta e confirme verde.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0010_historico_de_atividade.sql supabase/historico.test.js
git commit -m "Registra por gatilho quem fez o que em cada OS"
```

---

### Task 5: Camada de dados, erros e demonstração

**Files:**
- Create: `src/usuarios/erros.js`, `src/usuarios/erros.test.js`, `src/data/usuarios.js`, `src/data/historico.js`, `src/demo/usuarios.test.js`

**Interfaces:**
- Consumes: RPCs e tabelas das Tasks 2–4
- Produces:
  - `src/usuarios/erros.js`: `codigoDoErro(mensagem) -> string`, `mensagemDoErro(mensagem) -> string` (português)
  - `src/data/usuarios.js`:
    - `buscarPerfil(userId) -> Promise<{user_id, usuario, nome, papel, ativo} | null>`
    - `listarUsuarios() -> Promise<Array<{user_id, usuario, nome, papel, ativo, criado_em}>>`
    - `criarUsuario({usuario, nome, senha, papel}) -> Promise<{user_id, usuario}>`
    - `alterarUsuario({userId, nome, papel, ativo}) -> Promise<void>`
    - `redefinirSenha({userId, senha}) -> Promise<void>`
    - `listarAtividadeDeUsuarios({limite = 30}) -> Promise<Array<{id, ator_nome, alvo_usuario, acao, detalhe, em}>>`
    - todos lançam `Error` com `.codigo` e `message` em português
  - `src/data/historico.js`: `listarAtividadeDaOs(osId) -> Promise<Array<{id, acao, detalhe, usuario_nome, em}>>` (mais recente primeiro)

- [ ] **Step 1: Teste dos erros (vermelho)**

`src/usuarios/erros.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { codigoDoErro, mensagemDoErro } from './erros.js'

describe('erros da gestão de usuários', () => {
  it('reconhece o código dentro da mensagem do banco', () => {
    expect(codigoDoErro('acesso_negado')).toBe('acesso_negado')
    expect(codigoDoErro('ERROR: usuario_em_uso')).toBe('usuario_em_uso')
    expect(codigoDoErro('proprio_usuario')).toBe('proprio_usuario')
  })

  it('devolve vazio para o que não conhece', () => {
    expect(codigoDoErro('connection refused')).toBe('')
    expect(codigoDoErro(undefined)).toBe('')
  })

  it('traduz cada código para uma frase que a oficina entende', () => {
    expect(mensagemDoErro('usuario_em_uso')).toMatch(/já existe/i)
    expect(mensagemDoErro('senha_invalida')).toMatch(/8/)
    expect(mensagemDoErro('proprio_usuario')).toMatch(/a si mesmo|próprio/i)
    expect(mensagemDoErro('ultimo_admin')).toMatch(/administrador/i)
    expect(mensagemDoErro('acesso_negado')).toMatch(/permissão/i)
  })

  it('mensagem desconhecida cai num texto geral, sem vazar termo técnico', () => {
    const m = mensagemDoErro('relation "perfis" does not exist')
    expect(m).toMatch(/tente/i)
    expect(m).not.toMatch(/relation/)
  })
})
```

Run: `npx vitest run src/usuarios/erros.test.js` — Expected: FAIL (módulo não existe).

- [ ] **Step 2: Implementar `erros.js`**

`src/usuarios/erros.js`:

```js
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
```

Run: `npx vitest run src/usuarios/erros.test.js` — Expected: PASS.

- [ ] **Step 3: Camada de dados**

(A demonstração já entende `auth.uid()` desde a Tarefa 2, Step 5.)

`src/data/usuarios.js`:

```js
import { supabase } from './supabase.js'
import { codigoDoErro, mensagemDoErro } from '../usuarios/erros.js'

function erroDoBanco(error) {
  const e = new Error(mensagemDoErro(error?.message))
  e.codigo = codigoDoErro(error?.message) || 'desconhecido'
  e.detalhe = error?.message
  return e
}

// O bloqueado ainda lê o próprio perfil (a policy deixa), e é por ele que a
// tela descobre que foi bloqueado. `null` = não existe perfil: sem acesso.
export async function buscarPerfil(userId) {
  const { data, error } = await supabase
    .from('perfis')
    .select('user_id, usuario, nome, papel, ativo')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw erroDoBanco(error)
  return data
}

export async function listarUsuarios() {
  const { data, error } = await supabase.rpc('listar_usuarios')
  if (error) throw erroDoBanco(error)
  return data ?? []
}

export async function criarUsuario({ usuario, nome, senha, papel }) {
  const { data, error } = await supabase.rpc('criar_usuario', {
    p_usuario: usuario, p_nome: nome, p_senha: senha, p_papel: papel,
  })
  if (error) throw erroDoBanco(error)
  return data
}

export async function alterarUsuario({ userId, nome, papel, ativo }) {
  const { error } = await supabase.rpc('alterar_usuario', {
    p_user_id: userId, p_nome: nome, p_papel: papel, p_ativo: ativo,
  })
  if (error) throw erroDoBanco(error)
}

export async function redefinirSenha({ userId, senha }) {
  const { error } = await supabase.rpc('redefinir_senha', {
    p_user_id: userId, p_senha: senha,
  })
  if (error) throw erroDoBanco(error)
}

export async function listarAtividadeDeUsuarios({ limite = 30 } = {}) {
  const { data, error } = await supabase
    .from('usuarios_historico')
    .select('id, ator_nome, alvo_usuario, acao, detalhe, em')
    .order('em', { ascending: false })
    .limit(limite)
  if (error) throw erroDoBanco(error)
  return data ?? []
}
```

`src/data/historico.js`:

```js
import { supabase } from './supabase.js'

export async function listarAtividadeDaOs(osId) {
  const { data, error } = await supabase
    .from('os_historico')
    .select('id, acao, detalhe, usuario_nome, em')
    .eq('os_id', osId)
    .order('em', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw new Error('Não foi possível carregar a atividade desta OS.')
  return data ?? []
}
```

- [ ] **Step 4: Teste de fluxo na demonstração (vermelho → verde)**

`src/demo/usuarios.test.js`:

```js
import { describe, it, expect, beforeAll, vi } from 'vitest'

// Percorre a gestão de usuários e a atividade da OS pelas MESMAS funções que
// as telas chamam, sobre o Postgres em WebAssembly com as migrations reais.
vi.stubEnv('VITE_MODO_DEMO', '1')

let supabase, usuarios, historico, ordens, hojeISO

beforeAll(async () => {
  supabase = (await import('../data/supabase.js')).supabase
  usuarios = await import('../data/usuarios.js')
  historico = await import('../data/historico.js')
  ordens = await import('../data/ordens.js')
  hojeISO = (await import('../lib/datas.js')).hojeISO
})

describe('sem sessão', () => {
  it('a gestão de usuários recusa', async () => {
    await expect(usuarios.listarUsuarios()).rejects.toMatchObject({ codigo: 'acesso_negado' })
  })
})

describe('com o administrador da demonstração', () => {
  beforeAll(async () => {
    await supabase.auth.signInWithPassword({ email: 'demo', password: 'x' })
  })

  it('lê o próprio perfil', async () => {
    const { data } = await supabase.auth.getUser()
    const perfil = await usuarios.buscarPerfil(data.user.id)
    expect(perfil).toMatchObject({ papel: 'admin', ativo: true })
  })

  it('cria, lista, bloqueia e redefine a senha', async () => {
    const criado = await usuarios.criarUsuario({
      usuario: 'maria', nome: 'Maria', senha: 'senha1234', papel: 'atendente',
    })
    expect(criado.usuario).toBe('maria')

    const lista = await usuarios.listarUsuarios()
    expect(lista.map((u) => u.usuario)).toContain('maria')

    await usuarios.alterarUsuario({
      userId: criado.user_id, nome: 'Maria', papel: 'atendente', ativo: false,
    })
    const depois = await usuarios.listarUsuarios()
    expect(depois.find((u) => u.usuario === 'maria').ativo).toBe(false)

    await usuarios.redefinirSenha({ userId: criado.user_id, senha: 'outrasenha1' })

    const atividade = await usuarios.listarAtividadeDeUsuarios()
    expect(atividade.map((a) => a.acao)).toEqual(
      expect.arrayContaining(['criado', 'bloqueado', 'senha_redefinida']))
  })

  it('traduz a recusa do banco em .codigo e mensagem em português', async () => {
    await expect(usuarios.criarUsuario({
      usuario: 'maria', nome: 'Outra', senha: 'senha1234', papel: 'atendente',
    })).rejects.toMatchObject({ codigo: 'usuario_em_uso', message: expect.stringMatching(/já existe/i) })
  })

  it('a OS criada mostra quem a criou na atividade', async () => {
    const os = await ordens.criarOrdem({
      dados: {
        veiculo_placa: 'ABC1D23', data_os: hojeISO(), cliente_nome: 'Cliente Atividade',
        cliente_telefone: '', veiculo_descricao: 'Carro',
      },
      itens: [{ quantidade: '1', descricao: 'Lâmpada', valor_unitario_centavos: 1800 }],
    })
    const eventos = await historico.listarAtividadeDaOs(os.id)
    const acoes = eventos.map((e) => e.acao)
    expect(acoes).toContain('criada')
    expect(acoes).toContain('itens_alterados')
    expect(eventos.find((e) => e.acao === 'criada').usuario_nome).toBe('Demonstração')
  })
})
```

Run: `npx vitest run src/demo/usuarios.test.js`
Expected: PASS. Se falhar por coluna ou tabela que a demonstração não mapeia, ajuste `src/demo/cliente.js` (o tradutor falha alto de propósito).

Run: `npm test` e `npm run lint`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add src/usuarios src/data/usuarios.js src/data/historico.js src/demo/usuarios.test.js
git commit -m "Adiciona camada de dados de usuarios e atividade"
```

---

### Task 6: Perfil na sessão, menu por nível, Sair e rotas protegidas

**Files:**
- Create: `src/auth/perfil.js`, `src/auth/perfil.test.js`, `src/auth/SomenteAdmin.jsx`, `src/ui/AppShell.test.jsx`
- Modify: `src/auth/AuthProvider.jsx`, `src/auth/AuthGate.jsx`, `src/auth/LoginScreen.jsx`, `src/ui/AppShell.jsx`, `src/App.jsx`, `src/Raiz.test.jsx`

**Interfaces:**
- Consumes: `buscarPerfil(userId)` (Task 5)
- Produces:
  - `src/auth/perfil.js`: `PAPEL = { ADMIN: 'admin', ATENDENTE: 'atendente' }`, `rotuloPapel(papel) -> string`, `ehAdmin(perfil) -> boolean`, `abasDoMenu(perfil) -> Array<{ id, para, rotulo, exata? }>` com `id ∈ inicio | historico | usuarios | ajustes`
  - `useAuth()` passa a devolver `{ sessao, usuario, perfil, carregando, aviso, erroPerfil, recarregarPerfil, entrar, sair }`; `perfil` é `{user_id, usuario, nome, papel, ativo}` ou `null`
  - `<SomenteAdmin>` redireciona não-administrador para `/`

- [ ] **Step 1: Testes das regras puras (vermelhos)**

`src/auth/perfil.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { ehAdmin, abasDoMenu, rotuloPapel } from './perfil.js'

const admin = { papel: 'admin', ativo: true, nome: 'Dono' }
const atendente = { papel: 'atendente', ativo: true, nome: 'Maria' }

describe('perfil', () => {
  it('só administrador ativo é administrador', () => {
    expect(ehAdmin(admin)).toBe(true)
    expect(ehAdmin({ ...admin, ativo: false })).toBe(false)
    expect(ehAdmin(atendente)).toBe(false)
    expect(ehAdmin(null)).toBe(false)
    expect(ehAdmin(undefined)).toBe(false)
  })

  it('o administrador vê Usuários e Ajustes; o atendente, não', () => {
    expect(abasDoMenu(admin).map((a) => a.id))
      .toEqual(['inicio', 'historico', 'usuarios', 'ajustes'])
    expect(abasDoMenu(atendente).map((a) => a.id)).toEqual(['inicio', 'historico'])
  })

  it('sem perfil, o menu é o mínimo', () => {
    expect(abasDoMenu(null).map((a) => a.id)).toEqual(['inicio', 'historico'])
  })

  it('cada aba aponta para a rota certa', () => {
    const rotas = Object.fromEntries(abasDoMenu(admin).map((a) => [a.id, a.para]))
    expect(rotas).toEqual({
      inicio: '/', historico: '/os', usuarios: '/usuarios', ajustes: '/configuracoes',
    })
  })

  it('rotula os níveis em português', () => {
    expect(rotuloPapel('admin')).toBe('Administrador')
    expect(rotuloPapel('atendente')).toBe('Atendente')
    expect(rotuloPapel('x')).toBe('')
  })
})
```

Run: `npx vitest run src/auth/perfil.test.js` — Expected: FAIL (módulo não existe).

- [ ] **Step 2: Implementar `perfil.js`**

`src/auth/perfil.js`:

```js
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
```

Run: `npx vitest run src/auth/perfil.test.js` — Expected: PASS.

- [ ] **Step 3: `AuthProvider` carrega o perfil e bloqueia**

Substitua `src/auth/AuthProvider.jsx` por:

```jsx
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../data/supabase.js'
import { buscarPerfil } from '../data/usuarios.js'
import { AuthCtx } from './contexto.js'
import { usuarioParaEmail } from './usuario.js'

const AVISO_BLOQUEADO = 'Acesso bloqueado. Fale com o administrador.'

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(null)
  const [carregandoSessao, setCarregandoSessao] = useState(true)
  // { id, perfil, erro }: o perfil lido para aquele usuário. Comparar o id
  // evita mostrar o perfil de uma sessão anterior.
  const [lido, setLido] = useState(null)
  const [revalidacao, setRevalidacao] = useState(0)
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session)
      setCarregandoSessao(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nova) => {
      setSessao(nova)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const idDoUsuario = sessao?.user?.id ?? null

  // Lê o perfil de quem entrou, e de novo quando a aba volta ao foco: é assim
  // que um bloqueio feito enquanto o app estava aberto chega à tela.
  useEffect(() => {
    if (!idDoUsuario) return undefined
    let cancelado = false
    buscarPerfil(idDoUsuario)
      .then((perfil) => { if (!cancelado) setLido({ id: idDoUsuario, perfil, erro: false }) })
      .catch(() => {
        if (cancelado) return
        // Falha de rede não é bloqueio: mantém o que já se sabia.
        setLido((anterior) => anterior?.id === idDoUsuario
          ? { ...anterior, erro: true }
          : { id: idDoUsuario, perfil: undefined, erro: true })
      })
    return () => { cancelado = true }
  }, [idDoUsuario, revalidacao])

  useEffect(() => {
    const aoVoltar = () => setRevalidacao((n) => n + 1)
    window.addEventListener('focus', aoVoltar)
    return () => window.removeEventListener('focus', aoVoltar)
  }, [])

  const doUsuario = sessao && lido?.id === idDoUsuario ? lido : null
  const perfilLido = doUsuario ? doUsuario.perfil : undefined // undefined: ainda lendo
  const perfil = perfilLido && perfilLido.ativo ? perfilLido : null
  const semAcesso = perfilLido !== undefined && !perfil // lido, e não pode entrar

  // Sem perfil ou bloqueado: encerra a sessão e deixa um aviso para a tela de login.
  useEffect(() => {
    if (!sessao || !semAcesso) return
    supabase.auth.signOut().then(() => setAviso(AVISO_BLOQUEADO))
  }, [sessao, semAcesso])

  const recarregarPerfil = useCallback(() => setRevalidacao((n) => n + 1), [])

  async function entrar(usuario, senha) {
    setAviso('')
    const email = usuarioParaEmail(usuario)
    if (!email) throw new Error('Informe o usuário, sem espaço nem acento.')
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    })
    if (error) throw new Error('Usuário ou senha incorretos.')
  }

  async function sair() {
    await supabase.auth.signOut()
  }

  const carregando = carregandoSessao || (Boolean(sessao) && perfilLido === undefined && !doUsuario?.erro)

  const valor = {
    sessao,
    usuario: sessao?.user ?? null,
    perfil,
    carregando,
    aviso,
    erroPerfil: Boolean(sessao) && perfilLido === undefined && Boolean(doUsuario?.erro),
    recarregarPerfil,
    entrar,
    sair,
  }
  return <AuthCtx.Provider value={valor}>{children}</AuthCtx.Provider>
}
```

- [ ] **Step 4: `AuthGate`, `LoginScreen` e `SomenteAdmin`**

`src/auth/AuthGate.jsx`:

```jsx
import { useAuth } from './contexto.js'
import LoginScreen from './LoginScreen.jsx'

export default function AuthGate({ children }) {
  const { sessao, perfil, carregando, erroPerfil, recarregarPerfil } = useAuth()
  if (carregando) {
    return (
      <div className="grid min-h-dvh place-items-center text-mute">Carregando…</div>
    )
  }
  if (erroPerfil) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <p className="font-bold">Não foi possível verificar o seu acesso.</p>
          <p className="mt-1 text-sm text-mute">Confira a conexão e tente de novo.</p>
          <button
            type="button"
            onClick={recarregarPerfil}
            className="mt-4 h-12 rounded-xl bg-red px-6 font-bold text-white"
          >
            Tentar de novo
          </button>
        </div>
      </div>
    )
  }
  if (!sessao) return <LoginScreen />
  // Sessão aberta, mas sem perfil ativo: a sessão está sendo encerrada.
  if (!perfil) {
    return (
      <div className="grid min-h-dvh place-items-center text-mute">Carregando…</div>
    )
  }
  return children
}
```

Em `src/auth/LoginScreen.jsx`: troque `const { entrar } = useAuth()` por `const { entrar, aviso } = useAuth()` e substitua o bloco `{erro && ( ... )}` por:

```jsx
        {(erro || aviso) && (
          <p role="alert" className="rounded-lg bg-red/20 px-3 py-2 text-sm text-[#FFC9C2]">
            {erro || aviso}
          </p>
        )}
```

`src/auth/SomenteAdmin.jsx`:

```jsx
import { Navigate } from 'react-router-dom'
import { useAuth } from './contexto.js'
import { ehAdmin } from './perfil.js'

// Esconde a rota de quem não é administrador. É cortesia: o banco é que barra.
export default function SomenteAdmin({ children }) {
  const { perfil } = useAuth()
  if (!ehAdmin(perfil)) return <Navigate to="/" replace />
  return children
}
```

- [ ] **Step 5: Teste do menu (vermelho)**

`src/ui/AppShell.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthCtx } from '../auth/contexto.js'
import AppShell from './AppShell.jsx'

function casca(perfil) {
  return renderToString(
    <AuthCtx.Provider value={{ perfil, sair: () => {} }}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<p>conteúdo</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthCtx.Provider>,
  )
}

describe('AppShell', () => {
  it('administrador vê Usuários e Ajustes', () => {
    const html = casca({ nome: 'Dono', papel: 'admin', ativo: true })
    expect(html).toContain('Usuários')
    expect(html).toContain('Ajustes')
  })

  it('atendente não vê Usuários nem Ajustes', () => {
    const html = casca({ nome: 'Maria', papel: 'atendente', ativo: true })
    expect(html).not.toContain('Usuários')
    expect(html).not.toContain('Ajustes')
    expect(html).toContain('Início')
    expect(html).toContain('Histórico')
  })

  it('mostra quem está logado, o nível e o Sair, para todos', () => {
    const html = casca({ nome: 'Maria', papel: 'atendente', ativo: true })
    expect(html).toContain('Maria')
    expect(html).toContain('Atendente')
    expect(html).toContain('Sair')
  })
})
```

Run: `npx vitest run src/ui/AppShell.test.jsx` — Expected: FAIL (a casca não usa `useAuth` nem mostra o nome).

- [ ] **Step 6: `AppShell` com menu por nível, nome e Sair**

Em `src/ui/AppShell.jsx`:

1. Troque a importação dos ícones e o topo do arquivo por:

```jsx
import { NavLink, Outlet } from 'react-router-dom'
import { House, FileText, Settings, Users, LogOut } from 'lucide-react'
import { useAuth } from '../auth/contexto.js'
import { abasDoMenu, rotuloPapel } from '../auth/perfil.js'

const ICONES = {
  inicio: House,
  historico: FileText,
  usuarios: Users,
  ajustes: Settings,
}
```

   (remova a constante `ABAS` antiga; mantenha `classeAba` e `classeLateral`).

2. Dentro de `AppShell()`, antes do `return`:

```jsx
  const { perfil, sair } = useAuth()
  const abas = abasDoMenu(perfil)
```

3. Nos dois `ABAS.map(({ para, rotulo, Icone, exata }) => (` troque por `abas.map(({ id, para, rotulo, exata }) => {` com o corpo:

```jsx
            const Icone = ICONES[id]
            return (
              <NavLink key={para} to={para} end={exata} className={classeLateral}>
                <Icone size={18} aria-hidden="true" />
                {rotulo}
              </NavLink>
            )
```

   (na barra de baixo do celular, o mesmo com `classeAba` e `size={20}`).

4. No fim do `<aside>` (depois do `</nav>` da lateral), acrescente:

```jsx
        <div className="mt-6 border-t border-white/10 px-1 pt-3">
          <p className="truncate text-sm font-bold text-white">{perfil?.nome}</p>
          <p className="text-[10px] tracking-[0.1em] text-[#9A9490] uppercase">
            {rotuloPapel(perfil?.papel)}
          </p>
          <button
            type="button"
            onClick={sair}
            className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#B5AFAB]"
          >
            <LogOut size={16} aria-hidden="true" />
            Sair
          </button>
        </div>
```

5. No `<header>` do celular, depois do bloco do logo e do nome da oficina, acrescente (empurrado para a direita):

```jsx
          <div className="ml-auto flex items-center gap-2">
            <div className="text-right leading-tight">
              <span className="block max-w-28 truncate text-[12px] font-bold text-white">
                {perfil?.nome}
              </span>
              <span className="text-[9.5px] tracking-[0.1em] text-[#9A9490] uppercase">
                {rotuloPapel(perfil?.papel)}
              </span>
            </div>
            <button
              type="button"
              onClick={sair}
              aria-label="Sair"
              className="grid h-11 w-11 place-items-center rounded-lg text-[#B5AFAB]"
            >
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>
```

   O texto "Sair" tem de aparecer no HTML renderizado: o `aria-label="Sair"` do celular já o contém.

- [ ] **Step 7: Rotas protegidas e teste de roteamento**

`src/App.jsx`:

```jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './ui/AppShell.jsx'
import Inicio from './Inicio.jsx'
import Configuracoes from './config/Configuracoes.jsx'
import ListaOS from './os/ListaOS.jsx'
import NovaOS from './os/NovaOS.jsx'
import DetalheOS from './os/DetalheOS.jsx'
import SomenteAdmin from './auth/SomenteAdmin.jsx'
import PaginaUsuarios from './usuarios/PaginaUsuarios.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Inicio />} />
        <Route path="os" element={<ListaOS />} />
        <Route path="os/nova" element={<NovaOS />} />
        <Route path="os/:id" element={<DetalheOS />} />
        <Route
          path="usuarios"
          element={<SomenteAdmin><PaginaUsuarios /></SomenteAdmin>}
        />
        <Route
          path="configuracoes"
          element={<SomenteAdmin><Configuracoes /></SomenteAdmin>}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
```

> `PaginaUsuarios` é criada na Tarefa 7. Para esta tarefa fechar verde, crie agora um esqueleto `src/usuarios/PaginaUsuarios.jsx` com `export default function PaginaUsuarios() { return <h1>Usuários</h1> }`; a Tarefa 7 o substitui.

`src/Raiz.test.jsx`: as rotas internas agora leem o perfil. Acrescente, junto dos `vi.mock` existentes:

```jsx
const estado = vi.hoisted(() => ({
  perfil: { user_id: 'u1', usuario: 'dono', nome: 'Dono', papel: 'admin', ativo: true },
}))

vi.mock('./auth/contexto.js', () => ({
  AuthCtx: {},
  useAuth: () => ({ perfil: estado.perfil, sair: () => {} }),
}))
```

e estes testes, dentro do `describe('Raiz — roteamento', ...)`:

```jsx
  it('o administrador abre a aba Usuários em /usuarios', () => {
    expect(pagina('/usuarios')).toContain('Usuários')
  })

  it('o atendente que digita /usuarios volta para o Início', () => {
    estado.perfil = { ...estado.perfil, papel: 'atendente' }
    const html = pagina('/usuarios')
    expect(html).toContain('Nova OS')
    estado.perfil = { ...estado.perfil, papel: 'admin' }
  })

  it('o atendente que digita /configuracoes volta para o Início', () => {
    estado.perfil = { ...estado.perfil, papel: 'atendente' }
    const html = pagina('/configuracoes')
    expect(html).toContain('Nova OS')
    expect(html).not.toContain('Razão social')
    estado.perfil = { ...estado.perfil, papel: 'admin' }
  })
```

- [ ] **Step 8: Rodar**

Run: `npx vitest run src/auth src/ui src/Raiz.test.jsx`
Expected: PASS.

Run: `npm test` e `npm run lint`
Expected: tudo verde.

- [ ] **Step 9: Commit**

```bash
git add src/auth src/ui src/App.jsx src/Raiz.test.jsx src/usuarios/PaginaUsuarios.jsx
git commit -m "Carrega o perfil na sessao, filtra o menu por nivel e protege as rotas"
```

---

### Task 7: Aba Usuários

**Files:**
- Create: `src/usuarios/regras.js`, `src/usuarios/regras.test.js`, `src/usuarios/ListaUsuarios.jsx`, `src/usuarios/FormUsuario.jsx`, `src/usuarios/ListaUsuarios.test.jsx`
- Modify: `src/usuarios/PaginaUsuarios.jsx` (substitui o esqueleto)

**Interfaces:**
- Consumes: `listarUsuarios`, `criarUsuario`, `alterarUsuario`, `redefinirSenha`, `listarAtividadeDeUsuarios` (Task 5); `useAuth().perfil`; `rotuloPapel`
- Produces:
  - `src/usuarios/regras.js`: `PAPEIS`, `normalizarUsuario(texto)`, `validarNovoUsuario({usuario, nome, senha, papel}) -> {usuario?, nome?, senha?, papel?}`, `validarSenha(senha) -> string`, `acoesDoUsuario({alvo, euId}) -> {ehVoce, podeBloquear, podeReativar, podeMudarPapel}`, `textoDaAtividade(evento) -> string`
  - `<ListaUsuarios usuarios euId aoEditar aoBloquear aoReativar aoRedefinir />` (apresentacional)
  - `<FormUsuario modo="novo"|"editar"|"senha" alvo? aoSalvar aoCancelar enviando erro />`

- [ ] **Step 1: Testes das regras (vermelhos)**

`src/usuarios/regras.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  normalizarUsuario, validarNovoUsuario, validarSenha, acoesDoUsuario, textoDaAtividade,
} from './regras.js'

describe('normalizarUsuario', () => {
  it('tira espaço das pontas e passa para minúsculo', () => {
    expect(normalizarUsuario('  MARIA ')).toBe('maria')
    expect(normalizarUsuario(null)).toBe('')
  })
})

describe('validarNovoUsuario', () => {
  const bom = { usuario: 'maria', nome: 'Maria', senha: 'senha1234', papel: 'atendente' }

  it('aceita o caso comum', () => {
    expect(validarNovoUsuario(bom)).toEqual({})
  })

  it('espelha as regras do banco', () => {
    expect(validarNovoUsuario({ ...bom, usuario: 'ab' }).usuario).toBeTruthy()
    expect(validarNovoUsuario({ ...bom, usuario: 'ma ria' }).usuario).toBeTruthy()
    expect(validarNovoUsuario({ ...bom, usuario: 'josé' }).usuario).toBeTruthy()
    expect(validarNovoUsuario({ ...bom, nome: '  ' }).nome).toBeTruthy()
    expect(validarNovoUsuario({ ...bom, senha: '1234567' }).senha).toBeTruthy()
    expect(validarNovoUsuario({ ...bom, papel: '' }).papel).toBeTruthy()
  })

  it('maiúscula no usuário não é erro: o banco normaliza', () => {
    expect(validarNovoUsuario({ ...bom, usuario: 'MARIA' })).toEqual({})
  })
})

describe('validarSenha', () => {
  it('pede 8 caracteres', () => {
    expect(validarSenha('1234567')).toMatch(/8/)
    expect(validarSenha('12345678')).toBe('')
  })
})

describe('acoesDoUsuario', () => {
  const ativo = { user_id: 'a', ativo: true, papel: 'atendente' }
  const bloqueado = { user_id: 'b', ativo: false, papel: 'atendente' }

  it('em outra pessoa: pode bloquear ou reativar e mudar o nível', () => {
    expect(acoesDoUsuario({ alvo: ativo, euId: 'x' })).toEqual({
      ehVoce: false, podeBloquear: true, podeReativar: false, podeMudarPapel: true,
    })
    expect(acoesDoUsuario({ alvo: bloqueado, euId: 'x' })).toMatchObject({
      podeBloquear: false, podeReativar: true,
    })
  })

  it('em si mesmo: nada de bloquear nem mudar o nível', () => {
    expect(acoesDoUsuario({ alvo: ativo, euId: 'a' })).toEqual({
      ehVoce: true, podeBloquear: false, podeReativar: false, podeMudarPapel: false,
    })
  })
})

describe('textoDaAtividade', () => {
  const base = { ator_nome: 'Dono', alvo_usuario: 'maria' }

  it('descreve cada ação em português', () => {
    expect(textoDaAtividade({ ...base, acao: 'criado', detalhe: { papel: 'atendente' } }))
      .toBe('Dono criou o usuário maria (Atendente)')
    expect(textoDaAtividade({ ...base, acao: 'bloqueado', detalhe: {} }))
      .toBe('Dono bloqueou maria')
    expect(textoDaAtividade({ ...base, acao: 'reativado', detalhe: {} }))
      .toBe('Dono reativou maria')
    expect(textoDaAtividade({ ...base, acao: 'senha_redefinida', detalhe: {} }))
      .toBe('Dono redefiniu a senha de maria')
    expect(textoDaAtividade({ ...base, acao: 'papel_alterado', detalhe: { de: 'atendente', para: 'admin' } }))
      .toBe('Dono mudou o nível de maria para Administrador')
    expect(textoDaAtividade({ ...base, acao: 'nome_alterado', detalhe: { de: 'a', para: 'Maria S.' } }))
      .toBe('Dono mudou o nome de maria para Maria S.')
  })

  it('ação desconhecida não quebra a tela', () => {
    expect(textoDaAtividade({ ...base, acao: 'nova_coisa', detalhe: {} }))
      .toBe('Dono fez uma alteração em maria')
  })
})
```

Run: `npx vitest run src/usuarios/regras.test.js` — Expected: FAIL.

- [ ] **Step 2: Implementar `regras.js`**

`src/usuarios/regras.js`:

```js
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
    default:
      return `${quem} fez uma alteração em ${alvo}`
  }
}
```

Run: `npx vitest run src/usuarios/regras.test.js` — Expected: PASS.

- [ ] **Step 3: Teste da lista (vermelho)**

`src/usuarios/ListaUsuarios.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import ListaUsuarios from './ListaUsuarios.jsx'

const usuarios = [
  { user_id: 'eu', usuario: 'dono', nome: 'Dono da Oficina', papel: 'admin', ativo: true },
  { user_id: 'm', usuario: 'maria', nome: 'Maria Souza', papel: 'atendente', ativo: true },
  { user_id: 'j', usuario: 'joao', nome: 'João Lima', papel: 'atendente', ativo: false },
]

const nada = () => {}
function html(extra = {}) {
  return renderToString(
    <ListaUsuarios usuarios={usuarios} euId="eu" aoEditar={nada} aoBloquear={nada}
      aoReativar={nada} aoRedefinir={nada} {...extra} />)
}

describe('ListaUsuarios', () => {
  it('mostra nome, usuário, nível e situação de cada pessoa', () => {
    const h = html()
    expect(h).toContain('Maria Souza')
    expect(h).toContain('@maria')
    expect(h).toContain('Administrador')
    expect(h).toContain('Atendente')
    expect(h).toContain('Bloqueado')
  })

  it('marca a própria linha com "Você"', () => {
    expect(html()).toContain('Você')
  })

  it('na própria linha não oferece bloquear', () => {
    // Três linhas: o próprio (sem "Bloquear"), Maria (com) e João (com "Reativar").
    const h = html()
    expect(h.match(/Bloquear/g)).toHaveLength(1)
    expect(h.match(/Reativar/g)).toHaveLength(1)
  })

  it('toda linha, inclusive a própria, oferece trocar a senha', () => {
    expect(html().match(/Redefinir senha/g)).toHaveLength(3)
  })

  it('lista vazia mostra um estado vazio, não uma tabela quebrada', () => {
    expect(html({ usuarios: [] })).toContain('Nenhum usuário')
  })
})
```

Run: `npx vitest run src/usuarios/ListaUsuarios.test.jsx` — Expected: FAIL.

- [ ] **Step 4: `ListaUsuarios` e `FormUsuario`**

`src/usuarios/ListaUsuarios.jsx`:

```jsx
import { rotuloPapel } from '../auth/perfil.js'
import { acoesDoUsuario } from './regras.js'
import Botao from '../ui/Botao.jsx'
import EstadoVazio from '../ui/EstadoVazio.jsx'

function Selo({ children, tom }) {
  const cores = {
    admin: 'bg-ink text-white',
    atendente: 'bg-[#EFEDEB] text-mute',
    ativo: 'bg-[#DCFCE7] text-[#15803D]',
    bloqueado: 'bg-[#FEE2E2] text-red',
  }
  return (
    <span
      className={`inline-block rounded-full px-2 py-[3px] text-[9.5px] font-bold tracking-[0.07em] uppercase ${cores[tom]}`}
    >
      {children}
    </span>
  )
}

export default function ListaUsuarios({
  usuarios, euId, aoEditar, aoBloquear, aoReativar, aoRedefinir,
}) {
  if (usuarios.length === 0) {
    return <EstadoVazio titulo="Nenhum usuário" />
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {usuarios.map((u) => {
        const { ehVoce, podeBloquear, podeReativar } = acoesDoUsuario({ alvo: u, euId })
        return (
          <li key={u.user_id} className="rounded-xl border border-linha bg-paper p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-bold">
                  {u.nome}
                  {ehVoce && <span className="ml-1.5 text-xs font-semibold text-mute">Você</span>}
                </p>
                <p className="text-sm text-mute">@{u.usuario}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Selo tom={u.papel}>{rotuloPapel(u.papel)}</Selo>
                <Selo tom={u.ativo ? 'ativo' : 'bloqueado'}>
                  {u.ativo ? 'Ativo' : 'Bloqueado'}
                </Selo>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Botao variante="fantasma" tamanho="pequeno" type="button"
                onClick={() => aoEditar(u)}>
                Editar
              </Botao>
              <Botao variante="fantasma" tamanho="pequeno" type="button"
                onClick={() => aoRedefinir(u)}>
                Redefinir senha
              </Botao>
              {podeBloquear && (
                <Botao variante="perigo" tamanho="pequeno" type="button"
                  className="col-span-2" onClick={() => aoBloquear(u)}>
                  Bloquear
                </Botao>
              )}
              {podeReativar && (
                <Botao variante="primario" tamanho="pequeno" type="button"
                  className="col-span-2" onClick={() => aoReativar(u)}>
                  Reativar
                </Botao>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
```

`src/usuarios/FormUsuario.jsx`:

```jsx
import { useState } from 'react'
import Campo from '../ui/Campo.jsx'
import Botao from '../ui/Botao.jsx'
import { PAPEIS, validarNovoUsuario, validarSenha, normalizarUsuario } from './regras.js'

const TITULOS = {
  novo: 'Novo usuário',
  editar: 'Editar usuário',
  senha: 'Redefinir senha',
}

// Um formulário para as três ações. `aoSalvar` recebe só o que a ação usa.
export default function FormUsuario({ modo, alvo, aoSalvar, aoCancelar, enviando, erro }) {
  const [usuario, setUsuario] = useState('')
  const [nome, setNome] = useState(alvo?.nome ?? '')
  const [papel, setPapel] = useState(alvo?.papel ?? 'atendente')
  const [senha, setSenha] = useState('')
  const [erros, setErros] = useState({})

  function enviar(e) {
    e.preventDefault()
    if (modo === 'novo') {
      const encontrados = validarNovoUsuario({ usuario, nome, senha, papel })
      setErros(encontrados)
      if (Object.keys(encontrados).length > 0) return
      aoSalvar({ usuario: normalizarUsuario(usuario), nome: nome.trim(), senha, papel })
    } else if (modo === 'editar') {
      if (nome.trim() === '') { setErros({ nome: 'Informe o nome.' }); return }
      aoSalvar({ nome: nome.trim(), papel })
    } else {
      const s = validarSenha(senha)
      if (s) { setErros({ senha: s }); return }
      aoSalvar({ senha })
    }
  }

  return (
    <form onSubmit={enviar} className="mb-4 rounded-xl border border-linha bg-paper p-3">
      <h2 className="mb-3 text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
        {TITULOS[modo]}{alvo ? ` · @${alvo.usuario}` : ''}
      </h2>

      {modo === 'novo' && (
        <Campo
          id="novo-usuario" rotulo="Usuário (o que a pessoa digita para entrar)"
          valor={usuario} aoMudar={setUsuario} erro={erros.usuario}
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
          autoComplete="off"
        />
      )}

      {modo !== 'senha' && (
        <Campo id="usuario-nome" rotulo="Nome" valor={nome} aoMudar={setNome}
          erro={erros.nome} autoComplete="off" />
      )}

      {modo !== 'senha' && (
        <div className="mb-3">
          <label htmlFor="usuario-papel"
            className="mb-1.5 block text-[10px] font-bold tracking-[0.12em] text-mute uppercase">
            Nível de acesso
          </label>
          <select id="usuario-papel" value={papel} onChange={(e) => setPapel(e.target.value)}
            className="h-12 w-full rounded-xl border-[1.5px] border-linha bg-paper px-3.5 text-base font-semibold">
            {PAPEIS.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
          </select>
          {erros.papel && <p className="mt-1 text-xs font-semibold text-red">{erros.papel}</p>}
        </div>
      )}

      {modo !== 'editar' && (
        <Campo
          id="usuario-senha" rotulo={modo === 'senha' ? 'Nova senha' : 'Senha'}
          tipo="password" valor={senha} aoMudar={setSenha} erro={erros.senha}
          autoComplete="new-password"
        />
      )}

      {erro && (
        <p role="alert" className="mb-3 rounded-lg bg-red/10 px-3 py-2 text-sm font-semibold text-red">
          {erro}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Botao variante="fantasma" type="button" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </Botao>
        <Botao type="submit" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Salvar'}
        </Botao>
      </div>
    </form>
  )
}
```

Run: `npx vitest run src/usuarios/ListaUsuarios.test.jsx` — Expected: PASS.

- [ ] **Step 5: `PaginaUsuarios` (contêiner)**

Substitua `src/usuarios/PaginaUsuarios.jsx` por:

```jsx
import { useCallback, useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { useAuth } from '../auth/contexto.js'
import {
  listarUsuarios, criarUsuario, alterarUsuario, redefinirSenha, listarAtividadeDeUsuarios,
} from '../data/usuarios.js'
import { formatarDataHora } from '../lib/datas.js'
import ListaUsuarios from './ListaUsuarios.jsx'
import FormUsuario from './FormUsuario.jsx'
import Botao from '../ui/Botao.jsx'
import { textoDaAtividade } from './regras.js'

export default function PaginaUsuarios() {
  const { perfil } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [atividade, setAtividade] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [falha, setFalha] = useState('')
  // null | { tipo: 'novo' } | { tipo: 'editar'|'senha'|'bloquear', alvo }
  const [painel, setPainel] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [erroDoPainel, setErroDoPainel] = useState('')

  const carregar = useCallback(async () => {
    try {
      const [lista, eventos] = await Promise.all([
        listarUsuarios(), listarAtividadeDeUsuarios({ limite: 15 }),
      ])
      setUsuarios(lista)
      setAtividade(eventos)
      setFalha('')
    } catch (e) {
      setFalha(e.message)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  function abrir(novoPainel) {
    setErroDoPainel('')
    setPainel(novoPainel)
  }

  async function executar(acao) {
    setEnviando(true)
    setErroDoPainel('')
    try {
      await acao()
      setPainel(null)
      await carregar()
    } catch (e) {
      setErroDoPainel(e.message)
    } finally {
      setEnviando(false)
    }
  }

  const salvar = (dados) => {
    if (painel.tipo === 'novo') return executar(() => criarUsuario(dados))
    if (painel.tipo === 'editar') {
      return executar(() => alterarUsuario({
        userId: painel.alvo.user_id, nome: dados.nome, papel: dados.papel,
        ativo: painel.alvo.ativo,
      }))
    }
    return executar(() => redefinirSenha({ userId: painel.alvo.user_id, senha: dados.senha }))
  }

  const mudarAtivo = (alvo, ativo) => executar(() => alterarUsuario({
    userId: alvo.user_id, nome: alvo.nome, papel: alvo.papel, ativo,
  }))

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-4 pb-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold">Usuários</h1>
        {!painel && (
          <Botao tamanho="pequeno" className="w-auto" type="button"
            onClick={() => abrir({ tipo: 'novo' })}>
            <UserPlus size={16} aria-hidden="true" />
            Novo usuário
          </Botao>
        )}
      </div>

      {painel && painel.tipo === 'bloquear' && (
        <div className="mb-4 rounded-xl border border-red/40 bg-paper p-3">
          <p className="font-bold">Bloquear {painel.alvo.nome}?</p>
          <p className="mt-1 text-sm text-mute">
            A pessoa perde o acesso na hora, mesmo com o app aberto, e não consegue
            entrar de novo até ser reativada. As OS dela continuam no sistema.
          </p>
          {erroDoPainel && (
            <p role="alert" className="mt-2 text-sm font-semibold text-red">{erroDoPainel}</p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Botao variante="fantasma" type="button" disabled={enviando}
              onClick={() => setPainel(null)}>
              Cancelar
            </Botao>
            <Botao variante="perigo" type="button" disabled={enviando}
              onClick={() => mudarAtivo(painel.alvo, false)}>
              {enviando ? 'Bloqueando…' : 'Bloquear'}
            </Botao>
          </div>
        </div>
      )}

      {painel && painel.tipo !== 'bloquear' && (
        <FormUsuario
          key={`${painel.tipo}-${painel.alvo?.user_id ?? 'novo'}`}
          modo={painel.tipo}
          alvo={painel.alvo}
          aoSalvar={salvar}
          aoCancelar={() => setPainel(null)}
          enviando={enviando}
          erro={erroDoPainel}
        />
      )}

      {falha && (
        <p role="alert" className="mb-3 rounded-lg bg-red/10 px-3 py-2 text-sm font-semibold text-red">
          {falha}
        </p>
      )}

      {carregando ? (
        <p className="text-mute">Carregando…</p>
      ) : (
        <ListaUsuarios
          usuarios={usuarios}
          euId={perfil?.user_id}
          aoEditar={(u) => abrir({ tipo: 'editar', alvo: u })}
          aoRedefinir={(u) => abrir({ tipo: 'senha', alvo: u })}
          aoBloquear={(u) => abrir({ tipo: 'bloquear', alvo: u })}
          aoReativar={(u) => mudarAtivo(u, true)}
        />
      )}

      {atividade.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
            Atividade recente
          </h2>
          <ul className="flex flex-col gap-1.5">
            {atividade.map((ev) => (
              <li key={ev.id} className="rounded-lg border border-linha bg-paper px-3 py-2 text-[13px]">
                <span className="block">{textoDaAtividade(ev)}</span>
                <span className="text-[11px] text-mute">{formatarDataHora(ev.em)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Rodar**

Run: `npm test`, `npm run lint` e `npm run build`
Expected: tudo verde; o build conclui sem aviso novo.

- [ ] **Step 7: Commit**

```bash
git add src/usuarios
git commit -m "Adiciona a aba Usuarios para o administrador"
```

---

### Task 8: Seção "Atividade" no detalhe da OS

**Files:**
- Create: `src/os/textoDoEvento.js`, `src/os/textoDoEvento.test.js`, `src/os/AtividadeDaOs.jsx`, `src/os/AtividadeDaOs.test.jsx`
- Modify: `src/os/DetalheOS.jsx`

**Interfaces:**
- Consumes: `listarAtividadeDaOs(osId)` (Task 5); `formatarBRL` (`src/lib/dinheiro.js`); `rotuloStatus` (`src/lib/status.js`); `formatarDataHora` (`src/lib/datas.js`)
- Produces: `textoDoEvento({acao, usuario_nome, detalhe}) -> string`; `<ListaDeEventos eventos />` (apresentacional); `<AtividadeDaOs osId recarregarEm />`

- [ ] **Step 1: Testes do texto (vermelhos)**

`src/os/textoDoEvento.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { textoDoEvento } from './textoDoEvento.js'
import { formatarBRL } from '../lib/dinheiro.js'

const quem = 'Maria'
const ev = (acao, detalhe = {}, usuario_nome = quem) => ({ acao, usuario_nome, detalhe })

describe('textoDoEvento', () => {
  it('criação', () => {
    expect(textoDoEvento(ev('criada'))).toBe('Maria criou a OS')
  })

  it('itens: mostra o total antes e depois quando muda', () => {
    expect(textoDoEvento(ev('itens_alterados', { total_de: 38000, total_para: 48000 })))
      .toBe(`Maria alterou os itens (${formatarBRL(38000)} → ${formatarBRL(48000)})`)
  })

  it('itens: primeira inclusão não finge que havia valor antes', () => {
    expect(textoDoEvento(ev('itens_alterados', { total_de: 0, total_para: 48000 })))
      .toBe(`Maria incluiu os itens (${formatarBRL(48000)})`)
  })

  it('itens: mesmo total, só a descrição mudou', () => {
    expect(textoDoEvento(ev('itens_alterados', { total_de: 30000, total_para: 30000 })))
      .toBe('Maria alterou os itens')
  })

  it('dados: nomeia o que mudou', () => {
    expect(textoDoEvento(ev('dados_alterados', {
      cliente_nome: { de: 'a', para: 'b' }, veiculo_placa: { de: 'c', para: 'd' },
    }))).toBe('Maria alterou o nome e a placa')
    expect(textoDoEvento(ev('dados_alterados', {
      cliente_telefone: { de: '', para: '1' }, veiculo_descricao: { de: 'a', para: 'b' },
      data_os: { de: 'a', para: 'b' },
    }))).toBe('Maria alterou o telefone, o veículo e a data')
  })

  it('status e cancelamento', () => {
    expect(textoDoEvento(ev('status_alterado', { de: 'orcamento', para: 'aprovada' })))
      .toBe('Maria mudou a situação de Orçamento para Aprovada')
    expect(textoDoEvento(ev('cancelada', { de: 'aprovada' }))).toBe('Maria cancelou a OS')
  })

  it('link e aceite', () => {
    expect(textoDoEvento(ev('link_gerado'))).toBe('Maria gerou o link de assinatura')
    expect(textoDoEvento(ev('aceita', { total_centavos: 48000 }, 'Cliente (assinatura)')))
      .toBe(`Cliente (assinatura) assinou de acordo (${formatarBRL(48000)})`)
  })

  it('ação desconhecida não quebra', () => {
    expect(textoDoEvento(ev('algo_novo'))).toBe('Maria fez uma alteração')
  })

  it('campo desconhecido em dados_alterados não quebra', () => {
    expect(textoDoEvento(ev('dados_alterados', { cor: { de: 1, para: 2 } })))
      .toBe('Maria alterou os dados')
  })
})
```

Run: `npx vitest run src/os/textoDoEvento.test.js` — Expected: FAIL.

- [ ] **Step 2: Implementar `textoDoEvento.js`**

`src/os/textoDoEvento.js`:

```js
import { formatarBRL } from '../lib/dinheiro.js'
import { rotuloStatus } from '../lib/status.js'

const CAMPOS = {
  cliente_nome: 'o nome',
  cliente_telefone: 'o telefone',
  veiculo_descricao: 'o veículo',
  veiculo_placa: 'a placa',
  data_os: 'a data',
  observacoes: 'as observações',
}

function juntar(partes) {
  if (partes.length <= 1) return partes.join('')
  return `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`
}

export function textoDoEvento({ acao, usuario_nome: quem, detalhe = {} }) {
  switch (acao) {
    case 'criada':
      return `${quem} criou a OS`

    case 'dados_alterados': {
      const nomes = Object.keys(detalhe).map((c) => CAMPOS[c]).filter(Boolean)
      return nomes.length > 0
        ? `${quem} alterou ${juntar(nomes)}`
        : `${quem} alterou os dados`
    }

    case 'itens_alterados': {
      const { total_de: de, total_para: para } = detalhe
      if (de === 0 && para > 0) return `${quem} incluiu os itens (${formatarBRL(para)})`
      if (de !== para) {
        return `${quem} alterou os itens (${formatarBRL(de)} → ${formatarBRL(para)})`
      }
      return `${quem} alterou os itens`
    }

    case 'status_alterado':
      return `${quem} mudou a situação de ${rotuloStatus(detalhe.de)} para ${rotuloStatus(detalhe.para)}`

    case 'cancelada':
      return `${quem} cancelou a OS`

    case 'link_gerado':
      return `${quem} gerou o link de assinatura`

    case 'aceita':
      return `${quem} assinou de acordo (${formatarBRL(detalhe.total_centavos)})`

    default:
      return `${quem} fez uma alteração`
  }
}
```

Run: `npx vitest run src/os/textoDoEvento.test.js` — Expected: PASS.

- [ ] **Step 3: Teste e componente da seção**

`src/os/AtividadeDaOs.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { ListaDeEventos } from './AtividadeDaOs.jsx'

const eventos = [
  { id: 2, acao: 'itens_alterados', usuario_nome: 'Maria',
    detalhe: { total_de: 0, total_para: 48000 }, em: '2026-10-14T18:32:00Z' },
  { id: 1, acao: 'criada', usuario_nome: 'Maria', detalhe: {}, em: '2026-10-14T18:30:00Z' },
]

describe('ListaDeEventos', () => {
  it('mostra cada evento com quem fez e quando', () => {
    const h = renderToString(<ListaDeEventos eventos={eventos} />)
    expect(h).toContain('Maria criou a OS')
    expect(h).toContain('Maria incluiu os itens')
    expect(h).toContain('14/10/2026')
  })

  it('sem eventos, avisa em vez de sumir', () => {
    const h = renderToString(<ListaDeEventos eventos={[]} />)
    expect(h).toContain('Nenhuma atividade')
  })
})
```

`src/os/AtividadeDaOs.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { listarAtividadeDaOs } from '../data/historico.js'
import { formatarDataHora } from '../lib/datas.js'
import { textoDoEvento } from './textoDoEvento.js'

export function ListaDeEventos({ eventos }) {
  if (eventos.length === 0) {
    return <p className="text-sm text-mute">Nenhuma atividade registrada.</p>
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {eventos.map((ev) => (
        <li key={ev.id} className="text-[13px]">
          <span className="block">{textoDoEvento(ev)}</span>
          <span className="text-[11px] text-mute">{formatarDataHora(ev.em)}</span>
        </li>
      ))}
    </ul>
  )
}

// `recarregarEm` é qualquer valor que muda quando a OS muda (o carimbo de
// atualização): a lista é lida de novo sem a tela precisar saber como.
export default function AtividadeDaOs({ osId, recarregarEm }) {
  const [eventos, setEventos] = useState([])
  const [falha, setFalha] = useState(false)

  useEffect(() => {
    let cancelado = false
    listarAtividadeDaOs(osId)
      .then((lista) => { if (!cancelado) { setEventos(lista); setFalha(false) } })
      .catch(() => { if (!cancelado) setFalha(true) })
    return () => { cancelado = true }
  }, [osId, recarregarEm])

  return (
    <section className="mt-3 rounded-xl border border-linha bg-paper p-3">
      <h2 className="mb-2 text-[10px] font-bold tracking-[0.14em] text-mute uppercase">
        Atividade
      </h2>
      {falha
        ? <p className="text-sm text-mute">Não foi possível carregar a atividade.</p>
        : <ListaDeEventos eventos={eventos} />}
    </section>
  )
}
```

- [ ] **Step 4: Ligar ao detalhe**

Em `src/os/DetalheOS.jsx`: junto das importações, `import AtividadeDaOs from './AtividadeDaOs.jsx'`. Logo depois do bloco `{os.observacoes && ( ... )}` (e antes do comentário "A informação é útil nos dois casos"), acrescente:

```jsx
        <AtividadeDaOs osId={os.id} recarregarEm={os.atualizado_em} />
```

Confirme que `os.atualizado_em` está em `CAMPOS_LISTA`/no select do detalhe; se não estiver, inclua-o no select usado por `DetalheOS` (a leitura do detalhe em `src/data/ordens.js`).

- [ ] **Step 5: Rodar**

Run: `npm test`, `npm run lint`, `npm run build`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add src/os
git commit -m "Mostra a atividade de cada OS no detalhe"
```

---

### Task 9: Pacotes SQL, documentação e correções do spec

**Files:**
- Create: `supabase/atualizacao-usuarios.sql`
- Modify: `supabase/setup-completo.sql`, `README.md`, `docs/superpowers/specs/2026-10-14-usuarios-e-auditoria-design.md`

**Interfaces:**
- Consumes: migrations 0008–0010
- Produces: arquivos para colar no SQL Editor; spec alinhado com os rulings

- [ ] **Step 1: Gerar o pacote de atualização**

O pacote vai dentro de `begin; ... commit;` para que um erro no meio desfaça tudo (a trava de administrador depende disso).

Run:

```bash
{ printf -- '-- Mizuho OS - usuarios, niveis de acesso e registro de atividade.\n-- Cole no SQL Editor do Supabase e rode UMA vez. Depois disso, publique o app.\n-- Tudo ou nada: se algo falhar, nada e aplicado.\n\nbegin;\n\n'; for f in supabase/migrations/0008_*.sql supabase/migrations/0009_*.sql supabase/migrations/0010_*.sql; do printf -- '-- ====== %s ======\n' "$(basename "$f")"; cat "$f"; printf '\n'; done; printf 'commit;\n'; } > supabase/atualizacao-usuarios.sql
head -8 supabase/atualizacao-usuarios.sql && tail -3 supabase/atualizacao-usuarios.sql
```

Expected: cabeçalho com `begin;` e rodapé `commit;`.

- [ ] **Step 2: Regerar o `setup-completo.sql`**

Run:

```bash
{ printf -- '-- Mizuho OS - banco completo, para colar no SQL Editor do Supabase.\n-- Equivale a aplicar as migrations 0001 a 0010, em ordem. Rode uma vez so.\n\n'; for f in supabase/migrations/*.sql; do printf -- '-- ====== %s ======\n' "$(basename "$f")"; cat "$f"; printf '\n'; done; } > supabase/setup-completo.sql
grep -c "^-- ====== " supabase/setup-completo.sql
```

Expected: `10`.

- [ ] **Step 3: Teste que protege os pacotes de ficarem para trás**

`supabase/pacotes.test.js` (permanente: se alguém criar a migration 0011 e esquecer de regerar os pacotes, ele falha):

```js
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { STUBS_DO_SUPABASE } from '../src/demo/stubsSupabase.js'
import { criarBanco, arquivosDeMigration } from './banco-de-teste.js'

const AQUI = dirname(fileURLToPath(import.meta.url))
const ler = (...partes) => readFileSync(join(AQUI, ...partes), 'utf8')

describe('pacotes para colar no SQL Editor', () => {
  it('setup-completo.sql traz todas as migrations e aplica num projeto novo', async () => {
    const pacote = ler('setup-completo.sql')
    for (const nome of arquivosDeMigration()) {
      expect(pacote).toContain(`-- ====== ${nome} ======`)
      expect(pacote).toContain(ler('migrations', nome).trim())
    }

    const db = await new PGlite()
    await db.exec(STUBS_DO_SUPABASE)
    await db.exec(pacote)
    // O primeiro usuário de um projeto novo precisa conseguir entrar.
    await db.query(
      "insert into auth.users (id, email) values (gen_random_uuid(), 'dono@mizuho.invalid')")
    const { rows } = await db.query('select usuario, papel, ativo from perfis')
    expect(rows).toEqual([{ usuario: 'dono', papel: 'admin', ativo: true }])
  })

  it('atualizacao-usuarios.sql aplica sobre quem já estava na 0007', async () => {
    const pacote = ler('atualizacao-usuarios.sql')
    expect(pacote).toMatch(/^begin;$/m)
    expect(pacote).toMatch(/^commit;$/m)
    for (const nome of arquivosDeMigration().filter((n) => n.slice(0, 4) >= '0008')) {
      expect(pacote).toContain(ler('migrations', nome).trim())
    }

    const db = await criarBanco({ ate: '0007' })
    await db.query(
      "insert into auth.users (id, email) values (gen_random_uuid(), 'mizuho@mizuho.invalid')")
    await db.exec(pacote)
    const { rows } = await db.query('select usuario, papel, ativo from perfis')
    expect(rows).toEqual([{ usuario: 'mizuho', papel: 'admin', ativo: true }])
  })
})
```

Run: `npx vitest run supabase/pacotes.test.js`
Expected: PASS. Se falhar por texto diferente, regere o pacote (Steps 1–2) em vez de editar o teste.

- [ ] **Step 4: README**

Em `README.md`, na seção de instalação/atualização do banco, acrescente: o que é a aba Usuários, os dois níveis, que a atualização é `supabase/atualizacao-usuarios.sql` (colar e rodar uma vez, **antes** do deploy), que usuários criados direto no painel do Supabase não entram até terem perfil, e como apagar um usuário (painel do Supabase).

- [ ] **Step 5: Alinhar o spec com os rulings**

Em `docs/superpowers/specs/2026-10-14-usuarios-e-auditoria-design.md`:

1. **§5.1:** troque "A migration **aborta** se, depois disso, não houver nenhum administrador ativo." por: "Um gatilho em `auth.users` torna o **primeiro** usuário de um projeto novo administrador. A migration **aborta** se existirem usuários e nenhum virar administrador."
2. **§5.3:** acrescente `nome_alterado` à lista de ações.
3. **§6, parágrafo que começa "Qualquer função `security definer`":** reescreva: só `gerar_link_assinatura` (definer) ganha a checagem explícita; `cancelar_os` e `substituir_itens` são `security invoker` e o RLS as cobre; `definir_proximo_numero` exige administrador. Acrescente que a função de entrada adquire o **lock antes** de conferir `usuario_admin()`, e que a regra "último administrador" é guarda defensiva.
4. **§8, "Detalhe da OS":** troque "seção **Histórico**" por "seção **Atividade**", com a nota: "o nome 'Histórico' já é a aba da lista de OS". Em "Navegação", acrescente: "nome do usuário, nível e **Sair** aparecem na casca do app para todos".
5. **§8, "Demonstração":** acrescente "continua com um único usuário simulado".
6. **Cabeçalho:** `**Status:** aprovado para planejamento`.

- [ ] **Step 6: Verificação final do ramo**

Run: `npm test`, `npm run lint`, `npm run build`
Expected: tudo verde. Anote a contagem de testes.

- [ ] **Step 7: Commit**

```bash
git add supabase/atualizacao-usuarios.sql supabase/setup-completo.sql supabase/pacotes.test.js README.md docs/superpowers/specs/2026-10-14-usuarios-e-auditoria-design.md
git commit -m "Empacota o SQL de usuarios, atualiza a documentacao e alinha o spec"
```

---

### Task 10: Verificação contra o projeto real e publicação

> **Portão:** esta tarefa só começa depois de o dono dizer que **aplicou `supabase/atualizacao-usuarios.sql`** no SQL Editor. Antes disso, nada é publicado e nada é executado contra o projeto real.

**Files:**
- Create (fora do repositório, no scratchpad): `verificar-usuarios.mjs` — contém senha, **não** é commitado

- [ ] **Step 1: Confirmar que a atualização foi aplicada**

Com a chave anon e a senha do administrador (passada por variável de ambiente, nunca gravada em arquivo versionado), entre como o administrador e chame `listar_usuarios`.
Expected: devolve ao menos um usuário, o do dono, com `papel = 'admin'`.

- [ ] **Step 2: Roteiro de verificação (script descartável)**

O script usa `fetch` contra `/auth/v1/token` e `/rest/v1` e confere, imprimindo PASS/FAIL por item:

1. `anon` não executa `listar_usuarios`, `criar_usuario`, `alterar_usuario`, `redefinir_senha` (permission denied).
2. Administrador cria `teste.verif` (atendente, senha ≥ 8).
3. **Decisivo:** `POST /auth/v1/token?grant_type=password` com `teste.verif@mizuho.invalid` devolve 200 e `access_token`. (Se devolver `Database error querying schema`, a linha de `auth.users` está incompleta: veja o comentário em `criar_usuario`.)
4. Com o token do atendente: lê `ordens_servico` (200); cria uma OS "TESTE DE USUARIOS"; vê o histórico dela com `criada` por "teste.verif".
5. Atendente: `update configuracoes` devolve 0 linhas; `criar_usuario` → `acesso_negado`; `definir_proximo_numero` → `acesso_negado`; `listar_usuarios` → `acesso_negado`.
6. Administrador bloqueia o atendente; **com o mesmo token**, `ordens_servico` devolve `[]` e `gerar_link_assinatura` → `acesso_negado`; novo login → erro.
7. Administrador reativa; login volta a funcionar.
8. Administrador redefine a senha; a senha antiga falha, a nova entra.
9. Administrador não consegue bloquear a si mesmo (`proprio_usuario`).
10. Cancelar a OS de teste (`cancelar_os`) devolve o número à fila; o atendente de teste é deixado **bloqueado**.

Expected: 10/10 PASS. Qualquer FAIL volta à Tarefa correspondente, com teste vermelho primeiro.

- [ ] **Step 3: Revisão final do ramo**

Seguir o fim de `superpowers:executing-plans`: pacote de revisão do ramo `usuarios-e-auditoria` contra `main`, revisor de contexto limpo, correções dos achados Critical/Important em uma passada, cada uma com teste que falha antes.

- [ ] **Step 4: Integrar e publicar (só com a autorização do dono)**

Seguir `superpowers:finishing-a-development-branch`: suíte verde, menu de opções ao dono, e só então mesclar em `main`/enviar. O deploy da Vercel acompanha o `main`. Depois do deploy, conferir: site 200, `/assinar/...` com `noindex` e `no-referrer`, e login do dono funcionando.

- [ ] **Step 5: Entregar ao dono, em linguagem simples**

Dizer: o que mudou; que a senha `mizuho123@` deve ser trocada em **Usuários → Redefinir senha** na própria linha; que o usuário `teste.verif` ficou bloqueado e pode ser apagado em Authentication → Users no painel; que as OS "TESTE DE USUARIOS" e as anteriores seguem no SQL de limpeza.
