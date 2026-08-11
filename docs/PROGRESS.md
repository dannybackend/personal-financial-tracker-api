# Прогрес — Personal Financial Tracker API

> Звірка з `backend_roadmap.md`. Оновлюється після кожного checkpoint.
> Формат: `[x]` зроблено, `[ ]` заплановано.

---

## Фаза 1 — Тиждень 1-2: Середовище і орієнтація

- [x] Docker Desktop (all-users install) + `docker-compose.yml` (PostgreSQL + Redis)
- [x] Node.js 24, TypeScript 5 (strict mode), ESLint
- [x] Hono сервер запускається (`npm run dev`)
- [x] AGENTS.md (SSOT) + CLAUDE.md, .cursor/rules/, .agents/rules/ (імпорт AGENTS.md) + CONTRIBUTING.md — конфіги Cursor/Antigravity згодом видалені разом із issue #60
- [x] Розділення AGENTS.md: завжди-контекст лишився, ситуативні правила — в `.claude/skills/`, документаційні тригери — в `.claude/hooks/` (issue #60)
- [x] CodeRabbit підключено, `.coderabbit.yaml` налаштовано
- [x] Онбординг для нового розробника (`docs/ONBOARDING.md`)
- [x] Навчальний журнал бекенд-концепцій (`docs/LEARNING.md`)
- [x] Процедура старту нового проєкту (`docs/BOOTSTRAP.md`) — питання, які треба закрити до першої моделі даних (issue #62)
- [x] GitHub Actions CI (`.github/workflows/ci.yml`) — typecheck + lint + test на кожен PR і на push у `main`, Postgres як service container, міграції через той самий `src/test/global-setup.ts` (issue #22)
- [x] Dependabot (`.github/dependabot.yml`) — щомісячна перевірка оновлень для запінених на commit SHA action-ів у workflow (issue #22)
- [x] CI не залежить від repository secret — `BETTER_AUTH_SECRET` літералом у workflow. Інакше PR від Dependabot падають на порожньому секреті, і пін на SHA лишається без механізму оновлення (issue #22)

## Фаза 1 — Тиждень 3-5: Проєкт 1 — Personal Financial Tracker API

- [x] Схема БД: `users`, `accounts`, `categories`, `transactions`, `budgets`
- [x] Індекси на всіх foreign key колонках
- [x] Перехід на UUID primary keys
- [x] Better Auth — конфігурація, `auth_*` таблиці, HttpOnly cookie сесії
- [x] `onUserCreate` hook — авто-створення профілю в `users`
- [x] Реєстрація — через Better Auth (`/api/auth/sign-up/email`), без кастомного `/api/auth/register` (див. `docs/DECISIONS.md`, issue #8 закрито як not planned)
- [x] Endpoint логіну — через Better Auth (`/api/auth/sign-in/email`), без кастомного endpoint, симетрично з реєстрацією (див. `docs/DECISIONS.md`, issue #9)
- [x] CRUD: accounts — Zod-схеми, 5 endpoints, scoped через спільний auth middleware (issues #11, #30)
- [x] Мультивалютність: `char(3)` ISO-4217 + `CHECK`, `currencySchema` в `src/lib/currency.ts`, `budgets.currency`, валюта рахунку незмінна після створення (issue #36)
- [ ] CRUD: categories
- [ ] CRUD: transactions
- [ ] CRUD: budgets — маршрут має валідувати `currency` через `currencySchema`
      з `src/lib/currency.ts`, не власним регексом. `budgets.currency` у схемі
      захищена лише CHECK на форму (`^[A-Z]{3}$`), не на список підтримуваних
      кодів — інакше бюджет може лягти у валюту, яку жоден рахунок тримати не
      може (issue #36, знайдено при ревʼю)
- [ ] Zod валідація на всіх endpoints
- [x] Інтеграційні тести (Vitest) — окрема тестова база, `src/app.test.ts` покриває реєстрацію/логін (issue #10), `src/routes/accounts.test.ts` покриває accounts CRUD (issue #12); категорії/транзакції/бюджети отримають власні тести по мірі реалізації (#14, #17, #19)
- [ ] Rate limiting через Redis
- [ ] Пагінація і фільтрація list endpoints
- [ ] OpenAPI документація (Scalar)
- [ ] Деплой на Railway або Render

## Заплановано, роботу не почато

- [ ] `external_id` / `external_source` в `accounts` (окрема міграція)
- [ ] Захист `main` у налаштуваннях GitHub: merge тільки при зеленому CI — робиться руками власником репозиторію, кодом не покривається (issue #22)
- [ ] Звірити, що версія TypeScript, яку показує LSP агента, збігається з тією, якою `npm run typecheck` користується в CI (issue #22)
- [ ] Merchants таблиця — Фаза 2
- [ ] Банківська інтеграція (Monobank/Privat) — Фаза 2

---

## Наступний крок

Живий беклог і статус — GitHub Issues + Milestones цього репозиторію, не
тут (див. `.claude/skills/task-workflow/SKILL.md`). Ця секція раніше дублювала той
самий список окремим, застарілим рядком — прибрано, щоб не розходилось.
