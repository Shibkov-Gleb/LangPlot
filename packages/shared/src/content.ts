import { z } from 'zod';
import { Language, Level, type ValidationReport } from './contracts.js';
const id = z.string().regex(/^[a-z][a-z0-9._-]{0,79}$/, 'Используйте a–z, цифры, точку, дефис или подчёркивание.');
export const ResourcePath = z.string().max(200).refine(value => /^assets\/[a-zA-Z0-9_/-]+\.(webp|png|jpg|mp3|wav|woff2)$/.test(value) && !value.includes('..') && !value.includes('//'), 'Недопустимый путь ресурса.');
const condition = z.object({ flag: id, equals: z.boolean() }).strict();
export const ContentPackage = z.object({
  schemaVersion: z.literal(1),
  manifest: z.object({ id, version: z.string().regex(/^\d+\.\d+\.\d+$/), title: z.string().trim().min(1).max(120), language: Language, level: Level, status: z.enum(['draft', 'published', 'technical']), description: z.string().max(4000) }).strict(),
  entrySceneId: id.nullable(),
  characters: z.array(z.object({ id, name: z.string().min(1).max(80), knownFacts: z.array(z.string().max(500)).max(100) }).strict()).max(50),
  learningObjectives: z.array(z.object({ id, description: z.string().min(1).max(500) }).strict()).max(200),
  resources: z.array(z.object({ id, path: ResourcePath, mediaType: z.enum(['image', 'audio', 'font']) }).strict()).max(500),
  scenes: z.array(z.object({
    id, text: z.string().min(1).max(8000), speakerId: id.optional(), resourceId: id.optional(), terminal: z.boolean().default(false),
    objectiveIds: z.array(id).default([]),
    choices: z.array(z.object({ id, label: z.string().min(1).max(300), target: id, condition: condition.optional(), setFlags: z.record(id, z.boolean()).default({}), journalEntry: z.string().max(500).optional() }).strict()).max(20),
  }).strict()).max(1000),
}).strict();
export type ContentPackage = z.infer<typeof ContentPackage>;

export function validatePackage(input: unknown, mode: 'draft' | 'publish' = 'draft'): ValidationReport {
  const parsed = ContentPackage.safeParse(input);
  if (!parsed.success) return { valid: false, publishable: false, errors: parsed.error.issues.map(x => `${x.path.join('.')}: ${x.message}`), warnings: [] };
  const p = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const [name, items] of Object.entries({ scenes: p.scenes, characters: p.characters, objectives: p.learningObjectives, resources: p.resources })) {
    const ids = items.map(x => x.id);
    if (new Set(ids).size !== ids.length) errors.push(`${name}: идентификаторы должны быть уникальными.`);
  }
  const scenes = new Map(p.scenes.map(s => [s.id, s]));
  if (p.scenes.length && (!p.entrySceneId || !scenes.has(p.entrySceneId))) errors.push('Начальная сцена не найдена.');
  if (!p.scenes.length && p.entrySceneId) errors.push('Пустой пакет не может ссылаться на начальную сцену.');
  for (const scene of p.scenes) {
    if (scene.speakerId && !p.characters.some(x => x.id === scene.speakerId)) errors.push(`${scene.id}: персонаж не найден.`);
    if (scene.resourceId && !p.resources.some(x => x.id === scene.resourceId)) errors.push(`${scene.id}: ресурс не найден.`);
    if (scene.objectiveIds.some(id => !p.learningObjectives.some(x => x.id === id))) errors.push(`${scene.id}: учебная цель не найдена.`);
    if (new Set(scene.choices.map(x => x.id)).size !== scene.choices.length) errors.push(`${scene.id}: повторяющиеся выборы.`);
    if (!scene.terminal && !scene.choices.length) errors.push(`${scene.id}: нужны переходы или признак terminal.`);
    if (scene.terminal && scene.choices.length) errors.push(`${scene.id}: конечная сцена не должна содержать переходы.`);
    for (const choice of scene.choices) if (!scenes.has(choice.target)) errors.push(`${scene.id}/${choice.id}: цель перехода не найдена.`);
  }
  const visited = new Set<string>();
  const queue = p.entrySceneId ? [p.entrySceneId] : [];
  while (queue.length) { const next = queue.pop()!; if (visited.has(next)) continue; visited.add(next); for (const c of scenes.get(next)?.choices ?? []) queue.push(c.target); }
  for (const scene of p.scenes) if (!visited.has(scene.id)) errors.push(`${scene.id}: сцена недостижима.`);
  const contentComplete = p.scenes.length > 0 && p.characters.length > 0 && p.learningObjectives.length > 0 && p.scenes.some(s => s.terminal);
  if (!contentComplete) warnings.push('Черновик: для публикации нужны сцены, персонажи, учебные цели и завершение.');
  if (p.resources.length) warnings.push('Ресурсы должны быть загружены и проверены хранилищем перед публикацией.');
  const publishable = !errors.length && contentComplete && p.manifest.status !== 'technical' && !p.resources.length;
  if (mode === 'publish' && !publishable) errors.push('Публикация недоступна: пакет не завершён или ресурсы не подтверждены.');
  return { valid: errors.length === 0, publishable, errors, warnings };
}

export function createDraft(brief: string, language: 'en' | 'de', level: z.infer<typeof Level>, packageId: string): ContentPackage {
  return { schemaVersion: 1, manifest: { id: packageId, version: '0.1.0', title: 'Новый учебный мир', language, level, status: 'draft', description: brief }, entrySceneId: null, characters: [], scenes: [], learningObjectives: [], resources: [] };
}
