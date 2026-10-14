# Mizuho OS — OS sem cadastro

**Cliente:** Auto Elétrica Mizuho II Ltda. — ME
**Desenvolvedor:** LB Softwares
**Data:** 2026-10-14
**Status:** aprovado para planejamento
**Emenda a:** `2026-10-13-mizuho-os-design.md`, cujas decisões continuam valendo
onde este documento não as contradiz.

---

## 1. Por que mudar

O sistema foi construído sobre cliente → veículo → OS. Abrir uma ordem exigia
que o cliente e o carro existissem como cadastro, ou que fossem criados ali
mesmo antes de digitar o primeiro item.

Na prática da oficina isso inverte a ordem natural do trabalho. O talão de
papel que o sistema substitui não tem cadastro: tem uma folha onde se escreve o
nome, o telefone, o veículo e a placa, e pronto. O dono já tem esse fluxo na
cabeça há mais de vinte anos.

A decisão: **a ordem de serviço passa a ser autossuficiente.** Nada precisa
existir antes dela.

## 2. O que muda

- Não há cadastro de clientes nem de veículos. As tabelas são removidas.
- Nome, telefone, veículo, placa e data são digitados na própria OS.
- A data da OS é editável e nasce preenchida com hoje.
- O histórico vira tela própria, só de consulta.
- A sugestão por placa e o aviso de garantia passam a consultar as OS
  anteriores, não um cadastro.

## 3. O que não muda

- O PDF. Ele já imprime a partir das colunas que agora passam a ser a fonte —
  era exatamente o ponto da cópia congelada.
- O ciclo de status: Orçamento → Aprovada → Finalizada, mais Cancelada.
- A numeração por sequence, com devolução do número ao cancelar a última OS.
- O total calculado por trigger no banco.
- Dinheiro em centavos, placa normalizada, datas como texto.
- Auth, RLS e a entrega do PDF por WhatsApp.

## 4. Modelo de dados

### `ordens_servico`

Saem:

- `cliente_id`, `veiculo_id` — não há mais a que apontar.
- `data_conclusao` — fundida em `data_os` (ver abaixo).

Renomeia:

- `data_abertura` → **`data_os`**, agora editável.

Passam de cópia a fonte, sem mudar de tipo:

- `cliente_nome` (obrigatório), `cliente_telefone`
- `veiculo_descricao` (obrigatório), `veiculo_placa` (obrigatório)

Permanecem: `numero`, `status`, `data_aprovacao`, `finalizada_em`,
`total_centavos`, `observacoes`, `pdf_path`, `pdf_gerado_em`, `criado_por`,
`criado_em`, `atualizado_em`.

### Tabelas removidas

`clientes` e `veiculos`, com seus índices e políticas.

### Uma data só

O talão tem um campo "Data". O sistema passa a ter um: `data_os`.

É a data impressa no documento, e é dela que a garantia de 3 meses conta
quando a OS está finalizada.

**Consequência aceita:** uma OS aberta como orçamento em agosto e finalizada em
outubro conta garantia a partir de agosto. Na oficina as duas datas quase sempre
caem na mesma semana, e quando não caírem o campo é editável — foi por isso que
ele deixou de ser automático.

### Migração

Entra `0006`, que remove as colunas e tabelas e renomeia a data. As migrations
anteriores ficam como estão: histórico é histórico.

Não há dado de produção a preservar — o projeto Supabase ainda não existe. É o
motivo de a mudança ser barata agora e cara daqui a um mês.

## 5. A placa como atalho, sem cadastro

Duas consultas sobre `ordens_servico`, numa coluna que já é indexada:

**Sugestão.** A OS mais recente com aquela placa, em qualquer status, devolve
nome, telefone e descrição do veículo. A tela oferece *"Usar estes dados"*; ele
aceita ou digita por cima. Nada é gravado em cadastro nenhum — é leitura do
histórico.

**Garantia.** A OS finalizada mais recente com aquela placa. Se
`data_os + configuracoes.garantia_meses` ainda não passou, a tarja âmbar aparece
com número, serviço principal e data de vencimento.

O que o dono vê é o mesmo de antes. O que sai é a tabela por trás.

