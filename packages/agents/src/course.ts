import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import {
  createDraft,
  validatePackage,
  type ContentPackage,
  type ValidationReport,
} from '@langplot/shared';
export type CourseBrief = {
  brief: string;
  language: 'en' | 'de';
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  packageId: string;
};
export interface CourseProvider {
  createSkeleton(brief: CourseBrief): Promise<ContentPackage>;
}
export class LocalCourseProvider implements CourseProvider {
  async createSkeleton(input: CourseBrief) {
    return createDraft(input.brief, input.language, input.level, input.packageId);
  }
}
const State = Annotation.Root({
  input: Annotation<CourseBrief>(),
  draft: Annotation<ContentPackage>(),
  report: Annotation<ValidationReport>(),
  exported: Annotation<string>(),
});
export function createCourseGraph(
  provider: CourseProvider,
  onStage: (stage: string) => Promise<void> = async () => {},
) {
  return new StateGraph(State)
    .addNode('brief', async (state) => {
      await onStage('brief');
      return { input: state.input };
    })
    .addNode('structure', async (state) => {
      await onStage('structure');
      return { draft: await provider.createSkeleton(state.input) };
    })
    .addNode('validation', async (state) => {
      await onStage('validation');
      return { report: validatePackage(state.draft) };
    })
    .addNode('buildReport', async (state) => {
      await onStage('report');
      if (!state.report.valid) throw new Error(state.report.errors.join('\n'));
      return { report: state.report };
    })
    .addNode('export', async (state) => {
      await onStage('export');
      return { exported: JSON.stringify(state.draft, null, 2) };
    })
    .addEdge(START, 'brief')
    .addEdge('brief', 'structure')
    .addEdge('structure', 'validation')
    .addEdge('validation', 'buildReport')
    .addEdge('buildReport', 'export')
    .addEdge('export', END)
    .compile();
}
