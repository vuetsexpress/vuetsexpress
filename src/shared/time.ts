export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const MONTH = 30 * DAY;
export const WEEK = 7 * DAY;
export const YEAR = 365 * DAY;

export class Duration {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliSeconds: number;

  constructor(ms: number) {
    this.setMs(ms);
  }

  setMs(msOpt?: number) {
    let ms = msOpt === undefined ? 0 : msOpt;

    this.milliSeconds = ms % SECOND;
    ms -= this.milliSeconds;
    this.seconds = (ms / SECOND) % 60;
    ms -= this.seconds * SECOND;
    this.minutes = (ms / MINUTE) % 60;
    ms -= this.minutes * MINUTE;
    this.hours = (ms / HOUR) % 24;
    ms -= this.hours * HOUR;
    this.days = ms / DAY;
  }
}

export function formatDurationMs(dur: number) {
  if (dur < SECOND) return `${dur} millisecond(s)`;
  if (dur < MINUTE) return `${Math.floor((dur / SECOND) * 10) / 10} second(s)`;
  if (dur < HOUR) return `${Math.floor((dur / MINUTE) * 10) / 10} minute(s)`;
  if (dur < DAY) return `${Math.floor((dur / HOUR) * 10) / 10} hour(s)`;
  if (dur < WEEK) return `${Math.floor((dur / DAY) * 10) / 10} day(s)`;
  if (dur < MONTH) return `${Math.floor((dur / WEEK) * 10) / 10} week(s)`;
  if (dur < YEAR) return `${Math.floor((dur / MONTH) * 10) / 10} month(s)`;
  return `${Math.floor((dur / YEAR) * 10) / 10} year(s)`;
}

export function formatDuration(sec: number) {
  return formatDurationMs(sec * SECOND);
}

export class TimeQuotaItem {
  dur: number = 10000;
  freq: number = 1;
  constructor(dur?: number, freq?: number) {
    this.fromBlob({ dur, freq });
  }
  fromBlob(blob?: any) {
    if (!blob) return this;
    if (blob.dur !== undefined) this.dur = blob.dur;
    if (blob.freq !== undefined) this.freq = blob.freq;
    return this;
  }
  toString() {
    return `at most ${this.freq} in ${formatDuration(this.dur)}`;
  }
  exceeded(docs: any[], createdAtKeyOpt?: string, nowOpt?: number) {
    const createdAtKey = createdAtKeyOpt || "createdAt";
    const now = nowOpt || Date.now();

    let cnt = 0;

    for (const doc of docs) {
      const createdAt = doc[createdAtKey];
      if (typeof createdAt === "number") {
        const age = now - createdAt;
        if (age < this.dur) {
          cnt++;
        }
        if (cnt >= this.freq) return true;
      }
    }

    return false;
  }
}

export class TimeQuota {
  name: string = "Items";
  items: TimeQuotaItem[] = [new TimeQuotaItem()];
  filter: any = (doc: any) => true;

  constructor(name?: string, items?: TimeQuotaItem[]) {
    this.fromBlob({ name, items });
  }

  fromBlob(blob: any) {
    if (!blob) return this;
    if (blob.name !== undefined) this.name = blob.name;
    if (blob.items !== undefined)
      this.items = blob.items.map((itemBlob: any) =>
        new TimeQuotaItem().fromBlob(itemBlob)
      );
    return this;
  }
  toString() {
    return `${this.name} Quota [ ${this.items
      .map((item) => item.toString())
      .join(" , ")} ]`;
  }
  exceeded(
    docs: any[],
    filterOpt?: (doc: any) => boolean,
    createdAtKeyOpt?: string,
    nowOpt?: number
  ) {
    const createdAtKey = createdAtKeyOpt || "createdAt";
    const now = nowOpt || Date.now();

    for (const item of this.items) {
      if (
        item.exceeded(
          docs.filter(filterOpt || ((doc: any) => true)),
          createdAtKey,
          now
        )
      ) {
        return `${this.name} quota violated ${item}`;
      }
    }

    return undefined;
  }
}
