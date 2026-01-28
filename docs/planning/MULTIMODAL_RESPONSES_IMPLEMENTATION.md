# Multimodal Response Support Implementation Plan

**Date:** January 2026  
**Status:** 📋 Planning  
**Feature:** Support for image, audio, and video responses from AI models

---

## 🎯 Overview

Add support for AI models to return images, audio, and video in their responses. Media files will be uploaded to AWS S3 for storage and delivered via CloudFront CDN. Only URLs are stored in the database to maintain performance and scalability.

---

## 📐 Architecture

### High-Level Flow

```
1. Model generates media (image/audio/video)
   ↓
2. Backend receives media data (base64 or binary)
   ↓
3. Backend uploads to S3 → receives public URL
   ↓
4. Backend stores URL + metadata in database
   ↓
5. Backend streams URL to frontend via SSE
   ↓
6. Frontend renders appropriate media element
   ↓
7. Browser loads media from S3/CloudFront
```

### Storage Strategy

- **Media files**: Stored in AWS S3 (not in database)
- **Database**: Stores only URLs and metadata (type, format, size)
- **Delivery**: CloudFront CDN for fast global access
- **Lifecycle**: Auto-delete media older than 90 days

---

## 🗄️ Database Changes

### 1. Add media_urls column to ConversationMessage

**File:** `backend/app/models.py`

**Changes:**
- Add `media_urls` column (JSON type) to `ConversationMessage` model
- Column stores array of media objects with URL, type, format, size

**Schema:**
```json
[
  {
    "url": "https://cdn.compareintel.com/media/image/123/model-id/20260115_abc123.png",
    "type": "image",
    "format": "png",
    "size_bytes": 45678,
    "content_type": "image/png"
  },
  {
    "url": "https://cdn.compareintel.com/media/audio/123/model-id/20260115_def456.mp3",
    "type": "audio",
    "format": "mp3",
    "size_bytes": 234567,
    "content_type": "audio/mpeg"
  }
]
```

### 2. Create database migration

**File:** `backend/alembic/versions/YYYYMMDD_add_media_urls.py`

**Migration steps:**
1. Add `media_urls` column as nullable JSON
2. Default value: `NULL` (existing messages have no media)
3. No data migration needed (backward compatible)

---

## 🔧 Backend Implementation

### 1. Create Media Storage Service

**New file:** `backend/app/services/media_storage.py`

**Purpose:** Handle all S3 upload/delete operations for media files

**Key functions:**
- `upload_media()` - Upload image/audio/video to S3, return URL + metadata
- `delete_media()` - Delete media file from S3 by URL
- `setup_lifecycle_policy()` - Configure S3 auto-deletion after 90 days
- `_get_content_type()` - Map file format to MIME type
- `_mime_to_extension()` - Extract extension from MIME type

**Features:**
- Supports multipart upload for large files (>5MB)
- Generates unique filenames with timestamp + UUID
- Organizes files by: `media/{type}/{conversation_id}/{model_id}/{filename}`
- Returns CloudFront URL if configured, otherwise S3 direct URL
- Handles upload retries with exponential backoff

### 2. Update Model Runner

**File:** `backend/app/model_runner.py`

**Function:** `call_openrouter_streaming()`

**Changes:**
- Detect media content in streaming response chunks
- Check if `delta.content` is a dict with media data
- Upload media to S3 via `MediaStorageService`
- Yield media metadata (URL, type, format) instead of raw data
- Handle both text and media in same response

**Detection logic:**
```python
if isinstance(delta.content, dict):
    if delta.content.get("type") in ["image", "audio", "video"]:
        # Upload to S3
        # Yield media metadata
```

### 3. Update API Streaming Endpoint

**File:** `backend/app/routers/api.py`

**Endpoint:** `/compare-stream`

**Changes:**
- Handle media chunks from model runner
- Accumulate media URLs per model
- Store media URLs in database when saving conversation
- Send media events via SSE to frontend

**New SSE event types:**
- `{"type": "media", "model": "...", "media_type": "image", "url": "...", "format": "..."}`

