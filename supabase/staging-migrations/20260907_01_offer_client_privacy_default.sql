-- STAGING ONLY: make commercial offers anonymous by default while preserving
-- the existing transactional offer creation RPC and its security boundary.
-- Production project ofewxuqfjhamgerwzull must not execute this file.

DO $migration$
DECLARE
  v_definition text;
  v_original text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM leader_staging.environment_guard
    WHERE singleton = true
      AND project_ref = 'otulfnouybahfnsycxqn'
      AND environment_name = 'staging'
      AND repository = 'deputat36/lider-bsk'
  ) THEN
    RAISE EXCEPTION 'staging_environment_guard_failed';
  END IF;

  SELECT pg_get_functiondef(
    'leader_private.leader_create_offer_from_calculation_rpc_internal_v1(jsonb)'::regprocedure
  ) INTO v_definition;
  v_original := v_definition;

  IF position('  v_extra_comment text;' in v_definition) = 0 THEN
    RAISE EXCEPTION 'offer_privacy_patch_declaration_marker_missing';
  END IF;
  v_definition := replace(
    v_definition,
    '  v_extra_comment text;',
    '  v_extra_comment text;' || E'\n' || '  v_include_client_details boolean := false;'
  );

  IF position(
    'where key not in (''calculation_id'', ''idempotency_key'', ''title'', ''valid_until'', ''extra_comment'')'
    in v_definition
  ) = 0 THEN
    RAISE EXCEPTION 'offer_privacy_patch_whitelist_marker_missing';
  END IF;
  v_definition := replace(
    v_definition,
    'where key not in (''calculation_id'', ''idempotency_key'', ''title'', ''valid_until'', ''extra_comment'')',
    'where key not in (''calculation_id'', ''idempotency_key'', ''title'', ''valid_until'', ''extra_comment'', ''include_client_details'')'
  );

  IF position(
    $$or (
       v_payload ? 'extra_comment'
       and jsonb_typeof(v_payload -> 'extra_comment') not in ('string', 'null')
     ) then$$
    in v_definition
  ) = 0 THEN
    RAISE EXCEPTION 'offer_privacy_patch_type_marker_missing';
  END IF;
  v_definition := replace(
    v_definition,
    $$or (
       v_payload ? 'extra_comment'
       and jsonb_typeof(v_payload -> 'extra_comment') not in ('string', 'null')
     ) then$$,
    $$or (
       v_payload ? 'extra_comment'
       and jsonb_typeof(v_payload -> 'extra_comment') not in ('string', 'null')
     )
     or (
       v_payload ? 'include_client_details'
       and jsonb_typeof(v_payload -> 'include_client_details') not in ('boolean', 'null')
     ) then$$
  );

  IF position(
    $$  v_extra_comment := nullif(btrim(v_payload ->> 'extra_comment'), '');$$
    in v_definition
  ) = 0 THEN
    RAISE EXCEPTION 'offer_privacy_patch_assignment_marker_missing';
  END IF;
  v_definition := replace(
    v_definition,
    $$  v_extra_comment := nullif(btrim(v_payload ->> 'extra_comment'), '');$$,
    $$  v_extra_comment := nullif(btrim(v_payload ->> 'extra_comment'), '');
  v_include_client_details := coalesce((v_payload ->> 'include_client_details')::boolean, false);$$
  );

  IF position($$    'extra_comment', v_extra_comment$$ in v_definition) = 0 THEN
    RAISE EXCEPTION 'offer_privacy_patch_hash_marker_missing';
  END IF;
  v_definition := replace(
    v_definition,
    $$    'extra_comment', v_extra_comment$$,
    $$    'extra_comment', v_extra_comment,
    'include_client_details', v_include_client_details$$
  );

  IF position(
    $$  v_short_text := 'Здравствуйте' || case when v_lead_name is null then '!' else ', ' || v_lead_name || '!' end$$
    in v_definition
  ) = 0 THEN
    RAISE EXCEPTION 'offer_privacy_patch_greeting_marker_missing';
  END IF;
  v_definition := replace(
    v_definition,
    $$  v_short_text := 'Здравствуйте' || case when v_lead_name is null then '!' else ', ' || v_lead_name || '!' end$$,
    $$  v_short_text := 'Здравствуйте' || case when not v_include_client_details or v_lead_name is null then '!' else ', ' || v_lead_name || '!' end$$
  );

  IF position(
    $$    || E'\n\nКлиент: ' || coalesce(v_lead_name, 'не указано')
    || case when v_lead_phone is null then '' else E'\nТелефон: ' || v_lead_phone end
    || E'\n\nЗадача клиента\n' || v_need_text$$
    in v_definition
  ) = 0 THEN
    RAISE EXCEPTION 'offer_privacy_patch_identity_marker_missing';
  END IF;
  v_definition := replace(
    v_definition,
    $$    || E'\n\nКлиент: ' || coalesce(v_lead_name, 'не указано')
    || case when v_lead_phone is null then '' else E'\nТелефон: ' || v_lead_phone end
    || E'\n\nЗадача клиента\n' || v_need_text$$,
    $$    || case
      when v_include_client_details and (v_lead_name is not null or v_lead_phone is not null) then
        E'\n\n'
        || case when v_lead_name is null then '' else 'Клиент: ' || v_lead_name end
        || case
          when v_lead_phone is null then ''
          else case when v_lead_name is null then '' else E'\n' end || 'Телефон: ' || v_lead_phone
        end
      else ''
    end
    || E'\n\nЗадача клиента\n' || v_need_text$$
  );

  IF v_definition = v_original THEN
    RAISE EXCEPTION 'offer_privacy_patch_did_not_change_definition';
  END IF;

  EXECUTE v_definition;

  SELECT pg_get_functiondef(
    'leader_private.leader_create_offer_from_calculation_rpc_internal_v1(jsonb)'::regprocedure
  ) INTO v_definition;

  IF position('include_client_details' in v_definition) = 0
     OR position('not v_include_client_details' in v_definition) = 0
     OR position('v_include_client_details and (v_lead_name is not null or v_lead_phone is not null)' in v_definition) = 0 THEN
    RAISE EXCEPTION 'offer_privacy_patch_postcondition_failed';
  END IF;
END
$migration$;
