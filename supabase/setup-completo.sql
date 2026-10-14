-- Mizuho OS - banco completo, para colar no SQL Editor do Supabase.
-- Equivale a aplicar as migrations 0001 a 0011, em ordem. Rode uma vez so.

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


-- ====== 0008_perfis_e_acesso.sql ======
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

-- ---------------------------------------------------------------------------
-- 6. Campos que so o sistema escreve, e quem nao pode criar OS nao gasta numero
--
-- A policy os_upd libera qualquer coluna a usuario ativo, e o historico so
-- registra uma lista de campos. Sem esta trava, quem chamasse a API direto
-- trocava o total (que vai para o PDF e o WhatsApp) ou o numero da OS sem
-- deixar rastro, e travava a numeracao do administrador com um numero alto.
--
-- A decisao e pelo PAPEL de quem escreve (como em proteger_aceite): as funcoes
-- do sistema rodam como dono e passam; a escrita direta pela API e
-- authenticated ou anon. Funcao invoker, de proposito: current_user precisa ser
-- o de quem chamou.
--
-- O nome faz o gatilho disparar ANTES do da numeracao (ordens_atribui_numero):
-- assim o numero ainda nao foi atribuido (nao da para distinguir o do cliente
-- do do sistema depois) e a sequencia nao anda para quem sera recusado. O RLS
-- so confere o WITH CHECK depois dos gatilhos BEFORE, e por isso o nextval
-- rodava mesmo para o insert que o RLS recusaria.
-- ---------------------------------------------------------------------------
create or replace function proteger_campos_da_os() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  externo boolean := current_user in ('anon', 'authenticated', 'authenticator');
begin
  if not externo then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Dois ifs, e nao um `or`: o Postgres nao garante a ordem de avaliacao, e
    -- anon nem tem permissao de executar usuario_ativo().
    if current_user = 'anon' then
      raise exception 'acesso_negado';
    end if;
    if not usuario_ativo() then
      raise exception 'acesso_negado';
    end if;
    if new.numero is not null
       or new.total_centavos <> 0
       or (new.criado_por is not null and new.criado_por is distinct from auth.uid()) then
      raise exception 'campo_protegido: numero, total e autor so mudam pelo sistema';
    end if;
    return new;
  end if;

  if (new.numero, new.total_centavos, new.criado_por)
     is distinct from (old.numero, old.total_centavos, old.criado_por) then
    raise exception 'campo_protegido: numero, total e autor so mudam pelo sistema';
  end if;
  return new;
end $$;

create trigger ordens_a_protege_campos
before insert or update on ordens_servico
for each row execute function proteger_campos_da_os();

revoke execute on function proteger_campos_da_os() from public, anon, authenticated;

-- Cancelar devolve o numero a fila, e isso e uma escrita em `numero`: passa a
-- rodar como dono (security definer) e a conferir o usuario por conta propria.
-- Antes era security invoker e dependia do RLS para recusar o bloqueado.
create or replace function cancelar_os(p_os_id uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_numero bigint;
  v_status text;
  v_seq    bigint;
begin
  if not usuario_ativo() then
    raise exception 'acesso_negado';
  end if;

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


-- ====== 0009_gestao_de_usuarios.sql ======
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


-- ====== 0010_historico_de_atividade.sql ======
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


-- ====== 0011_fechar_listagem_de_pdfs.sql ======
-- Fecha a listagem publica do bucket dos PDFs.
--
-- A politica pdf_le_publico (0003) deixava qualquer visitante, so com a chave
-- publica que vai no JavaScript do site, LISTAR o bucket os-pdfs. Com a lista
-- vinham os caminhos (uuid da OS) de todos os documentos, e o caminho era a
-- unica coisa que protegia cada PDF.
--
-- O link que vai por WhatsApp nao depende desta politica: o bucket e publico, e
-- o Supabase serve o arquivo pelo endereco direto sem consultar o RLS. O que
-- some e so a listagem. Quem tem o link completo continua abrindo o PDF.
--
-- Usuario ativo mantem a leitura porque o app regrava o PDF (upsert), e o
-- upsert precisa enxergar o arquivo existente.

drop policy if exists pdf_le_publico on storage.objects;

create policy pdf_le on storage.objects for select to authenticated
  using (bucket_id = 'os-pdfs' and (select usuario_ativo()));

