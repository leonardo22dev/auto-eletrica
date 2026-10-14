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
-- Sem esta trava, ele poderia escrever um aceite que o cliente nunca deu. As
-- funcoes sinalizam a transacao com uma variavel local; nada mais a define,
-- porque o PostgREST so expoe funcoes do schema public.
-- ---------------------------------------------------------------------------
create or replace function proteger_aceite() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  via_funcao boolean := coalesce(current_setting('mizuho.via_funcao', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if not via_funcao and (
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

  if not via_funcao and (new.assinatura_codigo, new.assinatura_expira_em,
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
-- ---------------------------------------------------------------------------
create or replace function travar_itens_assinados() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_aceite timestamptz;
begin
  select aceite_em into v_aceite
    from ordens_servico
   where id = coalesce(new.os_id, old.os_id);

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

  perform set_config('mizuho.via_funcao', 'on', true);
  update ordens_servico
     set assinatura_codigo = v_codigo, assinatura_expira_em = v_expira
   where id = p_os_id;

  return jsonb_build_object('codigo', v_codigo, 'expira_em', v_expira);
end $$;

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
  p_codigo text, p_assinatura text, p_total_visto integer
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v        ordens_servico%rowtype;
  v_agora  timestamptz := now();
  v_cab    jsonb;
  v_ip     text;
  v_agente text;
begin
  if p_assinatura is null
     or length(p_assinatura) > 200000
     or p_assinatura !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' then
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

  perform set_config('mizuho.via_funcao', 'on', true);
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
revoke execute on function obter_os_para_assinatura(text)        from public;
revoke execute on function registrar_aceite(text, text, integer) from public;

grant execute on function definir_proximo_numero(bigint)        to authenticated;
grant execute on function cancelar_os(uuid)                     to authenticated;
grant execute on function substituir_itens(uuid, jsonb)         to authenticated;
grant execute on function gerar_link_assinatura(uuid, boolean)  to authenticated;
grant execute on function obter_os_para_assinatura(text)        to anon, authenticated;
grant execute on function registrar_aceite(text, text, integer) to anon, authenticated;
