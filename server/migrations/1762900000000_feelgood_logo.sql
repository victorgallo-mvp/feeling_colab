-- Up Migration
-- Feeling: a marca exibida no app passa a ser o logo do programa Feel Good (cabeçalho, entrada, favicon e ícone do app instalado).
update tenants set logo_url = '/brand/feelgood/logo-light-bg.png', logo_dark_url = '/brand/feelgood/logo-dark-bg.png',
       symbol_url = '/brand/feelgood/symbol-512.png', updated_at = now()
 where slug = 'feeling';

-- Down Migration
update tenants set logo_url = '/brand/feeling/logo-light-bg.png', logo_dark_url = '/brand/feeling/logo-dark-bg.png',
       symbol_url = '/brand/feeling/symbol-512.png', updated_at = now()
 where slug = 'feeling';
