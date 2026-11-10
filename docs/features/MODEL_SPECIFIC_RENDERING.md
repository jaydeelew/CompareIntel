# Model-Specific Rendering Implementation Guide

## Overview

This document outlines the implementation plan for model-specific rendering rules. The goal is to create a system where each AI model has its own rendering configuration to handle LaTeX math, markdown formatting, and other special formatting patterns that vary between models, while preserving the existing code block formatting that currently works well for all models.

## Problem Statement

Different AI models format their responses differently:
- Some models use `$$` for display math, others use `\[...\]`
- Some models include MathML artifacts (especially Google models)
- Markdown formatting varies (bold, italic, lists, links)
- Some models have unique delimiter patterns
- A one-size-fits-all rendering approach fails to handle all these variations correctly

## Solution Approach

Implement a model-specific rendering registry where each model has its own:
- Math delimiter patterns (display and inline)
- Preprocessing steps (cleanup, normalization)
- Markdown processing rules
- Post-processing steps
- KaTeX/rendering options

**Critical Constraint:** Code block formatting must remain unchanged and work identically for all models, as it currently functions correctly.

## Implementation Phases

### Phase 1: Response Collection and Analysis

#### Step 1.1: Create Test Prompt Suite
- Design comprehensive test prompts that cover:
  - Complex mathematical expressions (display and inline)
  - Various markdown elements (bold, italic, lists, links, headers)
  - Edge cases (dollar signs in text, code blocks with math, mixed content)
  - Special formatting patterns (tables, blockquotes, horizontal rules)
