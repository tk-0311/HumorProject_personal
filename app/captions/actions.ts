'use server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { parseVote } from '@/lib/ai/captions';
import { recordTelemetry } from '@/lib/telemetry';
export async function voteCaption(id: string, value: number): Promise<{ error: string; likes?: number; dislikes?: number; value?: number }> {
  const startedAt = Date.now();
  const finish = async (result: { error: string; likes?: number; dislikes?: number; value?: number }, success: boolean, errorCategory?: string) => {
    await recordTelemetry({ route: 'vote.submit', method: 'SERVER_ACTION', success, httpStatus: 200, durationMs: Date.now() - startedAt, errorCategory });
    return result;
  };
  const input = parseVote(id, value);
  if (!input) return finish({ error: 'Invalid vote.' }, false, 'validation');
  const supabase = createClient(await cookies());
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return finish({ error: 'Please log in before voting.' }, false, 'authentication');
  const query = input.value === 0
    ? supabase.from('caption_votes').delete().eq('user_id', user.id).eq('generation_id', input.id)
    : supabase.from('caption_votes').upsert({ user_id: user.id, generation_id: input.id, value: input.value }, { onConflict: 'user_id,generation_id' });
  const { error } = await query;
  if (error) return finish({ error: 'Your vote could not be saved. Please try again.' }, false, 'database');
  // CaptionCard updates from this result; refreshing the routes would reload the feed.
  const { data } = await supabase.rpc('caption_vote_counts', { generation_ids: [input.id] });
  return finish({ error: '', value: input.value,
    likes: data?.[0]?.likes === undefined ? undefined : Number(data[0].likes),
    dislikes: data?.[0]?.dislikes === undefined ? undefined : Number(data[0].dislikes),
  }, true);
}

export type CaptionComment = {
  id: string;
  generation_id: string;
  content: string;
  created_at: string;
  likes: number;
  likedByMe: boolean;
};

type CaptionCommentRow = Omit<CaptionComment, 'likes' | 'likedByMe'>;
type CaptionCommentLikeCount = { comment_id: string; likes: number };

const captionCommentPageSize = 50;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function finishCommentTelemetry<T>(route: string, startedAt: number, result: T, success: boolean, errorCategory?: string): Promise<T> {
  await recordTelemetry({ route, method: 'SERVER_ACTION', success, httpStatus: 200, durationMs: Date.now() - startedAt, errorCategory });
  return result;
}

function commentHeartDatabaseError(code: string): string {
  if (['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205'].includes(code)) {
    return 'Comment hearts are not set up in the database yet. Apply the caption comment likes migration.';
  }
  if (code === '42501') {
    return 'The database denied this reaction. Apply the latest comment likes migration and its policies.';
  }
  return 'Your reaction could not be saved. Please try again.';
}

