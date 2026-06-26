revoke execute on function public.leader_ensure_profile(text) from authenticated;
revoke execute on function public.nav_save_wizard_deal(jsonb) from authenticated;
revoke execute on function public.nav_v2_save_wizard_result(jsonb) from authenticated;
revoke execute on function public.nav_v2_submit_spn_rework(uuid, text) from authenticated;
revoke execute on function public.nav_v2_return_spn_rework(uuid, text) from authenticated;
revoke execute on function public.nav_v2_add_deal_review(uuid, text, text, boolean, boolean) from authenticated;
revoke execute on function public.nav_v2_get_deal_responsibility_snapshot(uuid) from authenticated;
revoke execute on function public.nav_v2_get_my_profile() from authenticated;
