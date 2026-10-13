# Mizuho OS — Sistema de Ordens de Serviço

**Cliente:** Auto Elétrica Mizuho II Ltda. — ME
**Desenvolvedor:** LB Softwares
**Data:** 2026-10-13
**Status:** aprovado para planejamento

---

## 1. Contexto e problema

A Auto Elétrica Mizuho II opera desde 1999 na Av. Robert Kennedy, 3340, Assunção,
São Bernardo do Campo — SP. Presta serviços de elétrica geral, injeção eletrônica,
limpeza de bicos, alternadores, motor de partida e baterias.

Hoje toda ordem de serviço é preenchida à mão em talão carbonado. Isso custa
impressão de talão, não deixa histórico consultável, não permite buscar por cliente
ou placa, e a via da oficina se perde ou desbota. Quando um carro volta, ninguém
sabe de cabeça o que já foi feito nele nem se a garantia de 3 meses impressa no
próprio talão ainda está valendo.

## 2. Objetivo

Substituir o talão de papel por um webapp que:

1. Preencha a OS na tela, inclusive pelo celular, em pé ao lado do carro.
2. Gere o PDF da ficha replicando o layout do talão atual.
3. Mantenha histórico pesquisável por número, cliente e placa.

### Critérios de sucesso

- Emitir uma OS completa pelo celular leva menos tempo que preencher o talão.
- O dono encontra qualquer OS anterior em menos de 10 segundos, por placa ou nome.
- Ao abrir OS para um carro já atendido, o sistema avisa se há garantia vigente.
- O PDF é reconhecível como o documento da Mizuho — o cliente final não percebe
  que mudou o meio, só que agora está impresso.
- Nenhum papel de talão é comprado depois da virada.

### Quem usa

Dono e funcionários da oficina. **Não é portal do cliente final** — o cliente só
recebe o PDF pronto, por WhatsApp ou impresso.

## 3. Escopo

### Dentro

- Login por e-mail e senha.
- Cadastro de clientes e veículos.
- Criação, edição e consulta de OS com itens (quantidade, discriminação,
  unitário, total).
- Ciclo de status: Orçamento → Aprovada → Finalizada, mais Cancelada.
- Geração do PDF replicando o talão.
- Envio por WhatsApp em um toque.
- Histórico com busca e filtros.
- Ficha do veículo com todas as OS daquele carro e status da garantia.
- Configurações com os dados da empresa.
- Instalável como app no celular (PWA).

### Fora desta versão

- Catálogo de serviços e peças com preço pré-cadastrado.
- Assinatura do cliente na tela.
- Controle de estoque.
- Financeiro, contas a pagar ou receber.
- Emissão fiscal (NF-e / NFS-e).
- Agendamento.
- Níveis de permissão distintos por funcionário.
- Sincronização offline completa.

Catálogo e assinatura digital foram avaliados e deixados de fora conscientemente;
são os dois candidatos mais naturais para a segunda versão.

## 4. Decisões travadas

| Decisão | Escolha | Por quê |
|---|---|---|
| Persistência | Supabase (Postgres gerenciado) | Dono acessa do balcão e do celular com o mesmo histórico; backup automático; modelo de dados é relacional de verdade |
| Modelo | Cliente → Veículos → OS | A placa é o atalho que o papel nunca teve: traz dono, telefone e histórico de uma vez |
| Total | Soma pura dos itens | Igual ao talão; sem campo de desconto, menos coisa para errar |
| PDF | Réplica fiel do talão | Zero estranhamento para o cliente final e zero treinamento para a oficina |
| Geração do PDF | No navegador, vetorial | Sem servidor para manter; texto selecionável; imprime nítido |
| Dinheiro | Inteiro em centavos | Ponto flutuante erra centavo em soma; centavo errado em documento é problema |
| Stack | Vite + React + Tailwind | Mesmo stack já usado no barberpro; nada novo para aprender |

## 5. Modelo de dados

Todas as tabelas em Postgres, no Supabase. Chaves primárias `uuid` com
`gen_random_uuid()`, exceto onde indicado.

