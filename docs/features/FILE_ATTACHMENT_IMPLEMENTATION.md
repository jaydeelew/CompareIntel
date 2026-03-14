# File Attachment Feature

File attachments in model comparisons with conversation history persistence.

## Overview

Implemented a file attachment system that allows users to attach text, code, document files (PDF, DOCX, DOC, ODT), and images (PNG, JPEG, WebP, GIF) to their model comparison queries. Images are processed by vision-capable models and sent as base64-encoded content. The system uses a **"Stored Content Approach"** where file contents are extracted and stored separately from placeholders, enabling file content to persist across conversation sessions and be available for follow-up questions.

---

## 🎨 User Experience

### Initial File Attachment

- Users can attach files via:
  - **File input button**: Click to browse and select files
  - **Drag and drop**: Drag files onto the textarea or action section
- When a file is attached, a placeholder appears in the textarea: `[file: filename.txt]` for documents or `[image: filename.png]` for images
- Users can add their own text before or after one or more file placeholders
- Multiple files can be attached in any order

### Display in History

- Conversation history shows **placeholders only** (e.g., `[file: filename.txt]`)
- File contents are **not displayed** in history to keep it clean and readable
- File contents are stored separately and available for follow-ups

### Follow-Up Conversations

- When loading a conversation from history, stored file contents are restored
- Follow-up questions can reference attached files (e.g., "What are the first 5 words of this file?")
- Models receive the **expanded file content** in conversation history, not placeholders
- Models can answer questions about file contents even in follow-ups

---

## Architecture

### Stored Content Approach

The implementation uses a "Stored Content Approach" to solve the file persistence problem:

**Problem:** Browser `File` objects cannot be persisted across sessions. When a user exits and returns, the `File` objects are lost, making placeholders unusable.

**Solution:** Extract and store file contents separately:

- **Placeholders** are shown in history (clean, readable)
- **File contents** are stored separately (persistent, available for follow-ups)
- On follow-up, stored contents are used instead of placeholders

### Data Flow

#### 1. File Upload (New Conversation)

```
User attaches file → File object created → Content extracted →
Placeholder inserted in textarea → On submit: Content expanded →
Sent to models with explicit formatting
```

#### 2. Saving Conversation

```
Conversation saved → Extract file content from File objects →
Store content separately in file_contents array →
Save input_data with placeholders → Store file_contents alongside
```

#### 3. Loading Conversation

```
Load from history → Retrieve file_contents →
Create StoredAttachedFile objects → Restore attachedFiles state →
Placeholders visible in textarea, content available for expansion
```

#### 4. Follow-Up Submission

```
User asks follow-up → Expand placeholders in conversation history →
Expand placeholders in new input → Send expanded content to models →
Models see file content in history and can answer questions
```

---

## Implementation Details

### Frontend Components

#### 1. File Attachment Interfaces

**Location:** `frontend/src/components/comparison/ComparisonForm.tsx`

```typescript
// For newly attached files (with File objects)
export interface AttachedFile {
  id: string; // Unique identifier
  file: File; // Browser File object
  name: string; // File name
  placeholder: string; // Placeholder text: "[file: filename.txt]" or "[image: filename.png]"
  base64Data?: string; // For images: base64-encoded data (used by vision-capable models)
  mimeType?: string; // For images: e.g. image/png, image/jpeg
}

// For files loaded from history (with stored content)
export interface StoredAttachedFile {
  id: string; // Unique identifier
  name: string; // File name
  placeholder: string; // Placeholder text: "[file: filename.txt]"
  content: string; // Extracted file content (stored for persistence)
}
```

#### 2. File Content Expansion

**Location:** `frontend/src/App.tsx`

The `expandFiles` function handles both `AttachedFile[]` and `StoredAttachedFile[]`:

```typescript
const expandFiles = async (
  files: (AttachedFile | StoredAttachedFile)[],
  userInput: string
): Promise<string> => {
  // Extract content from File objects (AttachedFile) or use stored content (StoredAttachedFile)
  // Replace placeholders with explicit file markers:
  // [FILE: filename]
  // <file content>
  // [/FILE: filename]
  // Preserves order of user input and files
};
```

**Explicit Formatting for Models:**

- File content is wrapped in clear markers: `[FILE: filename]...[/FILE: filename]`
- Makes it very clear to models what is file content vs user input
- Handles any combination: files before text, text before files, mixed order

#### 3. File Content Extraction Helper

**Location:** `frontend/src/App.tsx`

```typescript
const extractFileContentForStorage = async (
  files: AttachedFile[]
): Promise<Array<{ name: string; content: string; placeholder: string }>> => {
  // Extracts content from File objects for storage
  // Handles PDF, DOCX, DOC, ODT, and text files
  // Returns array ready for storage
};
```

#### 4. Conversation History Storage

**Location:** `frontend/src/hooks/useConversationHistory.ts`

