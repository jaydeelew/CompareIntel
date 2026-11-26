# Adding New Models

A text model is in the product only after three files agree and the rendering harness has saved replies:

- `backend/data/models_registry.json` has the row (`category` is anything except `"Image"`).
- `frontend/src/config/model_renderer_configs.json` has a renderer config for that id, or `frontend/src/config/renderer_defaults.json` has an explicit default entry with a reason.
- `rendering-harness/runs/` has a saved reply for each standard prompt (`01` through `06`), or `rendering-harness/coverage-allowlist.json` has an explicit reason.

Image models (`category` exactly `"Image"`) skip the renderer config and the harness. See [Image generation](../features/IMAGE_GENERATION.md).

CI checks this without calling a model API. `python3 backend/scripts/check_model_catalog.py` runs on every pull request. The rendering-harness job still re-renders new models offline when the registry, renderer, or harness paths change. Neither check spends OpenRouter credit.

## What the add writes

Registry rows and renderer configs are one commit:

1. The new registry document and the new renderer-config list are validated in memory. Validation covers required fields (`id`, `name`, `description`, `category`, `provider`), unique ids, `provider/model-name` id format, the renderer schema (delimiters, code-block preservation, compilable patterns), and the consistency rules above.
2. Only after that do the files change. Each file is written to a temp file in the same directory and renamed into place. When both files are part of the commit, a failure renaming the second file restores the first. A failed step leaves both files as they were.

Harness reply JSON under `rendering-harness/runs/admin-<timestamp>/` is written so the offline render has something to open. If the render, the catalog commit, or the coverage refresh fails, that attempt directory is deleted. Older batches are left alone so a retry can reuse complete replies instead of calling OpenRouter again.

## Path A: Admin panel (development only)

Adding a model in the admin UI calls `add_model` / `add_model_stream` in `backend/app/routers/admin/models_management.py`. Both refuse to run unless `ENVIRONMENT=development`.

For a text model the handler:

1. Builds the registry row in memory. It does not write `models_registry.json` yet.
2. Runs `python scripts/setup_model_renderer.py <model_id> --defer-coverage --defer-config-write --proposal-out <temp>`.
3. That script calls OpenRouter with the eight files in `rendering-harness/prompts` only when a complete saved reply is missing. It validates the model id before that call. It pattern-analyzes the replies and returns a renderer config in the proposal file. It does not write the registry or `model_renderer_configs.json`.
4. It renders the saved replies offline (`npm run harness -- --render-only`) when `npm` and `rendering-harness/node_modules` are available.
5. If the render fails or cannot start, the attempt directory is deleted and neither catalog file changes. The response says **Rendering harness failed** or that the harness **did not run**. It does not report success.
6. If the render passes, the handler validates the registry and the renderer configs together, then renames both files into place. A coverage-manifest failure rolls both files back.

Image models skip the harness and the renderer config. The handler still probes aspect ratios, validates the registry, and saves it atomically.

The OpenRouter snapshot upsert and the Help Me Choose benchmark script run after the catalog commit. They do not roll back the catalog if they fail.

## Path B: CLI

Do not hand-edit the two JSON files in separate steps. Pass the registry entry to the setup script so it can commit both files after the render.

1. Write the registry entry to a scratch file (this file is not `models_registry.json`):

   ```json
   {
     "id": "provider/model-id",
     "name": "Model Name",
     "description": "One sentence.",
     "category": "Language",
     "provider": "Provider"
   }
   ```

   `id` is `provider/model-name`: a lowercase provider slug, one slash, then the model name. `provider` is the registry bucket, such as `OpenAI` or `xAI`, and must match that bucket when the row lands.

2. From `backend/`, collect replies, render, and commit the registry and the renderer config together:

   ```bash
   python scripts/setup_model_renderer.py provider/model-id --model-json /tmp/new-model.json
   ```

   The script validates the id and the merged registry before any OpenRouter call. It reuses complete saved replies instead of paying again. It writes the renderer config only when this model does not have one yet. On success it replaces `models_registry.json` and `frontend/src/config/model_renderer_configs.json` together. If validation, the render, or the rename fails, both files stay as they were and the attempt directory is removed.

3. If the script says the offline render failed or did not start, fix the local Playwright setup and run the same command again. When no complete replies remain, collect them with the harness (this is the paid step, and it is not part of CI):

   ```bash
   cd rendering-harness
   npm run harness -- --dry-run --models=provider/model-id --max-usd=2
   npm run harness -- --models=provider/model-id --max-usd=2
   npm run generate-coverage
   ```

   `--max-usd` is the cap you are willing to approve for that batch. The dry-run prints the estimate and does not call the chat API. Then re-run `setup_model_renderer.py` so the catalog commit still happens in one step. The CI error names the model, the missing prompts, and `docs/development/ADDING_NEW_MODELS.md`.

