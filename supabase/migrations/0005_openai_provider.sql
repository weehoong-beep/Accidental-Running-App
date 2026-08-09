-- Switches AI run/block/week analysis from Claude (Anthropic) to OpenAI.
--
-- Renaming rather than adding a parallel column since the app only ever
-- calls one provider at a time. Clears any stored value on the rename: an
-- existing Anthropic key is not a valid OpenAI key, so leaving it in place
-- would just cause silent auth failures until the athlete replaces it.

alter table public.integration_settings
  rename column anthropic_api_key to openai_api_key;

update public.integration_settings
  set openai_api_key = null
  where openai_api_key is not null;

comment on column public.integration_settings.openai_api_key is
  'OpenAI API key used by the analyze-run/analyze-block/analyze-week Edge Functions.';
