-- Fix FONTE APPLE 20W: serial C4H42449MPUQ8YQAW aparecendo com qnt=20, deve ser 1
UPDATE estoque
   SET qnt = 1,
       updated_at = NOW()
 WHERE serial_no = 'C4H42449MPUQ8YQAW';
