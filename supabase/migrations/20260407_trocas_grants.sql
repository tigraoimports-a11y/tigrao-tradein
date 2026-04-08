-- Permissões da tabela trocas (estava dando "permission denied for table trocas")
GRANT ALL ON trocas TO postgres, service_role, authenticated, anon;
ALTER TABLE trocas DISABLE ROW LEVEL SECURITY;
