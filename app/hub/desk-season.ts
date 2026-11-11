type DeskSeason = {
  rain: boolean;
  lantern: boolean;
  mug: boolean;
  pineSprig: boolean;
};

// Change seasonal decorations here. Month numbers follow the device calendar.
export const deskDecorations: { enabled: boolean; months: Partial<Record<number, DeskSeason>> } = {
  enabled: true,
  months: {
    11: { rain: true, lantern: true, mug: true, pineSprig: true }, // November in Lübeck
  },
};

export function seasonForDeviceDate(now: Date | undefined) {
  return deskDecorations.enabled && now ? deskDecorations.months[now.getMonth() + 1] : undefined;
}
