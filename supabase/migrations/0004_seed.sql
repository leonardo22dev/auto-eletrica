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
