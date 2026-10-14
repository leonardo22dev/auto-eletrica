# Mizuho OS — Assinatura do cliente por link

**Cliente:** Auto Elétrica Mizuho II Ltda. — ME
**Desenvolvedor:** LB Softwares
**Data:** 2026-10-14
**Status:** aprovado para planejamento
**Emenda a:** `2026-10-13-mizuho-os-design.md` e `2026-10-14-os-sem-cadastro-design.md`,
cujas decisões continuam valendo onde este documento não as contradiz.

---

## 1. Por que mudar

Hoje o orçamento sai da oficina como um PDF por WhatsApp, e a aprovação do
cliente acontece de boca ou por mensagem. Nada fica registrado no sistema de que
o cliente viu aqueles itens e aquele total e concordou. Quando o valor vira
discussão no balcão, a oficina só tem a palavra dela.

A decisão: **o PDF continua indo pelo WhatsApp, e junto vai um link onde o
cliente confere a OS e assina que está de acordo.** O aceite fica gravado, trava
os valores e aparece impresso no documento.

## 2. Objetivo e critérios de sucesso

- O cliente abre o link no celular, sem instalar nada e sem criar conta, confere
  a OS e assina em menos de um minuto.
- Depois do aceite, ninguém consegue alterar itens ou valores daquela OS, nem
  pela tela nem direto no banco.
- O cliente nunca assina um valor diferente do que estava vendo.
- O PDF mostra a assinatura desenhada e a data e hora do aceite.
- Um estranho que descubra o endereço do sistema não consegue ler nem uma OS.

### Quem usa

O **cliente final**, que passa a ter pela primeira vez uma tela própria. Ele não
tem login, e o sistema não o conhece: o que o identifica é o código do link.

## 3. Decisões travadas

| Decisão | Escolha | Por quê |
|---|---|---|
| O que é "assinar" | Desenhar com o dedo e confirmar, com o nome já preenchido | Espelha a linha "Assinatura do Cliente" do talão e não exige digitação |
| Itens e valores após o aceite | **Travados**, no banco | Uma assinatura não pode atestar um documento que o cliente não viu. Para mudar valor: cancelar e duplicar |
| Como a página lê o banco | Duas funções no banco, sem abrir a tabela a visitantes | O RLS continua fechado; o visitante só alcança uma OS, e só com o código |
| Validade do link | 30 dias, renovável | Um orçamento esquecido no WhatsApp não fica assinável para sempre |
| OS que aceitam assinatura | Orçamento e Aprovada | Finalizada e cancelada mostram a página sem o botão |
| Valor jurídico | Registro de aceite com data, hora, aparelho e desenho; **não** é assinatura qualificada | Proporcional ao risco de uma oficina; serviço externo fica como evolução |

## 4. O que muda e o que não muda

**Muda:** a OS ganha o aceite; existe uma rota pública nova; a edição de itens
trava depois do aceite; o PDF ganha a assinatura; o botão do WhatsApp passa a
levar o link.

**Não muda:** o login interno, o RLS das tabelas, o ciclo de status, a
numeração, o PDF no navegador, a hospedagem na Vercel e o Supabase.

**Emenda a uma decisão anterior:** "OS finalizada aceita edição, em qualquer
status" continua valendo **enquanto a OS não tiver aceite**. Com aceite, itens e
valores são imutáveis. Nome, telefone, veículo, placa e data seguem editáveis.

## 5. Modelo de dados

Colunas novas em `ordens_servico`:

| Coluna | Tipo | Para quê |
|---|---|---|
| `assinatura_codigo` | `text`, único | Código secreto do link |
| `assinatura_expira_em` | `timestamptz` | Fim da validade do link |
| `aceite_em` | `timestamptz` | Momento do aceite; nulo = não assinada |
| `aceite_assinatura` | `text` | O desenho, como PNG em data URL |
| `aceite_total_centavos` | `int` | O total que o cliente viu |
| `aceite_nome` | `text` | O nome na OS no momento do aceite |
| `aceite_agente` | `text` | Identificação do navegador do cliente |
| `aceite_ip` | `text` | IP, quando o Supabase o repassa; pode ficar vazio |

Um aceite por OS, então colunas bastam; não há tabela separada.

**O código do link** é a concatenação de dois `gen_random_uuid()` sem os
hífens: 244 bits aleatórios, com função nativa do Postgres, sem extensão. Gerar
um novo link sobrescreve a coluna, o que invalida o anterior sem trabalho extra.

**Tamanho do desenho:** a função recusa mais de 200 mil caracteres e qualquer
coisa que não comece com `data:image/png;base64,`.

## 6. Funções do banco

Todas `security definer`, com `search_path` fixado.

### `gerar_link_assinatura(p_os_id uuid)` — só usuário logado

Se a OS já tem código válido, devolve o mesmo; senão cria um com validade de 30
dias. Recusa OS cancelada, finalizada ou já assinada. Devolve o código e a
validade.

