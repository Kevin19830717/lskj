const API_BASE = "/api/v1"

function getHeaders(): Record<string, string> {
  const token = localStorage.getItem("token")
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: "Bearer " + token } : {}),
  }
}

export async function apiGet<T = unknown>(path: string): Promise<{ code: number; message: string; data?: T }> {
  const resp = await fetch(API_BASE + path, { headers: getHeaders() })
  return resp.json()
}

export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<{ code: number; message: string; data?: T }> {
  const resp = await fetch(API_BASE + path, {
    method: "POST",
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  })
  return resp.json()
}

export async function apiPut<T = unknown>(path: string, body?: unknown): Promise<{ code: number; message: string; data?: T }> {
  const resp = await fetch(API_BASE + path, {
    method: "PUT",
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  })
  return resp.json()
}

export interface DashboardStats {
  period_days: number
  total_meals: number
  avg_daily_energy_kcal: number
  total_protein_g: number
  total_fat_g: number
  total_carbohydrate_g: number
  energy_trend: { date: string; value: number }[]
  top_foods: { name: string; count: number }[]
  nutrient_distribution: { protein_pct: number; fat_pct: number; carb_pct: number }
}

export interface RecentMeal {
  id: number
  ingredients: string[]
  cooking_method: string
  cooked_energy_kcal: number
  cooked_protein_g: number
  cooked_fat_g: number
  cooked_carbohydrate_g: number
  created_at: string
}
