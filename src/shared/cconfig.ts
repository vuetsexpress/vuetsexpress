import { TimeControl } from "./models";

/////////////////////////////////////////////////////////////////

export const DEFAULT_TIME_CONTROL = new TimeControl({
  initial: 180,
  increment: 2,
});

export const SUPPORTED_TIME_CONTROLS = [
  new TimeControl({ initial: 60, increment: 0 }),
  new TimeControl({ initial: 120, increment: 0 }),
  new TimeControl({ initial: 180, increment: 0 }),
  DEFAULT_TIME_CONTROL,
  new TimeControl({ initial: 300, increment: 0 }),
  new TimeControl({ initial: 300, increment: 3 }),
  new TimeControl({ initial: 600, increment: 0 }),
  new TimeControl({ initial: 900, increment: 10 }),
  new TimeControl({ initial: 1800, increment: 0 }),
];
