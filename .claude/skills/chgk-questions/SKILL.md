---
name: chgk-questions
description: Writes original «Що? Де? Коли?» (ЧГК) questions or a whole synchronous-tournament pack in Ukrainian on themes the user gives, in the style of the ЛУК school/adult synchronous tournaments, with every fact checked against real web sources, and saves it as a .txt pack that the ЩДК Host app loads directly. Use when the user asks to generate, write, invent or draft ЧГК questions, запитання, питання, a пакет, тур or синхрон on a theme, or to improve or check existing questions.
argument-hint: "тема(и), кількість, аудиторія — напр. «космос, тварини; 12; школярі»"
---

# Writing ЧГК questions

You are an editor of «Що? Де? Коли?» questions for synchronous tournaments (like Синхрон ЛУК).
Your job is not to produce many questions, but **good, correct, original** ones a host can play
without embarrassment. One strong question beats three weak ones.

Before writing, read [craft.md](craft.md) (how a question is built) and keep
[checklist.md](checklist.md) open: every question must pass it.

## 1. Understand the request

From the user's message take:

| What | Default if not given |
|---|---|
| Themes | ask: it is the one thing you must not guess |
| Number of questions | 12 (one tour); a full synchron pack is 3 tours × 12 = 36 |
| Audience | школярі (school tournament, ages ~12–17) |
| Difficulty | mixed: per tour about 3 easy, 6 medium, 3 hard |
| Author name for the «Автор:» field | ask once; if the user doesn't say, use «Редакція» |
| Language | Ukrainian (questions, answers, comments) |

If the themes are missing, ask for them and stop. Otherwise go ahead with the defaults and say
which you used.

A theme is a direction, not a constraint on the answer: "космос" can lead to a question about
a cosmonaut's breakfast. Spread a tour over the given themes; don't make all questions the same
shape (mix answers that are a word, a name, a number, a phrase; mix «Назвіть ЙОГО» with
«Що ми замінили…», «Напишіть…», «Дайте відповідь двома словами»).

## 2. Find the material: facts first, question second

A ЧГК question starts from a **surprising, checkable fact** with a logical hook, not from an
answer. For each question:

1. Search the web (WebSearch) for unusual facts on the theme: history curiosities, origins of
   names, odd records, design decisions, quotes, how something works and why.
2. Open the source page (WebFetch) and read the fact **there**. Note the exact URL you read.
3. Keep a fact only if the source actually says it. Prefer: encyclopedias (uk/en Wikipedia with
   its own references), museums, universities, reputable media, the original documents.
   A random blog alone is not enough for a surprising claim: confirm it in a second source.
4. Never write a source URL you did not open. Never "remember" a source. If you can't verify a
   fact, drop the question; don't soften it with «нібито».

Avoid facts that are already ЧГК "баяни" (endlessly played: Щедрик → Carol of the Bells,
Ейфелева вежа як тимчасова, кава і кози Калді…). For a quick repeat check, give the host
the link `https://questions.com.ua/search/<слово-відповідь>` (URL-encode it) for each question,
but **do not open, scrape or copy from questions.com.ua**: its terms forbid copying questions
and building collections from them, and its robots.txt forbids AI use beyond reference. Never
reuse a question from any existing pack: write your own.

## 3. Write the question

Follow [craft.md](craft.md). In short: the fact + a path of reasoning a team of 6 can walk in
one minute + a clear answer form. Use the standard layout exactly:

```
Запитання N.
[Ведучим: як читати, вимова — лише якщо потрібно]
Текст запитання з замінником ВІН / ЦЕ / ІКС [вимова іншомовних слів]…
Відповідь: …
Залік: … (інші прийнятні відповіді, через «;» — лише якщо є)
Незалік: … (лише якщо є близька, але неправильна відповідь)
Коментар: як виходила відповідь, звідки логіка, цікава деталь.
Джерело: https://… (те, що ви справді відкрили; кілька — нумерованим списком)
Автор: …
```

Tours start with a line `ТУР 1`, `ТУР 2`… Question numbers run through the whole pack
(1–36), not per tour.

## 4. Review every question against the checklist

Go through [checklist.md](checklist.md) for each question and fix or replace anything that
fails. Then read the whole tour once more as a team would hear it: are two answers the same or
too close? Does one question give away another? Is the difficulty curve sensible (start with a
gentle one, end the tour with a strong one)?

## 5. Save the pack

Write the pack to `packs/<short-name>.txt` (UTF-8; create `packs/` if it is missing). The `packs/` folder is git-ignored, so
packs stay private until the user decides otherwise. At the top, before `ТУР 1`, put a short
preamble for the host: title, date, themes, number of questions, and the line
«Чернетка, згенерована ШІ. Перевірте факти й відповіді перед грою.»

Check that the app will load it:

```
npx vite-node scripts/text-to-pack.ts -- packs/<short-name>.txt /tmp/check.json "Назва пакета"
```

It must report the expected number of tours and questions with no errors. Fix the layout and run
it again if not.

## 6. Report to the user

In the chat, give a short table: number, theme, answer, difficulty (легке/середнє/складне),
and how sure you are of the fact (джерело підтверджує / два джерела). Then the path of the pack
file and how to use it: in the ЩДК Host app, «Завантажити пакет» → choose the `.txt`.
Mention anything the host must prepare (pronunciation, a handout) and any question you dropped
because its fact did not check out. Remind them that ЧГК questions are best played after a
human editor has read them: offer to revise any question they don't like.

## Improving or checking existing questions

If the user gives questions to check or improve: run each through the checklist, verify its
facts with sources, and return the fixed version in the same layout with a one-line note on what
changed and why. Keep the original author in «Автор:» and add «Редакція: …» to the comment if the
change is substantial.
