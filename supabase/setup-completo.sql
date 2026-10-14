-- Mizuho OS - banco completo, para colar no SQL Editor do Supabase.
-- Equivale a aplicar as migrations 0001 a 0006, em ordem. Rode uma vez so.

-- ====== 0001_schema.sql ======
-- gen_random_uuid() e nativo do Postgres desde a versao 13 e o Supabase roda
-- 15 ou mais novo, entao nao ha extensao a instalar aqui.

create table configuracoes (
  id                  int primary key default 1 check (id = 1),
  razao_social        text not null,
  cnpj                text not null,
  inscricao_estadual  text,
  endereco            text not null,
  cidade_uf           text not null,
  telefone            text not null,
  email               text,
  servicos_cabecalho  text[] not null default '{}',
  texto_garantia      text not null,
  garantia_meses      int not null default 3 check (garantia_meses > 0),
  atualizado_em       timestamptz not null default now()
);

create table clientes (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (length(trim(nome)) > 0),
  telefone      text,
  email         text,
  observacoes   text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index clientes_nome_idx on clientes (lower(nome));

create table veiculos (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references clientes(id) on delete restrict,
  placa         text not null unique check (placa ~ '^[A-Z0-9]{7}$'),
  marca         text,
  modelo        text,
  ano           int check (ano between 1900 and 2200),
  cor           text,
  observacoes   text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index veiculos_cliente_idx on veiculos (cliente_id);

create sequence os_numero_seq as bigint start 1;

create table ordens_servico (
  id                uuid primary key default gen_random_uuid(),
  -- Anulavel de proposito: ao cancelar a ultima OS o numero volta para a
  -- sequence e esta linha o solta, senao a proxima OS nasceria duplicada.
  numero            bigint unique default nextval('os_numero_seq'),
  status            text not null default 'orcamento'
                    check (status in ('orcamento','aprovada','finalizada','cancelada')),
  cliente_id        uuid not null references clientes(id) on delete restrict,
  veiculo_id        uuid not null references veiculos(id) on delete restrict,
  -- Copia congelada no momento da emissao. Corrigir o cadastro do cliente
  -- hoje nao pode reescrever um documento emitido ha dois anos.
  cliente_nome      text not null,
  cliente_telefone  text,
  veiculo_descricao text not null,
  veiculo_placa     text not null,
  data_abertura     date not null default current_date,
  data_aprovacao    timestamptz,
  data_conclusao    date,
  total_centavos    int not null default 0 check (total_centavos >= 0),
  observacoes       text,
  pdf_path          text,
  pdf_gerado_em     timestamptz,
  criado_por        uuid references auth.users(id),
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);
create index ordens_veiculo_idx on ordens_servico (veiculo_id, data_abertura desc);
create index ordens_cliente_idx on ordens_servico (cliente_id);
create index ordens_status_idx  on ordens_servico (status, data_abertura desc);
create index ordens_placa_idx   on ordens_servico (veiculo_placa);
create index ordens_numero_idx  on ordens_servico (numero desc);

create table os_itens (
  id                      uuid primary key default gen_random_uuid(),
  os_id                   uuid not null references ordens_servico(id) on delete cascade,
  posicao                 int not null check (posicao > 0),
  quantidade              numeric(10,3) not null default 1 check (quantidade > 0),
  descricao               text not null check (length(trim(descricao)) > 0),
  valor_unitario_centavos int not null check (valor_unitario_centavos >= 0),
  valor_total_centavos    int not null check (valor_total_centavos >= 0),
  -- Deferrable para permitir reordenar os itens dentro de uma transacao.
  constraint os_itens_posicao_unica unique (os_id, posicao) deferrable initially deferred
);
create index os_itens_os_idx on os_itens (os_id, posicao);

-- ====== 0002_funcoes.sql ======
-- O total nunca e responsabilidade do front: o banco recalcula sozinho.
create or replace function recalcular_total_os() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare alvo uuid;
begin
  alvo := coalesce(new.os_id, old.os_id);
  update ordens_servico
     set total_centavos = coalesce(
           (select sum(valor_total_centavos) from os_itens where os_id = alvo), 0),
         atualizado_em = now()
   where id = alvo;
  return null;
end $$;

create trigger os_itens_recalcula_total
after insert or update or delete on os_itens
for each row execute function recalcular_total_os();

create or replace function tocar_atualizado_em() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

create trigger clientes_toca_atualizado before update on clientes
  for each row execute function tocar_atualizado_em();
create trigger veiculos_toca_atualizado before update on veiculos
  for each row execute function tocar_atualizado_em();
create trigger ordens_toca_atualizado before update on ordens_servico
  for each row execute function tocar_atualizado_em();

-- Cancela a OS e, se ela for a ultima emitida, devolve o numero a sequence.
-- Devolve true quando o numero foi devolvido.
create or replace function cancelar_os(p_os_id uuid) returns boolean
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_numero bigint;
  v_status text;
  v_seq    bigint;
begin
  select numero, status into v_numero, v_status
    from ordens_servico where id = p_os_id for update;

  if not found then
    raise exception 'OS % nao encontrada', p_os_id;
  end if;
  if v_status = 'cancelada' then
    return false;
  end if;

  update ordens_servico set status = 'cancelada' where id = p_os_id;

  v_seq := pg_sequence_last_value('os_numero_seq'::regclass);

  -- So devolve se esta OS for de fato a ponta da numeracao. Se outra pessoa
  -- emitiu uma OS no intervalo, a sequence ja avancou, a comparacao falha e
  -- nada e devolvido - a condicao se protege sozinha contra concorrencia.
  if v_numero is not null
     and v_seq = v_numero
     and not exists (select 1 from ordens_servico
                      where numero is not null and numero > v_numero) then
    update ordens_servico set numero = null where id = p_os_id;
    if v_numero <= 1 then
      perform setval('os_numero_seq', 1, false);
    else
      perform setval('os_numero_seq', v_numero - 1, true);
    end if;
    return true;
  end if;

  return false;
end $$;

-- Usada na tela de Configuracoes para continuar de onde o talao parou.
create or replace function definir_proximo_numero(p_numero bigint) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_numero < 1 then
    raise exception 'O proximo numero precisa ser maior que zero';
  end if;
  if exists (select 1 from ordens_servico
              where numero is not null and numero >= p_numero) then
    raise exception 'Ja existe OS com numero maior ou igual a %', p_numero;
  end if;
  perform setval('os_numero_seq', p_numero, false);
end $$;

-- ====== 0003_rls.sql ======
alter table configuracoes   enable row level security;
alter table clientes        enable row level security;
alter table veiculos        enable row level security;
alter table ordens_servico  enable row level security;
alter table os_itens        enable row level security;

-- A oficina inteira usa o mesmo nivel de acesso; o que a RLS garante e que
-- ninguem sem sessao le nada, mesmo com a chave anon em maos.
create policy conf_le  on configuracoes for select to authenticated using (true);
create policy conf_upd on configuracoes for update to authenticated
  using (true) with check (true);

create policy cli_le  on clientes for select to authenticated using (true);
create policy cli_ins on clientes for insert to authenticated with check (true);
create policy cli_upd on clientes for update to authenticated
  using (true) with check (true);

create policy vei_le  on veiculos for select to authenticated using (true);
create policy vei_ins on veiculos for insert to authenticated with check (true);
create policy vei_upd on veiculos for update to authenticated
  using (true) with check (true);

create policy os_le  on ordens_servico for select to authenticated using (true);
create policy os_ins on ordens_servico for insert to authenticated with check (true);
create policy os_upd on ordens_servico for update to authenticated
  using (true) with check (true);

create policy item_le  on os_itens for select to authenticated using (true);
create policy item_ins on os_itens for insert to authenticated with check (true);
create policy item_upd on os_itens for update to authenticated
  using (true) with check (true);
create policy item_del on os_itens for delete to authenticated using (true);

-- Sem policy de delete em clientes, veiculos e ordens_servico: documento
-- emitido e cadastro com historico nao se apagam, so se cancelam.

insert into storage.buckets (id, name, public)
values ('os-pdfs', 'os-pdfs', true)
on conflict (id) do nothing;

-- Leitura publica para que o link enviado ao cliente por WhatsApp abra sem
-- login; o caminho contem o uuid da OS, entao nao e adivinhavel.
create policy pdf_le_publico on storage.objects for select to public
  using (bucket_id = 'os-pdfs');
create policy pdf_grava on storage.objects for insert to authenticated
  with check (bucket_id = 'os-pdfs');
create policy pdf_regrava on storage.objects for update to authenticated
  using (bucket_id = 'os-pdfs') with check (bucket_id = 'os-pdfs');

-- ====== 0004_seed.sql ======
insert into configuracoes (
  id, razao_social, cnpj, inscricao_estadual, endereco, cidade_uf,
  telefone, email, servicos_cabecalho, texto_garantia, garantia_meses
) values (
  1,
  'Auto Elétrica MIZUHO II Ltda. - ME',
  '03.053.178/0001-99',
  '635.338.217.110',
  'Avenida Robert Kennedy, 3340 - Assunção',
  'São Bernardo do Campo - SP',
  '11 4355-9830',
  'autoeletricamizuhodois@gmail.com',
  array[
    'SERVIÇOS DE ELETRICIDADE EM GERAL',
    'INJEÇÃO ELETRÔNICA',
    'LIMPEZA DE BICOS',
    'ALTERNADORES',
    'PARTIDA',
    'BATERIAS'
  ],
  'GARANTIA DE 3 (TRÊS) MESES PARA PEÇAS COM DEFEITO',
  3
) on conflict (id) do nothing;

-- ====== 0005_correcoes_revisao.sql ======
-- Correcoes apontadas na revisao do branch de implementacao.

-- ---------------------------------------------------------------------------
-- 1. Substituicao de itens em uma unica transacao.
--
-- Antes o front apagava e reinseria em duas requisicoes HTTP, logo duas
-- transacoes. Se a insercao falhasse depois do delete - 4G caindo no meio do
-- salvamento, que o spec declara esperar - a OS ficava sem nenhum item e com
-- total zero. Documento emitido destruido, sem copia.
create or replace function substituir_itens(p_os_id uuid, p_itens jsonb)
returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from ordens_servico where id = p_os_id) then
    raise exception 'OS % nao encontrada', p_os_id;
  end if;

  delete from os_itens where os_id = p_os_id;

  insert into os_itens (os_id, posicao, quantidade, descricao,
                        valor_unitario_centavos, valor_total_centavos)
  select p_os_id,
         (item->>'posicao')::int,
         (item->>'quantidade')::numeric,
         item->>'descricao',
         (item->>'valor_unitario_centavos')::int,
         (item->>'valor_total_centavos')::int
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) as item;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Data de abertura no fuso da oficina.
--
-- O Supabase roda com TimeZone = UTC, e current_date segue o GUC. Uma OS
-- aberta as 21h30 de 12/08 em Sao Paulo nascia datada de 13/08, e era essa
-- data que ia impressa no documento entregue ao cliente.
alter table ordens_servico
  alter column data_abertura
  set default (now() at time zone 'America/Sao_Paulo')::date;

