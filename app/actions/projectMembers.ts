'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function addProjectMember(projectId: string, userId: string) {
  if (!userId) return { error: 'Pick a team member' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('project_members')
    .upsert({ project_id: projectId, user_id: userId }, { onConflict: 'project_id,user_id' })
  if (error) return { error: error.message }
  revalidatePath(`/projects/${projectId}`)
}

export async function removeProjectMember(projectId: string, userId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId)
  if (error) return { error: error.message }
  revalidatePath(`/projects/${projectId}`)
}
