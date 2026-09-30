# SponsorKit 17.1.1 compatibility patch

`sponsorkit@17.1.1.patch` is applied by pnpm through `patchedDependencies`
in `pnpm-workspace.yaml`. The lockfile pins its hash. It changes only the
published Patreon provider, badge display name, and name sort fallback.
No additional runtime dependencies are required.

## Why this patch exists

The [September 30 scheduler job](https://github.com/DIYgod/sponsors/actions/runs/36651888045/job/109687663674)
fetched 57 Patreon sponsorships at 00:46:06 UTC, then failed while composing
SVG at 00:46:10 UTC because `(sponsor.name || sponsor.login).trim()` received
`undefined`. The logs do not identify which provider supplied the missing name.

Separately, SponsorKit 17.1.1 (and upstream main when inspected on September 30)
still discovers campaigns through the deprecated v1 endpoint. Patreon's
[official migration guide](https://docs.patreon.com/#migrating-from-api-v1-to-api-v2)
announces that v1 calls stop working on October 7, 2026.

## Behavior

- Discover the first owned campaign through `/api/oauth2/v2/campaigns`.
  This retains the existing single-campaign selection. V2 returns its ID
  without requesting extra fields. An empty list raises a descriptive error.
- Preserve the existing members request, amount rounding, gifted-tier fallback,
  former/declined member handling, public classification, and free-member filter.
- Retain `links.next` pagination and add the documented
  `meta.pagination.cursors.next` fallback. Cursor requests retain all fields and
  includes and URL-encode the opaque cursor.
- Send an identifying User-Agent, as required by Patreon's documentation.
- Allow null/missing user fields and optional included resources while retaining
  the sponsorship. Patreon's [User resource](https://docs.patreon.com/#user-v2)
  permits identity fields to be empty or null when a member hides their identity.
- Render the trimmed name, then trimmed login, then `Anonymous`. Keep the avatar
  and existing label escaping/truncation. Sorting also tolerates missing names
  when sponsorship amounts and dates tie. No identity is recovered from IDs.

## Validation

```sh
pnpm install --frozen-lockfile
pnpm test
```

The dependency patch is tested through the installed public package API and CLI.
All API responses are synthetic fixtures; unexpected fetches fail before network
I/O. CLI tests use a temporary cache and a child process without credentials.
They generate real SVG, PNG, and JSON for standard, wide, and simple layouts,
then delete their temporary outputs. They do not invoke the scheduler or write
the repository's generated sponsor files. A separate regression workflow runs
these tests with read-only repository permissions and no secrets.

These tests do not verify the production token, OAuth client type, scopes, or
live Patreon responses. The v2 campaign and members endpoints require `campaigns`
and `campaigns.members` respectively. The current official migration guidance
requires a v2 client. A separately authorized read-only live check using credentials
supplied through an approved secret mechanism is still needed before rollout;
do not use the production scheduler to perform that check.

## Maintenance

The fixes belong in SponsorKit upstream. A source implementation and Vitest
regressions were prepared against tag `v17.1.1` (commit
`f410756316dc9b610ab909c29035b3f79ab01b36`). This consumer patch was derived from
that build, keeping the published chunk names and changing only the affected
function and two expressions. It lets this repository adopt the fix before
an upstream release; it also requires review whenever SponsorKit is upgraded.

When a release contains all these fixes, update the dependency, remove the
`patchedDependencies` entry and this patch, regenerate the lockfile, and run
the same regressions. An unverified version upgrade alone does not establish
that either issue is fixed. Until then, retain the exact dependency version
and patch hash. Pushing this repository can trigger its existing production
scheduler, so review and the live credential check should precede any rollout.
