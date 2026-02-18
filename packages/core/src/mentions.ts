/**
 * Mention parsing and formatting utilities
 * Handles @mentions, @everyone, @here, and role mentions
 */

import type { ParsedMention, MessageSegment } from "./index";
import { MENTION_PATTERNS } from "./index";

/**
 * Parse a message string and extract all mentions
 */
export function parseMentions(content: string): ParsedMention[] {
  const mentions: ParsedMention[] = [];
  
  console.log("[Mentions] Parsing content:", content.slice(0, 100));
  console.log("[Mentions] USER pattern source:", MENTION_PATTERNS.USER.source);

  // User mentions: <@publicKey>
  // Note: Skip "everyone" and "here" as they have their own patterns
  const userRegex = new RegExp(MENTION_PATTERNS.USER.source, "g");
  let match: RegExpExecArray | null;

  while ((match = userRegex.exec(content)) !== null) {
    console.log("[Mentions] Found user match:", match[0], "-> id:", match[1]);
    // Skip if this is actually @everyone or @here (handled separately)
    if (match[1] === "everyone" || match[1] === "here") {
      console.log("[Mentions] Skipping everyone/here");
      continue;
    }
    mentions.push({
      type: "user",
      id: match[1],
      raw: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  // Role mentions: <@&roleId>
  const roleRegex = new RegExp(MENTION_PATTERNS.ROLE.source, "g");
  while ((match = roleRegex.exec(content)) !== null) {
    mentions.push({
      type: "role",
      id: match[1],
      raw: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  // @everyone mentions
  const everyoneRegex = new RegExp(MENTION_PATTERNS.EVERYONE.source, "g");
  while ((match = everyoneRegex.exec(content)) !== null) {
    mentions.push({
      type: "everyone",
      id: "everyone",
      raw: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  // @here mentions
  const hereRegex = new RegExp(MENTION_PATTERNS.HERE.source, "g");
  while ((match = hereRegex.exec(content)) !== null) {
    mentions.push({
      type: "here",
      id: "here",
      raw: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  // Sort by position in string
  return mentions.sort((a, b) => a.startIndex - b.startIndex);
}

/**
 * Parse message content into segments for rendering
 */
export function parseMessageSegments(content: string): MessageSegment[] {
  const mentions = parseMentions(content);

  if (mentions.length === 0) {
    return [{ type: "text", content }];
  }

  const segments: MessageSegment[] = [];
  let lastIndex = 0;

  for (const mention of mentions) {
    // Add text before this mention
    if (mention.startIndex > lastIndex) {
      segments.push({
        type: "text",
        content: content.slice(lastIndex, mention.startIndex),
      });
    }

    // Add the mention segment
    switch (mention.type) {
      case "user":
        segments.push({ type: "user_mention", publicKey: mention.id });
        break;
      case "role":
        segments.push({ type: "role_mention", roleId: mention.id });
        break;
      case "everyone":
        segments.push({ type: "everyone" });
        break;
      case "here":
        segments.push({ type: "here" });
        break;
    }

    lastIndex = mention.endIndex;
  }

  // Add remaining text after last mention
  if (lastIndex < content.length) {
    segments.push({
      type: "text",
      content: content.slice(lastIndex),
    });
  }

  return segments;
}

/**
 * Check if a message mentions a specific user
 */
export function mentionsUser(content: string, publicKey: string): boolean {
  console.log("[Mentions] mentionsUser called, looking for key:", publicKey.slice(0, 20));
  const mentions = parseMentions(content);
  console.log("[Mentions] Found mentions:", mentions.map(m => ({ type: m.type, id: m.id?.slice(0, 20) })));
  const found = mentions.some(
    (m) => m.type === "user" && m.id === publicKey
  );
  console.log("[Mentions] mentionsUser result:", found);
  return found;
}

/**
 * Check if a message mentions everyone
 */
export function mentionsEveryone(content: string): boolean {
  const mentions = parseMentions(content);
  return mentions.some((m) => m.type === "everyone");
}

/**
 * Check if a message mentions @here
 */
export function mentionsHere(content: string): boolean {
  const mentions = parseMentions(content);
  return mentions.some((m) => m.type === "here");
}

/**
 * Check if a message mentions a specific role
 */
export function mentionsRole(content: string, roleId: string): boolean {
  const mentions = parseMentions(content);
  return mentions.some(
    (m) => m.type === "role" && m.id === roleId
  );
}

/**
 * Create a user mention token
 */
export function createUserMention(publicKey: string): string {
  return `<@${publicKey}>`;
}

/**
 * Create a role mention token
 */
export function createRoleMention(roleId: string): string {
  return `<@&${roleId}>`;
}

/**
 * Get all unique mentioned user public keys from a message
 */
export function getMentionedUsers(content: string): string[] {
  const mentions = parseMentions(content);
  const users = mentions
    .filter((m) => m.type === "user")
    .map((m) => m.id);
  return [...new Set(users)];
}

/**
 * Get all unique mentioned role IDs from a message
 */
export function getMentionedRoles(content: string): string[] {
  const mentions = parseMentions(content);
  const roles = mentions
    .filter((m) => m.type === "role")
    .map((m) => m.id);
  return [...new Set(roles)];
}

/**
 * Check if a message is relevant to a user (mentions them directly, @everyone, or @here)
 */
export function isMessageRelevantToUser(
  content: string,
  userPublicKey: string,
  _userRoles: string[] = [] // Reserved for future role support
): boolean {
  console.log("[Mentions] isMessageRelevantToUser:", { content: content.slice(0, 50), userPublicKey: userPublicKey.slice(0, 20) });
  const isUserMentioned = mentionsUser(content, userPublicKey);
  const isEveryone = mentionsEveryone(content);
  const isHere = mentionsHere(content);
  console.log("[Mentions] isMessageRelevantToUser result:", { isUserMentioned, isEveryone, isHere });
  return isUserMentioned || isEveryone || isHere;
}

/**
 * Strip all mention tokens from a message (for plain text display)
 */
export function stripMentions(content: string): string {
  return content
    .replace(MENTION_PATTERNS.USER, "")
    .replace(MENTION_PATTERNS.ROLE, "")
    .replace(MENTION_PATTERNS.EVERYONE, "@everyone")
    .replace(MENTION_PATTERNS.HERE, "@here")
    .replace(/\s+/g, " ")
    .trim();
}
