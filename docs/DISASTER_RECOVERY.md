# Disaster Recovery — Tigrão Tradein

Guia de recuperação se alguma das plataformas que a gente depende quebrar.

## Plataformas críticas e risco

| Plataforma | O que guarda | Risco se sumir | Backup atual |
|------------|--------------|----------------|--------------|
| **Supabase** | Banco de dados (clientes, pedidos, links, estoque, trade-ins) | **CRÍTICO** — perde tudo | ✅ GitHub Actions diário |
| **GitHub** | Código-fonte, migrations SQL | Alto — perde histórico | ⚠️ Espelhar em GitLab (TODO) |
| **Vercel** | Deploy, variáveis de ambiente, logs | Médio — redeploy manual em outra plataforma | Código tá no GitHub |
| **Z-API** | Nada permanente (só proxy WhatsApp) | Baixo — trocar de provider | N/A |
| **Mercado Pago** | Histórico de pagamentos | Baixo — MP tem dashboard próprio | Backup do webhook ficou no Supabase |
| **ERP (externo)** | Estoque físico, notas fiscais | Médio — falar com fornecedor | Responsabilidade do ERP |

---

## 1. Backup do Supabase (automático)

### Como funciona
- GitHub Action roda todo dia às **03:00 BRT** (06:00 UTC)
- Gera `pg_dump` completo do schema `public` (tabelas + dados)
- Salva como artifact por **90 dias**
- Zero custo (incluído no GitHub free tier)

### Setup inicial (rodar 1 vez)

**1. Pegar connection string do Supabase:**
- Supabase dashboard → Project Settings → Database
- Seção **Connection string** → aba **URI**
- **Desmarcar** "Use connection pooling" (queremos direct connection pro pg_dump)
- Copiar URL, formato:
  ```
  postgresql://postgres:[SUA-SENHA]@db.[PROJETO].supabase.co:5432/postgres
  ```

**2. Adicionar como secret no GitHub:**
- GitHub repo → Settings → Secrets and variables → Actions → New repository secret
- Nome: `SUPABASE_DB_URL`
- Valor: a connection string completa
- Salvar

**3. Testar:**
- GitHub repo → Actions → **Backup Supabase** → **Run workflow** (botão manual)
- Esperar ~2-5 min
- Verificar que rodou verde e tem um artifact listado
- Baixar o `.sql.gz` e confirmar que abre (ex: `gunzip -t arquivo.sql.gz`)

### Download de um backup
1. GitHub repo → **Actions**
2. Workflow **Backup Supabase**
3. Clicar num run recente (preferir o último que rodou com sucesso)
4. Scroll pra baixo → seção **Artifacts**
5. Baixar o `.zip` (contém o `.sql.gz`)

---

## 2. Restore do Supabase

**⚠️ DESTRUTIVO.** O dump tem `DROP TABLE ... IF EXISTS` antes de cada `CREATE TABLE`, então vai apagar as tabelas atuais do schema `public` e recriar do zero.

Só restaurar em caso de perda real. Pra investigação/debug, criar um projeto Supabase separado de teste e restaurar lá.

### Opção A: Restaurar no Supabase (produção)

```bash
# 1. Baixar o artifact e extrair
unzip supabase_backup_20260415_060000.zip
gunzip supabase_backup_20260415_060000.sql.gz

# 2. Pegar connection string (mesma do secret)
export DB_URL="postgresql://postgres:[SENHA]@db.[PROJETO].supabase.co:5432/postgres"

# 3. Restaurar
psql "$DB_URL" < supabase_backup_20260415_060000.sql
```

### Opção B: Restaurar em projeto novo (recovery)

Se o projeto Supabase inteiro sumiu:

1. Criar projeto novo no Supabase
2. Pegar a nova connection string
3. Rodar `psql "$NOVA_DB_URL" < backup.sql`
4. Atualizar env vars no Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Redeployar no Vercel

### Validação pós-restore

Rodar no SQL editor do Supabase:

```sql
-- Conta registros nas tabelas principais
SELECT 'link_compras' AS tabela, COUNT(*) FROM link_compras
UNION ALL SELECT 'produtos', COUNT(*) FROM produtos
UNION ALL SELECT 'clientes', COUNT(*) FROM clientes
UNION ALL SELECT 'tradein_perguntas', COUNT(*) FROM tradein_perguntas
UNION ALL SELECT 'avaliacao_usados', COUNT(*) FROM avaliacao_usados
UNION ALL SELECT 'simulacoes', COUNT(*) FROM simulacoes;
```

Comparar com o que era esperado. Se bater, sistema voltou.

---

## 3. Se o GitHub sumir

Hoje dependemos 100% do GitHub pra código + backups.

### Ações imediatas
1. Ter um **clone local atualizado** do repo (rodar `git pull` regularmente)
2. Configurar **mirror no GitLab** como fallback (TODO)
3. Os backups que já tinham sido baixados continuam válidos

### Prevenção (TODO)
- [ ] Criar conta no GitLab e configurar mirror automático
- [ ] Todo dia, `git fetch --all` do repo em um drive externo

---

## 4. Se o Vercel sumir

Cenário relativamente tranquilo, porque:
- Código-fonte está no GitHub (ou clone local)
- Banco está no Supabase (ou backup)
- Env vars críticos documentados abaixo

### Plataformas alternativas
- **Railway** — equivalente funcional, suporta Next.js App Router
- **Render** — similar
- **Netlify** — suporta Next.js mas com algumas limitações de API routes

### Env vars que precisam ser reconfigurados
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
MP_ACCESS_TOKEN
MP_PUBLIC_KEY
ZAPI_INSTANCE_ID
ZAPI_TOKEN
ZAPI_CLIENT_TOKEN
ADMIN_PASSWORD
```

(Lista completa: olhar `.env.local.example` ou `next.config.ts`)

---

## 5. Se a Z-API sumir

Impacto baixo — só afeta notificações automáticas via WhatsApp:
- Webhooks de MP (notificação pro grupo)
- Follow-ups de leads
- Alertas de preço

### Alternativas
- **Meta WhatsApp Business API** (oficial, mas mais burocrático)
- **Twilio WhatsApp API**
- **Wassenger**
- **Evolution API** (self-hosted)

O código concentra toda integração em `lib/zapi.ts` — substituir provider é trocar esse arquivo.

---

## Checklist mensal

Pra garantir que o backup funciona de verdade, 1x por mês:

- [ ] Baixar o último artifact do GitHub Actions
- [ ] `gunzip -t arquivo.sql.gz` → sai sem erro
- [ ] Abrir num editor e conferir que tem CREATE TABLE das tabelas principais
- [ ] Bonus: subir num Supabase de teste e rodar as queries de validação

**Um backup que você nunca testou é um backup que você não tem.**

---

## Histórico de recuperação

Se rolar algum incidente real, documentar aqui:

| Data | Evento | Ação | Tempo de recovery |
|------|--------|------|-------------------|
| — | — | — | — |
