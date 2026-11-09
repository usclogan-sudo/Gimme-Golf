-- Gimme staging seed.
--
-- Idempotent: every statement is insert ... on conflict do nothing, so running it
-- twice changes nothing. Meant for a staging or local database only; the
-- scripts/seed-staging.sh wrapper refuses the production project ref.
--
-- Contents
--   three accounts on example.com (organizer, joiner, admin) with fixed uuids
--   eight guests on the organizer's roster, handicaps +3 2 8 12 14 18 22 28
--   the shared course catalogue from src/data/venturaCourses.ts
--   two game presets
--   one finished Skins round with buy ins and settlement rows
--   one open Wolf round on hole 7 with six holes of picks recorded
--   one event with two groups of four
--
-- Fixed ids make the data addressable from tests and from the SQL editor:
--   organizer 00000000-0000-4000-8000-000000000001  organizer@example.com
--   joiner    00000000-0000-4000-8000-000000000002  joiner@example.com
--   admin     00000000-0000-4000-8000-000000000003  admin@example.com
--   password for all three: staging-pass-123
--   rounds    seed-round-skins, seed-round-wolf, seed-round-event
--   event     seed-event-1 (code SEEDEV); round codes SEEDSK, SEEDWF, SEEDEV
--
-- Registered users are their own player: a registered player's id is the auth
-- uuid as text, which is why there are no players rows for the three accounts.

begin;

-- ── Accounts ────────────────────────────────────────────────────────────────

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at
)
select
  v.id, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
  v.email, extensions.crypt('staging-pass-123', extensions.gen_salt('bf')), now(),
  '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, now(), now()
from (values
  ('00000000-0000-4000-8000-000000000001'::uuid, 'organizer@example.com'),
  ('00000000-0000-4000-8000-000000000002'::uuid, 'joiner@example.com'),
  ('00000000-0000-4000-8000-000000000003'::uuid, 'admin@example.com')
) as v(id, email)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
select
  v.id, v.id, jsonb_build_object('sub', v.id::text, 'email', v.email), 'email', v.id::text,
  now(), now(), now()
from (values
  ('00000000-0000-4000-8000-000000000001'::uuid, 'organizer@example.com'),
  ('00000000-0000-4000-8000-000000000002'::uuid, 'joiner@example.com'),
  ('00000000-0000-4000-8000-000000000003'::uuid, 'admin@example.com')
) as v(id, email)
on conflict do nothing;

insert into public.user_profiles (
  user_id, is_admin, admin_only, onboarding_complete, display_name, handicap_index, tee, venmo_username
) values
  ('00000000-0000-4000-8000-000000000001', false, false, true, 'Olive Organizer', 9.4,  'White', 'olive-organizer'),
  ('00000000-0000-4000-8000-000000000002', false, false, true, 'Jay Joiner',      15.2, 'White', 'jay-joiner'),
  ('00000000-0000-4000-8000-000000000003', true,  false, true, 'Ada Admin',       4.1,  'Blue',  null)
on conflict (user_id) do nothing;

-- ── Guests on the organizer's roster ────────────────────────────────────────
-- Plus handicaps are stored negative: +3 is -3.

insert into public.players (id, user_id, name, handicap_index, tee, ghin_number, is_public) values
  ('seed-guest-01', '00000000-0000-4000-8000-000000000001', 'Pat Plus',       -3,  'Blue',  '', false),
  ('seed-guest-02', '00000000-0000-4000-8000-000000000001', 'Taylor Two',      2,  'Blue',  '', false),
  ('seed-guest-03', '00000000-0000-4000-8000-000000000001', 'Eli Eight',       8,  'White', '', false),
  ('seed-guest-04', '00000000-0000-4000-8000-000000000001', 'Drew Dozen',     12,  'White', '', false),
  ('seed-guest-05', '00000000-0000-4000-8000-000000000001', 'Frankie Fourteen',14, 'White', '', false),
  ('seed-guest-06', '00000000-0000-4000-8000-000000000001', 'Em Eighteen',    18,  'White', '', false),
  ('seed-guest-07', '00000000-0000-4000-8000-000000000001', 'Toni Twentytwo', 22,  'Gold',  '', false),
  ('seed-guest-08', '00000000-0000-4000-8000-000000000001', 'Robin Rookie',   28,  'Gold',  '', false)
on conflict (id) do nothing;

-- ── Shared course catalogue (generated from src/data/venturaCourses.ts) ─────

insert into public.shared_courses (id, created_by, name, tees, holes) values (
  'seed-course-olivas-links', '00000000-0000-4000-8000-000000000003', 'Olivas Links',
  '[{"name":"Tour","rating":73,"slope":130},{"name":"Champion","rating":71.6,"slope":127},{"name":"Club","rating":69.5,"slope":121},{"name":"Players","rating":65.8,"slope":110}]'::jsonb,
  '[{"number":1,"par":4,"strokeIndex":18,"yardages":{"Tour":362,"Champion":351,"Club":308,"Players":290}},{"number":2,"par":5,"strokeIndex":4,"yardages":{"Tour":534,"Champion":529,"Club":512,"Players":464}},{"number":3,"par":4,"strokeIndex":6,"yardages":{"Tour":377,"Champion":356,"Club":333,"Players":292}},{"number":4,"par":5,"strokeIndex":8,"yardages":{"Tour":514,"Champion":510,"Club":470,"Players":457}},{"number":5,"par":3,"strokeIndex":12,"yardages":{"Tour":179,"Champion":167,"Club":132,"Players":106}},{"number":6,"par":4,"strokeIndex":2,"yardages":{"Tour":437,"Champion":420,"Club":364,"Players":324}},{"number":7,"par":4,"strokeIndex":14,"yardages":{"Tour":408,"Champion":395,"Club":382,"Players":331}},{"number":8,"par":3,"strokeIndex":10,"yardages":{"Tour":185,"Champion":164,"Club":145,"Players":115}},{"number":9,"par":4,"strokeIndex":16,"yardages":{"Tour":354,"Champion":344,"Club":327,"Players":255}},{"number":10,"par":4,"strokeIndex":11,"yardages":{"Tour":407,"Champion":381,"Club":320,"Players":292}},{"number":11,"par":4,"strokeIndex":5,"yardages":{"Tour":424,"Champion":378,"Club":370,"Players":327}},{"number":12,"par":4,"strokeIndex":9,"yardages":{"Tour":376,"Champion":362,"Club":352,"Players":314}},{"number":13,"par":3,"strokeIndex":7,"yardages":{"Tour":201,"Champion":171,"Club":156,"Players":137}},{"number":14,"par":5,"strokeIndex":3,"yardages":{"Tour":563,"Champion":548,"Club":519,"Players":452}},{"number":15,"par":4,"strokeIndex":13,"yardages":{"Tour":365,"Champion":357,"Club":345,"Players":303}},{"number":16,"par":4,"strokeIndex":1,"yardages":{"Tour":479,"Champion":455,"Club":441,"Players":346}},{"number":17,"par":3,"strokeIndex":17,"yardages":{"Tour":151,"Champion":149,"Club":138,"Players":119}},{"number":18,"par":5,"strokeIndex":15,"yardages":{"Tour":502,"Champion":493,"Club":483,"Players":424}}]'::jsonb
) on conflict (id) do nothing;

insert into public.shared_courses (id, created_by, name, tees, holes) values (
  'seed-course-river-ridge-vineyard', '00000000-0000-4000-8000-000000000003', 'River Ridge – Vineyard',
  '[{"name":"Blue","rating":72.7,"slope":129},{"name":"White","rating":70.6,"slope":124},{"name":"Gold","rating":68.3,"slope":118},{"name":"Red","rating":65.2,"slope":110}]'::jsonb,
  '[{"number":1,"par":5,"strokeIndex":9,"yardages":{"Blue":554,"White":532,"Gold":478,"Red":407}},{"number":2,"par":4,"strokeIndex":3,"yardages":{"Blue":393,"White":371,"Gold":330,"Red":300}},{"number":3,"par":3,"strokeIndex":17,"yardages":{"Blue":170,"White":150,"Gold":125,"Red":105}},{"number":4,"par":4,"strokeIndex":5,"yardages":{"Blue":377,"White":350,"Gold":331,"Red":305}},{"number":5,"par":5,"strokeIndex":11,"yardages":{"Blue":502,"White":466,"Gold":453,"Red":424}},{"number":6,"par":4,"strokeIndex":15,"yardages":{"Blue":310,"White":276,"Gold":246,"Red":230}},{"number":7,"par":3,"strokeIndex":13,"yardages":{"Blue":186,"White":165,"Gold":145,"Red":127}},{"number":8,"par":4,"strokeIndex":1,"yardages":{"Blue":454,"White":425,"Gold":377,"Red":342}},{"number":9,"par":3,"strokeIndex":7,"yardages":{"Blue":187,"White":172,"Gold":160,"Red":150}},{"number":10,"par":4,"strokeIndex":4,"yardages":{"Blue":465,"White":426,"Gold":401,"Red":338}},{"number":11,"par":5,"strokeIndex":16,"yardages":{"Blue":489,"White":476,"Gold":443,"Red":399}},{"number":12,"par":3,"strokeIndex":18,"yardages":{"Blue":182,"White":148,"Gold":135,"Red":112}},{"number":13,"par":5,"strokeIndex":6,"yardages":{"Blue":513,"White":476,"Gold":440,"Red":392}},{"number":14,"par":4,"strokeIndex":2,"yardages":{"Blue":444,"White":417,"Gold":399,"Red":308}},{"number":15,"par":5,"strokeIndex":8,"yardages":{"Blue":538,"White":506,"Gold":462,"Red":420}},{"number":16,"par":4,"strokeIndex":14,"yardages":{"Blue":383,"White":360,"Gold":347,"Red":324}},{"number":17,"par":4,"strokeIndex":12,"yardages":{"Blue":392,"White":380,"Gold":361,"Red":346}},{"number":18,"par":3,"strokeIndex":10,"yardages":{"Blue":191,"White":166,"Gold":150,"Red":122}}]'::jsonb
) on conflict (id) do nothing;

