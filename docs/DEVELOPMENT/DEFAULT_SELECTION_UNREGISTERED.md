# Enabling Default Model Selection for Unregistered Users

## Overview

The default model selection feature currently only works for authenticated (registered) users. This document explains how to enable it for unregistered users as well.

## Current Implementation Status

The backend infrastructure already supports unregistered users:
- `useSavedModelSelections` hook stores selections per user (registered users use their user ID, unregistered users use an anonymous ID)
- Default selection storage uses the same mechanism (separate localStorage keys per user)
- The hook functions (`setDefaultSelection`, `getDefaultSelection`, etc.) work for both user types

**However**, the UI currently restricts the feature to authenticated users only.

## Required Changes

### 1. Enable Checkbox Display for Unregistered Users

**File:** `frontend/src/components/comparison/ComparisonForm.tsx`

**Location:** Around line 2092-2130 (in the saved selections dropdown)

**Current Code:**
```tsx
{/* Default selection checkbox - only for authenticated users */}
{isAuthenticated && (
  <input
    type="checkbox"
    checked={isDefault}
    onChange={e => {
      // ... checkbox logic
    }}
    // ...
  />
)}
```

**Change To:**
```tsx
{/* Default selection checkbox - available for all users */}
<input
  type="checkbox"
  checked={isDefault}
  onChange={e => {
    e.stopPropagation()
    if (e.target.checked) {
      // Set this selection as default
      onSetDefaultSelection(selection.id)
      showNotification(
        `"${selection.name}" set as default selection`,
        'success'
      )
    } else {
      // Unset default
      onSetDefaultSelection(null)
      showNotification('Default selection removed', 'success')
    }
  }}
  onClick={e => e.stopPropagation()}
  title={
    isDefault
      ? `Default model selection`
      : `Set as default model selection`
  }
  className="saved-selection-default-checkbox"
/>
```

**Note:** Remove the `{isAuthenticated && ...}` wrapper around the checkbox.

### 2. Enable Default Selection Name Display for Unregistered Users

**File:** `frontend/src/components/comparison/ComparisonForm.tsx`

**Location:** Around line 1502-1515 (next to the "Save or load model selections" button)

**Current Code:**
```tsx
{/* Default selection name display - only for authenticated users and when not overridden */}
{isAuthenticated &&
  !defaultSelectionOverridden &&
  (() => {
    const defaultSelection = getDefaultSelection()
    if (!defaultSelection) return null
    return (
      <span className="default-selection-name" title={`Default model selection`}>
        {defaultSelection.name}
      </span>
    )
  })()}
```

**Change To:**
```tsx
{/* Default selection name display - available for all users when not overridden */}
{!defaultSelectionOverridden &&
  (() => {
    const defaultSelection = getDefaultSelection()
    if (!defaultSelection) return null
    return (
      <span className="default-selection-name" title={`Default model selection`}>
        {defaultSelection.name}
      </span>
    )
  })()}
```

**Note:** Remove the `isAuthenticated &&` check, keeping only the `!defaultSelectionOverridden` check.

### 3. Enable Auto-Loading for Unregistered Users

**File:** `frontend/src/App.tsx`

**Location:** Around line 3610-3692 (useEffect that loads default selection on login)

**Current Code:**
```tsx
// Load default selection when user is authenticated, models are loaded, and default hasn't been overridden
useEffect(() => {
  // Only load default for authenticated users
  if (!isAuthenticated || !user) {
    return
  }
  // ... rest of the logic
}, [...])
```

