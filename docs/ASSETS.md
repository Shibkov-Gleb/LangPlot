# Иллюстрации LangPlot

Обе иллюстрации созданы встроенным инструментом imagegen специально для концепции LangPlot. Это атмосферные изображения; они не обозначают опубликованные сюжеты или реальные курсы.

- `apps/web/public/images/english-world.webp` — оригинальная иллюстрация из подготовленной ранее презентации LangPlot: вечерняя английская станция, девушка в тёплом пальто с телефоном, тёмно-бирюзовая палитра и янтарные фонари. Исходник сохранён у пользователя в каталоге сгенерированных изображений, версия WebP включена в Git.
- `apps/web/public/images/german-world.webp` — новая иллюстрация университетского квартала. Создана встроенным imagegen, затем перекодирована в WebP без изменения содержания. Итоговый промпт ниже.

> Create an original cinematic environment illustration for LangPlot, a language learning visual novel website. Wide landscape 16:9. A quiet old German university quarter at blue hour, cobblestone street leading past an intimate warmly lit bookshop and café into a distant stone arch. German half-timber architecture mixed with brick, subtle wet reflections, amber window lights, dark teal foliage and deep midnight blue sky. A small bicycle near the bookshop, no people close up. Painterly high-end narrative video game background, rich hand-painted detail, confident composition, atmospheric depth, inviting and curious rather than scary. Large simple shadowed areas along bottom for UI overlays. Restrained amber and turquoise palette, no saturated purple, no neon, no typography, no letters, no logos. This is atmosphere only, not a specific story or course.

Шрифт Manrope поставляется локально через `@fontsource-variable/manrope` (SIL Open Font License, лицензия в пакете). Иконки — `lucide-react` (ISC). В рабочем интерфейсе нет запросов к Google Fonts, CDN изображений, аналитике или внешним моделям.

## Последний ряд

В `apps/web/public/assets/last-row/` лежат оригинальные иллюстрации ImageGen для первого урока: остановка, пустой салон, варежка с билетом и два портрета с прозрачным фоном. Текст и время на игровом билете отрисовываются интерфейсом. Дождь, помеха рации и сигнал сообщения синтезированы для LangPlot и поставляются локальными WAV-файлами.

## Иллюстрации уроков 2–15

Фоны и портреты созданы встроенным imagegen для текущего проекта. Файлы поставляются локально в `apps/web/public/assets/first-act/`. Исходные изображения сохранены в каталоге генерации Codex. Формат WebP получен с сохранением прозрачности портретов.

Промпты фонов

- `workshop.webp` — Environment concept art for a cinematic detective visual novel set in fictional Alder Switch in the American Cascade mountains. Wide landscape 1536x1024. Interior of a modest old bus repair workshop at rainy evening, small upstairs kitchenette visible up stairs, two clean mugs on workbench, one dirty mug with screws on windowsill, a worn desk with closed drawer, taped spare key, warm desk lamp, blue green shadows and muted amber practical lights. Empty environment without people. Painterly realistic graphic novel quality, restrained atmosphere of a small town mystery, spacious lower third to overlay dialogue, coherent architecture, no typography or logos.

- `diner.webp` — Wide cinematic environment for a realistic painterly detective visual novel, 1536x1024. Small American Cascade mountain town diner at gray rainy morning. Warm wood counter and coffee cups, red glove on a white saucer, three mismatched chairs by a kitchen stove, sliced onion on folded newspaper, one unoccupied chair with worn blue seat, mountain forest glimpsed out misty window. Empty room without people. Warm amber pools of light with cool blue green shadows, restrained lived in realism, visually layered mystery atmosphere, lower third left dark enough for dialogue UI. No text no logos.

- `dispatch.webp` — Wide environment art for a cinematic small town detective visual novel, realistic painterly style, 1536x1024. Small bus dispatch station in American Cascade mountains at early dawn after rain. Worn radio desk, analog clock, paper tape and blue pen, orange peel spiral on table, red raincoat on hook, simple keys hanging on wall, pale blue window light and dim amber desk lamp, an empty chair pulled back. Empty room without people, no ominous monsters, subtle uncertainty, dark bottom third for dialogue UI. No legible letters, no logos.

- `headquarters.webp` — Cinematic environment for a realistic painterly visual novel detective thriller. Wide 1536x1024. Back room of a small mountain town grocery store used as a search headquarters, folding table with white witness cards and blank blue green forms, blue waterproof jacket on chair, old map with no legible writing pinned on wall, flashlights, spare batteries, thermos. Late gray morning rainy Pacific Northwest light, muted amber overhead bulb, deep teal gray shadows, empty room without people, grounded careful detail, bottom third dark for text overlay. No letters or logos.

Общий промпт портретов

Single character sprite for a grounded detective visual novel, realistic painterly style, restrained cinematic amber rim light and cool teal shadows, consistent human proportions, waist-up portrait in 3/4 view slightly facing left, full head and both shoulders visible, isolated on truly transparent background, no environment, no frame, no text, no props obscuring face.

Персонажи

- `mae.webp` — Mae Rowe, a 34-year-old American small-town bus dispatcher. Worn moss-green cardigan over dark shirt, practical tied-back auburn hair, paper label rolled between fingers, thoughtful watchful expression and restrained warmth.

