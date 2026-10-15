# Mizuho OS

Sistema de Ordens de Serviço da **Auto Elétrica Mizuho II Ltda. — ME**
(São Bernardo do Campo — SP). Substitui o talão de papel carbonado: a OS é
preenchida no celular ao lado do carro, o PDF sai replicando o talão, e o
histórico fica pesquisável por número, cliente e placa.

Feito por **LB Softwares**.

## O que faz

- Login por usuário e senha, sem autocadastro.
- Dois níveis de acesso: **Administrador** (aba Usuários e Ajustes) e
  **Atendente** (faz OS). O administrador cria, bloqueia e reativa pessoas e
  redefine senhas; o bloqueio vale na hora, mesmo com o app aberto.
- Cada OS mostra, em *Atividade*, quem criou, quem mudou o quê e quando. O
  registro é gravado no banco e ninguém o apaga pela tela.
- OS autossuficiente: nome, telefone, veículo, placa e data digitados nela.
- A placa consulta as OS anteriores e oferece os dados da última vez, sem cadastro.
- OS com itens (quantidade, discriminação, unitário, total) e total calculado
  pelo banco.
- Dois jeitos de montar os itens: **Detalhar valores** (preço de cada item) ou
  **Valor total** (só os serviços e o valor fechado com o cliente). No PDF e na
  página de assinatura, os serviços saem sem preço e o valor total aparece no
  fim. Não há campo novo no banco: o valor total é a última linha da OS.
- Ciclo **Orçamento → Aprovada → Finalizada**, mais Cancelada.
- PDF replicando o talão, com as 18 linhas e a tarja da garantia.
- Envio por WhatsApp: anexo direto no celular, link no desktop.
- Assinatura do cliente: a mensagem leva também um link, onde o cliente confere a
  OS e assina com o dedo. O aceite trava itens e valores no banco e sai impresso
  no PDF. O link vale 30 dias e abre sem login.
- Histórico em tela própria, com busca por nome, placa ou número.
- Instalável como app no celular.

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha com os dados do projeto Supabase
npm run dev
```

O build aborta de propósito se `VITE_SUPABASE_URL` ou `VITE_SUPABASE_ANON_KEY`
faltarem. Sem esse guarda, o app compilaria vazio e subiria em branco, sem erro.

## Banco de dados

As migrations ficam em `supabase/migrations/`, numeradas e aplicadas em ordem:

```bash
npx supabase link --project-ref <ref-do-projeto>
npx supabase db push
```

Para quem já tem o banco de pé, a atualização da assinatura é só
`supabase/atualizacao-0007.sql`, colada no SQL Editor. Ela também retira dos
visitantes a permissão de executar as funções internas do banco, que o Supabase
concede por padrão.

A atualização de usuários e níveis de acesso é `supabase/atualizacao-usuarios.sql`:
cole no SQL Editor e rode **uma vez, antes de publicar o app**. É tudo ou nada.
Quem já usava o sistema vira administrador; num projeto novo, o primeiro usuário
criado vira administrador. Usuário criado direto no painel do Supabase depois
disso **não entra**: falta o perfil. Crie pela aba Usuários. Para apagar alguém
de vez, use *Authentication → Users* no painel; as OS dela permanecem.

`supabase/atualizacao-0011.sql` fecha a **listagem pública** do bucket dos PDFs
(antes, qualquer visitante com a chave pública listava os arquivos). O link que
vai por WhatsApp continua abrindo, porque o bucket é público; só quem está logado
e ativo lista. Cole e rode uma vez, depois da atualização de usuários.

`supabase/atualizacao-0012.sql` cria a **exclusão de OS**: só o administrador, em
qualquer status (inclusive OS assinada), pela função `excluir_os`. Pela API
continua sem existir apagar direto. Fica um registro mínimo em *Ajustes → OS
excluídas* (número, cliente, placa, total, se estava assinada, quem e quando).
Itens, atividade, aceite do cliente e o PDF publicado somem, e não há volta.
Rode o SQL **antes** de publicar o app que traz o botão.

Depois, no painel do Supabase:

1. *Authentication → Users*: crie o usuário da oficina com **Auto Confirm User**.
2. *Authentication → Providers*: desligue **Enable sign ups**.
3. No app, em *Configurações → Numeração*, defina o próximo número de OS para
   continuar de onde o talão de papel parou.

## Testes

```bash
npm test     # suíte completa
npm run lint
```

A suíte cobre as funções puras — dinheiro em centavos, placa, datas, garantia,
status, telefone — e o documento PDF. O schema do banco é testado de verdade:
`supabase/schema.test.js` sobe um Postgres em WebAssembly (PGlite), aplica as
migrations reais e verifica o trigger do total, a numeração, a devolução do
número ao cancelar a última OS e a integridade dos cadastros.

## Publicação

Importe o repositório na Vercel e cadastre `VITE_SUPABASE_URL` e
`VITE_SUPABASE_ANON_KEY` em *Settings → Environment Variables*. Depois do
deploy, acrescente o domínio em *Authentication → URL Configuration* no
Supabase.

## Documentação

| Arquivo | O que é |
|---|---|
| `docs/superpowers/specs/2026-10-13-mizuho-os-design.md` | Spec: decisões e por quê |
| `docs/superpowers/specs/2026-10-14-os-sem-cadastro-design.md` | Emenda: OS sem cadastro |
| `docs/superpowers/specs/2026-10-14-usuarios-e-auditoria-design.md` | Emenda: usuários, níveis e atividade |
| `docs/superpowers/plans/2026-10-13-mizuho-os.md` | Plano de implementação |
| `docs/maquete.html` | Maquete visual aprovada — abra no navegador |
| `docs/logo_clean.png` | Logo oficial do cliente, recortado do arquivo original |

O logo do app está em `public/logo-mizuho.png` (cabeçalho, login e assinatura) e
em `public/logo-mizuho-pdf.jpg` (PDF, mais leve porque vai embutido em cada
arquivo). Os ícones do app instalado são `public/icone-*.png`.

## Pendências

- **Numeração inicial.** Conferir com o dono o último número do talão de papel
  antes da primeira OS real.
