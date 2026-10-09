-- Staff RLS for remaining tables + revoke public execute on definer helpers.

revoke execute on function public.current_profile() from public, anon;
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.current_profile() to authenticated;
grant execute on function public.is_staff() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_scores','aml_screenings','api_partners','audit_logs','claim_approvals',
    'claim_assessments','claim_documents','commission_rules','commissions',
    'crm_interactions','crm_tickets','documents','eligibility_rules','fraud_signals',
    'gl_accounts','journal_entries','journal_lines','kyc_records','leads',
    'notification_templates','participant_surplus','payment_installments',
    'policy_endorsements','policy_history','premium_tables','product_covers',
    'product_riders','reinsurance_cessions','reinsurance_treaties','role_permissions',
    'tax_levy_rules','underwriting_cases','underwriting_rules','workflow_definitions'
  ]
  loop
    begin
      execute format(
        'create policy staff_all_%I on %I for all to authenticated using (public.is_staff()) with check (public.is_staff())',
        t, t
      );
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
