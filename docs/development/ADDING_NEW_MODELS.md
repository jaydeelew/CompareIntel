# Adding New Models

Text models cannot be added to CompareIntel unless the rendering harness has a saved reply for all six prompts and none of those cells are `fail` or `incomplete`. `not-covered` is allowed: it means the model omitted a feature the prompt asked for, and the manifest records that. Image-generation models are excluded.

The gate reads `backend/data/models_registry.json` and `rendering-harness/coverage.json`. A model is image-only when its registry `category` is exactly `"Image"`. Every other category is text-capable. See `rendering-harness/README.md` for the same rule.

CI runs the gate when the registry, the renderer config, `LatexRenderer.tsx`, `frontend/src/utils/latex/**`, or `rendering-harness/**` changes. The check makes no OpenRouter calls. For models that are new versus the base branch it re-renders the saved replies with `npm run harness -- --render-only`.

## Path A: Admin panel (development only)

Adding a model in the admin UI calls `add_model` / `add_model_stream` in `backend/app/routers/admin/models_management.py`. Both refuse to run unless `ENVIRONMENT=development`.

For a text model the handler:

1. Builds the registry row in memory. It does **not** write `models_registry.json` yet.
2. Runs `python scripts/setup_model_renderer.py <model_id> --defer-coverage`.
3. That script calls OpenRouter with the six files in `rendering-harness/prompts` (the same prompts the harness scores). It pattern-analyzes the replies, writes `frontend/src/config/model_renderer_configs.json` when that model has no row yet, and writes harness-format JSON under `rendering-harness/runs/admin-<timestamp>/`.
4. It then runs the offline render (`npm run harness -- --render-only`) when `npm` and `rendering-harness/node_modules` are available.
5. On success the handler saves the registry and regenerates `rendering-harness/coverage.json`.
6. The stream event `harness` and the final success message include the harness result. The models tab shows that message.

If rendering fails, the response is an error that says **Rendering harness failed**. It does not report success, and the new id is not left in `models_registry.json`. The same is true when Playwright cannot start or the offline render is skipped: the response says the harness **did not run**. In every one of those cases the script deletes the `runs/admin-<timestamp>/` replies and any renderer config that this attempt wrote. A config that was already on disk is left alone, and complete replies in older batches are left alone so the next add can reuse them.

Image models skip the harness. The handler still probes aspect ratios and then saves the registry. See `docs/features/IMAGE_GENERATION.md`.

The registry write is after a successful harness setup. These writes are still not one transaction: the OpenRouter snapshot upsert and the Help Me Choose benchmark script run after the registry is saved, and a coverage-manifest failure rolls the registry file back to the pre-add snapshot but does not undo a benchmark edit that already landed.

## Path B: CLI

1. Add the text model to `backend/data/models_registry.json` with a category other than `"Image"`.
2. From `backend/`, generate the renderer config and the six saved replies:

   ```bash
   python scripts/setup_model_renderer.py provider/model-id
   ```

   The script uses the harness prompts, writes the renderer config, writes the reply JSON, renders offline when it can, and refreshes `rendering-harness/coverage.json`. Re-running it reuses complete reply files instead of paying again.

3. If the script says the offline render failed, was skipped, or did not start, it has already deleted that attempt's `runs/admin-<timestamp>/` directory and any renderer config it just wrote. Fix the local Playwright setup and run the script again. When no complete replies remain, collect them with the harness:

   ```bash
   cd rendering-harness
   npm run harness -- --dry-run --models=provider/model-id --max-usd=2
   npm run harness -- --models=provider/model-id --max-usd=2
   npm run generate-coverage
   ```

   `--max-usd` is the cap you are willing to approve for that batch. The dry-run prints the estimate and does not call the chat API. The error from CI names the models and a concrete `--max-usd` command when replies are missing.

4. Open the screenshots next to the saved replies and look for leftover math, KaTeX errors, and currency or code that was swallowed. Do not commit PNGs or tarballs. `rendering-harness/runs/**/*.png` and `*.tar.gz` are gitignored; screenshots already tracked in older runs stay in history.
5. Commit the registry row, `frontend/src/config/model_renderer_configs.json` if it changed, the reply JSON files, and `rendering-harness/coverage.json`.
6. Open the PR. The rendering harness job must pass. A `fail` or `incomplete` cell fails the job. `not-covered` does not.

There is no separate "type a prompt in the app and look at it" step. The harness render is the check.

### Several new models

```bash
cd rendering-harness
npm run harness -- --dry-run --models=provider/a,provider/b --max-usd=4
npm run harness -- --models=provider/a,provider/b --max-usd=4
npm run generate-coverage
```

Each id still needs its own renderer config (`setup_model_renderer.py`, or the older collect / analyze / generate scripts if you are only refreshing delimiter patterns). The harness replies are what the gate requires.

## Allowlist

`rendering-harness/coverage-allowlist.json` is the only place a text model may ship without six passing or not-covered cells. Each entry needs `modelId` and a non-empty `reason`. An empty `entries` array means the gate applies to every text model. Regenerate the manifest after editing the allowlist:

```bash
cd rendering-harness
npm run generate-coverage
```

## Image models

Image models are not scored by the harness. Admin add detects `output_modalities` containing `"image"`, sets `category` to `"Image"` and `supports_image_generation` to true, skips renderer setup, and stores aspect ratios from `scripts/test_image_config_aspect_ratio.py`.

## Older renderer-config scripts

`scripts/collect_model_responses.py`, `scripts/analyze_responses.py`, and `scripts/generate_renderer_configs.py` still analyze delimiter patterns and skip models that already have a config. They are not the coverage gate. Text models added for the product need the harness replies above, not a visual pass in the running app.

`getModelConfig()` in `frontend/src/config/modelRendererRegistry.ts` keeps the model's `$$` / `$` patterns and fills standard `\[...\]` and `\(...\)` when the JSON row omitted them.

## Files

| Piece | Path |
| --- | --- |
| Registry | `backend/data/models_registry.json` |
| Renderer configs | `frontend/src/config/model_renderer_configs.json` |
| Harness prompts | `rendering-harness/prompts/` |
| Saved replies | `rendering-harness/runs/<batch>/*.json` |
| Coverage manifest | `rendering-harness/coverage.json` |
| Allowlist | `rendering-harness/coverage-allowlist.json` |
| Admin add | `backend/app/routers/admin/models_management.py` |
| CLI setup | `backend/scripts/setup_model_renderer.py` |

## Related

- [Rendering harness](../../rendering-harness/README.md)
- [Model-specific rendering](../features/MODEL_SPECIFIC_RENDERING.md)
- [Image generation](../features/IMAGE_GENERATION.md)