```typescript
const saveConversationToLocalStorage = (
  inputData: string, // Contains placeholders
  modelsUsed: string[],
  conversationsToSave: ModelConversation[],
  isUpdate: boolean = false,
  fileContents?: Array<{
    // Extracted file contents
    name: string;
    content: string;
    placeholder: string;
  }>
): string => {
  // Stores conversation with:
  // - input_data: Contains placeholders (shown in history)
  // - file_contents: Extracted file content (used for follow-ups)
  // - messages: Conversation messages
};
```

#### 5. Conversation Loading

**Location:** `frontend/src/App.tsx`

```typescript
const loadConversation = async (summary: ConversationSummary) => {
  // Loads conversation data
  // Retrieves file_contents from storage
  // Creates StoredAttachedFile objects
  // Restores attachedFiles state
  // Sets input with placeholders
};
```

#### 6. Follow-Up History Expansion

**Location:** `frontend/src/App.tsx` (in `handleSubmit`)

```typescript
// Expand file placeholders in conversation history for follow-ups
if (isFollowUpMode && conversations.length > 0) {
  const expandedMessages = await Promise.all(
    deduplicatedMessages.map(async (msg) => {
      if (msg.role === "user" && attachedFiles.length > 0) {
        // Check if message contains file placeholders
        if (hasPlaceholder) {
          // Expand placeholders using stored file contents
          const expandedContent = await expandFiles(attachedFiles, msg.content);
          return { ...msg, content: expandedContent };
        }
      }
      return msg;
    })
  );
  apiConversationHistory = expandedMessages;
}
```

### Supported File Types

- **Text files**: `.txt`, `.md`, `.json`, `.xml`, `.csv`, etc.
- **Code files**: `.js`, `.ts`, `.py`, `.java`, `.cpp`, `.html`, `.css`, etc.
- **Documents**: `.pdf`, `.docx`, `.doc`, `.odt`
- **Images**: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif` — Images are sent to vision-capable models as base64. When an image is attached, the model selector filters to show only vision-capable models. At least one vision-capable model must be selected to interpret the image.

### File Processing

- **PDF files**: Extracted using `pdfjsLib` (PDF.js)
- **DOCX files**: Extracted using `mammoth` library
- **DOC/ODT files**: Attempted as text first, fallback to error handling
- **Text/Code files**: Read directly using `FileReader`

---

## 🔄 Data Storage

### Anonymous Users (localStorage)

**Storage Structure:**

```json
{
  "input_data": "[file: test.txt] Please review this",
  "models_used": ["model1", "model2"],
  "created_at": "2025-01-15T10:30:00Z",
  "messages": [...],
  "file_contents": [
    {
      "name": "test.txt",
      "content": "File content here...",
      "placeholder": "[file: test.txt]"
    }
  ]
}
```

**Limitations:**

- localStorage typically limited to 5-10MB per domain
- Very large files may hit storage limits
- Not a tier restriction - applies to all anonymous users

### Authenticated Users (Database)

**Storage Structure:**

- `input_data`: Contains placeholders (shown in history)
- `file_contents`: Stored as JSON array in database
- `messages`: Conversation messages with placeholders

**Benefits:**

- No size limitations (within database constraints)
- Persistent across devices
- Backed up with database

---

## Key Features

### 1. Placeholder Display

- History shows clean placeholders: `[file: filename.txt]`
- File contents not displayed in history (keeps it readable)
- Users can see which files were attached

### 2. Content Persistence

- File contents extracted and stored separately
- Available for follow-up questions
- Works across sessions (close browser, return later)

### 3. Explicit Formatting

- Models receive clear file markers: `[FILE: filename]...[/FILE: filename]`
- Distinguishes file content from user input
- Handles any combination of files and text

### 4. Order Preservation

- Maintains original order of files and user input
- Files can appear before, after, or between text
- Multiple files supported in any order

### 5. Follow-Up Support

- Conversation history expanded with file content
- Models can reference files in follow-ups
- "What are the first 5 words of this file?" works correctly

### 6. Token Counting

- Accurate token counting includes expanded file contents
- Token estimation API receives expanded input
- Client-side fallback accounts for file sizes

---

## Technical Details

### State Management

**Attached Files State:**

```typescript
const [attachedFiles, setAttachedFiles] = useState<
  (AttachedFile | StoredAttachedFile)[]
