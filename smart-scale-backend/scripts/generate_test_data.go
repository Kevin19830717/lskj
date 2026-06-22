package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ============================================================
// 测试数据生成脚本
// 用法:
//   go run generate_test_data.go -foods ../final.json        # 导入食物数据
//   go run generate_test_data.go -test-data                  # 生成3用户x7年测试数据
// ============================================================

var (
	foodsFile = flag.String("foods", "", "Path to final.json for food import")
	testData  = flag.Bool("test-data", false, "Generate test data (3 users x 7 years)")
	dbHost    = flag.String("db-host", "localhost", "Database host")
	dbPort    = flag.Int("db-port", 5432, "Database port")
	dbUser    = flag.String("db-user", "postgres", "Database user")
	dbPass    = flag.String("db-pass", "321738392", "Database password")
	dbName    = flag.String("db-name", "smart_scale", "Database name")
)

// FoodJSONData JSON文件中的食物数据结构
type FoodJSONData struct {
	Version string                   `json:"version"`
	Basis   string                   `json:"basis"`
	Items   map[string]FoodItem      `json:"items"`
}

type FoodItem struct {
	ZhName         string  `json:"zh_name"`
	BasisPer       int     `json:"basis_per"`
	EdibleRatio    float64 `json:"edible_ratio"`
	EnergyKJ       float64 `json:"energy_kj"`
	EnergyKcal     float64 `json:"energy_kcal"`
	WaterG         float64 `json:"water_g"`
	ProteinG       float64 `json:"protein_g"`
	FatG           float64 `json:"fat_g"`
	AshG           float64 `json:"ash_g"`
	CarbohydrateG  float64 `json:"carbohydrate_g"`
	CaroteneUg     float64 `json:"carotene_ug"`
	ThiaminMg      float64 `json:"thiamin_mg"`
	RiboflavinMg   float64 `json:"riboflavin_mg"`
	NiacinMg       float64 `json:"niacin_mg"`
	VitaminCMg     float64 `json:"vitamin_c_mg"`
	CalciumMg      float64 `json:"calcium_mg"`
	PhosphorusMg   float64 `json:"phosphorus_mg"`
	PotassiumMg    float64 `json:"potassium_mg"`
	SodiumMg       float64 `json:"sodium_mg"`
	MagnesiumMg    float64 `json:"magnesium_mg"`
	IronMg         float64 `json:"iron_mg"`
	ZincMg         float64 `json:"zinc_mg"`
	SeleniumUg     float64 `json:"selenium_ug"`
	CopperMg       float64 `json:"copper_mg"`
	ManganeseMg    float64 `json:"manganese_mg"`
	CholesterolMg  float64 `json:"cholesterol_mg"`
}

// 所有31种食材的英文名
var allFoodNames = []string{
	"apple", "banana", "beef", "bell_pepper", "cabbage", "carrot",
	"cauliflower", "chicken", "cucumber", "egg", "eggplant", "fish",
	"garlic", "ginger", "grape", "kiwi", "kumquat", "lemon",
	"onion", "orange", "peach", "pepper", "pineapple", "pork",
	"potato", "shrimp", "small_pepper", "strawberry", "tofu",
	"tomato", "watermelon",
}

// 烹饪方式
var cookingMethods = []string{"boil", "braise", "deep_fry", "pan_fry", "roast", "steam", "stir_fry"}

func main() {
	flag.Parse()

	dsn := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		*dbHost, *dbPort, *dbUser, *dbPass, *dbName)
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	if *foodsFile != "" {
		importFoods(pool, *foodsFile)
	}

	if *testData {
		generateTestData(pool)
	}
}

// importFoods 从final.json导入食物数据
func importFoods(pool *pgxpool.Pool, filePath string) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		log.Fatalf("Failed to read foods file: %v", err)
	}

	var foodData FoodJSONData
	if err := json.Unmarshal(data, &foodData); err != nil {
		log.Fatalf("Failed to parse foods JSON: %v", err)
	}

	log.Printf("Importing %d foods from %s...", len(foodData.Items), filePath)

	count := 0
	for nameEn, item := range foodData.Items {
		query := `INSERT INTO foods (name, name_en, category, edible_ratio,
		          energy_kcal, protein_g, fat_g, carbohydrate_g, sodium_mg,
		          cholesterol_mg, vitamin_c_mg, calcium_mg, iron_mg, potassium_mg,
		          created_at, updated_at) 
		          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
		          ON CONFLICT (name_en) DO NOTHING`

		category := categorizeFood(nameEn)
		_, err := pool.Exec(context.Background(), query,
			item.ZhName, nameEn, category, item.EdibleRatio,
			item.EnergyKcal, item.ProteinG, item.FatG, item.CarbohydrateG,
			item.SodiumMg, item.CholesterolMg, item.VitaminCMg,
			item.CalciumMg, item.IronMg, item.PotassiumMg,
		)
		if err != nil {
			log.Printf("Warning: failed to insert %s: %v", nameEn, err)
			continue
		}
		count++
	}
	log.Printf("✅ Successfully imported %d foods", count)
}

// categorizeFood 根据名称推断分类
func categorizeFood(nameEn string) string {
	fruits := map[string]bool{
		"apple": true, "banana": true, "grape": true, "kiwi": true, "kumquat": true,
		"lemon": true, "orange": true, "peach": true, "pineapple": true,
		"strawberry": true, "watermelon": true,
	}
	veggies := map[string]bool{
		"bell_pepper": true, "cabbage": true, "carrot": true, "cauliflower": true,
		"cucumber": true, "eggplant": true, "garlic": true, "ginger": true,
		"onion": true, "pepper": true, "small_pepper": true, "tomato": true,
	}
	meats := map[string]bool{
		"beef": true, "chicken": true, "fish": true, "pork": true, "shrimp": true,
	}
	dairy := map[string]bool{"egg": true, "tofu": true}
	starches := map[string]bool{"potato": true}

	if fruits[nameEn] { return "水果" }
	if veggies[nameEn] { return "蔬菜" }
	if meats[nameEn] { return "肉类/海鲜" }
	if dairy[nameEn] { return "蛋奶豆制品" }
	if starches[nameEn] { return "主食/淀粉类" }
	return "其他"
}

