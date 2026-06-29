const API_BASE = import.meta.env.VITE_API_BASE as string || "/api/v1"

export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data?: T
}

function getHeaders(): Record<string, string> {
  const token = localStorage.getItem("token")
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: "Bearer " + token } : {}),
  }
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem("token")
  return token ? { Authorization: "Bearer " + token } : {}
}

function handleUnauthorized(status: number, data?: ApiResponse<unknown>) {
  if (status !== 401 && data?.code !== 401) return
  localStorage.removeItem("token")
  localStorage.removeItem("user")
  if (typeof window !== "undefined" && window.location.pathname !== "/") {
    window.location.href = "/"
  }
}

export async function apiGet<T = unknown>(path: string): Promise<ApiResponse<T>> {
  const resp = await fetch(API_BASE + path, { headers: getHeaders() })
  const data = (await resp.json()) as ApiResponse<T>
  handleUnauthorized(resp.status, data)
  return data
}

export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>> {
  const resp = await fetch(API_BASE + path, {
    method: "POST",
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = (await resp.json()) as ApiResponse<T>
  handleUnauthorized(resp.status, data)
  return data
}

export async function apiPut<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>> {
  const resp = await fetch(API_BASE + path, {
    method: "PUT",
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = (await resp.json()) as ApiResponse<T>
  handleUnauthorized(resp.status, data)
  return data
}

export async function apiDelete<T = unknown>(path: string): Promise<ApiResponse<T>> {
  const resp = await fetch(API_BASE + path, {
    method: "DELETE",
    headers: getHeaders(),
  })
  const data = (await resp.json()) as ApiResponse<T>
  handleUnauthorized(resp.status, data)
  return data
}

export async function apiUpload<T = unknown>(path: string, file: File, fieldName = "avatar"): Promise<ApiResponse<T>> {
  const formData = new FormData()
  formData.append(fieldName, file)
  const resp = await fetch(API_BASE + path, {
    method: "POST",
    headers: getAuthHeader(),
    body: formData,
  })
  const data = (await resp.json()) as ApiResponse<T>
  handleUnauthorized(resp.status, data)
  return data
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

export interface CompanionStats {
  total_meals: number
  total_days: number
  ingredient_variety: number
  favorite_method: string
  favorite_method_label: string
  favorite_method_count: number
  first_record_date?: string
}

export interface RecentMeal {
  id: number
  ingredients: string[]
  ingredient_names?: string[]
  raw_weights_g?: number[]
  cooking_method: string
  cooking_method_label?: string
  cooked_energy_kcal: number
  cooked_protein_g: number
  cooked_fat_g: number
  cooked_carbohydrate_g: number
  cooked_sodium_mg?: number
  cooked_cholesterol_mg?: number
  cooked_vitamin_c_mg?: number
  cooked_calcium_mg?: number
  cooked_iron_mg?: number
  cooked_potassium_mg?: number
  created_at: string
}

export interface WeighRecord {
  id: number
  user_id: number
  ingredients: string[]
  ingredient_names?: string[]
  raw_weights_g: number[]
  cooking_method?: string
  cooking_method_label?: string
  cooked_weight_g?: number
  cooked_energy_kcal?: number
  cooked_protein_g?: number
  cooked_fat_g?: number
  cooked_carbohydrate_g?: number
  cooked_sodium_mg?: number
  cooked_cholesterol_mg?: number
  cooked_vitamin_c_mg?: number
  cooked_calcium_mg?: number
  cooked_iron_mg?: number
  cooked_potassium_mg?: number
  created_at: string
}

export interface PaginatedRecords {
  items: WeighRecord[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface SummaryFoodFrequency {
  name: string
  name_en: string
  count: number
  total_weight_g: number
}

export interface SummaryInsights {
  period_start?: string
  period_end?: string
  total_meals?: number
  total_energy_kcal?: number
  avg_daily_energy_kcal?: number
  total_protein_g?: number
  total_fat_g?: number
  total_carbohydrate_g?: number
  total_sodium_mg?: number
  total_cholesterol_mg?: number
  total_vitamin_c_mg?: number
  total_calcium_mg?: number
  total_iron_mg?: number
  total_potassium_mg?: number
  top_foods?: SummaryFoodFrequency[]
  nutrient_trend?: Record<string, number[]>
  health_score?: number
  recommendations?: string[]
  ai_summary?: string
  ai_advice?: string
  [key: string]: unknown
}

export interface AnalysisSummary {
  id: number
  user_id: number
  summary_date: string
  summary_type: string
  source: string
  insights: SummaryInsights
  created_at: string
}

export interface Food {
  id: number
  name: string
  name_en: string
  category?: string
  edible_ratio: number
  energy_kcal: number
  protein_g: number
  fat_g: number
  carbohydrate_g: number
  sodium_mg: number
  cholesterol_mg: number
  vitamin_c_mg: number
  calcium_mg: number
  iron_mg: number
  potassium_mg: number
  created_at: string
  updated_at: string
}

export interface FoodSearchResult {
  items: Food[]
  total: number
}

export interface MedicalReportEntry {
  report_date?: string
  report_data?: Record<string, unknown>
  file_url?: string
  uploaded_at?: string
}

export interface UserProfile {
  user_id: number
  nickname?: string
  phone?: string
  avatar_url?: string
  gender?: string
  age?: number
  height_cm?: number
  weight_kg?: number
  health_goal?: string
  allergies: string[]
  medical_reports: Record<string, MedicalReportEntry>
  created_at?: string
  updated_at?: string
}
