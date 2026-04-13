-- Unificar todas as variantes de Mac Mini → MAC_MINI no painel de preços
-- Cobre: MACMINI (criado manualmente), MACBOOK (inferido errado), MacMini, etc.
UPDATE precos SET categoria = 'MAC_MINI' WHERE categoria = 'MACMINI';
UPDATE precos SET categoria = 'MAC_MINI' WHERE categoria = 'MacMini';
UPDATE precos SET categoria = 'MAC_MINI' WHERE categoria = 'macmini';
-- Produtos Mac Mini que foram erroneamente categorizados como MACBOOK
UPDATE precos SET categoria = 'MAC_MINI' WHERE categoria = 'MACBOOK' AND UPPER(modelo) LIKE '%MAC MINI%';