**Change To:**
```tsx
// Load default selection when models are loaded and default hasn't been overridden
useEffect(() => {
  // Wait for models to be loaded
  if (isLoadingModels || Object.keys(modelsByProvider).length === 0) {
    return
  }

  // Don't load if default has been overridden in this session
  if (defaultSelectionOverridden) {
    return
  }

  // Don't load if models are already selected (user may have manually selected)
  if (selectedModels.length > 0) {
    return
  }

  // Get default selection
  const defaultSelection = getDefaultSelection()
  if (!defaultSelection) {
    return
  }

  // Load the default selection using the same logic as handleLoadModelSelection
  const modelIds = defaultSelection.modelIds

  // Validate models are still available and within tier limits
  const validModelIds = modelIds
    .map(id => String(id))
    .filter(modelId => {
      // Check if model exists in modelsByProvider
      for (const providerModels of Object.values(modelsByProvider)) {
        const model = providerModels.find(m => String(m.id) === modelId)
        if (model) {
          // Check tier access
          const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'unregistered'
          const isPaidTier = ['starter', 'starter_plus', 'pro', 'pro_plus'].includes(userTier)

          // Filter out premium models for non-paid tiers
          if (model.tier_access === 'paid' && !isPaidTier) {
            return false
          }
          if (model.available === false) {
            return false
          }
          return true
        }
      }
      return false
    })

  // Limit to maxModelsLimit
  const limitedModelIds = validModelIds.slice(0, maxModelsLimit)

  if (limitedModelIds.length > 0) {
    setSelectedModels(limitedModelIds)

    // Update dropdown states: expand dropdowns with selections
    setOpenDropdowns(prev => {
      const newSet = new Set(prev)
      let hasChanges = false

      // Expand dropdowns for providers that have selected models
      for (const [provider, providerModels] of Object.entries(modelsByProvider)) {
        if (providerModels) {
          const hasSelectedModels = providerModels.some(model =>
            limitedModelIds.includes(String(model.id))
          )

          if (hasSelectedModels && !newSet.has(provider)) {
            newSet.add(provider)
            hasChanges = true
          }
        }
      }

      return hasChanges ? newSet : prev
    })
  }
}, [
  isLoadingModels,
  modelsByProvider,
  defaultSelectionOverridden,
  selectedModels.length,
  getDefaultSelection,
  maxModelsLimit,
  isAuthenticated,
  user,
  setSelectedModels,
  setOpenDropdowns,
])
```

**Note:** Remove the `if (!isAuthenticated || !user) return` check. The logic already handles both authenticated and unregistered users correctly.

### 4. Update Reset Logic on Authentication State Changes

**File:** `frontend/src/App.tsx`

**Location:** Around line 3696-3726 (useEffect handling authentication state changes)

**Current Behavior:**
- When signing in from unregistered mode, the code clears `defaultSelectionOverridden` state
- When logging out, it also resets `defaultSelectionOverridden`

**No Changes Needed:** The current logic already handles this correctly. The `defaultSelectionOverridden` state is reset on both login and logout, which is appropriate since:
- On login: User switches from unregistered to registered, so reset the override state
- On logout: User switches from registered to unregistered, so reset the override state

## Testing Checklist

After making these changes, test the following scenarios:

### For Unregistered Users:
- [ ] Can see checkboxes next to saved selections in the dropdown
- [ ] Can check/uncheck a selection to set/unset it as default
- [ ] Default selection name appears next to the "Save or load model selections" button
- [ ] Default selection name disappears when manually changing model selections
- [ ] Default selection name reappears when manually selecting the same models as default
- [ ] Default selection auto-loads when page is refreshed (if no models are selected)
- [ ] Default selection persists across browser sessions (localStorage)

### For Registered Users:
- [ ] All existing functionality still works
- [ ] Default selection persists across login/logout cycles
- [ ] Default selection is user-specific (doesn't interfere with other users)

### Edge Cases:
- [ ] Deleting a default selection clears the default
- [ ] Setting a new default selection clears the previous default
- [ ] Default selection respects tier limits (unregistered users can't set premium models as default)
- [ ] Default selection validates model availability on load

## Technical Notes

### Storage Mechanism
- Unregistered users: Stored in localStorage with key `compareintel_default_model_selection_${anonymousId}`
- Registered users: Stored in localStorage with key `compareintel_default_model_selection_user_${userId}`
- The anonymous ID is generated once and persists in localStorage, so unregistered users keep their default selection across sessions

### Session Override Logic
The `defaultSelectionOverridden` flag tracks when a user manually changes from the default selection. This flag:
- Is set to `true` when manual selections don't match the default
- Is reset to `false` when manual selections match the default again
- Is reset to `false` when the default selection is loaded from the dropdown
- Is reset on authentication state changes (login/logout)

### Why It Was Restricted Initially
The feature was initially restricted to authenticated users likely because:
1. Registered users have persistent accounts, making defaults more valuable
2. Unregistered users might have less need for persistent defaults
3. It simplifies the initial implementation

However, the backend infrastructure already supports unregistered users, so enabling it is straightforward.

## Files Modified Summary

1. **`frontend/src/components/comparison/ComparisonForm.tsx`**
   - Remove `isAuthenticated` check from checkbox rendering
   - Remove `isAuthenticated` check from default selection name display

2. **`frontend/src/App.tsx`**
   - Remove `isAuthenticated` check from default selection auto-loading useEffect

## Estimated Time

- Implementation: ~15-30 minutes
- Testing: ~30-45 minutes
- **Total: ~1 hour**

## Related Files

- `frontend/src/hooks/useSavedModelSelections.ts` - Hook managing saved selections and defaults
- `frontend/src/styles/results.css` - Styles for default selection UI (already supports both user types)
