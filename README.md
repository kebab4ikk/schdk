# ЩДК Host

Програма для ведення турнірів «Що? Де? Коли?» на одному екрані (ноутбук + проєктор/телевізор).
*An offline app for hosting «What? Where? When?» tournaments on one screen — English below.*

## Українською

### Запуск
- **Готова програма:** відкрийте `dist/index.html` подвійним кліком (Chrome, Edge або Firefox). Інтернет і встановлення не потрібні. Файл можна скопіювати на флешку.
- **Збірка з коду:** `npm install`, потім `npm run build` — з'явиться `dist/index.html`. Для розробки: `npm run dev`.

### Як провести гру
1. **Налаштування:** завантажте пакет (`.json` або `.zip`), додайте команди (можна списком), задайте час (60 с + 10 с на запис за замовчуванням).
2. Натисніть **«Відкрити екран»**, перетягніть нове вікно на проєктор і **двічі клацніть** по ньому — воно розгорнеться на весь екран. Якщо вікно не відкрилось, дозвольте спливаючі вікна для сторінки.
3. **Гра:** ведучий бачить питання, відповідь і коментар; гравці — лише питання, таймер, а після показу — відповідь.
   - Пробіл — старт таймера (звук на старті, за 10 с до кінця і в кінці), потім 10 с на запис.
   - Enter — показати відповідь, далі відмітьте команди, що відповіли правильно (клавіші 1…9, 0 або кліком).
   - → — наступне питання.
4. **Результати:** таблиця з місцями; при рівній сумі вище команда з більшим **рейтингом** (за кожне взяте питання: кількість команд, що його не взяли, + 1). Можна показати на екрані (клавіша T) і завантажити CSV для Excel.

### Сенсорна дошка (один екран)
Якщо грають на інтерактивній дошці без окремого ноутбука, натисніть на налаштуваннях **«Режим дошки (сенсорний екран)»**. Гра відкриється на весь екран із великими кнопками внизу:
- **▶ Старт** — таймер; **Відповідь** — показати відповідь (до кінця часу треба натиснути двічі, щоб не показати її випадково);
- після відповіді — **Відмітити** (команди, що відповіли правильно), **Таблиця**, **Далі ▶**;
- **☰** — меню: повний екран, таблиця/заставка, перехід до будь-якого питання, вихід у налаштування.

На дошці відповідь ніде не видно до натискання «Відповідь», тож тримайте відповіді в себе на папері чи телефоні. Клавіатура теж працює.

### Планшет (Android) + дошка
Ведучий тримає планшет із відповідями, а дошка показує гравцям лише питання, таймер і (після показу) відповідь.

1. **Встановлення на планшет:** на сторінці репозиторію відкрийте *Releases → android-latest* і завантажте `schdk-host.apk`. Відкрийте файл і дозвольте встановлення з цього джерела (Android запитає один раз).
2. Планшет і дошка мають бути в **одній Wi-Fi мережі**. Якщо Wi-Fi немає, увімкніть на планшеті **точку доступу** й підключіть до неї дошку (інтернет не потрібен).
3. Відкрийте застосунок **ЩДК Host** на планшеті, завантажте пакет і команди, натисніть **«📺 Підключити дошку»**.
4. На дошці відкрийте браузер і введіть показану адресу (на кшталт `http://192.168.1.23:8765/display`). Торкніться екрана дошки один раз — увімкнуться звук і повний екран.
5. Ведіть гру з планшета як звичайно. Сигнали таймера звучать з дошки.

Не закривайте застосунок під час гри: дошка отримує все саме від нього. Якщо зв’язок перерветься, дошка перепідключиться сама.
Пакет питань не передається на дошку — вона отримує лише те, що гравці мають бачити в цю мить.

Гра зберігається автоматично: після перезавантаження сторінки або збою все відновиться. «Нова гра» очищає відмітки, але зберігає команди та пакет. Невдале питання можна «зняти» — воно не рахується.

