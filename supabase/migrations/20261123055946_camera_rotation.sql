-- Camera picture rotation set on the website (Operator -> camera), applied by the edge within a minute.
-- null = the edge's own config.yaml value.
alter table public.cameras add column rotate smallint check (rotate in (0, 90, 180, 270));
