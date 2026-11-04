# Caption image uploads

The caption creation form accepts an optional JPEG, PNG, or WebP up to 3 MiB. Users can preview, replace, or remove the image and generate a caption from the image alone or with written context. Failed attempts retain the selected file for retry. Text-only generation still works.

The server authenticates first, checks size, MIME type, and file signature, and sends the image as inline data with the stored prompt to Gemini. An image-capable Gemini model must be configured. The same 10-attempt daily limit applies. After generation succeeds, the image is uploaded under a random owner-prefixed path and linked to the caption. If caption insertion fails, the server attempts to remove the unreferenced upload.

The private `caption-images` bucket restricts uploads to owner folders. Objects cannot be overwritten. Only the owner can read an unpublished upload or remove an unreferenced upload. Published caption photos can be viewed through signed links that expire after one hour; refreshing the feed renews them. Published photos are not deleted by the upload-cleanup policy. No service-role key is used.

The migration `caption_image_uploads` was applied to the connected Supabase project. `database/caption-images.sql` records it; do not run that creation SQL again.

Apply `caption-images.patch` from the `hello-world` folder, then restart Next.js because `next.config.ts` now permits 4 MiB server-action bodies. The application accepts only 3 MiB images, leaving room for form overhead. No new dependencies or environment variables are required beyond the existing Gemini configuration.

Validation: TypeScript and seven caption/image tests passed. Live rollback-only metadata tests verified owner upload/read, unpublished privacy, anonymous and cross-owner denial, image attachment ownership, overwrite denial, short image context, and published reads. These SQL tests do not perform actual binary uploads. End-to-end browser upload and Gemini image generation remain to be checked after applying the source patch with a working API key. File signatures guard against obvious MIME mismatches; they are not a complete decoder or moderation system.

References:
- https://ai.google.dev/gemini-api/docs/image-understanding
- https://supabase.com/docs/guides/storage/security/access-control
