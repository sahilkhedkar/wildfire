import { expect, test } from "bun:test";
import { TraceRecorder, traceEventSchema } from "./index";

test("records validated, ordered events", async () => {
  const events: unknown[] = [];
  const recorder = new TraceRecorder((event) => {
    events.push(event);
  });

  await recorder.record("run.started", { task: "test" });
  await recorder.record("tool.result", { ok: true });

  expect(events).toHaveLength(2);
  expect(traceEventSchema.parse(events[0])).toMatchObject({
    version: 1,
    seq: 1,
    type: "run.started",
  });
  expect(traceEventSchema.parse(events[1])).toMatchObject({ seq: 2 });
});
