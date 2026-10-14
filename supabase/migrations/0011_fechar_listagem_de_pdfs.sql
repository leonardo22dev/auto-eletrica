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