insert into public.shared_courses (id, created_by, name, tees, holes) values (
  'seed-course-river-ridge-victoria', '00000000-0000-4000-8000-000000000003', 'River Ridge – Victoria',
  '[{"name":"Blue","rating":72.5,"slope":130},{"name":"White","rating":70.3,"slope":126},{"name":"Gold","rating":67.3,"slope":119},{"name":"Red","rating":65,"slope":110}]'::jsonb,
  '[{"number":1,"par":4,"strokeIndex":3,"yardages":{"Blue":393,"White":384,"Gold":360,"Red":324}},{"number":2,"par":4,"strokeIndex":5,"yardages":{"Blue":395,"White":358,"Gold":321,"Red":287}},{"number":3,"par":4,"strokeIndex":11,"yardages":{"Blue":371,"White":345,"Gold":302,"Red":284}},{"number":4,"par":5,"strokeIndex":15,"yardages":{"Blue":525,"White":487,"Gold":438,"Red":377}},{"number":5,"par":3,"strokeIndex":13,"yardages":{"Blue":199,"White":170,"Gold":134,"Red":115}},{"number":6,"par":4,"strokeIndex":9,"yardages":{"Blue":383,"White":349,"Gold":322,"Red":293}},{"number":7,"par":3,"strokeIndex":17,"yardages":{"Blue":178,"White":150,"Gold":128,"Red":102}},{"number":8,"par":4,"strokeIndex":1,"yardages":{"Blue":424,"White":387,"Gold":351,"Red":327}},{"number":9,"par":5,"strokeIndex":7,"yardages":{"Blue":552,"White":517,"Gold":475,"Red":432}},{"number":10,"par":4,"strokeIndex":6,"yardages":{"Blue":398,"White":373,"Gold":345,"Red":316}},{"number":11,"par":3,"strokeIndex":18,"yardages":{"Blue":168,"White":147,"Gold":120,"Red":112}},{"number":12,"par":5,"strokeIndex":4,"yardages":{"Blue":533,"White":503,"Gold":460,"Red":432}},{"number":13,"par":4,"strokeIndex":2,"yardages":{"Blue":425,"White":398,"Gold":341,"Red":304}},{"number":14,"par":5,"strokeIndex":12,"yardages":{"Blue":569,"White":535,"Gold":493,"Red":452}},{"number":15,"par":3,"strokeIndex":16,"yardages":{"Blue":145,"White":126,"Gold":95,"Red":85}},{"number":16,"par":4,"strokeIndex":8,"yardages":{"Blue":401,"White":378,"Gold":339,"Red":307}},{"number":17,"par":3,"strokeIndex":10,"yardages":{"Blue":208,"White":190,"Gold":165,"Red":138}},{"number":18,"par":5,"strokeIndex":14,"yardages":{"Blue":522,"White":507,"Gold":487,"Red":463}}]'::jsonb
) on conflict (id) do nothing;

insert into public.shared_courses (id, created_by, name, tees, holes) values (
  'seed-course-sterling-hills-golf-club', '00000000-0000-4000-8000-000000000003', 'Sterling Hills Golf Club',
  '[{"name":"Gold","rating":73.3,"slope":133},{"name":"Black","rating":71.4,"slope":128},{"name":"Blue","rating":69.2,"slope":122},{"name":"White","rating":67.5,"slope":117},{"name":"Red","rating":63.1,"slope":106}]'::jsonb,
  '[{"number":1,"par":4,"strokeIndex":11,"yardages":{"Gold":433,"Black":416,"Blue":367,"White":342,"Red":263}},{"number":2,"par":4,"strokeIndex":7,"yardages":{"Gold":414,"Black":400,"Blue":369,"White":344,"Red":227}},{"number":3,"par":3,"strokeIndex":9,"yardages":{"Gold":222,"Black":202,"Blue":171,"White":160,"Red":125}},{"number":4,"par":5,"strokeIndex":15,"yardages":{"Gold":525,"Black":495,"Blue":476,"White":442,"Red":362}},{"number":5,"par":4,"strokeIndex":1,"yardages":{"Gold":444,"Black":428,"Blue":400,"White":369,"Red":276}},{"number":6,"par":4,"strokeIndex":3,"yardages":{"Gold":378,"Black":355,"Blue":328,"White":301,"Red":248}},{"number":7,"par":4,"strokeIndex":17,"yardages":{"Gold":350,"Black":333,"Blue":311,"White":292,"Red":292}},{"number":8,"par":3,"strokeIndex":13,"yardages":{"Gold":187,"Black":167,"Blue":154,"White":136,"Red":131}},{"number":9,"par":4,"strokeIndex":5,"yardages":{"Gold":388,"Black":368,"Blue":351,"White":329,"Red":265}},{"number":10,"par":4,"strokeIndex":14,"yardages":{"Gold":379,"Black":355,"Blue":346,"White":330,"Red":300}},{"number":11,"par":3,"strokeIndex":18,"yardages":{"Gold":160,"Black":146,"Blue":141,"White":127,"Red":105}},{"number":12,"par":4,"strokeIndex":6,"yardages":{"Gold":411,"Black":380,"Blue":339,"White":319,"Red":272}},{"number":13,"par":4,"strokeIndex":4,"yardages":{"Gold":406,"Black":390,"Blue":368,"White":354,"Red":302}},{"number":14,"par":4,"strokeIndex":8,"yardages":{"Gold":442,"Black":419,"Blue":372,"White":360,"Red":268}},{"number":15,"par":3,"strokeIndex":10,"yardages":{"Gold":190,"Black":175,"Blue":164,"White":146,"Red":125}},{"number":16,"par":5,"strokeIndex":16,"yardages":{"Gold":501,"Black":466,"Blue":438,"White":406,"Red":402}},{"number":17,"par":4,"strokeIndex":2,"yardages":{"Gold":466,"Black":431,"Blue":399,"White":370,"Red":314}},{"number":18,"par":5,"strokeIndex":12,"yardages":{"Gold":524,"Black":504,"Blue":459,"White":431,"Red":313}}]'::jsonb
) on conflict (id) do nothing;

insert into public.shared_courses (id, created_by, name, tees, holes) values (
  'seed-course-camarillo-springs', '00000000-0000-4000-8000-000000000003', 'Camarillo Springs',
  '[{"name":"Black","rating":73.1,"slope":130},{"name":"Blue","rating":70.9,"slope":125},{"name":"White","rating":68.8,"slope":119},{"name":"Red","rating":65.3,"slope":111}]'::jsonb,
  '[{"number":1,"par":4,"strokeIndex":1,"yardages":{"Black":400,"Blue":382,"White":358,"Red":305}},{"number":2,"par":4,"strokeIndex":11,"yardages":{"Black":404,"Blue":379,"White":352,"Red":330}},{"number":3,"par":3,"strokeIndex":5,"yardages":{"Black":218,"Blue":193,"White":169,"Red":141}},{"number":4,"par":5,"strokeIndex":7,"yardages":{"Black":562,"Blue":512,"White":464,"Red":406}},{"number":5,"par":4,"strokeIndex":13,"yardages":{"Black":465,"Blue":377,"White":331,"Red":286}},{"number":6,"par":3,"strokeIndex":3,"yardages":{"Black":212,"Blue":195,"White":161,"Red":108}},{"number":7,"par":5,"strokeIndex":9,"yardages":{"Black":551,"Blue":535,"White":518,"Red":467}},{"number":8,"par":3,"strokeIndex":17,"yardages":{"Black":167,"Blue":155,"White":145,"Red":135}},{"number":9,"par":4,"strokeIndex":15,"yardages":{"Black":372,"Blue":342,"White":335,"Red":329}},{"number":10,"par":5,"strokeIndex":10,"yardages":{"Black":534,"Blue":509,"White":502,"Red":484}},{"number":11,"par":3,"strokeIndex":4,"yardages":{"Black":199,"Blue":194,"White":168,"Red":147}},{"number":12,"par":3,"strokeIndex":14,"yardages":{"Black":210,"Blue":180,"White":154,"Red":115}},{"number":13,"par":4,"strokeIndex":12,"yardages":{"Black":409,"Blue":345,"White":308,"Red":264}},{"number":14,"par":5,"strokeIndex":2,"yardages":{"Black":558,"Blue":525,"White":496,"Red":410}},{"number":15,"par":4,"strokeIndex":18,"yardages":{"Black":366,"Blue":334,"White":318,"Red":299}},{"number":16,"par":5,"strokeIndex":8,"yardages":{"Black":515,"Blue":475,"White":450,"Red":430}},{"number":17,"par":4,"strokeIndex":16,"yardages":{"Black":392,"Blue":372,"White":345,"Red":322}},{"number":18,"par":4,"strokeIndex":6,"yardages":{"Black":387,"Blue":382,"White":357,"Red":319}}]'::jsonb
) on conflict (id) do nothing;

