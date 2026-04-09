-- Reset dos saldos de crédito de lojistas — dado corrompido por bug anterior
-- que aplicava o mesmo saldo pra múltiplos lojistas. Depois de rodar, readicionar
-- manualmente o saldo correto no modal "Gerenciar crédito".

delete from lojistas_credito_log where id is not null;
delete from lojistas_credito where id is not null;
