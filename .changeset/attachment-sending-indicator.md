---
"@jmfederico/pi-web": patch
---

Show a sending indicator in the chat composer while messages with image attachments are uploading. Previously the composer cleared instantly while the upload, server-side image resizing, and first-session open happened in the background, so it looked like nothing was happening. The Send button now shows "Sending…" and a "Sending your files…" (or "Saving your files…" for folder mode) hint until the message lands, and the composer is disabled while in flight.
