-- Allow every dot type the client can send.
--
-- The Dots game records its awards as junk_records rows (junk_type holds the
-- DotType). The original check constraint only knew the five Junks types, so the
-- five Dots-only types (fairway_hit, up_and_down, one_putt, longest_drive,
-- par_save) failed with 23514 while the client showed the dot as awarded.
--
-- Safe to rerun: drop if exists, then add. The list below must stay in step with
-- DOT_LABELS in src/lib/gameLogic.ts; src/lib/__tests__/junkTypes.test.ts checks it.

alter table public.junk_records
  drop constraint if exists junk_records_junk_type_check;

alter table public.junk_records
  add constraint junk_records_junk_type_check
  check (junk_type = any (array[
    'sandy',
    'greenie',
    'snake',
    'barkie',
    'ctp',
    'fairway_hit',
    'up_and_down',
    'one_putt',
    'longest_drive',
    'par_save'
  ]::text[]));
