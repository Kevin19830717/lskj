# 熟食/生食双模式展示功能实现计划

## Context（背景）

智能饮食秤项目支持两种称重模式：**raw（生食材模式）** 和 **cooked（熟菜/成品菜模式）**。数据库 `weigh_records` 表已有 `record_mode` 字段，`dish_nutrition` 表已有8道菜数据，现有5条 cooked 记录。

**当前问题**：
1. 后端 `WeighRecord` 和 `WeighRecordResponse` 模型都缺 `RecordMode` 字段，所有查询SQL也未 SELECT 该字段 → 前端永远拿不到 `record_mode`，导致熟食记录被错误显示为"生食"
2. `CreateWeighRecord` 的 INSERT 未写入 `record_mode`，cooked 记录无法正确入库
3. 前端 `RecordsPage.tsx` 已有部分熟食展示逻辑（URL开关、标签），但样式粗糙：熟食仍显示烹饪方式、详情面板未区分模式、未显示总克重
4. 没有 `POST /weigh-in/cooked` 接口供App端录入熟食

**目标**：修复后端字段缺失bug，重新设计熟食展示样式，新增熟食录入接口。

## 设计决策

- 熟食菜名存 `ingredients[0]`，总克重存 `raw_weights_g[0]`，不新增DB字段
- 熟食 `cooking_method` 设为空字符串，前端通过 `record_mode==='cooked'` 判断
- 熟食微量元素（钠/胆固醇/维C/钙/铁/钾）设为0（dish_nutrition表无此数据）
- 不新建迁移文件（数据库已具备）
- 不新增前端录入UI（仅改展示）
- 熟食概要行烹饪方式列位置显示绿色"熟食"标签

## 后端改动（5个文件）

### 1. `smart-scale-backend/internal/model/nutrition.go`
- `WeighRecord` 结构体（L6-L24）：`CookingMethod` 后加 `RecordMode string \`json:"record_mode,omitempty" db:"record_mode"\``
- `WeighRecordResponse` 结构体（L47-L67）：`CookingMethodLabel` 后加 `RecordMode string \`json:"record_mode,omitempty"\``
- 文件末尾新增：
  ```go
  type CookedWeighInRequest struct {
      DishName  string  `json:"dish_name" binding:"required,min=1,max=50"`
      WeightG   float64 `json:"weight_g"   binding:"required,gt=0"`
      CreatedAt string `json:"created_at,omitempty"`
  }
  type DishNutrition struct {
      ID            int64   `json:"id" db:"id"`
      NameZh        string  `json:"name_zh" db:"name_zh"`
      EnergyKcal    float64 `json:"energy_kcal" db:"energy_kcal"`
      ProteinG      float64 `json:"protein_g" db:"protein_g"`
      FatG          float64 `json:"fat_g" db:"fat_g"`
      CarbohydrateG float64 `json:"carbohydrate_g" db:"carbohydrate_g"`
  }
  ```

### 2. `smart-scale-backend/internal/repository/meal_repo.go`
四处SQL改动，**字段位置必须一致**（紧随 `cooking_method` 之后）：
- `CreateWeighRecord`（L22-L58）：INSERT 列清单加 `record_mode`，VALUES 加占位符，Scan 参数加 `record.RecordMode`
- `QueryWeighRecords`（L99-L106 dataQuery）：SELECT 加 `record_mode`，Scan 加 `&rec.RecordMode`
- `QueryRecordsByDateRange`（L140-L148）：SELECT 加 `record_mode`，Scan 加 `&rec.RecordMode`
- `GetRecentMeals`（L181-L187）：SELECT 加 `record_mode`，Scan 加 `&rec.RecordMode`
- 搜索SQL（L83-L86）的 VALUES 内联表加一行 `('cooked','熟食')`，让搜"熟食"能命中 cooked 记录
- 文件末尾新增：
  ```go
  func (r *MealRepository) FindDishNutritionByName(ctx context.Context, name string) (*model.DishNutrition, error)
  func (r *MealRepository) ListDishNutritions(ctx context.Context) ([]*model.DishNutrition, error)
  ```
  （用 `database.Pool.QueryRow` / `Pool.Query`，模式同现有方法；`pgx.ErrNoRows` 返回 `nil, nil`）

### 3. `smart-scale-backend/internal/service/meal_service.go`
- `RecordWeighIn`（L32-L49 构造record处）：加 `RecordMode: "raw"`
- `GetHistoryRecords`（L81-L98 构造resp处）：加 `RecordMode: rec.RecordMode`
- 新增 `RecordCookedWeighIn(ctx, userID, *CookedWeighInRequest) (*WeighRecord, error)`：
  - 查 `FindDishNutritionByName`，未找到返回错误"菜库未收录此菜"
  - `ratio := req.WeightG / 100.0`，按比例算 energy/protein/fat/carb
  - 微量元素全设0
  - `Ingredients: []string{dish.NameZh}`，`RawWeightsG: []float64{req.WeightG}`
  - `CookingMethod: ""`，`RecordMode: "cooked"`
  - 解析 `created_at`（RFC3339 或 `2006-01-02T15:04` 格式，默认 NOW）
  - 调 `mealRepo.CreateWeighRecord` 入库（复用，已支持 record_mode）
- 新增 `ListDishes(ctx) ([]*DishNutrition, error)` 转发 `mealRepo.ListDishNutritions`

### 4. `smart-scale-backend/internal/handler/meal_handler.go`
- `RecordWeighIn` 后新增 `RecordCookedWeighIn(c *gin.Context)`：
  - `c.GetInt64("user_id")` + `ShouldBindJSON(&model.CookedWeighInRequest{})`
  - 调 `mealService.RecordCookedWeighIn`，成功返回 `201 + model.Success(record)`
