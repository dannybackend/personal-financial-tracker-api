# Прогрес — Personal Financial Tracker API

> Звірка з `backend_roadmap.md`. Оновлюється після кожного checkpoint.
> Формат: `[x]` зроблено, `[ ]` заплановано.

---

## Фаза 1 — Тиждень 1-2: Середовище і орієнтація

- [x] Docker Desktop (all-users install) + `docker-compose.yml` (PostgreSQL + Redis)
- [x] Node.js 24, TypeScript 6 (strict mode), ESLint
- [x] Hono сервер запускається (`npm run dev`)
- [x] AGENTS.md (SSOT) + CLAUDE.md, .cursor/rules/, .agents/rules/ (імпорт AGENTS.md) + CONTRIBUTING.md — конфіги Cursor/Antigravity згодом видалені разом із issue #60
- [x] Розділення AGENTS.md: завжди-контекст лишився, ситуативні правила — в `.claude/skills/`, документаційні тригери — в `.claude/hooks/` (issue #60)
- [x] Три агентські правила приведені до реальності: PR-шаблон більше не несе скасоване правило відповіді CodeRabbit, хук указує на секцію «Модель даних» замість неіснуючого ERD, флоу розбору рев'ю (`discuss-comments` / `discuss-rabbit` → `implement-comments`) внесений у переліки скілів і має запис про компроміси. Посилання в тексті хука відтепер перевіряє тест `.claude/hooks/doc-rules.test.mjs` — той клас помилки не ловили ні eslint, ні тести, ні запуск хука. Разом із ним: третій проєкт Vitest `hooks` (без нього тест мовчки випадав із `npm test` через `exclude` на всю теку `.claude/**`) і `.claude/hooks/**` під `checkJs` у `tsconfig.scripts.json` (issue #76)
- [x] CodeRabbit підключено, `.coderabbit.yaml` налаштовано
- [x] Маркери відповідності коду в `docs/API-CONVENTIONS.md` (`✅ holds` / `🔧 debt #NN`) — секція більше не описує в теперішньому часі механізм, якого немає; перевертає маркер той PR, що закриває issue (issue #71)
- [x] CI-крок, що звіряє маркери `🔧 debt #NN` зі станом issue і валить збірку, коли issue закрита, коли номер неіснуючий або коли нумерована секція лишилась без маркера — `scripts/check-conformance-markers.mjs`, окремий job без Postgres і без `npm ci` (issue #73, знайдено при рев'ю #71)
- [x] Обсяг `npm test` виправлено: Vitest підхоплював другу копію `src/` із
      `.claude/worktrees/` і ганяв застарілі інтеграційні тести проти тієї ж
      тестової бази — з того, що звітувалось як один набір, 27 були справжні
      інтеграційні, а 21 дублем зі старої копії на відʼєднаному HEAD. Конфіг
      розділено на проєкти `app`/`scripts` з `exclude` у кожному; сам worktree
      знято (знайдено при рев'ю #71)
- [x] Шляхи в конфігах тулінгу приведені до реальності й накриті перевіркою:
      інструкція CodeRabbit про валідацію env указувала на `src/config/**` —
      теку, якої не було ніколи, тобто два місяці не застосовувалась ні до
      чого; `docs/API-CONVENTIONS.md` не потрапляв у жоден патерн, який
      CodeRabbit читає сам, тож обов'язковий контракт був йому невидимий; а
      `drizzle.config.ts` і `vitest.config.ts` не входили в `include` жодного
      з двох tsconfig. Тепер `scripts/check-config-paths.mjs` і окремий job
      `config-paths` (без Postgres, без `npm ci`, без токена — і без пропуску
      на форках) валять збірку, коли глоб не збігається з жодним файлом, коли
      кореневий `*.config.*` лишився поза типізацією, коли зникла прив'язка
      контракту (порожній `filePatterns` або `enabled` не `true`) і коли читач
      перестав упізнавати конфіг, який той ключ оголошує (issue #77)
- [ ] Підтвердити на першому ж PR, що CodeRabbit справді читає
      `docs/API-CONVENTIONS.md`: перевірка шляхів доводить лише те, що патерн
      збігається з файлом, а не те, що CodeRabbit шанує `enabled` і
      `filePatterns` — документація описує ключ як авто-детект, опублікована
      схема дає йому дефолт `[]`, і статично це не розсудити. Ознака, що
      працює — рев'ю починає посилатись на §-секції контракту (знайдено при
      рев'ю #77)
- [x] Документація перестала недораховувати власні гейти CI: `CONTRIBUTING.md`
      казав «exactly these three», обидва README — «ще один гейт», хоча їх два,
      а в PR-шаблоні чекбокс мав лише `check:markers` — той із двох, що
      потребує токена, тоді як `check:config-paths`, якому не треба ні токена,
      ні мережі, не мав жодного. Разом із ними два формулювання, що
      переоцінювали власні гарантії: коментар у `vitest.config.ts` казав «Two
      projects», визначаючи три — виправлення несла `docs/DECISIONS.md`, а
      рядок біля коду ні; легенда маркерів у `docs/API-CONVENTIONS.md` обіцяла
      «fails the build», не уточнюючи, що один режим відмови — неперевернутий
      маркер — до мерджу не ловиться. Уточнено в легенді; `ONBOARDING.md` і
      новий запис «Уточнення» в `DECISIONS.md` посилаються на неї (знайдено
      при рев'ю PR #78)
- [ ] Зробити перелік джоб CI перевірюваним: `CONTRIBUTING.md`, обидва README і
      PR-шаблон називають джоби з `ci.yml` прозою, і жоден скрипт цього не
      звіряє — тобто клас помилки, який щойно виправляли вручну, лишається
      здатним повторитись при додаванні наступної джоби.
      `scripts/check-config-paths.mjs` уже читає конфіги репозиторію й міг би
      валити збірку, коли ім'я джоби з `ci.yml` не згадане в жодному з цих
      файлів. Не зроблено в тому ж PR свідомо: це новий інваріант у скрипті
      плюс тести до нього, тобто окрема робота, а не правка тексту (знайдено
      при рев'ю PR #78)
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
- [ ] Пагінація і фільтрація list endpoints — транзакції (issue #16) і ретрофіт
      `GET /accounts` (issue #72). Останній сьогодні без `limit`, `offset` і
      без `ORDER BY` узагалі, тож порядок рядків не визначений і не зобов'язаний
      збігатися між двома однаковими запитами (знайдено при рев'ю #71)
- [ ] OpenAPI документація (Scalar)
- [ ] Деплой на Railway або Render
- [ ] Локи в міграціях, що змінюють тип/`NOT NULL`/`CHECK` на наявних
      таблицях: переглянути стратегію (`NOT VALID` + `VALIDATE CONSTRAINT`,
      вікно обслуговування) до першого деплою з реальним трафіком —
      `0001_rapid_tomas.sql` блокує без цього, прийнятно лише поки таблиці
      порожні (issue #36, CodeRabbit на PR #70)

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
