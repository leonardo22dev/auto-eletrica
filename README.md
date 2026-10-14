# Mizuho OS

Sistema de Ordens de Serviço da **Auto Elétrica Mizuho II Ltda. — ME**
(São Bernardo do Campo — SP). Substitui o talão de papel carbonado: a OS é
preenchida no celular ao lado do carro, o PDF sai replicando o talão, e o
histórico fica pesquisável por número, cliente e placa.

Feito por **LB Softwares**.

## O que faz

- Login por e-mail e senha, sem autocadastro.
- OS autossuficiente: nome, telefone, veículo, placa e data digitados nela.
- A placa consulta as OS anteriores e oferece os dados da última vez, sem cadastro.
- OS com itens (quantidade, discriminação, unitário, total) e total calculado
  pelo banco.
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
| `docs/superpowers/plans/2026-10-13-mizuho-os.md` | Plano de implementação |
| `docs/maquete.html` | Maquete visual aprovada — abra no navegador |
| `docs/logo_clean.png` | Logo extraído da foto do talão (provisório) |

## Pendências

- **Logo em alta resolução.** O arquivo em uso foi extraído da foto do talão e
  serve para tela, não para impressão. Pedir o original ao cliente e substituir
  `public/logo-mizuho.png`.
- **Numeração inicial.** Conferir com o dono o último número do talão de papel
  antes da primeira OS real.
