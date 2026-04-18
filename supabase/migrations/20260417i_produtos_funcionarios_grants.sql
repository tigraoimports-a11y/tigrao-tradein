-- Concede privilegios nas tabelas de produtos_funcionarios
-- (a primeira migration criou as tabelas mas nao liberou acesso via API)

GRANT ALL ON produtos_funcionarios TO anon, authenticated, service_role;
GRANT ALL ON produtos_funcionarios_pagamentos TO anon, authenticated, service_role;

-- Desabilita RLS (tabelas admin-only — o acesso ja eh controlado pela API
-- que valida o x-admin-password antes de qualquer operacao).
ALTER TABLE produtos_funcionarios DISABLE ROW LEVEL SECURITY;
ALTER TABLE produtos_funcionarios_pagamentos DISABLE ROW LEVEL SECURITY;
