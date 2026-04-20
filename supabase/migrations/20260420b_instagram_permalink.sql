-- Adiciona coluna pro link publico do post (salvo depois de publicar via Graph API).
alter table instagram_posts
  add column if not exists instagram_permalink text;
