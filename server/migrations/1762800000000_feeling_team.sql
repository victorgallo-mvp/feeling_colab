-- Up Migration
-- Feeling: sai o time fictício do seed do piloto, entra o time real, e o Iran volta a ter as 5 moedas da semana.
-- Tudo aqui é reversível no banco (soft delete) e só toca o tenant "feeling".

-- 1. Pessoas fictícias do seed (identificadas pelo e-mail E pelo nome do seed, para nunca pegar alguém real)
create temporary table _seed_people on commit drop as
select u.id from users u join tenants t on t.id = u.tenant_id
 where t.slug = 'feeling' and u.deleted_at is null and (u.email, u.name) in (
   ('camila@feeling.com.br', 'Camila Rocha'), ('diego@feeling.com.br', 'Diego Martins'), ('ana@feeling.com.br', 'Ana Beatriz'),
   ('bruno@feeling.com.br', 'Bruno Lima'), ('carla@feeling.com.br', 'Carla Mendes'), ('eduardo@feeling.com.br', 'Eduardo Reis'),
   ('fernanda@feeling.com.br', 'Fernanda Souza'), ('gabriel@feeling.com.br', 'Gabriel Nunes'), ('helena@feeling.com.br', 'Helena Costa'),
   ('igor@feeling.com.br', 'Igor Santos'), ('juliana@feeling.com.br', 'Juliana Alves'), ('lucas@feeling.com.br', 'Lucas Ferreira'),
   ('marina@feeling.com.br', 'Marina Dias'), ('rafael@feeling.com.br', 'Rafael Oliveira'));

-- as moedas de exemplo dessas pessoas saem do feed, do ranking e dos perfis
update recognitions set deleted_at = now(), updated_at = now()
 where deleted_at is null and (giver_id in (select id from _seed_people) or receiver_id in (select id from _seed_people));
update sessions set revoked_at = now() where revoked_at is null and user_id in (select id from _seed_people);
update users set deleted_at = now(), is_active = false, updated_at = now() where id in (select id from _seed_people);

-- 2. Iran volta a ter as moedas da semana: anula o que ele deu nesta semana (teste)
update recognitions r set deleted_at = now(), updated_at = now()
  from users u join tenants t on t.id = u.tenant_id
 where r.giver_id = u.id and t.slug = 'feeling' and lower(u.email) = 'iran@feeling.com.br' and r.deleted_at is null
   and r.created_at >= (date_trunc('week', now() at time zone t.timezone) at time zone t.timezone);

-- 3. Time real. O e-mail só identifica a pessoa (o acesso é por código); estes são provisórios e editáveis no admin.
insert into users (tenant_id, email, name, role)
select t.id, v.email, v.name, 'member' from tenants t,
  (values
    ('joao.andre@sem-email.invalid', 'João André'), ('maria.tereza@sem-email.invalid', 'Maria Tereza'), ('gabriel@sem-email.invalid', 'Gabriel'),
    ('marco@sem-email.invalid', 'Marco'), ('lorena@sem-email.invalid', 'Lorena'), ('samuel@sem-email.invalid', 'Samuel'),
    ('luana@sem-email.invalid', 'Luana'), ('artur@sem-email.invalid', 'Artur'), ('nicolas@sem-email.invalid', 'Nicolas'),
    ('joao.pedro@sem-email.invalid', 'João Pedro'), ('luan@sem-email.invalid', 'Luan'), ('breno@sem-email.invalid', 'Breno'),
    ('lucas@sem-email.invalid', 'Lucas'), ('paulo@sem-email.invalid', 'Paulo'), ('guilherme@sem-email.invalid', 'Guilherme')
  ) as v(email, name)
 where t.slug = 'feeling'
   and not exists (select 1 from users u where u.tenant_id = t.id and u.deleted_at is null and lower(u.email) = v.email);

-- Down Migration
update users set deleted_at = now(), is_active = false where email like '%@sem-email.invalid' and deleted_at is null
   and tenant_id in (select id from tenants where slug = 'feeling');