export async function getCaptionComments(
  generationId: string,
  offset = 0,
): Promise<{ comments?: CaptionComment[]; hasMore?: boolean; error?: string }> {
  const startedAt = Date.now();
  if (typeof generationId !== 'string' || !uuidPattern.test(generationId) || !Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) {
    return finishCommentTelemetry('comments.list', startedAt, { error: 'Invalid comment request.' }, false, 'validation');
  }

  const supabase = createClient(await cookies());
  const { data, error } = await supabase
    .from('caption_comments')
    .select('id,generation_id,content,created_at')
    .eq('generation_id', generationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + captionCommentPageSize);

  if (error) return finishCommentTelemetry('comments.list', startedAt, { error: 'Comments could not be loaded. Please try again.' }, false, 'database');
  const comments = (data ?? []) as CaptionCommentRow[];
  if (!comments.length) return finishCommentTelemetry('comments.list', startedAt, { comments: [], hasMore: false }, true);

  const commentIds = comments.map((comment) => comment.id);
  const [{ data: userResult }, { data: counts, error: countError }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc('caption_comment_like_counts', { comment_ids: commentIds }),
  ]);
  if (countError) return finishCommentTelemetry('comments.list', startedAt, { error: commentHeartDatabaseError(countError.code) }, false, 'database');

  let likedCommentIds = new Set<string>();
  if (userResult.user) {
    const { data: ownLikes, error: likesError } = await supabase
      .from('caption_comment_likes')
      .select('comment_id')
      .in('comment_id', commentIds);
    if (likesError) return finishCommentTelemetry('comments.list', startedAt, { error: commentHeartDatabaseError(likesError.code) }, false, 'database');
    likedCommentIds = new Set((ownLikes ?? []).map((like: { comment_id: string }) => like.comment_id));
  }

  const countMap = new Map<string, number>((counts ?? []).map((count: CaptionCommentLikeCount) => [count.comment_id, Number(count.likes)]));
  const enrichedComments: CaptionComment[] = comments.map((comment) => ({
    ...comment,
    likes: countMap.get(comment.id) ?? 0,
    likedByMe: likedCommentIds.has(comment.id),
  }));
  return finishCommentTelemetry('comments.list', startedAt, { comments: enrichedComments.slice(0, captionCommentPageSize), hasMore: comments.length > captionCommentPageSize }, true);
}

export async function addCaptionComment(
  generationId: string,
  content: string,
): Promise<{ comment?: CaptionComment; error?: string }> {
  const startedAt = Date.now();
  if (typeof generationId !== 'string' || !uuidPattern.test(generationId) || typeof content !== 'string') {
    return finishCommentTelemetry('comments.create', startedAt, { error: 'Invalid comment.' }, false, 'validation');
  }
  const normalizedContent = content.trim();
  if (!normalizedContent || normalizedContent.length > 1000) {
    return finishCommentTelemetry('comments.create', startedAt, { error: 'Comments must be between 1 and 1000 characters.' }, false, 'validation');
  }

  const supabase = createClient(await cookies());
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return finishCommentTelemetry('comments.create', startedAt, { error: 'Please log in to comment.' }, false, 'authentication');
  }

  const { data, error } = await supabase
    .from('caption_comments')
    .insert({ generation_id: generationId, user_id: user.id, content: normalizedContent })
    .select('id,generation_id,content,created_at')
    .single();

  if (error) return finishCommentTelemetry('comments.create', startedAt, { error: 'Your comment could not be saved. Please try again.' }, false, 'database');
  const comment = data as CaptionCommentRow;
  return finishCommentTelemetry('comments.create', startedAt, { comment: { ...comment, likes: 0, likedByMe: false } }, true);
}

export async function setCaptionCommentLike(
  commentId: string,
  liked: boolean,
): Promise<{ liked?: boolean; likes?: number; error?: string }> {
  const startedAt = Date.now();
  if (typeof commentId !== 'string' || !uuidPattern.test(commentId) || typeof liked !== 'boolean') {
    return finishCommentTelemetry('comments.like', startedAt, { error: 'Invalid comment reaction.' }, false, 'validation');
  }

  const supabase = createClient(await cookies());
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return finishCommentTelemetry('comments.like', startedAt, { error: 'Please log in to heart comments.' }, false, 'authentication');
  }

  const mutation = liked
    ? await supabase.from('caption_comment_likes').insert({ comment_id: commentId, user_id: user.id })
    : await supabase.from('caption_comment_likes').delete().eq('comment_id', commentId);
  if (mutation.error && !(liked && mutation.error.code === '23505')) {
    console.error('[comments.like] Database mutation failed', { code: mutation.error.code });
    return finishCommentTelemetry('comments.like', startedAt, { error: commentHeartDatabaseError(mutation.error.code) }, false, 'database');
  }

  const { data: counts, error: countError } = await supabase.rpc('caption_comment_like_counts', { comment_ids: [commentId] });
  const likes = countError ? undefined : Number(counts?.[0]?.likes ?? 0);
  return finishCommentTelemetry('comments.like', startedAt, { liked, likes }, true);
}