### Клавіші (працюють в обох вікнах)
| Клавіша | Дія |
|---|---|
| Пробіл | старт / пауза таймера; після закінчення часу — показати відповідь |
| Enter | показати відповідь |
| ← / → | попереднє / наступне питання |
| 1…9, 0 | відмітити команду 1…10 |
| H | показати / сховати роздатку |
| M | відтворити / зупинити аудіо чи відео |
| T | таблиця / питання на екрані |

## Формат пакета

Пакет — це JSON-файл. Якщо в питаннях є картинки, аудіо чи відео, покладіть `pack.json` разом із файлами в ZIP-архів. Шляхи до медіа вказуються відносно `pack.json`.

```json
{
  "title": "Кубок осені",
  "author": "Редактор",
  "date": "2026-11-20",
  "tours": [
    {
      "title": "Тур 1",
      "questions": [
        {
          "text": "Текст питання…",
          "answer": "Відповідь",
          "accepted": ["інший залік"],
          "comment": "Коментар",
          "source": "Джерело",
          "author": "Автор питання",
          "handout": "Роздатковий матеріал (текст)",
          "media": { "type": "image", "src": "media/q1.jpg" },
          "time": 60
        }
      ]
    }
  ]
}
```

| Поле | Обов'язкове | Опис |
|---|---|---|
| `tours[].questions[]` | так | Питання. Замість `tours` можна дати просто `questions: [...]` — тоді буде один тур. |
| `answer` | так | Відповідь. |
| `text` | так, якщо немає `media` | Текст питання. |
| `media` | ні | `type`: `image`, `audio` або `video`; `src`: шлях у ZIP або `https://…` / `data:` адреса. |
| `accepted` | ні | Інші зараховані відповіді (список рядків). |
| `comment`, `source`, `author`, `handout` | ні | Текст. |
| `time` | ні | Секунди на обговорення саме цього питання (наприклад, 20 для бліцу). |
| `answerMedia` | ні | Як `media`, але показується лише після відповіді (ілюстрація до коментаря). |
| `hostNote` | ні | Вказівка для ведучого (вимова, як читати). Видно лише ведучому, на екран не потрапляє. |
| `notes` (у корені пакета) | ні | Інструкція та преамбула для ведучого; видно на екрані налаштувань. |

Текст у **квадратних дужках** у запитанні чи коментарі (`IT-спеціаліст [айті-спеціаліст]`) — підказка для того, хто читає вголос: ведучий її бачить, а на екрані гравців вона прибирається.

Приклад: [`examples/sample-pack.json`](examples/sample-pack.json). Помилки в пакеті показуються з номером питання.

### Пакет у .odt або .txt
Можна завантажити документ **.odt** (LibreOffice, Google Docs → «Завантажити → ODT») або звичайний текстовий файл у форматі, в якому редактори публікують пакети. Картинки з .odt підхоплюються автоматично: картинка після рядка «Відповідь» показується гравцям лише разом із відповіддю. Назва пакета береться з властивостей документа (Файл → Властивості → Назва).


```
ТУР 1
Запитання 1.
[Ведучим: вказівка для ведучого]
Текст запитання…
Відповідь: …
Залік: …
Незалік: …
Коментар: …
Джерело: …
Автор: …
```

Усе, що стоїть перед першим запитанням (інструкція, преамбула), стає нотатками для ведучого. Підходять і російські назви полів (Вопрос, Ответ, Зачёт…). Документ Word (.docx) збережіть як .odt у LibreOffice або Google Docs. Для PDF краще взяти вихідний .odt; інакше скопіюйте текст у .txt. Скрипт `scripts/text-to-pack.ts` робить ZIP із текстового пакета з картинками: рядок `[[image: media/q7.jpg]]` після «Відповідь» додає ілюстрацію до відповіді.

---

## Генерування запитань (Claude Code)

У репозиторії є навичка для Claude Code `/chgk-questions` ([`.claude/skills/chgk-questions`](.claude/skills/chgk-questions/SKILL.md)): вона пише оригінальні запитання у стилі синхронних турнірів на задані теми, перевіряє кожен факт за джерелами в інтернеті й зберігає пакет у `packs/*.txt`, який застосунок відкриває напряму. Приклад: `/chgk-questions космос, винаходи; 12; школярі`.

