// Client-side history of analyzed grid cells, stored in localStorage so
// each visitor keeps a private record without needing an account.

const STORAGE_KEY = 'centinela_analysis_history'

export function getHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (error) {
    console.error('Could not read analysis history from localStorage', error)
    return []
  }
}

export function addHistoryEntry(entry) {
  const history = getHistory()
  const updated = [{ ...entry, analyzedAt: new Date().toISOString() }, ...history].slice(0, 100)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch (error) {
    console.error('Could not persist analysis history to localStorage', error)
  }
  return updated
}

export function clearHistory() {
  localStorage.removeItem(STORAGE_KEY)
}