-- ---------------------------------------------------------------------------
-- 3. Instante da finalizacao.
--
-- data_conclusao e `date`, entao nao havia como saber se uma edicao aconteceu
-- depois da emissao no mesmo dia - justamente o caso comum de correcao, em que
-- a marca "Editada em" precisava aparecer e nao aparecia.
alter table ordens_servico add column if not exists finalizada_em timestamptz;

update ordens_servico
   set finalizada_em = data_conclusao::timestamptz
 where status = 'finalizada' and finalizada_em is null and data_conclusao is not null;

-- ---------------------------------------------------------------------------
-- 4. Numeracao serializada.
--
-- nextval nao e transacional e nao trava nada: entre a leitura da ponta da
-- sequence em cancelar_os e o setval, outra sessao podia emitir uma OS. O
-- resultado era numeracao fora de ordem e, na OS seguinte, violacao de
-- unicidade chegando a tela como erro sem sentido. O lock consultivo faz as
-- duas operacoes se enfileirarem na mesma chave.
alter table ordens_servico alter column numero drop default;

create or replace function atribuir_numero_os() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.numero is null then
    perform pg_advisory_xact_lock(hashtext('os_numero_seq'));
    new.numero := nextval('os_numero_seq');
  end if;
  return new;
end $$;

drop trigger if exists ordens_atribui_numero on ordens_servico;
create trigger ordens_atribui_numero before insert on ordens_servico
  for each row execute function atribuir_numero_os();