### `gerar_novo_link_assinatura(p_os_id uuid)` — só usuário logado

Troca o código e renova a validade, invalidando o link anterior. Mesmas recusas.

### `obter_os_para_assinatura(p_codigo text)` — visitante

Devolve um JSON com a **situação** e, quando couber, a OS:

| `situacao` | Quando | Traz a OS? |
|---|---|---|
| `valido` | Código certo, dentro da validade, status elegível, sem aceite | Sim |
| `assinado` | Já tem aceite | Só a data e hora do aceite |
| `cancelada`, `finalizada` | Status que não aceita | Sim, sem botão |
| `invalido` | Código inexistente **ou** vencido | Não |

Código inexistente e vencido respondem igual, de propósito: quem tenta códigos
não aprende nada sobre quais existem.

O que a OS traz: número, data, nome, veículo, placa, itens, total e os dados da
oficina que saem no PDF. Nada de telefone do cliente, nada de outras OS.

### `registrar_aceite(p_codigo, p_assinatura, p_total_visto, p_versao)` — visitante

Grava o aceite numa transação só. Recusa, sem gravar nada, quando:

- o código é inválido ou venceu;
- o status não aceita assinatura;
- a OS já tem aceite;
- `p_total_visto` difere do total atual (`total_divergente`);
- `p_versao` difere da versão atual da OS (`total_divergente`);
- o desenho está fora do formato, do tamanho ou das dimensões.

**A versão** é um resumo (md5) do nome do cliente, do total e de cada item. Ela
existe porque conferir só o total deixava passar a troca de itens com o mesmo
valor: o cliente via "Alternador novo, R$ 300", o dono trocava para
"recondicionado, R$ 300", e o cliente assinava o que nunca tinha visto.
`obter_os_para_assinatura` a devolve e a página a reenvia no aceite; a conferência
acontece sob o lock da linha, então itens e nome não mudam entre a leitura e a
gravação.

**O desenho** é validado além do formato do texto: a assinatura de 8 bytes do PNG
e as dimensões do cabeçalho (largura até 1200, altura até 600). Sem isso, um PNG
com cabeçalho de 20000×20000 cabe nos 200 mil caracteres, porque o deflate
chega a 1000:1, e derrubaria a geração do PDF no celular do dono.

Quando grava: preenche as colunas `aceite_*`, e se a OS estava em **Orçamento**
passa para **Aprovada**, com `data_aprovacao` no mesmo instante. Aprovada
permanece Aprovada.

O IP e o agente saem dos cabeçalhos que o PostgREST expõe à função; se o IP não
vier, fica vazio e o aceite vale do mesmo jeito.

### Permissões

`obter_os_para_assinatura` e `registrar_aceite` são executáveis por visitante.
As duas de geração, apenas por usuário logado. A tabela continua sem nenhuma
política para visitante.

## 7. Travas no banco

A trava vive no banco, não na tela: uma tela desatualizada ou um cliente HTTP
direto não podem contorná-la.

1. **Itens imutáveis após o aceite.** Um gatilho em `os_itens` recusa inserir,
   alterar ou apagar item cuja OS tenha `aceite_em`. A função
   `substituir_itens` passa por ele e herda a recusa. Dois detalhes:
   - **O item não muda de OS.** Antes, a trava olhava só a OS de destino, e um
     item saía de uma OS assinada para outra, deixando a assinada com total sem
     itens. A mudança de `os_id` é recusada.
   - **A OS é lida com `for update`**, para serializar com `registrar_aceite` e
     entre editores de itens. Com `for share` dois editores simultâneos
     entrariam em deadlock ao promover o lock.
2. **O aceite não é forjável.** Um gatilho em `ordens_servico` recusa qualquer
   escrita direta nas colunas `aceite_*` e `assinatura_*` feita por quem vem
   pela API. A decisão é pelo **papel de quem escreve**: dentro de uma função
   `security definer`, `current_user` é o dono da função; na escrita pela API é
   `anon`, `authenticated` ou `authenticator`.

   A primeira versão usava um sinalizador de transação (`set_config`). Era
   fraco: o sinalizador dura até o fim da **transação**, e o GraphQL do
   Supabase roda as mutations de uma requisição numa transação só. Um usuário
   logado chamava `gerar_link_assinatura` e, na mutation seguinte, escrevia o
   aceite direto, com data retroativa e total arbitrário. O papel não se forja
   por requisição nenhuma.
3. **O aceite não se desfaz.** Com `aceite_em` preenchido, as colunas do aceite
   e o total não mudam, para ninguém, nem pelas funções.

**Limite conhecido, aceito:** um funcionário logado lê `assinatura_codigo` pela
RLS e poderia abrir o link e assinar no lugar do cliente. O desenho do link
(quem o tem, assina) admite isso. A trava garante que o aceite só nasce pelo
caminho da função, com aparelho e horário gravados, não que quem assina é o
cliente.

Cancelar uma OS assinada continua permitido: é mudança de status, não de valor.

