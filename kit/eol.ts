// Text edits that match whatever line endings a file has. On Windows, git may check
// files out with CRLF, while the find/replace strings in e2e/mutations.ts use \n.

/** `text` with its line breaks written the way `content` writes them. */
export function inEolOf(content: string, text: string): string {
  return content.includes('\r\n') ? text.replace(/\r?\n/g, '\r\n') : text;
}
