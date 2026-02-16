# Adding New Models Workflow

This document describes the workflow for adding new AI models to CompareIntel and ensuring they have proper renderer configurations.

## Overview

When new models are added to `backend/app/model_runner.py`, they need renderer configurations to properly display their responses. The workflow consists of three main steps:

1. **Collect Responses** - Gather sample responses from new models
2. **Analyze Responses** - Identify formatting patterns and issues
3. **Generate Configs** - Create renderer configurations based on analysis

**Important:** All three scripts automatically skip models that already have individual renderer configurations, preserving your manual customizations.

## Prerequisites

- New models added to `MODELS_BY_PROVIDER` in `backend/app/model_runner.py`
- Python 3.9+ with all dependencies installed (Python 3.11 recommended)
- OpenRouter API key configured in environment variables
- Access to the project repository

## Step-by-Step Workflow

### Step 1: Collect Model Responses

Collect raw responses from the new models using test prompts.

```bash
cd backend

# Collect from all models (will automatically skip models with existing configs)
python scripts/collect_model_responses.py

# Or collect from specific new models only
python scripts/collect_model_responses.py --models openai/gpt-5.1 openai/gpt-5.1-chat

# With custom options
python scripts/collect_model_responses.py \
  --models openai/gpt-5.1 openai/gpt-5.1-chat \
  --delay 1.5 \
  --max-retries 5 \
  --concurrency 10 \
  --output-dir data/model_responses
```

**What happens:**

- Script checks which models already have configs
- Skips those models automatically
- Collects responses from new models only (concurrently for faster collection)
- Saves results to `backend/data/model_responses/model_responses_TIMESTAMP.json`

**Output:** JSON file with collected responses

**Time:** ~30-60 seconds per model (down from 5-15 minutes) thanks to concurrent collection

- Uses parallel API calls with configurable concurrency (default: 5 concurrent requests)
- Adjust `--concurrency` if you hit rate limits (lower) or want faster collection (higher)

### Step 2: Analyze Responses

Analyze the collected responses to identify formatting patterns.

```bash
cd backend

# Analyze the most recent responses file
python scripts/analyze_responses.py data/model_responses/model_responses_TIMESTAMP.json

# Or specify the file explicitly
python scripts/analyze_responses.py data/model_responses/model_responses_20250101_120000.json

# With custom output directory
python scripts/analyze_responses.py responses.json --output-dir data/analysis

# Output format options
python scripts/analyze_responses.py responses.json --format json      # JSON only
python scripts/analyze_responses.py responses.json --format markdown  # Markdown only
python scripts/analyze_responses.py responses.json --format both       # Both (default)
```

**What happens:**

- Script loads collected responses
- Skips models that already have configs
- Analyzes formatting patterns (math delimiters, markdown, issues)
- Generates analysis report

**Output:**

- `backend/data/analysis/analysis_TIMESTAMP.json` - Detailed analysis data
- `backend/data/analysis/analysis_TIMESTAMP.md` - Human-readable report

**Time:** ~1-2 minutes

### Step 3: Generate Renderer Configurations

Generate renderer configurations from the analysis data.

```bash
cd backend

# Generate configs (preserves existing configs by default)
python scripts/generate_renderer_configs.py data/analysis/analysis_TIMESTAMP.json

# Or specify output file
python scripts/generate_renderer_configs.py analysis.json --output frontend/src/config/model_renderer_configs.json

# To overwrite existing configs (use with caution!)
python scripts/generate_renderer_configs.py analysis.json --overwrite
```

**What happens:**

- Script loads analysis data
- Skips models that already have configs
- Generates new configs for analyzed models
- Merges with existing configs (preserves manual changes)
- Writes updated config file

**Output:** Updated `frontend/src/config/model_renderer_configs.json`

**Time:** ~10-30 seconds

## Complete Example

Here's a complete example for adding 4 new GPT 5.1 models:

```bash
cd backend

# Step 1: Collect responses from new models
python scripts/collect_model_responses.py \
  --models openai/gpt-5.1 openai/gpt-5.1-chat openai/gpt-5.1-codex openai/gpt-5.1-codex-mini \
  --delay 1.0

# Step 2: Analyze responses (use the file created in step 1)
python scripts/analyze_responses.py \
  data/model_responses/model_responses_20250101_120000.json

# Step 3: Generate configs (use the analysis file from step 2)
python scripts/generate_renderer_configs.py \
  data/analysis/analysis_20250101_120500.json
```

