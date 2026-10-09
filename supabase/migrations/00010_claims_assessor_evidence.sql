-- Applied to the live project on 2026-08-18 as 20260818093649_claims_assessor_evidence
-- (outside the repo); recorded here so the repo matches the database.
alter table claims
  add column if not exists assessor_name text;

create policy claim_documents_owner on claim_documents
  for all to authenticated
  using (
    public.is_staff()
    or claim_id in (
      select id from claims
      where participant_id in (select id from participants where profile_id = auth.uid())
    )
  )
  with check (
    public.is_staff()
    or claim_id in (
      select id from claims
      where participant_id in (select id from participants where profile_id = auth.uid())
    )
  );