// generateTestData 生成3个用户7年的模拟数据
func generateTestData(pool *pgxpool.Pool) {
	log.Println("🚀 Starting test data generation (3 users × 7 years)...")

	rand.Seed(time.Now().UnixNano())

	// 创建3个测试用户
	users := []struct {
		Phone    string
		Password string
		Nickname string
		Gender   string
		Age      int
		HeightCm float64
		WeightKg float64
		Goal     string
	}{
		{"13800000001", "123456", "张三", "male", 32, 175.0, 72.0, "lose_weight"},
		{"13800000002", "123456", "李四", "female", 28, 162.0, 55.0, "maintain"},
		{"13800000003", "123456", "王五", "male", 45, 180.0, 85.0, "health_maintenance"},
	}

	userIDs := make([]int64, len(users))
	for i, u := range users {
		// 插入用户
		err := pool.QueryRow(context.Background(),
			`INSERT INTO users (phone, password_hash, nickname, created_at, updated_at)
			 VALUES ($1, crypt($2, gen_salt('bf')), $3, NOW(), NOW())
			 ON CONFLICT (phone) DO UPDATE SET nickname=$3
			 RETURNING id`, u.Phone, u.Password, u.Nickname).Scan(&userIDs[i])
		if err != nil {
			log.Fatalf("Failed to create user %s: %v", u.Phone, err)
		}
		log.Printf("Created user: %s (ID=%d)", u.Nickname, userIDs[i])

		// 插入用户画像
		allergies := "[]"
		switch i {
		case 0:
			allergies = `[\"花生\", \"海鲜"]`
		case 2:
			allergies = `[\"牛奶"]`
		}
		pool.Exec(context.Background(),
			`INSERT INTO user_profiles (user_id, gender, age, height_cm, weight_kg, health_goal, allergies, created_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW(), NOW())
			 ON CONFLICT (user_id) DO UPDATE SET
			 gender=$2, age=$3, height_cm=$4, weight_kg=$5, health_goal=$6, allergies=$7::jsonb`,
			userIDs[i], u.Gender, u.Age, u.HeightCm, u.WeightKg, u.Goal, allergies)
	}

	// 为每个用户生成7年的称重记录（从7年前至今）
	now := time.Now()
	for i, userID := range userIDs {
		startDate := now.AddDate(-7, 0, 0)
		totalRecords := 0
		currentDay := startDate

		// 每天随机产生1-4餐
		for currentDay.Before(now) || currentDay.Equal(now.Truncate(24*time.Hour)) {
			mealsPerDay := rand.Intn(3) + 2 // 2-4餐

			for m := 0; m < mealsPerDay; m++ {
				// 模拟一餐：随机选1-4种食材
				numIngredients := rand.Intn(3) + 1
				shuffled := shuffleCopy(allFoodNames)
				ingredients := shuffled[:numIngredients]

				var rawWeights []float64
				for range ingredients {
					rawWeights = append(rawWeights, 30+rand.Float64()*300) // 30-330g
				}

				method := cookingMethods[rand.Intn(len(cookingMethods))]

				_, err := pool.Exec(context.Background(),
					`INSERT INTO weigh_records (user_id, ingredients, raw_weights_g, cooking_method, created_at)
					 VALUES ($1, $2::jsonb, $3::jsonb, $4, $5)`,
					userID, mustMarshal(ingredients), mustMarshal(rawWeights),
					method, randomTimeOnDay(currentDay),
				)
				if err != nil {
					log.Printf("Error inserting record for user %d: %v", userID, err)
				} else {
					totalRecords++
				}
			}

			currentDay = currentDay.AddDate(0, 0, 1)
		}

		log.Printf("User %d (%s): Generated ~%d meal records over 7 years",
			userID, users[i].Nickname, totalRecords)
	}

	log.Println("\n✅ Test data generation complete!")
	fmt.Printf(`
Summary:
- Users created: %d
- Time span: %s to %s (~7 years)
- Each user has roughly 3500+ records (2-4 meals/day)
- Foods in database: %d items

To verify, connect to the database and run:
  SELECT COUNT(*) FROM users;
  SELECT COUNT(*) FROM weigh_records;
  SELECT COUNT(*) FROM foods;
`,
		len(users),
		now.AddDate(-7,0,0).Format("2006-01-02"),
		now.Format("2006-01-02"),
		len(allFoodNames))
}

// ============================================================
// Helper Functions
// ============================================================

func shuffleCopy(slice []string) []string {
	cp := make([]string, len(slice))
	copy(cp, slice)
	for i := len(cp) - 1; i > 0; i-- {
		j := rand.Intn(i + 1)
		cp[i], cp[j] = cp[j], cp[i]
	}
	return cp
}

func mustMarshal(v interface{}) []byte {
	b, _ := json.Marshal(v)
	return b
}

func randomTimeOnDay(day time.Time) time.Time {
	hour := 6 + rand.Intn(15) // 6AM - 9PM
	minute := rand.Intn(60)
	second := rand.Intn(60)
	return time.Date(day.Year(), day.Month(), day.Day(), hour, minute, second, 0, day.Location())
}