- 新增 `ListDishes(c *gin.Context)`：调 `mealService.ListDishes`，返回 `200 + model.Success(dishes)`

### 5. `smart-scale-backend/cmd/server/main.go`
- L297 `protected.POST("/weigh-in", ...)` 后加：
  ```go
  protected.POST("/weigh-in/cooked", mealH.RecordCookedWeighIn)
  protected.GET("/dishes", mealH.ListDishes)
  ```

## 前端改动（2个文件）

### 6. `mobile_trae/frontend-react/src/lib/api.ts`
- `WeighRecord` 接口已有 `record_mode?: string`（L155），无需改
- 文件末尾新增：
  ```ts
  export interface CookedWeighInRequest {
    dish_name: string
    weight_g: number
    created_at?: string
  }
  export interface DishNutrition {
    id: number; name_zh: string; energy_kcal: number
    protein_g: number; fat_g: number; carbohydrate_g: number
  }
  export async function recordCookedWeighIn(body: CookedWeighInRequest) {
    return apiPost<WeighRecord>("/weigh-in/cooked", body)
  }
  export async function listDishes() {
    return apiGet<DishNutrition[]>("/dishes")
  }
  ```

### 7. `mobile_trae/frontend-react/src/pages/RecordsPage.tsx`
**样式重新设计原则**：生食保持原蓝紫色系(#667eea/#764ba2)，熟食用绿色系(emerald-500/600)。所有移动端样式用 `lg:` 前缀。

- **`cookingLabel` 函数（L61-L64）**：cooked 模式返回 `'熟食'`
- **新增 `CookedTag` 组件**（紧邻 `CookingTag`）：绿色系徽章 `bg-emerald-100 text-emerald-700`，带 Utensils 图标 + "熟食"文字
- **表头（L526-L541）**：列名"食材"改为"食材/菜名"，保持列宽不变
- **概要行桌面端（L606-L609 烹饪方式列）**：
  ```tsx
  {isCooked ? <CookedTag /> : <CookingTag method={record.cooking_method} label={methodLabel} />}
  ```
  并在菜名后追加克重显示：`{isCooked && record.cooked_weight_g != null && <span className="ml-1 text-[10px] text-emerald-500">{Math.round(record.cooked_weight_g)}g</span>}`
- **概要行移动端（L666 顶部标签 + L689-L697 菜名区）**：
  - L666 CookingTag 替换为 `{isCooked ? <CookedTag /> : <CookingTag .../>}`
  - L694 菜名后加克重 pill（`ml-auto` 右对齐，绿色背景）
- **`RecordDetail` 详情面板（L84-L190）**：按 `isCooked` 分支
  - `isCooked` 时：装饰条绿色渐变、背景 `from-[#ecfdf5] via-[#f0fdf4] to-[#f7fef9]`、边框 `border-[#bbf7d0]`、标题文字 `text-emerald-600`
  - 标题"食材明细"在 cooked 时改为"菜品信息"
  - "烹饪方式"行仅在 `!isCooked && record.cooking_method` 时显示
  - 食材明细的克重标签在 cooked 时用绿色 `#065f46/#d1fae5`
  - 右侧营养数据：`detailMetrics` 已有 `.filter(m => m.value > 0)`，cooked 微量元素为0会自动隐藏
  - **判断条件用 `record.record_mode === 'cooked'`，不依赖 showCooked 开关**（详情面板始终按真实模式渲染）
- **保留 `showCooked` URL 开关（L554）**：仅控制概要行是否做熟食特殊处理；详情面板直接用 record_mode 判断

## 验证步骤

### 后端验证
1. 重新编译启动后端：`cd smart-scale-backend && go build -o bin/server ./cmd/server && nohup bin/server &`
2. 登录拿 token，调 `POST /api/v1/weigh-in/cooked` body `{"dish_name":"番茄炒蛋","weight_g":250}` → 期望返回 `record_mode:"cooked"`，`cooked_energy_kcal≈212.5`（85*2.5）
3. 调 `GET /api/v1/records?page=1&page_size=10` → 检查响应中 cooked 记录有 `record_mode:"cooked"` 字段
4. 搜"熟食" → 能命中 cooked 记录
5. 不存在的菜名 → 400 "菜库未收录此菜"
6. 现有 raw 记录仍正常显示，record_mode 为 "raw"

### 前端验证
1. `cd mobile_trae/frontend-react && npm run build`，Nginx 指向 dist
2. 不带 `?show=cooked`：列表所有记录按原样式展示（cooked 也当生食显示）
3. 带 `?show=cooked`：
   - cooked 记录概要行：烹饪方式列显示绿色"熟食"标签，菜名后显示克重
   - cooked 记录详情面板：绿色装饰条、"菜品信息"标题、无"烹饪方式"行、微量元素自动隐藏
   - raw 记录保持原蓝紫色样式不变
4. 移动端和桌面端都验证（`lg:` 响应式）

## 关键文件清单
- `/home/ubuntu/lskj/smart-scale-backend/internal/model/nutrition.go`
- `/home/ubuntu/lskj/smart-scale-backend/internal/repository/meal_repo.go`
- `/home/ubuntu/lskj/smart-scale-backend/internal/service/meal_service.go`
- `/home/ubuntu/lskj/smart-scale-backend/internal/handler/meal_handler.go`
- `/home/ubuntu/lskj/smart-scale-backend/cmd/server/main.go`
- `/home/ubuntu/lskj/mobile_trae/frontend-react/src/lib/api.ts`
- `/home/ubuntu/lskj/mobile_trae/frontend-react/src/pages/RecordsPage.tsx`
