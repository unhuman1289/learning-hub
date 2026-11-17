const berlinTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** The scheduled instant is expressed in Berlin time, including DST transitions. */
export function isBerlinCalibrationTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getUTCSeconds() !== 0 || date.getUTCMilliseconds() !== 0) return false;
  const parts = Object.fromEntries(berlinTime.formatToParts(date).map(({type, value: part}) => [type, part]));
  return parts.weekday === 'Sun' && parts.hour === '03' && parts.minute === '30';
}
