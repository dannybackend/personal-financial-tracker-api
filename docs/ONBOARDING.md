# Онбординг розробника

Цей документ описує, як запустити Personal Financial Tracker API локально з чистого checkout.

## Передумови

- Node.js 24 або новіший
- npm
- Docker Desktop з Docker Compose
- Git

## 1. Встановити залежності

```bash
npm i
```

## 2. Створити локальний `.env`

Скопіюй приклад:

```bash
cp .env.example .env
```

У Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Для стандартного `docker-compose.yml` PostgreSQL доступний на host-порту `5433`, тому локальний `.env` має виглядати приблизно так:

```env
POSTGRES_USER=personal_api
POSTGRES_PASSWORD=personal_api_password
POSTGRES_DB=personal_api
DATABASE_URL=postgresql://personal_api:personal_api_password@localhost:5433/personal_api

BETTER_AUTH_SECRET=replace_with_at_least_32_random_characters
BETTER_AUTH_URL=http://localhost:3000

TEST_DATABASE_URL=postgresql://personal_api:personal_api_password@localhost:5433/personal_api_test
```

`TEST_DATABASE_URL` — окрема, одноразова база для `npm test` (Vitest очищає її таблиці після кожного тесту). Створюється автоматично при першому `docker compose up -d` на чистому томі (`docker/init-test-db.sh`); якщо база вже піднімалась раніше без цього скрипта, створи її вручну один раз:

```bash
docker exec -it personal-api-postgres psql -U personal_api -d personal_api -c "CREATE DATABASE personal_api_test;"
```

Згенерувати сильніший `BETTER_AUTH_SECRET` можна однією з команд:

```bash
openssl rand -base64 32
```

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

## 3. Запустити інфраструктуру

```bash
docker compose up -d
```

Це піднімає:

- PostgreSQL на `localhost:5433`
- Redis на `localhost:6379`

Перевірити статус контейнерів:

```bash
docker compose ps
```

## 4. Накотити міграції

```bash
npm run db:migrate
```

Команда застосовує міграції з `src/db/migrations/` до PostgreSQL бази з `DATABASE_URL`.

## 5. Запустити API

```bash
npm run dev
```

API буде доступне за адресою:

```text
http://localhost:3000
```

Поточна перевірка, що сервер відповідає:

```bash
curl http://localhost:3000/
```

Очікувана відповідь:

```text
Hello Hono!
```

## Переглянути дані в базі

Найпростіший спосіб — **Drizzle Studio**. Вже входить у `drizzle-kit`
(devDependency), не питає окремих кредів — читає той самий
`drizzle.config.ts`, яким користуються міграції:

```bash
npm run db:studio
```

Відкриває `https://local.drizzle.studio` в браузері: список таблиць,
перегляд і редагування рядків, довільні SQL-запити. UI віддається з хмари
Drizzle, але саме з'єднання з базою лишається локальним.

Якщо потрібен окремий клієнт (VS Code extension, TablePlus, DBeaver тощо),
йому потрібні ті самі значення, що вже лежать у `.env`:

| Поле | Значення |
|---|---|
| Host | `localhost` |
| Port | `5433` (не стандартний `5432` — дивись `docker-compose.yml`) |
| Database | значення `POSTGRES_DB` з `.env` |
| User | значення `POSTGRES_USER` з `.env` |
| Password | значення `POSTGRES_PASSWORD` з `.env` |
| SSL | вимкнено (локальна розробка) |

Швидка перевірка без жодного клієнта, напряму через контейнер:

```bash
docker exec -it personal-api-postgres psql -U personal_api -d personal_api
```

(`personal_api`/`personal_api` — дефолти з `.env.example`; якщо у своєму `.env`
змінював `POSTGRES_USER`/`POSTGRES_DB`, підставляй свої значення.)

Всередині `psql`: `\dt` — список таблиць, `SELECT * FROM auth_user;` —
подивитись дані, `\q` — вийти.

## Правила для агентів у `.claude/`

