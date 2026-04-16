# Espelho do repo no GitLab (contingência pra GitHub cair)

## Por que
Se o GitHub cair ou suspender a conta, perdemos código, histórico e Actions (inclusive o backup diário do Supabase). Um espelho automático no GitLab garante que o código fica vivo em outro lugar — a qualquer momento podemos apontar o Vercel pra lá ou clonar e continuar trabalhando.

Custo: **zero** (GitLab Free é suficiente).
Manutenção: **zero** (push automático via GitHub Actions a cada push em `main`).

---

## Passo 1 — Criar conta e projeto no GitLab

1. Entrar em https://gitlab.com e criar conta (pode usar e-mail do Google/GitHub).
2. Clicar em **New project** → **Create blank project**.
3. Preencher:
   - **Project name:** `tigrao-tradein`
   - **Project URL:** deixar o namespace padrão (seu usuário)
   - **Visibility Level:** `Private`
   - **Initialize repository with a README:** ❌ **DESMARCAR** (importante — vamos empurrar o histórico do GitHub)
4. Clicar em **Create project**.
5. Anotar a URL do projeto (ex: `https://gitlab.com/SEU_USUARIO/tigrao-tradein`).

---

## Passo 2 — Criar token de acesso no GitLab

1. No GitLab, canto superior direito → seu avatar → **Edit profile**.
2. Menu esquerdo → **Access tokens** → **Add new token**.
3. Preencher:
   - **Token name:** `github-actions-mirror`
   - **Expiration date:** 1 ano (anotar na agenda pra renovar)
   - **Scopes:** marcar somente `write_repository`
4. Clicar em **Create personal access token**.
5. **Copiar o token imediatamente** (formato `glpat-xxxxxxxxxxxx`) — ele só aparece uma vez.

---

## Passo 3 — Adicionar segredos no GitHub

1. Ir em https://github.com/tigraoimports-a11y/tigrao-tradein/settings/secrets/actions
2. Clicar em **New repository secret** e criar os dois:

   | Name | Value |
   |------|-------|
   | `GITLAB_MIRROR_URL` | `https://gitlab.com/SEU_USUARIO/tigrao-tradein.git` |
   | `GITLAB_TOKEN` | o token que você copiou no passo 2 |

---

## Passo 4 — Criar o workflow de espelho

Criar o arquivo `.github/workflows/mirror-gitlab.yml` com esse conteúdo:

```yaml
name: Mirror to GitLab

on:
  push:
    branches:
      - main
  workflow_dispatch:

jobs:
  mirror:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout (full history)
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Push to GitLab mirror
        env:
          GITLAB_MIRROR_URL: ${{ secrets.GITLAB_MIRROR_URL }}
          GITLAB_TOKEN: ${{ secrets.GITLAB_TOKEN }}
        run: |
          if [ -z "$GITLAB_MIRROR_URL" ] || [ -z "$GITLAB_TOKEN" ]; then
            echo "❌ GITLAB_MIRROR_URL ou GITLAB_TOKEN não configurados"
            exit 1
          fi
          # Monta URL com token embutido (oauth2 user)
          AUTH_URL=$(echo "$GITLAB_MIRROR_URL" | sed "s|https://|https://oauth2:${GITLAB_TOKEN}@|")
          git remote add gitlab "$AUTH_URL"
          git push gitlab main --force
          echo "✅ Mirror atualizado em GitLab"
```

Commitar e mergear normalmente.

---

## Passo 5 — Verificar

1. Depois do primeiro push em `main` pós-merge, ir em **Actions** no GitHub.
2. Achar a run **Mirror to GitLab** — deve ficar verde.
3. Abrir o GitLab → projeto `tigrao-tradein` → conferir que o código apareceu com todo o histórico.

---

## Uso em emergência

### GitHub fora do ar / conta suspensa

1. **Clone local:** `git clone https://gitlab.com/SEU_USUARIO/tigrao-tradein.git`
2. **Reapontar Vercel:**
   - Vercel → Project Settings → Git → **Disconnect**
   - Conectar novo repo, dessa vez via GitLab
   - Vercel tem integração nativa com GitLab (mesmo fluxo do GitHub)
3. **Recriar branches de trabalho:** `git push -u origin dev-andre dev-nicolas`

### Voltar pro GitHub depois

1. Quando GitHub voltar, fazer push de volta: `git push github main --force` (com GitHub adicionado como remote)
2. Ou: usar o mirror oficial do GitLab (Settings → Repository → Mirroring repositories) apontando pro GitHub

---

## Manutenção

- **Renovar token:** 1 ano após criação (GitLab envia e-mail de aviso). Gerar novo token, atualizar secret `GITLAB_TOKEN` no GitHub.
- **Se o espelho falhar:** checar Actions → **Mirror to GitLab** logs. Causa comum: token expirou ou escopo errado.
