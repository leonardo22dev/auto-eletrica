# Mizuho OS — Usuários, níveis de acesso e registro de atividade

**Cliente:** Auto Elétrica Mizuho II Ltda. — ME
**Desenvolvedor:** LB Softwares
**Data:** 2026-10-14
**Status:** aprovado para planejamento
**Emenda a:** `2026-10-13-mizuho-os-design.md`. Onde este documento contradiz a
regra "a oficina inteira usa o mesmo nível de acesso" (RLS, migration 0003),
vale este.

---

## 1. Por que mudar

Hoje existe um único nível de acesso: qualquer usuário logado vê e altera tudo,
inclusive Ajustes e a numeração. Não há tela para saber quem tem acesso, nem
para tirar o acesso de alguém que saiu da oficina, e nada registra quem criou ou
mudou uma OS. Para criar ou bloquear alguém é preciso entrar no painel do
Supabase.

O dono pediu, por segurança, **controlar todos os usuários**.

## 2. Objetivo e critérios de sucesso

- O administrador cria, bloqueia, reativa e troca a senha de usuários numa aba
  **Usuários**, sem abrir o Supabase.
- Existem dois níveis: **Administrador** e **Atendente**. Atendente faz OS e não
  vê a aba Usuários nem altera Ajustes.
- Usuário bloqueado perde o acesso **na hora**, inclusive com o app aberto no
  celular, e não consegue entrar de novo.
- Cada OS mostra quem a criou, quem mudou o quê e quando.
- O sistema nunca fica sem administrador ativo.
- Nada disso depende da tela: um usuário que chame a API direto continua barrado.

### Quem usa

O **administrador** (o dono) ganha a aba Usuários. O **atendente** passa a ter o
acesso reduzido. O cliente final não é afetado.

## 3. Decisões travadas

| Decisão | Escolha | Por quê |
|---|---|---|
| Como se cria usuário | Funções no próprio banco, só chamáveis por administrador | Sem chave `service_role`, sem Edge Function, sem deploy novo. Aplica-se colando um SQL, como a assinatura |
| Níveis | `admin` e `atendente` | O que o dono pediu; mais níveis são evolução |
| Bloquear | Marca `ativo = false` **e** `banned_until` no Supabase Auth, e encerra as sessões | O RLS corta na hora; o `banned_until` impede novo login e renovação de token |
| Excluir usuário | Não existe na tela | Bloquear preserva o histórico. Quem precisar apaga no painel do Supabase |
| Usuário sem perfil | **Sem acesso** | Falha fechada: quem for criado direto no painel do Supabase não entra até ter perfil |
| Registro de atividade | Gatilhos no banco, tabela só de inclusão | Não depende da tela, e quem usa o app não consegue apagar nem editar |
| Senha | Mínimo de 8 caracteres, trocada pelo administrador | Resolve também a senha fraca atual do dono |

## 4. O que muda e o que não muda

**Muda:** nova tabela de perfis; todas as policies passam a exigir usuário
ativo; Ajustes e numeração passam a exigir administrador; quatro funções de
gestão de usuários; histórico por OS; aba Usuários; seção Histórico no detalhe
da OS; `ordens_servico.criado_por` passa a `on delete set null` para que apagar
um usuário no painel não esbarre em OS antigas.

**Não muda:** o login por "usuário", a assinatura do cliente (página pública e
funções), o ciclo de status, a numeração, o PDF e a hospedagem.

## 5. Dados

### 5.1 `perfis`

| Coluna | Tipo | Regra |
|---|---|---|
| `user_id` | uuid, PK | referencia `auth.users(id)` `on delete cascade` |
| `usuario` | text, único | `^[a-z0-9._-]{3,30}$`; é o que a pessoa digita no login |
| `nome` | text | não vazio; aparece no histórico |
| `papel` | text | `'admin'` ou `'atendente'` |
| `ativo` | boolean | padrão `true` |
| `criado_em`, `criado_por` | | `criado_por` com `on delete set null` |

