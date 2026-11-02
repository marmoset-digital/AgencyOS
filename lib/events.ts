import type { SupabaseClient } from '@supabase/supabase-js'

// The event vocabulary. Add the string here BEFORE emitting it: a typo in a
// type is a workflow that silently never fires, and nothing will tell you.
export const EVENT_TYPES = [
  'client.created',
  'proposal.sent',
  'proposal.accepted',
  'proposal.declined',
  'project.created',
  'task.completed',
  'invoice.created',
  'invoice.paid',
  'ticket.created',
  'timer.stopped',
] as const

export type EventType = (typeof EVENT_TYPES)[number]

export interface EmitEventInput {
  type: EventType
  entityType?: string | null
  entityId?: string | null
  payload?: Record<string, unknown>
  actorId?: string | null
}

// Append one outbox row from application code.
//
// IMPORTANT - read before using this instead of a trigger:
// supabase-js speaks to PostgREST over HTTP, so this call CANNOT share a
// transaction with the mutation that preceded it. If the process dies in
// between, the mutation stands and the event is lost. That is acceptable for
// events carrying context the row does not hold; it is NOT acceptable for the
// money path.
//
// So: if the event is derivable from the row, write a trigger in a migration
// instead (see 0024). Use this only where application context is required.
//
// Best-effort by design. Failing to record an event must never fail the thing
// the user was actually doing, so this logs and returns false rather than
// throwing.
export async function emitEvent(
  db: SupabaseClient<any, any, any>,
  input: EmitEventInput,
): Promise<boolean> {
  try {
    const { error } = await db.from('events').insert({
      type: input.type,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      payload: input.payload ?? {},
      actor_id: input.actorId ?? null,
    })
    if (error) {
      console.error('[events] emit failed', input.type, error.message)
      return false
    }
    return true
  } catch (e) {
    console.error('[events] emit threw', input.type, e instanceof Error ? e.message : e)
    return false
  }
}
