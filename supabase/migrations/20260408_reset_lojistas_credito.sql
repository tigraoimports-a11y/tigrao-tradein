-- Reset dos saldos de crédito de lojistas — dado corrompido por bug anterior
-- que aplicava o mesmo saldo pra múltiplos lojistas. Depois de rodar, readicionar
-- manualmente o saldo correto no modal "Gerenciar crédito".

delete from lojistas_credito_log;
delete from lojistas_credito;