- `nell.webp` — Nell Dale, a 31-year-old contemporary Native American woman from a fictional Cascade mountain community. Bus mechanic, practical dark hair tied back, repaired navy work jacket, grease on fingers holding an ordinary pencil, composed skeptical attentive expression. Contemporary everyday work clothes.

- `ada.webp` — Ada Dale, a 64-year-old contemporary Native American woman from the Cascade mountains, former school cook. Short graying dark hair, simple knitted gray cardigan and dark everyday shirt, strong lined face, thoughtful direct expression, one hand on folded kitchen towel. Contemporary everyday clothing.

- `ruth.webp` — Ruth Bell, a 49-year-old American woman leading a small-town rescue service. Practical short dark-blond hair, weathered blue waterproof jacket over dark shirt, a simple clipboard held low, composed and exacting expression with restrained fatigue.

- `jo.webp` — Jo Park, a 30-year-old American woman running a family diner in a Cascade mountain town. Dark hair pinned back, plain rust brown shirt and faded apron, a small order slip held low, observant sympathetic expression with tired humor.

## Иллюстрации полного сезона

Созданы встроенным imagegen и сохранены в `apps/web/public/assets/season/`. Фоны предназначены для сцен депо, дома Дейл, нижнего поста, тропы и школьного зала. Портрет Анны сохраняет прозрачность. Промпты

- `depot.webp` — Cinematic environment concept art for a realistic painterly detective visual novel in fictional Alder Switch, American Cascade mountains. Wide landscape 1536x1024. Interior of old regional bus depot at night, empty weathered bus with maintenance door open, wooden tool rack, paper ticket rolls, work lamp over bench, cap holding a small screw, vintage radio, rain on high windows. Muted amber pools of light and dark teal shadows, grounded lived-in realism, dark empty lower third for dialogue overlay. Empty room, no people no text no logos.

- `family.webp` — Cinematic environment concept art for realistic painterly visual novel. Wide 1536x1024. Everyday contemporary family kitchen in a fictional Native American community in the American Cascade mountains. Warm modest home, ordinary painted cabinets, kettle and onion by old stove, family photographs with no identifiable faces, paper sewing pattern and a wooden ruler with two small carved notches on kitchen table, spare wool socks in a glass jar. Misty forest outside. Personal, grounded, modern everyday life. Muted amber and teal palette, empty room without people, no text no logos, lower third quiet for dialogue.

- `lowerpost.webp` — Wide cinematic environment for realistic painterly detective thriller visual novel in the Cascade mountains, 1536x1024. Abandoned lower bus dispatch shelter in the mountain forest at rainy night. Narrow concrete room with two heavy doors, old disconnected radio on desk, a spoon and glass beside wet paper, dim amber maintenance lamp, water beginning to seep under one threshold. Evidence of an ordinary person trying to signal outside, subtle tension and uncertainty, dark teal shadows, empty environment without people, no text no logos.

- `trail.webp` — Wide cinematic landscape for realistic painterly mountain detective thriller visual novel, 1536x1024. Narrow forest trail above a mountain creek in the American Cascades after a landslide. Wet wooden steps, ordinary rope secured beside a second exit, two paired notches on an old plain wooden rail, mist between dark fir trees, overcast dawn light, a faint warm glow from distant town. Grounded realistic hazards, subtle ancient atmosphere through weathered land, no magical runes, no people, dark lower third for dialogue, muted teal gray and amber.

- `hall.webp` — Wide environment concept art for a realistic painterly small town detective visual novel, 1536x1024. Empty school meeting hall in a Cascade mountain town on quiet late morning. Mismatched rows of wooden chairs, one chair facing a simple desk, three plain envelopes and a clean sheet on desk, an open door and wide windows with cloudy mountain light, one old workbench at side. Calm emotional aftermath of a difficult public truth, restrained warm amber and cool teal palette, empty without people, no legible letters no logos, dark lower third for dialogue overlay.

- `porch.webp` — Wide cinematic realistic painterly environment for a detective visual novel in fictional Alder Switch in the Cascade mountains, 1536x1024. Covered wooden front porch and small front room of a modest contemporary family house, rain boots and a jar of spare socks, plain table with sewing paper and a closed family photo album, ordinary everyday furnishings, kitchen door visible at back with its chain closed. Misty forest outside. Restrained amber lamp and cool teal daylight, lived-in contemporary family home, no people, no text, no logos, calm dark lower third for dialogue.

- `anna.webp` — Single character sprite for a grounded detective visual novel, realistic painterly style matching restrained amber rim light and cool teal shadows. Anna Somova, a 48-year-old Russian mother from Perm, practical shoulder-length dark brown hair with a few gray strands, ordinary soft blue cotton blouse, attentive tired face and reserved warmth, one hand holding an everyday smartphone low. Waist-up 3/4 portrait facing slightly left, full head and both shoulders visible, contemporary everyday appearance, isolated on truly transparent background, no scenery, no text, no logos.

## Озвучка English A2

В assets/voices/en-a2 подготовлены 1 142 реплики десяти персонажей через Gemini 3.1 Flash TTS. Постоянные голоса и актёрская подача заданы в content/courses/en-a2-voices.json. manifest.json связывает точный текст и персонажа с локальным MP3. Файлы имеют один канал, частоту 24 кГц и поток 64 кбит/с. Громкость нормализована для диалогов. Ключ генерации хранится в локальном .env.