4. Open the screenshots the harness wrote next to the saved replies (`rendering-harness/runs/<batch>/*.png`). Check leftover math, KaTeX errors, and currency or code that was swallowed. Do not commit the PNGs. `rendering-harness/runs/**/*.png` and `*.tar.gz` are gitignored. Attach the screenshots to the pull request description so the review can see the render without a paid re-run.

5. Refresh the coverage manifest if the setup script did not already:

   ```bash
   cd rendering-harness
   npm run generate-coverage
   ```

6. Run the same check CI runs:

   ```bash
   python3 backend/scripts/check_model_catalog.py
   ```

7. Commit the registry row, `frontend/src/config/model_renderer_configs.json` if it changed, the reply JSON files, and `rendering-harness/coverage.json`. Open the PR with the screenshots attached. The catalog check and the rendering harness job must pass. A `fail` or `incomplete` cell fails the harness job. `not-covered` does not. A missing saved reply for prompts `01`–`06` fails the catalog check unless the allowlist has a reason.

There is no separate "type a prompt in the app and look at it" step. The harness render is the check. The screenshots on the PR are how a reviewer sees it.

### Several new models

Collect replies in one harness batch, then commit each registry row with its own `setup_model_renderer.py --model-json` run so each pair of catalog writes stays atomic:

```bash
cd rendering-harness
npm run harness -- --dry-run --models=provider/a,provider/b --max-usd=4
npm run harness -- --models=provider/a,provider/b --max-usd=4
npm run generate-coverage
```

## Explicit default renderer

`frontend/src/config/renderer_defaults.json` is the only place a text model may ship without its own renderer config. Each entry needs `modelId` and a non-empty `reason` saying why the built-in default in `frontend/src/config/modelRendererRegistry.ts` is enough. An empty `entries` array means every text model needs a config row. A model cannot be both a default and a config row.

`getModelConfig()` still fills standard `\[...\]` and `\(...\)` when a JSON row omitted them. CI treats a row that is missing those delimiters as stale generator output. Re-run `python scripts/generate_renderer_configs.py` (or the setup script) so the file matches what the generator emits, then `python scripts/generate_renderer_configs.py --check` writes nothing and exits 0 when the file is current.

## Allowlist

`rendering-harness/coverage-allowlist.json` is the only place a newly added text model may ship without saved replies for the six standard prompts. Each entry needs `modelId` and a non-empty `reason`. An empty `entries` array means the gate applies to every new text model. Regenerate the manifest after editing the allowlist:

```bash
cd rendering-harness
npm run generate-coverage
```

Prompts `07-rare-formats` and `08-casual-prose` are optional for this gate. The harness coverage job still records all eight prompts.

## Image models

Image models are not scored by the harness and do not get a renderer config. Admin add detects `output_modalities` containing `"image"`, sets `category` to `"Image"` and `supports_image_generation` to true, skips renderer setup, and stores aspect ratios from `scripts/test_image_config_aspect_ratio.py`.

## Older renderer-config scripts

`scripts/collect_model_responses.py`, `scripts/analyze_responses.py`, and `scripts/generate_renderer_configs.py` still analyze delimiter patterns. `generate_renderer_configs.py` validates every config before it writes, and the write is a temp file plus rename. If validation fails, the output file is unchanged. They are not the coverage gate. Text models added for the product need the harness replies above.

## Files

| Piece | Path |
| --- | --- |
| Registry | `backend/data/models_registry.json` |
| Renderer configs | `frontend/src/config/model_renderer_configs.json` |
| Explicit default renderer | `frontend/src/config/renderer_defaults.json` |
| Harness prompts | `rendering-harness/prompts/` |
| Saved replies | `rendering-harness/runs/<batch>/*.json` |
| Coverage manifest | `rendering-harness/coverage.json` |
| Allowlist | `rendering-harness/coverage-allowlist.json` |
| Catalog check | `backend/scripts/check_model_catalog.py` |
| Admin add | `backend/app/routers/admin/models_management.py` |
| CLI setup | `backend/scripts/setup_model_renderer.py` |

## Related

- [Rendering harness](../../rendering-harness/README.md)
- [Model-specific rendering](../features/MODEL_SPECIFIC_RENDERING.md)
- [Image generation](../features/IMAGE_GENERATION.md)