insert into public.shared_courses (id, created_by, name, tees, holes) values (
  'seed-course-los-robles-greens', '00000000-0000-4000-8000-000000000003', 'Los Robles Greens',
  '[{"name":"Black","rating":70.3,"slope":126},{"name":"Blue","rating":68.9,"slope":122},{"name":"White","rating":67.1,"slope":118},{"name":"Red","rating":65.2,"slope":113}]'::jsonb,
  '[{"number":1,"par":5,"strokeIndex":9,"yardages":{"Black":467,"Blue":452,"White":430,"Red":417}},{"number":2,"par":3,"strokeIndex":17,"yardages":{"Black":158,"Blue":151,"White":137,"Red":128}},{"number":3,"par":4,"strokeIndex":3,"yardages":{"Black":384,"Blue":361,"White":345,"Red":333}},{"number":4,"par":4,"strokeIndex":7,"yardages":{"Black":330,"Blue":309,"White":298,"Red":287}},{"number":5,"par":4,"strokeIndex":5,"yardages":{"Black":363,"Blue":344,"White":333,"Red":322}},{"number":6,"par":3,"strokeIndex":13,"yardages":{"Black":189,"Blue":178,"White":161,"Red":131}},{"number":7,"par":4,"strokeIndex":1,"yardages":{"Black":448,"Blue":427,"White":415,"Red":373}},{"number":8,"par":3,"strokeIndex":15,"yardages":{"Black":157,"Blue":149,"White":119,"Red":107}},{"number":9,"par":4,"strokeIndex":11,"yardages":{"Black":291,"Blue":279,"White":255,"Red":225}},{"number":10,"par":4,"strokeIndex":2,"yardages":{"Black":455,"Blue":438,"White":429,"Red":420}},{"number":11,"par":3,"strokeIndex":12,"yardages":{"Black":190,"Blue":168,"White":160,"Red":143}},{"number":12,"par":5,"strokeIndex":18,"yardages":{"Black":459,"Blue":449,"White":429,"Red":373}},{"number":13,"par":4,"strokeIndex":14,"yardages":{"Black":337,"Blue":324,"White":304,"Red":290}},{"number":14,"par":5,"strokeIndex":8,"yardages":{"Black":611,"Blue":593,"White":555,"Red":518}},{"number":15,"par":4,"strokeIndex":6,"yardages":{"Black":428,"Blue":396,"White":362,"Red":336}},{"number":16,"par":3,"strokeIndex":16,"yardages":{"Black":188,"Blue":176,"White":169,"Red":132}},{"number":17,"par":4,"strokeIndex":4,"yardages":{"Black":459,"Blue":443,"White":404,"Red":376}},{"number":18,"par":4,"strokeIndex":10,"yardages":{"Black":390,"Blue":363,"White":321,"Red":295}}]'::jsonb
) on conflict (id) do nothing;

insert into public.shared_courses (id, created_by, name, tees, holes) values (
  'seed-course-tierra-rejada-golf-club', '00000000-0000-4000-8000-000000000003', 'Tierra Rejada Golf Club',
  '[{"name":"Championship","rating":71.4,"slope":130},{"name":"Tournament","rating":69.3,"slope":124},{"name":"Players","rating":66.9,"slope":118},{"name":"Forward","rating":64.7,"slope":112}]'::jsonb,
  '[{"number":1,"par":5,"strokeIndex":5,"yardages":{"Championship":580,"Tournament":511,"Players":511,"Forward":475}},{"number":2,"par":3,"strokeIndex":11,"yardages":{"Championship":153,"Tournament":153,"Players":130,"Forward":105}},{"number":3,"par":4,"strokeIndex":1,"yardages":{"Championship":455,"Tournament":455,"Players":290,"Forward":270}},{"number":4,"par":5,"strokeIndex":7,"yardages":{"Championship":530,"Tournament":530,"Players":445,"Forward":445}},{"number":5,"par":4,"strokeIndex":15,"yardages":{"Championship":375,"Tournament":280,"Players":280,"Forward":235}},{"number":6,"par":4,"strokeIndex":13,"yardages":{"Championship":385,"Tournament":320,"Players":320,"Forward":295}},{"number":7,"par":3,"strokeIndex":17,"yardages":{"Championship":130,"Tournament":110,"Players":110,"Forward":80}},{"number":8,"par":4,"strokeIndex":3,"yardages":{"Championship":355,"Tournament":355,"Players":295,"Forward":295}},{"number":9,"par":5,"strokeIndex":9,"yardages":{"Championship":545,"Tournament":480,"Players":480,"Forward":480}},{"number":10,"par":4,"strokeIndex":6,"yardages":{"Championship":345,"Tournament":345,"Players":288,"Forward":288}},{"number":11,"par":3,"strokeIndex":10,"yardages":{"Championship":195,"Tournament":185,"Players":185,"Forward":165}},{"number":12,"par":5,"strokeIndex":16,"yardages":{"Championship":520,"Tournament":520,"Players":502,"Forward":417}},{"number":13,"par":4,"strokeIndex":2,"yardages":{"Championship":400,"Tournament":373,"Players":342,"Forward":342}},{"number":14,"par":3,"strokeIndex":12,"yardages":{"Championship":165,"Tournament":154,"Players":154,"Forward":125}},{"number":15,"par":4,"strokeIndex":8,"yardages":{"Championship":425,"Tournament":375,"Players":375,"Forward":307}},{"number":16,"par":5,"strokeIndex":18,"yardages":{"Championship":488,"Tournament":465,"Players":465,"Forward":403}},{"number":17,"par":3,"strokeIndex":14,"yardages":{"Championship":105,"Tournament":105,"Players":118,"Forward":75}},{"number":18,"par":4,"strokeIndex":4,"yardages":{"Championship":406,"Tournament":406,"Players":310,"Forward":310}}]'::jsonb
) on conflict (id) do nothing;

insert into public.shared_courses (id, created_by, name, tees, holes) values (
  'seed-course-soule-park-golf-course', '00000000-0000-4000-8000-000000000003', 'Soule Park Golf Course',
  '[{"name":"Oak","rating":72.8,"slope":128},{"name":"Orange","rating":71.6,"slope":125},{"name":"Avocado","rating":70.7,"slope":123},{"name":"Lime","rating":66.9,"slope":118}]'::jsonb,
  '[{"number":1,"par":4,"strokeIndex":7,"yardages":{"Oak":393,"Orange":382,"Avocado":370,"Lime":351}},{"number":2,"par":4,"strokeIndex":9,"yardages":{"Oak":395,"Orange":361,"Avocado":328,"Lime":312}},{"number":3,"par":3,"strokeIndex":11,"yardages":{"Oak":140,"Orange":132,"Avocado":123,"Lime":116}},{"number":4,"par":5,"strokeIndex":13,"yardages":{"Oak":512,"Orange":502,"Avocado":492,"Lime":439}},{"number":5,"par":5,"strokeIndex":17,"yardages":{"Oak":490,"Orange":478,"Avocado":442,"Lime":432}},{"number":6,"par":3,"strokeIndex":5,"yardages":{"Oak":242,"Orange":229,"Avocado":190,"Lime":183}},{"number":7,"par":4,"strokeIndex":3,"yardages":{"Oak":429,"Orange":420,"Avocado":357,"Lime":323}},{"number":8,"par":4,"strokeIndex":1,"yardages":{"Oak":426,"Orange":408,"Avocado":310,"Lime":301}},{"number":9,"par":4,"strokeIndex":15,"yardages":{"Oak":350,"Orange":347,"Avocado":342,"Lime":272}},{"number":10,"par":3,"strokeIndex":14,"yardages":{"Oak":160,"Orange":155,"Avocado":142,"Lime":139}},{"number":11,"par":5,"strokeIndex":12,"yardages":{"Oak":551,"Orange":513,"Avocado":501,"Lime":460}},{"number":12,"par":4,"strokeIndex":8,"yardages":{"Oak":427,"Orange":420,"Avocado":382,"Lime":371}},{"number":13,"par":4,"strokeIndex":16,"yardages":{"Oak":370,"Orange":357,"Avocado":344,"Lime":309}},{"number":14,"par":4,"strokeIndex":2,"yardages":{"Oak":427,"Orange":420,"Avocado":410,"Lime":355}},{"number":15,"par":4,"strokeIndex":4,"yardages":{"Oak":461,"Orange":418,"Avocado":406,"Lime":330}},{"number":16,"par":3,"strokeIndex":10,"yardages":{"Oak":172,"Orange":162,"Avocado":156,"Lime":151}},{"number":17,"par":4,"strokeIndex":6,"yardages":{"Oak":410,"Orange":392,"Avocado":384,"Lime":354}},{"number":18,"par":5,"strokeIndex":18,"yardages":{"Oak":501,"Orange":492,"Avocado":479,"Lime":429}}]'::jsonb
) on conflict (id) do nothing;

