# UI Elements Documentation

This document provides a comprehensive breakdown of all visual elements (sections, buttons, fields, cards, dropdowns, tooltips, etc.) in the CompareIntel user and admin interfaces, organized by component file with corresponding line number ranges.

---

## Table of Contents

1. [User Interface Components](#user-interface-components)
   - [Main App Layout](#main-app-layout)
   - [Navigation](#navigation)
   - [Hero Section](#hero-section)
   - [Comparison Form](#comparison-form)
   - [Model Selection](#model-selection)
   - [Results Display](#results-display)
   - [Conversation Components](#conversation-components)
   - [Authentication Components](#authentication-components)
   - [Shared Components](#shared-components)
   - [Footer](#footer)
   - [Terms of Service](#terms-of-service)

2. [Admin Interface Components](#admin-interface-components)
   - [Admin Panel](#admin-panel)

---

## User Interface Components

### Main App Layout

**File:** `frontend/src/App.tsx`

#### Main Container
- **Element:** App Container
- **Lines:** [3107-3108](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3107)
- **Class:** `app`

#### Main Content Area
- **Element:** Main Content Section
- **Lines:** [3159-3159](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3159)
- **Class:** `app-main`

#### Error Message Display
- **Element:** Error Message Container
- **Lines:** [3198-3203](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3198)
- **Class:** `error-message`

---

### Navigation

**File:** `frontend/src/components/layout/Navigation.tsx`

#### Navigation Header
- **Element:** App Header
- **Lines:** [40-132](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/Navigation.tsx#L40)
- **Class:** `app-header`

#### Navigation Bar
- **Element:** Navigation Bar Container
- **Lines:** [41-131](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/Navigation.tsx#L41)
- **Class:** `navbar`

#### Brand Section
- **Element:** Brand Logo and Text Container
- **Lines:** [42-91](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/Navigation.tsx#L42)
- **Class:** `nav-brand`

#### Logo Icon
- **Element:** SVG Logo Icon
- **Lines:** [43-86](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/Navigation.tsx#L43)
- **Class:** `brand-logo`, `logo-icon`

#### Brand Text
- **Element:** Brand Name and Tagline
- **Lines:** [87-90](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/Navigation.tsx#L87)
- **Class:** `brand-text`

#### Navigation Actions
- **Element:** Right-side Action Buttons Container
- **Lines:** [94-129](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/Navigation.tsx#L94)
- **Class:** `nav-actions`

#### Sign In Button
- **Element:** Sign In Button (Unauthenticated)
- **Lines:** [114-120](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/Navigation.tsx#L114)
- **Class:** `nav-button-text`
- **Test ID:** `nav-sign-in-button`

#### Sign Up Button
- **Element:** Sign Up Button (Unauthenticated)
- **Lines:** [121-127](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/Navigation.tsx#L121)
- **Class:** `nav-button-primary`
- **Test ID:** `nav-sign-up-button`

#### Admin Avatar Button
- **Element:** Admin Panel Toggle Button (Authenticated Admin)
- **Lines:** [98-108](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/Navigation.tsx#L98)
- **Class:** `admin-avatar-button`

---

### Hero Section

**File:** `frontend/src/components/layout/Hero.tsx`

#### Hero Container
- **Element:** Hero Section Container
- **Lines:** [42-105](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/Hero.tsx#L42)
- **Class:** `hero-section`

#### Hero Content
- **Element:** Hero Content Wrapper
- **Lines:** [43-103](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/Hero.tsx#L43)
- **Class:** `hero-content`

#### Hero Title
- **Element:** Main Hero Title
- **Lines:** [44-47](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/Hero.tsx#L44)
- **Class:** `hero-title`, `hero-title-second-line`

#### Hero Subtitle
- **Element:** Hero Subtitle Text
- **Lines:** [48-50](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/Hero.tsx#L48)
- **Class:** `hero-subtitle`

#### Capability Tiles Section
- **Element:** Capability Tiles Container
- **Lines:** [52-95](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/Hero.tsx#L52)
- **Class:** `hero-capabilities`

#### Capability Tile (Natural Language)
- **Element:** Natural Language Capability Tile
- **Lines:** [53-65](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/Hero.tsx#L53)
- **Class:** `capability-tile`
- **Tooltip:** [Lines 24-26](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/Hero.tsx#L24) (visible when `visibleTooltip === 'natural-language'`)

#### Capability Tile (Code Generation)
- **Element:** Code Generation Capability Tile
- **Lines:** [67-80](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/Hero.tsx#L67)
- **Class:** `capability-tile`
- **Tooltip:** [Lines 24-26](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/Hero.tsx#L24) (visible when `visibleTooltip === 'code-generation'`)

#### Capability Tile (Formatted Math)
- **Element:** Formatted Math Capability Tile
- **Lines:** [82-94](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/Hero.tsx#L82)
- **Class:** `capability-tile`
- **Tooltip:** [Lines 24-26](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/Hero.tsx#L24) (visible when `visibleTooltip === 'formatted-math'`)

#### Capability Tooltip
- **Element:** Tooltip Display (within CapabilityTile)
- **Lines:** [24-26](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/Hero.tsx#L24)
- **Class:** `capability-tooltip` (with `visible` modifier)

#### Hero Input Section
- **Element:** Input Form Container
- **Lines:** [98-101](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/Hero.tsx#L98)
- **Class:** `hero-input-section`

---

### Comparison Form

**File:** `frontend/src/components/comparison/ComparisonForm.tsx`

#### Follow-Up Header
- **Element:** Follow-Up Mode Header Section
- **Lines:** [96-152](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L96)
- **Class:** `follow-up-header`

#### Follow-Up Mode Title
- **Element:** Follow-Up Mode Heading
- **Lines:** [99-101](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L99)
- **Text:** "Follow Up Mode"

#### New Inquiry Button
- **Element:** Exit Follow-Up Mode Button
- **Lines:** [102-133](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L102)
- **Class:** `textarea-icon-button new-inquiry-button`
- **Title:** "Exit follow up mode"

#### Message Context Counter
- **Element:** Message Count Display
- **Lines:** [134-147](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L134)
- **Shows:** Message count + input status

#### Enter Prompt Title
- **Element:** Main Prompt Title (Non-Follow-Up Mode)
- **Lines:** [150-151](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L150)
- **Text:** "Enter Your Prompt"

#### Textarea Container
- **Element:** Input Textarea Wrapper
- **Lines:** [154-387](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L154)
- **Class:** `textarea-container` (with `animate-pulse-border` modifier)

#### History Toggle Button
- **Element:** History Dropdown Toggle
- **Lines:** [156-167](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L156)
- **Class:** `history-toggle-wrapper`, `history-toggle-button` (with `active` modifier)
- **Title:** "Load previous conversations"

#### Input Textarea
- **Element:** Main Input Textarea
- **Lines:** [169-190](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L169)
- **Class:** `hero-input-textarea`
- **Test ID:** `comparison-input-textarea`
- **Placeholder:** "Let's get started..." or "Enter your follow-up here"

#### History Dropdown List
- **Element:** Conversation History List
- **Lines:** [193-298](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L193)
- **Class:** `history-inline-list` (with `no-scrollbar` or `scrollable` modifiers)

#### History Loading State
- **Element:** History Loading Message
- **Lines:** [224-225](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L224)
- **Class:** `history-loading`

#### History Empty State
- **Element:** No History Message
- **Lines:** [226-227](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L226)
- **Class:** `history-empty`

#### History Item
- **Element:** Individual History Entry
- **Lines:** [236-254](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L236)
- **Class:** `history-item` (with `history-item-active` modifier)

#### History Item Content
- **Element:** History Item Content Wrapper
- **Lines:** [241-246](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L241)
- **Class:** `history-item-content`

#### History Item Prompt
- **Element:** Truncated Prompt Text
- **Lines:** [242](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L242)
- **Class:** `history-item-prompt`

#### History Item Meta
- **Element:** History Metadata (Models, Date)
- **Lines:** [243-245](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L243)
- **Class:** `history-item-meta`

#### History Item Delete Button
- **Element:** Delete History Item Button
- **Lines:** [248-253](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L248)
- **Class:** `history-item-delete`

#### History Signup Prompt
- **Element:** Tier Limit Message
- **Lines:** [276-291](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L276)
- **Class:** `history-signup-prompt`

#### Textarea Actions
- **Element:** Action Buttons Container
- **Lines:** [300-386](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L300)
- **Class:** `textarea-actions`

#### Extended Mode Button
- **Element:** Extended Mode Toggle Button
- **Lines:** [350-359](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L350)
- **Class:** `extended-mode-button` (with `active` and `recommended` modifiers)
- **Text:** "E"

#### Submit Button
- **Element:** Submit/Continue Conversation Button
- **Lines:** [361-385](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L361)
- **Class:** `textarea-icon-button submit-button` (with `not-ready` and `animate-pulse-glow` modifiers)
- **Test ID:** `comparison-submit-button`

#### Usage Preview Section
- **Element:** Usage Preview Display (Regular Mode)
- **Lines:** [390-390](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L390)
- **Rendered by:** `renderUsagePreview()` function

#### Context Warning
- **Element:** Follow-Up Mode Context Warning
- **Lines:** [424-432](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L424)
- **Class:** `context-warning` (with `info`, `medium`, `high`, or `critical` modifiers)

#### Context Warning Content
- **Element:** Warning Message Container
- **Lines:** [426-430](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L426)
- **Class:** `context-warning-content`

#### Context Warning Message
- **Element:** Warning Text
- **Lines:** [427-428](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L427)
- **Class:** `context-warning-message`

#### Context Warning Icon
- **Element:** Warning Icon
- **Lines:** [428](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ComparisonForm.tsx#L428)
- **Class:** `context-warning-icon`

---

### Model Selection

**File:** `frontend/src/App.tsx`

#### Models Section
- **Element:** Models Selection Section Container
- **Lines:** [3204-3500](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3204)
- **Class:** `models-section`

#### Models Section Header
- **Element:** Models Section Header Container
- **Lines:** [3206-3346](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3206)
- **Class:** `models-section-header`

#### Models Header Title
- **Element:** Section Title Container
- **Lines:** [3223-3240](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3223)
- **Class:** `models-header-title`

#### Models Header Controls
- **Element:** Header Controls Container
- **Lines:** [3242-3305](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3242)
- **Class:** `models-header-controls`

#### Models Header Buttons
- **Element:** Action Buttons Container
- **Lines:** [3254-3304](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3254)
- **Class:** `models-header-buttons`

#### Collapse All Button
- **Element:** Collapse All Dropdowns Button
- **Lines:** [3256-3277](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3256)
- **Class:** `collapse-all-button`

#### Clear All Button
- **Element:** Clear All Selections Button
- **Lines:** [3279-3303](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3279)
- **Class:** `clear-all-button`

#### Models Header Right
- **Element:** Right Side Controls Container
- **Lines:** [3306-3345](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3306)
- **Class:** `models-header-right`

#### Models Count Indicator
- **Element:** Selected Models Count Badge
- **Lines:** [3308-3313](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3308)
- **Class:** `models-count-indicator` (with `has-selected` or `empty` modifiers)

#### Models Toggle Arrow
- **Element:** Toggle Models Section Visibility Button
- **Lines:** [3315-3344](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3315)
- **Class:** `models-toggle-arrow`

#### Loading Message
- **Element:** Models Loading State
- **Lines:** [3348-3349](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3348)
- **Class:** `loading-message`

#### Error Message (Models)
- **Element:** Models Error Display
- **Lines:** [3350-3352](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3350)
- **Class:** `error-message`

#### Models Selection Layout
- **Element:** Models Selection Grid Container
- **Lines:** [3354-3460](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3354)
- **Class:** `models-selection-layout`

#### Provider Dropdowns
- **Element:** Provider Dropdowns Container
- **Lines:** [3355-3460](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3355)
- **Class:** `provider-dropdowns`

#### Provider Dropdown
- **Element:** Individual Provider Dropdown
- **Lines:** [3359-3460](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3359)
- **Class:** `provider-dropdown` (with `has-selected-models` modifier)

#### Provider Header
- **Element:** Provider Header Container
- **Lines:** [3361-3412](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3361)
- **Class:** `provider-header`

#### Provider Left
- **Element:** Provider Name and Count Container
- **Lines:** [3365-3395](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3365)
- **Class:** `provider-left`

#### Provider Name
- **Element:** Provider Name Text
- **Lines:** [3366](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3366)
- **Class:** `provider-name`

#### Provider Count
- **Element:** Selected Models Count Badge
- **Lines:** [3373-3375](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3373)
- **Class:** `provider-count` (with `has-selected` or `empty` modifiers)

#### Provider Select All Button
- **Element:** Select All Models for Provider Button
- **Lines:** [3392-3405](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3392)
- **Class:** `provider-select-all` (with `disabled` and `all-selected` modifiers)

#### Dropdown Arrow
- **Element:** Dropdown Toggle Arrow
- **Lines:** [3407-3411](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3407)
- **Class:** `dropdown-arrow` (with `open` modifier)

#### Provider Models
- **Element:** Models List Container
- **Lines:** [3414-3459](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3414)
- **Class:** `provider-models`

#### Model Option
- **Element:** Individual Model Checkbox Option
- **Lines:** [3425-3458](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3425)
- **Class:** `model-option` (with `selected` and `disabled` modifiers)

#### Model Checkbox
- **Element:** Model Selection Checkbox
- **Lines:** [3432-3433](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3432)
- **Class:** `model-checkbox` (with `follow-up-deselected` modifier)

#### Model Info
- **Element:** Model Information Container
- **Lines:** [3434-3460](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3434)
- **Class:** `model-info`

#### Model Badge (Not in Conversation)
- **Element:** Not in Conversation Badge
- **Lines:** [3437-3441](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3437)
- **Class:** `model-badge not-in-conversation`

#### Model Badge (Coming Soon)
- **Element:** Coming Soon Badge
- **Lines:** [3442-3446](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3442)
- **Class:** `model-badge coming-soon`

#### Selected Models Section
- **Element:** Selected Models Display Section
- **Lines:** [3462-3499](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3462)
- **Class:** `selected-models-section`

#### Selected Models Grid
- **Element:** Selected Models Grid Container
- **Lines:** [3465-3487](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3465)
- **Class:** `selected-models-grid`

#### Selected Model Card
- **Element:** Individual Selected Model Card
- **Lines:** [3472-3486](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3472)
- **Class:** `selected-model-card`

#### Selected Model Header
- **Element:** Model Card Header
- **Lines:** [3473-3482](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3473)
- **Class:** `selected-model-header`

#### Remove Model Button
- **Element:** Remove Model from Selection Button
- **Lines:** [3476-3481](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3476)
- **Class:** `remove-model-btn`

#### Selected Model Description
- **Element:** Model Description Text
- **Lines:** [3483](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3483)
- **Class:** `selected-model-description`

#### Selected Models Spacer
- **Element:** Spacer Element
- **Lines:** [3488](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3488)
- **Class:** `selected-models-spacer`

---

### Results Display

**File:** `frontend/src/components/comparison/ResultsDisplay.tsx`

#### Results Section
- **Element:** Results Container
- **Lines:** [93-139](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultsDisplay.tsx#L93)
- **Class:** `results-section`

#### Response Metadata
- **Element:** Response Metadata Container
- **Lines:** [94-113](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultsDisplay.tsx#L94)
- **Class:** `response-metadata`

#### Metadata Item
- **Element:** Individual Metadata Entry
- **Lines:** [96-110](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultsDisplay.tsx#L96)
- **Class:** `metadata-item`

#### Metadata Label
- **Element:** Metadata Label Text
- **Lines:** [97](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultsDisplay.tsx#L97), [101](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultsDisplay.tsx#L101), [107](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultsDisplay.tsx#L107)
- **Class:** `metadata-label`

#### Metadata Value
- **Element:** Metadata Value Text
- **Lines:** [98](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultsDisplay.tsx#L98), [103](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultsDisplay.tsx#L103), [109](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultsDisplay.tsx#L109)
- **Class:** `metadata-value` (with `success` and `failed` modifiers)

#### Results Grid
- **Element:** Results Cards Grid Container
- **Lines:** [115-137](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultsDisplay.tsx#L115)
- **Class:** `results-grid`

---

### Result Card

**File:** `frontend/src/components/comparison/ResultCard.tsx`

#### Result Card Container
- **Element:** Individual Result Card
- **Lines:** [70-178](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultCard.tsx#L70)
- **Class:** `result-card conversation-card`

#### Result Header
- **Element:** Card Header Container
- **Lines:** [72-164](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultCard.tsx#L72)
- **Class:** `result-header`

#### Result Header Top
- **Element:** Top Header Section
- **Lines:** [73-144](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultCard.tsx#L73)
- **Class:** `result-header-top`

#### Result Card Title
- **Element:** Model Name Heading
- **Lines:** [74](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultCard.tsx#L74)
- **Tag:** `<h3>`

#### Header Buttons Container
- **Element:** Action Buttons Container
- **Lines:** [75-143](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultCard.tsx#L75)
- **Class:** `header-buttons-container`

#### Screenshot Card Button
- **Element:** Copy Formatted History Button
- **Lines:** [76-97](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultCard.tsx#L76)
- **Class:** `screenshot-card-btn`
- **Title:** "Copy formatted chat history"

#### Copy Response Button
- **Element:** Copy Raw History Button
- **Lines:** [99-119](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultCard.tsx#L99)
- **Class:** `copy-response-btn`
- **Title:** "Copy raw chat history"

#### Close Card Button
- **Element:** Hide Result Card Button
- **Lines:** [121-142](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultCard.tsx#L121)
- **Class:** `close-card-btn`
- **Title:** "Hide this result"

#### Result Header Bottom
- **Element:** Bottom Header Section
- **Lines:** [145-163](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultCard.tsx#L145)
- **Class:** `result-header-bottom`

#### Output Length
- **Element:** Character Count Display
- **Lines:** [146](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultCard.tsx#L146)
- **Class:** `output-length`

#### Result Tabs
- **Element:** Tab Buttons Container
- **Lines:** [147-160](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultCard.tsx#L147)
- **Class:** `result-tabs`

#### Tab Button (Formatted)
- **Element:** Formatted View Tab
- **Lines:** [148-153](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultCard.tsx#L148)
- **Class:** `tab-button` (with `active` modifier)

#### Tab Button (Raw)
- **Element:** Raw View Tab
- **Lines:** [154-159](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultCard.tsx#L154)
- **Class:** `tab-button` (with `active` modifier)

#### Status Badge
- **Element:** Success/Error Status Indicator
- **Lines:** [161-163](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultCard.tsx#L161)
- **Class:** `status` (with `error` or `success` modifiers)

#### Conversation Content
- **Element:** Messages Container
- **Lines:** [166-177](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/ResultCard.tsx#L166)
- **Class:** `conversation-content`
- **ID:** `conversation-content-{safeId}`

---

### Conversation Components

#### Conversation List

**File:** `frontend/src/components/conversation/ConversationList.tsx`

#### Conversation List Container
- **Element:** Conversation List Wrapper
- **Lines:** [62-72](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/conversation/ConversationList.tsx#L62)
- **Class:** `conversation-list` (with `no-scrollbar` or `scrollable` modifiers)

#### Conversation List Empty
- **Element:** Empty State Message
- **Lines:** [45-48](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/conversation/ConversationList.tsx#L45)
- **Class:** `conversation-list-empty`

---

#### Conversation Item

**File:** `frontend/src/components/conversation/ConversationItem.tsx`

#### Conversation Item Container
- **Element:** Individual Conversation Item
- **Lines:** [53-71](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/conversation/ConversationItem.tsx#L53)
- **Class:** `conversation-item history-item` (with `active-comparison` modifier)

#### History Prompt
- **Element:** Truncated Prompt Text
- **Lines:** [65](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/conversation/ConversationItem.tsx#L65)
- **Class:** `history-prompt`

#### History Meta
- **Element:** Metadata Container
- **Lines:** [66-69](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/conversation/ConversationItem.tsx#L66)
- **Class:** `history-meta`

#### History Date
- **Element:** Date Display
- **Lines:** [67](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/conversation/ConversationItem.tsx#L67)
- **Class:** `history-date`

#### History Models
- **Element:** Models Count Display
- **Lines:** [68](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/conversation/ConversationItem.tsx#L68)
- **Class:** `history-models`

---

#### Message Bubble

**File:** `frontend/src/components/conversation/MessageBubble.tsx`

#### Conversation Message
- **Element:** Individual Message Container
- **Lines:** [49-112](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/conversation/MessageBubble.tsx#L49)
- **Class:** `conversation-message` (with `user` or `assistant` modifier)

#### Message Header
- **Element:** Message Header Container
- **Lines:** [50-99](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/conversation/MessageBubble.tsx#L50)
- **Class:** `message-header`

#### Message Type
- **Element:** Message Type Indicator (User/AI)
- **Lines:** [51-95](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/conversation/MessageBubble.tsx#L51)
- **Class:** `message-type`

#### Message Time
- **Element:** Timestamp Display
- **Lines:** [96-98](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/conversation/MessageBubble.tsx#L96)
- **Class:** `message-time`

#### Message Content
- **Element:** Message Content Container
- **Lines:** [100-110](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/conversation/MessageBubble.tsx#L100)
- **Class:** `message-content`

#### Result Output (Formatted)
- **Element:** Formatted Output (LaTeX Rendered)
- **Lines:** [104](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/conversation/MessageBubble.tsx#L104)
- **Class:** `result-output`

#### Result Output (Raw)
- **Element:** Raw Text Output
- **Lines:** [108](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/conversation/MessageBubble.tsx#L108)
- **Class:** `result-output raw-output`

---

### Authentication Components

#### Auth Modal

**File:** `frontend/src/components/auth/AuthModal.tsx`

#### Auth Modal Overlay
- **Element:** Modal Background Overlay
- **Lines:** [59-92](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/AuthModal.tsx#L59)
- **Class:** `auth-modal-overlay`

#### Auth Modal Container
- **Element:** Modal Content Container
- **Lines:** [60-91](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/AuthModal.tsx#L60)
- **Class:** `auth-modal`

#### Auth Modal Close Button
- **Element:** Close Modal Button
- **Lines:** [61-63](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/AuthModal.tsx#L61)
- **Class:** `auth-modal-close`

---

#### Login Form

**File:** `frontend/src/components/auth/LoginForm.tsx`

#### Auth Form Container
- **Element:** Form Container
- **Lines:** [53-140](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/LoginForm.tsx#L53)
- **Class:** `auth-form-container`

#### Auth Form Header
- **Element:** Form Header Section
- **Lines:** [54-57](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/LoginForm.tsx#L54)
- **Class:** `auth-form-header`

#### Auth Form Title
- **Element:** Form Title
- **Lines:** [55](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/LoginForm.tsx#L55)
- **Tag:** `<h2>`
- **Text:** "Welcome Back"

#### Auth Form Subtitle
- **Element:** Form Subtitle
- **Lines:** [56](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/LoginForm.tsx#L56)
- **Tag:** `<p>`
- **Text:** "Sign in to your CompareIntel account"

#### Auth Form
- **Element:** Form Element
- **Lines:** [59-116](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/LoginForm.tsx#L59)
- **Class:** `auth-form`

#### Auth Error
- **Element:** Error Message Display
- **Lines:** [60-65](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/LoginForm.tsx#L60)
- **Class:** `auth-error`

#### Error Icon
- **Element:** Error Icon
- **Lines:** [62](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/LoginForm.tsx#L62)
- **Class:** `error-icon`

#### Form Group
- **Element:** Form Field Group
- **Lines:** [67-80](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/LoginForm.tsx#L67), [82-106](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/LoginForm.tsx#L82)
- **Class:** `form-group`

#### Email Input
- **Element:** Email Input Field
- **Lines:** [69-79](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/LoginForm.tsx#L69)
- **Type:** `email`
- **Test ID:** `login-email-input`
- **Placeholder:** "your@email.com"

#### Password Input Container
- **Element:** Password Input Wrapper
- **Lines:** [84-105](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/LoginForm.tsx#L84)
- **Class:** `password-input-container`

#### Password Input
- **Element:** Password Input Field
- **Lines:** [85-95](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/LoginForm.tsx#L85)
- **Type:** `password` or `text` (toggleable)
- **Test ID:** `login-password-input`
- **Placeholder:** "••••••••"

#### Password Toggle Button
- **Element:** Show/Hide Password Button
- **Lines:** [96-104](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/LoginForm.tsx#L96)
- **Class:** `password-toggle-btn`

#### Auth Submit Button
- **Element:** Sign In Submit Button
- **Lines:** [108-115](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/LoginForm.tsx#L108)
- **Class:** `auth-submit-btn`
- **Test ID:** `login-submit-button`
- **Text:** "Signing in..." or "Sign In"

#### Auth Form Footer
- **Element:** Form Footer Section
- **Lines:** [118-138](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/LoginForm.tsx#L118)
- **Class:** `auth-form-footer`

#### Auth Link Button
- **Element:** Switch Mode Link Button
- **Lines:** [121-127](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/LoginForm.tsx#L121), [130-136](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/LoginForm.tsx#L130)
- **Class:** `auth-link-btn`

---

#### Register Form

**File:** `frontend/src/components/auth/RegisterForm.tsx`

#### Auth Form Container
- **Element:** Form Container
- **Lines:** [163-282](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/RegisterForm.tsx#L163)
- **Class:** `auth-form-container`

#### Auth Form Header
- **Element:** Form Header Section
- **Lines:** [164-167](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/RegisterForm.tsx#L164)
- **Class:** `auth-form-header`

#### Auth Form Title
- **Element:** Form Title
- **Lines:** [165](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/RegisterForm.tsx#L165)
- **Tag:** `<h2>`
- **Text:** "Create Account"

#### Auth Form Subtitle
- **Element:** Form Subtitle
- **Lines:** [166](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/RegisterForm.tsx#L166)
- **Tag:** `<p>`
- **Text:** "Get 100 daily credits and more models for free"

#### Auth Form
- **Element:** Form Element
- **Lines:** [169-260](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/RegisterForm.tsx#L169)
- **Class:** `auth-form`

#### Email Input
- **Element:** Email Input Field
- **Lines:** [179-189](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/RegisterForm.tsx#L179)
- **Type:** `email`
- **Placeholder:** "your@email.com"

#### Password Input Container
- **Element:** Password Input Wrapper
- **Lines:** [194-219](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/RegisterForm.tsx#L194)
- **Class:** `password-input-container`

#### Password Input
- **Element:** Password Input Field
- **Lines:** [195-209](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/RegisterForm.tsx#L195)
- **ID:** `register-password`
- **Type:** `password` or `text` (toggleable)
- **Placeholder:** "••••••••••••"

#### Password Toggle Button
- **Element:** Show/Hide Password Button
- **Lines:** [210-218](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/RegisterForm.tsx#L210)
- **Class:** `password-toggle-btn`

#### Form Hint
- **Element:** Password Requirements Hint
- **Lines:** [220](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/RegisterForm.tsx#L220)
- **Class:** `form-hint`

#### Confirm Password Input Container
- **Element:** Confirm Password Input Wrapper
- **Lines:** [225-250](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/RegisterForm.tsx#L225)
- **Class:** `password-input-container`

#### Confirm Password Input
- **Element:** Confirm Password Input Field
- **Lines:** [226-240](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/RegisterForm.tsx#L226)
- **ID:** `register-confirm-password`
- **Type:** `password` or `text` (toggleable)
- **Placeholder:** "••••••••••••"

#### Confirm Password Toggle Button
- **Element:** Show/Hide Confirm Password Button
- **Lines:** [241-249](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/RegisterForm.tsx#L241)
- **Class:** `password-toggle-btn`

#### Auth Submit Button
- **Element:** Create Account Submit Button
- **Lines:** [253-259](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/RegisterForm.tsx#L253)
- **Class:** `auth-submit-btn`
- **Text:** "Creating account..." or "Create Account"

#### Auth Form Footer
- **Element:** Form Footer Section
- **Lines:** [262-280](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/RegisterForm.tsx#L262)
- **Class:** `auth-form-footer`

#### Terms Text
- **Element:** Terms of Service Text
- **Lines:** [263-268](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/RegisterForm.tsx#L263)
- **Class:** `terms-text`

#### Terms Link
- **Element:** Terms of Service Link
- **Lines:** [265](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/RegisterForm.tsx#L265)
- **Class:** `terms-link`

---

#### Forgot Password Form

**File:** `frontend/src/components/auth/ForgotPasswordForm.tsx`

#### Auth Form Container (Success State)
- **Element:** Success State Container
- **Lines:** [70-104](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/ForgotPasswordForm.tsx#L70)
- **Class:** `auth-form-container`

#### Auth Form Header (Success)
- **Element:** Success Header
- **Lines:** [71-74](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/ForgotPasswordForm.tsx#L71)
- **Class:** `auth-form-header`

#### Success Title
- **Element:** Success Title
- **Lines:** [72](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/ForgotPasswordForm.tsx#L72)
- **Tag:** `<h2>`
- **Text:** "Check Your Email"

#### Success Subtitle
- **Element:** Success Subtitle
- **Lines:** [73](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/ForgotPasswordForm.tsx#L73)
- **Tag:** `<p>`
- **Text:** "Password reset instructions sent"

#### Success Icon
- **Element:** Email Icon
- **Lines:** [77-82](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/ForgotPasswordForm.tsx#L77)
- **Emoji:** 📧

#### Success Message
- **Element:** Success Message Text
- **Lines:** [83-89](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/ForgotPasswordForm.tsx#L83)

#### Auth Form Container (Form State)
- **Element:** Form Container
- **Lines:** [108-158](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/ForgotPasswordForm.tsx#L108)
- **Class:** `auth-form-container`

#### Auth Form Header (Form)
- **Element:** Form Header Section
- **Lines:** [109-112](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/ForgotPasswordForm.tsx#L109)
- **Class:** `auth-form-header`

#### Form Title
- **Element:** Form Title
- **Lines:** [110](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/ForgotPasswordForm.tsx#L110)
- **Tag:** `<h2>`
- **Text:** "Forgot Password?"

#### Form Subtitle
- **Element:** Form Subtitle
- **Lines:** [111](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/ForgotPasswordForm.tsx#L111)
- **Tag:** `<p>`
- **Text:** "Enter your email to reset your password"

#### Email Input
- **Element:** Email Input Field
- **Lines:** [124-133](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/ForgotPasswordForm.tsx#L124)
- **Type:** `email`
- **Placeholder:** "your@email.com"

#### Auth Submit Button
- **Element:** Send Reset Link Button
- **Lines:** [136-142](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/ForgotPasswordForm.tsx#L136)
- **Class:** `auth-submit-btn`
- **Text:** "Sending..." or "Send Reset Link"

---

#### Reset Password Form

**File:** `frontend/src/components/auth/ResetPasswordForm.tsx`

#### Auth Form Container (Success State)
- **Element:** Success State Container
- **Lines:** [117-138](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/ResetPasswordForm.tsx#L117)
- **Class:** `auth-form-container`

#### Success Title
- **Element:** Success Title
- **Lines:** [119](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/ResetPasswordForm.tsx#L119)
- **Tag:** `<h2>`
- **Text:** "Password Reset!"

#### Success Subtitle
- **Element:** Success Subtitle
- **Lines:** [120](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/ResetPasswordForm.tsx#L120)
- **Tag:** `<p>`
- **Text:** "Your password has been updated"

#### Success Icon
- **Element:** Checkmark Icon
- **Lines:** [124-128](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/ResetPasswordForm.tsx#L124)
- **Symbol:** ✓

#### Auth Form Container (Form State)
- **Element:** Form Container
- **Lines:** [142-196](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/ResetPasswordForm.tsx#L142)
- **Class:** `auth-form-container`

#### Form Title
- **Element:** Form Title
- **Lines:** [144](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/ResetPasswordForm.tsx#L144)
- **Tag:** `<h2>`
- **Text:** "Reset Password"

#### Form Subtitle
- **Element:** Form Subtitle
- **Lines:** [145](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/ResetPasswordForm.tsx#L145)
- **Tag:** `<p>`
- **Text:** "Enter your new password"

#### New Password Input
- **Element:** New Password Input Field
- **Lines:** [158-168](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/ResetPasswordForm.tsx#L158)
- **ID:** `newPassword`
- **Type:** `password`
- **Placeholder:** "••••••••••••"

#### Form Hint
- **Element:** Password Requirements Hint
- **Lines:** [169](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/ResetPasswordForm.tsx#L169)
- **Class:** `form-hint`

#### Confirm Password Input
- **Element:** Confirm Password Input Field
- **Lines:** [174-184](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/ResetPasswordForm.tsx#L174)
- **ID:** `confirmPassword`
- **Type:** `password`
- **Placeholder:** "••••••••••••"

#### Auth Submit Button
- **Element:** Reset Password Submit Button
- **Lines:** [187-193](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/ResetPasswordForm.tsx#L187)
- **Class:** `auth-submit-btn`
- **Text:** "Resetting..." or "Reset Password"

---

#### User Menu

**File:** `frontend/src/components/auth/UserMenu.tsx`

#### User Menu Container
- **Element:** User Menu Wrapper
- **Lines:** [111-435](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L111)
- **Class:** `user-menu`

#### User Menu Trigger
- **Element:** User Menu Toggle Button
- **Lines:** [112-122](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L112)
- **Class:** `user-menu-trigger`

#### User Avatar
- **Element:** User Avatar Circle
- **Lines:** [118-120](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L118)
- **Class:** `user-avatar`

#### User Menu Caret
- **Element:** Dropdown Arrow
- **Lines:** [121](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L121)
- **Class:** `user-menu-caret`

#### User Menu Dropdown
- **Element:** Dropdown Menu Container
- **Lines:** [124-234](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L124)
- **Class:** `user-menu-dropdown`

#### User Menu Header
- **Element:** Dropdown Header Section
- **Lines:** [126-138](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L126)
- **Class:** `user-menu-header`

#### User Info
- **Element:** User Information Container
- **Lines:** [127-137](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L127)
- **Class:** `user-info`

#### User Email
- **Element:** User Email Display
- **Lines:** [128](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L128)
- **Class:** `user-email`

#### User Tier Row
- **Element:** Tier Badge and Limit Container
- **Lines:** [129-136](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L129)
- **Class:** `user-tier-row`

#### Tier Badge
- **Element:** Subscription Tier Badge
- **Lines:** [130-132](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L130)
- **Class:** `tier-badge` (with `tier-badge-pro`, `tier-badge-starter`, or `tier-badge-free` modifiers)

#### Daily Limit Info
- **Element:** Daily Limit Display
- **Lines:** [134-135](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L134)
- **Class:** `daily-limit-info`

#### User Menu Divider
- **Element:** Menu Divider Line
- **Lines:** [140](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L140), [186](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L186), [222](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L222)
- **Class:** `user-menu-divider`

#### Usage Section
- **Element:** Usage Statistics Section
- **Lines:** [142-184](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L142)
- **Class:** `usage-section`

#### Usage Header
- **Element:** Usage Section Title
- **Lines:** [143](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L143)
- **Class:** `usage-header`
- **Text:** "Usage Today"

#### Usage Stats Grid
- **Element:** Usage Statistics Grid Container
- **Lines:** [144-177](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L144)
- **Class:** `usage-stats-grid`

#### Usage Stat
- **Element:** Individual Usage Stat Container
- **Lines:** [145-160](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L145), [161-176](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L161)
- **Class:** `usage-stat`

#### Usage Stat Label
- **Element:** Usage Stat Label Text
- **Lines:** [146](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L146), [162](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L162)
- **Class:** `usage-stat-label`

#### Usage Stat Value
- **Element:** Usage Stat Value Container
- **Lines:** [147-151](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L147), [163-167](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L163)
- **Class:** `usage-stat-value`

#### Usage Current
- **Element:** Current Usage Count
- **Lines:** [148](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L148), [164](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L164)
- **Class:** `usage-current`

#### Usage Separator
- **Element:** Separator Symbol
- **Lines:** [149](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L149), [165](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L165)
- **Class:** `usage-separator`

#### Usage Limit
- **Element:** Usage Limit Count
- **Lines:** [150](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L150), [166](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L166)
- **Class:** `usage-limit`

#### Usage Progress Bar
- **Element:** Progress Bar Container
- **Lines:** [152-159](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L152), [168-175](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L168)
- **Class:** `usage-progress-bar`

#### Usage Progress Fill
- **Element:** Progress Bar Fill
- **Lines:** [154-158](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L154), [170-174](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L170)
- **Class:** `usage-progress-fill` (with `extended` modifier)

#### Usage Overage
- **Element:** Overage Warning Display
- **Lines:** [178-183](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L178)
- **Class:** `usage-overage`

#### Overage Icon
- **Element:** Warning Icon
- **Lines:** [180](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L180)
- **Class:** `overage-icon`

#### Overage Text
- **Element:** Overage Message Text
- **Lines:** [181](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L181)
- **Class:** `overage-text`

#### User Menu Nav
- **Element:** Menu Navigation Container
- **Lines:** [188-220](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L188)
- **Class:** `user-menu-nav`

#### Menu Item
- **Element:** Menu Navigation Item Button
- **Lines:** [189-195](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L189), [196-202](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L196), [203-209](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L203), [210-219](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L210)
- **Class:** `menu-item`

#### Menu Icon
- **Element:** Menu Item Icon
- **Lines:** [193](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L193), [200](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L200), [207](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L207), [217](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L217)
- **Class:** `menu-icon`

#### Logout Button
- **Element:** Sign Out Button
- **Lines:** [224-233](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L224)
- **Class:** `menu-item logout-btn`

#### Modal Overlay
- **Element:** Modal Background Overlay
- **Lines:** [239-253](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L239), [256-272](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L256), [274-432](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L274)
- **Class:** `modal-overlay`

#### Modal Content (Coming Soon)
- **Element:** Coming Soon Modal Container
- **Lines:** [240-252](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L240), [258-271](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L258)
- **Class:** `modal-content coming-soon-modal`

#### Modal Close
- **Element:** Close Modal Button
- **Lines:** [241-243](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L241), [259-261](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L259), [277-279](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L277)
- **Class:** `modal-close`

#### Modal Icon
- **Element:** Modal Icon Display
- **Lines:** [244](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L244), [262](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L262)
- **Class:** `modal-icon`

#### Modal Title
- **Element:** Modal Title Heading
- **Lines:** [245](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L245), [263](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L263), [281](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L281)
- **Class:** `modal-title`

#### Modal Description
- **Element:** Modal Description Text
- **Lines:** [246-248](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L246), [264-266](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L264)
- **Class:** `modal-description`

#### Modal Button Primary
- **Element:** Primary Modal Button
- **Lines:** [249-251](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L249), [267-269](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L267), [427-429](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L427)
- **Class:** `modal-button-primary`

#### Upgrade Modal Content
- **Element:** Upgrade Plan Modal Container
- **Lines:** [276-431](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L276)
- **Class:** `modal-content upgrade-modal`

#### Upgrade Modal Header
- **Element:** Upgrade Modal Header Section
- **Lines:** [280-286](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L280)
- **Class:** `upgrade-modal-header`

#### Modal Subtitle
- **Element:** Modal Subtitle Text
- **Lines:** [282](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L282), [283-285](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L283)
- **Class:** `modal-subtitle`

#### Pricing Tiers
- **Element:** Pricing Tiers Container
- **Lines:** [288-418](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L288)
- **Class:** `pricing-tiers`

#### Pricing Tier
- **Element:** Individual Pricing Tier Card
- **Lines:** [289-320](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L289), [322-352](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L322), [354-385](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L354), [387-417](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L387)
- **Class:** `pricing-tier` (with `tier-starter` or `tier-pro` modifiers)

#### Tier Header
- **Element:** Tier Header Container
- **Lines:** [290-293](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L290), [323-325](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L323), [355-358](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L355), [388-390](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L388)
- **Class:** `tier-header`

#### Tier Name
- **Element:** Tier Name Heading
- **Lines:** [291](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L291), [324](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L324), [356](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L356), [389](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L389)
- **Class:** `tier-name`

#### Tier Badge (Popular/Best Value)
- **Element:** Tier Badge
- **Lines:** [292](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L292), [357](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L357)
- **Class:** `tier-badge` (with `tier-badge-starter` or `tier-badge-pro` modifiers)

#### Tier Features
- **Element:** Features List Container
- **Lines:** [294-319](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L294), [326-351](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L326), [359-384](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L359), [391-416](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L391)
- **Class:** `tier-features`

#### Feature Item
- **Element:** Individual Feature Entry
- **Lines:** [295-298](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L295), [299-302](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L299), [etc.](frontend/src/components/auth/UserMenu.tsx#Letc.)
- **Class:** `feature-item`

#### Feature Icon
- **Element:** Feature Checkmark Icon
- **Lines:** [296](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L296), [300](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L300), [etc.](frontend/src/components/auth/UserMenu.tsx#Letc.)
- **Class:** `feature-icon`

#### Feature Text
- **Element:** Feature Description Text
- **Lines:** [297](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L297), [301](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L301), [etc.](frontend/src/components/auth/UserMenu.tsx#Letc.)
- **Class:** `feature-text`

#### Upgrade Modal Footer
- **Element:** Upgrade Modal Footer Section
- **Lines:** [420-430](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L420)
- **Class:** `upgrade-modal-footer`

#### Pricing Notice
- **Element:** Pricing Information Text
- **Lines:** [421-423](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L421), [424-426](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/UserMenu.tsx#L424)
- **Class:** `pricing-notice`

---

#### Verification Banner

**File:** `frontend/src/components/auth/VerificationBanner.tsx`

#### Verification Banner Container
- **Element:** Email Verification Banner
- **Lines:** [131-194](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/VerificationBanner.tsx#L131)
- **Background:** `#f59e0b` (orange)
- **Dynamic styling based on animation state**

#### Banner Title
- **Element:** Banner Title Text
- **Lines:** [148-150](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/VerificationBanner.tsx#L148)
- **Text:** "📧 Please verify your email address"

#### Banner Message
- **Element:** Banner Message Text
- **Lines:** [152-158](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/VerificationBanner.tsx#L152)

#### Resend Button
- **Element:** Resend Verification Email Button
- **Lines:** [165-192](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/VerificationBanner.tsx#L165)
- **Text:** "Sending...", "Wait {X}s to resend", or "Resend Verification Email"

---

#### Verify Email

**File:** `frontend/src/components/auth/VerifyEmail.tsx`

#### Verification Banner Container (Success)
- **Element:** Success Verification Banner
- **Lines:** [139-208](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/VerifyEmail.tsx#L139)
- **Background:** Green gradient
- **Dynamic styling based on animation state**

#### Success Icon Container
- **Element:** Success Icon Circle
- **Lines:** [169-184](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/VerifyEmail.tsx#L169)

#### Success Text Content
- **Element:** Success Message Container
- **Lines:** [187-194](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/VerifyEmail.tsx#L187)

#### Success Title
- **Element:** Success Title Text
- **Lines:** [188-190](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/VerifyEmail.tsx#L188)
- **Text:** "Email Verified Successfully!"

#### Success Message
- **Element:** Success Message Text
- **Lines:** [191-193](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/VerifyEmail.tsx#L191)

#### Verification Banner Container (Error)
- **Element:** Error Verification Banner
- **Lines:** [209-258](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/VerifyEmail.tsx#L209)
- **Background:** Red gradient
- **Dynamic styling based on animation state**

#### Error Title
- **Element:** Error Title Text
- **Lines:** [211-216](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/VerifyEmail.tsx#L211)
- **Text:** "❌ Verification Failed"

#### Error Message
- **Element:** Error Message Text
- **Lines:** [220-227](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/VerifyEmail.tsx#L220)

#### Close Button
- **Element:** Close Error Banner Button
- **Lines:** [230-256](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/auth/VerifyEmail.tsx#L230)

---

### Shared Components

#### Button

**File:** `frontend/src/components/shared/Button.tsx`

#### Button Element
- **Element:** Reusable Button Component
- **Lines:** [64-88](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/shared/Button.tsx#L64)
- **Class:** `button` (with variant, size, width, and loading modifiers)
- **Variants:** `button-primary`, `button-secondary`, `button-danger`, `button-ghost`
- **Sizes:** `button-small`, `button-medium`, `button-large`
- **Modifiers:** `button-full-width`, `button-loading`

#### Button Spinner
- **Element:** Loading Spinner
- **Lines:** [71-75](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/shared/Button.tsx#L71)
- **Class:** `button-spinner`

#### Button Icon Before
- **Element:** Icon Before Text
- **Lines:** [76-80](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/shared/Button.tsx#L76)
- **Class:** `button-icon-before`

#### Button Icon After
- **Element:** Icon After Text
- **Lines:** [82-86](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/shared/Button.tsx#L82)
- **Class:** `button-icon-after`

---

#### Done Selecting Card

**File:** `frontend/src/components/shared/DoneSelectingCard.tsx`

#### Done Selecting Card Container
- **Element:** Floating Confirmation Card
- **Lines:** [11-25](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/shared/DoneSelectingCard.tsx#L11)
- **Class:** `done-selecting-card`

#### Done Selecting Content
- **Element:** Card Content Container
- **Lines:** [12-23](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/shared/DoneSelectingCard.tsx#L12)
- **Class:** `done-selecting-content`

#### Done Selecting Title
- **Element:** Card Title
- **Lines:** [13](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/shared/DoneSelectingCard.tsx#L13)
- **Tag:** `<h3>`
- **Text:** "Done Selecting?"

#### Done Selecting Button
- **Element:** Confirm Selection Button
- **Lines:** [14-22](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/shared/DoneSelectingCard.tsx#L14)
- **Class:** `done-selecting-button`

---

#### Loading Spinner

**File:** `frontend/src/components/shared/LoadingSpinner.tsx` (referenced but not read)

#### Loading Spinner
- **Element:** Loading Spinner Component
- **Referenced in:** [StreamingIndicator.tsx (line 48)](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/StreamingIndicator.tsx#L48)
- **Class:** `modern-spinner` (used in [App.tsx line 3556](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3556))

---

#### Streaming Indicator

**File:** `frontend/src/components/comparison/StreamingIndicator.tsx`

#### Loading Section
- **Element:** Loading State Container
- **Lines:** [46-62](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/StreamingIndicator.tsx#L46)
- **Class:** `loading-section`

#### Loading Content
- **Element:** Loading Content Wrapper
- **Lines:** [47-50](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/StreamingIndicator.tsx#L47)
- **Class:** `loading-content`

#### Loading Message
- **Element:** Processing Message Text
- **Lines:** [49](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/StreamingIndicator.tsx#L49)
- **Text:** "Processing response from X AI model(s)..."

#### Cancel Button
- **Element:** Cancel Operation Button
- **Lines:** [51-59](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/StreamingIndicator.tsx#L51)
- **Class:** `cancel-button`

#### Cancel X
- **Element:** Cancel Icon
- **Lines:** [57](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/StreamingIndicator.tsx#L57)
- **Class:** `cancel-x`

#### Cancel Text
- **Element:** Cancel Text Label
- **Lines:** [58](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/comparison/StreamingIndicator.tsx#L58)
- **Class:** `cancel-text`

---

### Mock Mode Banner

**File:** `frontend/src/components/layout/MockModeBanner.tsx`

#### Mock Mode Banner Container
- **Element:** Mock Mode Warning Banner
- **Lines:** [12-21](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/MockModeBanner.tsx#L12)
- **Class:** `mock-mode-banner`

#### Mock Mode Banner Content
- **Element:** Banner Content Container
- **Lines:** [13-19](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/MockModeBanner.tsx#L13)
- **Class:** `mock-mode-banner-content`

#### Mock Mode Icon
- **Element:** Mock Mode Icon
- **Lines:** [14](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/MockModeBanner.tsx#L14)
- **Class:** `mock-mode-icon`
- **Emoji:** 🎭

#### Mock Mode Text
- **Element:** Banner Text
- **Lines:** [15-17](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/MockModeBanner.tsx#L15)
- **Class:** `mock-mode-text`

#### Dev Mode Indicator
- **Element:** Development Mode Indicator
- **Lines:** [17](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/layout/MockModeBanner.tsx#L17)
- **Class:** `dev-mode-indicator`

---

### Footer

**File:** `frontend/src/components/Footer.tsx`

#### Footer Container
- **Element:** Footer Section
- **Lines:** [4-34](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/Footer.tsx#L4)
- **Tag:** `<footer>`
- **Inline styles**

#### Footer Text
- **Element:** Footer Text Paragraphs
- **Lines:** [16-29](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/Footer.tsx#L16), [30-32](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/Footer.tsx#L30)
- **Tag:** `<p>`

#### Support Email Link
- **Element:** Support Email Link
- **Lines:** [18-28](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/Footer.tsx#L18)
- **Tag:** `<a>`
- **Email:** support@compareintel.com

---

### Terms of Service

**File:** `frontend/src/components/TermsOfService.tsx`

#### Terms Container
- **Element:** Terms Page Container
- **Lines:** [11-191](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/TermsOfService.tsx#L11)
- **Class:** `terms-of-service`

#### Terms Container (Inner)
- **Element:** Terms Content Container
- **Lines:** [12-189](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/TermsOfService.tsx#L12)
- **Class:** `terms-container`

#### Terms Header
- **Element:** Terms Header Section
- **Lines:** [13-16](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/TermsOfService.tsx#L13)
- **Class:** `terms-header`

#### Terms Title
- **Element:** Terms Title Heading
- **Lines:** [14](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/TermsOfService.tsx#L14)
- **Tag:** `<h1>`
- **Text:** "Terms of Service"

#### Last Updated
- **Element:** Last Updated Date
- **Lines:** [15](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/TermsOfService.tsx#L15)
- **Class:** `last-updated`

#### Terms Content
- **Element:** Terms Content Section
- **Lines:** [18-188](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/TermsOfService.tsx#L18)
- **Class:** `terms-content`

#### Terms Sections
- **Element:** Individual Terms Sections
- **Lines:** [19-187](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/TermsOfService.tsx#L19)
- **Tag:** `<section>`
- **18 sections total**

---

## Admin Interface Components

### Admin Panel

**File:** `frontend/src/components/admin/AdminPanel.tsx`

#### Admin Panel Container
- **Element:** Admin Panel Main Container
- **Lines:** [740-1671](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L740)
- **Class:** `admin-panel`

#### Admin Header
- **Element:** Admin Panel Header Section
- **Lines:** [741-761](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L741)
- **Class:** `admin-header`

#### Admin Header Content
- **Element:** Header Content Container
- **Lines:** [742-760](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L742)
- **Class:** `admin-header-content`

#### Back Button
- **Element:** Back to Main App Button
- **Lines:** [743-747](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L743)
- **Class:** `back-button`
- **Title:** "Back to Main App"

#### Admin Title Section
- **Element:** Title Section Container
- **Lines:** [748-751](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L748)
- **Class:** `admin-title-section`

#### Admin Title
- **Element:** Admin Panel Title
- **Lines:** [749](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L749)
- **Tag:** `<h1>`
- **Text:** "Admin Panel"

#### Admin Subtitle
- **Element:** Admin Panel Subtitle
- **Lines:** [750](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L750)
- **Tag:** `<p>`
- **Text:** "Manage users and monitor system activity"

#### Sign Out Button
- **Element:** Sign Out Button
- **Lines:** [752-759](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L752)
- **Class:** `sign-out-button`
- **Title:** "Sign Out"

#### Error Message
- **Element:** Error Display Container
- **Lines:** [763-769](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L763)
- **Class:** `error-message`

#### Error Dismiss Button
- **Element:** Dismiss Error Button
- **Lines:** [767](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L767)
- **Tag:** `<button>`

#### Admin Stats Section
- **Element:** Statistics Dashboard Section
- **Lines:** [773-822](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L773)
- **Class:** `admin-stats`

#### Stats Title
- **Element:** Statistics Section Title
- **Lines:** [775](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L775)
- **Tag:** `<h2>`
- **Text:** "System Statistics"

#### Stats Grid
- **Element:** Statistics Cards Grid
- **Lines:** [776-794](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L776)
- **Class:** `stats-grid`

#### Stat Card
- **Element:** Individual Stat Card
- **Lines:** [777-780](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L777), [781-784](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L781), [785-788](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L785), [789-793](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L789)
- **Class:** `stat-card`

#### Stat Card Title
- **Element:** Stat Card Title
- **Lines:** [778](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L778), [782](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L782), [786](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L786), [790](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L790)
- **Tag:** `<h3>`

#### Stat Number
- **Element:** Stat Value Display
- **Lines:** [779](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L779), [783](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L783), [787](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L787), [791](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L791)
- **Class:** `stat-number`

#### Stat Label
- **Element:** Stat Label Text
- **Lines:** [792](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L792)
- **Class:** `stat-label`

#### Stats Breakdown
- **Element:** Statistics Breakdown Section
- **Lines:** [796-820](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L796)
- **Class:** `stats-breakdown`

#### Breakdown Section
- **Element:** Breakdown Section Container
- **Lines:** [797-807](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L797), [809-819](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L809)
- **Class:** `breakdown-section`

#### Breakdown Title
- **Element:** Breakdown Section Title
- **Lines:** [798](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L798), [810](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L810)
- **Tag:** `<h3>`

#### Breakdown List
- **Element:** Breakdown Items List
- **Lines:** [799-806](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L799), [811-818](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L811)
- **Class:** `breakdown-list`

#### Breakdown Item
- **Element:** Individual Breakdown Item
- **Lines:** [801-804](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L801), [813-816](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L813)
- **Class:** `breakdown-item`

#### Tier/Role Name
- **Element:** Tier or Role Name Display
- **Lines:** [802](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L802), [814](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L814)
- **Class:** `tier-name` or `role-name`

#### Tier/Role Count
- **Element:** Count Display
- **Lines:** [803](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L803), [815](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L815)
- **Class:** `tier-count` or `role-count`

#### Admin Tabs
- **Element:** Tab Navigation Container
- **Lines:** [825-838](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L825)
- **Class:** `admin-tabs`

#### Admin Tab (Users)
- **Element:** Users Tab Button
- **Lines:** [826-831](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L826)
- **Class:** `admin-tab` (with `active` modifier)
- **Text:** "👥 Users"

#### Admin Tab (Logs)
- **Element:** Action Logs Tab Button
- **Lines:** [832-837](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L832)
- **Class:** `admin-tab` (with `active` modifier)
- **Text:** "📋 Action Logs"

#### Logs Management Section
- **Element:** Logs Management Container
- **Lines:** [841-1009](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L841)
- **Class:** `logs-management`

#### Logs Management Header
- **Element:** Logs Section Header
- **Lines:** [843-852](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L843)
- **Class:** `logs-management-header`

#### Logs Title
- **Element:** Logs Section Title
- **Lines:** [844](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L844)
- **Tag:** `<h2>`
- **Text:** "Admin Action Logs"

#### Refresh Logs Button
- **Element:** Refresh Logs Button
- **Lines:** [845-851](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L845)
- **Class:** `refresh-logs-btn`
- **Text:** "🔄 Refresh"

#### Logs Search Form
- **Element:** Logs Search and Filter Form
- **Lines:** [855-905](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L855)
- **Class:** `logs-search-form`

#### Logs Search Controls
- **Element:** Search Controls Container
- **Lines:** [856-904](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L856)
- **Class:** `logs-search-controls`

#### Search Input (Logs)
- **Element:** Logs Search Input Field
- **Lines:** [857-869](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L857)
- **Class:** `search-input`
- **Placeholder:** "Search by description..."

#### Filter Select (Logs)
- **Element:** Action Type Filter Dropdown
- **Lines:** [871-891](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L871)
- **Class:** `filter-select`

#### Search Button (Logs)
- **Element:** Search Button
- **Lines:** [893-903](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L893)
- **Class:** `search-btn`
- **Text:** "Search"

#### Logs Table Container
- **Element:** Logs Table Wrapper
- **Lines:** [915-1007](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L915)
- **Class:** `logs-table-container`

#### Logs Table
- **Element:** Logs Data Table
- **Lines:** [916-975](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L916)
- **Class:** `logs-table`

#### Logs Table Header
- **Element:** Table Header Row
- **Lines:** [917-926](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L917)
- **Tag:** `<thead><tr>`

#### Logs Table Headers
- **Element:** Table Column Headers
- **Lines:** [919-925](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L919)
- **Tag:** `<th>`
- **Columns:** Timestamp, Action Type, Description, Admin, Target User, IP Address, Actions

#### Logs Table Body
- **Element:** Table Body Container
- **Lines:** [928-974](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L928)
- **Tag:** `<tbody>`

#### Logs Table Row
- **Element:** Individual Log Entry Row
- **Lines:** [936-972](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L936)
- **Tag:** `<tr>`

#### Action Type Badge
- **Element:** Action Type Badge
- **Lines:** [943-945](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L943)
- **Class:** `action-type-badge` (with `action-{type}` modifier)

#### Log Description
- **Element:** Log Description Cell
- **Lines:** [947-949](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L947)
- **Class:** `log-description`

#### Log User Email
- **Element:** User Email Display
- **Lines:** [951](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L951), [955](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L955)
- **Class:** `log-user-email`

#### Log NA
- **Element:** Not Available Indicator
- **Lines:** [957](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L957)
- **Class:** `log-na`

#### Log IP
- **Element:** IP Address Display
- **Lines:** [960](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L960)
- **Class:** `log-ip`

#### View Details Button
- **Element:** View Log Details Button
- **Lines:** [962-970](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L962)
- **Class:** `view-details-btn`
- **Text:** "View Details"

#### Pagination (Logs)
- **Element:** Logs Pagination Container
- **Lines:** [978-1006](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L978)
- **Class:** `pagination`

#### Page Button (Previous)
- **Element:** Previous Page Button
- **Lines:** [979-990](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L979)
- **Class:** `page-btn`
- **Text:** "Previous"

#### Page Info
- **Element:** Page Number Display
- **Lines:** [992-994](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L992)
- **Class:** `page-info`

#### Page Button (Next)
- **Element:** Next Page Button
- **Lines:** [996-1005](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L996)
- **Class:** `page-btn`
- **Text:** "Next"

#### Anonymous Settings Section
- **Element:** Anonymous Users Settings (Dev Only)
- **Lines:** [1013-1056](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1013)
- **Class:** `admin-stats`

#### Anonymous Mock Mode Section
- **Element:** Anonymous Mock Mode Controls
- **Lines:** [1020-1035](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1020)
- **Inline styles**

#### Anonymous Mock Mode Button
- **Element:** Toggle Anonymous Mock Mode Button
- **Lines:** [1022-1029](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1022)
- **Class:** `mock-mode-btn` (with `enabled` or `disabled` modifiers)

#### Anonymous Credit Reset Section
- **Element:** Reset Anonymous Credits Controls
- **Lines:** [1038-1051](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1038)
- **Inline styles**

#### Reset Credits Button
- **Element:** Reset Anonymous Credits Button
- **Lines:** [1040-1047](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1040)
- **Class:** `mock-mode-btn zero-usage-btn` (with `credits-reset-green` modifier)

#### User Management Section
- **Element:** User Management Container
- **Lines:** [1059-1268](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1059)
- **Class:** `user-management`

#### User Management Header
- **Element:** User Management Header
- **Lines:** [1061-1069](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1061)
- **Class:** `user-management-header`

#### User Management Title
- **Element:** User Management Title
- **Lines:** [1062](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1062)
- **Tag:** `<h2>`
- **Text:** "User Management"

#### Create User Button
- **Element:** Create New User Button
- **Lines:** [1063-1068](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1063)
- **Class:** `create-user-btn`
- **Text:** "Create User"

#### Search Form
- **Element:** User Search and Filter Form
- **Lines:** [1072-1115](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1072)
- **Class:** `search-form`

#### Search Controls
- **Element:** Search Controls Container
- **Lines:** [1073-1114](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1073)
- **Class:** `search-controls`

#### Search Input (Users)
- **Element:** User Search Input Field
- **Lines:** [1074-1080](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1074)
- **Class:** `search-input`
- **Placeholder:** "Search by email..."

#### Filter Select (Role)
- **Element:** Role Filter Dropdown
- **Lines:** [1082-1092](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1082)
- **Class:** `filter-select`

#### Filter Select (Tier)
- **Element:** Tier Filter Dropdown
- **Lines:** [1094-1105](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1094)
- **Class:** `filter-select`

#### Search Button (Users)
- **Element:** Search Users Button
- **Lines:** [1107-1113](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1107)
- **Class:** `search-btn`
- **Text:** "Search"

#### Users Table Container
- **Element:** Users Table Wrapper
- **Lines:** [1119-1267](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1119)
- **Class:** `users-table-container`

#### Users Table
- **Element:** Users Data Table
- **Lines:** [1120-1240](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1120)
- **Class:** `users-table`

#### Users Table Header
- **Element:** Table Header Row
- **Lines:** [1121-1131](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1121)
- **Tag:** `<thead><tr>`

#### Users Table Headers
- **Element:** Table Column Headers
- **Lines:** [1123-1130](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1123)
- **Tag:** `<th>`
- **Columns:** Email, Role, Tier, Status, Verified, Usage, Created, Actions

#### Users Table Body
- **Element:** Table Body Container
- **Lines:** [1133-1239](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1133)
- **Tag:** `<tbody>`

#### Users Table Row
- **Element:** Individual User Row
- **Lines:** [1135-1237](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1135)
- **Tag:** `<tr>`

#### Role Badge
- **Element:** User Role Badge
- **Lines:** [1138-1140](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1138)
- **Class:** `role-badge` (with `role-{role}` modifier)

#### Tier Select (Super Admin)
- **Element:** Tier Change Dropdown (Super Admin Only)
- **Lines:** [1144-1155](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1144)
- **Class:** `tier-select`

#### Tier Badge (Display)
- **Element:** Tier Badge Display
- **Lines:** [1157-1159](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1157)
- **Class:** `tier-badge` (with `tier-{tier}` modifier)

#### Status Badge
- **Element:** Active/Inactive Status Badge
- **Lines:** [1163-1165](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1163)
- **Class:** `status-badge` (with `active` or `inactive` modifiers)

#### Verified Badge
- **Element:** Verified Status Badge
- **Lines:** [1168-1170](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1168)
- **Class:** `verified-badge` (with `verified` or `unverified` modifiers)

#### Usage Info
- **Element:** Usage Information Container
- **Lines:** [1173-1181](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1173)
- **Class:** `usage-info`

#### Usage Count
- **Element:** Daily Usage Count Display
- **Lines:** [1174](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1174)
- **Class:** `usage-count`

#### Overage Count
- **Element:** Monthly Overage Count Display
- **Lines:** [1176-1178](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1176)
- **Class:** `overage-count`

#### Action Buttons
- **Element:** User Action Buttons Container
- **Lines:** [1194-1235](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1194)
- **Class:** `action-buttons`

#### Toggle Button (Activate/Deactivate)
- **Element:** Toggle User Active Status Button
- **Lines:** [1195-1200](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1195)
- **Class:** `toggle-btn` (with `deactivate` or `activate` modifiers)

#### Verify Button
- **Element:** Send Verification Email Button
- **Lines:** [1201-1208](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1201)
- **Class:** `verify-btn`
- **Text:** "Send Verification"

#### Reset Usage Button
- **Element:** Zero Usage Button
- **Lines:** [1209-1217](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1209)
- **Class:** `reset-usage-btn`
- **Text:** "Zero Usage"
- **Title:** "Reset credits to maximum for user's tier"

#### Mock Mode Button (User)
- **Element:** Toggle User Mock Mode Button
- **Lines:** [1219-1227](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1219)
- **Class:** `mock-mode-btn` (with `enabled` or `disabled` modifiers)
- **Text:** "🎭 Mock ON" or "🎭 Mock OFF"

#### Delete Button
- **Element:** Delete User Button
- **Lines:** [1228-1234](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1228)
- **Class:** `delete-btn`
- **Text:** "Delete"
- **Title:** "Delete user (Super Admin only)"

#### Pagination (Users)
- **Element:** Users Pagination Container
- **Lines:** [1243-1265](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1243)
- **Class:** `pagination`

#### Page Button (Previous)
- **Element:** Previous Page Button
- **Lines:** [1245-1251](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1245)
- **Class:** `page-btn`
- **Text:** "Previous"

#### Page Info
- **Element:** Page Number Display
- **Lines:** [1253-1255](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1253)
- **Class:** `page-info`

#### Page Button (Next)
- **Element:** Next Page Button
- **Lines:** [1257-1263](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1257)
- **Class:** `page-btn`
- **Text:** "Next"

#### Delete Confirmation Modal
- **Element:** Delete User Confirmation Modal
- **Lines:** [1272-1315](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1272)
- **Class:** `modal-overlay`

#### Delete Modal Content
- **Element:** Delete Modal Container
- **Lines:** [1274-1313](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1274)
- **Class:** `modal-content delete-modal`

#### Modal Header
- **Element:** Modal Header Section
- **Lines:** [1275-1283](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1275)
- **Class:** `modal-header`

#### Modal Title (Delete)
- **Element:** Delete Modal Title
- **Lines:** [1276](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1276)
- **Tag:** `<h2>`
- **Text:** "⚠️ Confirm Delete"

#### Modal Close Button
- **Element:** Close Modal Button
- **Lines:** [1277-1282](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1277)
- **Class:** `modal-close-btn`

#### Delete Modal Body
- **Element:** Delete Modal Content Body
- **Lines:** [1285-1295](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1285)
- **Class:** `delete-modal-body`

#### Warning Text
- **Element:** Warning Message Text
- **Lines:** [1286-1288](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1286)
- **Class:** `warning-text`

#### User to Delete
- **Element:** User Email Display
- **Lines:** [1289-1291](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1289)
- **Class:** `user-to-delete`

#### Delete Note
- **Element:** Delete Warning Note
- **Lines:** [1292-1294](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1292)
- **Class:** `delete-note`

#### Modal Footer
- **Element:** Modal Footer Section
- **Lines:** [1297-1312](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1297)
- **Class:** `modal-footer`

#### Cancel Button
- **Element:** Cancel Action Button
- **Lines:** [1298-1304](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1298)
- **Class:** `cancel-btn`
- **Text:** "Cancel"

#### Delete Confirm Button
- **Element:** Confirm Delete Button
- **Lines:** [1305-1311](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1305)
- **Class:** `delete-confirm-btn`
- **Text:** "Delete User"

#### Self-Deletion Warning Modal
- **Element:** Cannot Delete Self Modal
- **Lines:** [1318-1354](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1318)
- **Class:** `modal-overlay`

#### Self Delete Modal Content
- **Element:** Self Delete Modal Container
- **Lines:** [1320-1353](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1320)
- **Class:** `modal-content delete-modal`

#### Self Delete Modal Title
- **Element:** Cannot Delete Self Title
- **Lines:** [1322](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1322)
- **Tag:** `<h2>`
- **Text:** "🚫 Cannot Delete Self"

#### Tier Change Confirmation Modal
- **Element:** Tier Change Confirmation Modal
- **Lines:** [1357-1414](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1357)
- **Class:** `modal-overlay`

#### Tier Change Modal Content
- **Element:** Tier Change Modal Container
- **Lines:** [1359-1413](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1359)
- **Class:** `modal-content tier-change-modal`

#### Tier Change Modal Title
- **Element:** Tier Change Title
- **Lines:** [1361](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1361)
- **Tag:** `<h2>`
- **Text:** "⚠️ Confirm Tier Change"

#### Tier Change Modal Body
- **Element:** Tier Change Content Body
- **Lines:** [1370-1394](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1370)
- **Class:** `tier-change-modal-body`

#### Tier Change Details
- **Element:** Tier Change Information Container
- **Lines:** [1374-1390](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1374)
- **Class:** `tier-change-details`

#### Tier Change Row
- **Element:** Tier Change Detail Row
- **Lines:** [1375-1389](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1375)
- **Class:** `tier-change-row`

#### Tier Change Note
- **Element:** Tier Change Warning Note
- **Lines:** [1391-1393](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1391)
- **Class:** `tier-change-note`

#### Tier Change Confirm Button
- **Element:** Confirm Tier Change Button
- **Lines:** [1404-1410](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1404)
- **Class:** `tier-change-confirm-btn`
- **Text:** "Confirm Tier Change"

#### Create User Modal
- **Element:** Create User Modal
- **Lines:** [1417-1564](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1417)
- **Class:** `modal-overlay`

#### Create User Modal Content
- **Element:** Create User Modal Container
- **Lines:** [1422-1563](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1422)
- **Class:** `modal-content`

#### Create User Modal Title
- **Element:** Create User Title
- **Lines:** [1424](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1424)
- **Tag:** `<h2>`
- **Text:** "Create New User"

#### Create User Form
- **Element:** Create User Form Element
- **Lines:** [1436-1561](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1436)
- **Class:** `create-user-form`

#### Form Group
- **Element:** Form Field Group
- **Lines:** [1437-1447](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1437), [1449-1473](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1449), [1475-1505](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1475), [1508-1541](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1508)
- **Class:** `form-group`

#### Email Input (Create User)
- **Element:** Email Input Field
- **Lines:** [1439-1446](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1439)
- **ID:** `email`
- **Type:** `email`
- **Placeholder:** "user@example.com"

#### Password Input Wrapper (Create User)
- **Element:** Password Input Container
- **Lines:** [1451-1469](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1451)
- **Class:** `password-input-wrapper`

#### Password Input (Create User)
- **Element:** Password Input Field
- **Lines:** [1452-1460](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1452)
- **ID:** `password`
- **Type:** `password` or `text` (toggleable)
- **Placeholder:** "Min 8 chars, uppercase, number, special char"

#### Password Toggle Button (Create User)
- **Element:** Show/Hide Password Button
- **Lines:** [1461-1468](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1461)
- **Class:** `password-toggle-btn`

#### Form Hint (Create User)
- **Element:** Password Requirements Hint
- **Lines:** [1470-1472](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1470)
- **Class:** `form-hint`

#### Form Row
- **Element:** Form Row Container
- **Lines:** [1475-1505](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1475), [1508-1541](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1508)
- **Class:** `form-row`

#### Role Select
- **Element:** Role Dropdown
- **Lines:** [1478-1488](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1478)
- **ID:** `role`

#### Subscription Tier Select
- **Element:** Subscription Tier Dropdown
- **Lines:** [1493-1504](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1493)
- **ID:** `subscription_tier`

#### Subscription Period Select
- **Element:** Subscription Period Dropdown
- **Lines:** [1511-1519](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1511)
- **ID:** `subscription_period`

#### Checkbox Group
- **Element:** Checkbox Options Container
- **Lines:** [1522-1540](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1522)
- **Class:** `checkbox-group`

#### Active Account Checkbox
- **Element:** Active Account Checkbox
- **Lines:** [1524-1530](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1524)

#### Email Verified Checkbox
- **Element:** Email Verified Checkbox
- **Lines:** [1532-1539](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1532)

#### Submit Button (Create User)
- **Element:** Create User Submit Button
- **Lines:** [1554-1559](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1554)
- **Class:** `submit-btn`
- **Text:** "Create User"

#### Log Detail Modal
- **Element:** Log Details Modal
- **Lines:** [1567-1670](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1567)
- **Class:** `modal-overlay`

#### Log Detail Modal Content
- **Element:** Log Detail Modal Container
- **Lines:** [1572-1669](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1572)
- **Class:** `modal-content log-detail-modal`

#### Log Detail Modal Title
- **Element:** Log Details Title
- **Lines:** [1574](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1574)
- **Tag:** `<h2>`
- **Text:** "Log Details"

#### Log Detail Body
- **Element:** Log Detail Content Body
- **Lines:** [1586-1654](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1586)
- **Class:** `log-detail-body`

#### Log Detail Section
- **Element:** Log Detail Section Container
- **Lines:** [1587-1609](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1587), [1611-1623](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1611), [1625-1637](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1625), [1639-1653](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1639)
- **Class:** `log-detail-section`

#### Log Detail Grid
- **Element:** Log Detail Grid Container
- **Lines:** [1589-1608](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1589), [1613-1622](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1613), [1627-1636](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1627)
- **Class:** `log-detail-grid`

#### Log Detail Item
- **Element:** Log Detail Entry Item
- **Lines:** [1590-1593](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1590), [1594-1597](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1594), [etc.](frontend/src/components/admin/AdminPanel.tsx#Letc.)
- **Class:** `log-detail-item` (with `full-width` modifier)

#### Log User Email Main
- **Element:** User Email Display (Main)
- **Lines:** [1616](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1616), [1620](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1620)
- **Class:** `log-user-email-main`

#### Log User Agent
- **Element:** User Agent Display
- **Lines:** [1634](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1634)
- **Class:** `log-user-agent`

#### Log Details JSON
- **Element:** JSON Details Display
- **Lines:** [1642-1651](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/components/admin/AdminPanel.tsx#L1642)
- **Class:** `log-details-json`
- **Tag:** `<pre>`

---

## Additional Elements from App.tsx

### Usage Tracking Banner

**File:** `frontend/src/App.tsx`

#### Usage Tracking Banner
- **Element:** Usage Banner Container
- **Lines:** [3501-3553](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3501)
- **Class:** `usage-tracking-banner`

#### Usage Banner Content
- **Element:** Banner Content Container
- **Lines:** [3508-3552](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3508)
- **Class:** `usage-banner-content`

#### Usage Banner Text (Desktop)
- **Element:** Desktop Banner Text
- **Lines:** [3511-3512](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3511)
- **Class:** `usage-banner-text-desktop`

#### Usage Banner Text (Mobile)
- **Element:** Mobile Banner Text
- **Lines:** [3514-3515](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3514)
- **Class:** `usage-banner-text-mobile`

---

### Loading Section

**File:** `frontend/src/App.tsx`

#### Loading Section
- **Element:** Loading State Container
- **Lines:** [3554-3570](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3554)
- **Class:** `loading-section`

#### Loading Content
- **Element:** Loading Content Wrapper
- **Lines:** [3555-3569](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3555)
- **Class:** `loading-content`

#### Modern Spinner
- **Element:** Loading Spinner
- **Lines:** [3556](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3556)
- **Class:** `modern-spinner`

#### Cancel Button (App)
- **Element:** Cancel Operation Button
- **Lines:** [3561-3568](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3561)
- **Class:** `cancel-button`

---

### Results Section (App.tsx)

**File:** `frontend/src/App.tsx`

#### Results Section
- **Element:** Results Container
- **Lines:** [3572-3849](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3572)
- **Class:** `results-section`

#### Follow-Up Button
- **Element:** Continue Conversation Button
- **Lines:** [3626-3662](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3626)
- **Class:** `follow-up-button`

#### Results Metadata
- **Element:** Response Metadata Container
- **Lines:** [3664-3708](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3664)
- **Class:** `results-metadata`

#### Metadata Item
- **Element:** Individual Metadata Entry
- **Lines:** [3665-3707](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3665)
- **Class:** `metadata-item`

#### Metadata Label
- **Element:** Metadata Label Text
- **Lines:** [3666](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3666), [3670](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3670), [3677](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3677), [3685](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3685), [3691](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3691)
- **Class:** `metadata-label`

#### Metadata Value
- **Element:** Metadata Value Text
- **Lines:** [3667](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3667), [3671-3674](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3671), [3678-3682](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3678), [3686](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3686), [3692-3696](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3692)
- **Class:** `metadata-value` (with `successful` and `failed` modifiers)

#### Results Grid
- **Element:** Results Cards Grid Container
- **Lines:** [3710-3848](file:///home/dan_wsl/jaydeelew/CompareIntel/frontend/src/App.tsx#L3710)
- **Class:** `results-grid`

---

## Notes

- **Line numbers** are approximate and may shift slightly with code changes
- **Class names** are the primary identifiers for styling and selection
- **Test IDs** (`data-testid`) are provided where available for testing
- **Modifiers** are CSS classes that modify base classes (e.g., `active`, `disabled`, `selected`)
- Some elements use **inline styles** (noted where applicable)
- **Dynamic elements** (rendered conditionally) are marked with their conditions
- **Tooltips** are typically implemented via `title` attributes or custom tooltip components

---

## Quick Reference by Element Type

### Buttons
- Submit buttons: `auth-submit-btn`, `submit-button`, `submit-btn`
- Navigation buttons: `nav-button-text`, `nav-button-primary`
- Action buttons: `toggle-btn`, `verify-btn`, `delete-btn`, `reset-usage-btn`
- Modal buttons: `modal-button-primary`, `cancel-btn`, `delete-confirm-btn`

### Input Fields
- Text inputs: `search-input`, `hero-input-textarea`
- Password inputs: `password-input-container`, `password-toggle-btn`
- Selects: `filter-select`, `tier-select`

### Cards
- Result cards: `result-card`, `conversation-card`
- Stat cards: `stat-card`
- Selected model cards: `selected-model-card`

### Dropdowns
- Provider dropdowns: `provider-dropdown`
- History dropdown: `history-inline-list`
- User menu: `user-menu-dropdown`

### Modals
- Auth modal: `auth-modal-overlay`, `auth-modal`
- Admin modals: `modal-overlay`, `modal-content`
- Modal variants: `delete-modal`, `tier-change-modal`, `upgrade-modal`

### Badges
- Status badges: `status-badge`, `verified-badge`, `role-badge`, `tier-badge`
- Action badges: `action-type-badge`

### Tables
- Users table: `users-table`, `users-table-container`
- Logs table: `logs-table`, `logs-table-container`

---

*Last Updated: Generated from codebase analysis*

