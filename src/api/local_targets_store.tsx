import { Target } from '../App.tsx';
import { DeleteResponse, SubmitTargetResponse } from './api_root.tsx';

// Local Mode's single source of truth: the entire target list lives under one key,
// standing in for "the file" the observer loaded - there's no per-observer filtering
// the way the backend's obsid/semid query params provide.
const LOCAL_TARGETS_KEY = 'planning_tool_local_targets'

export const load_local_targets = (): Target[] => {
    try {
        const raw = localStorage.getItem(LOCAL_TARGETS_KEY)
        return raw ? JSON.parse(raw) as Target[] : []
    } catch (e) {
        console.error('failed to read local targets from storage', e)
        return []
    }
}

// Intentionally lets localStorage.setItem errors (e.g. quota exceeded) propagate -
// callers already have try/catch + snackbar error handling around target saves.
export const replace_local_targets = (targets: Target[]): Target[] => {
    localStorage.setItem(LOCAL_TARGETS_KEY, JSON.stringify(targets))
    return targets
}

export const upsert_local_targets = (targets: Target[]): SubmitTargetResponse => {
    const current = load_local_targets()
    const updated = [...current]
    targets.forEach((target) => {
        const idx = updated.findIndex((t) => t._id === target._id)
        if (idx >= 0) {
            updated[idx] = target
        } else {
            updated.push(target)
        }
    })
    replace_local_targets(updated)
    return { targets, errors: [] }
}

export const delete_local_targets = (target_ids: string[]): DeleteResponse => {
    const current = load_local_targets()
    replace_local_targets(current.filter((t) => !target_ids.includes(t._id as string)))
    return { status: 'SUCCESS' }
}