insert into public.shared_courses (id, created_by, name, tees, holes) values (
  'seed-course-saticoy-regional', '00000000-0000-4000-8000-000000000003', 'Saticoy Regional',
  '[{"name":"Back","rating":66.3,"slope":106},{"name":"Forward","rating":62.9,"slope":100}]'::jsonb,
  '[{"number":1,"par":4,"strokeIndex":7,"yardages":{"Back":329,"Forward":314}},{"number":2,"par":4,"strokeIndex":11,"yardages":{"Back":306,"Forward":298}},{"number":3,"par":5,"strokeIndex":13,"yardages":{"Back":449,"Forward":361}},{"number":4,"par":4,"strokeIndex":3,"yardages":{"Back":403,"Forward":388}},{"number":5,"par":3,"strokeIndex":9,"yardages":{"Back":170,"Forward":150}},{"number":6,"par":3,"strokeIndex":17,"yardages":{"Back":99,"Forward":88}},{"number":7,"par":4,"strokeIndex":1,"yardages":{"Back":400,"Forward":324}},{"number":8,"par":3,"strokeIndex":15,"yardages":{"Back":159,"Forward":151}},{"number":9,"par":4,"strokeIndex":5,"yardages":{"Back":324,"Forward":321}},{"number":10,"par":4,"strokeIndex":6,"yardages":{"Back":361,"Forward":348}},{"number":11,"par":4,"strokeIndex":12,"yardages":{"Back":313,"Forward":292}},{"number":12,"par":5,"strokeIndex":10,"yardages":{"Back":463,"Forward":346}},{"number":13,"par":4,"strokeIndex":4,"yardages":{"Back":423,"Forward":379}},{"number":14,"par":3,"strokeIndex":16,"yardages":{"Back":142,"Forward":133}},{"number":15,"par":3,"strokeIndex":18,"yardages":{"Back":110,"Forward":103}},{"number":16,"par":4,"strokeIndex":2,"yardages":{"Back":408,"Forward":329}},{"number":17,"par":3,"strokeIndex":14,"yardages":{"Back":168,"Forward":140}},{"number":18,"par":4,"strokeIndex":8,"yardages":{"Back":328,"Forward":313}}]'::jsonb
) on conflict (id) do nothing;

insert into public.shared_courses (id, created_by, name, tees, holes) values (
  'seed-course-las-posas-country-club', '00000000-0000-4000-8000-000000000003', 'Las Posas Country Club',
  '[{"name":"Blue","rating":71.6,"slope":129},{"name":"White","rating":70.1,"slope":125},{"name":"Gold","rating":67.8,"slope":118},{"name":"Silver","rating":64.3,"slope":108}]'::jsonb,
  '[{"number":1,"par":4,"strokeIndex":7,"yardages":{"Blue":392,"White":367,"Gold":345,"Silver":297}},{"number":2,"par":3,"strokeIndex":17,"yardages":{"Blue":132,"White":117,"Gold":102,"Silver":83}},{"number":3,"par":4,"strokeIndex":3,"yardages":{"Blue":373,"White":363,"Gold":346,"Silver":304}},{"number":4,"par":5,"strokeIndex":15,"yardages":{"Blue":523,"White":510,"Gold":492,"Silver":437}},{"number":5,"par":4,"strokeIndex":1,"yardages":{"Blue":406,"White":376,"Gold":340,"Silver":296}},{"number":6,"par":3,"strokeIndex":5,"yardages":{"Blue":214,"White":186,"Gold":150,"Silver":91}},{"number":7,"par":5,"strokeIndex":13,"yardages":{"Blue":511,"White":483,"Gold":440,"Silver":394}},{"number":8,"par":4,"strokeIndex":9,"yardages":{"Blue":362,"White":362,"Gold":341,"Silver":323}},{"number":9,"par":3,"strokeIndex":11,"yardages":{"Blue":214,"White":196,"Gold":172,"Silver":130}},{"number":10,"par":5,"strokeIndex":8,"yardages":{"Blue":486,"White":465,"Gold":445,"Silver":394}},{"number":11,"par":3,"strokeIndex":18,"yardages":{"Blue":139,"White":139,"Gold":118,"Silver":98}},{"number":12,"par":5,"strokeIndex":4,"yardages":{"Blue":544,"White":510,"Gold":500,"Silver":427}},{"number":13,"par":3,"strokeIndex":12,"yardages":{"Blue":178,"White":163,"Gold":140,"Silver":113}},{"number":14,"par":4,"strokeIndex":14,"yardages":{"Blue":338,"White":326,"Gold":304,"Silver":263}},{"number":15,"par":4,"strokeIndex":2,"yardages":{"Blue":395,"White":375,"Gold":349,"Silver":325}},{"number":16,"par":4,"strokeIndex":6,"yardages":{"Blue":402,"White":386,"Gold":354,"Silver":303}},{"number":17,"par":4,"strokeIndex":10,"yardages":{"Blue":400,"White":385,"Gold":359,"Silver":282}},{"number":18,"par":4,"strokeIndex":16,"yardages":{"Blue":401,"White":370,"Gold":280,"Silver":280}}]'::jsonb
) on conflict (id) do nothing;

insert into public.shared_courses (id, created_by, name, tees, holes) values (
  'seed-course-spanish-hills-g-cc', '00000000-0000-4000-8000-000000000003', 'Spanish Hills G&CC',
  '[{"name":"Black","rating":72.4,"slope":135},{"name":"Green","rating":70.2,"slope":129},{"name":"White","rating":68,"slope":123},{"name":"Gold","rating":64,"slope":113}]'::jsonb,
  '[{"number":1,"par":4,"strokeIndex":15,"yardages":{"Black":382,"Green":358,"White":332,"Gold":312}},{"number":2,"par":5,"strokeIndex":5,"yardages":{"Black":511,"Green":488,"White":469,"Gold":413}},{"number":3,"par":4,"strokeIndex":1,"yardages":{"Black":369,"Green":348,"White":332,"Gold":274}},{"number":4,"par":3,"strokeIndex":17,"yardages":{"Black":183,"Green":138,"White":125,"Gold":95}},{"number":5,"par":4,"strokeIndex":13,"yardages":{"Black":406,"Green":390,"White":370,"Gold":329}},{"number":6,"par":3,"strokeIndex":11,"yardages":{"Black":254,"Green":209,"White":179,"Gold":158}},{"number":7,"par":4,"strokeIndex":7,"yardages":{"Black":375,"Green":351,"White":324,"Gold":275}},{"number":8,"par":4,"strokeIndex":3,"yardages":{"Black":418,"Green":372,"White":312,"Gold":282}},{"number":9,"par":4,"strokeIndex":9,"yardages":{"Black":362,"Green":346,"White":327,"Gold":217}},{"number":10,"par":4,"strokeIndex":2,"yardages":{"Black":425,"Green":401,"White":372,"Gold":336}},{"number":11,"par":3,"strokeIndex":16,"yardages":{"Black":194,"Green":178,"White":161,"Gold":139}},{"number":12,"par":4,"strokeIndex":10,"yardages":{"Black":392,"Green":377,"White":359,"Gold":298}},{"number":13,"par":3,"strokeIndex":18,"yardages":{"Black":146,"Green":139,"White":120,"Gold":105}},{"number":14,"par":5,"strokeIndex":14,"yardages":{"Black":512,"Green":491,"White":476,"Gold":417}},{"number":15,"par":5,"strokeIndex":4,"yardages":{"Black":643,"Green":575,"White":547,"Gold":476}},{"number":16,"par":4,"strokeIndex":6,"yardages":{"Black":431,"Green":415,"White":393,"Gold":358}},{"number":17,"par":4,"strokeIndex":12,"yardages":{"Black":388,"Green":370,"White":337,"Gold":297}},{"number":18,"par":4,"strokeIndex":8,"yardages":{"Black":357,"Green":332,"White":300,"Gold":238}}]'::jsonb
) on conflict (id) do nothing;

