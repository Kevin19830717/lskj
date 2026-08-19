import { useState, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Camera, Images, Search, Plus, Trash2, LoaderCircle, Sparkles, Flame, Beef, Droplets, Wheat, Check } from "lucide-react"
import {
  type Food, type PhotoRecognitionResult, type ManualWeighInRequest,
  searchFoods, recognizeFoodPhoto, recordWeighIn, predictNutrients,
} from "@/lib/api"

type ManualItem = {
  food: Food | null
  weight: string      // g 模式=克重；"个"模式=个数
  unit: "g" | "个"
  // 每行独立的搜索状态
  searchQuery: string
  searchResults: Food[]
  showDropdown: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

// 食物单重估算表（选"个"时用，单位克）
const UNIT_WEIGHTS: Record<string, number> = {
  "鸡蛋": 50, "香蕉": 120, "苹果": 200, "番茄": 150, "马铃薯": 180,
  "甜椒": 120, "洋葱": 150, "胡萝卜": 100, "豆腐": 300, "西兰花": 250,
  "柑橘": 80, "桃": 150, "柠檬": 50, "猕猴桃": 60, "草莓": 15,
}

function getUnitWeight(food: Food): number {
  return UNIT_WEIGHTS[food.name] || 100
}

// 10项营养素配置（中文标签 + 单位 + 图标/颜色）
const NUTRIENT_CONFIG = [
  { key: "energy_kcal" as const, label: "热量", unit: "kcal", icon: Flame, color: "text-orange-400" },
  { key: "protein_g" as const, label: "蛋白质", unit: "g", icon: Beef, color: "text-pink-400" },
  { key: "fat_g" as const, label: "脂肪", unit: "g", icon: Droplets, color: "text-amber-400" },
  { key: "carbohydrate_g" as const, label: "碳水", unit: "g", icon: Wheat, color: "text-green-400" },
  { key: "sodium_mg" as const, label: "钠", unit: "mg" },
  { key: "cholesterol_mg" as const, label: "胆固醇", unit: "mg" },
  { key: "vitamin_c_mg" as const, label: "维生素C", unit: "mg" },
  { key: "calcium_mg" as const, label: "钙", unit: "mg" },
  { key: "iron_mg" as const, label: "铁", unit: "mg" },
  { key: "potassium_mg" as const, label: "钾", unit: "mg" },
]

function fmtVal(v: number, key: string): string {
  if (key === "energy_kcal" || key === "sodium_mg" || key === "cholesterol_mg" || key === "calcium_mg" || key === "potassium_mg") {
    return String(Math.round(v))
  }
  return (Math.round(v * 10) / 10).toString()
}

export default function AddRecordModal({ open, onClose, onSaved }: Props) {
  // 默认手动录入；手机端可通过 tab 切换到拍照模式，网页端 tab 栏被 CSS lg:hidden 隐藏
  const [tab, setTab] = useState<"photo" | "manual">("manual")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [manualCookMethod, setManualCookMethod] = useState("stir_fry")
  const [calculating, setCalculating] = useState(false)
  const [predictedNutrients, setPredictedNutrients] = useState<Record<string, number> | null>(null) // 模型计算结果

  // ====== 拍照模式 ======
  const [photoMode, setPhotoMode] = useState<"ingredient" | "cooked" | null>(null) // null=未选模式
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [photoResult, setPhotoResult] = useState<PhotoRecognitionResult | null>(null)

  async function handlePhotoFile(file: File) {
    setPhotoPreview(URL.createObjectURL(file))
    setPhotoResult(null)
    setAnalyzing(true)
    setError("")
    try {
      const res = await recognizeFoodPhoto(file, photoMode!)
      if (res.code === 0 && res.data) {
        setPhotoResult(res.data)
      } else {
        setError(res.message || "识别失败")
      }
    } catch {
      setError("图片上传失败，请重试")
    } finally {
      setAnalyzing(false)
    }
  }

  // ====== 手动模式 ======
  const [manualItems, setManualItems] = useState<ManualItem[]>([
    { food: null, weight: "", unit: "g", searchQuery: "", searchResults: [], showDropdown: false },
  ])
  const searchTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  // 搜索食物（防抖，调后端 /foods/search）—— 加 try-catch 防止异常导致白屏
  const doSearch = useCallback((idx: number, query: string) => {
    if (searchTimers.current[idx]) clearTimeout(searchTimers.current[idx])
    if (!query.trim()) {
      setManualItems(prev => prev.map((it, i) => i === idx ? { ...it, searchResults: [], showDropdown: false } : it))
      return
    }
    searchTimers.current[idx] = setTimeout(async () => {
      try {
        const res = await searchFoods(query.trim())
        if (res && res.code === 0 && res.data && Array.isArray(res.data.items)) {
          setManualItems(prev => prev.map((it, i) =>
            i === idx ? { ...it, searchResults: res.data!.items, showDropdown: res.data!.items.length > 0 } : it
          ))
        }
      } catch {
        // 网络错误静默处理，不崩溃页面
      }
    }, 300)
  }, [])

  function selectFood(food: Food, idx: number) {
    setManualItems(prev => prev.map((it, i) =>
      i === idx ? { ...it, food, searchQuery: "", searchResults: [], showDropdown: false } : it
    ))
  }

  function addRow() {
    setManualItems(prev => [...prev, { food: null, weight: "", unit: "g", searchQuery: "", searchResults: [], showDropdown: false }])
    setPredictedNutrients(null)
  }

  function removeRow(i: number) {
    setManualItems(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : prev)
    setPredictedNutrients(null)
  }

  function updateItem(i: number, patch: Partial<ManualItem>) {
    setManualItems(prev => prev.map((it, j) => j === i ? { ...it, ...patch } : it))
    setPredictedNutrients(null) // 食材/克重变了，清空旧计算结果
  }

  // hasManualData：至少有一行选中了食物且填了重量/个数
  const hasManualData = manualItems.some(i => i.food && (i.unit === "个" || (i.weight && parseFloat(i.weight) > 0)))

  // ====== 模型计算营养素 ======
  async function handleCalcNutrients() {
    const validItems = manualItems.filter(i => i.food && (i.unit === "个" || (i.weight && parseFloat(i.weight) > 0)))
    if (validItems.length === 0) { setError("请先添加食材并填写克重"); return }
    setError("")
    setCalculating(true)
    try {
      const ings = validItems.map(i => i.food!.name_en || i.food!.name)
      const wgts = validItems.map(i => {
        if (i.unit === "个") return getUnitWeight(i.food!) * (parseFloat(i.weight) || 1)
        return parseFloat(i.weight) || 0
      })
      const totalWeight = wgts.reduce((a: number, b: number) => a + b, 0)
      const res = await predictNutrients(ings, wgts, manualCookMethod)
      if (res?.code === 0 && res.data) {
        // 模型返回 cooked_xxx 前缀字段，映射为前端使用的标准字段名
        const d = res.data
        setPredictedNutrients({
          energy_kcal: d.cooked_energy_kcal ?? d.energy_kcal ?? 0,
          protein_g: d.cooked_protein_g ?? d.protein_g ?? 0,
          fat_g: d.cooked_fat_g ?? d.fat_g ?? 0,
          carbohydrate_g: d.cooked_carbohydrate_g ?? d.carbohydrate_g ?? 0,
          sodium_mg: d.cooked_sodium_mg ?? d.sodium_mg ?? 0,
          cholesterol_mg: d.cooked_cholesterol_mg ?? d.cholesterol_mg ?? 0,
          vitamin_c_mg: d.cooked_vitamin_c_mg ?? d.vitamin_c_mg ?? 0,
          calcium_mg: d.cooked_calcium_mg ?? d.calcium_mg ?? 0,
          iron_mg: d.cooked_iron_mg ?? d.iron_mg ?? 0,
          potassium_mg: d.cooked_potassium_mg ?? d.potassium_mg ?? 0,
          total_weight_g: d.cooked_weight_g ?? totalWeight,
        })
      } else {
        setError(res?.message || "模型计算失败，请重试")
      }
    } catch {
      setError("模型计算失败，网络错误")
    } finally {
      setCalculating(false)
    }
  }

  // ====== 保存 ======
  async function handleSave() {
    setError("")
    if (tab === "photo") {
      if (!photoResult || photoResult.foods.length === 0) { setError("没有识别结果可保存"); return }
      setSaving(true)
      try {
        // 拍照识别结果直接写入
        const n = photoResult.nutrients
        const isCooked = photoMode === "cooked"
        const body: ManualWeighInRequest = {
          ingredients: photoResult.foods.map(f => f.name),
          raw_weights_g: photoResult.foods.map(f => f.weight_g),
          record_mode: isCooked ? "cooked" : "raw",
          cooking_method: isCooked ? "cooked" : "stir_fry",
          cooked_weight_g: Math.round(photoResult.total_weight_g),
          cooked_energy_kcal: Math.round(n.energy_kcal),
          cooked_protein_g: Math.round(n.protein_g * 10) / 10,
          cooked_fat_g: Math.round(n.fat_g * 10) / 10,
          cooked_carbohydrate_g: Math.round(n.carbohydrate_g * 10) / 10,
          cooked_sodium_mg: Math.round(n.sodium_mg),
          cooked_cholesterol_mg: Math.round(n.cholesterol_mg),
          cooked_vitamin_c_mg: Math.round(n.vitamin_c_mg * 10) / 10,
          cooked_calcium_mg: Math.round(n.calcium_mg),
          cooked_iron_mg: Math.round(n.iron_mg * 10) / 10,
          cooked_potassium_mg: Math.round(n.potassium_mg),
        }
        const res = await recordWeighIn(body)
        if (res.code === 0 || res.code === 201) {
          reset(); onClose(); onSaved()
        } else {
          setError(res.message || "保存失败")
        }
      } catch { setError("网络错误，保存失败") }
      finally { setSaving(false) }
    } else {
      // 手动模式：直接用模型计算结果保存
      const validItems = manualItems.filter(i => i.food && (i.unit === "个" || (i.weight && parseFloat(i.weight) > 0)))
      if (validItems.length === 0) { setError("请至少添加一种食材"); return }
      if (!predictedNutrients) { setError("请先点击「模型计算」获取营养素"); return }
      setSaving(true)
      try {
        const wgts = validItems.map(i => {
          if (i.unit === "个") return getUnitWeight(i.food!) * (parseFloat(i.weight) || 1)
          return parseFloat(i.weight) || 0
        })
        const nut = predictedNutrients
        const body: ManualWeighInRequest = {
          ingredients: validItems.map(i => i.food!.name),
          raw_weights_g: wgts,
          cooking_method: manualCookMethod,
          cooked_weight_g: Math.round((nut as any).total_weight_g || wgts.reduce((a: number, b: number) => a + b, 0)),
          cooked_energy_kcal: Math.round(nut.energy_kcal),
          cooked_protein_g: Math.round(nut.protein_g * 10) / 10,
          cooked_fat_g: Math.round(nut.fat_g * 10) / 10,
          cooked_carbohydrate_g: Math.round(nut.carbohydrate_g * 10) / 10,
          cooked_sodium_mg: Math.round(nut.sodium_mg || 0),
          cooked_cholesterol_mg: Math.round(nut.cholesterol_mg || 0),
          cooked_vitamin_c_mg: Math.round((nut.vitamin_c_mg || 0) * 10) / 10,
          cooked_calcium_mg: Math.round(nut.calcium_mg || 0),
          cooked_iron_mg: Math.round((nut.iron_mg || 0) * 10) / 10,
          cooked_potassium_mg: Math.round(nut.potassium_mg || 0),
        }
        const res = await recordWeighIn(body)
        if (res.code === 0 || res.code === 201) {
          reset(); onClose(); onSaved()
        } else {
          setError(res.message || "保存失败")
        }
      } catch { setError("网络错误，保存失败") }
      finally { setSaving(false) }
    }
  }

  function reset() {
    setPhotoMode(null); setPhotoPreview(null); setPhotoResult(null); setAnalyzing(false); setError("")
    setTab("manual"); setPredictedNutrients(null)
    setManualItems([{ food: null, weight: "", unit: "g", searchQuery: "", searchResults: [], showDropdown: false }])
  }

  // 点击外部关闭下拉（每行独立）
  function handleBlurDropdown(idx: number) {
    setTimeout(() => updateItem(idx, { showDropdown: false }), 150)
  }

  // 统一营养素网格渲染（10项全显示，中文标签）
  function renderNutrientGrid(nutrients: Record<string, number>) {
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {NUTRIENT_CONFIG.map(cfg => {
          const val = nutrients[cfg.key] ?? 0
          const Icon = cfg.icon
          return (
            <div key={cfg.key} className="bg-white rounded-lg p-1.5 flex items-center gap-1 text-[11px]">
              {Icon ? <Icon className={`h-3 w-3 ${cfg.color} flex-shrink-0`} /> : <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />}
              <span className="text-gray-500 flex-shrink-0">{cfg.label}</span>
              <span className="font-semibold text-gray-800 ml-auto">{fmtVal(val, cfg.key)}</span>
              <span className="text-gray-400 text-[10px] flex-shrink-0">{cfg.unit}</span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-2 py-4" onClick={onClose}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-full max-w-lg rounded-2xl p-4 shadow-2xl max-h-[90vh] overflow-y-auto relative"
            style={{ background: "linear-gradient(135deg, rgba(220,225,255,0.97) 0%, rgba(235,230,250,0.97) 100%)", backdropFilter: "blur(20px)", border: "1px solid rgba(180,175,220,0.5)" }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => { onClose(); reset() }}
              className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full bg-[#667eea]/15 text-[#5a5fcf] text-sm">✕</button>
            <h3 className="text-lg font-semibold text-[#4540a0] mb-3">添加餐食记录</h3>

            {/* Tab 切换 — 手机端和网页端都显示 */}
            <div className="flex gap-1 bg-white/50 rounded-xl p-1 mb-4">
              {(["photo","manual"] as const).map(t => (
                <button key={t} onClick={() => { setTab(t); setError("") }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? "bg-white shadow-sm text-[#667eea]" : "text-gray-400 hover:text-gray-600"}`}>
                  {t === "photo" ? <><Camera className="inline h-4 w-4 mr-1" />拍照识别</> : <><Search className="inline h-4 w-4 mr-1" />手动录入</>}
                </button>
              ))}
            </div>

            {error && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">{error}</div>}

            {/* ===== 拍照/图片识别模式（tab=photo 时渲染） ===== */}
            {tab === "photo" && (
              <div className="space-y-4">
                {/* 第一步：选择识别模式 — 食材 / 菜品 */}
                {!photoMode ? (
                  <div className="flex flex-col items-center gap-4 py-6">
                    <p className="text-sm font-medium text-[#4540a0]">请选择识别模式</p>
                    <div className="flex gap-4 w-full">
                      <button onClick={() => setPhotoMode("ingredient")}
                        className="flex-1 flex flex-col items-center gap-2 p-5 rounded-2xl bg-white/70 border-2 border-[#c8c3eb] hover:border-[#667eea] hover:bg-white transition shadow-sm group">
                        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition">
                          <span className="text-2xl">🥦</span>
                        </div>
                        <span className="text-sm font-semibold text-[#4540a0]">食材识别</span>
                        <span className="text-[11px] text-gray-400 text-center">拍摄生食材<br/>逐项识别名称和重量</span>
                      </button>
                      <button onClick={() => setPhotoMode("cooked")}
                        className="flex-1 flex flex-col items-center gap-2 p-5 rounded-2xl bg-white/70 border-2 border-[#c8c3eb] hover:border-[#10b981] hover:bg-white transition shadow-sm group">
                        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-200 transition">
                          <span className="text-2xl">🍲</span>
                        </div>
                        <span className="text-sm font-semibold text-[#4540a0]">菜品识别</span>
                        <span className="text-[11px] text-gray-400 text-center">拍摄成品菜<br/>识别菜名和整体营养</span>
                      </button>
                    </div>
                    <button onClick={() => setTab("manual")} className="text-xs text-gray-400 hover:text-[#667eea]">
                      ← 返回手动录入
                    </button>
                  </div>
                ) : !photoPreview ? (
                  /* 第二步：已选模式 → 拍照/相册 */
                  <div className="space-y-3">
                    {/* 当前模式标签 + 返回 */}
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${photoMode === "ingredient" ? "bg-blue-100 text-blue-600" : "bg-emerald-100 text-emerald-600"}`}>
                        {photoMode === "ingredient" ? "🥦 食材识别" : "🍲 菜品识别"}
                      </span>
                      <button onClick={() => { setPhotoMode(null); setPhotoPreview(null); setPhotoResult(null) }}
                        className="text-xs text-gray-400 hover:text-[#667eea]">← 切换模式</button>
                    </div>
                    <div className="flex flex-col items-center gap-3 py-6">
                      <div className="flex gap-4">
                        {/* 拍照按钮 — 仅手机端显示（网页端无摄像头） */}
                        <button onClick={() => cameraRef.current?.click()}
                          className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-white/70 border border-[#c8c3eb] hover:bg-white transition shadow-sm lg:hidden">
                          <Camera className="h-8 w-8 text-[#667eea]" /><span className="text-xs text-[#5a5fcf] font-medium">拍照</span>
                        </button>
                        {/* 相册按钮 — 手机端和网页端都显示 */}
                        <button onClick={() => galleryRef.current?.click()}
                          className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-white/70 border border-[#c8c3eb] hover:bg-white transition shadow-sm">
                          <Images className="h-8 w-8 text-[#667eea]" /><span className="text-xs text-[#5a5fcf] font-medium">相册</span>
                        </button>
                      </div>
                      <p className="text-xs text-gray-400">
                        {photoMode === "ingredient" ? "拍摄生食材照片，AI 逐项识别食材名称和重量" : "拍摄成品菜照片，AI 识别菜名和整体营养"}
                      </p>
                    </div>
                  </div>
                ) : analyzing ? (
                  <div className="flex flex-col items-center gap-3 py-8">
                    {/* 模式标签 */}
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${photoMode === "ingredient" ? "bg-blue-100 text-blue-600" : "bg-emerald-100 text-emerald-600"}`}>
                      {photoMode === "ingredient" ? "🥦 食材识别" : "🍲 菜品识别"}
                    </span>
                    <img src={photoPreview} alt="预览" className="w-48 h-48 object-cover rounded-xl shadow-md" />
                    <LoaderCircle className="h-6 w-6 animate-spin text-[#667eea]" />
                    <p className="text-sm text-[#667eea] font-medium">AI 识别中…</p>
                  </div>
                ) : photoResult && (
                  <div className="space-y-3">
                    {/* 模式标签 */}
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${photoMode === "ingredient" ? "bg-blue-100 text-blue-600" : "bg-emerald-100 text-emerald-600"}`}>
                        {photoMode === "ingredient" ? "🥦 食材识别" : "🍲 菜品识别"}
                      </span>
                    </div>
                    <img src={photoPreview!} alt="结果" className="w-full h-44 object-cover rounded-xl shadow-md" />
                    <div className="bg-white/70 rounded-xl p-3 space-y-2">
                      <p className="text-sm font-semibold text-[#4540a0] flex items-center gap-1">
                        <Sparkles className="h-4 w-4 text-[#667eea]" /> AI 识别结果
                      </p>
                      {photoResult.foods.length === 0 ? (
                        <p className="text-sm text-gray-400">未识别到食物</p>
                      ) : (
                        <>
                          <div className="space-y-1">
                            {photoResult.foods.map((f, i) => (
                              <div key={i} className="flex items-center justify-between text-sm">
                                <span className="font-medium text-gray-800">{f.name}{f.count > 1 && <span className="text-gray-400 ml-1">×{f.count}</span>}</span>
                                <span className="text-gray-500">{f.weight_g}g</span>
                              </div>
                            ))}
                          </div>
                          <div className="text-xs text-gray-400 text-right">总重 {photoResult.total_weight_g}g</div>
                          <hr className="border-[#c8c3eb]" />
                          {renderNutrientGrid(photoResult.nutrients as unknown as Record<string, number>)}
                        </>
                      )}
                    </div>
                    <button onClick={() => { setPhotoPreview(null); setPhotoResult(null) }}
                      className="w-full text-xs text-[#667eea] hover:underline">⟳ 重新拍照</button>
                  </div>
                )}
                <input ref={cameraRef} type="file" className="hidden" accept="image/*" capture="environment"
                  onChange={e => { const f=(e.target as HTMLInputElement).files?.[0]; if(f) handlePhotoFile(f); (e.target as HTMLInputElement).value="" }} />
                <input ref={galleryRef} type="file" className="hidden" accept="image/*"
                  onChange={e => { const f=(e.target as HTMLInputElement).files?.[0]; if(f) handlePhotoFile(f); (e.target as HTMLInputElement).value="" }} />
              </div>
            )}

            {/* ===== 手动模式 ===== */}
            {tab === "manual" && (
              <div className="space-y-3">
                {manualItems.map((it, i) => (
                  <div key={i} className="relative">
                    {it.food ? (
                      <div className="flex items-center gap-2 bg-white/70 rounded-xl p-2">
                        <span className="flex-1 text-sm font-medium text-gray-800">{it.food.name}</span>
                        {it.unit === "个" && (
                          <span className="text-[10px] text-gray-400">≈{getUnitWeight(it.food)}g/个</span>
                        )}
                        <input type="number" value={it.weight}
                          placeholder={it.unit === "个" ? "个数" : "克重"}
                          onChange={e => updateItem(i, { weight: e.target.value })}
                          className="w-16 text-right text-sm bg-transparent border-b border-gray-200 outline-none focus:border-[#667eea]" />
                        <select value={it.unit} onChange={e => updateItem(i, { unit: e.target.value as "g"|"个", weight: "" })}
                          className="text-xs border border-gray-200 rounded px-1 py-0.5">
                          <option value="g">g</option>
                          {it.food && UNIT_WEIGHTS[it.food.name] !== undefined && <option value="个">个</option>}
                        </select>
                        <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <>
                        <input value={it.searchQuery} placeholder="搜索食材（如鸡蛋、牛肉…）"
                          onChange={e => { updateItem(i, { searchQuery: e.target.value }); doSearch(i, e.target.value) }}
                          onFocus={() => { if (Array.isArray(it.searchResults) && it.searchResults.length > 0) updateItem(i, { showDropdown: true }) }}
                          onBlur={() => handleBlurDropdown(i)}
                          className="w-full rounded-xl border border-[#c8c3eb] bg-white/70 px-3 py-2 text-sm outline-none focus:border-[#667eea]" />
                        <Search className="absolute right-3 top-2.5 h-4 w-4 text-gray-300 pointer-events-none" />
                        {Array.isArray(it.searchResults) && it.showDropdown && it.searchResults.length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-[#c8c3eb] z-50 max-h-40 overflow-y-auto">
                            {it.searchResults.map(f => (
                              <button key={f.id} onMouseDown={() => selectFood(f, i)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-[#667eea]/10 transition-colors">
                                <span className="font-medium text-gray-800">{f.name}</span>
                                <span className="text-xs text-gray-400 ml-2">{f.energy_kcal}kcal/100g</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
                <button onClick={addRow} className="flex items-center gap-1 text-xs text-[#667eea] hover:underline">
                  <Plus className="h-3 w-3" /> 添加食材
                </button>

                {/* 烹饪方式选择 */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500 flex-shrink-0">烹饪方式</span>
                  <select value={manualCookMethod} onChange={e => { setManualCookMethod(e.target.value); setPredictedNutrients(null) }}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white/70 outline-none focus:border-[#667eea]">
                    <option value="stir_fry">炒</option>
                    <option value="boil">煮</option>
                    <option value="steam">蒸</option>
                    <option value="braise">炖</option>
                    <option value="roast">烤</option>
                    <option value="pan_fry">煎</option>
                    <option value="deep_fry">炸</option>
                  </select>
                </div>

                {/* 模型计算按钮 */}
                <button onClick={handleCalcNutrients} disabled={calculating || !hasManualData}
                  className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#667eea] to-[#764ba2] shadow-md disabled:opacity-40 transition">
                  {calculating ? <><LoaderCircle className="h-4 w-4 animate-spin" /> 模型计算中…</> : <><Sparkles className="h-4 w-4" /> 模型计算营养素</>}
                </button>

                {/* 模型计算结果 — 10项全显示，中文标签 */}
                {predictedNutrients && (
                  <div className="bg-white/70 rounded-xl p-3 mt-2">
                    <p className="text-[11px] font-semibold text-[#4540a0] mb-2">
                      <Sparkles className="inline h-3.5 w-3.5 mr-1 text-[#667eea]" />AI 模型计算结果
                      {predictedNutrients.total_weight_g > 0 && <span className="text-gray-400 font-normal ml-1">（总重 {Math.round(predictedNutrients.total_weight_g)}g）</span>}
                    </p>
                    {renderNutrientGrid(predictedNutrients)}
                  </div>
                )}
              </div>
            )}

            {/* 保存按钮 */}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { onClose(); reset() }}
                className="px-4 py-2 rounded-xl text-sm font-medium text-[#5a5fcf] bg-white/60 border border-[#c8c3eb]">取消</button>
              <button onClick={handleSave} disabled={saving || (tab === "photo" ? !photoResult : !predictedNutrients)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#667eea] to-[#764ba2] shadow-lg disabled:opacity-40 flex items-center gap-1">
                {saving ? <><LoaderCircle className="h-4 w-4 animate-spin" /> 保存中…</> : <><Check className="h-4 w-4" /> 保存记录</>}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
