import { Helpers } from '@ulixee/hero-testing';
import ICommandMeta from '@ulixee/hero-interfaces/ICommandMeta';
import INavigation from '@ulixee/hero-interfaces/INavigation';
import { LoadStatus } from '@ulixee/hero-interfaces/Location';
import CommandTimeline from '../lib/CommandTimeline';

afterAll(Helpers.afterAll);
afterEach(Helpers.afterEach);

test('should process commands into a timeline', async () => {
  const commands = [
    { id: 1, run: 0, runStartDate: 500, endDate: 600 } as ICommandMeta,
    { id: 2, run: 0, runStartDate: 601, endDate: 610 } as ICommandMeta,
  ] as ICommandMeta[];
  const navigations = [{ id: 1, url: '1', statusChanges: new Map() } as any] as INavigation[];
  const commandTimeline = new CommandTimeline(commands, 0, navigations);
  expect(commandTimeline.startTime).toBe(500);
  expect(commandTimeline.runtimeMs).toBe(110);
  expect(commandTimeline.commands).toHaveLength(2);
  expect(commandTimeline.commands[0].commandGapMs).toBe(0);
  expect(commandTimeline.commands[1].commandGapMs).toBe(1);
  expect(commandTimeline.commands[1].relativeStartMs).toBe(101);
});

test('should handle a second run', async () => {
  const commands = [
    { id: 1, run: 0, runStartDate: 500, endDate: 600 } as ICommandMeta,
    { id: 2, run: 0, runStartDate: 601, endDate: 610 } as ICommandMeta,
    { id: 1, run: 1, runStartDate: 500, endDate: 600, reusedCommandFromRun: 0 } as ICommandMeta,
    { id: 2, run: 1, runStartDate: 601, endDate: 610, reusedCommandFromRun: 0 } as ICommandMeta,
    { id: 3, run: 1, runStartDate: 1500, endDate: 1510 } as ICommandMeta,
  ] as ICommandMeta[];
  const navigations = [{ id: 1, url: '1', statusChanges: new Map() } as any] as INavigation[];

  const commandTimeline = new CommandTimeline(commands, 1, navigations);
  expect(commandTimeline.startTime).toBe(500);
  expect(commandTimeline.runtimeMs).toBe(120);
  expect(commandTimeline.commands).toHaveLength(3);
  expect(commandTimeline.commands[0].commandGapMs).toBe(0);
  expect(commandTimeline.commands[1].commandGapMs).toBe(1);
  expect(commandTimeline.commands[1].relativeStartMs).toBe(101);
  expect(commandTimeline.commands[2].relativeStartMs).toBe(110);
});

test('should be able to calculate offsets', async () => {
  const commands = [
    { id: 1, run: 0, runStartDate: 500, endDate: 600 } as ICommandMeta,
    { id: 2, run: 0, runStartDate: 601, endDate: 610 } as ICommandMeta,
    { id: 1, run: 1, runStartDate: 500, endDate: 600, reusedCommandFromRun: 0 } as ICommandMeta,
    { id: 2, run: 1, runStartDate: 601, endDate: 610, reusedCommandFromRun: 0 } as ICommandMeta,
    { id: 3, run: 1, runStartDate: 1500, endDate: 1510 } as ICommandMeta,
  ] as ICommandMeta[];
  const navigations = [{ id: 1, url: '1', statusChanges: new Map() } as any] as INavigation[];

  const commandTimeline = new CommandTimeline(commands, 1, navigations);
  // @ts-ignore
  expect(commandTimeline.getTimelineOffsetForRuntimeMillis(60)).toBe(50.0);
  // if timestamp is in the gap, we shouldn't include it
  expect(commandTimeline.getTimelineOffsetForTimestamp(1000)).toBe(-1);
  expect(commandTimeline.getTimelineOffsetForTimestamp(1500)).toBe(91.7);
  expect(commandTimeline.getTimelineOffsetForTimestamp(1510)).toBe(100);
});

test('should start by default at the first http request', async () => {
  const commands = [
    { id: 1, run: 0, runStartDate: 500, endDate: 600 } as ICommandMeta,
    { id: 2, run: 0, runStartDate: 601, endDate: 610 } as ICommandMeta,
  ] as ICommandMeta[];
  const navigations = [
    {
      id: 1,
      url: '1',
      statusChanges: new Map([
        [LoadStatus.HttpRequested, 550],
        [LoadStatus.DomContentLoaded, 555],
      ]),
    } as any,
  ] as INavigation[];

  const commandTimeline = new CommandTimeline(commands, 0, navigations);
  // normal runtime
  expect(commandTimeline.runtimeMs).toBe(60);
  expect(commandTimeline.getTimelineOffsetForTimestamp(600)).toBe(83.3); // 50/60
});

test('should be able to get timestamps for slices of the timeline', async () => {
  const commands = [
    { id: 1, run: 1, runStartDate: 10, endDate: 20 } as ICommandMeta,
    { id: 2, run: 1, runStartDate: 21, endDate: 30 } as ICommandMeta,
    { id: 3, run: 1, runStartDate: 31, endDate: 36 } as ICommandMeta,
    { id: 3, run: 1, runStartDate: 36, endDate: 40 } as ICommandMeta,
  ] as ICommandMeta[];
  const navigations = [{ id: 1, url: '1', statusChanges: new Map() } as any] as INavigation[];
  {
    const commandTimeline = new CommandTimeline(commands, 1, navigations);
    expect(commandTimeline.getTimelineOffsetForTimestamp(36)).toBe(86.7);
  }
  {
    const commandTimeline = new CommandTimeline(commands, 1, navigations, [35]);
    expect(commandTimeline.getTimelineOffsetForTimestamp(36)).toBe(20);
  }

  {
    const commandTimeline = new CommandTimeline(commands, 1, navigations, [35, 45]);
    expect(commandTimeline.getTimelineOffsetForTimestamp(36)).toBe(10);
  }

  {
    const commandTimeline = new CommandTimeline(commands, 1, navigations, [35, 45]);
    expect(commandTimeline.getTimelineOffsetForTimestamp(41)).toBe(60);
  }
});

test('should match percentages in and out', () => {
  const commands = [
    {
      clientStartDate: 1636664237736,
      runStartDate: 1636664237738,
      endDate: 1636664238135,
    },
    {
      clientStartDate: 1636664238140,
      runStartDate: 1636664238142,
      endDate: 1636664238146,
    },
    {
      runStartDate: 1636664238147,
      endDate: 1636664238396,
    },
    {
      runStartDate: 1636664238147,
      endDate: 1636664238147,
    },
    {
      clientStartDate: 1636664238398,
      runStartDate: 1636664238416,
      endDate: 1636664238417,
    },
    {
      clientStartDate: 1636664238399,
      runStartDate: 1636664238417,
      endDate: 1636664243193,
    },
  ].map((x: any, i) => {
    x.id = i + 1;
    x.run = 0;
    return x;
  });
  const timeline = new CommandTimeline(commands as any, 0, []);

  const last = commands[commands.length - 1];
  expect(timeline.startTime).toBe(commands[0].clientStartDate);
  expect(timeline.endTime).toBe(last.endDate);
  expect(timeline.runtimeMs).toBe(last.endDate - commands[0].clientStartDate);

  for (const i of [0, 15, 14.7, 63, 78]) {
    const timestamp = timeline.getTimestampForOffset(i);
    const offset = timeline.getTimelineOffsetForTimestamp(timestamp);
    expect(offset).toBe(i);
  }
});