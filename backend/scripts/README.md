# Model-Specific Rendering Scripts

This directory contains scripts for Phase 1 of the model-specific rendering implementation: Response Collection and Analysis.

## Overview

These scripts are used to:
1. Collect raw responses from all AI models using comprehensive test prompts
2. Analyze the responses to identify formatting patterns, delimiters, and issues
3. Generate data needed for creating model-specific renderer configurations

**Important:** All scripts automatically skip models that already have individual renderer configurations, preserving your manual customizations. See [Adding New Models Workflow](../../docs/development/ADDING_NEW_MODELS.md) for the complete workflow.

## Scripts

### `test_prompts.py`

Defines comprehensive test prompts designed to elicit various formatting patterns from AI models.

**Features:**
- 12 different test prompts covering:
  - Complex mathematical expressions (display and inline)
  - Markdown elements (bold, italic, lists, links, headers, tables)
  - Edge cases (dollar signs in text, code blocks with math)
  - Special formatting (blockquotes, horizontal rules)
  - Code block preservation tests

**Usage:**
```python
from scripts.test_prompts import TEST_PROMPTS, get_prompt_by_name

# Get all prompts
all_prompts = TEST_PROMPTS

# Get specific prompt
prompt = get_prompt_by_name("complex_math_display")
```

### `collect_model_responses.py`

Collects raw responses from all available models for each test prompt.

**Usage:**
```bash
# Collect from all models with all prompts
python scripts/collect_model_responses.py

# Collect from specific models
python scripts/collect_model_responses.py --models anthropic/claude-sonnet-4.5 openai/gpt-4o

# Collect with specific prompts only
python scripts/collect_model_responses.py --prompts complex_math_display markdown_lists

# Custom output directory
python scripts/collect_model_responses.py --output-dir custom/path

# Adjust rate limiting
python scripts/collect_model_responses.py --delay 2.0 --max-retries 5

# Quiet mode
python scripts/collect_model_responses.py --quiet
```

**Options:**
- `--models`: Specific model IDs to test (default: all available models)
- `--prompts`: Specific prompt names to use (default: all prompts)
- `--output-dir`: Directory to save responses (default: `backend/data/model_responses`)
- `--delay`: Delay between requests in seconds (default: 1.0)
- `--max-retries`: Maximum retries for failed requests (default: 3)
- `--quiet`: Suppress verbose output
- `--output-file`: Specific output filename to use (for resuming)

**Note:** Models that already have renderer configurations are automatically skipped.

**Output:**
- Saves JSON file with all collected responses
- Includes metadata: timestamps, success/failure status, errors
- File naming: `model_responses_YYYYMMDD_HHMMSS.json`

### `analyze_responses.py`

Analyzes collected responses to identify rendering patterns and issues.

**Usage:**
```bash
# Analyze responses file
python scripts/analyze_responses.py backend/data/model_responses/model_responses_20250101_120000.json

# Custom output directory
python scripts/analyze_responses.py responses.json --output-dir custom/analysis

# Output format options
python scripts/analyze_responses.py responses.json --format json
python scripts/analyze_responses.py responses.json --format markdown
python scripts/analyze_responses.py responses.json --format both  # default

# Quiet mode
python scripts/analyze_responses.py responses.json --quiet
```

**Options:**
- `responses_file`: Path to collected responses JSON file (required)
- `--output-dir`: Directory to save analysis results (default: `backend/data/analysis`)
- `--format`: Output format - `json`, `markdown`, or `both` (default: `both`)
- `--quiet`: Suppress verbose output

**Note:** Models that already have renderer configurations are automatically skipped.

**Output:**
- JSON file with detailed analysis data
- Markdown report with human-readable summary
- Identifies:
  - Math delimiter patterns (display and inline)
  - Markdown elements used
  - Rendering issues found
  - Code block preservation status
  - Models needing manual review

### `generate_renderer_configs.py`

Generates renderer configurations from analysis data.

**Usage:**
```bash
# Generate configs (preserves existing configs by default)
python scripts/generate_renderer_configs.py data/analysis/analysis_TIMESTAMP.json

# Specify output file
python scripts/generate_renderer_configs.py analysis.json --output frontend/src/config/model_renderer_configs.json

# Overwrite existing configs (use with caution!)
python scripts/generate_renderer_configs.py analysis.json --overwrite
```

**Options:**
- `analysis_file`: Path to analysis JSON file (required)
- `--output`: Output file path (default: `frontend/src/config/model_renderer_configs.json`)
- `--quiet`: Suppress verbose output
- `--overwrite`: Overwrite existing configs instead of preserving them

**Note:** 
- By default, preserves existing configs and only generates configs for new models
- Models that already have configs are skipped
- Use `--overwrite` flag to regenerate all configs (backup first!)

### `list_model_token_limits.py`

Lists all models and their input token capacities from OpenRouter API.

