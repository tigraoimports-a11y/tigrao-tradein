# Tigrão Tradein — Regras de trabalho

Documento curto de convenções para Nicolas, André e Claude trabalharem no mesmo repo sem pisar no pé.

## 🌿 Branches

- **`main`** — produção. Protegida. Só recebe código via Pull Request com aprovação.
- **`dev-nicolas`** — branch de trabalho do Nicolas. Só o Nicolas commita aqui.
- **`dev-andre`** — branch de trabalho do André. Só o André commita aqui.
- **`hotfix/<nome-curto>`** — quando precisar corrigir algo urgente em produção, sai direto da `main`.

### Fluxo diário
1. De manhã, cada um atualiza a sua branch:
   ```bash
   git checkout dev-nicolas   # ou dev-andre
   git pull origin main       # pega o que foi mergeado ontem
   ```
2. Trabalha normalmente, commitando sempre na sua branch.
3. Fim do dia:
   ```bash
   git push
   # Abre PR no GitHub: dev-nicolas → main
   # Testa no preview do Vercel (URL gerada automaticamente)
   # Aprova e mergeia
   ```
4. Depois de mergeado, pode deletar a branch e recriar limpa no dia seguinte (opcional, mas recomendado).

## 🗄️ Migrations SQL

**Regra de ouro: NUNCA rodar SQL manualmente no Supabase.**

### Como fazer mudança de banco
1. Criar arquivo em `supabase/migrations/AAAAMMDD_descricao.sql`
   - Exemplo: `20260408_add_observacao_cliente.sql`
2. Escrever o SQL normalmente (CREATE, ALTER, INSERT, etc).
3. Commitar na sua branch.
4. Deploy automático do preview do Vercel.
5. Abrir `/admin/migrations` → achar a migration **Pendente** → clicar **▶ Rodar**.
6. Confere que ficou ✅ aplicada.
7. PR → merge.

### Por que essa regra
- Histórico completo de TODAS mudanças de banco no git.
- Ninguém mais fica na dúvida "será que eu rodei isso?".
- André, Nicolas e Claude veem o mesmo estado.
- Rollback e auditoria ficam simples.

## 📝 Convenção de commits

Formato curto, em português, com tipo:
- `feat: ...` — funcionalidade nova
- `fix: ...` — correção de bug
- `refactor: ...` — mudança de código sem mudar comportamento
- `chore: ...` — arrumação, dependências, etc.
- `docs: ...` — documentação

Exemplos:
- `feat(estoque): adicionar filtro por fornecedor`
- `fix(gerar-link): cor não persistia ao adicionar produto extra`

## 🚫 O que NÃO fazer

- ❌ Commitar direto na `main`
- ❌ Rodar SQL manualmente no Supabase
- ❌ Mergear PR sem testar no preview do Vercel
- ❌ Trabalhar na branch do outro dev
- ❌ `git push --force` em qualquer branch compartilhada

## 🆘 Emergências

Se produção quebrar e precisar reverter agora:
1. No Vercel: **Deployments** → achar o último deploy que funcionou → clicar **Promote to Production**
2. Isso volta ao estado anterior em ~30 segundos.
3. Depois investiga com calma o que quebrou.

## 🤖 Trabalhando com Claude Code

- Claude só commita na branch de quem está pedindo.
- Se Nicolas pede, Claude trabalha em `dev-nicolas`.
- Se André pede, Claude trabalha em `dev-andre`.
- Claude abre PR; humano revisa e mergeia.
