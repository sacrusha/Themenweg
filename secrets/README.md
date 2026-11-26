# secrets/

Local credentials. Git ignores everything in this folder except this README.

## cloudflare.env — deploying to Cloudflare Pages

The GitHub Pages workflow publishes every push to main. A repository that
can't use it (a private one on GitHub's free plan has no Pages), or whose
pushes shouldn't all go out, publishes from the maintainer's computer
instead: `npm run deploy` in `src/`, to Cloudflare Pages (the free plan is
enough). Nothing runs it but a person, so the site changes when someone
decides it should; a forgotten deploy leaves the previous version up.

It refuses while this file is incomplete or `src/` or the trail folder has
uncommitted changes, so what goes out is a commit. Then it runs
`npm run check` and `npm run build`, creates the Pages project on first use
(production branch `main`), and deploys `src/dist/` to it as production. It
touches no other project. A project created beforehand in the dashboard with
another production branch would get preview deployments instead.

The file, to be filled in:

    CLOUDFLARE_ACCOUNT_ID=
    CLOUDFLARE_API_TOKEN=
    CLOUDFLARE_PAGES_PROJECT=
    # THEMENWEG_TRAIL=
    # THEMENWEG_UNLISTED=1

- `CLOUDFLARE_ACCOUNT_ID` — the 32-character account ID. In the Cloudflare
  dashboard, Workers & Pages → Overview, right-hand column; or in the URL
  after `dash.cloudflare.com/`.
- `CLOUDFLARE_API_TOKEN` — an API token (My Profile → API Tokens → Create
  Token → Custom token), limited to that one account, with these
  permissions:
  - Account · Cloudflare Pages · Edit — the project and its deployments
  - Account · Account Settings · Read — wrangler looks up the account

  No zone permissions are needed while the site uses its `pages.dev`
  address. An expiry date (TTL) on the token is a good idea.
- `CLOUDFLARE_PAGES_PROJECT` — the Pages project's name. The site's address
  becomes `<name>.pages.dev`; where another account holds that name,
  Cloudflare gives the project another address, which the deploy prints.
- `THEMENWEG_TRAIL` — the folder under `trails/` to publish, needed where
  there are several (docs/design/trail-content.md, Building and checking).
- `THEMENWEG_UNLISTED` — `1` for a site whose address is given only to
  the people it is for (a preview for a publisher, a demo): its pages ask
  search engines not to list them or follow their links, by a robots meta
  tag and, on Cloudflare Pages, an `X-Robots-Tag` header on every file. It
  doesn't hide the site from anyone who has or guesses the address.

The deploy takes these names from this file only and ignores them in the
shell, so the file alone says which trail goes to which project.

## cloudflare.&lt;target&gt;.env — a further site from the same repository

Where one repository publishes more than one site (several trails, or one
trail at a second address), each further site has a file of its own,
`cloudflare.<target>.env` (lower-case letters, digits and hyphens), and
`npm run deploy -- <target>` publishes it:

    CLOUDFLARE_PAGES_PROJECT=
    # THEMENWEG_TRAIL=
    # THEMENWEG_UNLISTED=1

It holds no credentials: the account and the token are `cloudflare.env`'s,
so rolling the token touches one file. It inherits nothing else from
`cloudflare.env` either: a target's file without a project is refused
rather than sent to the default's, and one without a trail takes the only
folder under `trails/`, not the default's trail. `npm run deploy` without a
target publishes what `cloudflare.env` names. The first line
the deploy prints names the trail, the project and the file it read.

If the token leaks, roll it in the dashboard (API Tokens → ⋯ → Roll) and put
the new value here.