### `configuracoes`

Linha única (`id` inteiro com `check (id = 1)`). Guarda tudo que hoje está
impresso fixo no talão:

- `razao_social`, `cnpj`, `inscricao_estadual`
- `endereco`, `cidade_uf`
- `telefone`, `email`
- `servicos_cabecalho` — lista de texto, a coluna de serviços do cabeçalho
- `texto_garantia` — o texto da tarja vermelha
- `garantia_meses` — inteiro, padrão 3

Motivo de existir: se mudar o telefone, se o cliente trocar de e-mail, ou se o
mesmo sistema for vendido a outra oficina, não se mexe em código.

### `clientes`

`id`, `nome` (obrigatório), `telefone`, `email`, `observacoes`,
`criado_em`, `atualizado_em`.

### `veiculos`

`id`, `cliente_id` (obrigatório, referencia `clientes`, `on delete restrict`),
`placa` (obrigatória, única, índice), `marca`, `modelo`, `ano`, `cor`,
`observacoes`, `criado_em`, `atualizado_em`.

A placa é gravada normalizada: maiúscula, sem hífen, sem espaço. Aceita o formato
antigo (`ABC1234`) e o Mercosul (`ABC1D23`). A normalização acontece antes de
gravar e antes de buscar, para que `abc-1234` e `ABC1234` sejam o mesmo carro.

`on delete restrict` é proposital: ninguém apaga um cliente que tem carro, e
ninguém apaga um carro que tem OS. Documento emitido não pode virar órfão.

### `ordens_servico`

Vínculos e identificação:

- `id`, `numero` (inteiro, único, gerado por sequence), `status`
- `cliente_id`, `veiculo_id`

Cópia congelada no momento da emissão:

- `cliente_nome`, `cliente_telefone`
- `veiculo_descricao`, `veiculo_placa`

Datas e valores:

- `data_abertura` (padrão hoje), `data_aprovacao`, `data_conclusao`
- `total_centavos`
- `observacoes`
- `pdf_path`, `pdf_gerado_em`
- `criado_por` (referencia `auth.users`), `criado_em`, `atualizado_em`

**Por que a cópia congelada.** A OS aponta para o cliente e o veículo, mas também
guarda nome, telefone, veículo e placa como estavam no dia da emissão. Sem isso,
corrigir o telefone de um cliente hoje reescreveria silenciosamente uma OS emitida
há dois anos. O vínculo serve ao histórico; a cópia serve ao documento.

**Por que a numeração vem do banco.** Uma sequence do Postgres gera o número, não
o app. Assim nunca sai número repetido nem com buraco, mesmo com duas pessoas
salvando ao mesmo tempo. O número inicial é definido no setup, para continuar de
onde o talão de papel parou, e a tela de Configurações expõe isso através de uma
função no banco.

**Garantia.** Não é coluna gravada. É calculada a partir de `data_conclusao` mais
`configuracoes.garantia_meses`, pelo mesmo motivo de sempre: valor derivado que se
grava é valor que um dia diverge da sua fonte.

### `os_itens`

`id`, `os_id` (referencia `ordens_servico`, `on delete cascade`), `posicao`,
`quantidade`, `descricao`, `valor_unitario_centavos`, `valor_total_centavos`.

`unique (os_id, posicao)` preserva a ordem das linhas como no papel.

Um trigger no banco recalcula `ordens_servico.total_centavos` a cada inserção,
alteração ou remoção de item. O total não é responsabilidade do app — assim ele
não tem como divergir da soma, aconteça o que acontecer no front.

## 6. Ciclo de vida da OS

```
Orçamento ──aprovar──▶ Aprovada ──finalizar──▶ Finalizada
    │                      │
    └──────cancelar────────┴──────────▶ Cancelada
```

- **Orçamento** — estado inicial. O PDF sai com o título `ORÇAMENTO Nº`. É o papel
  que o cliente leva para pensar.
