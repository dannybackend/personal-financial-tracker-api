# Прогрес — Personal Financial Tracker API

> Звірка з `backend_roadmap.md`. Оновлюється після кожного checkpoint.
> Формат: `[x]` зроблено, `[ ]` заплановано.

---

## Фаза 1 — Тиждень 1-2: Середовище і орієнтація
- [x] Docker Desktop (all-users install) + `docker-compose.yml` (PostgreSQL + Redis)
- [x] Node.js 24, TypeScript 5 (strict mode), ESLint
- [x] Hono сервер запускається (`npm run dev`)
- [x] `.cursor/rules/` (core.mdc, security.mdc) + `AGENTS.md` + `CONTRIBUTING.md`
- [x] CodeRabbit підключено, `.coderabbit.yaml` налаштовано

## Фаза 1 — Тиждень 3-5: Проєкт 1 — Personal Financial Tracker API
- [x] Схема БД: `users`, `accounts`, `categories`, `transactions`, `budgets`
- [x] Індекси на всіх foreign key колонках
- [x] Перехід на UUID primary keys
- [x] Better Auth — конфігурація, `auth_*` таблиці, HttpOnly cookie сесії
- [ ] `onUserCreate` hook — авто-створення профілю в `users`
- [ ] Endpoint реєстрації `POST /api/auth/register` (201 успіх / 409 email існує)
- [ ] Endpoint логіну
- [ ] CRUD: accounts, categories, transactions, budgets
- [ ] Zod валідація на всіх endpoints
- [ ] Інтеграційні тести (Vitest)
- [ ] Rate limiting через Redis
- [ ] Пагінація і фільтрація list endpoints
- [ ] OpenAPI документація (Scalar)
- [ ] Деплой на Railway або Render

## Заплановано, роботу не почато
- [ ] `external_id` / `external_source` в `accounts` (окрема міграція)
- [ ] GitHub Actions CI (typecheck + lint + test) — додати коли з'являться перші тести
- [ ] Merchants таблиця — Фаза 2
- [ ] Банківська інтеграція (Monobank/Privat) — Фаза 2

---

## Наступний крок

→ `onUserCreate` hook → endpoint реєстрації → endpoint логіну → перший CRUD endpoint
