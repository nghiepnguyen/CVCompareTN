-- Read-only checks after applying the R2 migration. No CV/user rows are modified.
DO $$
DECLARE target_table text; n integer;
BEGIN
 SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('saved_cvs','candidate_cvs') AND column_name IN ('storage_provider','storage_status');
 ASSERT n=4, 'R2 metadata columns missing';
 FOREACH target_table IN ARRAY ARRAY['storage_uploads','storage_cleanup_jobs','storage_blocked_users'] LOOP
  ASSERT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname='public' AND c.relname=target_table AND c.relrowsecurity), 'Storage internal table RLS missing';
  ASSERT NOT has_table_privilege('authenticated','public.'||target_table,'SELECT'), 'Internal storage data exposed to authenticated';
  ASSERT NOT has_table_privilege('anon','public.'||target_table,'SELECT'), 'Internal storage data exposed to anon';
  ASSERT has_table_privilege('service_role','public.'||target_table,'INSERT'), 'Storage service permission missing';
 END LOOP;
 ASSERT NOT has_function_privilege('authenticated','public.storage_reserve_upload(uuid,uuid,text,uuid,text,text,bigint)','EXECUTE');
 ASSERT NOT has_function_privilege('anon','public.storage_claim_upload(uuid,uuid,uuid)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','public.storage_publish_upload(uuid,uuid,uuid)','EXECUTE');
 ASSERT has_function_privilege('service_role','public.storage_publish_upload(uuid,uuid,uuid)','EXECUTE');
 SELECT count(*) INTO n FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('storage_saved_deleted','storage_candidate_deleted','storage_saved_delete_pending','storage_candidate_delete_pending','storage_user_deleted','storage_saved_protect','storage_candidate_protect');
 ASSERT n=7, 'Storage lifecycle/protection triggers missing';
END $$;
SELECT jsonb_build_object(
 'metadata_columns',(SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('saved_cvs','candidate_cvs') AND column_name IN ('storage_provider','storage_status')),
 'internal_tables_with_rls',(SELECT count(*) FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname='public' AND c.relname IN ('storage_uploads','storage_cleanup_jobs','storage_blocked_users') AND c.relrowsecurity),
 'storage_triggers',(SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('storage_saved_deleted','storage_candidate_deleted','storage_saved_delete_pending','storage_candidate_delete_pending','storage_user_deleted','storage_saved_protect','storage_candidate_protect')),
 'schema_verified',true
) AS r2_schema;