- Ensure prompts are designed to elicit model-specific formatting behaviors
- Include prompts that test code block preservation (to verify we don't break existing functionality)

#### Step 1.2: Build Response Collection Script
- Create a script that:
  - Iterates through all available models
  - Sends each test prompt to each model
  - Collects raw responses without any processing
  - Saves responses with metadata (model ID, prompt name, timestamp)
  - Handles errors gracefully (rate limits, timeouts, unavailable models)
  - Implements rate limiting to avoid API abuse
- Store collected responses in a structured format (JSON) for analysis

#### Step 1.3: Response Analysis
- Analyze collected responses to identify:
  - Math delimiter patterns used by each model
  - Markdown formatting variations
  - Common artifacts or malformed content (MathML, HTML tags, etc.)
  - Edge cases and special patterns
  - Any formatting that breaks with current unified renderer
- Document findings per model
- Create a comparison matrix showing differences between models

### Phase 2: Renderer Architecture Design

#### Step 2.1: Define Renderer Configuration Schema
- Design the configuration structure for model-specific renderers:
  - Model identifier
  - Math delimiter patterns (display and inline)
  - Preprocessing function pipeline
  - Markdown processing rules
  - KaTeX/rendering engine options
  - Post-processing function pipeline
- Ensure the schema is extensible for future formatting types

#### Step 2.2: Create Renderer Registry Structure
- Design the registry system:
  - Central registry mapping model IDs to configurations
  - Default/fallback configuration for models without specific rules
  - Versioning system for configurations (to track changes)
  - Configuration validation system

#### Step 2.3: Design Code Block Preservation System
- Create a mechanism to:
  - Identify and extract code blocks before any processing
  - Store code blocks with placeholders
  - Apply model-specific rendering to non-code content
  - Restore code blocks after rendering (unchanged)
- Ensure this system is tested thoroughly to prevent regressions

### Phase 3: Configuration Generation

#### Step 3.1: Build Configuration Generator
- Create a tool that:
  - Analyzes collected responses
  - Identifies patterns and issues per model
  - Generates initial renderer configurations
  - Outputs configurations in the registry format
- Include manual review flags for edge cases

#### Step 3.2: Configuration Generation and Initial Testing
- Generate configurations using best practices:
  - Use analysis data to create initial renderer configurations
  - Apply industry best practices for math rendering, markdown processing, and preprocessing
  - Test configurations with collected model responses
  - Validate configurations against the schema
  - Document configuration decisions and reasoning

**Note:** Manual refinement happens post-deployment (see Phase 7) when you review the actual rendered output on the website and provide feedback for adjustments.

#### Step 3.3: Create Configuration Validation
- Build validation system to ensure:
  - All required fields are present
  - Regex patterns are valid
  - Function pipelines are properly structured
  - No conflicts with code block preservation
  - Backward compatibility with existing renderer

### Phase 4: Renderer Implementation

#### Step 4.1: Update LatexRenderer Component
- Modify the component to:
  - Accept modelId as a prop
  - Look up model-specific configuration from registry
  - Fall back to default configuration if model not found
  - Apply model-specific preprocessing pipeline
  - Use model-specific math delimiters
  - Apply model-specific markdown rules
  - Use model-specific KaTeX options
  - Apply model-specific post-processing
  - Preserve code blocks throughout the process

#### Step 4.2: Update Component Integration Points
- Identify all places where LatexRenderer is used:
  - MessageBubble component
  - App.tsx rendering logic
  - Any other components that render model responses
- Update these components to pass modelId prop
- Ensure modelId is available in the component tree

#### Step 4.3: Implement Code Block Preservation
- Create robust code block extraction system:
  - Detect code blocks (fenced and indented)
  - Handle nested code blocks
  - Preserve code block metadata (language, formatting)
  - Replace with unique placeholders
  - Restore after all processing is complete
- Test extensively to ensure no code formatting is altered

### Phase 5: Testing Framework

#### Step 5.1: Unit Tests for Renderer Configurations
- Create tests for each model configuration:
  - Test math rendering (display and inline)
  - Test markdown rendering (all elements)
  - Test preprocessing steps
  - Test post-processing steps
  - Verify code blocks are preserved
  - Test edge cases specific to each model

#### Step 5.2: Integration Tests
- Test the full rendering pipeline:
  - End-to-end rendering with model responses
  - Verify correct configuration selection
  - Test fallback to default configuration
  - Verify code block preservation across all models
  - Test with real-world response examples

#### Step 5.3: Visual Comparison Tool
- Create a development tool to:
  - Display side-by-side comparisons:
    - Raw model response
    - Current unified renderer output
    - Model-specific renderer output
    - Expected/ideal output (if available)
  - Highlight differences between renderers
  - Allow manual testing with custom responses
  - Generate screenshots for documentation

#### Step 5.4: Regression Testing
- Create test suite to ensure:
  - Code block formatting remains unchanged
  - Existing functionality is not broken
  - Performance is not significantly degraded
  - No new rendering errors are introduced

### Phase 6: Documentation and Maintenance

#### Step 6.1: Document Configuration Format
- Create documentation explaining:
  - Configuration schema
  - How to add new model configurations
  - How to modify existing configurations
  - Best practices for configuration design
  - Troubleshooting guide

#### Step 6.2: Document Model-Specific Behaviors
- Create reference documentation:
  - List of known model-specific formatting quirks
  - Common issues and solutions
  - Model-specific rendering notes
  - Examples of model outputs

#### Step 6.3: Create Maintenance Process
- Establish process for:
  - Adding new models (when they become available)
  - Updating configurations when models change behavior
  - Handling new formatting patterns
  - Regular review of rendering quality
  - User feedback collection and response

### Phase 7: Deployment and Post-Deployment Review

#### Step 7.1: Gradual Rollout Strategy
- Plan phased deployment:
  - Start with a subset of models
  - Monitor for issues
  - Gradually expand to all models
  - Keep unified renderer as fallback option initially

#### Step 7.2: Monitoring and Metrics
- Set up monitoring for:
  - Rendering errors per model
  - Performance metrics
  - User-reported issues
  - Configuration usage statistics

#### Step 7.3: Manual Review and Refinement
- **Post-Deployment Manual Review:**
  - You will manually examine rendered results from all models on the website
  - Identify any rendering issues or quality problems
  - Note models that need configuration adjustments
  - Document specific issues found (e.g., math not rendering, markdown broken, etc.)
  - Provide feedback for configuration refinements

- **Configuration Refinement Process:**
  - Based on your review, configurations will be adjusted
  - Test refined configurations with problematic model responses
  - Iterate until rendering quality meets standards
  - Document changes and reasoning

#### Step 7.4: Rollback Plan
- Prepare rollback strategy:
  - Keep unified renderer as fallback
  - Feature flag to disable model-specific rendering
  - Quick revert process for problematic configurations

## Key Considerations

### Code Block Preservation
- **Critical:** Code block formatting must never be altered
- Code blocks should be extracted before any model-specific processing
- Code blocks should be restored exactly as received
- Test code blocks with various languages and formatting
- Test edge cases (code blocks containing math, nested blocks, etc.)

### Backward Compatibility
- Ensure existing functionality continues to work
- Default configuration should match current unified renderer behavior
- Maintain fallback mechanisms
- No breaking changes to component APIs

### Performance
- Model-specific rendering should not significantly impact performance
- Consider caching configurations
- Optimize preprocessing/post-processing pipelines
- Monitor rendering time per model

### Extensibility
- Design system to easily add new formatting types
- Support for future rendering engines
- Configuration versioning for updates
- Plugin-like architecture for custom renderers

### Testing Coverage
- Test all available models
- Test all formatting types (math, markdown, code)
- Test edge cases and error conditions
- Test with real-world response examples
- Visual regression testing

## Success Criteria

1. **Functionality:**
   - All models render correctly with their specific configurations
   - Code blocks remain unchanged for all models
   - No regression in existing functionality
   - Math rendering works correctly for all models
   - Markdown rendering works correctly for all models

2. **Quality:**
   - Rendering errors reduced significantly
   - Visual quality improved for all models
   - Edge cases handled appropriately
   - User-reported rendering issues resolved

3. **Maintainability:**
   - Easy to add new model configurations
   - Clear documentation and examples
   - Automated testing in place
   - Monitoring and alerting configured

4. **Performance:**
   - No significant performance degradation
   - Rendering time remains acceptable
   - No memory leaks or resource issues

## Timeline Estimate

- **Phase 1:** 1-2 weeks (response collection and analysis)
- **Phase 2:** 1 week (architecture design)
- **Phase 3:** 1-2 weeks (configuration generation and refinement)
- **Phase 4:** 2-3 weeks (implementation)
- **Phase 5:** 2 weeks (testing)
- **Phase 6:** 1 week (documentation)
- **Phase 7:** 1 week (deployment)

**Total Estimated Time:** 9-12 weeks

## Dependencies

- Access to all models via OpenRouter API
- Test data collection infrastructure
- Visual testing tools
- Monitoring and logging systems
- Documentation platform

## Risks and Mitigation

### Risk: Breaking Code Block Formatting
- **Mitigation:** Extensive testing, code block extraction system, regression tests

### Risk: Performance Degradation
- **Mitigation:** Performance testing, optimization, caching strategies

### Risk: Configuration Complexity
- **Mitigation:** Clear documentation, validation tools, gradual rollout

### Risk: Model Behavior Changes
- **Mitigation:** Versioning system, monitoring, quick update process

### Risk: Incomplete Coverage
- **Mitigation:** Comprehensive test suite, user feedback collection, iterative improvement

## Implementation Workflow

**Implementation Phase (Phases 1-6):**
- The AI assistant will implement the model-specific rendering features using best practices
- Configurations will be generated based on Phase 1 analysis data
- All phases will be completed before deployment

**Post-Deployment Review (Phase 7):**
- Once the website is running with model-specific rendering, you will manually examine the rendered results
- You will identify any models that need configuration adjustments
- Based on your review, configurations will be refined and updated
- This iterative process continues until rendering quality meets standards

## Next Steps

1. Review and approve this implementation plan
2. Set up response collection infrastructure
3. Begin Phase 1: Response Collection and Analysis
4. AI assistant implements Phases 2-6 using best practices
5. Deploy model-specific rendering
6. Manual review of rendered results on the website
7. Refine configurations based on review feedback

---

**Document Version:** 1.1  
**Last Updated:** November 2026  
**Status:** Planning Phase, with an offline rendering harness in `rendering-harness/`

## Harness coverage beyond the original six prompts

The rendering harness now includes `prompts/07-rare-formats.md` for constructs the first six prompts do not draw out: footnotes, task lists, strikethrough, autolinks and bare URLs, inline HTML (`<br>`, `<sup>`, `<details>`), nested blockquotes that hold a list and code, tables with alignment plus inline math and escaped pipes, a mermaid fence, chemistry `\ce{}`, `\begin{cases}`, `\begin{aligned}`, `\boxed`, `\text` containing unicode, emoji, RTL and CJK text, overflow stress (a long unbroken token, a wide table, a long code line), and a dollar amount beside math.

`LatexRenderer` renders KaTeX through `safeRenderKatex` without importing `katex/contrib/mhchem`. `\ce{}` is therefore not a supported command. The harness still asserts that `\ce{}` renders without a KaTeX error, so the gap stays visible. Do not treat a prompt 07 failure on chemistry as a reason to change the renderer in the same change that only widens the harness.

Phone-width (390 CSS px, device pixel ratio 3) and dark-mode captures run in render-only mode. Dark mode is the site mechanism: `localStorage['compareintel-theme']`, `data-theme`, and `color-scheme`, the same path as `frontend/index.html` and `ThemeContext`. Layout checks at phone width flag horizontal overflow outside table, code, and display-math scrollers, clipped KaTeX, and overlapping text. `npm run layout-audit` applies those checks to the saved cells offline. Evidence images are CI artifacts, not committed files.

`npm run triage -- --cell=<model>:<prompt>` writes the whole heading range, a reference-versus-renderer line diff, a 960 CSS px device-pixel-ratio 2 screenshot, and a regression stub that asserts that full section. `npm run before-after -- --cell=... --base=<ref> --head=<ref>` builds both refs and stacks Before above After for that section without cropping it.

