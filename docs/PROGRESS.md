# Прогрес — Personal Financial Tracker API

> Звірка з `backend_roadmap.md`. Оновлюється після кожного checkpoint.
> Формат: `[x]` зроблено, `[ ]` заплановано.

---

## Фаза 1 — Тиждень 1-2: Середовище і орієнтація

- [x] Docker Desktop (all-users install) + `docker-compose.yml` (PostgreSQL + Redis)
- [x] Node.js 24, TypeScript 5 (strict mode), ESLint
- [x] Hono сервер запускається (`npm run dev`)
- [x] AGENTS.md (SSOT) + CLAUDE.md, .cursor/rules/, .agents/rules/ (імпорт AGENTS.md) + CONTRIBUTING.md
- [x] CodeRabbit підключено, `.coderabbit.yaml` налаштовано
- [x] Онбординг для нового розробника (`docs/ONBOARDING.md`)
- [x] Навчальний журнал бекенд-концепцій (`docs/LEARNING.md`)

## Фаза 1 — Тиждень 3-5: Проєкт 1 — Personal Financial Tracker API

- [x] Схема БД: `users`, `accounts`, `categories`, `transactions`, `budgets`
- [x] Індекси на всіх foreign key колонках
- [x] Перехід на UUID primary keys
- [x] Better Auth — конфігурація, `auth_*` таблиці, HttpOnly cookie сесії
- [x] `onUserCreate` hook — авто-створення профілю в `users`
- [x] Реєстрація — через Better Auth (`/api/auth/sign-up/email`), без кастомного `/api/auth/register` (див. `docs/DECISIONS.md`, issue #8 закрито як not planned)
- [x] Endpoint логіну — через Better Auth (`/api/auth/sign-in/email`), без кастомного endpoint, симетрично з реєстрацією (див. `docs/DECISIONS.md`, issue #9)
- [ ] CRUD: accounts, categories, transactions, budgets
- [ ] Zod валідація на всіх endpoints
- [x] Інтеграційні тести (Vitest) — окрема тестова база, `src/app.test.ts` покриває реєстрацію/логін (issue #10); CRUD-ендпоінти отримають власні тести по мірі реалізації (#12, #14, #17, #19)
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

Живий беклог і статус — GitHub Issues + Milestones цього репозиторію, не
тут (див. `AGENTS.md` → "Task tracking"). Ця секція раніше дублювала той
самий список окремим, застарілим рядком — прибрано, щоб не розходилось.
