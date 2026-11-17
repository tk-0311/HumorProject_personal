This batch adds 24 mock memes to the app's existing `ai_generations` feed: three humor styles for each of the eight topic choices. Images are public template links returned by [Imgflip's API](https://imgflip.com/api); the captions are original mock content. These are third-party template assets, with no license claim made by this seed. Each template's original page, image URL, dimensions, and name are preserved in the fixture and the row's private `prompt` field.

Target: Supabase project `apbmaxmpvkaltywewlsh`. The existing `admin` profile owns the imported posts. No new accounts, votes, comments, schema changes, or policy changes are created. Dates are spaced eight hours apart across the preceding eight days.

The app labels these posts “Mock meme” and links to the image source. Public template links resolve only on the exact `https://i.imgflip.com` image host; user uploads still use the private Storage bucket. The template CDN must remain reachable to display the mock images.

To rebuild the SQL from the checked-in fixture:

```sh
node scripts/build-mock-meme-seed.mjs
```

Run `internet-memes.sql` using an authorized database admin connection to the target project. Stable IDs and `ON CONFLICT DO NOTHING` make reruns safe without changing posts already imported. The SQL checks that the expected admin owner exists before inserting.

The marker `model = 'mock-internet-memes-v1'` identifies the batch. To remove it later, review the matching rows first, then run the following through an authorized admin connection. Associated votes/comments on these mock posts are removed by the database's existing cascade rules.

```sql
select id, caption from public.ai_generations
where model = 'mock-internet-memes-v1';

-- Run only when removal of the mock batch is wanted:
delete from public.ai_generations
where model = 'mock-internet-memes-v1';
```
