import type { TransportMessage } from "@nodes/transport";

export interface MessageGroup {
  authorKey: string;
  timestamp: number; // Timestamp of first message in group
  messages: TransportMessage[];
}

/**
 * Group consecutive messages from the same author within a time window.
 *
 * Rules:
 * - Same author AND within 5 minutes of previous message → group together
 * - System messages are never grouped
 * - Different author → new group
 * - Gap > 5 minutes even from same author → new group
 */
const GROUP_WINDOW = 5 * 60 * 1000; // 5 minutes

export function groupMessages(messages: TransportMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];

  for (const message of messages) {
    const lastGroup = groups[groups.length - 1];

    const shouldGroup =
      lastGroup &&
      message.type !== "system" &&
      lastGroup.messages[0].type !== "system" &&
      message.authorKey === lastGroup.authorKey &&
      message.timestamp -
        lastGroup.messages[lastGroup.messages.length - 1].timestamp <
        GROUP_WINDOW;

    if (shouldGroup) {
      lastGroup.messages.push(message);
    } else {
      groups.push({
        authorKey: message.authorKey,
        timestamp: message.timestamp,
        messages: [message],
      });
    }
  }

  return groups;
}

/**
 * Check if a message is a system message.
 */
export function isSystemMessage(message: TransportMessage): boolean {
  return message.type === "system" || message.authorKey === "system";
}
