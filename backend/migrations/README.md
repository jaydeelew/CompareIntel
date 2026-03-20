# Database Migrations

This directory contains Alembic database migrations for CompareIntel.

## Quick Reference

### Generate a new migration
```bash
cd backend
alembic revision --autogenerate -m "description of changes"
```

### Apply all pending migrations
```bash
alembic upgrade head
```

### Rollback last migration
```bash
alembic downgrade -1
```

### View migration history
```bash
alembic history
```

### View current revision
```bash
alembic current
```

## Migration Guidelines

1. **Always review auto-generated migrations** - Alembic's autogenerate is helpful but not perfect
2. **Test migrations both ways** - Ensure both `upgrade()` and `downgrade()` work
3. **Use descriptive messages** - Migration messages should describe the change clearly
4. **Never modify applied migrations** - Create a new migration instead
5. **Handle data migrations carefully** - For data transformations, test thoroughly

## Environment Setup

Migrations use the `DATABASE_URL` environment variable or fall back to the app settings.

For production:
```bash
export DATABASE_URL=postgresql://user:pass@host:5432/compareintel
alembic upgrade head
```

For development:
```bash
# Uses SQLite by default if DATABASE_URL is not set
alembic upgrade head
```

## Initial Setup

When setting up a new database:

1. Ensure `DATABASE_URL` is set correctly
2. Run `alembic upgrade head` to create all tables
3. Optionally run `python create_admin_user.py` to create an admin user

## Troubleshooting

### "Target database is not up to date"
Run `alembic upgrade head` before generating new migrations.

### Autogenerate doesn't detect changes
- Ensure all models are imported in `migrations/env.py`
- Some changes (like column renames) need manual migration

### SQLite limitations
SQLite doesn't support all ALTER TABLE operations. Alembic's batch mode handles most cases,
but complex changes may require manual migration scripts.

### "Can't locate revision identified by '…'" (orphan `alembic_version`)

This happens when the database’s `alembic_version.version_num` refers to a revision id that no
longer exists in `migrations/versions` (for example after squashing history into `0001_initial`
and numeric ids, while production was stamped on an old name such as
`add_breakout_conversation_fields`).

1. **Back up the database** (e.g. `./deploy-production.sh backup` on the production host).
2. **Infer a safe stamp** — inspect DDL and align to the current chain (`0001_initial` →
   `0002_images` → `0003_composer_adv` → `0004_composer_image`), or run the helper:

   ```bash
   docker compose -f docker-compose.ssl.yml exec backend \
     python /app/scripts/alembic_suggest_stamp.py
   ```

3. **Reconcile and upgrade** (example; use the revision the script prints if it differs):

   ```bash
   docker compose -f docker-compose.ssl.yml exec backend alembic stamp 0002_images
   docker compose -f docker-compose.ssl.yml exec backend alembic upgrade head
   ```

`stamp` only updates `alembic_version`; it does **not** run migration `upgrade()` code. Choose the
stamp that matches **columns already present** so `upgrade head` applies only missing migrations.

**Column hints for manual checks**

| Revision              | Observable columns |
| --------------------- | ------------------- |
| `0002_images`         | `conversation_messages.images` |
| `0003_composer_adv`   | `conversations.composer_temperature`, `composer_top_p`, `composer_max_tokens` |
| `0004_composer_image` | `conversations.composer_aspect_ratio`, `composer_image_size` |
