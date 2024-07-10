migrate-dev:
	@echo "Migrating database to development..."
	dbmate -d ./db/migrations --url "postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable" up
migrate-prod:
	@echo "Migrating database to production..."
	pnpm dbmate -d ./db/migrations -e "DATABASE_URL" up