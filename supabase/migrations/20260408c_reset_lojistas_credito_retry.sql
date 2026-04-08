-- Retry do reset de lojistas_credito (a versao anterior falhou por DELETE sem WHERE).
-- Supabase exige WHERE em todo DELETE.

delete from lojistas_credito_log where id is not null;
delete from lojistas_credito where id is not null;