- Потрібен доступ до інтернету (перевірка фактів). Факти, які не вдалося перевірити, не потрапляють у пакет.
- Запитання з чужих пакетів не копіюються. Для перевірки на повтор навичка дає посилання на пошук questions.com.ua — сам сайт вона не читає: його умови забороняють копіювання й збирання запитань.
- Папка `packs/` не потрапляє в git: ваші пакети лишаються приватними.
- Це чернетки: перед грою їх має прочитати редактор.

## English

### Running
- **Ready app:** double-click `dist/index.html` (Chrome, Edge or Firefox). No internet or install needed.
- **From source:** `npm install`, then `npm run build` to produce `dist/index.html`. `npm run dev` for development.

### Hosting a game
1. **Setup:** load a pack (`.json` or `.zip`), add teams (one by one or as a list), set the time (60 s + 10 s to write by default).
2. Click **Open display**, drag the new window to the projector and **double-click** it for full screen. Allow pop-ups if the browser blocks it.
3. **Game:** the host sees question, answer and comment; players see only the question, the timer and, once revealed, the answer. Space starts the timer, Enter reveals the answer, 1…9/0 mark correct teams, → goes to the next question.
4. **Results:** places with a tie-break by **rating** (for each question a team answered: the number of teams that missed it + 1). Show it on the display (T) or download CSV.

**Touch board (one screen):** on Setup, choose **Board mode (touch screen)**. The game runs full screen with large touch buttons (Start, Answer, Mark, Table, Next, and a ☰ menu). No answer is shown anywhere before you tap Answer (twice, if time isn't up yet), so keep the answers on paper or a phone.

**Android tablet + board:** install `schdk-host.apk` from *Releases → android-latest* on the tablet. Put the tablet and the board on the same Wi-Fi (or connect the board to the tablet's hotspot), open the app, tap **Connect board** and open the shown address (e.g. `http://192.168.1.23:8765/display`) in the board's browser. Tap the board once to enable sound and full screen. The host runs the game on the tablet; the board only ever receives what players may see at that moment, never the pack. Keep the app open during the game.

**Text and .odt packs:** an `.odt` document (LibreOffice / Google Docs) or a `.txt` file in the usual editor layout (`Запитання 1.` / `Відповідь:` / `Залік:` / `Коментар:` / `Джерело:` / `Автор:`, tours as `ТУР 1`) loads directly. Text before the first question becomes host notes; `[Ведучим: …]` becomes a host-only note; anything in square brackets is hidden from the players' screen. Pictures in an `.odt` are picked up; one placed after the `Відповідь` line is shown only with the answer (`answerMedia`).

The game is saved automatically and survives a page reload. The interface language switches between Ukrainian and English in the top bar. The pack format is described above (fields are the same in both languages).

**Writing questions:** the Claude Code skill `/chgk-questions` (`.claude/skills/chgk-questions/`) drafts original questions on given themes in the synchronous-tournament style, verifies each fact against web sources it actually opens, and saves a `.txt` pack to the git-ignored `packs/` folder for the app. It needs web access, never copies questions from existing packs, and only links to questions.com.ua searches for repeat checks (the site's terms forbid copying or collecting its questions).

### Development
- `npm test` — unit tests (pack loading, timer state machine, scoring).
- `npm run build && npm run smoke` — runs the built `dist/index.html` from `file://` in Chromium via Playwright and plays through a short game.
- `npm run build && npm run smoke:remote` — starts the Android app's screen server (`android/app/src/main/java/app/schdk/host/ScreenServer.java`) on a desktop JVM and plays a game with a "tablet" page and a "board" page over the network.
- `android/` — the tablet app: a WebView around the web app plus the screen server. `.github/workflows/android.yml` builds the APK (`cd android && ./gradlew assembleRelease` after `npm run build`; needs the Android SDK) and publishes it as the `android-latest` pre-release. The signing key `android/schdk.keystore` is committed on purpose so updates install over the previous version; it is not a secret.