>([]);
```

- Can contain both `AttachedFile` (new uploads) and `StoredAttachedFile` (from history)
- Type-safe handling of both types
- Seamless transition between types

### File Expansion Logic

**Order Preservation Algorithm:**

1. Extract content from all files (File objects or stored content)
2. Create map of placeholder → content
3. Iterate through user input
4. Replace each placeholder with `[FILE: name]\ncontent\n[/FILE: name]`
5. Preserve all user text and file order

**Error Handling:**

- Failed file extraction: Placeholder replaced with error note
- Missing stored content: Placeholder removed with error note
- Continues processing other files even if one fails

### Conversation History Expansion

**For Follow-Ups:**

- User messages in history checked for file placeholders
- If placeholders found, expand using stored file contents
- Assistant messages unchanged (already contain responses)
- Expanded history sent to models

**Benefits:**

- Models see file content in conversation history
- Can answer questions about files in follow-ups
- Maintains context across conversation turns

---

## 🧪 Testing Considerations

### Test Scenarios

1. **New File Upload**

   - Attach file → Placeholder appears → Submit → Content expanded → Model receives content

2. **Multiple Files**

   - Attach multiple files → Placeholders appear → Submit → All expanded → Order preserved

3. **Mixed Input**

   - Add text → Attach file → Add more text → Submit → Order preserved

4. **History Loading**

   - Save conversation → Close browser → Reopen → Load history → Files restored → Placeholders visible

5. **Follow-Up Questions**

   - Load conversation with files → Ask follow-up → History expanded → Model sees file content → Answers correctly

6. **File Types**

   - Test PDF, DOCX, DOC, ODT, text, code files
   - Verify extraction works for all types

7. **Error Cases**
   - Corrupted files → Error handling → Other files still work
   - Missing stored content → Error note → Conversation continues

---

## Token Counting

### Accurate Token Estimation

**Process:**

1. User types input with file placeholders
2. Files attached (or loaded from history)
3. `onExpandFiles` callback expands files
4. Expanded input sent to `/estimate-tokens` API
5. Accurate token count returned
6. Displayed in UI

**Client-Side Fallback:**

- If backend token count not available, estimate using:
  - User input length
  - Attached file sizes (rough character count)
  - Formula: `(inputLength + fileSizes) / 4` (rough tokens)

---

## 🎨 UI/UX Features

### File Attachment UI

- **File input button**: Standard file picker
- **Drag and drop**: Visual feedback when dragging over textarea
- **Placeholder display**: Shows `[file: filename.txt]` in textarea
- **Multiple files**: All placeholders visible
- **File removal**: Can remove files before submission

### History Display

- **Clean placeholders**: History shows `[file: filename.txt]`
- **No content clutter**: File contents not shown
- **Visual indication**: Users know files were attached

### Follow-Up Experience

- **Seamless restoration**: Files restored automatically
- **Placeholders visible**: Users see what files were attached
- **Context preserved**: Models can reference files

---

## 🔒 Security Considerations

### File Type Validation

- Only text, code, document, and image files allowed (PNG, JPEG, WebP, GIF for images)
- Binary files rejected
- File type checked before processing

### Content Extraction

- Files processed client-side (browser)
- No file upload to server (content extracted locally)
- Only extracted text content sent to API
- Original files never leave user's browser

### Storage Security

- **Anonymous users**: localStorage (browser storage)
- **Authenticated users**: Database (server storage)
- File contents stored as plain text (same as user input)

---

## 📈 Performance Considerations

### File Processing

- **Async processing**: File extraction is async (non-blocking)
- **Parallel extraction**: Multiple files processed in parallel
- **Error handling**: Failed files don't block others

### Storage Size

- **localStorage limits**: 5-10MB per domain (anonymous users)
- **Database storage**: No practical limits (authenticated users)
- **Large files**: May hit localStorage limits for anonymous users

### Token Counting

- **Debounced API calls**: Token estimation debounced (600ms)
- **Cached results**: Results cached until input changes
- **Fallback estimation**: Client-side fallback if API unavailable

---

## 🚀 Future Enhancements

### Potential Improvements

1. **File Size Limits**

   - Add configurable file size limits
   - Warn users about large files
   - Prevent storage issues

2. **File Preview**

   - Show file preview in UI
   - Display file size
   - Show file type icon

3. **File Management**

   - Remove files from history
   - Re-attach files
   - Download attached files

4. **Compression**

   - Compress stored file contents
   - Reduce storage size
   - Decompress on load

5. **File Versioning**
   - Track file versions
   - Show file changes
   - Restore previous versions

---

## 📝 Related Files

### Frontend

- `frontend/src/components/comparison/ComparisonForm.tsx` - File attachment UI and logic
- `frontend/src/App.tsx` - File expansion, storage, and loading
- `frontend/src/hooks/useConversationHistory.ts` - Conversation history with file storage

### Types

- `AttachedFile` interface - New file attachments
- `StoredAttachedFile` interface - Files loaded from history

### Libraries

- `pdfjsLib` - PDF text extraction
- `mammoth` - DOCX text extraction
- `FileReader` - Text file reading

---

## Status

**Features implemented:**

- ✅ File attachment (drag & drop, file picker)
- ✅ Placeholder display in textarea
- ✅ File content expansion for models
- ✅ Stored content approach
- ✅ History persistence
- ✅ Follow-up support
- ✅ Explicit formatting for models
- ✅ Token counting with files
- ✅ Multiple file support
- ✅ Order preservation
- ✅ Error handling

**Tested:**

- ✅ New file uploads
- ✅ History loading
- ✅ Follow-up questions
- ✅ Multiple files
- ✅ Mixed input order
- ✅ File type validation
- ✅ Error handling

---

## 📚 References

- **Stored Content Approach**: See `STORED_CONTENT_IMPLEMENTATION.md` in project root
- **Conversation History**: See `docs/features/PER_MODEL_CONVERSATION_HISTORY.md`
- **Token Tracking**: See `docs/features/TOKEN_TRACKING_FIX.md`

---

**Last Updated:** January 2025

