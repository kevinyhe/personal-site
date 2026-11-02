/** Idea 2: the home page's sections, in page order, as the channels of the TV the site opens on. */

export type Channel = {
  number: number;
  name: string;
  selector: string;
  /** Where a jump to this channel lands, in screens past the section's top. */
  landAt: number;
};

export const CHANNELS: Channel[] = [
  { number: 1, name: "Home", selector: "#top", landAt: 0 },
  { number: 2, name: "Info", selector: "section#info", landAt: 0.3 },
  { number: 3, name: "Work", selector: "#work", landAt: 0 },
  { number: 4, name: "Skills", selector: "#work ~ section", landAt: 0 },
  { number: 5, name: "Contact", selector: "#contact", landAt: 0 },
  { number: 6, name: "End", selector: "#end", landAt: 0 },
];

export function channelDigits(channel: Channel): string {
  return String(channel.number).padStart(2, "0");
}

export function channelSection(channel: Channel): HTMLElement {
  const section = document.querySelector<HTMLElement>(channel.selector);
  if (!section) throw new Error(`Channels: no ${channel.selector} on the page`);
  return section;
}

export function channelByNumber(number: number): Channel {
  const channel = CHANNELS.find((c) => c.number === number);
  if (!channel) throw new Error(`Channels: no channel ${number}`);
  return channel;
}
