create extension if not exists pgcrypto;

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