- **Aprovada** — grava `data_aprovacao`. O PDF passa a sair como
  `ORDEM DE SERVIÇOS Nº`, mantendo o mesmo número.
- **Finalizada** — grava `data_conclusao`, que é o que dispara o relógio da
  garantia.
- **Cancelada** — terminal. O número é consumido e não reaproveitado; buraco na
  numeração é auditável, número reciclado não é.

**OS finalizada não aceita edição de itens nem de valores.** Um trigger no banco
bloqueia. Para corrigir, usa-se *Cancelar e refazer*, que cancela a OS e abre uma
nova já preenchida com os mesmos dados. Documento emitido que muda sozinho depois
de entregue ao cliente não é documento.

## 7. Telas e navegação

| Rota | Tela |
|---|---|
| `/login` | Entrar |
| `/` | Início: atalho de nova OS, três números do dia, OS recentes |
| `/os` | Histórico: busca única e filtros por status |
| `/os/nova` | Nova OS |
| `/os/:id` | OS aberta: dados, itens, total, garantia, ações |
| `/clientes` e `/clientes/:id` | Clientes |
| `/veiculos` | Veículos: busca por placa |
| `/veiculos/:id` | Ficha do veículo: todas as OS daquele carro |
| `/configuracoes` | Dados da empresa e numeração |

Navegação no celular por barra inferior de quatro abas (Início, OS, Clientes,
Ajustes) — alcance do polegar. No desktop, barra lateral.

### Nova OS — o fluxo que importa

1. **Placa primeiro**, em campo grande.
2. Placa conhecida: o app traz dono, telefone, carro e quantas OS aquele veículo
   já teve. Placa nova: abre cadastro rápido ali mesmo, sem sair da tela.
3. Se houver garantia vigente de OS anterior, aparece aviso com número, serviço e
   data de vencimento.
4. **Itens** como cartões empilhados, não tabela. Campos numéricos abrem teclado
   numérico. Cada cartão mostra o total da linha.
5. **Total fixo no rodapé**, sempre visível enquanto soma.
6. Duas saídas: *Orçamento* ou *Gerar OS*.

### OS aberta

Dados do cliente e do veículo, itens, total, situação da garantia, e as ações:
PDF, WhatsApp, avançar status, e *Duplicar como nova OS* para o carro que volta
pelo mesmo serviço.

## 8. Identidade visual

Tokens extraídos do próprio talão.

| Token | Valor | Uso |
|---|---|---|
| `--red` | `#CC2E1E` | Botão principal, total, tarja de garantia |
| `--red-dark` | `#9B1F12` | Estado pressionado, fundo do login |
| `--ink` | `#141414` | Texto, barra superior, barra lateral |
| `--bg` | `#F6F4F2` | Fundo das telas |
| `--paper` | `#FFFFFF` | Cartões |
| `--line` | `#E4E1DE` | Bordas |

Status: âmbar para orçamento, azul para aprovada, verde para finalizada, cinza
para cancelada.

O vermelho foi amostrado da foto do talão e corrigido para a luz ambiente. Ele
aparece pouco de propósito — vermelho em área grande cansa a vista em oficina, que
é ambiente de luz forte.

**Tipografia.** Source Serif 4 na marca e no cabeçalho do documento, como no
papel. Archivo na interface, que é o que se lê de relance.

**Mobile.** Alvo de toque mínimo de 48px. `inputMode` numérico nos campos de
valor. Total fixo no rodapé. Nenhuma tabela de quatro colunas em tela estreita.

**Logo.** A versão em uso é a extração da foto do talão, limpa e ampliada —
suficiente para tela, insuficiente para impressão. Substituir pelo arquivo
original assim que o cliente fornecer. Ficheiro de referência em
`docs/logo_clean.png`; maquete visual aprovada em `docs/maquete.html`.

## 9. PDF e entrega

### Geração

Módulo isolado em `src/pdf/`. Recebe uma OS pronta e devolve o documento. Não
conhece Supabase, não conhece roteamento, não sabe de onde o dado veio. Isso
importa porque é a parte que mais vai ser ajustada até o cliente aprovar o
espaçamento, e precisa ser mexida sem risco para o resto.

