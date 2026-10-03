-- Stop the new read surface without returning broad legacy access or changing rows.
-- Set DESIGN_QUEUE_PRODUCTION_ENABLED=false and publish before applying this stop.
BEGIN;
REVOKE SELECT(id,order_id,title,task_status,layout_status,priority,deadline,designer_name,task_text,layout_link,reference_link,created_at,updated_at) ON public.leader_design_tasks FROM authenticated;
COMMIT;
-- Private snapshot design-read-20261003-v1 retains original ACL/RLS and complete rows.
-- Re-enable only with a reviewed safe SELECT grant; never restore legacy DML.