insert into public.shared_courses (id, created_by, name, tees, holes) values (
  'seed-course-moorpark-cc-ridgeline-creekside', '00000000-0000-4000-8000-000000000003', 'Moorpark CC – Ridgeline/Creekside',
  '[{"name":"Black","rating":73.8,"slope":142},{"name":"Blue","rating":71.5,"slope":137},{"name":"White","rating":69.2,"slope":128}]'::jsonb,
  '[{"number":1,"par":4,"strokeIndex":9,"yardages":{"Black":380,"Blue":357,"White":328}},{"number":2,"par":4,"strokeIndex":13,"yardages":{"Black":382,"Blue":367,"White":335}},{"number":3,"par":5,"strokeIndex":3,"yardages":{"Black":566,"Blue":549,"White":511}},{"number":4,"par":3,"strokeIndex":17,"yardages":{"Black":174,"Blue":159,"White":139}},{"number":5,"par":5,"strokeIndex":1,"yardages":{"Black":660,"Blue":620,"White":586}},{"number":6,"par":3,"strokeIndex":5,"yardages":{"Black":224,"Blue":201,"White":187}},{"number":7,"par":5,"strokeIndex":15,"yardages":{"Black":527,"Blue":487,"White":467}},{"number":8,"par":4,"strokeIndex":11,"yardages":{"Black":355,"Blue":325,"White":292}},{"number":9,"par":3,"strokeIndex":7,"yardages":{"Black":202,"Blue":186,"White":174}},{"number":10,"par":5,"strokeIndex":10,"yardages":{"Black":557,"Blue":531,"White":505}},{"number":11,"par":3,"strokeIndex":12,"yardages":{"Black":197,"Blue":166,"White":157}},{"number":12,"par":4,"strokeIndex":8,"yardages":{"Black":412,"Blue":387,"White":331}},{"number":13,"par":4,"strokeIndex":4,"yardages":{"Black":419,"Blue":407,"White":377}},{"number":14,"par":4,"strokeIndex":18,"yardages":{"Black":296,"Blue":270,"White":259}},{"number":15,"par":3,"strokeIndex":14,"yardages":{"Black":193,"Blue":183,"White":174}},{"number":16,"par":4,"strokeIndex":2,"yardages":{"Black":467,"Blue":437,"White":386}},{"number":17,"par":4,"strokeIndex":6,"yardages":{"Black":455,"Blue":428,"White":417}},{"number":18,"par":5,"strokeIndex":16,"yardages":{"Black":511,"Blue":475,"White":423}}]'::jsonb
) on conflict (id) do nothing;

insert into public.shared_courses (id, created_by, name, tees, holes) values (
  'seed-course-moorpark-cc-canyon-crest-ridgeline', '00000000-0000-4000-8000-000000000003', 'Moorpark CC – Canyon Crest/Ridgeline',
  '[{"name":"Black","rating":73,"slope":138},{"name":"Blue","rating":70.8,"slope":132},{"name":"White","rating":68.7,"slope":125}]'::jsonb,
  '[{"number":1,"par":4,"strokeIndex":3,"yardages":{"Black":457,"Blue":409,"White":375}},{"number":2,"par":4,"strokeIndex":15,"yardages":{"Black":376,"Blue":350,"White":323}},{"number":3,"par":3,"strokeIndex":11,"yardages":{"Black":176,"Blue":169,"White":155}},{"number":4,"par":5,"strokeIndex":1,"yardages":{"Black":579,"Blue":562,"White":529}},{"number":5,"par":4,"strokeIndex":7,"yardages":{"Black":413,"Blue":377,"White":346}},{"number":6,"par":4,"strokeIndex":13,"yardages":{"Black":331,"Blue":314,"White":296}},{"number":7,"par":4,"strokeIndex":5,"yardages":{"Black":413,"Blue":394,"White":375}},{"number":8,"par":3,"strokeIndex":17,"yardages":{"Black":162,"Blue":146,"White":129}},{"number":9,"par":5,"strokeIndex":9,"yardages":{"Black":537,"Blue":501,"White":471}},{"number":10,"par":4,"strokeIndex":10,"yardages":{"Black":380,"Blue":357,"White":328}},{"number":11,"par":4,"strokeIndex":14,"yardages":{"Black":382,"Blue":367,"White":335}},{"number":12,"par":5,"strokeIndex":4,"yardages":{"Black":566,"Blue":549,"White":511}},{"number":13,"par":3,"strokeIndex":18,"yardages":{"Black":174,"Blue":159,"White":139}},{"number":14,"par":5,"strokeIndex":2,"yardages":{"Black":660,"Blue":620,"White":586}},{"number":15,"par":3,"strokeIndex":6,"yardages":{"Black":224,"Blue":201,"White":187}},{"number":16,"par":5,"strokeIndex":16,"yardages":{"Black":527,"Blue":487,"White":467}},{"number":17,"par":4,"strokeIndex":12,"yardages":{"Black":355,"Blue":325,"White":292}},{"number":18,"par":3,"strokeIndex":8,"yardages":{"Black":202,"Blue":186,"White":174}}]'::jsonb
) on conflict (id) do nothing;

insert into public.shared_courses (id, created_by, name, tees, holes) values (
  'seed-course-moorpark-cc-canyon-crest-creekside', '00000000-0000-4000-8000-000000000003', 'Moorpark CC – Canyon Crest/Creekside',
  '[{"name":"Black","rating":73.8,"slope":136},{"name":"Blue","rating":71.5,"slope":133},{"name":"White","rating":69.5,"slope":126}]'::jsonb,
  '[{"number":1,"par":4,"strokeIndex":3,"yardages":{"Black":457,"Blue":409,"White":375}},{"number":2,"par":4,"strokeIndex":15,"yardages":{"Black":376,"Blue":350,"White":323}},{"number":3,"par":3,"strokeIndex":11,"yardages":{"Black":176,"Blue":169,"White":155}},{"number":4,"par":5,"strokeIndex":1,"yardages":{"Black":579,"Blue":562,"White":529}},{"number":5,"par":4,"strokeIndex":7,"yardages":{"Black":413,"Blue":377,"White":346}},{"number":6,"par":4,"strokeIndex":13,"yardages":{"Black":331,"Blue":314,"White":296}},{"number":7,"par":4,"strokeIndex":5,"yardages":{"Black":413,"Blue":394,"White":375}},{"number":8,"par":3,"strokeIndex":17,"yardages":{"Black":162,"Blue":146,"White":129}},{"number":9,"par":5,"strokeIndex":9,"yardages":{"Black":537,"Blue":501,"White":471}},{"number":10,"par":5,"strokeIndex":10,"yardages":{"Black":557,"Blue":531,"White":505}},{"number":11,"par":3,"strokeIndex":12,"yardages":{"Black":197,"Blue":166,"White":157}},{"number":12,"par":4,"strokeIndex":8,"yardages":{"Black":412,"Blue":387,"White":331}},{"number":13,"par":4,"strokeIndex":4,"yardages":{"Black":419,"Blue":407,"White":377}},{"number":14,"par":4,"strokeIndex":18,"yardages":{"Black":296,"Blue":270,"White":259}},{"number":15,"par":3,"strokeIndex":14,"yardages":{"Black":193,"Blue":183,"White":174}},{"number":16,"par":4,"strokeIndex":2,"yardages":{"Black":467,"Blue":437,"White":386}},{"number":17,"par":4,"strokeIndex":6,"yardages":{"Black":455,"Blue":428,"White":417}},{"number":18,"par":5,"strokeIndex":16,"yardages":{"Black":511,"Blue":475,"White":423}}]'::jsonb
) on conflict (id) do nothing;

insert into public.shared_courses (id, created_by, name, tees, holes) values (
  'seed-course-north-ranch-cc-oaks-lakes', '00000000-0000-4000-8000-000000000003', 'North Ranch CC – Oaks/Lakes',
  '[{"name":"Black","rating":75,"slope":139},{"name":"Blue","rating":73.9,"slope":137},{"name":"White","rating":71.7,"slope":130},{"name":"Red","rating":69.2,"slope":123},{"name":"Yellow","rating":66.6,"slope":118}]'::jsonb,
  '[{"number":1,"par":4,"strokeIndex":15,"yardages":{"Black":385,"Blue":383,"White":374,"Red":358,"Yellow":328}},{"number":2,"par":4,"strokeIndex":5,"yardages":{"Black":415,"Blue":410,"White":402,"Red":357,"Yellow":343}},{"number":3,"par":5,"strokeIndex":17,"yardages":{"Black":526,"Blue":511,"White":480,"Red":452,"Yellow":425}},{"number":4,"par":3,"strokeIndex":13,"yardages":{"Black":202,"Blue":188,"White":158,"Red":153,"Yellow":127}},{"number":5,"par":4,"strokeIndex":1,"yardages":{"Black":416,"Blue":411,"White":390,"Red":295,"Yellow":295}},{"number":6,"par":5,"strokeIndex":7,"yardages":{"Black":474,"Blue":469,"White":464,"Red":442,"Yellow":442}},{"number":7,"par":4,"strokeIndex":9,"yardages":{"Black":372,"Blue":364,"White":356,"Red":322,"Yellow":322}},{"number":8,"par":3,"strokeIndex":11,"yardages":{"Black":181,"Blue":171,"White":145,"Red":126,"Yellow":126}},{"number":9,"par":4,"strokeIndex":3,"yardages":{"Black":424,"Blue":414,"White":355,"Red":320,"Yellow":320}},{"number":10,"par":4,"strokeIndex":16,"yardages":{"Black":462,"Blue":434,"White":414,"Red":391,"Yellow":342}},{"number":11,"par":4,"strokeIndex":6,"yardages":{"Black":415,"Blue":407,"White":382,"Red":349,"Yellow":307}},{"number":12,"par":3,"strokeIndex":18,"yardages":{"Black":228,"Blue":216,"White":180,"Red":164,"Yellow":135}},{"number":13,"par":5,"strokeIndex":2,"yardages":{"Black":581,"Blue":555,"White":492,"Red":492,"Yellow":460}},{"number":14,"par":4,"strokeIndex":8,"yardages":{"Black":415,"Blue":408,"White":383,"Red":360,"Yellow":305}},{"number":15,"par":5,"strokeIndex":10,"yardages":{"Black":493,"Blue":487,"White":471,"Red":452,"Yellow":390}},{"number":16,"par":4,"strokeIndex":12,"yardages":{"Black":382,"Blue":366,"White":342,"Red":319,"Yellow":285}},{"number":17,"par":3,"strokeIndex":4,"yardages":{"Black":235,"Blue":214,"White":162,"Red":132,"Yellow":86}},{"number":18,"par":4,"strokeIndex":14,"yardages":{"Black":386,"Blue":386,"White":361,"Red":346,"Yellow":303}}]'::jsonb
) on conflict (id) do nothing;