Тека `.claude/` комітиться разом із проєктом — це правила проєкту, не особисті
налаштування. Ставити окремо нічого не треба.

Але скіли й хуки підхоплюються по-різному. Скіли доступні одразу. Хук — це
довільний код, який приїхав із чужим комітом, тому Claude Code не запускає
хуки з проєктного `.claude/` мовчки: їх треба один раз переглянути й
підтвердити. Поки цього не сталося, нагадування просто не спрацьовують — і
виглядає це точно так само, як робочий хук, якому нема про що нагадувати.
Якщо не впевнений — перевір, що хук справді працює, а не мовчить.

- `.claude/skills/` — п'ять скілів, жоден не вантажиться в кожен запит.
  `task-workflow` і `pr-workflow` модель підхоплює сама, коли доречно (заводиш
  гілку, відкриваєш PR). `discuss-comments`, `discuss-rabbit` та
  `implement-comments` — флоу розбору рев'ю; їх викликаєш ти командою
  (`/discuss-rabbit <номер-PR>`), сама модель їх не бере.
- `.claude/hooks/doc-rules.cjs` — після правки файлу нагадує про документацію,
  яку та правка зобов'язує оновити. Спрацьовує рідко й навмисно: на зміну
  `src/db/schema.ts` чи `src/db/auth-schema.ts` та на **створення** файлу
  роута. На звичайну правку існуючого файлу мовчить. Тригера на самі файли
  міграцій немає навмисно — їх пише drizzle-kit, і хук їх не бачить.
- `.claude/settings.local.json` — єдиний файл цієї теки поза git, для особистих
  перевизначень.

Хуки діють лише в сесіях, що стартували **після** появи файлів — після
`git pull` з цими змінами перезапусти сесію агента.

Чому саме так — `docs/DECISIONS.md` → «Розділення `AGENTS.md` на
завжди-контекст і ситуативні правила».

## Корисні команди

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run typecheck` виконує **два** конфіги: `tsconfig.json` для застосунку і
`tsconfig.scripts.json` для інструментального коду поза застосунком —
`scripts/` та `.claude/hooks/`. Другий існує, бо це звичайний JavaScript (щоб
CI і Claude Code запускали його без збірки і без `npm ci`), і `checkJs` тримає
його JSDoc під тими самими strict-правилами. Окремим файлом, а не в `include`
основного, бо основний веде `npm run build`, де `rootDir: ./src` робить
будь-який файл поза `src/` помилкою.

`npm test` розділений на **три** проєкти Vitest: `app` (потребує Postgres),
`scripts` і `hooks` (базу не потребує жоден із двох). Прогнати те, що не чекає
на базу — `npx vitest run --project scripts --project hooks`.

Звірити маркери відповідності в `docs/API-CONVENTIONS.md` зі станом issue на
GitHub — те саме, що робить окремий job `markers` у CI. Потребує токена, бо
читає issue через API:

```bash
GITHUB_TOKEN=$(gh auth token) npm run check:markers
```

У Windows PowerShell (інлайн-префікса змінної там немає, тому двома командами):

```powershell
$env:GITHUB_TOKEN = gh auth token
npm run check:markers
```

Червоніє, коли маркер `🔧 debt #NN` називає вже закриту чи неіснуючу issue,
коли нумерована секція лишилась без маркера, або коли парсер перестав
упізнавати документ. Виняток один: **неперевернутий маркер** до мерджу не
ловиться — чому саме так і що з цим робити, описує легенда «Conformance
markers» у самому `docs/API-CONVENTIONS.md`.

Звірити, що конфіги тулінгу не розійшлися з реальністю. Ні токена, ні мережі не
потребує, тому запускається як є:

```bash
npm run check:config-paths
```

Червоніє в таких випадках:

- **шлях указує в порожнечу** — `path:` у `.coderabbit.yaml` або патерн у
  `knowledge_base.code_guidelines.filePatterns` не збігається з жодним файлом;
