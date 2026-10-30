# LearnSpace FAQ — практическая работа 7

GitHub Issues — источник статей BookStack. Issue с префиксом `[KCS]` создаёт страницу; изменение и закрытие обновляют существующую страницу. Markdown преобразуется библиотекой `marked`, HTML очищается `sanitize-html`.

## Запуск BookStack

1. Скопировать `.env.example` в `.env`, задать случайные пароли и APP_KEY: `base64:` плюс 32 случайных байта в Base64.
2. `docker compose up -d`.
3. Открыть `http://localhost:6875`, сменить стандартные реквизиты администратора.
4. Создать книгу FAQ, API-пользователя и отдельную роль с правами Access API, просмотр книг/глав/страниц, создание страниц и изменение собственных страниц. Создать токен у API-пользователя.
5. Для доступа извне: `cloudflared tunnel --url http://localhost:6875`. Установить выданный HTTPS URL в APP_URL и пересоздать сервис `docker compose up -d bookstack`.

## GitHub Actions

В Secrets репозитория задать `BOOKSTACK_URL`, `BOOKSTACK_API_ID`, `BOOKSTACK_API_SECRET`, `BOOKSTACK_BOOK_ID`. Значения токенов в Git не сохраняются.

Workflow расположен в `.github/workflows/bookstack-kcs.yml`, шаблон обращения — `.github/ISSUE_TEMPLATE/kcs_faq.md`. Перед каждым запуском скрипт читает актуальное состояние Issue через API GitHub. Очередь на уровне одного Issue и постоянный префикс `[FAQ #номер]` предотвращают создание дубликатов при обычных повторных событиях. Отдельная книга должна использоваться только для этого репозитория.

В учебном запуске использован локальный Windows runner с меткой `pr7-kcs`: GitHub отклонил задание на `ubuntu-latest` из-за ограничения биллинга учётной записи. Для облачного runner после устранения ограничения заменить `runs-on` на `ubuntu-latest`. Self-hosted runner следует держать только на доверенном учебном репозитории и выключать после демонстрации.

Повторный запуск в исходной рабочей папке: `powershell -File scripts/Start-Stand.ps1`. Скрипт запускает Docker, сохраняет новый URL туннеля в локальный `.env` и GitHub Secret, затем запускает уже зарегистрированный runner. Реквизиты GitHub берутся из Git Credential Manager и не печатаются. Для другой папки можно задать `-CloudflaredPath` и `-RunnerDirectory`. Для первой установки всё равно нужно создать `.env`, пользователя API, Secrets и зарегистрировать runner по шагам выше.

## Проверка скрипта

Требуется Node.js 22 или новее.

```text
npm ci
npm test
```

Для прямого воспроизведения синхронизации подготовить JSON события Issues и переменные `GITHUB_EVENT_PATH`, `GITHUB_REPOSITORY`, четыре `BOOKSTACK_*`; `GITHUB_TOKEN` позволяет читать актуальный Issue. Затем выполнить `npm run sync`. Скрипт печатает только номер Issue, ID страницы, состояние и результат create/update.