**Usage:**
```bash
# List all models in table format (default)
python3 scripts/list_model_token_limits.py

# Show summary statistics
python3 scripts/list_model_token_limits.py --summary

# Filter by provider
python3 scripts/list_model_token_limits.py --provider OpenAI

# Filter by minimum capacity
python3 scripts/list_model_token_limits.py --min-capacity 100000

# Output as JSON
python3 scripts/list_model_token_limits.py --format json

# Output as CSV
python3 scripts/list_model_token_limits.py --format csv

# Save to file
python3 scripts/list_model_token_limits.py --output-file model_capacities.txt

# Sort by capacity (highest first)
python3 scripts/list_model_token_limits.py --sort-by capacity
```

**Options:**
- `--format`: Output format - `table` (default), `json`, or `csv`
- `--sort-by`: Sort by `provider` (default), `name`, `capacity`, or `model_id`
- `--provider`: Filter by specific provider (e.g., `OpenAI`, `Anthropic`)
- `--min-capacity`: Filter by minimum input capacity (e.g., `100000`)
- `--output-file`: Save output to file (optional)
- `--summary`: Show summary statistics (only for table format)

**Note:**
- Requires OpenRouter API key to be configured
- Fetches token limits from OpenRouter API at runtime
- Falls back to default values (8192 tokens) if API is unavailable

## Workflow

### Step 1: Collect Responses

```bash
# Collect responses from all models (this may take a while)
cd backend
python scripts/collect_model_responses.py

# This will create: data/model_responses/model_responses_TIMESTAMP.json
```

**Note:** Collection may take significant time depending on:
- Number of models (50+)
- Number of prompts (12)
- API rate limits
- Network speed

Estimated time: 1-3 hours for all models and prompts.

### Step 2: Analyze Responses

```bash
# Analyze the collected responses
python scripts/analyze_responses.py data/model_responses/model_responses_TIMESTAMP.json

# This will create:
# - data/analysis/analysis_TIMESTAMP.json (detailed data)
# - data/analysis/analysis_TIMESTAMP.md (human-readable report)
```

### Step 3: Review Analysis

1. Open the markdown report to see summary
2. Review the identified issues and patterns (these inform the implementation)
3. Check for common issues across models
4. Note the scope of work needed

**Understanding "Needs Manual Review" Flags:**
- These flags identify models with formatting issues or complex patterns
- During implementation, the AI assistant will use best practices to create configurations for all models
- The actual manual review happens **after deployment** when you examine the rendered results on the website
- The analysis data provides the foundation for automated configuration generation

## Directory Structure

```
backend/
├── scripts/
│   ├── __init__.py
│   ├── test_prompts.py
│   ├── collect_model_responses.py
│   ├── analyze_responses.py
│   ├── generate_renderer_configs.py
│   ├── list_model_token_limits.py
│   └── README.md
└── data/
    ├── model_responses/      # Collected responses (created by collection script)
    │   └── model_responses_*.json
    └── analysis/             # Analysis results (created by analysis script)
        ├── analysis_*.json
        └── analysis_*.md
```

## Requirements

- Python 3.9+ (Python 3.11 recommended)
- Access to OpenRouter API (via environment variables)
- All dependencies from `backend/requirements.txt`

## Error Handling

The collection script includes:
- Automatic retry with exponential backoff for rate limits
- Timeout handling
- Error logging and reporting
- Graceful handling of unavailable models
- Partial results saving (if interrupted)

## Adding New Models

When new models are added to the application, use the complete workflow:

1. **Collect responses** from new models
2. **Analyze responses** to identify patterns
3. **Generate configs** for new models

See [Adding New Models Workflow](../../docs/development/ADDING_NEW_MODELS.md) for detailed instructions.

## Best Practices

1. **Start Small**: Test with a few models first before running full collection
   ```bash
   python scripts/collect_model_responses.py --models anthropic/claude-sonnet-4.5 --prompts complex_math_display
   ```

2. **Monitor Rate Limits**: Adjust `--delay` if you hit rate limits frequently

3. **Save Progress**: The script saves results incrementally, so partial results are preserved

4. **Review Analysis**: Always review the markdown report before proceeding to configuration generation

5. **Version Control**: Don't commit collected response files (they're large and change frequently)

6. **Preserve Manual Changes**: Scripts automatically skip models with existing configs - your manual customizations are safe!

## Troubleshooting

### Rate Limiting
- Increase `--delay` value
- Run collection in smaller batches (use `--models` to select subset)
- Check OpenRouter API status

### Timeouts
- Some models may be slower - the script retries automatically
- Check network connectivity
- Verify API key is valid

### Import Errors
- Ensure you're running from the backend directory
- Check that all dependencies are installed
- Verify Python path includes backend directory

## Next Steps

After completing Phase 1 (collection and analysis):

**Implementation Phase:**
- **Phase 2**: Renderer Architecture Design (AI assistant implements)
- **Phase 3**: Configuration Generation (AI assistant implements using best practices)
- **Phase 4**: Renderer Implementation (AI assistant implements)
- **Phase 5**: Testing Framework (AI assistant implements)
- **Phase 6**: Documentation (AI assistant implements)

**Post-Deployment Review:**
- **Phase 7**: After deployment, you will manually review rendered results on the website
- Identify any models needing configuration adjustments
- Provide feedback for refinement

See `/docs/features/MODEL_SPECIFIC_RENDERING.md` for the complete implementation guide.

