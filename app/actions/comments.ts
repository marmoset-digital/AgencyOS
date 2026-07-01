'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ── Add a comment to a task (with optional @mentions) ────────────────────
export async function addComment(
  taskId: string,
  projectId: string,
  content: string,
  mentions: string[],
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const clean = (content ?? '').trim()
  if (!clean) return { error: 'Comment cannot be empty' }

  const cleanMentions = Array.from(new Set((mentions ?? []).filter(Boolean)))

  const { error } = await supabase.from('comments').insert({
    entity_type: 'task',
    entity_id: taskId,
    author_id: user.id,
    content: clean,
    mentions: cleanMentions.length ? cleanMentions : null,
  })
  if (error) return { error: error.message }

  // Best-effort: notify mentioned teammates. Uses the admin client because a
  // user normally can't write notification rows for other users (RLS). If the
  // service role key isn't configured or the schema differs, we ignore it —
  // the comment itself already succeeded.
  if (cleanMentions.length > 0) {
    try {
      const admin = await createAdminClient()
      const rows = cleanMentions
        .filter(uid => uid !== user.id)
        .map(uid => ({
          user_id: uid,
          title: 'You were mentioned in a comment',
          body: clean.slice(0, 200),
          type: 'comment',
          related_id: taskId,
        }))
      if (rows.length) await admin.from('notifications').insert(rows)
    } catch {
      // notifications are best-effort
    }
  }

  revalidatePath(`/projects/${projectId}`)
}

// ── Delete a comment ─────────────────────────────────────────────────────
export async function deleteComment(id: string, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('comments').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/projects/${projectId}`)
}