### 4. Update Conversation Saving

**File:** `backend/app/routers/api.py`

**Function:** `save_conversation_to_db()` (inside `compare_stream`)

**Changes:**
- Collect media URLs during streaming
- Store in `media_urls` field when creating `ConversationMessage`
- Handle both text content and media URLs

### 5. Add Configuration Settings

**File:** `backend/app/core/settings.py`

**New settings:**
- `AWS_ACCESS_KEY_ID` - AWS credentials
- `AWS_SECRET_ACCESS_KEY` - AWS credentials
- `AWS_REGION` - S3 bucket region (e.g., "us-east-1")
- `S3_MEDIA_BUCKET` - Bucket name (e.g., "compareintel-media-prod")
- `CLOUDFRONT_DOMAIN` - Optional CDN domain (e.g., "cdn.compareintel.com")
- `MEDIA_MAX_SIZE_MB` - Max file size (default: 100MB)
- `MEDIA_LIFECYCLE_DAYS` - Days before auto-deletion (default: 90)

### 6. Update Dependencies

**File:** `backend/requirements.txt`

**Add:**
- `boto3>=1.28.0` - AWS SDK for Python

---

## 🎨 Frontend Implementation

### 1. Update Type Definitions

**File:** `frontend/src/types/conversation.ts`

**Add interface:**
```typescript
export interface MediaAttachment {
  url: string
  type: "image" | "audio" | "video"
  format: string
  size_bytes?: number
  content_type?: string
}
```

**Update interface:**
```typescript
export interface ConversationMessage {
  // ... existing fields
  media_urls?: MediaAttachment[]
}
```

**File:** `frontend/src/types/api.ts`

**Update StreamEvent:**
```typescript
export interface StreamEvent {
  // ... existing fields
  media_type?: "image" | "audio" | "video"
  media_url?: string
  media_format?: string
}
```

### 2. Update Stream Processing

**File:** `frontend/src/services/compareService.ts`

**Function:** `processStreamEvents()`

**Changes:**
- Handle new `media` event type
- Add `onMediaChunk` callback
- Accumulate media URLs per model

**New callback:**
```typescript
callbacks: {
  // ... existing callbacks
  onMediaChunk?: (model: string, media: MediaAttachment) => void
}
```

### 3. Create Media Renderer Component

**New file:** `frontend/src/components/conversation/MediaRenderer.tsx`

**Purpose:** Render image/audio/video based on type

**Features:**
- Renders `<img>` for images
- Renders `<audio controls>` for audio
- Renders `<video controls>` for video
- Lazy loading for images
- Error handling for broken URLs
- Loading states
- Responsive sizing

### 4. Update MessageBubble Component

**File:** `frontend/src/components/conversation/MessageBubble.tsx`

**Changes:**
- Accept `media_urls` prop
- Render text content (existing)
- Render media attachments below text using `MediaRenderer`
- Support multiple media files per message

**Layout:**
```
[Message Header]
[Text Content - LatexRenderer]
[Media Attachments - MediaRenderer for each]
```

### 5. Update App.tsx State Management

**File:** `frontend/src/App.tsx`

**Changes:**
- Track media URLs during streaming
- Add media to conversation messages
- Handle media in conversation history loading
- Include media in exports (Markdown, JSON)

**State structure:**
```typescript
const [mediaByModel, setMediaByModel] = useState<Record<string, MediaAttachment[]>>({})
```

### 6. Update Export Functionality

**File:** `frontend/src/utils/export.ts`

**Functions:** `exportToMarkdown()`, `exportToJSON()`

**Changes:**
- Include media URLs in exports
- For Markdown: add image embeds, audio/video links
- For JSON: include full media metadata

**Markdown format:**
```markdown
## Response from Model X

[Text content here]

**Media:**
- Image: ![Generated image](https://cdn.compareintel.com/...)
- Audio: [Listen to audio](https://cdn.compareintel.com/...)
- Video: [Watch video](https://cdn.compareintel.com/...)
```

### 7. Add Styling

