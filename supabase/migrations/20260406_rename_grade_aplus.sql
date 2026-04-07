-- Renomear tag [GRADE_APLUS] para [GRADE_A+] em estoque e vendas
UPDATE estoque SET observacao = REPLACE(observacao, '[GRADE_APLUS]', '[GRADE_A+]') WHERE observacao LIKE '%[GRADE_APLUS]%';
UPDATE vendas  SET troca_obs  = REPLACE(troca_obs,  '[GRADE_APLUS]', '[GRADE_A+]') WHERE troca_obs  LIKE '%[GRADE_APLUS]%';
UPDATE vendas  SET troca_obs2 = REPLACE(troca_obs2, '[GRADE_APLUS]', '[GRADE_A+]') WHERE troca_obs2 LIKE '%[GRADE_APLUS]%';
UPDATE vendas  SET troca_grade  = 'A+' WHERE troca_grade  = 'APLUS';
UPDATE vendas  SET troca_grade2 = 'A+' WHERE troca_grade2 = 'APLUS';
