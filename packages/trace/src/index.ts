import { z } from "zod";

export const traceEventTypeSchema = z.enum([
  "run.started",
  "llm.request",
  "llm.response",
  "tool.call",
  "tool.result",
  "run.finished",
  "error",
]);

export const traceEventSchema = z.object({
  version: z.literal(1),
  seq: z.number().int().positive(),
  type: traceEventTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
});

export type TraceEventType = z.infer<typeof traceEventTypeSchema>;
export type TraceEvent = z.infer<typeof traceEventSchema>;

export type TraceEventSink = (event: TraceEvent) => void | Promise<void>;

export class TraceRecorder {
  private sequence = 0;

  constructor(private readonly sink: TraceEventSink) {}

  async record(
    type: TraceEventType,
    payload: Record<string, unknown>,
  ): Promise<TraceEvent> {
    const event = traceEventSchema.parse({
      version: 1,
      seq: ++this.sequence,
      type,
      payload,
      createdAt: new Date().toISOString(),
    });
    await this.sink(event);
    return event;
  }
}
