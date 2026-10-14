-- Mizuho OS - banco completo, para colar no SQL Editor do Supabase.
-- Equivale a aplicar as migrations 0001 a 0007, em ordem. Rode uma vez so.

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

-- ====== 0007_assinatura_do_cliente.sql ======
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
-- Sem esta trava, ele poderia escrever um aceite que o cliente nunca deu.
--
-- A decisao e pelo PAPEL de quem escreve, nao por um sinalizador de transacao.
-- Um sinalizador ligado por uma funcao dura ate o fim da transacao, e o GraphQL
-- do Supabase roda as mutations de uma requisicao numa transacao so: o usuario
-- chamava a funcao e, na mutation seguinte, escrevia o aceite direto. Ja
-- current_user, dentro de uma funcao security definer, e o dono da funcao; na
-- escrita direta pela API e anon, authenticated ou authenticator. Isso nao se
-- forja por requisicao nenhuma.
-- ---------------------------------------------------------------------------
create or replace function proteger_aceite() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  externo boolean := current_user in ('anon', 'authenticated', 'authenticator');
begin
  if tg_op = 'INSERT' then
    if externo and (
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

  if externo and (new.assinatura_codigo, new.assinatura_expira_em,
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
--
-- Duas lacunas que a revisao apontou, fechadas aqui:
--  * mover o item para outra OS: a trava olhava so a OS de destino, entao um
--    item saia de uma OS assinada e ela ficava com total sem itens. Item nao
--    muda de OS.
--  * leitura do aceite sem lock: um item podia mudar nos milissegundos entre
--    o aceite ser lido e gravado. `for update` serializa com registrar_aceite
--    e entre os proprios editores de itens (mesma ordem de lock, sem deadlock).
-- ---------------------------------------------------------------------------
create or replace function travar_itens_assinados() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_aceite timestamptz;
begin
  if tg_op = 'UPDATE' and new.os_id is distinct from old.os_id then
    raise exception 'item nao pode mudar de OS';
  end if;

  select aceite_em into v_aceite
    from ordens_servico
   where id = coalesce(new.os_id, old.os_id)
   for update;

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
  v        ordens_servico%rowtype;
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

  update ordens_servico
     set assinatura_codigo = v_codigo, assinatura_expira_em = v_expira
   where id = p_os_id;

  return jsonb_build_object('codigo', v_codigo, 'expira_em', v_expira);
end $$;

-- ---------------------------------------------------------------------------
-- 4b. A versao do que o cliente ve
--
-- Conferir so o total deixava passar a troca de itens com o mesmo valor: o
-- cliente via "Alternador novo, R$ 300", o dono trocava para "recondicionado,
-- R$ 300", e o cliente assinava o que nunca tinha visto. A versao cobre o
-- nome, o total e cada item. Auxiliar interna: so as funcoes a chamam.
-- ---------------------------------------------------------------------------
create or replace function versao_da_os(p_os_id uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select md5(
    coalesce((select cliente_nome || '|' || total_centavos::text
                from ordens_servico where id = p_os_id), '')
    || '#' ||
    coalesce((select jsonb_agg(jsonb_build_array(
                       posicao, quantidade, descricao,
                       valor_unitario_centavos, valor_total_centavos)
                     order by posicao)::text
                from os_itens where os_id = p_os_id), '[]')
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. Ver a OS pelo codigo (visitante)
-- ---------------------------------------------------------------------------
create or replace function obter_os_para_assinatura(p_codigo text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v          ordens_servico%rowtype;
  c          configuracoes%rowtype;
  v_itens    jsonb;
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
    'versao', versao_da_os(v.id),
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
  p_codigo text, p_assinatura text, p_total_visto integer, p_versao text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v         ordens_servico%rowtype;
  v_agora   timestamptz := now();
  v_cab     jsonb;
  v_ip      text;
  v_agente  text;
  v_bytes   bytea;
  v_largura bigint;
  v_altura  bigint;
begin
  if p_assinatura is null
     or length(p_assinatura) > 200000
     or p_assinatura !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' then
    raise exception 'assinatura_invalida';
  end if;

  -- O formato por texto nao basta: o desenho e decodificado no celular do dono
  -- para gerar o PDF, e um PNG com cabecalho de 20000x20000 cabe nos 200 mil
  -- caracteres (o deflate chega a 1000:1) e descomprime em centenas de MB.
  -- Confere a assinatura de 8 bytes e as dimensoes do cabecalho IHDR.
  begin
    v_bytes := decode(substr(p_assinatura, 23), 'base64');
  exception when others then
    raise exception 'assinatura_invalida';
  end;
  if length(v_bytes) < 24
     or substring(v_bytes from 1 for 8) <> '\x89504e470d0a1a0a'::bytea then
    raise exception 'assinatura_invalida';
  end if;
  v_largura := get_byte(v_bytes, 16)::bigint * 16777216 + get_byte(v_bytes, 17) * 65536
             + get_byte(v_bytes, 18) * 256 + get_byte(v_bytes, 19);
  v_altura  := get_byte(v_bytes, 20)::bigint * 16777216 + get_byte(v_bytes, 21) * 65536
             + get_byte(v_bytes, 22) * 256 + get_byte(v_bytes, 23);
  if v_largura < 1 or v_largura > 1200 or v_altura < 1 or v_altura > 600 then
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
  -- Sob o lock da linha, itens e nome nao mudam entre esta leitura e o update.
  if p_versao is distinct from versao_da_os(v.id) then
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
revoke execute on function obter_os_para_assinatura(text)               from public;
revoke execute on function registrar_aceite(text, text, integer, text)   from public;
-- Auxiliar interna: so as funcoes security definer a chamam, como dono.
revoke execute on function versao_da_os(uuid) from public, anon, authenticated;

grant execute on function definir_proximo_numero(bigint)                to authenticated;
grant execute on function cancelar_os(uuid)                             to authenticated;
grant execute on function substituir_itens(uuid, jsonb)                 to authenticated;
grant execute on function gerar_link_assinatura(uuid, boolean)          to authenticated;
grant execute on function obter_os_para_assinatura(text)                to anon, authenticated;
grant execute on function registrar_aceite(text, text, integer, text)   to anon, authenticated;

-- O Supabase continua concedendo EXECUTE a anon em toda funcao nova do schema
-- public. Sem isto, a proxima migration reabriria o mesmo buraco sem ninguem
-- perceber: cada funcao futura precisa de um grant explicito.
alter default privileges in schema public revoke execute on functions from public, anon;