Migração dos usuários que já existem: todos viram `admin`, com `usuario` igual à
parte antes do `@` do e-mail. Um gatilho em `auth.users` torna o **primeiro**
usuário de um projeto novo administrador (sem isso, quem instala do zero não
entraria). A migration **aborta** se existirem usuários e nenhum virar
administrador.

`authenticated` só **lê** `perfis` (a própria linha; o administrador, todas).
Não há `insert`, `update` nem `delete` direto: tudo passa pelas funções.

### 5.2 `os_historico` (somente inclusão)

`id` (identity), `os_id` (`on delete cascade`, para a limpeza manual de
registros de teste continuar possível), `usuario_id` (nulo), `usuario_nome`
(cópia congelada), `acao`, `detalhe` jsonb, `em` timestamptz e `transacao` (bigint,
número da transação, usado para juntar as linhas de itens de uma mesma operação).

Ações: `criada`, `dados_alterados` (`{campo: {de, para}}`), `itens_alterados`
(`{total_de, total_para}`), `status_alterado` (`{de, para}`), `link_gerado`,
`aceita`, `cancelada`.

- Quem: `auth.uid()` do momento. Sem uid e vindo da assinatura pública, grava
  **"Cliente (assinatura)"**; sem uid e fora disso, **"Sistema"**.
- `itens_alterados` vira **uma linha por operação**, não uma por item
  (índice único em `os_id, acao, transacao` para essa ação).
- Leitura: usuário ativo. Escrita: só os gatilhos (`security definer`).

### 5.3 `usuarios_historico`

Mesma ideia, para a gestão de usuários: `ator_id`, `ator_nome`, `alvo_id`,
`alvo_usuario`, `acao` (`criado`, `nome_alterado`, `papel_alterado`, `bloqueado`,
`reativado`, `senha_redefinida`), `detalhe`, `em`. Escrito pelas próprias funções.
Aparece como "Atividade recente" na aba Usuários, visível ao administrador.

## 6. Funções (todas `security definer`, `search_path` fixo)

Qualquer função `security definer` ignora o RLS. Por isso `gerar_link_assinatura`
(a única existente que é `security definer` e que `authenticated` chama) passa a
começar por `usuario_ativo()`, senão um usuário bloqueado ainda geraria links
pela API. `cancelar_os` e `substituir_itens` são `security invoker`: o RLS já
as barra ("OS não encontrada"). `versao_da_os` nem é chamável por usuário.
`definir_proximo_numero` passa a exigir administrador.

| Função | Quem | O que faz |
|---|---|---|
| `usuario_ativo()` | interna | existe perfil com `ativo` para `auth.uid()` |
| `usuario_admin()` | interna | idem, com `papel = 'admin'` |
| `listar_usuarios()` | admin | perfis com e-mail, papel, ativo, criado em |
| `criar_usuario(usuario, nome, senha, papel)` | admin | cria em `auth.users` + `auth.identities` (e-mail `usuario@mizuho.invalid`, senha em bcrypt) e o perfil |
| `alterar_usuario(user_id, nome, papel, ativo)` | admin | muda os dados; bloquear aplica `banned_until` e apaga `auth.sessions` |
| `redefinir_senha(user_id, senha)` | admin | troca o hash e encerra as sessões do alvo |

Travas, dentro das funções. O lock (`pg_advisory_xact_lock`) é adquirido
**antes** de conferir se quem chama é administrador, para que dois
administradores não se rebaixem ao mesmo tempo:

- ninguém altera o **próprio** papel nem o próprio `ativo`;
- a operação que deixaria **zero administradores ativos** é recusada (guarda
  defensiva: com a regra acima, só é alcançável por concorrência ou regressão);
- `usuario` repetido, formato inválido, senha curta e papel desconhecido são
  recusados com mensagem em português.

## 7. Segurança: o que cobre cada camada