insert into public.shared_courses (id, created_by, name, tees, holes) values (
  'seed-course-sunset-hills-country-club', '00000000-0000-4000-8000-000000000003', 'Sunset Hills Country Club',
  '[{"name":"Black","rating":69.9,"slope":123},{"name":"White","rating":68.6,"slope":120},{"name":"Red","rating":66.8,"slope":116}]'::jsonb,
  '[{"number":1,"par":4,"strokeIndex":9,"yardages":{"Black":365,"White":355,"Red":347}},{"number":2,"par":4,"strokeIndex":1,"yardages":{"Black":405,"White":389,"Red":335}},{"number":3,"par":5,"strokeIndex":3,"yardages":{"Black":544,"White":534,"Red":523}},{"number":4,"par":4,"strokeIndex":11,"yardages":{"Black":344,"White":338,"Red":332}},{"number":5,"par":3,"strokeIndex":15,"yardages":{"Black":162,"White":153,"Red":145}},{"number":6,"par":4,"strokeIndex":5,"yardages":{"Black":388,"White":356,"Red":348}},{"number":7,"par":4,"strokeIndex":7,"yardages":{"Black":368,"White":324,"Red":314}},{"number":8,"par":4,"strokeIndex":17,"yardages":{"Black":290,"White":284,"Red":287}},{"number":9,"par":3,"strokeIndex":13,"yardages":{"Black":171,"White":143,"Red":134}},{"number":10,"par":4,"strokeIndex":16,"yardages":{"Black":336,"White":314,"Red":308}},{"number":11,"par":5,"strokeIndex":18,"yardages":{"Black":455,"White":449,"Red":448}},{"number":12,"par":3,"strokeIndex":12,"yardages":{"Black":135,"White":133,"Red":128}},{"number":13,"par":4,"strokeIndex":8,"yardages":{"Black":357,"White":348,"Red":223}},{"number":14,"par":4,"strokeIndex":2,"yardages":{"Black":374,"White":369,"Red":365}},{"number":15,"par":5,"strokeIndex":4,"yardages":{"Black":484,"White":479,"Red":471}},{"number":16,"par":4,"strokeIndex":6,"yardages":{"Black":351,"White":336,"Red":321}},{"number":17,"par":3,"strokeIndex":10,"yardages":{"Black":211,"White":205,"Red":192}},{"number":18,"par":4,"strokeIndex":14,"yardages":{"Black":358,"White":339,"Red":322}}]'::jsonb
) on conflict (id) do nothing;

insert into public.shared_courses (id, created_by, name, tees, holes) values (
  'seed-course-wood-ranch-golf-club', '00000000-0000-4000-8000-000000000003', 'Wood Ranch Golf Club',
  '[{"name":"Gold","rating":74.4,"slope":140},{"name":"Blue","rating":72.2,"slope":135},{"name":"White","rating":70.5,"slope":129},{"name":"Red","rating":72.6,"slope":134}]'::jsonb,
  '[{"number":1,"par":4,"strokeIndex":5,"yardages":{"Gold":437,"Blue":415,"White":402,"Red":354}},{"number":2,"par":5,"strokeIndex":13,"yardages":{"Gold":526,"Blue":501,"White":459,"Red":397}},{"number":3,"par":3,"strokeIndex":15,"yardages":{"Gold":179,"Blue":162,"White":152,"Red":131}},{"number":4,"par":4,"strokeIndex":7,"yardages":{"Gold":366,"Blue":360,"White":344,"Red":312}},{"number":5,"par":4,"strokeIndex":3,"yardages":{"Gold":431,"Blue":408,"White":380,"Red":339}},{"number":6,"par":5,"strokeIndex":9,"yardages":{"Gold":540,"Blue":532,"White":461,"Red":409}},{"number":7,"par":3,"strokeIndex":17,"yardages":{"Gold":170,"Blue":161,"White":150,"Red":122}},{"number":8,"par":4,"strokeIndex":11,"yardages":{"Gold":342,"Blue":326,"White":310,"Red":299}},{"number":9,"par":4,"strokeIndex":1,"yardages":{"Gold":434,"Blue":379,"White":360,"Red":299}},{"number":10,"par":4,"strokeIndex":2,"yardages":{"Gold":418,"Blue":392,"White":366,"Red":341}},{"number":11,"par":4,"strokeIndex":8,"yardages":{"Gold":428,"Blue":387,"White":374,"Red":347}},{"number":12,"par":4,"strokeIndex":6,"yardages":{"Gold":415,"Blue":381,"White":371,"Red":338}},{"number":13,"par":3,"strokeIndex":12,"yardages":{"Gold":196,"Blue":173,"White":155,"Red":115}},{"number":14,"par":4,"strokeIndex":14,"yardages":{"Gold":365,"Blue":358,"White":343,"Red":300}},{"number":15,"par":5,"strokeIndex":16,"yardages":{"Gold":537,"Blue":516,"White":494,"Red":436}},{"number":16,"par":4,"strokeIndex":4,"yardages":{"Gold":440,"Blue":410,"White":363,"Red":291}},{"number":17,"par":3,"strokeIndex":10,"yardages":{"Gold":207,"Blue":182,"White":159,"Red":115}},{"number":18,"par":5,"strokeIndex":18,"yardages":{"Gold":521,"Blue":509,"White":485,"Red":452}}]'::jsonb
) on conflict (id) do nothing;

insert into public.shared_courses (id, created_by, name, tees, holes) values (
  'seed-course-sherwood-country-club', '00000000-0000-4000-8000-000000000003', 'Sherwood Country Club',
  '[{"name":"Bear","rating":75.4,"slope":144},{"name":"Black","rating":73.5,"slope":138},{"name":"Blue","rating":71.5,"slope":130},{"name":"White","rating":69.6,"slope":123},{"name":"Red","rating":66.6,"slope":115}]'::jsonb,
  '[{"number":1,"par":4,"strokeIndex":9,"yardages":{"Bear":386,"Black":361,"Blue":332,"White":327,"Red":294}},{"number":2,"par":5,"strokeIndex":13,"yardages":{"Bear":522,"Black":505,"Blue":496,"White":427,"Red":410}},{"number":3,"par":3,"strokeIndex":15,"yardages":{"Bear":185,"Black":175,"Blue":161,"White":142,"Red":120}},{"number":4,"par":5,"strokeIndex":7,"yardages":{"Bear":572,"Black":550,"Blue":534,"White":512,"Red":402}},{"number":5,"par":4,"strokeIndex":3,"yardages":{"Bear":459,"Black":424,"Blue":399,"White":368,"Red":356}},{"number":6,"par":3,"strokeIndex":11,"yardages":{"Bear":186,"Black":168,"Blue":149,"White":139,"Red":100}},{"number":7,"par":5,"strokeIndex":1,"yardages":{"Bear":569,"Black":538,"Blue":514,"White":498,"Red":458}},{"number":8,"par":3,"strokeIndex":17,"yardages":{"Bear":168,"Black":163,"Blue":148,"White":131,"Red":120}},{"number":9,"par":4,"strokeIndex":5,"yardages":{"Bear":421,"Black":405,"Blue":372,"White":359,"Red":338}},{"number":10,"par":4,"strokeIndex":16,"yardages":{"Bear":343,"Black":323,"Blue":306,"White":306,"Red":270}},{"number":11,"par":5,"strokeIndex":8,"yardages":{"Bear":536,"Black":515,"Blue":490,"White":479,"Red":444}},{"number":12,"par":3,"strokeIndex":18,"yardages":{"Bear":203,"Black":191,"Blue":142,"White":128,"Red":110}},{"number":13,"par":4,"strokeIndex":6,"yardages":{"Bear":457,"Black":435,"Blue":406,"White":375,"Red":343}},{"number":14,"par":5,"strokeIndex":12,"yardages":{"Bear":538,"Black":530,"Blue":503,"White":451,"Red":422}},{"number":15,"par":4,"strokeIndex":2,"yardages":{"Bear":423,"Black":412,"Blue":380,"White":354,"Red":338}},{"number":16,"par":4,"strokeIndex":10,"yardages":{"Bear":452,"Black":419,"Blue":380,"White":340,"Red":333}},{"number":17,"par":3,"strokeIndex":14,"yardages":{"Bear":232,"Black":193,"Blue":182,"White":162,"Red":138}},{"number":18,"par":4,"strokeIndex":4,"yardages":{"Bear":446,"Black":424,"Blue":411,"White":336,"Red":336}}]'::jsonb
) on conflict (id) do nothing;

