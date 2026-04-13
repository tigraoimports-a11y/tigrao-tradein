-- Unificar categoria MACMINI → MAC_MINI no painel de preços
-- (Nicolas criou MACMINI manualmente; o sistema usa MAC_MINI)
UPDATE precos_venda SET categoria = 'MAC_MINI' WHERE categoria = 'MACMINI';