- **кореневий `*.config.*` поза типізацією** — не входить у програму жодного з
  двох tsconfig, рахуючи за правилами самого TypeScript: `include` мінус
  `exclude`, плюс `files`, який `exclude` не фільтрує;
- **прив'язки контракту немає** — `filePatterns` порожній або
  `code_guidelines.enabled` не `true`. Без них `docs/API-CONVENTIONS.md`
  невидимий для CodeRabbit, а видалити цей блок можна одним рухом і без сліду;
- **проза розійшлася з `ci.yml`** — джоба, якої не називає `CONTRIBUTING.md`;
  перевірка `check:*`, яку CI запускає, а `CONTRIBUTING.md` чи PR-шаблон не
  називає; або навпаки — названа в прозі, але в CI не запущена. «Називає»
  означає окремий код-спан (`` `config-paths` ``, `` `npm run check:toc` ``), а
  не просто збіг символів: ім'я `ci` інакше «знаходилось» усередині слова
  decisions. README у цей гейт не входять — вони описують CI, не називаючи
  команд;
- **читач більше не розуміє файл** — про це нижче.

Існує тому, що глоб, який не збігається ні з чим — валідний YAML: інструкція
CodeRabbit про валідацію env два місяці вказувала на `src/config/**`, теку,
якої ніколи не було, і жоден сигнал у проєкті про це не сповістив.

Останній випадок спрацює найнесподіваніше. Читач `.coderabbit.yaml` рядковий, не
YAML-парсер, тож конфіг, переписаний у flow-стилі, прочитається для нього
порожнім. Тому `parsed 0 path instructions` означає не «все чисто», а «скрипт
більше не розуміє файл» — і валить збірку, замість тихо звітувати успіх на нулі
перевірених патернів.

Перегенерувати зміст у `DECISIONS.md`, `LEARNING.md` і `BOOTSTRAP.md` після
того, як додав або перейменував запис:

```bash
npm run toc
```

Звірити, що зміст не застарів — те саме робить job `config-paths` у CI:

```bash
npm run check:toc
```

Зміст генерується, а не пишеться руками, бо в `DECISIONS.md` понад пʼятдесят
записів і файл росте дописуванням: індекс, який підтримують уручну, — це та
сама заявка, що й глоб, який ні з чим не збігається. Заразом він показує
ланцюжки уточнень (`**Уточнює:**`, `**Виправляє:**`), тож видно чинний стан
рішення, не читаючи весь файл підряд.

Згенерувати нову міграцію після зміни Drizzle-схеми:

```bash
npm run db:generate
```

Застосувати pending-міграції:

```bash
npm run db:migrate
```

Зупинити локальну інфраструктуру:

```bash
docker compose down
```

Зупинити інфраструктуру і видалити локальні дані PostgreSQL/Redis:

```bash
docker compose down -v
```

## Поточний стан проєкту

Що працює і що далі — секція «Стан» у [`README.uk.md`](../README.uk.md);
статус чекпоінтів — `docs/PROGRESS.md`; живий беклог — GitHub Issues.

Цей файл раніше дублював той самий перелік окремим списком — і розійшовся:
він стверджував, що бізнесових endpoints немає, вже після того, як accounts
CRUD був змерджений. Прибрано, щоб не розходилось удруге.

## Troubleshooting

Якщо міграції не можуть під'єднатися до PostgreSQL, перевір:

- `docker compose ps` показує PostgreSQL як running або healthy
- `DATABASE_URL` використовує `localhost:5433`, а не `localhost:5432`, якщо запускаєш базу через цей `docker-compose.yml`
- `POSTGRES_USER`, `POSTGRES_PASSWORD` і `POSTGRES_DB` збігаються з credentials у `DATABASE_URL`

Якщо API падає на старті через env validation, перевір:

- файл `.env` існує
- `DATABASE_URL` заповнений
- `BETTER_AUTH_SECRET` має щонайменше 32 символи
- `BETTER_AUTH_URL` не має trailing slash
