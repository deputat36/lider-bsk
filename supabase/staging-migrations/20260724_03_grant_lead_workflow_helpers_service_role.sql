-- STAGING ONLY.
-- The public workflow RPC is invoked by the staging Edge function as service_role.
-- Its private helper functions must therefore be executable by service_role only.

revoke all on function leader_private.leader_lead_workflow_error(uuid, text, text) from public;
revoke all on function leader_private.leader_lead_workflow_error(uuid, text, text) from anon;
revoke all on function leader_private.leader_lead_workflow_error(uuid, text, text) from authenticated;
grant execute on function leader_private.leader_lead_workflow_error(uuid, text, text) to service_role;

revoke all on function leader_private.leader_lead_status_requires_assignee(text) from public;
revoke all on function leader_private.leader_lead_status_requires_assignee(text) from anon;
revoke all on function leader_private.leader_lead_status_requires_assignee(text) from authenticated;
grant execute on function leader_private.leader_lead_status_requires_assignee(text) to service_role;

revoke all on function leader_private.leader_lead_status_requires_future_contact(text) from public;
revoke all on function leader_private.leader_lead_status_requires_future_contact(text) from anon;
revoke all on function leader_private.leader_lead_status_requires_future_contact(text) from authenticated;
grant execute on function leader_private.leader_lead_status_requires_future_contact(text) to service_role;
