# Owner-controlled portable deployment

The former AWS-specific deployment path is retired. Container images can be published manually to the repository owner's GitHub Container Registry by running **Publish portable containers** on `main`. The workflow uses only GitHub's short-lived repository token and creates matched `sha-<commit>` API and web images.

This package is deliberately provider-neutral. It can run on a server owned by the founder, but it does not create an account, server, DNS, TLS certificate, backup service, or public endpoint. The checked-in Compose file binds only to `127.0.0.1:8443`.

## Prepare a host

1. Install Docker Engine with Compose v2 on an owner-controlled host.
2. Copy `.env.example` to `.env` outside Git and replace every `CHANGE_ME` value with an independently generated secret. Set `IMAGE_OWNER` and one reviewed `IMAGE_TAG` from the same successful workflow run.
3. Place an owner-controlled certificate and private key at `certs/fullchain.pem` and `certs/privkey.pem`. Keep `certs/` untracked and restrict its permissions.
4. Authenticate the host to GHCR with an owner-controlled, read-packages-only token. Do not reuse a collaborator's credentials.
5. Run `docker compose --env-file .env config` and confirm the resolved image tags and loopback bind.
6. Start PostgreSQL, run the one-shot migration, then start the API, worker, web, and edge:

```sh
docker compose --env-file .env up -d postgres
docker compose --env-file .env run --rm migrate
docker compose --env-file .env up -d api worker web edge
```

Open `https://localhost:8443` only on the host or through an owner-controlled private tunnel, after verifying the certificate fingerprint. A public deployment requires a separate decision for hosting, TLS, authentication, backups, monitoring, cost controls, and recovery testing.

## Stop and recover

`docker compose down` stops containers without deleting the PostgreSQL volume. Never add `--volumes` during ordinary recovery. Back up the named database volume before migrations; perform a restore rehearsal on isolated storage before relying on it.
