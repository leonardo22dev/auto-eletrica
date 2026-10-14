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