## How Config Preservation Works

### Automatic Skipping

All three scripts automatically check for existing configurations in `frontend/src/config/model_renderer_configs.json`:

- **collect_model_responses.py**: Skips collecting responses for models with configs
- **analyze_responses.py**: Skips analyzing responses for models with configs
- **generate_renderer_configs.py**: Skips generating configs for models with configs AND preserves existing configs

### Manual Changes Preserved

When `generate_renderer_configs.py` runs:

- ✅ Models with existing configs are skipped (not regenerated)
- ✅ Existing configs are preserved in the output file
- ✅ Only new models get configs generated
- ✅ Manual customizations are never overwritten

### Override Behavior

If you need to regenerate configs for models that already have them:

```bash
# Use --overwrite flag (use with caution!)
python scripts/generate_renderer_configs.py analysis.json --overwrite
```

**Warning:** This will overwrite existing configs, including manual changes. Always backup first!

## Verifying Results

After running the workflow:

1. **Check config file:**

   ```bash
   # View the config file
   cat frontend/src/config/model_renderer_configs.json | jq '.[] | select(.modelId | startswith("openai/gpt-5.1"))'
   ```

2. **Test in application:**

   - Start the application
   - Select one of the new models
   - Send a test prompt with math/markdown
   - Verify rendering looks correct

3. **Review analysis report:**
   - Open the markdown report from Step 2
   - Check for any "Needs Manual Review" flags
   - Review identified issues

## Troubleshooting

### Models Still Being Processed

If models with configs are still being processed:

1. Check that configs exist in `frontend/src/config/model_renderer_configs.json`
2. Verify the `modelId` matches exactly (case-sensitive)
3. Check script output for skip messages

### Configs Not Preserved

If existing configs are being overwritten:

1. Ensure you're not using `--overwrite` flag
2. Check that `preserve_existing=True` in the script
3. Verify the config file path is correct

### Import Errors

If you see import errors:

```bash
# Ensure you're running from backend directory
cd backend

# Check Python path
python -c "import sys; print(sys.path)"

# Verify scripts can import helpers
python -c "from scripts.config_helpers import has_model_config; print('OK')"
```

### Rate Limiting

If you hit rate limits during collection:

```bash
# Increase delay between requests
python scripts/collect_model_responses.py --delay 2.0

# Or collect in smaller batches
python scripts/collect_model_responses.py --models model1 model2
```

## Best Practices

1. **Always backup before overwriting:**

   ```bash
   cp frontend/src/config/model_renderer_configs.json frontend/src/config/model_renderer_configs.json.backup
   ```

2. **Test with a few models first:**

   ```bash
   python scripts/collect_model_responses.py --models model1 model2
   ```

3. **Review analysis reports** before generating configs

4. **Commit config changes** after verifying they work:

   ```bash
   git add frontend/src/config/model_renderer_configs.json
   git commit -m "Add renderer configs for GPT 5.1 models"
   ```

5. **Don't commit response/analysis files** (they're large and change frequently)

## File Locations

- **Model definitions:** `backend/app/model_runner.py`
- **Renderer configs:** `frontend/src/config/model_renderer_configs.json`
- **Collected responses:** `backend/data/model_responses/model_responses_*.json`
- **Analysis results:** `backend/data/analysis/analysis_*.json` and `analysis_*.md`
- **Helper functions:** `backend/scripts/config_helpers.py`

## Related Documentation

- [Model-Specific Rendering](../features/MODEL_SPECIFIC_RENDERING.md) - Complete implementation guide
- [Scripts README](../../backend/scripts/README.md) - Detailed script documentation
- [Development Workflow](WORKFLOW.md) - General development practices

## Quick Reference

```bash
# Full workflow (replace TIMESTAMP with actual timestamps)
cd backend

# 1. Collect
python scripts/collect_model_responses.py --models MODEL1 MODEL2

# 2. Analyze
python scripts/analyze_responses.py data/model_responses/model_responses_TIMESTAMP.json

# 3. Generate
python scripts/generate_renderer_configs.py data/analysis/analysis_TIMESTAMP.json
```
