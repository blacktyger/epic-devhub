# Hosting the docs

The site is a static build. There is no application server, no database, and no runtime state, so
hosting is: copy a directory, point nginx at it, reload. Everything in this folder exists to make
that repeatable rather than remembered.

| File | What it is |
| --- | --- |
| `nginx.conf` | Server block for `devdocs.epiccash.com`, serving `/var/www/epic-devhub` |
| `publish.sh` | Build locally, upload as a timestamped release, swap a symlink, reload nginx |

## First-time server setup

Run these once on the Ubuntu box. They are separate commands on purpose; do not paste them as a
block without reading each one.

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx rsync
sudo mkdir -p /var/www/epic-devhub-releases /var/www/certbot
sudo chown -R "$USER":"$USER" /var/www/epic-devhub-releases
```

`publish.sh` writes each build to `/var/www/epic-devhub-releases/<utc-timestamp>/` and then points
`/var/www/epic-devhub` at it as a symlink. That is the path `nginx.conf` uses as its root, so the
symlink must exist before the first reload. The first `publish.sh` run creates it.

Install the server block, then get a certificate:

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/epic-devhub
sudo ln -s /etc/nginx/sites-available/epic-devhub /etc/nginx/sites-enabled/epic-devhub
sudo nginx -t
sudo certbot --nginx -d devdocs.epiccash.com
```

`certbot --nginx` edits the file in place to add the certificate paths. The committed copy already
contains the `ssl_certificate` lines pointing at `/etc/letsencrypt/live/devdocs.epiccash.com/`, so
if certbot has already run for this domain the config is correct as written and `nginx -t` passes
before you touch certbot at all. If the certificate does not exist yet, `nginx -t` fails on the
missing file: comment out the two `ssl_certificate` lines, reload, run certbot, uncomment.

DNS has to resolve to the box before certbot will issue anything, because the HTTP-01 challenge is
served from `/.well-known/acme-challenge/` on port 80.

## Publishing

From the repository root, on your machine:

```bash
deploy/publish.sh user@host
```

That runs `npm ci && npm run build` in `site/`, refuses to continue if the build produced no
`index.html`, uploads, swaps the symlink, prunes to the five most recent releases, and reloads
nginx. `DRY_RUN=1` transfers nothing and only reports what rsync would send.

The build itself is the gate on content: Docusaurus is configured to fail on a broken internal link
or a missing heading anchor, so a successful build already proves the link graph is intact. Nothing
in the publish path re-checks it.

## Rolling back

Releases are kept, so a rollback is a symlink swap and needs no rebuild:

```bash
ls -1t /var/www/epic-devhub-releases
ln -sfn /var/www/epic-devhub-releases/<older-stamp> /var/www/epic-devhub.new
mv -Tf /var/www/epic-devhub.new /var/www/epic-devhub
sudo systemctl reload nginx
```

`mv -Tf` over an existing symlink is atomic, which is why the swap goes through a temporary name
instead of `rm` then `ln`. A reader mid-request never sees a missing root.

Only five releases are retained. If you need to go further back, rebuild from the matching commit.

## What is deliberately absent

No reverse proxy to another service, and no route that accepts a request body. The API console in
the docs is client-side only and issues no network calls, so the site has no backend to expose.
Adding one, for the AI assistant or anything else, changes the threat model and belongs in its own
config file and its own review rather than arriving as a side effect of publishing documentation.

The Content-Security-Policy in `nginx.conf` allows `'unsafe-inline'` for scripts because Docusaurus
emits an inline hydration bootstrap. Tighten it only after checking a real build; a CSP that blocks
hydration renders every page blank.
