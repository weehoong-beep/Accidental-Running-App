# Accidental Running App

## Deployment

This repo's Netlify site (`accidental-running-app`) is connected to GitHub via
Netlify's native git integration. **To deploy: just merge into the default
branch.** Netlify auto-builds and deploys on push — no manual step needed.

- The repo's default/production branch is `claude/accidental-running-app-plan-1ysvt3`
  (there is no branch literally named `main`).
- Merging a PR into that branch triggers a production deploy automatically.
- Opening a PR *against* that branch triggers a Netlify deploy preview
  (posted as a bot comment/status check on the PR) — but a PR against any
  other branch does not, since previews are scoped to PRs targeting the
  production branch.
- Do NOT use the Netlify MCP's `deploy-site` tool / `npx @netlify/mcp` CLI
  flow to deploy manually — it shells out to `netlify-mcp.netlify.app`,
  which is blocked by this sandbox's egress policy (confirmed 403 policy
  denial at the proxy level). It will not work; don't waste time retrying it.
  Git-based deploys bypass this entirely since they run outside the sandbox.