-- ── Game presets ────────────────────────────────────────────────────────────

insert into public.game_presets (id, created_by, name, game_type, buy_in_cents, stakes_mode, config, description, sort_order) values
  ('seed-preset-skins', '00000000-0000-4000-8000-000000000003', 'Saturday Skins', 'skins', 500, 'points',
   '{"mode":"net","carryovers":true,"payModel":"pot"}'::jsonb,
   'Net skins, carryovers on, five tokens each.', 1),
  ('seed-preset-wolf', '00000000-0000-4000-8000-000000000003', 'Wolf Night', 'wolf', 1000, 'points',
   '{"mode":"net","wolfOrder":[],"blindWolf":true,"payModel":"pot"}'::jsonb,
   'Net Wolf with blind wolf allowed, ten tokens each.', 2)
on conflict (id) do nothing;

-- ── The organizer's own copies of two courses ───────────────────────────────
-- A round points at a row in courses (the player's catalogue), and freezes a
-- snapshot. These copy the shared rows so the ids line up either way.

insert into public.courses (id, user_id, name, tees, holes)
select 'seed-course-organizer-olivas', '00000000-0000-4000-8000-000000000001', name, tees, holes
from public.shared_courses where id = 'seed-course-olivas-links'
on conflict (id) do nothing;

insert into public.courses (id, user_id, name, tees, holes)
select 'seed-course-organizer-vineyard', '00000000-0000-4000-8000-000000000001', name, tees, holes
from public.shared_courses where id = 'seed-course-river-ridge-vineyard'
on conflict (id) do nothing;

-- ── Finished Skins round, a week ago, four players ──────────────────────────
-- organizer, joiner, Pat Plus (+3), Taylor Two (2) at Olivas Links, Club tees.

insert into public.rounds (
  id, user_id, course_id, date, status, current_hole, course_snapshot, game,
  treasurer_player_id, players, groups, game_master_id, invite_code, holes_mode, starting_hole
)
select
  'seed-round-skins', '00000000-0000-4000-8000-000000000001', 'seed-course-organizer-olivas',
  now() - interval '7 days', 'complete', 18,
  jsonb_build_object('courseId', 'seed-course-organizer-olivas', 'courseName', c.name, 'tees', c.tees, 'holes', c.holes),
  '{"id":"seed-game-skins","type":"skins","buyInCents":500,"stakesMode":"points","config":{"mode":"net","carryovers":true,"payModel":"pot"}}'::jsonb,
  '00000000-0000-4000-8000-000000000001',
  '[{"id":"00000000-0000-4000-8000-000000000001","name":"Olive Organizer","ghinNumber":"","handicapIndex":9.4,"tee":"Club"},
    {"id":"00000000-0000-4000-8000-000000000002","name":"Jay Joiner","ghinNumber":"","handicapIndex":15.2,"tee":"Club"},
    {"id":"seed-guest-01","name":"Pat Plus","ghinNumber":"","handicapIndex":-3,"tee":"Club"},
    {"id":"seed-guest-02","name":"Taylor Two","ghinNumber":"","handicapIndex":2,"tee":"Club"}]'::jsonb,
  null, null, 'SEEDSK', 'full_18', 1
from public.courses c where c.id = 'seed-course-organizer-olivas'
on conflict (id) do nothing;

insert into public.round_players (id, user_id, round_id, player_id, tee_played, course_handicap, playing_handicap) values
  ('seed-rp-skins-1', '00000000-0000-4000-8000-000000000001', 'seed-round-skins', '00000000-0000-4000-8000-000000000001', 'Club', 10, 10),
  ('seed-rp-skins-2', '00000000-0000-4000-8000-000000000001', 'seed-round-skins', '00000000-0000-4000-8000-000000000002', 'Club', 16, 16),
  ('seed-rp-skins-3', '00000000-0000-4000-8000-000000000001', 'seed-round-skins', 'seed-guest-01', 'Club', -3, -3),
  ('seed-rp-skins-4', '00000000-0000-4000-8000-000000000001', 'seed-round-skins', 'seed-guest-02', 'Club', 2, 2)
on conflict (id) do nothing;

insert into public.round_participants (id, round_id, user_id, player_id, status) values
  ('seed-part-skins-1', 'seed-round-skins', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'accepted'),
  ('seed-part-skins-2', 'seed-round-skins', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'accepted')
on conflict do nothing;

-- 18 holes for four players. Gross = par plus a deterministic wobble in -1..+2
-- so the card has birdies, pars, bogeys and a few doubles.
insert into public.hole_scores (id, user_id, round_id, player_id, hole_number, gross_score, score_status, submitted_by)
select
  'seed-hs-skins-' || h.n || '-' || p.idx,
  '00000000-0000-4000-8000-000000000001', 'seed-round-skins', p.player_id, h.n,
  (hole.par)::int + ((h.n * 7 + p.idx * 5) % 4) - 1,
  'approved', '00000000-0000-4000-8000-000000000001'
from generate_series(1, 18) as h(n)
cross join (values
  (1, '00000000-0000-4000-8000-000000000001'),
  (2, '00000000-0000-4000-8000-000000000002'),
  (3, 'seed-guest-01'),
  (4, 'seed-guest-02')
) as p(idx, player_id)
cross join lateral (
  select (elem->>'par')::int as par
  from public.courses c, jsonb_array_elements(c.holes) elem
  where c.id = 'seed-course-organizer-olivas' and (elem->>'number')::int = h.n
) as hole
on conflict do nothing;

insert into public.buy_ins (id, user_id, round_id, player_id, amount_cents, method, status, paid_at) values
  ('seed-buyin-skins-1', '00000000-0000-4000-8000-000000000001', 'seed-round-skins', '00000000-0000-4000-8000-000000000001', 500, 'venmo', 'marked_paid', now() - interval '7 days'),
  ('seed-buyin-skins-2', '00000000-0000-4000-8000-000000000001', 'seed-round-skins', '00000000-0000-4000-8000-000000000002', 500, 'venmo', 'marked_paid', now() - interval '7 days'),
  ('seed-buyin-skins-3', '00000000-0000-4000-8000-000000000001', 'seed-round-skins', 'seed-guest-01', 500, 'cash', 'marked_paid', now() - interval '7 days'),
  ('seed-buyin-skins-4', '00000000-0000-4000-8000-000000000001', 'seed-round-skins', 'seed-guest-02', 500, 'cash', 'unpaid', null)
on conflict (id) do nothing;

-- Settlement rows as the organizer's device would have written them at the end
-- of the round: one owed and still open, one reported by the payer.
insert into public.settlements (id, user_id, round_id, from_player_id, to_player_id, amount_cents, reason, source, status, player_reported_at, reported_method) values
  ('seed-settle-skins-1', '00000000-0000-4000-8000-000000000001', 'seed-round-skins', 'seed-guest-02', '00000000-0000-4000-8000-000000000001', 700, 'Skins', 'game', 'owed', null, null),
  ('seed-settle-skins-2', '00000000-0000-4000-8000-000000000001', 'seed-round-skins', '00000000-0000-4000-8000-000000000002', 'seed-guest-01', 500, 'Skins', 'game', 'owed', now() - interval '6 days', 'venmo')
on conflict (id) do nothing;

-- ── Open Wolf round on hole 7 ───────────────────────────────────────────────
-- organizer, joiner, Eli Eight, Drew Dozen at River Ridge Vineyard, White tees.
-- Six holes scored, six picks recorded: a partner on 1, 3, 4 and 6, lone wolf
-- on 2, blind wolf on 5. The wolf order rotates organizer, joiner, Eli, Drew.