## 8. Telas

### O que o cliente vê — `/assinar/<código>`

Página única, para celular, fora do login, com a marca da Mizuho no topo:

1. A OS: número, data, veículo, placa, itens em cartões e o total em destaque,
   mais o texto de garantia que sai no PDF.
2. A declaração: *"Eu, João Silva, estou de acordo com este orçamento no valor
   de R$ 480,00."* O nome vem da OS.
3. O quadro de assinatura, largura total, uns 180px de altura, com "Assine
   aqui" de fundo e botão **Limpar**. Funciona com dedo e com mouse.
4. **Confirmar e assinar**, desabilitado até haver um desenho de verdade.

Estados com tela própria: link inválido ou vencido (com o telefone da oficina),
já assinado, OS cancelada ou finalizada, valor alterado enquanto olhava (a tela
recarrega e avisa), e sucesso.

A rota sai com `noindex` e `no-referrer`, configurados no `vercel.json`, para
não ser indexada e para o código não vazar a outros sites.

### O que muda para o dono

- **Bloco "Assinatura do cliente"** na OS aberta: *não enviada*, *aguardando*
  (enviada em…, válida até…), *assinada em…* com o desenho, e *link vencido*.
- **O botão do WhatsApp segue um só:** envia o PDF como hoje e a mensagem leva o
  link. O código nasce no primeiro envio e é reaproveitado enquanto valer.
  Existem ainda **Copiar link** e **Gerar novo link**.
- **Selo "Assinada"** ao lado do status no Histórico e no Início.
- **Início destaca o que está aguardando assinatura**, porque o dono não é
  avisado quando o cliente assina.
- **Itens em somente leitura** depois do aceite, com a nota *"OS assinada pelo
  cliente. Para alterar valores, cancele e duplique."*

### O PDF

A linha "Assinatura do Cliente" recebe o desenho, e abaixo dela *"Assinado
digitalmente pelo cliente em 14/10/2026 às 15:32"*. Sem aceite, o PDF sai como
hoje.

## 9. Segurança

- RLS das tabelas inalterado: nenhuma política nova para visitante.
- O visitante só alcança duas funções, e cada uma entrega uma OS por código.
- Código de 244 bits, resposta idêntica para inexistente e vencido.
- Aceite imutável e não forjável por escrita direta.
- A chave anon no navegador do cliente é a mesma pública de sempre; a chave
  `service_role` continua fora do código.
- O desenho é dado de usuário: é exibido como imagem, nunca interpretado.

## 10. Modo demonstração

O cliente simulado já repassa chamadas de função ao Postgres em memória, então
as duas funções novas funcionam nele sem mudança. A rota pública também. O que
a demonstração não imita é a separação entre visitante e usuário logado, e isso
é dito na própria tela.

## 11. Testes

**Postgres de verdade (PGlite), nas migrations reais:**

- código errado, vencido e inexistente respondem igual;
- assinar duas vezes é recusado;
- total divergente é recusado e nada é gravado;
- OS cancelada e finalizada não aceitam;
- o aceite leva Orçamento para Aprovada, e Aprovada continua Aprovada;
- itens não mudam depois do aceite, inclusive por `substituir_itens`;
- escrita direta nas colunas `aceite_*` é recusada;
- gerar novo link invalida o anterior.

**Funções puras, isoladas e testadas:** validação do formato e do tamanho do
desenho, decisão de "desenhou de verdade", e o texto da mensagem com o link.

**Contra o Supabase real**, como na instalação: o visitante sem login alcança as
duas funções e nada além; a tabela continua fechada.

**Sem teste automatizado:** o gesto de desenhar no celular. O projeto não tem
teste de componente, e esse trecho precisa ser conferido num aparelho.

## 12. Fora de escopo

- Avisar o dono quando o cliente assinar (push, WhatsApp ou e-mail).
- O cliente **recusar** o orçamento pela página.
- Assinatura qualificada ou serviço externo de assinatura.
- Assinar OS já finalizada, ou várias assinaturas na mesma OS.
- Enviar ao cliente um comprovante do aceite.
- Renovação automática ou lembrete de link perto de vencer.

## 13. Riscos

| Risco | Mitigação |
|---|---|
| Link encaminhado a quem não é o cliente | O aceite grava aparelho e IP; o código vale uma assinatura e vence em 30 dias |
| Valor trocado enquanto o cliente olha | O total visto vai junto e a divergência recusa o aceite |
| O dono não saber que foi assinado | O Início destaca "aguardando" e o selo "Assinada" aparece nas listas; aviso ativo fica para depois |
| Desenho em tela pequena sai ruim | Quadro em largura total, botão Limpar, e o cliente só confirma depois de ver o próprio traço |
| IP indisponível atrás da Vercel/Supabase | Fica vazio; o aceite vale pelo desenho, pelo horário e pelo aparelho |
| Corrigir valor depois de assinar dá trabalho | É a decisão: cancelar e duplicar, que já existe e leva um toque |