| Ameaça | Barreira |
|---|---|
| Visitante sem login | RLS sem policy para `anon`, como hoje; funções novas sem `execute` para `anon` |
| Usuário bloqueado com sessão aberta | `usuario_ativo()` em toda policy e função: corta na próxima requisição |
| Atendente chamando a API de gestão | `usuario_admin()` dentro de cada função |
| Atendente alterando Ajustes ou numeração | policy de `configuracoes` e `definir_proximo_numero` exigem admin |
| Alguém se promovendo a admin | `perfis` sem escrita direta; função recusa mudar o próprio papel |
| Apagar ou reescrever o histórico | sem `insert/update/delete` para `authenticated` e `anon` |
| Novas funções expostas por padrão | o `alter default privileges` da 0007 continua valendo |

A tela esconde o que o usuário não pode usar, mas **a segurança é do banco**; a
tela é só cortesia.

## 8. Telas

- **Login:** perfil ausente ou inativo desloga e mostra "Acesso bloqueado. Fale
  com o administrador." A sessão é revalidada quando a aba volta ao foco.
- **Navegação:** "Usuários" e "Ajustes" só para administrador; as rotas
  `/usuarios` e `/configuracoes` redirecionam o atendente para o início. O nome
  de quem está logado, o nível e o **Sair** aparecem na casca do app, para todos.
- **Usuários:** lista com nome, usuário, nível e situação; "Novo usuário";
  por linha: editar nome e nível, bloquear/reativar (com confirmação) e
  redefinir senha. Na própria linha aparece "Você" e some o que é proibido.
  Abaixo, "Atividade recente".
- **Detalhe da OS:** seção **Atividade** (o nome "Histórico" já é a aba da lista
  de OS), em ordem cronológica, ex.:
  "14/10 15:32 · Maria alterou os itens (R$ 380,00 → R$ 480,00)".
- **Demonstração:** o banco local do modo demo ganha perfis, as quatro funções
  e o histórico, para o fluxo continuar testável sem Supabase. Continua com um
  único usuário simulado: qualquer login entra como o administrador de
  demonstração.

## 9. Publicação e riscos

**Ordem obrigatória:** primeiro o SQL no Supabase, depois o deploy. O app novo
com o banco antigo bloquearia todo mundo por falta de perfil; o app antigo com o
banco novo continua funcionando, porque os usuários atuais viram administradores.

| Risco | Tratamento |
|---|---|
| Inserir direto em `auth.users` depende de colunas internas do Supabase | É a parte frágil do caminho escolhido. O simulador local não tem o `auth` real, então a verificação decisiva é **contra o projeto real**: criar um usuário pela função e entrar com ele pela API de login |
| Migration trancar o próprio dono | Aborta se não houver administrador ativo; o preenchimento dos perfis roda antes de qualquer policy nova |
| Usuários de teste da verificação ficarem no Supabase | Ficam bloqueados e sem OS; o `on delete set null` permite apagá-los no painel |
| Evolução do Supabase mudar o `auth` | Se acontecer, o caminho B (Edge Function com `service_role`) substitui só as quatro funções; o resto do desenho não muda |

## 10. Fora de escopo

Trocar a própria senha pelo atendente, recuperação por e-mail, autenticação em
dois fatores, último acesso, excluir usuário pela tela, permissões por OS e mais
de dois níveis.

## 11. Testes

- **Banco (PGlite):** `usuario_ativo`/`usuario_admin`; cada função como admin,
  como atendente, como bloqueado e como `anon`; as travas (próprio papel, último
  admin, duas operações concorrentes); policies de OS e de Ajustes; histórico
  escrito para cada ação e imune a `update`/`delete` por `authenticated`;
  migration abortando sem administrador. Os stubs do `auth` ganham `uid()`,
  `sessions`, `identities` e `crypt`.
- **Mutação:** remover o `usuario_ativo()` de uma função e o de uma policy, e
  confirmar que um teste fica vermelho.
- **Telas:** aba Usuários (lista, criar, bloquear, redefinir, "Você"), rota
  protegida, tela de acesso bloqueado, seção Histórico.
- **Real:** roteiro contra o projeto: criar atendente, entrar com ele, criar OS,
  recusar gestão e Ajustes, bloquear e ver a próxima requisição falhar, reativar.