**File:** `frontend/src/styles/conversation.css` (or appropriate CSS file)

**New styles:**
- `.message-media` - Container for media attachments
- `.media-container` - Individual media wrapper
- `.image-container img` - Image styling (max-width, responsive)
- `.audio-container audio` - Audio player styling
- `.video-container video` - Video player styling (max-width, responsive)
- Loading states and error states

---

## ☁️ AWS Infrastructure Setup

### 1. Create S3 Bucket

**Bucket name:** `compareintel-media-prod` (or your choice)

**Configuration:**
- Region: Same as your application (e.g., us-east-1)
- Versioning: Disabled (not needed for generated media)
- Encryption: AES-256 (default)
- Public access: Block all (use bucket policy for specific access)

**Via AWS CLI:**
```bash
aws s3 mb s3://compareintel-media-prod --region us-east-1
```

### 2. Configure Bucket Policy

**Purpose:** Allow public read access to media files

**Policy:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::compareintel-media-prod/media/*"
    }
  ]
}
```

**Alternative:** Use presigned URLs for private access (more secure)

### 3. Configure CORS

**Purpose:** Allow browser to load media from different origin

**CORS configuration:**
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": ["https://compareintel.com", "https://www.compareintel.com"],
    "ExposeHeaders": ["Content-Range", "Content-Length", "ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

### 4. Set Up Lifecycle Policy

**Purpose:** Auto-delete old media to manage costs

**Lifecycle rules:**
1. Delete files older than 90 days
2. Move videos to Infrequent Access after 30 days (optional cost optimization)

**Configuration:**
```json
{
  "Rules": [
    {
      "Id": "DeleteOldMedia",
      "Status": "Enabled",
      "Expiration": {
        "Days": 90
      },
      "Filter": {
        "Prefix": "media/"
      }
    },
    {
      "Id": "MoveVideosToIA",
      "Status": "Enabled",
      "Transitions": [
        {
          "Days": 30,
          "StorageClass": "STANDARD_IA"
        }
      ],
      "Filter": {
        "Prefix": "media/video/"
      }
    }
  ]
}
```

### 5. Create IAM User for Application

**User name:** `compareintel-media-uploader`

**Permissions policy:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::compareintel-media-prod/media/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::compareintel-media-prod",
      "Condition": {
        "StringLike": {
          "s3:prefix": "media/*"
        }
      }
    }
  ]
}
```

**Generate access keys:**
- Save `AWS_ACCESS_KEY_ID`
- Save `AWS_SECRET_ACCESS_KEY`

### 6. (Optional) Set Up CloudFront Distribution

**Purpose:** CDN for faster global delivery and lower egress costs

**Steps:**
1. Create CloudFront distribution
2. Origin: S3 bucket (`compareintel-media-prod.s3.us-east-1.amazonaws.com`)
3. Origin access: Origin Access Identity (OAI) or Origin Access Control (OAC)
4. Viewer protocol: Redirect HTTP to HTTPS
5. Caching: Cache based on query strings (optional)
6. Price class: Use all edge locations (or select regions for cost savings)
7. Custom domain: `cdn.compareintel.com` (optional, requires Route53/DNS setup)

**After creation:**
- Note CloudFront domain: `d1234abcd5678.cloudfront.net`
- Update S3 bucket policy to allow CloudFront OAI
- Add to environment variables: `CLOUDFRONT_DOMAIN`

---

## 🔐 Security Considerations

### 1. Access Control

**Options:**
- **Public URLs:** Simplest, media accessible to anyone with URL
- **Presigned URLs:** Generate temporary URLs with expiration (7 days typical)
- **CloudFront signed URLs:** More control, can restrict by IP/time

**Recommendation:** Start with public URLs, migrate to presigned URLs if needed

### 2. Content Validation

**Backend validation:**
- Verify media data is valid base64
- Check file size limits (reject >100MB)
- Validate MIME types match expected formats
- Scan for malicious content (optional, use AWS Macie)

### 3. Rate Limiting

**Considerations:**
- Limit media generation per user/tier
- Track storage usage per user
- Implement quotas for media uploads

### 4. Cost Protection

**Safeguards:**
- Set S3 bucket size alerts (CloudWatch)
- Monitor CloudFront bandwidth usage
- Implement lifecycle policies (auto-delete old files)
- Consider storage quotas per subscription tier

---

## 📊 Cost Estimation

### S3 Storage Costs (us-east-1)

- **Storage:** $0.023/GB/month
- **PUT requests:** $0.0004 per 1,000 requests
- **GET requests:** $0.0004 per 10,000 requests
- **Data transfer out:** $0.09/GB (first 100GB/month free)

### CloudFront Costs

- **Data transfer out:** $0.085/GB (first 10TB/month)
- **Requests:** $0.0075 per 10,000 HTTP requests
- **Benefit:** Lower egress costs than S3 direct

### Example Monthly Cost (1000 active users)

**Assumptions:**
- 10 media files per user per month
- Average file size: 2MB (images), 5MB (audio), 20MB (video)
- 50% images, 30% audio, 20% video
- Average: 7MB per file
- Total: 10,000 files × 7MB = 70GB storage
- Views: 3 views per file = 30,000 views × 7MB = 210GB transfer

**Costs:**
- Storage: 70GB × $0.023 = $1.61/month
- PUT requests: 10,000 / 1,000 × $0.0004 = $0.004
- CloudFront transfer: 210GB × $0.085 = $17.85/month
- **Total: ~$19.50/month**

**With lifecycle deletion (90 days):**
- Average storage: 70GB / 3 = 23GB
- Storage cost: $0.53/month
- **Total: ~$18.40/month**

---

## 🧪 Testing Plan

### 1. Unit Tests

**Backend tests:**
- `test_media_storage.py` - Test S3 upload/delete operations
- `test_model_runner_media.py` - Test media detection in responses
- `test_api_media_streaming.py` - Test SSE media events

**Frontend tests:**
- `MediaRenderer.test.tsx` - Test rendering of each media type
- `compareService.media.test.ts` - Test media event processing
- `MessageBubble.media.test.tsx` - Test media display in messages

### 2. Integration Tests

**Test scenarios:**
- Model returns image → uploads to S3 → displays in UI
- Model returns audio → uploads to S3 → plays in browser
- Model returns video → uploads to S3 → plays with controls
- Multiple media in one response → all display correctly
- Large file upload → multipart upload succeeds
- Upload failure → graceful error handling

### 3. Manual Testing

**Test cases:**
1. Generate image with capable model (e.g., DALL-E, Stable Diffusion)
2. Verify image uploads to S3
3. Verify image displays in frontend
4. Test audio generation and playback
5. Test video generation and playback
6. Test mixed content (text + image + audio)
7. Test conversation history with media
8. Test export with media (Markdown, JSON)
9. Test media on mobile devices
10. Test media with slow network (loading states)

### 4. Performance Testing

**Metrics to measure:**
- Upload time for different file sizes
- Time to first media display
- Page load time with multiple media
- Bandwidth usage
- S3 request count

---

## 🚀 Deployment Steps

### Phase 1: Infrastructure Setup (Day 1)

1. Create S3 bucket
2. Configure bucket policy and CORS
3. Set up lifecycle policy
4. Create IAM user and generate access keys
5. (Optional) Set up CloudFront distribution
6. Add environment variables to production

### Phase 2: Backend Implementation (Days 2-3)

1. Add `boto3` to requirements.txt
2. Create `media_storage.py` service
3. Update database model (add `media_urls` column)
4. Create and run database migration
5. Update `model_runner.py` to detect media
6. Update `api.py` to handle media streaming
7. Add configuration settings
8. Write backend tests
9. Test backend in development

### Phase 3: Frontend Implementation (Days 4-5)

1. Update type definitions
2. Create `MediaRenderer` component
3. Update `MessageBubble` component
4. Update stream processing in `compareService`
5. Update `App.tsx` state management
6. Update export functionality
7. Add CSS styling
8. Write frontend tests
9. Test frontend in development

### Phase 4: Integration Testing (Day 6)

1. Test end-to-end flow in development
2. Test with real AI models that support media
3. Test error scenarios
4. Test performance with large files
5. Test on different browsers/devices
6. Fix any issues found

### Phase 5: Production Deployment (Day 7)

1. Deploy backend changes
2. Run database migration
3. Deploy frontend changes
4. Monitor logs for errors
5. Test in production with limited users
6. Monitor S3 usage and costs
7. Full rollout

---

## 🔄 Rollback Plan

### If issues occur in production:

1. **Frontend issues:** Revert frontend deployment (media won't display, but app still works)
2. **Backend issues:** Revert backend deployment (falls back to text-only responses)
3. **Database issues:** Migration is backward compatible (existing code ignores `media_urls`)
4. **S3 issues:** Disable media upload in code (feature flag), serve error message

### Feature flag approach:

Add environment variable: `ENABLE_MEDIA_RESPONSES=true/false`

- If `false`, skip media detection and upload
- Allows quick disable without code deployment

---

## 📈 Future Enhancements

### Phase 2 Features (Future)

1. **Thumbnail generation** - Generate thumbnails for videos
2. **Image optimization** - Compress images before upload
3. **Media transcription** - Transcribe audio/video to text
4. **Media search** - Search conversations by media content
5. **Media editing** - Allow users to crop/edit generated images
6. **Media galleries** - View all media from a conversation
7. **Download all media** - Bulk download option
8. **Media analytics** - Track media generation usage
9. **Custom CDN domain** - Use custom domain for media URLs
10. **Media versioning** - Keep multiple versions of edited media

---

## 📚 Documentation Updates

### Files to update:

1. **README.md** - Add media support to features list
2. **API documentation** - Document new SSE event types
3. **User guide** - How to use models that generate media
4. **Admin guide** - How to monitor S3 usage and costs
5. **Developer guide** - How to test media features locally

---

## ✅ Acceptance Criteria

### Feature is complete when:

- [ ] Models can return images, audio, and video
- [ ] Media uploads to S3 successfully
- [ ] Media displays correctly in frontend
- [ ] Media persists in conversation history
- [ ] Media exports work (Markdown, JSON)
- [ ] All tests pass (unit, integration, manual)
- [ ] Performance meets requirements (<2s upload, <1s display)
- [ ] Security review completed
- [ ] Documentation updated
- [ ] Production deployment successful
- [ ] No critical bugs in first week

---

## 🐛 Known Limitations

1. **OpenRouter support:** Not all models support media generation (check OpenRouter docs)
2. **File size limits:** 100MB max per file (configurable)
3. **Storage costs:** Media storage adds ongoing costs (mitigated by lifecycle policies)
4. **Offline access:** Media requires internet connection (unlike text)
5. **Export size:** Exports with many media files can be large
6. **Browser compatibility:** Older browsers may not support all video formats

---

## 📞 Support and Troubleshooting

### Common issues:

**Issue:** Media not uploading to S3
- Check AWS credentials in environment variables
- Verify IAM user has correct permissions
- Check S3 bucket exists and is accessible

**Issue:** Media not displaying in frontend
- Check browser console for CORS errors
- Verify S3 bucket CORS configuration
- Check CloudFront distribution settings

**Issue:** Large files timing out
- Increase backend timeout settings
- Implement multipart upload for files >5MB
- Consider file size limits per tier

**Issue:** High S3 costs
- Review lifecycle policy (delete old files)
- Check for duplicate uploads
- Monitor bandwidth usage (consider CloudFront)

---

## 📝 Notes

- This implementation uses AWS S3 + CloudFront, but could be adapted for other storage providers (Google Cloud Storage, Azure Blob Storage)
- Media URLs are permanent (until lifecycle deletion), so they can be shared
- Consider privacy implications of public media URLs
- Test thoroughly with real AI models before production deployment
- Monitor costs closely in first month to adjust lifecycle policies

---

**End of Implementation Plan**

When ready to implement, provide this document and specify which phase to start with.