PDF vetorial com fontes e logo embarcados — sem embarcar, o arquivo renderiza
diferente em cada aparelho. O pacote carrega sob demanda, no clique, não no boot.

Layout: cabeçalho com logo, razão social, coluna de serviços, telefone, endereço,
e-mail, CNPJ e Inscrição Estadual; título conforme o status; data por extenso;
cliente, telefone, veículo, placa; tarja vermelha da garantia; tabela de quatro
colunas; `TOTAL R$`; linha de assinatura. As linhas não usadas saem em branco até
fechar a página, como no talão — preserva o peso visual e deixa espaço para
anotação à mão na oficina.

### Entrega

- **Celular:** Web Share API entrega o PDF direto ao WhatsApp, com o anexo junto.
- **Desktop:** o navegador não anexa arquivo no WhatsApp Web. O PDF sobe para o
  Supabase Storage em caminho com UUID — link não adivinhável, abre sem login — e
  o botão monta a mensagem com o link.
- Onde a Web Share API não existir, o fallback é baixar o arquivo.

O PDF é regerado quando o status muda, porque o título do documento muda junto.

## 10. Arquitetura

Vite + React + Tailwind, pastas por domínio e arquivos pequenos:

```
src/
  pdf/           documento e geração — isolado, sem dependência do resto
  data/          consultas ao Supabase, uma por domínio
  os/            telas de ordem de serviço
  clientes/      telas de cliente
  veiculos/      ficha do veículo
  config/        configurações
  auth/          login e sessão
  lib/           funções puras: dinheiro, placa, datas, garantia
  ui/            componentes compartilhados
```

Nenhum arquivo fazendo três coisas. Quando um crescer demais, é sinal de que são
dois.

### Conectividade

Com dados na nuvem, sem rede o app não lê o histórico. O que é protegido é o
trabalho em andamento: a OS em digitação fica em rascunho local e sobe quando a
conexão voltar. Perder uma OS meio preenchida porque o 4G oscilou seria a pior
primeira impressão possível. Sincronização offline completa está fora de escopo.

## 11. Segurança

- Supabase Auth, e-mail e senha.
- RLS habilitada em todas as tabelas, exigindo usuário autenticado.
- A chave que vai ao navegador é a `anon`, que sozinha não lê nada — quem protege
  é a RLS. A chave de serviço não encosta no front.
- Bucket de PDFs com leitura pública por caminho contendo UUID, para que o link
  enviado ao cliente abra sem login e ainda assim não seja adivinhável.
- Dados pessoais armazenados: nome, telefone e e-mail de cliente. Nenhum dado
  sensível, nenhum dado de pagamento.

## 12. Testes

Vitest nas funções puras, que é onde erro custa dinheiro:

- soma dos itens e do total, em centavos
- formatação e leitura de valores em reais
- normalização de placa, formato antigo e Mercosul
- cálculo do vencimento da garantia
- transições de status válidas e inválidas

Mais um teste que renderiza o documento PDF e confere que os campos chegaram
nele. Mais o smoke de build, no mesmo padrão já usado no barberpro.

Layout em pixel não é testado automaticamente — isso é olho humano.

## 13. Hospedagem

Vercel ou Netlify no plano grátis. Supabase no tier grátis, que cobre esse volume
com folga. Instalável no celular pelo próprio navegador, com ícone e nome
próprios.

## 14. Riscos

| Risco | Mitigação |
|---|---|
| Logo em baixa resolução no PDF impresso | Pedir o arquivo original ao cliente antes de entregar; a extração atende enquanto isso |
| Oficina com internet instável | Rascunho local da OS em digitação; o resto exige rede, e isso foi aceito ao escolher nuvem |
| Numeração inicial errada no setup | Definida em Configurações e conferida com o talão antes da primeira OS real |
| Resistência ao digital no balcão | PDF idêntico ao talão; o fluxo começa pela placa, que é o que ele já faz hoje ao olhar o carro |
