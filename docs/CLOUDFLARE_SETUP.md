# Cloudflare na frente do Vercel (escudo grátis)

## Por que
Cloudflare Free fica como proxy entre o mundo e o Vercel:
- **DDoS protection automático** — bloqueia floods sem custo extra (Vercel cobra por bandwidth excedida)
- **WAF básico + Bot Fight Mode** — filtra tráfego malicioso antes de chegar no nosso Next.js
- **Cache estático** — alivia o Vercel em ativos (imagens, JS, CSS)
- **Analytics** — vê quem tá acessando de onde, sem Google Analytics
- **Rate limiting no edge** — complementa nosso rate-limit em memória
- **Page Rules** — redirecionamentos, HTTPS forçado, headers customizados

Custo: **zero** (plano Free cobre tudo que a gente precisa).

---

## Pré-requisito
Ter acesso ao registrador do domínio `tigraoimports.com.br` (Registro.br) pra trocar nameservers.

---

## Passo 1 — Criar conta no Cloudflare

1. Ir em https://cloudflare.com e criar conta (e-mail + senha).
2. Validar e-mail.

---

## Passo 2 — Adicionar o domínio

1. No dashboard Cloudflare, clicar em **Add a site**.
2. Digitar `tigraoimports.com.br` → **Continue**.
3. Escolher plano **Free** → **Continue**.
4. Cloudflare vai escanear os DNS records atuais e importar automaticamente.
5. **Revisar os records importados** — tem que ter no mínimo:
   - `A` ou `CNAME` apontando pro Vercel (ex: `cname.vercel-dns.com`)
   - Registros MX (se tiver e-mail corporativo)
   - TXT (SPF/DKIM se tiver e-mail)
6. **Importante:** deixar o proxy (nuvem laranja 🧡) ativo nos records que apontam pra Vercel. Nos MX/TXT, deixar cinza (DNS only).

---

## Passo 3 — Trocar nameservers no Registro.br

Cloudflare vai mostrar 2 nameservers (ex: `kate.ns.cloudflare.com` e `paul.ns.cloudflare.com`).

1. Entrar em https://registro.br e logar.
2. Achar o domínio `tigraoimports.com.br` → **Alterar servidores DNS**.
3. Substituir os nameservers atuais pelos que o Cloudflare forneceu.
4. Salvar.
5. Voltar pro Cloudflare → **Done, check nameservers**.

**Propagação:** até 24h, mas normalmente resolve em 10–30 min. Dá pra verificar em https://www.whatsmydns.net.

---

## Passo 4 — Ajustar Vercel

1. Vercel → Project Settings → Domains.
2. Se o domínio `tigraoimports.com.br` estiver listado com verificação TXT/A, manter. Cloudflare vai gerenciar o DNS mas o Vercel precisa do domínio registrado.
3. **IMPORTANT:** SSL deve ficar **Full (strict)** no Cloudflare (próximo passo) — Vercel já emite HTTPS válido pelo Let's Encrypt.

---

## Passo 5 — Configurações mínimas de segurança no Cloudflare

### SSL/TLS
1. Menu esquerdo → **SSL/TLS** → **Overview**.
2. Trocar pra **Full (strict)** — criptografa Cloudflare ↔ Vercel usando o cert válido do Vercel.

### Edge Certificates
1. **SSL/TLS** → **Edge Certificates**.
2. Ativar:
   - ✅ **Always Use HTTPS**
   - ✅ **Automatic HTTPS Rewrites**
   - ✅ **HTTP Strict Transport Security (HSTS)** — max-age 6 meses pra começar

### Security
1. Menu esquerdo → **Security** → **Settings**.
2. **Security Level:** `Medium` (padrão) — suficiente pro começo.
3. **Bot Fight Mode:** ✅ **ativar** (bloqueia bots conhecidos gratuitamente).
4. **Challenge Passage:** 30 min (padrão).

### WAF
1. **Security** → **WAF** → **Managed Rules**.
2. No Free, já vem `Cloudflare Free Managed Ruleset` ativo — não precisa mexer.

### Rate Limiting (opcional mas recomendado)
1. **Security** → **WAF** → **Rate limiting rules** → **Create rule**.
2. Sugestão:
   - **Rule name:** `api-rate-limit`
   - **If incoming requests match:** URI Path contains `/api/`
   - **Characteristics:** IP Address
   - **Requests:** 100 per 1 minute
   - **Then:** Block
3. Salvar e deployar.

### Speed (cache)
1. Menu esquerdo → **Caching** → **Configuration**.
2. **Browser Cache TTL:** `Respect Existing Headers` (o Next.js já define headers corretos).
3. **Crawler Hints:** ✅ ativar.

---

## Passo 6 — Validar

1. Abrir `https://tigraoimports.com.br` em aba anônima.
2. Inspecionar resposta (DevTools → Network → qualquer request → Headers).
3. Deve aparecer header `cf-ray` e `server: cloudflare` → **proxy funcionando**.
4. Testar `/troca` e `/compra` — fluxo completo, verificar que pedido chega no Supabase.

---

## Passo 7 — Monitoramento

1. **Analytics & Logs** → **Traffic** — ver volume, top URLs, países.
2. **Security** → **Events** — ver bots bloqueados, WAF actions.
3. Recomendação: abrir 1× por semana pra checar se não tem tráfego suspeito.

---

## Rollback (se der ruim)

1. Voltar nameservers originais no Registro.br (Cloudflare mostra os antigos no onboarding — anotar antes de trocar!).
2. Ou no Cloudflare: desativar o proxy (trocar nuvem laranja pra cinza) nos records — vira só DNS, sem proxy.

---

## Uso em emergência

### Vercel fora do ar
1. Cloudflare → DNS → trocar o CNAME do Vercel por outro provider (ex: Netlify backup deploy).
2. Propaga em minutos (TTL baixo do Cloudflare).

### Ataque DDoS em andamento
1. Cloudflare → Security → **Under Attack Mode** (canto superior direito).
2. Cada visitante passa por um challenge JavaScript de 5 segundos — bloqueia quase tudo que não é humano.
3. Desativar depois que o ataque passar.

---

## Manutenção

- **Nada automático a fazer** — Cloudflare Free não expira.
- **Renovar domínio no Registro.br** normalmente.
- **Revisar Security Events** 1× por mês pra ajustar regras se necessário.
