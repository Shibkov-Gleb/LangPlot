export const coursePath = (language: string, level: string) =>
  '/courses/' + language + '/' + level.toLowerCase();
export const theoryPath = (slug: string) => '/dashboard/materials/' + encodeURIComponent(slug);
export function studyReturnPath(value: string | null) {
  return value &&
    /^(?:\/admin|\/studio|\/dashboard(?:\/settings|\/progress)?|\/courses\/(?:en|de)\/(?:a1|a2|b1|b2|c1|c2)|\/dashboard\/materials(?:\/[a-z][a-z0-9-]*)?|\/play\/[a-z][a-z0-9-]*)$/.test(
      value,
    )
    ? value
    : null;
}
