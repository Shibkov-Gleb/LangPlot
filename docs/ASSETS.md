# Иллюстрации LangPlot

Обе иллюстрации созданы встроенным инструментом imagegen специально для концепции LangPlot. Это атмосферные изображения; они не обозначают опубликованные сюжеты или реальные курсы.

- `apps/web/public/images/english-world.webp` — оригинальная иллюстрация из подготовленной ранее презентации LangPlot: вечерняя английская станция, девушка в тёплом пальто с телефоном, тёмно-бирюзовая палитра и янтарные фонари. Исходник сохранён у пользователя в каталоге сгенерированных изображений, версия WebP включена в Git.
- `apps/web/public/images/german-world.webp` — новая иллюстрация университетского квартала. Создана встроенным imagegen, затем перекодирована в WebP без изменения содержания. Итоговый промпт ниже.

> Create an original cinematic environment illustration for LangPlot, a language learning visual novel website. Wide landscape 16:9. A quiet old German university quarter at blue hour, cobblestone street leading past an intimate warmly lit bookshop and café into a distant stone arch. German half-timber architecture mixed with brick, subtle wet reflections, amber window lights, dark teal foliage and deep midnight blue sky. A small bicycle near the bookshop, no people close up. Painterly high-end narrative video game background, rich hand-painted detail, confident composition, atmospheric depth, inviting and curious rather than scary. Large simple shadowed areas along bottom for UI overlays. Restrained amber and turquoise palette, no saturated purple, no neon, no typography, no letters, no logos. This is atmosphere only, not a specific story or course.

Шрифт Manrope поставляется локально через `@fontsource-variable/manrope` (SIL Open Font License, лицензия в пакете). Иконки — `lucide-react` (ISC). В рабочем интерфейсе нет запросов к Google Fonts, CDN изображений, аналитике или внешним моделям.
