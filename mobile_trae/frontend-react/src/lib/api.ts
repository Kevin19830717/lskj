const API_BASE = import.meta.env.VITE_API_BASE as string || "/api/v1"
export { API_BASE }

// RAG 服务基础地址：/rag/xxx 走 nginx 代理到 Python RAG 服务（8001）
// 网页端相对路径可访问；APK 端需要用完整域名
function resolveRagBase(): string {
  if (API_BASE.startsWith("http://") || API_BASE.startsWith("https://")) {
    const u = new URL(API_BASE)
    return `${u.protocol}//${u.host}/rag`
  }
  return "/rag"
}
export const RAG_BASE = resolveRagBase()

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

export async function apiDeleteWithBody<T = unknown>(path: string, body: unknown): Promise<ApiResponse<T>> {
  const resp = await fetch(API_BASE + path, {
    method: "DELETE",
    headers: getHeaders(),
    body: JSON.stringify(body),
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
  record_mode?: string
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

// ===== 熟食模式相关 =====

/** 熟食称重上报请求 */
export interface CookedWeighInRequest {
  dish_name: string
  weight_g: number
  created_at?: string
}

/** 熟菜营养库条目（每100g营养值） */
export interface DishNutrition {
  id: number
  name_zh: string
  energy_kcal: number
  protein_g: number
  fat_g: number
  carbohydrate_g: number
}

/** 录入熟食称重记录 */
export async function recordCookedWeighIn(body: CookedWeighInRequest) {
  return apiPost<WeighRecord>("/weigh-in/cooked", body)
}

/** 列出所有熟菜菜名（菜名下拉用） */
export async function listDishes() {
  return apiGet<DishNutrition[]>("/dishes")
}

// ===== 添加餐食记录相关 =====

/** 搜索食物库（手动录入模式用） */
export async function searchFoods(query: string) {
  return apiGet<FoodSearchResult>(`/foods/search?query=${encodeURIComponent(query)}`)
}

/** 图片识别结果中的单个食物 */
export interface PhotoFoodItem {
  name: string
  count: number
  weight_g: number
}

/** 图片识别返回的营养素 */
export interface PhotoNutrients {
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
}

/** 图片识别完整结果 */
export interface PhotoRecognitionResult {
  foods: PhotoFoodItem[]
  total_weight_g: number
  nutrients: PhotoNutrients
  raw_text?: string
}

/** 拍照识别食物（上传图片→AI识别→返回食物+营养）
 * @param file 图片文件
 * @param mode "cooked"=成品菜识别, "ingredient"=生食材逐项识别（默认cooked）
 */
export async function recognizeFoodPhoto(file: File, mode: "cooked" | "ingredient" = "cooked") {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("mode", mode)
  const token = localStorage.getItem("token")
  const resp = await fetch(API_BASE + "/weigh-in/photo", {
    method: "POST",
    headers: token ? { Authorization: "Bearer " + token } : {},
    body: formData,
  })
  const data = (await resp.json()) as ApiResponse<PhotoRecognitionResult>
  if (resp.status === 401 || data.code === 401) {
    localStorage.removeItem("token"); localStorage.removeItem("user")
    if (typeof window !== "undefined" && window.location.pathname !== "/") window.location.href = "/"
  }
  return data
}

/** 手动录入称重记录请求 */
export interface ManualWeighInRequest {
  ingredients: string[]
  raw_weights_g: number[]
  cooking_method?: string
  record_mode?: string          // "raw"=生食材, "cooked"=成品菜（拍照识别传cooked）
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
  created_at?: string
}

/** 手动录入称重记录（写入数据库） */
export async function recordWeighIn(body: ManualWeighInRequest) {
  return apiPost<WeighRecord>("/weigh-in", body)
}

/** 模型预测营养素（LightGBM，走 RAG 服务） */
export async function predictNutrients(ingredients: string[], weights: number[], cookingMethod: string) {
  const resp = await fetch(`${RAG_BASE}/predict-nutrients`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ingredients, weights, cooking_method: cookingMethod }),
  })
  const data = await resp.json().catch(() => null)
  return data
}

// ============================================================
// 体检报告解读
// ============================================================

/** 后端多模态解析返回的原始报告 */
export interface RawMedicalReportData {
  report_date?: string
  indicators?: { name?: string; value?: string | number; unit?: string; normal_range?: string; status?: string }[]
  summary_text?: string
}

/**
 * 体检报告照片 -> 指标结构化（qwen 多模态 OCR）
 * POST {RAG}/parse-medical-report，返回 {code:0, data:{parsed_data, model_used,...}}
 */
export async function parseMedicalReport(file: File): Promise<RawMedicalReportData> {
  const fd = new FormData()
  fd.append("file", file)
  const resp = await fetch(`${RAG_BASE}/parse-medical-report`, { method: "POST", body: fd })
  if (!resp.ok) throw new Error(`体检报告解析失败: HTTP ${resp.status}`)
  const json = await resp.json().catch(() => null)
  if (!json || json.code !== 0) throw new Error(json?.message || "体检报告解析失败")
  const data = json.data?.parsed_data
  if (!data || !Array.isArray(data.indicators) || data.indicators.length === 0) {
    throw new Error("未能从报告中识别出指标，请换一张更清晰的照片")
  }
  return data as RawMedicalReportData
}