insert into public.rounds (
  id, user_id, course_id, date, status, current_hole, course_snapshot, game,
  treasurer_player_id, players, groups, game_master_id, invite_code, holes_mode, starting_hole
)
select
  'seed-round-wolf', '00000000-0000-4000-8000-000000000001', 'seed-course-organizer-vineyard',
  now() - interval '90 minutes', 'active', 7,
  jsonb_build_object('courseId', 'seed-course-organizer-vineyard', 'courseName', c.name, 'tees', c.tees, 'holes', c.holes),
  jsonb_build_object(
    'id', 'seed-game-wolf', 'type', 'wolf', 'buyInCents', 1000, 'stakesMode', 'points',
    'config', jsonb_build_object(
      'mode', 'net',
      'wolfOrder', jsonb_build_array('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'seed-guest-03', 'seed-guest-04'),
      'blindWolf', true,
      'payModel', 'pot',
      'holeDecisions', jsonb_build_object(
        '1', jsonb_build_object('partnerId', '00000000-0000-4000-8000-000000000002'),
        '2', jsonb_build_object('partnerId', null),
        '3', jsonb_build_object('partnerId', 'seed-guest-03'),
        '4', jsonb_build_object('partnerId', '00000000-0000-4000-8000-000000000001'),
        '5', jsonb_build_object('partnerId', null, 'blind', true),
        '6', jsonb_build_object('partnerId', 'seed-guest-04')
      )
    )
  ),
  '00000000-0000-4000-8000-000000000001',
  '[{"id":"00000000-0000-4000-8000-000000000001","name":"Olive Organizer","ghinNumber":"","handicapIndex":9.4,"tee":"White"},
    {"id":"00000000-0000-4000-8000-000000000002","name":"Jay Joiner","ghinNumber":"","handicapIndex":15.2,"tee":"White"},
    {"id":"seed-guest-03","name":"Eli Eight","ghinNumber":"","handicapIndex":8,"tee":"White"},
    {"id":"seed-guest-04","name":"Drew Dozen","ghinNumber":"","handicapIndex":12,"tee":"White"}]'::jsonb,
  null, null, 'SEEDWF', 'full_18', 1
from public.courses c where c.id = 'seed-course-organizer-vineyard'
on conflict (id) do nothing;

insert into public.round_players (id, user_id, round_id, player_id, tee_played, course_handicap, playing_handicap) values
  ('seed-rp-wolf-1', '00000000-0000-4000-8000-000000000001', 'seed-round-wolf', '00000000-0000-4000-8000-000000000001', 'White', 10, 10),
  ('seed-rp-wolf-2', '00000000-0000-4000-8000-000000000001', 'seed-round-wolf', '00000000-0000-4000-8000-000000000002', 'White', 17, 17),
  ('seed-rp-wolf-3', '00000000-0000-4000-8000-000000000001', 'seed-round-wolf', 'seed-guest-03', 'White', 9, 9),
  ('seed-rp-wolf-4', '00000000-0000-4000-8000-000000000001', 'seed-round-wolf', 'seed-guest-04', 'White', 13, 13)
on conflict (id) do nothing;

insert into public.round_participants (id, round_id, user_id, player_id, status) values
  ('seed-part-wolf-1', 'seed-round-wolf', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'accepted'),
  ('seed-part-wolf-2', 'seed-round-wolf', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'accepted')
on conflict do nothing;

insert into public.hole_scores (id, user_id, round_id, player_id, hole_number, gross_score, score_status, submitted_by)
select
  'seed-hs-wolf-' || h.n || '-' || p.idx,
  '00000000-0000-4000-8000-000000000001', 'seed-round-wolf', p.player_id, h.n,
  (hole.par)::int + ((h.n * 5 + p.idx * 3) % 4) - 1,
  'approved', '00000000-0000-4000-8000-000000000001'
from generate_series(1, 6) as h(n)
cross join (values
  (1, '00000000-0000-4000-8000-000000000001'),
  (2, '00000000-0000-4000-8000-000000000002'),
  (3, 'seed-guest-03'),
  (4, 'seed-guest-04')
) as p(idx, player_id)
cross join lateral (
  select (elem->>'par')::int as par
  from public.courses c, jsonb_array_elements(c.holes) elem
  where c.id = 'seed-course-organizer-vineyard' and (elem->>'number')::int = h.n
) as hole
on conflict do nothing;

-- ── Event with two groups of four ───────────────────────────────────────────
-- Group 1: organizer (manager), admin, Pat Plus, Taylor Two.
-- Group 2: joiner (scorekeeper), Eli Eight, Drew Dozen, Frankie Fourteen.
-- Net Skins at Olivas Links, ready to start.

insert into public.rounds (
  id, user_id, course_id, date, status, current_hole, course_snapshot, game,
  treasurer_player_id, players, groups, game_master_id, invite_code, holes_mode, starting_hole
)
select
  'seed-round-event', '00000000-0000-4000-8000-000000000001', 'seed-course-organizer-olivas',
  now() + interval '2 days', 'active', 1,
  jsonb_build_object('courseId', 'seed-course-organizer-olivas', 'courseName', c.name, 'tees', c.tees, 'holes', c.holes),
  '{"id":"seed-game-event","type":"skins","buyInCents":500,"stakesMode":"points","config":{"mode":"net","carryovers":true,"payModel":"pot"}}'::jsonb,
  '00000000-0000-4000-8000-000000000001',
  '[{"id":"00000000-0000-4000-8000-000000000001","name":"Olive Organizer","ghinNumber":"","handicapIndex":9.4,"tee":"Club"},
    {"id":"00000000-0000-4000-8000-000000000003","name":"Ada Admin","ghinNumber":"","handicapIndex":4.1,"tee":"Club"},
    {"id":"seed-guest-01","name":"Pat Plus","ghinNumber":"","handicapIndex":-3,"tee":"Club"},
    {"id":"seed-guest-02","name":"Taylor Two","ghinNumber":"","handicapIndex":2,"tee":"Club"},
    {"id":"00000000-0000-4000-8000-000000000002","name":"Jay Joiner","ghinNumber":"","handicapIndex":15.2,"tee":"Club"},
    {"id":"seed-guest-03","name":"Eli Eight","ghinNumber":"","handicapIndex":8,"tee":"Club"},
    {"id":"seed-guest-04","name":"Drew Dozen","ghinNumber":"","handicapIndex":12,"tee":"Club"},
    {"id":"seed-guest-05","name":"Frankie Fourteen","ghinNumber":"","handicapIndex":14,"tee":"Club"}]'::jsonb,
  '{"00000000-0000-4000-8000-000000000001":1,"00000000-0000-4000-8000-000000000003":1,"seed-guest-01":1,"seed-guest-02":1,
    "00000000-0000-4000-8000-000000000002":2,"seed-guest-03":2,"seed-guest-04":2,"seed-guest-05":2}'::jsonb,
  null, 'SEEDEV', 'full_18', 1
from public.courses c where c.id = 'seed-course-organizer-olivas'
on conflict (id) do nothing;

insert into public.events (id, user_id, name, status, round_id, invite_code, group_scorekeepers) values
  ('seed-event-1', '00000000-0000-4000-8000-000000000001', 'Staging Invitational', 'active', 'seed-round-event', 'SEEDEV',
   '{"1":"00000000-0000-4000-8000-000000000001","2":"00000000-0000-4000-8000-000000000002"}'::jsonb)
on conflict (id) do nothing;

update public.rounds set event_id = 'seed-event-1'
where id = 'seed-round-event' and event_id is null;

insert into public.round_players (id, user_id, round_id, player_id, tee_played, course_handicap, playing_handicap) values
  ('seed-rp-event-1', '00000000-0000-4000-8000-000000000001', 'seed-round-event', '00000000-0000-4000-8000-000000000001', 'Club', 10, 10),
  ('seed-rp-event-2', '00000000-0000-4000-8000-000000000001', 'seed-round-event', '00000000-0000-4000-8000-000000000003', 'Club', 4, 4),
  ('seed-rp-event-3', '00000000-0000-4000-8000-000000000001', 'seed-round-event', 'seed-guest-01', 'Club', -3, -3),
  ('seed-rp-event-4', '00000000-0000-4000-8000-000000000001', 'seed-round-event', 'seed-guest-02', 'Club', 2, 2),
  ('seed-rp-event-5', '00000000-0000-4000-8000-000000000001', 'seed-round-event', '00000000-0000-4000-8000-000000000002', 'Club', 16, 16),
  ('seed-rp-event-6', '00000000-0000-4000-8000-000000000001', 'seed-round-event', 'seed-guest-03', 'Club', 9, 9),
  ('seed-rp-event-7', '00000000-0000-4000-8000-000000000001', 'seed-round-event', 'seed-guest-04', 'Club', 13, 13),
  ('seed-rp-event-8', '00000000-0000-4000-8000-000000000001', 'seed-round-event', 'seed-guest-05', 'Club', 15, 15)
on conflict (id) do nothing;

insert into public.round_participants (id, round_id, user_id, player_id, status) values
  ('seed-part-event-1', 'seed-round-event', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'accepted'),
  ('seed-part-event-2', 'seed-round-event', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'accepted'),
  ('seed-part-event-3', 'seed-round-event', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', 'accepted')
on conflict do nothing;

-- Guests have no account, so only the three registered players carry an
-- event_participants row. Guests ride on rounds.players and rounds.groups.
insert into public.event_participants (id, event_id, user_id, player_id, role, group_number, status) values
  ('seed-ep-1', 'seed-event-1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'manager',     1, 'accepted'),
  ('seed-ep-2', 'seed-event-1', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', 'player',      1, 'accepted'),
  ('seed-ep-3', 'seed-event-1', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'scorekeeper', 2, 'accepted')
on conflict do nothing;

commit;
