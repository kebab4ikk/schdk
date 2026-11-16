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

Приклад: [`examples/sample-pack.json`](examples/sample-pack.json). Помилки в пакеті показуються з номером питання.

---

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

The game is saved automatically and survives a page reload. The interface language switches between Ukrainian and English in the top bar. The pack format is described above (fields are the same in both languages).

### Development
- `npm test` — unit tests (pack loading, timer state machine, scoring).
- `npm run build && npm run smoke` — runs the built `dist/index.html` from `file://` in Chromium via Playwright and plays through a short game.
