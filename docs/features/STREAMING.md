# Streaming Implementation

CompareIntel uses Server-Sent Events (SSE) for real-time streaming of AI model responses.

## How It Works

1. User submits a comparison request
2. Backend calls OpenRouter with `stream=True`
3. Tokens are forwarded to frontend as SSE events
4. Frontend displays tokens in real-time as they arrive
5. Formatted rendering is applied after streaming completes

## Event Types

| Type | Description |
|------|-------------|
| `start` | Model begins generating response |
| `chunk` | Token content received |
| `done` | Model completed response |
| `complete` | All models finished, includes metadata |
| `error` | An error occurred |

## Tab-Based Display

During streaming, responses are shown in "Raw" tab for immediate display. After streaming completes, the view automatically switches to "Formatted" tab with LaTeX/Markdown rendering.

This approach:
- Shows content immediately (under 1 second to first text)
- Avoids blocking from LaTeX processing during streaming
- Provides polished formatting after completion

## Performance

- **Time to first token:** 300-800ms (vs 6+ seconds without streaming)
- **Perceived improvement:** ~10x faster experience
- **Actual generation time:** Still 5-7 seconds (model-dependent)

## Backend Endpoint

`POST /api/compare-stream`

Accepts the same payload as `/api/compare` but returns an SSE stream instead of JSON.

## Nginx Configuration

For production, ensure Nginx is configured for SSE:

```nginx
location /compare-stream {
    proxy_pass http://backend:8000;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 660s;
    proxy_send_timeout 660s;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
}
```

## Stream Cancellation

Users can cancel mid-stream using the abort controller. The backend stops processing and OpenRouter stops billing for remaining tokens on supported providers.

## Browser Support

SSE streaming works in all modern browsers (Chrome 90+, Firefox 88+, Safari 14.1+, Opera 76+).