## 6. Telas

| Rota | Tela |
|---|---|
| `/login` | Entrar |
| `/` | Início |
| `/os` | Histórico |
| `/os/nova` | Nova OS |
| `/os/:id` | OS aberta |
| `/configuracoes` | Configurações |

Três abas: **Início**, **Histórico**, **Ajustes**.

### Início — o que precisa de ação

Botão grande de Nova OS, os três números (em aberto, orçamentos, faturado no
mês) e a lista das OS **em aberto** — orçamentos esperando resposta e aprovadas
esperando execução.

Antes a lista era de "recentes", o que vira redundância assim que o Histórico
existe. O dono abre o app de manhã para ver o que está pendurado, não o que já
passou.

### Histórico — só consulta

Busca única atendendo nome, placa e número ao mesmo tempo, chips de status, e a
lista. Toca e abre a OS. Não se cria nada a partir daqui.

### Nova OS

Os campos do talão, com a placa promovida ao topo porque é ela que faz o
trabalho:

1. **Placa**, em caixa grande. Ao completar, a sugestão e o aviso de garantia.
2. **Data**, preenchida com hoje, editável.
3. **Nome**, **Telefone**, **Veículo** — texto livre.
4. **Itens** em cartões, com total fixo no rodapé.
5. Duas saídas: *Orçamento* e *Gerar OS*.

Rascunho local continua: a OS em digitação sobrevive a uma recarga.

### OS aberta

Ganha o que não tinha: **nome, telefone, veículo, placa e data passam a ser
editáveis**. Eram imutáveis porque eram cópia de um cadastro; sem cadastro,
corrigir um nome mal digitado deixa de exigir cancelar e refazer.

O resto continua: itens editáveis em qualquer status, marca "Editada em" quando
a alteração é posterior à emissão, PDF regerado sobre o caminho publicado,
WhatsApp, transições de status e *Duplicar como nova OS*.

## 7. Código removido

`src/data/clientes.js`, `src/data/veiculos.js`, `src/clientes/` inteiro
(`ListaClientes`, `FichaCliente`, `FormCliente`, `SelecionarCliente`),
`src/veiculos/` inteiro (`ListaVeiculos`, `FichaVeiculo`, `FormVeiculo`), e os
testes de `descricaoVeiculo`.

`descricaoVeiculo` deixa de existir: a descrição do veículo passa a ser digitada,
não montada a partir de marca, modelo, ano e cor.

## 8. Fora de escopo

**A ficha do veículo não volta agora.** A tela que mostrava todas as OS de um
carro com o status de cada garantia some junto com o cadastro. O histórico com
busca por placa cobre a maior parte do que ela fazia.

Se fizer falta, ela pode voltar depois sem cadastro nenhum — agrupando as OS
pela placa na tela de Histórico. Fica mais simples do que era. Não entra agora
para não inchar a mudança.

Continuam fora: catálogo de preços, assinatura na tela, estoque, financeiro,
emissão fiscal, agendamento, permissões por funcionário e sincronização offline.

## 9. Testes

O que já existe e continua valendo: dinheiro, placa, datas, garantia, status,
telefone, validação de itens, marca de edição, o documento PDF e o schema em
PGlite.

Entra:

- `ultimaOsDaPlaca` e `ultimaOsFinalizadaDaPlaca` — incluindo placa sem
  histórico, placa escrita de outro jeito, e OS cancelada não servindo de
  sugestão.
- A migration `0006` aplicada sobre o schema anterior, no teste de schema.
- O fluxo do modo demonstração, que precisa acompanhar a mudança.

## 10. Riscos

| Risco | Mitigação |
|---|---|
| Mesmo cliente digitado de formas diferentes não se agrupa | A busca é por placa, que é a chave estável; o nome é só o que vai impresso |
| Garantia contada da data da OS, não da conclusão | O campo é editável, e as duas datas quase sempre coincidem |
| Perda da ficha do veículo | Reconhecida; volta depois pelo histórico agrupado por placa, se fizer falta |
| Mais digitação por OS | A sugestão por placa devolve nome, telefone e veículo da última vez em um toque |