create or replace function cancelar_os(p_os_id uuid) returns boolean
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_numero bigint;
  v_status text;
  v_seq    bigint;
begin
  -- Mesma chave do gatilho de numeracao: cancelamento e emissao nao correm
  -- juntos.
  perform pg_advisory_xact_lock(hashtext('os_numero_seq'));

  select numero, status into v_numero, v_status
    from ordens_servico where id = p_os_id for update;

  if not found then
    raise exception 'OS % nao encontrada', p_os_id;
  end if;
  if v_status = 'cancelada' then
    return false;
  end if;

  update ordens_servico set status = 'cancelada' where id = p_os_id;

  v_seq := pg_sequence_last_value('os_numero_seq'::regclass);

  if v_numero is not null
     and v_seq = v_numero
     and not exists (select 1 from ordens_servico
                      where numero is not null and numero > v_numero) then
    update ordens_servico set numero = null where id = p_os_id;
    if v_numero <= 1 then
      perform setval('os_numero_seq', 1, false);
    else
      perform setval('os_numero_seq', v_numero - 1, true);
    end if;
    return true;
  end if;

  return false;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Carimbo de atualizacao nas configuracoes, que nenhum gatilho tocava.
create trigger configuracoes_toca_atualizado before update on configuracoes
  for each row execute function tocar_atualizado_em();

-- ====== 0006_os_sem_cadastro.sql ======
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

