# /public/images — Assets visuais da landing /troca

Este diretorio guarda imagens usadas na landing inicial do simulador de
trade-in (`/troca`). Suba os arquivos aqui via Git (commit + push) ou via
upload no GitHub.

## Imagens esperadas

### `andre.jpg` (logo/avatar — OBRIGATORIO pra landing ficar bonita)
- **O que e:** foto pessoal do Andre que serve de "logo" da TigraoImports
  (mesma usada no perfil do Instagram da loja).
- **Onde aparece:** avatar circular de 48px no topo da landing /troca, ao
  lado do nome "TigrãoImports".
- **Especificacao:** quadrada (1:1), minimo 200x200px, JPEG ou PNG, foco
  no rosto. Sera cortada em circulo automaticamente.
- **Fallback:** se o arquivo nao existir, mostra emoji 🐯 (tigre da marca).

### `influencer-1.jpg`, `influencer-2.jpg`, `influencer-3.jpg` (opcional)
- **O que sao:** fotos do Andre AO LADO de cada influencer no momento da
  compra na loja. Sao social proof real — clientes "famosos" da marca.
- **Onde aparecem:** secao "Quem comprou aqui" na landing, abaixo do CTA
  e dos trust badges.
- **Especificacao:** quadrada (1:1), minimo 200x200px. Crop automatico
  em circulo de 64px.
- **Pra ativar a secao:** depois de subir as 3 fotos, editar
  `components/TradeInCalculatorMulti.tsx` linha ~50 (constante
  `INFLUENCERS_LANDING`) e descomentar os items, preenchendo `@handle`
  de cada influencer.
- **IMPORTANTE:** so subir se tiver autorizacao de uso de imagem
  documentada (mensagem WhatsApp, e-mail, contrato — qualquer registro).

## Como subir

### Opcao A — Via GitHub (mais rapido pra Andre)
1. Acessar https://github.com/tigraoimports-a11y/tigrao-tradein/tree/main/public/images
2. Botao "Add file" → "Upload files"
3. Arrastar as fotos
4. Commit direto na main com mensagem "feat(landing): adiciona fotos da landing"

### Opcao B — Via Git local (Nicolas/Claude)
```bash
cp /caminho/das/fotos/*.jpg public/images/
git add public/images/
git commit -m "feat(landing): adiciona fotos da landing"
git push
```

## Apos upload das fotos

Vercel deploya automaticamente em ~30s. As imagens aparecem na landing
sem precisar mudar codigo (pra a foto do Andre). Pra os influencers,
precisa do passo extra de descomentar o array `INFLUENCERS_LANDING`.
